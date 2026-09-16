import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { isProductMediaUrl } from "./media-kind";
import { productAssetsFile } from "./paths";

export { isProductMediaUrl } from "./media-kind";

export type ProductAsset = {
  id: string;
  url: string;
  title?: string;
  productId?: string;
  source: "upload" | "catalog";
  createdAt: string;
};

export type ProductThumb = {
  url: string;
  title: string;
  productId?: string;
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
  source?: "upload" | "catalog";
  id?: string;
}): ProductAsset {
  const url = input.url.trim();
  const db = readDb();
  const hit = db.assets.find((a) => a.url === url);
  if (hit) return hit;
  const row: ProductAsset = {
    id: input.id || randomUUID(),
    url,
    title: input.title?.trim() || "SKU",
    productId: input.productId,
    source: input.source || "upload",
    createdAt: new Date().toISOString(),
  };
  db.assets.unshift(row);
  writeDb(db);
  return row;
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

export function listProductThumbs(
  catalog: { id: string; title: string; images?: string[] }[],
): ProductThumb[] {
  const seen = new Set<string>();
  const out: ProductThumb[] = [];
  const push = (url: string, title: string, productId?: string) => {
    const u = url.trim();
    if (!u || seen.has(u) || isOnModelCharacterUrl(u)) return;
    seen.add(u);
    out.push({ url: u, title, productId });
  };
  for (const p of catalog) {
    for (const img of p.images || []) push(img, p.title, p.id);
  }
  for (const a of listProductAssets()) push(a.url, a.title || "SKU", a.productId);
  return out;
}
