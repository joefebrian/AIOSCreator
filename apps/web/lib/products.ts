import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataRoot, ensureDataDirs } from "./paths";

export type Marketplace = "amazon" | "shopee" | "tiktok-shop" | "tokopedia" | "lazada" | "other";

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
  images: string[];
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
};

type Db = { products: Product[]; amazonAssociateTag?: string };

function filePath() {
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

export function upsertProduct(row: Product) {
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
      ...row,
      id: prev.id,
      createdAt: prev.createdAt,
      images: row.images.length ? row.images : prev.images,
      features: row.features.length ? row.features : prev.features,
    };
    writeDb(db);
    return db.products[i];
  }
  db.products.unshift(row);
  writeDb(db);
  return row;
}

export function patchProduct(id: string, patch: Partial<Product>) {
  const cur = getProduct(id);
  if (!cur) throw new Error("product not found");
  const next = { ...cur, ...patch, id: cur.id, createdAt: cur.createdAt, updatedAt: new Date().toISOString() };
  const { score, scoreParts } = scoreProduct(next);
  return upsertProduct({ ...next, score, scoreParts });
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
    return {
      provider: "amazon",
      providerProductId: asin || "unknown",
      sourceUrl: href.split("?")[0],
      market: amazonHost ? amazonHost[1] : undefined,
    };
  }

  if (host.includes("shopee.")) {
    const item = href.match(/i\.(\d+)\.(\d+)/);
    return {
      provider: "shopee",
      providerProductId: item ? `${item[1]}.${item[2]}` : href,
      sourceUrl: href.split("?")[0],
      market: host.replace("shopee.", ""),
    };
  }

  if (host.includes("tiktok.com") && /\/view\/product|shop/i.test(href)) {
    return { provider: "tiktok-shop", providerProductId: href, sourceUrl: href };
  }

  if (host.includes("tokopedia.com")) {
    const slug = href.split("/").filter(Boolean).pop() || href;
    return { provider: "tokopedia", providerProductId: slug, sourceUrl: href.split("?")[0] };
  }

  if (host.includes("lazada.")) {
    return { provider: "lazada", providerProductId: href.split("/").filter(Boolean).pop() || href, sourceUrl: href.split("?")[0] };
  }

  return { provider: "other", providerProductId: href, sourceUrl: href };
}

export function affiliateUrlFor(parsed: NonNullable<ReturnType<typeof parseMarketplaceUrl>>, tag: string) {
  if (parsed.provider === "amazon" && parsed.providerProductId && parsed.providerProductId !== "unknown") {
    const u = new URL(parsed.sourceUrl);
    if (tag) u.searchParams.set("tag", tag);
    return u.toString();
  }
  return parsed.sourceUrl;
}

export function scoreProduct(p: Pick<Product, "title" | "images" | "rating" | "reviewCount" | "affiliateUrl" | "price">): {
  score: number;
  scoreParts: ScorePart[];
} {
  const hasAff = p.affiliateUrl.includes("tag=") || p.affiliateUrl.includes("affiliate");
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
