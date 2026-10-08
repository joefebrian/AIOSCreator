import { randomUUID } from "node:crypto";
import { presentFact, type EvidenceFact } from "./fact-evidence";
import { affiliateCopyTarget, type AffiliateCopy } from "./affiliate-copy";
import { commitFactoryDb, readFactoryV2, type FactoryProduction } from "./ugc-factory-v2";
import { type CarouselDoc, type CarouselSlide, type SlideLayout, type SlideRole } from "./factory-carousel-layout";

export { SLIDE_H, SLIDE_LAYOUTS, SLIDE_W, type CarouselDoc, type CarouselSlide, type SlideBox, type SlideLayout, type SlideRole } from "./factory-carousel-layout";

const ROLE_LAYOUT: Record<SlideRole, SlideLayout> = {
  hook: "split-left",
  situation: "top-copy",
  detail: "detail",
  value: "split-right",
  cta: "cta",
};

const ROLES: SlideRole[] = ["hook", "situation", "detail", "value", "cta"];

const BANNED = /\b(i used|i have been|my skin|glowy|glowing|i am a fan|huge fan|this fixed|for two weeks)\b|\d+(?:\.\d+)?\s*%/i;

export type EligibleFact = { id: string; statement: string };
export type ProductMedia = { id: string; url: string };

export function eligibleSkuFacts(facts: EvidenceFact[], skuId: string): EligibleFact[] {
  return facts.filter((fact) => fact.skuId === skuId && presentFact(fact).eligible).map((fact) => ({ id: fact.id, statement: fact.statement }));
}

export function wrapText(value: string, width: number) {
  const words = value.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > width && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, 8);
}

export function parseCarouselCopy(raw: string, input: { media: ProductMedia[]; facts: EligibleFact[] }): { angle: string; caption: string; cta: string; slides: Omit<CarouselSlide, "id" | "previous">[] } {
  let parsed: { angle?: string; caption?: string; cta?: string; slides?: { role?: string; headline?: string; body?: string; mediaId?: string; factIds?: string[]; layout?: string }[] };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    throw new Error("The copy service returned an unreadable carousel. Nothing was saved.");
  }
  if (!Array.isArray(parsed.slides) || parsed.slides.length !== 5) throw new Error("The copy service did not return five slides. Nothing was saved.");
  const mediaIds = new Set(input.media.map((row) => row.id));
  const factIds = new Set(input.facts.map((row) => row.id));
  const slides = parsed.slides.map((slide, index) => {
    const role = ROLES[index];
    if (slide.role !== role) throw new Error(`Slide ${index + 1} must be ${role}. Nothing was saved.`);
    const headline = String(slide.headline || "").replace(/\s+/g, " ").trim();
    const body = String(slide.body || "").replace(/\s+/g, " ").trim();
    if (!headline || headline.length > 52) throw new Error(`Slide ${index + 1} needs a short headline. Nothing was saved.`);
    if (body.length > 140) throw new Error(`Slide ${index + 1} body is too long. Nothing was saved.`);
    if (!mediaIds.has(String(slide.mediaId || ""))) throw new Error(`Slide ${index + 1} names a photo that is not on this SKU. Nothing was saved.`);
    const used = (slide.factIds || []).map(String);
    if (used.some((id) => !factIds.has(id))) throw new Error(`Slide ${index + 1} cites a fact that is not eligible. Nothing was saved.`);
    const warnings: string[] = [];
    if (BANNED.test(`${headline} ${body}`)) warnings.push("This line adds a result or a personal testimonial. Edit it before you export.");
    const layout = (["split-left", "split-right", "top-copy", "detail", "cta"] as const).includes(slide.layout as SlideLayout) ? slide.layout as SlideLayout : ROLE_LAYOUT[role];
    return { role, headline, body, mediaId: String(slide.mediaId), layout, scale: 1, offsetX: 0, offsetY: 0, factIds: used, warnings };
  });
  return {
    angle: String(parsed.angle || "Product inspection").replace(/\s+/g, " ").trim().slice(0, 80),
    caption: String(parsed.caption || "").replace(/\s+/g, " ").trim().slice(0, 400),
    cta: String(parsed.cta || "See the listing").replace(/\s+/g, " ").trim().slice(0, 80),
    slides,
  };
}

export function fixtureCarousel(input: { productName: string; media: ProductMedia[]; market: string }): CarouselDoc {
  const photo = input.media[0];
  if (!photo) throw new Error("Choose a product photo before generating the carousel.");
  const ids = input.media.map((row) => row.id);
  const pick = (index: number) => ids[Math.min(index, ids.length - 1)];
  const slides: CarouselSlide[] = [
    ["hook", "The jar, up close.", "Same blue lid. Same white label.", "split-left"],
    ["situation", "Check it before you buy.", "A pad jar for everyday sink use.", "top-copy"],
    ["detail", "Read the front label.", "The name on the jar is Zero Pore Pad.", "detail"],
    ["value", "What the package shows.", "The label prints 70 pads in the jar.", "split-right"],
    ["cta", `See the ${input.market} listing.`, "The shop link stays with the post.", "cta"],
  ].map((row, index) => ({
    id: `slide-${index + 1}`,
    role: row[0] as SlideRole,
    headline: row[1],
    body: row[2],
    layout: row[3] as SlideLayout,
    mediaId: pick(index),
    scale: 1,
    offsetX: 0,
    offsetY: 0,
    factIds: [],
    warnings: [],
    previous: null,
  }));
  return {
    angle: "Look at the actual jar",
    caption: `${input.productName}. Five slides of the same jar. No result claim is added.`,
    cta: `See the ${input.market} listing.`,
    slides,
    modelId: null,
    fixture: true,
    affiliateUrl: null,
    direction: "",
    previous: null,
  };
}

export function copyPrompt(input: { productName: string; market: string; locale: string; direction: string; facts: EligibleFact[]; media: ProductMedia[] }) {
  return [
    `Product: ${input.productName}. Market ${input.market}. Language ${input.locale}.`,
    "Write one casual five-slide carousel. Do not invent a customer story, a result, or a price.",
    "Use only these eligible facts. If the list is empty, describe the product name and the photo, not a benefit.",
    `Facts: ${JSON.stringify(input.facts)}`,
    `Photos: ${JSON.stringify(input.media.map((row) => row.id))}`,
    input.direction ? `Direction: ${input.direction}` : "",
    'Return ONLY JSON {"angle":string,"caption":string,"cta":string,"slides":[{"role":"hook"|"situation"|"detail"|"value"|"cta","headline":string,"body":string,"mediaId":string,"factIds":string[],"layout":"split-left"|"split-right"|"top-copy"|"detail"|"cta"}]}',
    "Exactly five slides in that role order. Headline under 52 characters. Body under 140.",
  ].filter(Boolean).join("\n");
}

function docOf(value: FactoryProduction["carousel"]): CarouselDoc | null {
  if (!value || !Array.isArray(value.slides)) return null;
  return value as unknown as CarouselDoc;
}

export function readCarousel(productionId: string) {
  const db = readFactoryV2();
  const production = db.productions.find((row) => row.id === productionId);
  if (!production || production.planningMode !== "CAROUSEL") throw new Error("This is not a carousel draft.");
  return { db, production, carousel: docOf(production.carousel) };
}

export function saveCarouselSlide(productionId: string, expectedRevision: number, slideId: string, patch: Partial<Pick<CarouselSlide, "headline" | "body" | "mediaId" | "layout" | "scale" | "offsetX" | "offsetY">>) {
  const { db, production, carousel } = readCarousel(productionId);
  if (production.revision !== expectedRevision) throw new Error("This draft changed. Reload it before saving.");
  if (!carousel) throw new Error("Generate the carousel before editing a slide.");
  const slide = carousel.slides.find((row) => row.id === slideId);
  if (!slide) throw new Error("Slide not found.");
  if (patch.headline != null) slide.headline = patch.headline.replace(/\s+/g, " ").trim().slice(0, 52);
  if (patch.body != null) slide.body = patch.body.replace(/\s+/g, " ").trim().slice(0, 140);
  if (patch.mediaId != null) slide.mediaId = patch.mediaId;
  if (patch.layout != null) slide.layout = patch.layout;
  if (patch.scale != null) slide.scale = Math.min(1.3, Math.max(0.7, patch.scale));
  if (patch.offsetX != null) slide.offsetX = Math.max(-200, Math.min(200, Math.round(patch.offsetX)));
  if (patch.offsetY != null) slide.offsetY = Math.max(-200, Math.min(200, Math.round(patch.offsetY)));
  slide.warnings = BANNED.test(`${slide.headline} ${slide.body}`) ? ["This line adds a result or a personal testimonial. Edit it before you export."] : [];
  production.carousel = carousel as unknown as FactoryProduction["carousel"];
  production.revision += 1;
  production.updatedAt = new Date().toISOString();
  commitFactoryDb(db);
  return production;
}

export function storeCarousel(productionId: string, expectedRevision: number, carousel: CarouselDoc, jobMarket: string) {
  const db = readFactoryV2();
  const production = db.productions.find((row) => row.id === productionId);
  if (!production || production.planningMode !== "CAROUSEL") throw new Error("This is not a carousel draft.");
  if (production.revision !== expectedRevision) throw new Error("This draft changed. The carousel was not saved.");
  if (production.market !== jobMarket) throw new Error("This response belongs to another market. It was not saved.");
  const current = docOf(production.carousel);
  carousel.previous = current ? { ...current, previous: null } : null;
  carousel.slides = carousel.slides.map((slide) => ({ ...slide, id: slide.id || randomUUID() }));
  production.carousel = carousel as unknown as FactoryProduction["carousel"];
  production.carouselJob = null;
  production.revision += 1;
  production.updatedAt = new Date().toISOString();
  commitFactoryDb(db);
  return production;
}

export function beginCarouselJob(productionId: string, expectedRevision: number) {
  const db = readFactoryV2();
  const production = db.productions.find((row) => row.id === productionId);
  if (!production || production.planningMode !== "CAROUSEL") throw new Error("This is not a carousel draft.");
  if (production.revision !== expectedRevision) throw new Error("This draft changed. Reload it before generating.");
  if (production.carouselJob && production.carouselJob.revision === expectedRevision) return { production, started: false };
  production.carouselJob = { id: randomUUID(), revision: expectedRevision, market: production.market };
  commitFactoryDb(db);
  return { production, started: true };
}

export function clearCarouselJob(productionId: string) {
  const db = readFactoryV2();
  const production = db.productions.find((row) => row.id === productionId);
  if (!production) return;
  production.carouselJob = null;
  commitFactoryDb(db);
}

export function affiliateForSku(input: { skuId: string; market: string; listings: { id: string; skuId: string; market: string | null; sourceUrl: string; variantReview?: string }[]; destinations: { listingId: string; trackedUrl: string | null; nativeProductRef?: string | null; reviewState?: string; version?: number }[]; preferences: { skuId: string; market: string; listingId: string }[] }): AffiliateCopy {
  return affiliateCopyTarget({
    skuId: input.skuId,
    market: input.market,
    listings: input.listings.filter((row) => row.skuId === input.skuId).map((row) => ({ id: row.id, market: row.market, sourceUrl: row.sourceUrl, variantReview: row.variantReview })),
    destinations: input.destinations.map((row) => ({ listingId: row.listingId, trackedUrl: row.trackedUrl, nativeProductRef: row.nativeProductRef || null, reviewState: row.reviewState || "ACTIVE", version: row.version || 1 })),
    preferences: input.preferences,
  });
}
