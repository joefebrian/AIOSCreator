import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { addProductAsset, listProductAssets } from "./product-assets";
import { listProducts } from "./products";
import path from "node:path";
import { dataRoot, mediaUrlToPath, productFile, productMediaUrl } from "./paths";
import { isInvolveLink } from "./involve";
import { variantSelectionId } from "./shopee-affiliate-link";
import { fallbackListingLines, tidyListingCopy } from "./product-copy";
import {
  affiliateUrlFor,
  newProductId,
  parseMarketplaceUrl,
  scoreProduct,
  getAmazonAssociateTag,
  setProductImages,
  upsertProduct,
  type Product,
} from "./products";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

function decode(s: string) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) && code >= 32 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    })
    .replace(/&#(\d+);/g, (_, num: string) => {
      const code = Number(num);
      return Number.isFinite(code) && code >= 32 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    })
    .replace(/&amp;?/gi, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function og(html: string, prop: string) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, "i");
  const m = html.match(re) || html.match(re2);
  return m ? decode(m[1]).trim() : "";
}

function titleFromAmazonSlug(url: string) {
  const m = url.match(/amazon\.[^/]+\/([^/]+)\/(?:dp|gp\/product)\//i);
  if (!m) return "";
  const slug = decodeURIComponent(m[1]).replace(/-/g, " ").replace(/\s+/g, " ").trim();
  if (!slug || /^dp$/i.test(slug) || slug.length < 8) return "";
  return slug;
}

function structuredBrand(value: unknown) {
  const raw = typeof value === "string"
    ? value
    : value && typeof value === "object" && typeof (value as { name?: unknown }).name === "string"
      ? (value as { name: string }).name
      : "";
  const name = decode(String(raw)).replace(/\s+/g, " ").trim();
  if (!name || name.length > 80 || /^https?:/i.test(name)) return "";
  return name;
}

export function brandFromListingHtml(html: string) {
  return jsonLdProduct(html)?.brand || "";
}

function jsonLdProduct(html: string) {
  const blocks = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const b of blocks) {
    try {
      const raw = JSON.parse(b[1]);
      const nodes = Array.isArray(raw) ? raw : raw["@graph"] ? raw["@graph"] : [raw];
      const p = nodes.find((n: { "@type"?: string }) => String(n?.["@type"] || "").toLowerCase().includes("product"));
      if (!p) continue;
      const images = [] as string[];
      const img = p.image;
      if (typeof img === "string") images.push(img);
      else if (Array.isArray(img)) for (const x of img) if (typeof x === "string") images.push(x);
      else if (img?.url) images.push(img.url);
      const offer = Array.isArray(p.offers) ? p.offers[0] : p.offers;
      const rawPrice =
        typeof offer?.price === "string" || typeof offer?.price === "number"
          ? String(offer.price)
          : offer?.price?.value
            ? String(offer.price.value)
            : offer?.lowPrice
              ? String(offer.lowPrice)
              : "";
      return {
        title: typeof p.name === "string" ? decode(p.name) : "",
        description: typeof p.description === "string" ? decode(p.description) : "",
        images,
        price: rawPrice,
        currency: offer?.priceCurrency ? String(offer.priceCurrency) : offer?.price?.currency ? String(offer.price.currency) : "",
        brand: structuredBrand(p.brand),
      };
    } catch {
      /* next block */
    }
  }
  return null;
}

function amazonImages(html: string) {
  const out: string[] = [];
  const push = (raw: string) => {
    let url = decode(raw.replace(/\\u002F/g, "/").replace(/\\\//g, "/")).trim();
    if (!/^https?:\/\//i.test(url)) return;
    if (!/m\.media-amazon\.com\/images\/I\//i.test(url) && !/ssl-images-amazon\.com\/images\//i.test(url)) return;
    if (/\.(?:js|css)(?:$|\?)/i.test(url) || /_RC(?:_|\.|$)/.test(url) || /\/images\/G\//i.test(url)) return;
    if (/\._AC_\.jpe?g$/i.test(url) && !/_S[LXY]\d+|_U[LX]\d+/i.test(url)) return;
    url = url.replace(/\._[A-Z]{2}\d+_\./, ".");
    if (!out.includes(url)) out.push(url);
  };
  for (const m of html.matchAll(/"(?:hiRes|large|mainUrl|thumbUrl)"\s*:\s*"(https:[^"]+)"/g)) push(m[1]);
  for (const m of html.matchAll(/data-old-hires="(https:[^"]+)"/gi)) push(m[1]);
  for (const m of html.matchAll(/data-a-dynamic-image="([^"]+)"/gi)) {
    try {
      const map = JSON.parse(decode(m[1])) as Record<string, number[]>;
      for (const u of Object.keys(map)) push(u);
    } catch {
      /* skip */
    }
  }
  const land = html.match(/id="landingImage"[^>]+(?:src|data-src)="([^"]+)"/i);
  if (land) push(land[1]);
  for (const m of html.matchAll(/https:\/\/m\.media-amazon\.com\/images\/I\/[A-Za-z0-9+._%-]+/g)) {
    if (/\.(?:jpg|jpeg|png|webp)/i.test(m[0]) || /_AC_/i.test(m[0])) push(m[0]);
  }
  return out.slice(0, 12);
}

function amazonBullets(html: string) {
  const block = html.match(/id="feature-bullets"[\s\S]{0,12000}/i)?.[0] || "";
  return [...block.matchAll(/<span[^>]*class="[^"]*a-list-item[^"]*"[^>]*>([\s\S]*?)<\/span>/gi)]
    .map((m) => decode(m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()))
    .filter((s) => s.length > 12 && !/see more/i.test(s))
    .slice(0, 8);
}

function junkTitle(title: string) {
  const t = title.trim();
  return (
    !t ||
    /^amazon(\.com)?$/i.test(t) ||
    /^amazon [A-Z0-9]{10}$/i.test(t) ||
    /^https?:/i.test(t) ||
    /^shopee( indonesia| malaysia| singapore)?(\s*[|/].*)?$/i.test(t) ||
    /free shipping across malaysia/i.test(t) ||
    /^situs belanja/i.test(t)
  );
}

function amazonBlocked(html: string) {
  if (html.length < 20_000) return true;
  const head = html.slice(0, 4000);
  return /robot check|enter the characters|validateCaptcha|opfcaptcha|automated access|api-services-support@amazon\.com/i.test(head);
}

const CHROME_HEADERS: Record<string, string> = {
  "User-Agent": BROWSER_UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
  "Upgrade-Insecure-Requests": "1",
  "Cache-Control": "no-cache",
};

const CRAWLER_HEADERS: Record<string, string> = {
  "User-Agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
  Accept: "text/html",
  "Accept-Language": "id-ID,id;q=0.9,en;q=0.8",
};

function uaChain(url: string): Record<string, string>[] {
  if (/shopee\.|tokopedia\.|lazada\./i.test(url)) return [CRAWLER_HEADERS, CHROME_HEADERS];
  return [CHROME_HEADERS, CRAWLER_HEADERS];
}

function junkImage(url: string) {
  return /logo|favicon|sprite|icon[-_/]|apple-touch|\/assets\/|shopee-pcmall|placeholder|default[-_]og|spinner|deo\.shopeemobile|homepagefe|mobilemall-live|brand[-_]?mark|watermark|infographic|size[-_]?chart|_PKdp|play-icon|prime-logo/i.test(
    url,
  );
}

function isFaceSkin(r: number, g: number, b: number) {
  const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
  const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
  return r > 95 && r > g && r > b && cb >= 80 && cb <= 125 && cr >= 135 && cr <= 173;
}

function rgbPreview(file: string, w = 80, h = 80, pad = true): Buffer | null {
  const vf = pad
    ? `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:white`
    : `scale=${w}:${h}`;
  const run = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      file,
      "-vf",
      vf,
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "pipe:1",
    ],
    { maxBuffer: w * h * 3 + 4096, windowsHide: true },
  );
  if (run.status !== 0 || !run.stdout || run.stdout.length < w * h * 3) return null;
  return run.stdout.subarray(0, w * h * 3);
}

/** Pack-shot stills. Drop promo/logo plates and close-up on-model photos with a visible head. */
export function classifyProductStill(file: string): "ok" | "logo" | "head" {
  if (!fs.existsSync(file) || fs.statSync(file).size < 2500) return "logo";
  const W = 80;
  const H = 80;
  const rgb = rgbPreview(file, W, H);
  if (!rgb) return "ok";
  const n = W * H;
  const headRows = Math.floor(H * 0.34);
  let dark = 0;
  let face = 0;
  let faceCells = 0;
  let faceMinX = W;
  let faceMaxX = 0;
  let satLogo = 0;
  const logoRows = Math.floor(H * 0.16);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const r = rgb[i * 3]!;
      const g = rgb[i * 3 + 1]!;
      const b = rgb[i * 3 + 2]!;
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      if (luma < 28) dark += 1;
      if (y < logoRows) {
        const sat = Math.max(r, g, b) - Math.min(r, g, b);
        if (sat > 90 && luma > 50 && luma < 220 && !isFaceSkin(r, g, b)) satLogo += 1;
      }
      if (y < headRows && x >= W * 0.22 && x <= W * 0.78) {
        faceCells += 1;
        if (isFaceSkin(r, g, b)) {
          face += 1;
          if (x < faceMinX) faceMinX = x;
          if (x > faceMaxX) faceMaxX = x;
        }
      }
    }
  }
  if (dark / n > 0.78) return "logo";
  if (logoRows * W > 0 && satLogo / (logoRows * W) > 0.14) return "logo";
  const faceRatio = faceCells ? face / faceCells : 0;
  const faceSpan = face > 0 ? (faceMaxX - faceMinX) / W : 1;
  if (faceRatio > 0.045 && faceRatio < 0.4 && faceSpan < 0.42) return "head";
  return "ok";
}

export type SkuImageRole = "identity" | "detail" | "usage" | "packaging" | "other";

function nearWhite(r: number, g: number, b: number) {
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  const sat = Math.max(r, g, b) - Math.min(r, g, b);
  return luma > 198 && sat < 28;
}

function packFrame(file: string) {
  const rgb = rgbPreview(file, 80, 80);
  if (!rgb) return null;
  const W = 80;
  const H = 80;
  let border = 0;
  let borderN = 0;
  let center = 0;
  let centerN = 0;
  let gutter = 0;
  let gutterN = 0;
  let vWhite = 0;
  let vN = 0;
  let hWhite = 0;
  let hN = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      const white = nearWhite(rgb[i]!, rgb[i + 1]!, rgb[i + 2]!);
      if (x < 8 || y < 8 || x >= W - 8 || y >= H - 8) {
        borderN += 1;
        if (white) border += 1;
      }
      if (x > 22 && x < 58 && y > 22 && y < 58) {
        centerN += 1;
        if (!white) center += 1;
      }
      if ((x > 36 && x < 44) || (y > 36 && y < 44)) {
        gutterN += 1;
        if (white) gutter += 1;
      }
      if (x > 36 && x < 44) {
        vN += 1;
        if (white) vWhite += 1;
      }
      if (y > 36 && y < 44 && x > 24 && x < 56) {
        hN += 1;
        if (white) hWhite += 1;
      }
    }
  }
  const clean = borderN ? border / borderN : 0;
  const fill = centerN ? center / centerN : 0;
  const vGap = vN ? vWhite / vN : 0;
  const hGap = hN ? hWhite / hN : 0;
  const rowWhite = (y: number) => {
    let white = 0;
    let n = 0;
    for (let x = 24; x < 56; x++) {
      const i = (y * W + x) * 3;
      n += 1;
      if (nearWhite(rgb[i]!, rgb[i + 1]!, rgb[i + 2]!)) white += 1;
    }
    return n ? white / n : 0;
  };
  let pieceGap = 0;
  for (let y = 22; y <= 54; y++) {
    const here = (rowWhite(y) + rowWhite(y + 1) + rowWhite(y + 2)) / 3;
    const above = (rowWhite(y - 6) + rowWhite(y - 4) + rowWhite(y - 2)) / 3;
    const below = (rowWhite(y + 6) + rowWhite(y + 8) + rowWhite(y + 10)) / 3;
    if (here > 0.72 && above < 0.45 && below < 0.45) pieceGap = Math.max(pieceGap, here);
  }
  return {
    clean,
    fill,
    split: gutterN ? gutter / gutterN : 0,
    vGap,
    hGap,
    stackedSet: clean > 0.85 && pieceGap > 0.72 && fill > 0.35 && fill < 0.85,
  };
}

/** Role of a file already on disk. Does not download anything. */
export function rankSkuFile(file: string): { role: SkuImageRole; score: number } {
  const kind = classifyProductStill(file);
  if (kind === "logo") return { role: "other", score: 0 };
  const frame = packFrame(file);
  // A matching set on white has a knit neck that looks like a small face. Keep that photo.
  if (kind === "head" && !frame?.stackedSet) return { role: "usage", score: 1 };
  if (!frame) return { role: "other", score: 0 };
  if (!frame.stackedSet && frame.split > 0.7 && frame.fill > 0.18) return { role: "other", score: 0.1 };
  if (frame.clean > 0.42 && frame.fill > 0.15 && frame.fill < 0.8) {
    return { role: "identity", score: frame.clean + (1 - Math.abs(frame.fill - 0.42)) + (frame.stackedSet ? 0.15 : 0) };
  }
  if (frame.fill > 0.62 && frame.clean < 0.3) return { role: "detail", score: frame.fill };
  return { role: "other", score: frame.clean };
}

/** White-background photo with one piece above another and a gap between them. */
export function referenceLooksLikeSet(file: string) {
  return Boolean(packFrame(file)?.stackedSet);
}

const ROLE_ORDER: Record<SkuImageRole, number> = { identity: 0, packaging: 1, detail: 2, other: 3, usage: 4 };

export function skuIdentityUrl(product: { images?: string[]; imageRoles?: SkuImageRole[]; defaultImageUrl?: string }) {
  if (product.defaultImageUrl && product.images?.includes(product.defaultImageUrl)) return product.defaultImageUrl;
  const roles = product.imageRoles || [];
  const index = roles.indexOf("identity");
  return index >= 0 ? product.images?.[index] || "" : "";
}

/** Pack shot Fashion should attach. Empty imageUrl means the operator picks a thumb. */
export function fashionPick(product: { images?: string[]; imageRoles?: SkuImageRole[] }) {
  const images = (product.images || []).filter((url) => url.startsWith("/api/media/"));
  const imageUrl = skuIdentityUrl(product);
  const marked = (url: string) => {
    const file = mediaUrlToPath(url);
    return Boolean(file && fs.existsSync(file) && referenceLooksLikeSet(file));
  };
  return {
    imageUrl,
    set: Boolean(imageUrl && marked(imageUrl)),
    choices: imageUrl ? [] : images.map((url) => ({ url, set: marked(url) })),
  };
}

function filePrefix(url: string) {
  const name = url.split("/").pop() || "";
  const match = name.match(/^([0-9a-f]{8})-/i);
  return match ? match[1].toLowerCase() : "";
}

export function arrangeSkuImages(product: Product): Product {
  const owners = new Set(listProducts().map((row) => row.id.slice(0, 8).toLowerCase()));
  const mine = product.id.slice(0, 8).toLowerCase();
  const locals = (product.images || []).filter((url) => {
    if (!url.startsWith("/api/media/")) return false;
    const file = mediaUrlToPath(url);
    if (!file || !fs.existsSync(file)) return false;
    const prefix = filePrefix(url);
    if (!prefix || prefix === mine) return true;
    return !owners.has(prefix);
  });
  const remotes = (product.images || []).filter((url) => /^https?:\/\//i.test(url));
  const pinned = product.defaultImageUrl && locals.includes(product.defaultImageUrl) ? product.defaultImageUrl : "";
  const ranked = locals
    .filter((url) => url !== pinned)
    .map((url) => {
      const file = mediaUrlToPath(url);
      const rank = file && fs.existsSync(file) ? rankSkuFile(file) : { role: "other" as const, score: 0 };
      return { url, ...rank };
    });
  ranked.sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || b.score - a.score);
  const images = [...(pinned ? [pinned] : []), ...ranked.map((row) => row.url), ...remotes];
  const imageRoles = [
    ...(pinned ? ["identity" as const] : []),
    ...ranked.map((row) => (row.role === "identity" && pinned ? "other" : row.role)),
    ...remotes.map(() => "other" as const),
  ];
  if (images.join("\n") === (product.images || []).join("\n") && (product.imageRoles || []).join() === imageRoles.join()) return product;
  return setProductImages(product.id, images, imageRoles) || product;
}

function shopeeCdn(url: string) {
  if (/\.co\.id\b/i.test(url)) return "https://down-id.img.susercontent.com/file/";
  if (/\.com\.my\b/i.test(url)) return "https://down-my.img.susercontent.com/file/";
  if (/\.co\.th\b/i.test(url)) return "https://down-th.img.susercontent.com/file/";
  if (/\.com\.sg\b|\.sg\b/i.test(url)) return "https://down-sg.img.susercontent.com/file/";
  if (/\.vn\b/i.test(url)) return "https://down-vn.img.susercontent.com/file/";
  if (/\.com\.tw\b/i.test(url)) return "https://down-tw.img.susercontent.com/file/";
  const host = url.match(/https?:\/\/(down-[a-z]+)\.img\.susercontent\.com/i);
  if (host) return `https://${host[1]}.img.susercontent.com/file/`;
  return "https://down-id.img.susercontent.com/file/";
}

function shopeeImages(html: string, pageUrl: string) {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/(?:down-[a-z]+\.img\.susercontent\.com|cf\.shopee\.[a-z.]+)\/file\/([a-z0-9-]+)/gi)) {
    const id = m[1].replace(/@.*$/, "").replace(/\.(?:webp|jpg|jpeg|png)$/i, "").toLowerCase();
    if (!id || seen.has(id) || /logo|icon|avatar|sprite|placeholder|banner|badge|^global-|^my-5000|^sg-5000/i.test(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  const cdn = shopeeCdn(pageUrl);
  return ids.slice(0, 12).map((id) => `${cdn}${id}`);
}

function titleFromShopeeSlug(url: string) {
  const m = url.match(/shopee\.[^/]+\/([^/?#]+)-i\.\d+\.\d+/i);
  if (!m) return "";
  try {
    return decodeURIComponent(m[1]).replace(/-/g, " ").replace(/\s+/g, " ").trim();
  } catch {
    return m[1].replace(/-/g, " ");
  }
}

function hasProductMedia(html: string) {
  if (og(html, "og:image") && !junkImage(og(html, "og:image"))) return true;
  if (amazonImages(html).length) return true;
  if (shopeeImages(html, "").length) return true;
  if (tiktokShopImages(html).length) return true;
  return false;
}

async function fetchListing(url: string): Promise<{ html: string; finalUrl: string }> {
  const amazon = /amazon\.|amzn\.to|a\.co\//i.test(url);
  const limit = amazon ? 2_000_000 : 600_000;
  let fallback: { html: string; finalUrl: string } | null = null;
  for (const headers of uaChain(url)) {
    try {
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(16_000),
        redirect: "follow",
      });
      if (!res.ok) continue;
      const html = (await res.text()).slice(0, limit);
      if (amazon && amazonBlocked(html)) continue;
      if (html.length > 1500 && !/robot check|enter the characters|captcha/i.test(html.slice(0, 2500))) {
        if (hasProductMedia(html)) return { html, finalUrl: res.url || url };
        if (!fallback) fallback = { html, finalUrl: res.url || url };
      }
    } catch {
      /* try next UA */
    }
  }
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { Accept: "text/plain", "User-Agent": BROWSER_UA },
      signal: AbortSignal.timeout(18_000),
    });
    if (res.ok) {
      const html = (await res.text()).slice(0, 200_000);
      if (html.length > 400 && !/^<!DOCTYPE html>/i.test(html)) return { html, finalUrl: url };
    }
  } catch {
    /* no fallback */
  }
  return fallback || { html: "", finalUrl: url };
}

function tiktokShopImages(html: string) {
  const out: string[] = [];
  for (const m of html.matchAll(/https?:\/\/[^\s"'\\]+(?:tiktokcdn[^\s"'\\]*|ibyteimg\.com[^\s"'\\]*|p1[69]-oec[^\s"'\\]*)/gi)) {
    const u = m[0].replace(/\\u002F/g, "/").replace(/&amp;/g, "&").split('"')[0];
    if (/\.(?:jpg|jpeg|png|webp)/i.test(u) || /tplv-|resize-jpeg|\/tos-/i.test(u)) {
      if (!out.includes(u)) out.push(u);
    }
  }
  return out.slice(0, 6);
}

function parseJinaMarkdown(md: string) {
  const title = md.match(/^Title:\s*(.+)$/m)?.[1]?.trim() || md.match(/^#\s+(.+)$/m)?.[1]?.trim() || "";
  const images = [...md.matchAll(/https?:\/\/[^\s)]+\.(?:jpg|jpeg|png|webp)/gi)].map((m) => m[0]).slice(0, 6);
  const desc = md.match(/^Description:\s*(.+)$/m)?.[1]?.trim() || "";
  const priceLine = md.match(/^(?:Price|Harga|Sale Price)\s*[:|-]\s*(.+)$/im)?.[1] || "";
  const money = priceLine
    ? parseMoney(priceLine)
    : parseMoney(md.match(/(?:Rp\.?\s*[\d.]+(?:[.,]\d{3})*|RM\s*[\d.,]+|S\$\s*[\d.,]+|\$\s*[\d.,]+)/)?.[0] || "");
  return { title, images, desc, price: money.price, currency: money.currency };
}

function parseMoney(raw: string): { price: string; currency: string } {
  const s = decode(raw).replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
  if (!s || s.length > 40 || !/\d/.test(s)) return { price: "", currency: "" };
  let currency = "";
  if (/Rp|IDR/i.test(s)) currency = "IDR";
  else if (/\bRM\b|MYR/i.test(s)) currency = "MYR";
  else if (/S\$|SGD/i.test(s)) currency = "SGD";
  else if (/฿|THB/i.test(s)) currency = "THB";
  else if (/£|GBP/i.test(s)) currency = "GBP";
  else if (/€|EUR/i.test(s)) currency = "EUR";
  else if (/\$|USD/i.test(s)) currency = "USD";
  const num = s.replace(/[^\d.,]/g, "");
  if (!num) return { price: "", currency };
  let amount = num;
  if (currency === "IDR") amount = num.replace(/\./g, "").replace(",", ".");
  else if (/,\d{2}$/.test(num) && !/\.\d{2}$/.test(num)) amount = num.replace(/\./g, "").replace(",", ".");
  else amount = num.replace(/,/g, "");
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0 || n > 1e9) return { price: "", currency };
  if (currency === "IDR" && n > 1e7 && n % 100000 === 0) {
    return { price: String(Math.round(n / 100000)), currency };
  }
  return { price: currency === "IDR" ? String(Math.round(n)) : n.toFixed(2).replace(/\.00$/, ""), currency };
}

function extractListingPrice(html: string): { price: string; currency: string } {
  const ogAmount = og(html, "og:price:amount") || og(html, "product:price:amount") || og(html, "twitter:data1");
  const ogCur = og(html, "og:price:currency") || og(html, "product:price:currency");
  if (ogAmount && /\d/.test(ogAmount)) {
    const hit = parseMoney(`${ogCur || ""} ${ogAmount}`.trim());
    if (hit.price) return { price: hit.price, currency: hit.currency || ogCur };
  }
  const item = html.match(/itemprop=["']price["'][^>]*content=["']([^"']+)["']/i) || html.match(/content=["']([^"']+)["'][^>]*itemprop=["']price["']/i);
  if (item?.[1]) {
    const cur = html.match(/itemprop=["']priceCurrency["'][^>]*content=["']([^"']+)["']/i)?.[1] || "";
    const hit = parseMoney(`${cur} ${item[1]}`);
    if (hit.price) return hit;
  }
  const off = html.match(/<span[^>]*class="[^"]*a-offscreen[^"]*"[^>]*>\s*([^<]{2,28})\s*</i);
  if (off?.[1] && /[\d]/.test(off[1]) && /[$£€RpRM]|USD|IDR/i.test(off[1])) {
    const hit = parseMoney(off[1]);
    if (hit.price) return hit;
  }
  const amount = html.match(/"(?:priceAmount|amount|displayPrice|price_min)"\s*:\s*"?([\d.]+)"?/i);
  const cur = html.match(/"(?:currency|priceCurrency)"\s*:\s*"([A-Z]{3})"/i)?.[1] || "";
  if (amount?.[1]) {
    const hit = parseMoney(`${cur} ${amount[1]}`);
    if (hit.price) return { price: hit.price, currency: hit.currency || cur };
  }
  const shopee = html.match(/"price(?:_min)?"\s*:\s*(\d{4,})/);
  if (shopee) {
    let n = Number(shopee[1]);
    if (n > 1e7 && n % 100000 === 0) n = n / 100000;
    if (n > 0 && n < 1e8) return { price: String(Math.round(n)), currency: "IDR" };
  }
  return { price: "", currency: "" };
}

async function resolveShopeeShort(raw: string) {
  let current = raw;
  for (let i = 0; i < 5; i++) {
    const res = await fetch(current, {
      redirect: "manual",
      headers: { "User-Agent": BROWSER_UA, Accept: "text/html" },
      signal: AbortSignal.timeout(12_000),
    });
    const loc = res.headers.get("location");
    if (!loc || res.status < 300 || res.status >= 400) return current;
    current = new URL(loc, current).toString();
    const parsed = parseMarketplaceUrl(current);
    if (parsed?.provider === "shopee" && /^\d+\.\d+$/.test(parsed.providerProductId)) return current;
  }
  return current;
}

/** Reads a listing page for this SKU's market row. Does not create a product. */
export async function previewListingImport(raw: string): Promise<{
  extracted: boolean;
  sourceUrl: string;
  title: string;
  image: string;
  seller: string;
  variantQuery: string;
  error: string;
}> {
  const sourceUrl = raw.trim();
  const variantQuery = variantSelectionId(sourceUrl);
  const parsed = parseMarketplaceUrl(sourceUrl);
  if (!parsed) return { extracted: false, sourceUrl, title: "", image: "", seller: "", variantQuery, error: "Need a full product URL." };
  try {
    let pageUrl = parsed.sourceUrl;
    if (parsed.provider === "shopee" && parsed.providerProductId === "short") {
      const resolved = await resolveShopeeShort(sourceUrl);
      const again = parseMarketplaceUrl(resolved);
      if (again?.provider === "shopee" && /^\d+\.\d+$/.test(again.providerProductId)) pageUrl = again.sourceUrl;
    }
    const listing = await fetchListing(pageUrl);
    const html = listing.html || "";
    const ld = html ? jsonLdProduct(html) : null;
    let title = ld?.title || (html ? og(html, "og:title") : "") || "";
    if (!title && html) {
      const tag = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (tag) title = decode(tag[1].replace(/\s+/g, " ").trim());
    }
    title = title.replace(/\s*[|·]\s*Shopee.*$/i, "").replace(/^Jual\s+/i, "").trim();
    if (junkTitle(title)) title = titleFromShopeeSlug(pageUrl) || "";
    const image = html ? (og(html, "og:image") || shopeeImages(html, pageUrl)[0] || "") : "";
    const extracted = Boolean(title) && !junkTitle(title) && !/^https?:\/\//i.test(title);
    return { extracted, sourceUrl, title: extracted ? title : "", image, seller: ld?.brand || "", variantQuery, error: extracted ? "" : "The page did not yield a title. The link can stay saved for review." };
  } catch (err) {
    return { extracted: false, sourceUrl, title: "", image: "", seller: "", variantQuery, error: err instanceof Error ? err.message : "The listing page did not open." };
  }
}

export async function importProductFromUrl(raw: string): Promise<Product> {
  let parsed = parseMarketplaceUrl(raw);
  if (!parsed) throw new Error("Need a full product URL (Amazon / eBay / Shopee / AliExpress / TikTok Shop / Tokopedia / Lazada).");
  const pastedShort = parsed.provider === "shopee" && parsed.providerProductId === "short" ? new URL(raw.trim()) : null;
  const shopeeAffiliateShort = pastedShort ? `${pastedShort.origin}${pastedShort.pathname}` : "";
  if (shopeeAffiliateShort) {
    const resolved = await resolveShopeeShort(raw);
    const again = parseMarketplaceUrl(resolved);
    if (again?.provider === "shopee" && /^\d+\.\d+$/.test(again.providerProductId)) parsed = again;
  }
  if (parsed.provider === "shopee" && !/^\d+\.\d+$/.test(parsed.providerProductId)) {
    throw new Error(parsed.providerProductId === "short"
      ? "That Shopee short link did not open a product. Paste the full listing link."
      : "Need a Shopee product link (…-i.shopid.itemid), not the shop homepage.");
  }
  const listing = await fetchListing(parsed.sourceUrl);
  if (listing.finalUrl && listing.finalUrl !== parsed.sourceUrl) {
    const again = parseMarketplaceUrl(listing.finalUrl);
    if (again) parsed = again;
  }
  const tag = getAmazonAssociateTag();
  let affiliateUrl = affiliateUrlFor(parsed, tag);
  if (shopeeAffiliateShort) affiliateUrl = shopeeAffiliateShort;

  let title = "";
  let image = "";
  let extraImages: string[] = [];
  let description = "";
  let price = "";
  let currency = "";
  let bullets: string[] = [];
  let sourceBrand = "";
  const html = listing.html;
  if (html) {
    const ld = jsonLdProduct(html);
    sourceBrand = ld?.brand || "";
    title = ld?.title || og(html, "og:title") || og(html, "twitter:title");
    if (!title) {
      const t = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (t) title = decode(t[1].replace(/\s+/g, " ").trim()).replace(/\s*:\s*Amazon\.com.*$/i, "");
    }
    title = title.replace(/\s*[|·]\s*Shopee.*$/i, "").replace(/^Jual\s+/i, "").trim();
    const imgs = [
      ...(ld?.images || []),
      ...amazonImages(html),
      ...shopeeImages(html, parsed.sourceUrl),
      ...tiktokShopImages(html),
      og(html, "og:image"),
      og(html, "twitter:image"),
    ].filter((u) => u && !junkImage(u));
    image = imgs[0] || "";
    extraImages = imgs.slice(1, 12);
    description = ld?.description || og(html, "og:description") || og(html, "description");
    const listed = extractListingPrice(html);
    price = ld?.price || listed.price;
    currency = ld?.currency || listed.currency;
    bullets = amazonBullets(html);
    if (junkTitle(title) || !image || !price) {
      const jina = parseJinaMarkdown(html);
      if (junkTitle(title) && jina.title && !junkTitle(jina.title)) title = jina.title;
      const jinaImgs = jina.images.filter((u) => !junkImage(u));
      if (!image && jinaImgs[0]) {
        image = jinaImgs[0];
        extraImages = jinaImgs.slice(1);
      }
      if (!description && jina.desc) description = jina.desc;
      if (!price && jina.price) {
        price = jina.price;
        currency = jina.currency || currency;
      }
    }
  }

  if (junkTitle(title)) title = titleFromAmazonSlug(parsed.sourceUrl) || titleFromShopeeSlug(parsed.sourceUrl) || title;
  if (junkTitle(title)) {
    const id = parsed.providerProductId;
    title =
      parsed.provider === "amazon" && id !== "unknown"
        ? `Amazon ${id}`
        : parsed.provider === "shopee"
          ? `Shopee ${id}`
          : parsed.provider === "ebay"
            ? `eBay ${id}`
            : parsed.provider === "aliexpress"
              ? `AliExpress ${id}`
              : parsed.provider === "tiktok-shop"
                ? `TikTok Shop ${id}`
                : parsed.sourceUrl;
  }

  title = decode(title);
  const rawFeatures = (bullets.length ? bullets : description ? description.split(/[•\n|;]/) : [])
    .map((s) => decode(s).trim())
    .filter((s) => s.length > 12)
    .slice(0, 8);
  let features = rawFeatures;
  let copyWarning = "";
  try {
    const lines = await tidyListingCopy({ title, features: rawFeatures });
    if (lines.length) features = lines;
  } catch {
    features = fallbackListingLines(title, rawFeatures);
    if (rawFeatures.length) copyWarning = "Description was not tidied. Open the product and press Tidy.";
  }

  const now = new Date().toISOString();
  const images = [image, ...extraImages].filter(Boolean).filter((u, i, a) => a.indexOf(u) === i);
  const draft = {
    title,
    images,
    rating: undefined as number | undefined,
    reviewCount: undefined as number | undefined,
    affiliateUrl,
    price: price || undefined,
  };
  const { score, scoreParts } = scoreProduct(draft);

  const product: Product = {
    id: newProductId(),
    provider: parsed.provider,
    providerProductId: parsed.providerProductId,
    title,
    brand: sourceBrand || undefined,
    price: price || undefined,
    currency: currency || undefined,
    features,
    sourceFeatures: rawFeatures,
    images,
    sourceUrl: parsed.sourceUrl,
    affiliateUrl,
    market: parsed.market,
    disclosure:
      isInvolveLink(affiliateUrl)
        ? "Involve Asia. We may earn from qualifying purchases."
        : /^https:\/\/s\.shopee\./i.test(affiliateUrl)
          ? "Shopee Affiliate. We may earn from qualifying purchases."
        : parsed.provider === "amazon"
        ? "Amazon Associate. We may earn from qualifying purchases."
        : parsed.provider === "ebay"
          ? "eBay listing. Add your ePN campaign id in Programs when wired."
          : parsed.provider === "aliexpress"
            ? "AliExpress listing. Affiliate tracking is not tagged yet — keep the original URL."
            : parsed.provider === "tiktok-shop"
              ? "TikTok Shop listing. Creator affiliate commission stays on TikTok — keep this product URL in the caption."
              : undefined,
    score,
    scoreParts,
    createdAt: now,
    updatedAt: now,
    lastSyncedAt: now,
  };
  if (copyWarning) (product as Product & { copyWarning?: string }).copyWarning = copyWarning;
  return product;
}

export function scrapeLooksWeak(p: Product) {
  if (!p.images.length) return "No photos from the listing. Upload pack shots or the on-model still will fail.";
  if (/^(Amazon|Shopee|Tokopedia|Lazada|eBay|AliExpress|TikTok Shop)\s+[A-Z0-9.]+$/i.test(p.title) || /^https?:/i.test(p.title)) {
    return "Listing page blocked the scrape. Title is a fallback — edit the name and add photos.";
  }
  return "";
}

function keepLocalStill(url: string): { url: string; file: string; kind: "ok" | "logo" | "head"; bytes: number } | null {
  if (!url.startsWith("/api/media/")) return null;
  const file = mediaUrlToPath(url);
  if (!file || !fs.existsSync(file)) return null;
  const bytes = fs.statSync(file).size;
  return { url, file, kind: classifyProductStill(file), bytes };
}

export function tidyProductImages(product: Product): Product {
  return arrangeSkuImages(product);
}

function amazonImageStem(url: string) {
  const m = url.match(/\/images\/I\/([A-Za-z0-9+-]+)/i);
  return m ? m[1] : url.split("?")[0];
}

function uniqueRemoteImages(urls: string[]) {
  const seen = new Set<string>();
  const ranked = [...urls].sort((a, b) => {
    const score = (u: string) => (/_SL\d+/i.test(u) ? 0 : /hiRes|large/i.test(u) ? 1 : 2);
    return score(a) - score(b);
  });
  const out: string[] = [];
  for (const u of ranked) {
    const key = /media-amazon\.com\/images\/I\//i.test(u) ? amazonImageStem(u) : u.split("?")[0];
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u);
  }
  return out;
}

function imageReferer(src: string, listingUrl?: string) {
  if (/susercontent\.com|shopee\./i.test(src)) return "https://shopee.com.my/";
  if (/media-amazon\.com|ssl-images-amazon/i.test(src)) return listingUrl || "https://www.amazon.com/";
  return "https://www.google.com/";
}

function reattachLocalImages(product: Product): string[] {
  const locals = (product.images || []).filter((u) => u.startsWith("/api/media/"));
  const prefix = product.id.slice(0, 8);
  for (const a of listProductAssets()) {
    if (a.productId === product.id && a.url.startsWith("/api/media/") && !locals.includes(a.url)) {
      const file = mediaUrlToPath(a.url);
      if (file && fs.existsSync(file)) locals.push(a.url);
    }
  }
  const folder = path.join(dataRoot(), "media", "products");
  if (fs.existsSync(folder)) {
    for (const name of fs.readdirSync(folder)) {
      if (!name.startsWith(`${prefix}-`)) continue;
      const url = `/api/media/products/${name}`;
      if (!locals.includes(url)) locals.push(url);
    }
  }
  return locals.filter((u, i, a) => a.indexOf(u) === i);
}

let catalogAttached = false;

/** Attach photos that are already on disk. Ranking stays on import and the tidy action. */
export function ensureCatalogTidied() {
  if (catalogAttached) return;
  catalogAttached = true;
  const products = listProducts();
  const extras = new Map<string, string[]>();
  for (const asset of listProductAssets()) {
    if (!asset.productId || !asset.url.startsWith("/api/media/")) continue;
    const list = extras.get(asset.productId) || [];
    list.push(asset.url);
    extras.set(asset.productId, list);
  }
  const folder = path.join(dataRoot(), "media", "products");
  const byPrefix = new Map<string, string[]>();
  if (fs.existsSync(folder)) {
    for (const name of fs.readdirSync(folder)) {
      const prefix = name.slice(0, 8).toLowerCase();
      const list = byPrefix.get(prefix) || [];
      list.push(name);
      byPrefix.set(prefix, list);
    }
  }
  for (const product of products) {
    const listed = (product.images || []).filter((url) => url.startsWith("/api/media/"));
    // A SKU that already has local slides keeps that list. Sibling files from an older
    // regen or a removed slide must not reappear on the next server start.
    if (listed.length) continue;
    const locals = [...listed];
    const add = (url: string) => {
      if (locals.includes(url)) return;
      const file = mediaUrlToPath(url);
      if (file && fs.existsSync(file)) locals.push(url);
    };
    for (const url of extras.get(product.id) || []) add(url);
    for (const name of byPrefix.get(product.id.slice(0, 8).toLowerCase()) || []) add(`/api/media/products/${name}`);
    if (locals.length && locals.join("\n") !== listed.join("\n")) {
      upsertProduct({ ...product, images: locals, updatedAt: new Date().toISOString() });
    }
  }
}

function getFresh(id: string) {
  return listProducts().find((p) => p.id === id);
}

export async function repairRemoteCatalogImages(limit = 6) {
  const need = listProducts().filter((p) => {
    const locals = (p.images || []).filter((u) => u.startsWith("/api/media/"));
    const remotes = (p.images || []).filter((u) => /^https?:\/\//i.test(u));
    return remotes.length > 0 && locals.length === 0;
  });
  for (const p of need.slice(0, limit)) {
    try {
      await localizeProductImages(p);
    } catch {
      /* keep remotes */
    }
  }
}

export async function localizeProductImages(product: Product, max = 8): Promise<Product> {
  const locals = reattachLocalImages(product);
  const remote = uniqueRemoteImages(
    (product.images || []).filter((u) => /^https?:\/\//i.test(u) && !junkImage(u)),
  );
  const candidates: { url: string; file: string; kind: "ok" | "logo" | "head"; bytes: number }[] = [];
  for (const u of locals) {
    const hit = keepLocalStill(u);
    if (hit) candidates.push(hit);
  }
  const listing = product.sourceUrl || "https://www.amazon.com/";
  await Promise.all(
    remote.slice(0, max).map(async (src) => {
      try {
        const res = await fetch(src, {
          redirect: "follow",
          headers: {
            "User-Agent": BROWSER_UA,
            Accept: "image/avif,image/webp,image/*,*/*;q=0.8",
            Referer: imageReferer(src, listing),
          },
          signal: AbortSignal.timeout(12_000),
        });
        if (!res.ok) return;
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 2500) return;
        const ext = /\.png(\?|$)/i.test(src) ? "png" : /\.webp(\?|$)/i.test(src) ? "webp" : "jpg";
        const id = `${product.id.slice(0, 8)}-${randomBytesId()}`;
        const dest = productFile(id, ext);
        fs.writeFileSync(dest, buf);
        const imageUrl = productMediaUrl(id, ext);
        addProductAsset({ url: imageUrl, title: product.title, productId: product.id, source: "catalog" });
        candidates.push({
          url: imageUrl,
          file: dest,
          kind: classifyProductStill(dest),
          bytes: buf.length,
        });
      } catch {
        /* CDN blocked this file */
      }
    }),
  );
  const images = candidates.map((row) => row.url);
  if (!images.length) return product;
  return arrangeSkuImages({ ...product, images });
}

function randomBytesId() {
  return randomUUID().slice(0, 6);
}
