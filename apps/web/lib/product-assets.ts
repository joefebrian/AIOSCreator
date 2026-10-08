import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { isProductMediaUrl } from "./media-kind";
import { mediaUrlToPath, productAssetsFile } from "./paths";
import { inferCategory } from "./product-category";
import { attachProductImage, listProducts, productFromManualUpload } from "./products";

export { isProductMediaUrl } from "./media-kind";

export type ProductAsset = {
  id: string;
  url: string;
  title?: string;
  productId?: string;
  category?: string;
  source: "upload" | "catalog";
  createdAt: string;
};

export type ProductThumb = {
  url: string;
  title: string;
  productId?: string;
  category?: string;
};

type Db = { assets: ProductAsset[] };

function readDb(): Db {
  const file = productAssetsFile();
  if (!fs.existsSync(file)) return { assets: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Db;
    return { assets: Array.isArray(raw.assets) ? raw.assets : [] };
  } catch {
    return { assets: [] };
  }
}

function writeDb(db: Db) {
  fs.writeFileSync(productAssetsFile(), JSON.stringify(db, null, 2), "utf8");
}

export function listProductAssets(): ProductAsset[] {
  return readDb()
    .assets.slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function addProductAsset(input: {
  url: string;
  title?: string;
  productId?: string;
  category?: string;
  source?: "upload" | "catalog";
  id?: string;
}): ProductAsset {
  const url = input.url.trim();
  const db = readDb();
  const hit = db.assets.find((a) => a.url === url);
  if (hit) {
    let changed = false;
    if (!hit.productId && input.productId) {
      hit.productId = input.productId;
      changed = true;
    }
    if (!hit.category && input.category?.trim()) {
      hit.category = input.category.trim();
      changed = true;
    }
    if (changed) writeDb(db);
    return hit;
  }
  const category = input.category?.trim() || undefined;
  const row: ProductAsset = {
    id: input.id || randomUUID(),
    url,
    title: input.title?.trim() || "SKU",
    productId: input.productId,
    category,
    source: input.source || "upload",
    createdAt: new Date().toISOString(),
  };
  db.assets.unshift(row);
  writeDb(db);
  return row;
}

export function forgetProductAsset(url: string) {
  const db = readDb();
  const assets = db.assets.filter((asset) => asset.url !== url);
  if (assets.length === db.assets.length) return;
  db.assets = assets;
  writeDb(db);
}

export function rememberProductUrls(urls: string[], title?: string, productId?: string) {
  for (const url of urls) {
    const u = url.trim();
    if (!u || isOnModelCharacterUrl(u)) continue;
    addProductAsset({ url: u, title, productId, source: "upload" });
  }
}

function isOnModelCharacterUrl(url: string) {
  return /\/characters\/[^/]+-(identity|edit-|front|close|sheet)/i.test(url);
}

/** Catalog category wins. A category picked at upload wins over the filename. */
function categoryForAsset(
  asset: ProductAsset,
  parent?: { title?: string; category?: string },
) {
  if (parent) {
    const fromParent = inferCategory(parent);
    if (fromParent !== "Uncategorized") return fromParent;
  }
  return inferCategory({ title: asset.title, category: asset.category });
}

export function listProductThumbs(
  catalog: { id: string; title: string; images?: string[]; category?: string }[],
): ProductThumb[] {
  const seen = new Set<string>();
  const out: ProductThumb[] = [];
  const push = (url: string, title: string, productId?: string, category?: string) => {
    const u = url.trim();
    if (!u || seen.has(u) || isOnModelCharacterUrl(u) || /^https?:\/\//i.test(u)) return;
    seen.add(u);
    out.push({ url: u, title, productId, category });
  };
  // Try-on follows the product row. A deleted product stays gone, and a loose upload
  // shows up only after syncTryOnUploads has made it a product.
  for (const p of catalog) {
    const cat = inferCategory(p);
    for (const img of p.images || []) push(img, p.title, p.id, cat);
  }
  return out;
}

/**
 * Products are the source. A try-on upload with no row becomes a product whose shop
 * link is still empty. An upload whose product was deleted is left alone.
 */
export function syncTryOnUploads() {
  const products = listProducts();
  const live = new Set(products.map((p) => p.id));
  const owner = new Map<string, string>();
  for (const product of products) {
    for (const url of product.images || []) {
      if (url.startsWith("/api/media/") && !owner.has(url)) owner.set(url, product.id);
    }
  }
  const db = readDb();
  let changed = false;
  for (const asset of db.assets) {
    const url = asset.url.trim();
    if (!url.startsWith("/api/media/") || asset.source !== "upload" || isOnModelCharacterUrl(url)) continue;
    const ownedBy = owner.get(url);
    if (ownedBy) {
      if (!asset.productId) {
        asset.productId = ownedBy;
        changed = true;
      }
      continue;
    }
    if (asset.productId) {
      if (!live.has(asset.productId)) continue;
      const attached = attachProductImage(asset.productId, url);
      if (attached?.images.includes(url)) owner.set(url, asset.productId);
      continue;
    }
    const cat = categoryForAsset(asset);
    if (cat === "Uncategorized") continue;
    const saved = productFromManualUpload({
      title: asset.title || "",
      category: asset.category?.trim() || cat,
      imageUrl: url,
    });
    asset.productId = saved.id;
    live.add(saved.id);
    owner.set(url, saved.id);
    changed = true;
  }
  if (changed) writeDb(db);
  return listProducts();
}

const FRESH_UPLOAD_MS = 24 * 60 * 60 * 1000;

/** A try-on upload is still in use. Catalog GET must not delete it for having a plain filename. */
function keepFreshUpload(asset: ProductAsset) {
  if (asset.source !== "upload") return false;
  const t = Date.parse(asset.createdAt);
  return Number.isFinite(t) && Date.now() - t < FRESH_UPLOAD_MS;
}

/** Drop untitled / uncategorized SKU dumps and their local files (not character stills). */
export function purgeUncategorizedSkuAssets(
  catalog: { id: string; title: string; images?: string[]; category?: string }[],
) {
  const db = readDb();
  const keep: ProductAsset[] = [];
  const removed: ProductAsset[] = [];
  const catalogUrls = new Set(catalog.flatMap((p) => (p.images || []).filter((u) => u.startsWith("/api/media/"))));
  for (const a of db.assets) {
    const parent = catalog.find((c) => c.id === a.productId);
    const cat = categoryForAsset(a, parent);
    if (cat !== "Uncategorized" || keepFreshUpload(a)) {
      keep.push(a);
      continue;
    }
    removed.push(a);
  }
  if (!removed.length) return 0;
  db.assets = keep;
  writeDb(db);
  for (const a of removed) {
    if (/\/characters\//i.test(a.url)) continue;
    if (catalogUrls.has(a.url)) continue;
    try {
      const p = mediaUrlToPath(a.url);
      if (fs.existsSync(p) && /[\\/]media[\\/](products|uploads|images)[\\/]/i.test(p)) fs.unlinkSync(p);
    } catch {
      /* ignore */
    }
  }
  return removed.length;
}

/** Uploads inferred as Bags that are not a catalog product row. */
export function purgeOrphanBagUploads(
  catalog: { id: string; title: string; images?: string[]; category?: string }[],
) {
  const db = readDb();
  const catalogIds = new Set(catalog.map((p) => p.id));
  const keep: ProductAsset[] = [];
  const removed: ProductAsset[] = [];
  for (const a of db.assets) {
    const parent = a.productId ? catalog.find((c) => c.id === a.productId) : undefined;
    if (parent && catalogIds.has(parent.id)) {
      keep.push(a);
      continue;
    }
    if (a.category?.trim() || keepFreshUpload(a)) {
      keep.push(a);
      continue;
    }
    if (inferCategory({ title: a.title }) === "Bags") {
      removed.push(a);
      continue;
    }
    keep.push(a);
  }
  if (!removed.length) return 0;
  db.assets = keep;
  writeDb(db);
  for (const a of removed) {
    try {
      const p = mediaUrlToPath(a.url);
      if (fs.existsSync(p) && /[\\/]media[\\/](products|uploads|images)[\\/]/i.test(p)) fs.unlinkSync(p);
    } catch {
      /* ignore */
    }
  }
  return removed.length;
}
