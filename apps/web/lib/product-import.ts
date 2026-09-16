import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { addProductAsset } from "./product-assets";
import { productFile, productMediaUrl } from "./paths";
import {
  affiliateUrlFor,
  newProductId,
  parseMarketplaceUrl,
  scoreProduct,
  getAmazonAssociateTag,
  upsertProduct,
  type Product,
} from "./products";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

function decode(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
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
      return {
        title: typeof p.name === "string" ? decode(p.name) : "",
        description: typeof p.description === "string" ? decode(p.description) : "",
        images,
        price: offer?.price ? String(offer.price) : "",
        currency: offer?.priceCurrency ? String(offer.priceCurrency) : "",
      };
    } catch {
      /* next block */
    }
  }
  return null;
}

function amazonImages(html: string) {
  const out: string[] = [];
  const push = (u: string) => {
    const url = u.replace(/_AC_.*?_\./, ".");
    if (!/^https?:\/\/.*amazon.*\/images\//i.test(url) && !/m\.media-amazon\.com/i.test(url)) return;
    if (!out.includes(url)) out.push(url);
  };
  for (const m of html.matchAll(/"hiRes"\s*:\s*"(https:[^"]+)"/g)) push(m[1].replace(/\\u002F/g, "/"));
  for (const m of html.matchAll(/"large"\s*:\s*"(https:[^"]+)"/g)) push(m[1].replace(/\\u002F/g, "/"));
  const land = html.match(/id="landingImage"[^>]+src="([^"]+)"/i) || html.match(/id="landingImage"[^>]+data-old-hires="([^"]+)"/i);
  if (land) push(land[1]);
  return out.slice(0, 6);
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
  return !t || /^amazon(\.com)?$/i.test(t) || /^amazon [A-Z0-9]{10}$/i.test(t) || /^https?:/i.test(t);
}

async function fetchListing(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
      },
      signal: AbortSignal.timeout(14_000),
      redirect: "follow",
    });
    if (res.ok) {
      const html = (await res.text()).slice(0, 600_000);
      const head = html.slice(0, 2500);
      if (html.length > 1500 && !/robot check|enter the characters|captcha/i.test(head)) return html;
    }
  } catch {
    /* marketplace often blocks datacenter IPs */
  }
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { Accept: "text/plain", "User-Agent": BROWSER_UA },
      signal: AbortSignal.timeout(18_000),
    });
    if (res.ok) return (await res.text()).slice(0, 200_000);
  } catch {
    /* no fallback */
  }
  return "";
}

function parseJinaMarkdown(md: string) {
  const title = md.match(/^Title:\s*(.+)$/m)?.[1]?.trim() || md.match(/^#\s+(.+)$/m)?.[1]?.trim() || "";
  const images = [...md.matchAll(/https?:\/\/[^\s)]+\.(?:jpg|jpeg|png|webp)/gi)].map((m) => m[0]).slice(0, 6);
  const desc = md.match(/^Description:\s*(.+)$/m)?.[1]?.trim() || "";
  return { title, images, desc };
}

export async function importProductFromUrl(raw: string): Promise<Product> {
  const parsed = parseMarketplaceUrl(raw);
  if (!parsed) throw new Error("Need a full product URL (Amazon / Shopee / Tokopedia / TikTok Shop / Lazada).");
  const tag = getAmazonAssociateTag();
  const affiliateUrl = affiliateUrlFor(parsed, tag);

  let title = "";
  let image = "";
  let extraImages: string[] = [];
  let description = "";
  let price = "";
  let currency = "";
  let bullets: string[] = [];
  const html = await fetchListing(parsed.sourceUrl);
  if (html) {
    const ld = jsonLdProduct(html);
    title = ld?.title || og(html, "og:title") || og(html, "twitter:title");
    if (!title) {
      const t = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      if (t) title = decode(t[1].replace(/\s+/g, " ").trim()).replace(/\s*:\s*Amazon\.com.*$/i, "");
    }
    const imgs = [...(ld?.images || []), ...amazonImages(html), og(html, "og:image"), og(html, "twitter:image")].filter(Boolean);
    image = imgs[0] || "";
    extraImages = imgs.slice(1, 6);
    description = ld?.description || og(html, "og:description") || og(html, "description");
    price = ld?.price || "";
    currency = ld?.currency || "";
    bullets = amazonBullets(html);
    if (junkTitle(title) || !image) {
      const jina = parseJinaMarkdown(html);
      if (junkTitle(title) && jina.title) title = jina.title;
      if (!image && jina.images[0]) {
        image = jina.images[0];
        extraImages = jina.images.slice(1);
      }
      if (!description && jina.desc) description = jina.desc;
    }
  }

  if (junkTitle(title)) title = titleFromAmazonSlug(parsed.sourceUrl) || title;
  if (junkTitle(title)) {
    title =
      parsed.provider === "amazon" && parsed.providerProductId !== "unknown"
        ? `Amazon ${parsed.providerProductId}`
        : parsed.provider === "shopee"
          ? `Shopee ${parsed.providerProductId}`
          : parsed.sourceUrl;
  }

  const features = (bullets.length ? bullets : description ? description.split(/[•\n|;]/) : [])
    .map((s) => s.trim())
    .filter((s) => s.length > 12)
    .slice(0, 8);

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

  return {
    id: newProductId(),
    provider: parsed.provider,
    providerProductId: parsed.providerProductId,
    title,
    brand: undefined,
    price: price || undefined,
    currency: currency || undefined,
    features,
    images,
    sourceUrl: parsed.sourceUrl,
    affiliateUrl,
    market: parsed.market,
    disclosure: parsed.provider === "amazon" ? "Amazon Associate. We may earn from qualifying purchases." : undefined,
    score,
    scoreParts,
    createdAt: now,
    updatedAt: now,
    lastSyncedAt: now,
  };
}

export function scrapeLooksWeak(p: Product) {
  if (!p.images.length) return "No photos from the listing. Upload pack shots or the on-model still will fail.";
  if (/^(Amazon|Shopee|Tokopedia|Lazada)\s+[A-Z0-9.]+$/i.test(p.title) || /^https?:/i.test(p.title)) {
    return "Listing page blocked the scrape. Title is a fallback — edit the name and add photos.";
  }
  return "";
}

export async function localizeProductImages(product: Product, max = 6): Promise<Product> {
  const locals: string[] = [];
  const remote: string[] = [];
  for (const u of product.images || []) {
    if (!u) continue;
    if (u.startsWith("/api/media/")) locals.push(u);
    else if (/^https?:\/\//i.test(u)) remote.push(u);
  }
  for (const src of remote.slice(0, max)) {
    try {
      const res = await fetch(src, {
        redirect: "follow",
        headers: { "User-Agent": BROWSER_UA, Accept: "image/*,*/*" },
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 800) continue;
      const ext = /\.png(\?|$)/i.test(src) ? "png" : /\.webp(\?|$)/i.test(src) ? "webp" : "jpg";
      const id = `${product.id.slice(0, 8)}-${randomUUID().slice(0, 6)}`;
      fs.writeFileSync(productFile(id, ext), buf);
      const imageUrl = productMediaUrl(id, ext);
      addProductAsset({ url: imageUrl, title: product.title, productId: product.id, source: "catalog" });
      locals.push(imageUrl);
    } catch {
      /* keep remote URL */
    }
  }
  const images = [...locals, ...remote].filter((u, i, a) => a.indexOf(u) === i).slice(0, 8);
  return upsertProduct({ ...product, images, updatedAt: new Date().toISOString() });
}
