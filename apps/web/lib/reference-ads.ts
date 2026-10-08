import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataRoot, ensureDataDirs, mediaUrlToPath, referenceAdFile, referenceAdUrl } from "./paths";
import { importProductFromUrl, localizeProductImages, rankSkuFile } from "./product-import";
import { getProduct, parseMarketplaceUrl, upsertProduct, type Product, type ReferenceAdLink } from "./products";

export type AdSource = ReferenceAdLink["source"];

export type ReferenceAd = ReferenceAdLink & {
  advertiser: string;
  copy: string;
  destinationUrl: string;
  productId?: string;
  note: string;
  createdAt: string;
};

type Db = { ads: ReferenceAd[] };

function file() {
  ensureDataDirs();
  return path.join(dataRoot(), "db", "reference-ads.json");
}

function readDb(): Db {
  const target = file();
  if (!fs.existsSync(target)) return { ads: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(target, "utf8")) as Db;
    return { ads: Array.isArray(parsed.ads) ? parsed.ads : [] };
  } catch {
    return { ads: [] };
  }
}

function writeDb(db: Db) {
  fs.writeFileSync(file(), JSON.stringify(db, null, 2));
}

export function listReferenceAds() {
  return readDb().ads;
}

export function classifyAdUrl(raw: string): AdSource | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "").toLowerCase();
  const pathName = url.pathname.toLowerCase();
  if ((host === "facebook.com" || host === "m.facebook.com" || host === "meta.com" || host.endsWith(".facebook.com")) && pathName.includes("/ads/library")) {
    return "meta-ad-library";
  }
  if (host === "library.tiktok.com") return "tiktok-ad-library";
  if (host === "ads.tiktok.com" && pathName.includes("creativecenter")) return "tiktok-creative-center";
  return null;
}

function meta(html: string, key: string) {
  const tag = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)`, "i"))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${key}["']`, "i"));
  return tag?.[1] ? decode(tag[1]) : "";
}

function decode(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\\u0026/g, "&")
    .replace(/\\\//g, "/");
}

export function parseAdHtml(html: string) {
  const images = new Set<string>();
  const videos = new Set<string>();
  const destinations = new Set<string>();
  const image = meta(html, "og:image");
  const video = meta(html, "og:video") || meta(html, "og:video:url");
  if (image.startsWith("http") && !/emoji|sprite|favicon|rsrc\.php/i.test(image)) images.add(image);
  if (video.startsWith("http")) videos.add(video);
  for (const match of html.matchAll(/https?:[^"'\s>]+\.mp4[^"'\s>]*/gi)) videos.add(decode(match[0]));
  for (const match of html.matchAll(/https?:[^"'\s>]+(?:fbcdn|tiktokcdn)[^"'\s>]+\.(?:jpg|jpeg|png|webp)/gi)) {
    const url = decode(match[0]);
    if (!/emoji|sprite|favicon|profile|avatar/i.test(url)) images.add(url);
  }
  for (const match of html.matchAll(/https?:\/\/(?:www\.)?(?:amazon\.[a-z.]+\/[^"'\s]+|amzn\.to\/[^"'\s]+|a\.co\/[^"'\s]+|shopee\.[a-z.]+\/[^"'\s]+|aliexpress\.[a-z.]+\/[^"'\s]+)/gi)) {
    destinations.add(decode(match[0]).replace(/\\+$/, ""));
  }
  return {
    title: meta(html, "og:title"),
    copy: meta(html, "og:description"),
    images: [...images].slice(0, 6),
    videos: [...videos].slice(0, 2),
    destinations: [...destinations].slice(0, 4),
  };
}

function shopDestination(urls: string[]) {
  for (const url of urls) {
    const parsed = parseMarketplaceUrl(url);
    if (parsed && ["amazon", "shopee", "aliexpress", "tiktok-shop"].includes(parsed.provider)) return parsed.sourceUrl;
  }
  return "";
}

async function saveRemote(url: string, id: string, kind: "image" | "video") {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": "Mozilla/5.0", Accept: kind === "video" ? "video/*,*/*" : "image/*,*/*" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) return "";
  const type = res.headers.get("content-type") || "";
  if (kind === "video" && !/video|mp4|octet-stream/i.test(type) && !url.includes(".mp4")) return "";
  if (kind === "image" && type && !/image/i.test(type)) return "";
  const buf = Buffer.from(await res.arrayBuffer());
  if (kind === "image" && (buf.length < 2500 || buf.length > 12_000_000)) return "";
  if (kind === "video" && (buf.length < 20_000 || buf.length > 40_000_000)) return "";
  const ext = kind === "video" ? "mp4" : /png/i.test(type) ? "png" : /webp/i.test(type) ? "webp" : "jpg";
  const dest = referenceAdFile(`${id}-${kind}`, ext);
  fs.writeFileSync(dest, buf);
  return referenceAdUrl(`${id}-${kind}`, ext);
}

export async function importReferenceAd(pageUrl: string) {
  const source = classifyAdUrl(pageUrl);
  if (!source) return { error: "Not an ad library or Creative Center link." as const };
  const res = await fetch(pageUrl, {
    redirect: "follow",
    headers: { "User-Agent": "Mozilla/5.0", Accept: "text/html" },
    signal: AbortSignal.timeout(20_000),
  });
  const html = await res.text();
  const parsed = parseAdHtml(html);
  const id = randomUUID();
  let heroUrl = "";
  let heroStatus: ReferenceAdLink["heroStatus"] = "missing";
  for (const imageUrl of parsed.images) {
    const saved = await saveRemote(imageUrl, id, "image");
    if (!saved) continue;
    const file = mediaUrlToPath(saved);
    const rank = file && fs.existsSync(file) ? rankSkuFile(file) : { role: "other" as const, score: 0 };
    if (rank.role === "identity") {
      heroUrl = saved;
      heroStatus = "identity";
      break;
    }
    if (file) fs.rmSync(file, { force: true });
    heroStatus = rank.role === "usage" ? "rejected-face" : "rejected";
  }
  let videoUrl = "";
  for (const video of parsed.videos) {
    videoUrl = await saveRemote(video, id, "video");
    if (videoUrl) break;
  }
  const destinationUrl = shopDestination(parsed.destinations);
  let product: Product | undefined;
  let note = "";
  if (destinationUrl) {
    product = await importProductFromUrl(destinationUrl);
    product = await localizeProductImages(product);
    const link: ReferenceAdLink = { id, source, sourceUrl: pageUrl, heroUrl: heroUrl || undefined, heroStatus, videoUrl: videoUrl || undefined };
    product = upsertProduct({ ...product, referenceAds: [...(product.referenceAds || []), link] });
    note = heroUrl
      ? "Ad hero and the shop listing are separate. The pack shot is still the SKU photo."
      : "No product hero in this ad. The listing pack shot was not replaced.";
  } else if (html.length < 2000 || (!parsed.title && !parsed.images.length && !parsed.videos.length)) {
    note = "This ad page did not include the creative. Open the ad and paste that page, or paste the shop link.";
  } else {
    note = "Ad saved. It needs a shop product before Factory or Affiliate can use it.";
  }
  if (!videoUrl && parsed.videos.length === 0) note = `${note} No reference video was in the page.`.trim();
  const ad: ReferenceAd = {
    id,
    source,
    sourceUrl: pageUrl,
    advertiser: parsed.title,
    copy: parsed.copy,
    destinationUrl,
    productId: product?.id,
    heroUrl: heroUrl || undefined,
    heroStatus,
    videoUrl: videoUrl || undefined,
    note,
    createdAt: new Date().toISOString(),
  };
  const db = readDb();
  db.ads.unshift(ad);
  writeDb(db);
  return { ad, product, products: undefined as Product[] | undefined };
}
