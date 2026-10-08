import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataRoot, ensureDataDirs } from "./paths";
import { uploadProductTitle } from "./product-category";
import type { ProductResearch } from "./product-research";

export type Marketplace = "amazon" | "shopee" | "tiktok-shop" | "tokopedia" | "lazada" | "ebay" | "aliexpress" | "other";

export type ScorePart = { id: string; label: string; weight: number; value: number; note: string };

export type Product = {
  id: string;
  provider: Marketplace;
  providerProductId: string;
  title: string;
  brand?: string;
  category?: string;
  price?: string;
  currency?: string;
  rating?: number;
  reviewCount?: number;
  features: string[];
  /** Listing bullets before script tidy. Tidy rewrites features from these. */
  sourceFeatures?: string[];
  images: string[];
  /** Parallel to images. identity is the pack shot used as the SKU reference. */
  imageRoles?: ("identity" | "detail" | "usage" | "packaging" | "other")[];
  /** Photo a person chose on the Products slide. Ranking must not replace it. */
  defaultImageUrl?: string;
  availability?: string;
  market?: string;
  sourceUrl: string;
  affiliateUrl: string;
  disclosure?: string;
  score: number;
  scoreParts: ScorePart[];
  createdAt: string;
  updatedAt: string;
  lastSyncedAt?: string;
  research?: ProductResearch;
  referenceAds?: ReferenceAdLink[];
  /** Instagram handle of the brand, without @. Used for branded-content search. */
  instagramUsername?: string;
  brandedMatches?: BrandedMatchSet;
};

export type BrandedPost = {
  creationDate: string;
  type: string;
  url: string;
  creatorName?: string;
  partnerName?: string;
};

export type BrandedMatchSet = {
  searchedAt: string;
  windowStart: string;
  windowEnd: string;
  suggestedTemplateId: string;
  counts: Record<string, number>;
  posts: BrandedPost[];
};

export type ReferenceAdLink = {
  id: string;
  source: "meta-ad-library" | "tiktok-creative-center" | "tiktok-ad-library";
  sourceUrl: string;
  heroUrl?: string;
  heroStatus: "identity" | "rejected-face" | "rejected" | "missing";
  videoUrl?: string;
};

type Db = { products: Product[]; amazonAssociateTag?: string };

let productsRootOverride: string | null = null;

export function setProductsRootForTests(dir: string | null) {
  productsRootOverride = dir;
}

function filePath() {
  if (productsRootOverride) {
    const dir = path.join(productsRootOverride, "db");
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, "products.json");
  }
  ensureDataDirs();
  return path.join(dataRoot(), "db", "products.json");
}

function readDb(): Db {
  const file = filePath();
  if (!fs.existsSync(file)) return { products: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Db;
    return { products: Array.isArray(raw.products) ? raw.products : [], amazonAssociateTag: raw.amazonAssociateTag };
  } catch {
    return { products: [] };
  }
}

function writeDb(db: Db) {
  fs.writeFileSync(filePath(), JSON.stringify(db, null, 2), "utf8");
}

export { inferCategory } from "./product-category";

export function listProducts(): Product[] {
  return readDb()
    .products.slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getProduct(id: string) {
  return readDb().products.find((p) => p.id === id);
}

export function getAmazonAssociateTag() {
  return process.env.AMAZON_ASSOCIATE_TAG?.trim() || readDb().amazonAssociateTag?.trim() || "";
}

export function setAmazonAssociateTag(tag: string) {
  const db = readDb();
  db.amazonAssociateTag = tag.trim();
  writeDb(db);
}

function mergeProductImages(prev: string[] = [], next: string[] = []) {
  const locals: string[] = [];
  const remotes: string[] = [];
  const seen = new Set<string>();
  for (const u of [...next, ...prev]) {
    if (!u || seen.has(u)) continue;
    seen.add(u);
    if (u.startsWith("/api/media/")) locals.push(u);
    else if (/^https?:\/\//i.test(u)) remotes.push(u);
  }
  return locals.length ? locals : remotes;
}

export function upsertProduct(row: Product) {
  const clean = { ...row } as Product & { affiliateWarning?: string; copyWarning?: string };
  delete clean.affiliateWarning;
  delete clean.copyWarning;
  const db = readDb();
  const byId = db.products.findIndex((p) => p.id === row.id);
  const byAsin = db.products.findIndex(
    (p) => p.provider === row.provider && p.providerProductId && p.providerProductId === row.providerProductId && p.providerProductId !== "unknown",
  );
  const i = byId >= 0 ? byId : byAsin;
  if (i >= 0) {
    const prev = db.products[i];
    db.products[i] = {
      ...prev,
      ...clean,
      id: prev.id,
      createdAt: prev.createdAt,
      images: mergeProductImages(prev.images, row.images),
      features: clean.features.length ? clean.features : prev.features,
      affiliateUrl: prev.affiliateUrl?.trim() && prev.affiliateUrl !== prev.sourceUrl ? prev.affiliateUrl : clean.affiliateUrl || prev.affiliateUrl,
      price: clean.price?.trim() || prev.price,
      currency: clean.currency?.trim() || prev.currency,
    };
    writeDb(db);
    return db.products[i];
  }
  db.products.unshift(clean);
  writeDb(db);
  return clean;
}

/** Append a local slide. The pinned default and the current cover stay put. */
export function attachProductImage(id: string, url: string) {
  const clean = url.trim();
  if (!clean.startsWith("/api/media/")) return;
  const db = readDb();
  const index = db.products.findIndex((row) => row.id === id);
  if (index < 0) return;
  const product = db.products[index];
  if (product.images.includes(clean) || product.images.length >= 8) return product;
  const roles = product.imageRoles ? [...product.imageRoles] : product.images.map(() => "other" as const);
  while (roles.length < product.images.length) roles.push("other");
  db.products[index] = {
    ...product,
    images: [...product.images, clean],
    imageRoles: [...roles, product.images.length ? "other" : "identity"],
    defaultImageUrl: product.defaultImageUrl || clean,
    updatedAt: new Date().toISOString(),
  };
  writeDb(db);
  return db.products[index];
}

export function setProductImages(id: string, images: string[], imageRoles: Product["imageRoles"]) {
  const db = readDb();
  const index = db.products.findIndex((row) => row.id === id);
  if (index < 0) return;
  db.products[index] = { ...db.products[index], images, imageRoles, updatedAt: new Date().toISOString() };
  writeDb(db);
  return db.products[index];
}

/** Drop one slide. If it was the pinned default, the next local photo becomes the default. */
export function removeProductImage(id: string, url: string) {
  const db = readDb();
  const index = db.products.findIndex((row) => row.id === id);
  if (index < 0) return;
  const product = db.products[index];
  if (!product.images.includes(url)) return;
  const roles = product.imageRoles || [];
  const images: string[] = [];
  const imageRoles: NonNullable<Product["imageRoles"]> = [];
  product.images.forEach((image, i) => {
    if (image === url) return;
    images.push(image);
    imageRoles.push(roles[i] || "other");
  });
  const removedDefault = product.defaultImageUrl === url;
  db.products[index] = {
    ...product,
    images,
    imageRoles,
    defaultImageUrl: removedDefault ? undefined : product.defaultImageUrl,
    updatedAt: new Date().toISOString(),
  };
  writeDb(db);
  if (!removedDefault) return db.products[index];
  const fallback = images.find((image) => image.startsWith("/api/media/"));
  if (!fallback) return db.products[index];
  return setProductDefaultImage(id, fallback);
}

/** Pin one slide photo as the SKU default. Later imports keep this choice. */
export function setProductDefaultImage(id: string, url: string) {
  const db = readDb();
  const index = db.products.findIndex((row) => row.id === id);
  if (index < 0) return;
  const product = db.products[index];
  if (!product.images.includes(url)) return;
  const roles = product.imageRoles || [];
  const roleByUrl = new Map(product.images.map((image, i) => [image, roles[i] || "other"]));
  const images = [url, ...product.images.filter((image) => image !== url)];
  const imageRoles = images.map((image, i) => {
    if (i === 0) return "identity" as const;
    return roleByUrl.get(image) === "identity" ? "other" : roleByUrl.get(image) || "other";
  });
  db.products[index] = { ...product, images, imageRoles, defaultImageUrl: url, updatedAt: new Date().toISOString() };
  writeDb(db);
  return db.products[index];
}

export function patchProduct(id: string, patch: Partial<Product>) {
  const cur = getProduct(id);
  if (!cur) throw new Error("product not found");
  const next = { ...cur, ...patch, id: cur.id, createdAt: cur.createdAt, updatedAt: new Date().toISOString() };
  const { score, scoreParts } = scoreProduct(next);
  return upsertProduct({ ...next, score, scoreParts });
}

/** Brand name on this product. Listing titles, ids, and physical facts stay as they are. */
export function setProductBrand(id: string, brand: string) {
  const cur = getProduct(id);
  if (!cur) throw new Error("product not found");
  const clean = brand.replace(/\s+/g, " ").trim();
  if (clean.length > 80) throw new Error("Keep the brand under 80 characters.");
  const next = clean || undefined;
  if ((cur.brand || undefined) === next) return cur;
  return patchProduct(id, { brand: next });
}

export function deleteProduct(id: string) {
  const db = readDb();
  db.products = db.products.filter((p) => p.id !== id);
  writeDb(db);
}

export function parseMarketplaceUrl(raw: string): {
  provider: Marketplace;
  providerProductId: string;
  sourceUrl: string;
  market?: string;
} | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const href = url.toString();

  const amazonHost = host.match(/^amazon\.([a-z.]+)$/);
  if (amazonHost || host === "amzn.to" || host === "a.co") {
    const dp = href.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i);
    const asin = dp?.[1]?.toUpperCase() || (host.startsWith("amzn") ? host : "");
    const tld = amazonHost ? amazonHost[1] : "com";
    const canonical = asin && asin !== "unknown" ? `https://www.amazon.${tld}/dp/${asin}` : href.split("?")[0];
    return {
      provider: "amazon",
      providerProductId: asin || "unknown",
      sourceUrl: canonical,
      market: tld,
    };
  }

  if (host.includes("shopee.")) {
    const shopHost = host.replace(/^s\./, "");
    const item = href.match(/i\.(\d+)\.(\d+)/) || href.match(/\/product\/(\d+)\/(\d+)/) || href.match(/\/(\d{5,})\/(\d{6,})(?:[/?#]|$)/);
    const id = item ? `${item[1]}.${item[2]}` : host.startsWith("s.shopee.") ? "short" : "homepage";
    return {
      provider: "shopee",
      providerProductId: id,
      sourceUrl: item ? `https://${shopHost}/product/${item[1]}/${item[2]}` : href.split("?")[0],
      market: shopHost.replace(/^shopee\./, ""),
    };
  }

  const tiktokShop = parseTikTokShopUrl(host, href);
  if (tiktokShop) return tiktokShop;

  if (host.includes("tokopedia.com")) {
    const slug = href.split("/").filter(Boolean).pop() || href;
    return { provider: "tokopedia", providerProductId: slug, sourceUrl: href.split("?")[0] };
  }

  if (host.includes("lazada.")) {
    return { provider: "lazada", providerProductId: href.split("/").filter(Boolean).pop() || href, sourceUrl: href.split("?")[0] };
  }

  if (host.includes("ebay.") || host === "ebay.to") {
    const itm = href.match(/\/itm\/(?:[^/]+\/)?(\d{9,15})/i) || href.match(/[?&]item=(\d{9,15})/i);
    return {
      provider: "ebay",
      providerProductId: itm?.[1] || href.split("/").filter(Boolean).pop() || href,
      sourceUrl: href.split("?")[0],
      market: host.replace(/^ebay\./, ""),
    };
  }

  if (host.includes("aliexpress.") || host.includes("alibaba.com") || host === "s.click.aliexpress.com") {
    const item = href.match(/\/item\/(\d+)\.html/i) || href.match(/[?&]productIds?=(\d+)/i);
    return {
      provider: "aliexpress",
      providerProductId: item?.[1] || href,
      sourceUrl: href.split("?")[0],
    };
  }

  return { provider: "other", providerProductId: href, sourceUrl: href };
}

function parseTikTokShopUrl(host: string, href: string): {
  provider: "tiktok-shop";
  providerProductId: string;
  sourceUrl: string;
  market?: string;
} | null {
  const shopHost =
    host === "shop.tiktok.com" ||
    host.endsWith(".tiktok.com") ||
    host === "tiktok.com" ||
    host === "vt.tiktok.com" ||
    host === "vm.tiktok.com";
  if (!shopHost) return null;

  const pdp =
    href.match(/\/view\/product\/(\d{10,})/i) ||
    href.match(/\/pdp\/(?:[^/]+\/)?(\d{10,})/i) ||
    href.match(/[?&](?:product_id|productId)=(\d{10,})/i);
  if (pdp) {
    const id = pdp[1];
    const region = href.match(/shop\.tiktok\.com\/([a-z]{2})\//i)?.[1];
    return {
      provider: "tiktok-shop",
      providerProductId: id,
      sourceUrl: href.split("?")[0],
      market: region,
    };
  }

  // US/short share links + in-app redirects. Import follows 30x then re-parses.
  if (
    host === "shop.tiktok.com" ||
    /\/view\/product|\/pdp\/|\/shop\//i.test(href) ||
    host === "vt.tiktok.com" ||
    host === "vm.tiktok.com" ||
    /tiktok\.com\/t\//i.test(href)
  ) {
    return {
      provider: "tiktok-shop",
      providerProductId: href.split("/").filter(Boolean).pop() || href,
      sourceUrl: href.split("?")[0],
    };
  }

  return null;
}

export const AIOSCREATORS_AMAZON_TAG = "aioscreators-20";

export function withAmazonTag(raw: string, tag: string) {
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    if (host !== "amazon.com" || !tag) return raw;
    url.searchParams.set("tag", tag);
    return url.toString();
  } catch {
    return raw;
  }
}

export function affiliateUrlFor(parsed: NonNullable<ReturnType<typeof parseMarketplaceUrl>>, tag: string) {
  if (parsed.provider === "amazon" && parsed.providerProductId && parsed.providerProductId !== "unknown") {
    return withAmazonTag(parsed.sourceUrl, parsed.market === "com" || new URL(parsed.sourceUrl).hostname.replace(/^www\./, "") === "amazon.com" ? tag : "");
  }
  return parsed.sourceUrl;
}

export function scoreProduct(p: Pick<Product, "title" | "images" | "rating" | "reviewCount" | "affiliateUrl" | "price">): {
  score: number;
  scoreParts: ScorePart[];
} {
  const hasAff = p.affiliateUrl.includes("tag=") || p.affiliateUrl.includes("invol.co") || p.affiliateUrl.includes("invl.me") || p.affiliateUrl.includes("involve.asia") || p.affiliateUrl.includes("affiliate") || /https?:\/\/s\.shopee\./i.test(p.affiliateUrl);
  const img = p.images.length > 0 ? 80 : 35;
  const reviews = p.reviewCount
    ? Math.min(100, 20 + Math.log10(p.reviewCount + 1) * 25 + (p.rating || 0) * 8)
    : 40;
  const parts: ScorePart[] = [
    { id: "trend", label: "Trend velocity", weight: 20, value: 50, note: "No live trend feed yet — neutral." },
    { id: "commission", label: "Commission / affiliate", weight: 15, value: hasAff ? 75 : 25, note: hasAff ? "Affiliate tag on destination." : "No associate tag — add AMAZON_ASSOCIATE_TAG." },
    { id: "audience", label: "Audience fit", weight: 15, value: 55, note: "Needs Grow loop. Neutral until analytics exist." },
    { id: "content", label: "Content potential", weight: 15, value: img, note: img >= 70 ? "Has product image for UGC." : "No image — script-only." },
    { id: "competition", label: "Competition", weight: 10, value: 50, note: "Not scraped. Neutral." },
    { id: "price", label: "Price / conversion fit", weight: 10, value: p.price ? 60 : 45, note: p.price || "Price unknown." },
    { id: "cvr", label: "Historical CVR", weight: 10, value: 50, note: "No attributed sales yet." },
    { id: "reviews", label: "Review quality", weight: 5, value: Math.round(reviews), note: p.reviewCount ? `${p.rating ?? "?"}★ · ${p.reviewCount} reviews` : "No review data." },
  ];
  const score = Math.round(parts.reduce((n, x) => n + (x.value * x.weight) / 100, 0));
  return { score, scoreParts: parts };
}

export function newProductId() {
  return randomUUID();
}

export function createBlankProduct(title: string, category?: string): Product {
  const now = new Date().toISOString();
  const name = title.trim() || "Untitled SKU";
  const { score, scoreParts } = scoreProduct({ title: name, images: [], affiliateUrl: "", price: undefined });
  return {
    id: newProductId(),
    provider: "other",
    providerProductId: `local-${Date.now()}`,
    title: name,
    category: category?.trim() || undefined,
    features: [],
    images: [],
    sourceUrl: "",
    affiliateUrl: "",
    score,
    scoreParts,
    createdAt: now,
    updatedAt: now,
  };
}

/** Manual try-on upload. Shop and affiliate links stay empty until the Products card is filled in. */
export function productFromManualUpload(input: { title: string; category?: string; imageUrl: string }): Product {
  const imageUrl = input.imageUrl.trim();
  const row = createBlankProduct(uploadProductTitle(input.title), input.category);
  row.providerProductId = `local-${row.id}`;
  row.images = imageUrl ? [imageUrl] : [];
  row.defaultImageUrl = imageUrl || undefined;
  row.imageRoles = imageUrl ? ["identity"] : [];
  const scored = scoreProduct(row);
  row.score = scored.score;
  row.scoreParts = scored.scoreParts;
  return upsertProduct(row);
}
