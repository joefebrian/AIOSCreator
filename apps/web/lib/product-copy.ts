import { logCloudUsage } from "./cloud-usage";
import { openRouterTidyConfig } from "./llm";
import { getProduct, patchProduct, type Product } from "./products";

const SHOP_LINE =
  /welcome to (our|the) store|follow (us|for)|coupon|5-star|five-star|before ordering|fast chat|bulk discount|lowest price|cash on delivery|\bcod\b|report damaged|restock in|new items added|inspected before shipping|free shipping|free returns|wide selection|add to cart|shop now|klik di sini|chat\s*9|gratis ongkir|cashback|cek review|harga murah|pilihan terbaru|^buy\b|^beli\b/i;

const META_LINE =
  /\b(title:|bullets:|user safety|we need to|let me|do not invent|each line should|return json|the rules|as a fact|json only|make sure each|script lines|the rule|we must)\b/i;

const GROUND_STOP = new Set(
  "this that with from your have been were they them into over under about women womens woman item product listing designed comes include includes available made".split(" "),
);

const MARKET =
  /\b(amazon|shopee|tokopedia|lazada|asin|marketplace)\b/i;

/** Listing text still has &#x27; and bare &amp from the scrape. */
export function decodeListingText(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => codePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num: string) => codePoint(Number(num)))
    .replace(/&amp;?/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function codePoint(code: number) {
  if (!Number.isFinite(code) || code < 32 || code > 0x10ffff) return "";
  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

function cleanLine(value: string) {
  return decodeListingText(value)
    .replace(/^[\s•\-–—*✔📌✨💖⭐☆]+/u, "")
    .replace(/\s+/g, " ")
    .trim();
}

function numberTokens(value: string) {
  return [...value.matchAll(/\d+(?:[.,]\d+)?/g)].map((match) => match[0].replace(/[.,]/g, ""));
}

/** Drop shop spam. Keep a sentence from the title when the bullets say nothing about the product. */
export function fallbackListingLines(title: string, features: string[]) {
  const name = decodeListingText(title);
  const lines = features.map(cleanLine).filter((line) => line.length > 12 && !SHOP_LINE.test(line) && !MARKET.test(line));
  const unique = [...new Set(lines)].slice(0, 6);
  if (unique.length) return unique;
  if (name.length > 12) return [name.replace(/\s*[|/].*$/, "").trim() || name];
  return [];
}

function grounded(line: string, source: string) {
  const words = line
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 4 && !GROUND_STOP.has(word));
  if (!words.length) return false;
  const blob = source.toLowerCase();
  const hits = words.filter((word) => blob.includes(word)).length;
  return hits >= Math.min(2, words.length) || hits / words.length >= 0.5;
}

function dedupeLines(lines: string[]) {
  const kept: string[] = [];
  for (const line of lines) {
    const words = new Set(line.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3));
    const duplicate = kept.some((prev) => {
      const other = new Set(prev.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3));
      if (!words.size || !other.size) return false;
      let shared = 0;
      for (const word of words) if (other.has(word)) shared += 1;
      return shared / Math.min(words.size, other.size) > 0.8;
    });
    if (!duplicate) kept.push(line);
  }
  return kept;
}

function acceptLines(raw: string[], source: string) {
  const allowed = new Set(numberTokens(source));
  const lines: string[] = [];
  for (const row of raw) {
    const line = cleanLine(row).replace(/^["']+|["']+$/g, "");
    if (line.length < 12 || line.length > 220) continue;
    if (/[{}]/.test(line) || /\.{3,}\s*$/.test(line)) continue;
    if (SHOP_LINE.test(line) || MARKET.test(line) || META_LINE.test(line)) continue;
    if ((line.match(/\?/g) || []).length >= 2) continue;
    const numbers = numberTokens(line);
    if (numbers.some((token) => !allowed.has(token))) continue;
    if (!grounded(line, source)) continue;
    const listingIsIndonesian = (source.match(/\b(wanita|pria|empuk|tebal|selop|untuk|dengan|bahan)\b/gi) || []).length >= 2;
    if (listingIsIndonesian && !/\b(wanita|pria|empuk|tebal|selop|cocok|bahan|untuk|dengan|hadir|sol)\b/i.test(line)) continue;
    if (!lines.includes(line)) lines.push(line);
    if (lines.length >= 6) break;
  }
  return dedupeLines(lines);
}

function linesFromModel(text: string, source: string) {
  const fenced = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const json = fenced.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as { lines?: unknown };
    const rows = Array.isArray(parsed.lines)
      ? parsed.lines.map((row) => String(row))
      : typeof parsed.lines === "string"
        ? parsed.lines.split(/\n+/)
        : [];
    return acceptLines(rows, source);
  } catch {
    return [];
  }
}

function safeError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/sk-[A-Za-z0-9_-]+/g, "sk-…").replace(/EAA[A-Za-z0-9]+/g, "").slice(0, 180);
}

/** Rewrite listing bullets into short script facts. Facts must already be in the title or bullets. */
export async function tidyListingCopy(input: { title: string; features: string[] }) {
  const title = decodeListingText(input.title);
  const features = input.features.map(cleanLine).filter((line) => line.length > 8).slice(0, 12);
  const source = [title, ...features].filter(Boolean).join("\n");
  if (source.length < 12) return [];
  const cfg = openRouterTidyConfig();
  const messages = [
    {
      role: "system" as const,
      content: `You turn a marketplace listing into script facts for a short UGC video. Return JSON only: {"lines":["..."]}
Rules:
- 3 to 6 short sentences a writer can hand to a script. One fact per line.
- Use ONLY facts in the title and bullets. Do not invent materials, sizes, colors, prices, results, awards, or what is in the box.
- Drop shop talk: welcomes, coupons, star ratings, chat hours, COD, shipping slogans, "before you order".
- If the bullets are only shop talk, write the facts that are actually in the title.
- Keep a buyer rule when the listing states it: blind box, hidden figure, or what a whole set includes.
- Copy materials the way the listing labels them. Shell, stuffing, and magnet stay separate facts.
- Same language as the listing. No emoji, hashtags, or buy-now lines.
- Do not mention Amazon, Shopee, Tokopedia, Lazada, or an ASIN.
- Do not explain your reasoning. The JSON is the whole answer.
Example: title "High Waist Tummy Control Seamless Yoga Jumpsuit", bullets "Welcome to our store". Output {"lines":["This is a high-waist seamless yoga jumpsuit.","It is made for tummy control and worn as workout clothing."]}`,
    },
    { role: "user" as const, content: `Title: ${title}\n\nBullets:\n${features.map((line) => `- ${line}`).join("\n") || "- (none)"}` },
  ];
  const model = "deepseek/deepseek-v4-flash";
  let lastError = "OpenRouter returned nothing usable from this listing.";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${cfg.baseURL.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.apiKey}`,
          "Content-Type": "application/json",
          ...(cfg.headers || {}),
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 400,
          response_format: { type: "json_object" },
          messages,
        }),
        signal: AbortSignal.timeout(25_000),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`${res.status} ${errText.slice(0, 140)}`);
      }
      const payload = (await res.json()) as {
        choices?: { message?: { content?: string | null } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const text = (payload.choices?.[0]?.message?.content || "").trim();
      const tokens = (payload.usage?.prompt_tokens || 0) + (payload.usage?.completion_tokens || 0);
      const lines = linesFromModel(text, source);
      logCloudUsage({
        at: new Date().toISOString(),
        accountId: "openrouter",
        providerId: "openrouter",
        model,
        ok: lines.length > 0,
        ms: 0,
        baseURL: cfg.baseURL,
        kind: "product-copy",
        tokens,
        units: tokens,
        unit: "token",
        actualUsd: 0,
        error: lines.length ? undefined : "empty lines",
      });
      if (lines.length) return lines;
      lastError = "OpenRouter returned nothing usable from this listing.";
    } catch (err) {
      lastError = safeError(err);
      logCloudUsage({
        at: new Date().toISOString(),
        accountId: "openrouter",
        providerId: "openrouter",
        model,
        ok: false,
        ms: 0,
        baseURL: cfg.baseURL,
        kind: "product-copy",
        actualUsd: 0,
        error: lastError,
      });
    }
  }
  throw new Error(lastError);
}

function sameLines(a: string[], b: string[]) {
  return a.map((line) => line.trim()).join("\n") === b.map((line) => line.trim()).join("\n");
}

/** Save script-ready lines on the SKU. Listing bullets stay in sourceFeatures so Tidy can run again. */
export async function tidyStoredProduct(id: string, draft?: { title?: string; features?: string[] }) {
  const product = getProduct(id);
  if (!product) throw new Error("product not found");
  const storedTitle = decodeListingText(product.title);
  const contextTitle = decodeListingText(draft?.title?.trim() || product.title);
  const saved = (product.features || []).map(cleanLine).filter(Boolean);
  const incoming = (draft?.features || []).map(cleanLine).filter(Boolean);
  const edited = incoming.length > 0 && !sameLines(incoming, saved);
  const source = (edited ? incoming : product.sourceFeatures?.length ? product.sourceFeatures : saved)
    .map(cleanLine)
    .filter((line) => line.length > 8)
    .slice(0, 12);
  const usableTitle = /^untitled sku$/i.test(contextTitle) ? "" : contextTitle;
  if (usableTitle.length < 8 && !source.length) throw new Error("Add a name or a few listing lines first.");
  const lines = await tidyListingCopy({ title: usableTitle, features: source });
  const patch: Partial<Product> = {
    title: storedTitle,
    features: lines,
    sourceFeatures: source.length ? source : lines,
  };
  if (product.research) {
    patch.research = {
      ...product.research,
      title: storedTitle,
      claims: lines,
      researchedAt: new Date().toISOString(),
    };
  }
  const next = patchProduct(id, patch);
  if (!next) throw new Error("product not found");
  return next;
}
