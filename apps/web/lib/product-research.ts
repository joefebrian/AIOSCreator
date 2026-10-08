import type { Product } from "./products";

export type ProductResearch = {
  title: string;
  whatItIs: string;
  whatItIsNot: string;
  objectKind: "hardware" | "pack" | "garment" | "app" | "beauty" | "food" | "other";
  claims: string[];
  tokens: string[];
  forbidden: string[];
  source: "listing" | "llm";
  researchedAt: string;
};

const STOP = new Set(
  "with for and the from that this your you into over under onto a an of on in to by at as or is it its pack set kit amazon shopee tokopedia lazada adult female male fashion sneakers clothing".split(" "),
);

const HARDWARE =
  /\b(device|gadget|hardware|multitool|flipper|dongle|reader|rfid|nfc|screen protector|starter pack|bundle|pocket|pcb|firmware|usb|case)\b/i;
const GARMENT = /\b(dress|shirt|kurung|pajama|tote|bag|hoodie|bra|lingerie|tank ?top|sneaker|shoe|boot|gazelle)\b/i;
const APP = /\b(app|saas|software|subscription|chrome extension|meeting notes|transcription)\b/i;
const BEAUTY = /\b(serum|cream|skincare|makeup|lipstick|mascara|foundation|shampoo|moisturizer|sunscreen)\b/i;
const FOOD = /\b(snack|coffee|tea|supplement|vitamin|protein)\b/i;

function distinctiveTokens(title: string) {
  const words = title
    .split(/[^a-zA-Z0-9]+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 4 && !STOP.has(w.toLowerCase()));
  const out: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    const bi = `${words[i]} ${words[i + 1]}`;
    if (bi.length >= 8) out.push(bi);
  }
  for (const w of words) if (w.length >= 5) out.push(w);
  return [...new Set(out)].slice(0, 14);
}

function objectKindFromText(text: string): ProductResearch["objectKind"] {
  if (HARDWARE.test(text)) return /\b(pack|bundle|kit|protector)\b/i.test(text) ? "pack" : "hardware";
  if (GARMENT.test(text)) return "garment";
  if (BEAUTY.test(text)) return "beauty";
  if (FOOD.test(text)) return "food";
  if (APP.test(text)) return "app";
  return "other";
}

export function extractiveResearch(product: Product): ProductResearch {
  const blob = `${product.title} ${(product.features || []).join(" ")}`;
  const kind = objectKindFromText(blob);
  const tokens = distinctiveTokens(product.title);
  const claims = (product.features || []).map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 8);
  const not: string[] = [];
  if (kind === "hardware" || kind === "pack") {
    not.push("not a meeting-notes / transcription app", "not SaaS", "not a laptop AI that writes Slack summaries");
  }
  if (kind === "garment") not.push("not electronics", "not an app");
  if (kind === "app") not.push("not a physical gadget unless the listing says so");
  return {
    title: product.title,
    whatItIs: claims[0] ? `${product.title}. ${claims[0]}` : product.title,
    whatItIsNot: not.join("; ") || "do not invent a different category",
    objectKind: kind,
    claims,
    tokens,
    forbidden:
      kind === "hardware" || kind === "pack"
        ? ["meeting notes", "slack notification", "transcription", "generated in 4s", "one-hour meeting"]
        : [],
    source: "listing",
    researchedAt: new Date().toISOString(),
  };
}

/** Spoken / on-screen product name — no marketplace prefix. */
export function spokenProductName(title: string) {
  return title
    .replace(/^Amazon\.com\s*[|:]\s*/i, "")
    .replace(/^(Shopee|Tokopedia|Lazada)\s*[|:]\s*/i, "")
    .replace(/\s*[|:]\s*(Fashion Sneakers|Shoes|Clothing|Electronics|Beauty|Home).*$/i, "")
    .replace(/\b(Amazon|Shopee|Tokopedia|Lazada|Amazon\.com)\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function productScriptBrief(product: Product, research: ProductResearch, formatLine = "") {
  const price =
    product.price && Number(String(product.price).replace(/[^\d.]/g, "")) >= 8
      ? `${product.currency || ""} ${product.price}`.trim()
      : "(do not speak a price — listing price is missing or junk)";
  return [
    "PRODUCT RESEARCH — lock. This is the only SKU. Do not invent another product or category.",
    `Listing title (do not read this out): ${research.title}`,
    `Say this name in the hook (no marketplace): ${spokenProductName(research.title)}`,
    `What it is: ${research.whatItIs}`,
    `What it is NOT: ${research.whatItIsNot}`,
    `Object: ${research.objectKind}`,
    `ASIN/id: ${product.providerProductId}`,
    `URL: ${product.affiliateUrl || product.sourceUrl}`,
    `Price: ${price}`,
    `Listing claims (only these):`,
    ...research.claims.map((c) => `- ${c}`),
    `Tokens that MUST appear in the hook or title: ${research.tokens.slice(0, 8).join(", ") || research.title}`,
    formatLine ? `FORMAT: ${formatLine}` : "",
    research.objectKind === "hardware" || research.objectKind === "pack"
      ? "proof-first / screen-record for this SKU = the physical device or pack in frame, not a random laptop SaaS demo."
      : "",
    "HOOK names the product as a person would — adidas Gazelle Indoor, not “Amazon adidas HQ8717…”. Never say Amazon, Shopee, Tokopedia, marketplace, or the ASIN in spoken lines. CTA can say link in bio / link below.",
    "Copy brand logos from the listing photos. Spell the brand exactly. Do not invent extra letters (not adidaas).",
  ]
    .filter(Boolean)
    .join("\n");
}

export function assertProductLock(pack: { title?: string; hook?: string; firstFrame?: string; hookVisual?: string; voiceover?: string; cta?: string }, research: ProductResearch) {
  const blob = `${pack.title || ""} ${pack.hook || ""} ${pack.firstFrame || ""} ${pack.hookVisual || ""} ${pack.voiceover || ""} ${pack.cta || ""}`.toLowerCase();
  const hit = research.tokens.some((t) => t.length >= 5 && blob.includes(t.toLowerCase()));
  if (!hit) {
    throw new Error(`Script drifted off SKU “${research.title}”. Hook/title must name the product. Write again.`);
  }
  for (const phrase of research.forbidden) {
    if (phrase && blob.includes(phrase.toLowerCase())) {
      throw new Error(`Script invented “${phrase}” — that is not this SKU (${research.title}).`);
    }
  }
}

export const PRODUCT_RESEARCH_SYSTEM = `You extract SKU facts for UGC. Return ONLY JSON:
{"whatItIs":string,"whatItIsNot":string,"objectKind":"hardware"|"pack"|"garment"|"app"|"beauty"|"food"|"other","claims":string[],"forbidden":string[]}
Use only the listing. claims = listing bullets, no new specs. whatItIsNot = wrong categories (e.g. a Flipper Zero pack is not a meeting-notes app). forbidden = phrases a confused writer might invent.`;
