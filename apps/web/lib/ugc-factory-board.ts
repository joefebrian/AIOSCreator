import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { dataRoot, ensureDataDirs, mediaUrlToPath } from "./paths";
import { menuAsset } from "./media-menu";
import { burnCaptionTimeline, burnStoryboardCard, concatSceneClips, holdStill, muxPictureAudio, pushPhoto } from "./ugc-factory-assemble";
import { attachSceneNarration } from "./factory-voice";
import { getFashionProject, listFashionProjects } from "./ugc-fashion";
import { skuIdentityUrl } from "./product-import";
import { AIOSCREATORS_AMAZON_TAG, getProduct, withAmazonTag } from "./products";
import { spokenProductName } from "./product-research";
import { FACTORY_SCRIPT_MODELS, factoryScriptLlm, generateBoardScript, generateBriefAngles, generateStoryboardPass } from "./llm";
import { jevBriefDecision, jevDuration } from "./jev";
import { FACTORY_RECIPES, recipeById, recipeCounts, type FactoryRecipe } from "./ugc-factory-recipes";
import { estimateSpokenSec, factoryFormatForRecipe, fitBeatMs, scriptPackFromApproved, spokenDurationFloorSec, variantDurationSec, BRIEF_MIN_SEC, BRIEF_MAX_SEC } from "./ugc-factory-pack";

export const FACTORY_MARKETS = [
  { id: "ID", label: "Indonesia", locale: "id-ID", currency: "IDR", tz: "Asia/Jakarta" },
  { id: "MY", label: "Malaysia", locale: "ms-MY", currency: "MYR", tz: "Asia/Kuala_Lumpur" },
  { id: "SG", label: "Singapore", locale: "en-SG", currency: "SGD", tz: "Asia/Singapore" },
  { id: "TH", label: "Thailand", locale: "th-TH", currency: "THB", tz: "Asia/Bangkok" },
  { id: "JP", label: "Japan", locale: "ja-JP", currency: "JPY", tz: "Asia/Tokyo" },
  { id: "US", label: "United States", locale: "en-US", currency: "USD", tz: "America/New_York" },
] as const;

export const FACTORY_PLATFORMS = ["META", "TIKTOK", "DEMAND_GEN", "SHOPEE"] as const;
export const SOURCE_CONNECTORS = ["shopee-id", "shopee-my", "shopee-sg", "shopee-th", "amazon-us", "aliexpress", "manual"] as const;

export const VARIANT_STAGES = [
  "DRAFT",
  "SCRIPT_REVIEW",
  "STORYBOARD_REVIEW",
  "READY_TO_PRODUCE",
  "IN_PRODUCTION",
  "OUTPUT_REVIEW",
  "READY_FOR_EXPORT",
  "EXPORTED",
] as const;

export type FactoryMarketId = (typeof FACTORY_MARKETS)[number]["id"];
export type FactoryPlatform = (typeof FACTORY_PLATFORMS)[number];
export type VariantStage = (typeof VARIANT_STAGES)[number];

export type FactoryConcept = {
  id: string;
  kind: "hook" | "presentation" | "angle";
  angle: string;
  hook: string;
  templateId: string;
  hypothesis: string;
  picked?: boolean;
};

export type FactoryScene = {
  id: string;
  index: number;
  goal: string;
  spoken: string;
  overlay: string;
  factIds: string[];
  targetMs: number;
  shot?: string;
  voiceover?: string;
};

export type FactoryScript = {
  id: string;
  revision: number;
  bibleVersion: "0.1";
  source: "planner" | "astra";
  model?: string;
  referenceIds: string[];
  spoken: string;
  scenes: FactoryScene[];
  cta: string;
  findings: { severity: "INFO" | "REVIEW" | "BLOCK"; code: string; message: string }[];
  approved: boolean;
};

export type FactoryVariant = {
  id: string;
  campaignId: string;
  name: string;
  revision: number;
  stage: VariantStage;
  attention?: string;
  templateId: string;
  market: FactoryMarketId;
  locale: string;
  platform: FactoryPlatform;
  placementStatus: "NEEDS_VERIFICATION";
  productId?: string;
  productTitle: string;
  sourceUrl: string;
  sourceConnector: string;
  destinationUrl: string;
  heroImage?: string;
  adHeroUrl?: string;
  referenceVideoUrl?: string;
  currency?: string;
  price?: string;
  offerIncluded: boolean;
  facts: { id: string; text: string; status: "EXTRACTED" | "CONFIRMED" }[];
  supplied: string[];
  talentSource?: "NEW" | "FASHION_LOOK" | "NONE";
  fashionProjectId?: string;
  fashionStillUrl?: string;
  reuseMode?: "USE_THIS_LOOK" | "SAME_TALENT_AND_OUTFIT" | "TALENT_ONLY";
  brief?: string;
  durationSec?: number;
  scriptModel?: string;
  concepts: FactoryConcept[];
  script?: FactoryScript;
  storyboardApproved: boolean;
  produceJobId?: string;
  outputUrl?: string;
  previewUrl?: string;
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
};

type Db = { variants: FactoryVariant[]; imports: { key: string; variantIds: string[] }[] };

function file() {
  ensureDataDirs();
  return path.join(dataRoot(), "db", "ugc-factory-board.json");
}

function readDb(): Db {
  const target = file();
  if (!fs.existsSync(target)) return { variants: [], imports: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(target, "utf8")) as Db;
    return {
      variants: Array.isArray(parsed.variants) ? parsed.variants : [],
      imports: Array.isArray(parsed.imports) ? parsed.imports : [],
    };
  } catch {
    return { variants: [], imports: [] };
  }
}

function writeDb(db: Db) {
  fs.writeFileSync(file(), JSON.stringify(db, null, 2));
}

export function listFactoryVariants() {
  return readDb().variants.filter((variant) => !variant.archived).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function factoryCatalog() {
  return {
    recipes: FACTORY_RECIPES,
    counts: recipeCounts(),
    markets: FACTORY_MARKETS,
    platforms: FACTORY_PLATFORMS,
    connectors: SOURCE_CONNECTORS,
    placementStatus: "NEEDS_VERIFICATION" as const,
    bibleVersion: "0.1",
    yappingRetrieval: "blocked" as const,
    providerDispatch: "blocked" as const,
    briefDuration: { min: BRIEF_MIN_SEC, max: BRIEF_MAX_SEC },
    scriptModels: [
      { id: "gpt-6-luna", label: "GPT-6 Luna" },
      { id: "gpt-6-sol", label: "GPT-6 Sol" },
      { id: "gpt-6.1-sol", label: "GPT-6.1 Sol" },
    ],
  };
}

function marketOf(id: string) {
  return FACTORY_MARKETS.find((market) => market.id === id);
}

function connectorFor(sourceUrl: string) {
  const host = sourceUrl.toLowerCase();
  if (host.includes("shopee.co.id")) return "shopee-id";
  if (host.includes("shopee.com.my")) return "shopee-my";
  if (host.includes("shopee.sg")) return "shopee-sg";
  if (host.includes("shopee.co.th")) return "shopee-th";
  if (host.includes("amazon.com")) return "amazon-us";
  if (host.includes("aliexpress")) return "aliexpress";
  if (host.includes("amazon.co.jp") || host.includes("shopee.jp")) return "unsupported-japan-source";
  return "manual";
}

function shopeeAllowed(market: FactoryMarketId, platform: FactoryPlatform) {
  if (platform !== "SHOPEE") return true;
  return market === "ID" || market === "MY" || market === "SG" || market === "TH";
}

export function readiness(recipe: FactoryRecipe, facts: { text: string }[], extras: Record<string, boolean>) {
  const missing = recipe.needs.filter((need) => {
    if (need === "photo") return !extras.photo;
    if (need === "talent") return !extras.talent;
    if (need === "evidence" || need === "test" || need === "before-after" || need === "comparison" || need === "screen" || need === "components" || need === "instructions" || need === "four-points" || need === "faq" || need === "comment-or-faq" || need === "wearable" || need === "voice" || need === "packaging") {
      return !extras[need];
    }
    return false;
  });
  if (!facts.length) missing.push("product-facts");
  const code = missing.length ? (missing.some((item) => ["evidence", "test", "before-after"].includes(item)) ? "MISSING_EVIDENCE" : "MISSING_ASSET") : "READY";
  return { code, missing };
}

function factsFromProduct(productId?: string, title?: string, featureText?: string) {
  const product = productId ? getProduct(productId) : undefined;
  const name = spokenProductName(product?.title || title || "Product");
  const facts: FactoryVariant["facts"] = [];
  if (product?.research?.whatItIs) facts.push({ id: "research:what", text: product.research.whatItIs, status: "CONFIRMED" });
  else facts.push({ id: "title", text: name, status: "EXTRACTED" });
  const features = product?.features?.length ? product.features : (featureText || "").split(/\n|•/).map((row) => row.trim()).filter(Boolean);
  features.slice(0, 6).forEach((feature, index) => facts.push({ id: `feature:${index + 1}`, text: feature, status: product?.research ? "CONFIRMED" : "EXTRACTED" }));
  return { product, name, facts };
}

export function createFactoryVariants(input: {
  name?: string;
  productId?: string;
  title?: string;
  sourceUrl?: string;
  destinationUrl?: string;
  markets: string[];
  platform: string;
  templateId: string;
  idempotencyKey?: string;
  talentSource?: FactoryVariant["talentSource"];
  fashionProjectId?: string;
  reuseMode?: FactoryVariant["reuseMode"];
  extras?: Record<string, boolean>;
  brief?: string;
}) {
  const db = readDb();
  const key = input.idempotencyKey?.trim();
  if (key) {
    const prev = db.imports.find((row) => row.key === key);
    if (prev) {
      return { variants: prev.variantIds.map((id) => db.variants.find((variant) => variant.id === id)).filter((row): row is FactoryVariant => Boolean(row)), duplicate: true };
    }
  }
  const recipe = recipeById(input.templateId);
  if (!recipe) return { error: "Unknown template.", code: "TEMPLATE" as const };
  const platform = FACTORY_PLATFORMS.includes(input.platform as FactoryPlatform) ? (input.platform as FactoryPlatform) : null;
  if (!platform) return { error: "Unknown platform.", code: "PLATFORM" as const };
  const markets = [...new Set(input.markets.map((market) => market.toUpperCase()))].filter((market): market is FactoryMarketId => Boolean(marketOf(market)));
  if (!markets.length) return { error: "Pick at least one market.", code: "MARKET" as const };
  const { product, name, facts } = factsFromProduct(input.productId, input.title);
  const sourceUrl = product?.sourceUrl || input.sourceUrl || "";
  const connector = connectorFor(sourceUrl);
  if (connector === "unsupported-japan-source") {
    return { error: "Japan as a content market does not add Amazon Japan or Shopee Japan.", code: "CONNECTOR" as const };
  }
  const fashion = input.fashionProjectId ? getFashionProject(input.fashionProjectId) : undefined;
  const now = new Date().toISOString();
  const campaignId = randomUUID();
  const made: FactoryVariant[] = [];
  for (const marketId of markets) {
    const market = marketOf(marketId)!;
    const allowed = shopeeAllowed(marketId, platform);
    const price = product?.price || "";
    const currency = (product?.currency || "").toUpperCase();
    const offerIncluded = Boolean(price && currency && currency === market.currency);
    const extras = {
      photo: Boolean(product?.images?.[0] || fashion?.approvedStillUrl),
      talent: input.talentSource === "FASHION_LOOK" || input.talentSource === "NEW" || recipe.family !== "talent",
      ...input.extras,
    };
    if (recipe.family === "talent" && input.talentSource !== "FASHION_LOOK" && input.talentSource !== "NEW") extras.talent = false;
    const check = readiness(recipe, facts, extras);
    const variant: FactoryVariant = {
      id: randomUUID(),
      campaignId,
      name: input.name?.trim() || name,
      revision: 1,
      stage: "DRAFT",
      templateId: recipe.id,
      market: marketId,
      locale: market.locale,
      platform,
      placementStatus: "NEEDS_VERIFICATION",
      productId: product?.id,
      productTitle: name,
      sourceUrl,
      sourceConnector: connector,
      destinationUrl: withAmazonTag(input.destinationUrl || product?.affiliateUrl || sourceUrl, AIOSCREATORS_AMAZON_TAG),
      heroImage: (product ? skuIdentityUrl(product) : "") || fashion?.approvedStillUrl,
      adHeroUrl: product?.referenceAds?.find((ad) => ad.heroUrl)?.heroUrl,
      referenceVideoUrl: product?.referenceAds?.find((ad) => ad.videoUrl)?.videoUrl,
      currency: currency || undefined,
      price: price || undefined,
      offerIncluded,
      facts,
      supplied: Object.entries(extras).filter(([, on]) => on).map(([key]) => key),
      talentSource: recipe.family === "faceless" ? "NONE" : input.talentSource || "NONE",
      fashionProjectId: fashion?.id,
      fashionStillUrl: fashion?.approvedStillUrl || fashion?.stillUrl,
      reuseMode: input.reuseMode,
      brief: input.brief?.trim() || undefined,
      concepts: [],
      storyboardApproved: false,
      createdAt: now,
      updatedAt: now,
    };
    const notes: string[] = [];
    if (!allowed) notes.push("Shopee is not a verified placement for this market.");
    if (check.code !== "READY") notes.push(`${check.code}: ${check.missing.join(", ")}`);
    if (price && currency && currency !== market.currency) notes.push(`Offer ${currency} omitted. It was not converted into ${market.currency}.`);
    if (!fashion?.approvedStillId && input.fashionProjectId) notes.push("Fashion look has no approved still.");
    if (notes.length) variant.attention = notes.join(" ");
    made.push(variant);
    db.variants.unshift(variant);
  }
  if (key) db.imports.unshift({ key, variantIds: made.map((variant) => variant.id) });
  writeDb(db);
  return { variants: made, duplicate: false, campaignId, mediaJobs: 0 };
}

const BANNED = [/i bought/i, /i've used/i, /for weeks/i, /customers say/i, /best seller/i, /#1/, /sold out/i, /guaranteed result/i];

export function generateFactoryConcepts(variantId: string, idempotencyKey: string) {
  const db = readDb();
  const variant = db.variants.find((row) => row.id === variantId);
  if (!variant) return { error: "not found" as const };
  const existing = db.imports.find((row) => row.key === idempotencyKey);
  if (existing) return { concepts: variant.concepts, duplicate: true, mediaJobs: 0 };
  const recipe = recipeById(variant.templateId);
  const hooks = ["Open on the product", "Open on the situation", "Open on a visible detail", "Open on the use"];
  const presentations = ["Show the package", "Show it in use", "Show one confirmed detail", "Show the close"];
  const angles = ["Why it fits a routine", "What is visibly included", "How it is used", "Who it is for, from the facts"];
  const concepts: FactoryConcept[] = [
    ...hooks.map((hook) => ({ id: randomUUID(), kind: "hook" as const, angle: angles[0], hook, templateId: variant.templateId, hypothesis: "Hook variation. Not a render." })),
    ...presentations.map((hook) => ({ id: randomUUID(), kind: "presentation" as const, angle: angles[1], hook, templateId: variant.templateId, hypothesis: "Presentation variation. Not a render." })),
    ...angles.map((angle) => ({ id: randomUUID(), kind: "angle" as const, angle, hook: hooks[0], templateId: variant.templateId, hypothesis: `${recipe?.name || "Template"} angle. Not a render.` })),
  ];
  variant.concepts = concepts;
  variant.updatedAt = new Date().toISOString();
  db.imports.unshift({ key: idempotencyKey, variantIds: [variant.id] });
  writeDb(db);
  return { concepts, duplicate: false, mediaJobs: 0, videos: 0 };
}

export function writeFactoryScript(variantId: string, instructions?: string) {
  const db = readDb();
  const variant = db.variants.find((row) => row.id === variantId);
  if (!variant) return { error: "not found" as const };
  if (variant.script?.approved) {
    return { error: "Approved script is frozen. Write a new revision instead.", code: "FROZEN" as const };
  }
  const recipe = recipeById(variant.templateId)!;
  const durationSec = variantDurationSec(variant);
  const missingDuration = durationMissing(recipe.family, durationSec);
  if (missingDuration) return { error: missingDuration, code: "DURATION" as const };
  const beats = recipe.family === "slideshow" ? recipe.beats.slice(0, 6) : recipe.beats;
  while (recipe.family === "slideshow" && beats.length < 6) beats.push("CTA");
  const findings: FactoryScript["findings"] = [];
  if (instructions && /ignore|skip the rules|bypass/i.test(instructions)) {
    findings.push({ severity: "INFO", code: "INSTRUCTION_IGNORED", message: "Additional instructions cannot turn off fact checks." });
  }
  const supplied = Object.fromEntries((variant.supplied || []).map((key) => [key, true]));
  const check = readiness(recipe, variant.facts, {
    photo: Boolean(variant.heroImage) || Boolean(supplied.photo),
    talent: variant.talentSource === "NEW" || variant.talentSource === "FASHION_LOOK" || Boolean(supplied.talent),
    ...supplied,
  });
  if (check.code !== "READY") findings.push({ severity: "BLOCK", code: check.code, message: `Missing ${check.missing.join(", ")}.` });
  if (variant.platform === "SHOPEE" && !["ID", "MY", "SG", "TH"].includes(variant.market)) {
    findings.push({ severity: "BLOCK", code: "PLACEMENT", message: "Shopee placement is not verified for this market." });
  }
  findings.push({ severity: "REVIEW", code: "PROFILE", message: "Placement profile is NEEDS_VERIFICATION. This is not a final export." });
  if (recipe.family === "faceless") findings.push({ severity: "REVIEW", code: "FACELESS", message: "A visible face on the final frames blocks approval." });
  const market = marketOf(variant.market)!;
  const offer = variant.offerIncluded && variant.price ? `${variant.price} ${variant.currency}` : "";
  if (variant.price && variant.currency && variant.currency !== market.currency) {
    findings.push({ severity: "INFO", code: "OFFER_OMITTED", message: `${variant.currency} was not converted to ${market.currency}.` });
  }
  const scenes: FactoryScene[] = beats.map((goal, index) => {
    const fact = variant.facts[Math.min(index, variant.facts.length - 1)];
    const spoken = recipe.family === "slideshow" ? "" : `${goal}. ${fact?.text || variant.productTitle}.`;
    return {
      id: randomUUID(),
      index: index + 1,
      goal,
      spoken,
      overlay: fact?.text || variant.productTitle,
      factIds: fact ? [fact.id] : [],
      targetMs: 0,
    };
  });
  const synced = recipe.family === "slideshow" ? durationSec : localSyncedDuration(durationSec, scenes.map((scene) => scene.spoken));
  if (recipe.family !== "slideshow" && !synced) return { error: "These lines need more than 30 seconds at a natural pace. Shorten a line, then write again.", code: "DURATION" as const };
  assignSceneTiming(recipe.family, synced, scenes);
  variant.durationSec = synced || durationSec;
  const spoken = scenes.map((scene) => scene.spoken).filter(Boolean).join(" ");
  if (BANNED.some((pattern) => pattern.test(spoken) || pattern.test(instructions || ""))) {
    findings.push({ severity: "BLOCK", code: "INVENTED_CLAIM", message: "The script cannot claim a personal history, ranking, or customer proof." });
  }
  const script: FactoryScript = {
    id: randomUUID(),
    revision: (variant.script?.revision || 0) + 1,
    bibleVersion: "0.1",
    source: "planner",
    referenceIds: [],
    spoken,
    scenes,
    cta: offer ? `See the listing. ${offer}.` : "See the listing.",
    findings,
    approved: false,
  };
  variant.script = script;
  variant.stage = findings.some((finding) => finding.severity === "BLOCK") ? "DRAFT" : "SCRIPT_REVIEW";
  variant.attention = findings.find((finding) => finding.severity === "BLOCK")?.message;
  variant.revision += 1;
  variant.updatedAt = new Date().toISOString();
  writeDb(db);
  return { variant, script, mediaJobs: 0, yappingRetrieval: "blocked" as const };
}

const MARKETPLACE = /\b(amazon|shopee|tokopedia|lazada|asin)\b/i;

function localeLanguage(locale: string) {
  if (locale === "id-ID") return "Indonesian";
  if (locale === "ms-MY") return "Malay, not Indonesian";
  if (locale === "th-TH") return "Thai";
  if (locale === "ja-JP") return "Japanese";
  if (locale === "en-SG") return "English for Singapore";
  return "English";
}

function scriptModelOf(value?: string) {
  return (FACTORY_SCRIPT_MODELS as readonly string[]).includes(value || "") ? value : undefined;
}

function durationMissing(family: string, durationSec: number) {
  if (family === "slideshow" || durationSec > 0) return "";
  return "Jev has not estimated a duration yet.";
}

function assignSceneTiming(family: string, durationSec: number, scenes: { spoken: string; targetMs: number }[]) {
  if (family === "slideshow") {
    scenes.forEach((scene) => { scene.targetMs = 0; });
    return;
  }
  const ms = fitBeatMs(durationSec, scenes.map((scene) => scene.spoken));
  scenes.forEach((scene, index) => { scene.targetMs = ms[index] || 0; });
}

function localSyncedDuration(stored: number, spoken: string[]) {
  const floor = spokenDurationFloorSec(spoken);
  if (floor > BRIEF_MAX_SEC) return 0;
  const minSec = Math.max(BRIEF_MIN_SEC, floor);
  return Math.min(BRIEF_MAX_SEC, Math.max(minSec, stored || minSec));
}

async function durationForLines(variant: { productTitle: string; market: string; platform: string; locale: string; brief?: string }, spoken: string[]) {
  const floor = spokenDurationFloorSec(spoken);
  if (floor > BRIEF_MAX_SEC) return { error: "These lines need more than 30 seconds at a natural pace. Shorten a line, then write again.", code: "DURATION" as const };
  const minSec = Math.max(BRIEF_MIN_SEC, floor || BRIEF_MIN_SEC);
  const naturalTotalSec = Math.round(spoken.reduce((sum, line) => sum + estimateSpokenSec(line || ""), 0) * 10) / 10;
  const durationSec = await jevDuration({
    minSec,
    maxSec: BRIEF_MAX_SEC,
    state: {
      product: spokenProductName(variant.productTitle),
      market: variant.market,
      platform: variant.platform,
      locale: variant.locale,
      brief: variant.brief || "",
      fitFloorSec: minSec,
      ceilingSec: BRIEF_MAX_SEC,
      naturalTotalSec,
      lines: spoken.map((line) => ({ spoken: line, naturalSec: Math.round(estimateSpokenSec(line || "") * 10) / 10 })),
    },
  });
  return { durationSec };
}

export async function writeFactoryBrief(variantId: string) {
  const db = readDb();
  const variant = db.variants.find((row) => row.id === variantId);
  if (!variant) return { error: "not found" as const };
  const recipe = recipeById(variant.templateId);
  if (!recipe) return { error: "template missing" as const };
  const angles = await generateBriefAngles({
    productName: spokenProductName(variant.productTitle),
    facts: variant.facts,
    recipeName: recipe.name,
    locale: `${variant.locale}. Write in ${localeLanguage(variant.locale)}.`,
    platform: variant.platform,
  });
  const criteria: Record<string, string> = {};
  angles.forEach((row, index) => {
    criteria[`a${index + 1}`] = `${row.hook} — ${row.angle}. ${row.why}`.slice(0, 500);
  });
  const decision = await jevBriefDecision({
    state: {
      product: spokenProductName(variant.productTitle),
      market: variant.market,
      platform: variant.platform,
      locale: variant.locale,
      recipe: recipe.name,
      floorSec: BRIEF_MIN_SEC,
      ceilingSec: BRIEF_MAX_SEC,
    },
    criteria,
  });
  const choice = decision.choice;
  const durationSec = decision.durationSec;
  const pickedIndex = Math.max(0, Number(choice.replace(/\D/g, "")) - 1);
  const picked = angles[pickedIndex] || angles[0];
  const fresh = readDb();
  const row = fresh.variants.find((item) => item.id === variantId);
  if (!row) return { error: "not found" as const };
  row.concepts = angles.map((angle, index) => ({
    id: randomUUID(),
    kind: "angle" as const,
    angle: angle.angle,
    hook: angle.hook,
    templateId: row.templateId,
    hypothesis: angle.why,
    picked: index === pickedIndex,
  }));
  row.brief = [picked.hook, picked.angle].filter(Boolean).join(" ").trim();
  row.durationSec = durationSec;
  row.updatedAt = new Date().toISOString();
  writeDb(fresh);
  return { variant: row, brief: row.brief, durationSec, choice, concepts: row.concepts, mediaJobs: 0, videos: 0 };
}

export async function writeFactoryScriptAstra(variantId: string, instructions?: string, modelOverride?: string) {
  const db = readDb();
  const variant = db.variants.find((row) => row.id === variantId);
  if (!variant) return { error: "not found" as const };
  if (variant.script?.approved) return { error: "Approved script is frozen. Write a new revision instead.", code: "FROZEN" as const };
  const recipe = recipeById(variant.templateId);
  if (!recipe) return { error: "template missing" as const };
  const beats = recipe.family === "slideshow" ? recipe.beats.slice(0, 6) : recipe.beats;
  while (recipe.family === "slideshow" && beats.length < 6) beats.push("CTA");
  const market = marketOf(variant.market)!;
  const offer = variant.offerIncluded && variant.price ? `${variant.price} ${variant.currency}` : "";
  const productName = spokenProductName(variant.productTitle);
  const durationSec = variantDurationSec(variant);
  const missingDuration = durationMissing(recipe.family, durationSec);
  if (missingDuration) return { error: missingDuration, code: "DURATION" as const };
  const scriptModel = scriptModelOf(modelOverride) || scriptModelOf(variant.scriptModel) || "gpt-6-luna";
  const note = instructions && !/ignore|skip the rules|bypass/i.test(instructions) ? instructions : "";
  const supplied = Object.fromEntries((variant.supplied || []).map((key) => [key, true]));
  const check = readiness(recipe, variant.facts, {
    photo: Boolean(variant.heroImage) || Boolean(supplied.photo),
    talent: variant.talentSource === "NEW" || variant.talentSource === "FASHION_LOOK" || Boolean(supplied.talent),
    ...supplied,
  });
  let draft = await generateBoardScript({
    productName,
    facts: variant.facts,
    recipeName: recipe.name,
    family: recipe.family,
    beats,
    locale: `${variant.locale}. Write in ${localeLanguage(variant.locale)}.`,
    platform: variant.platform,
    offer,
    durationSec,
    missingAssets: check.missing,
    chosenBrief: variant.brief,
    instructions: note,
  }, factoryScriptLlm(scriptModel));
  const blob = `${draft.hook} ${draft.cta} ${draft.scenes.map((scene) => `${scene.spoken || ""} ${scene.overlay || ""}`).join(" ")}`;
  if (MARKETPLACE.test(blob) || draft.scenes.length !== beats.length) {
    draft = await generateBoardScript({
      productName,
      facts: variant.facts,
      recipeName: recipe.name,
      family: recipe.family,
      beats,
      locale: `${variant.locale}. Write in ${localeLanguage(variant.locale)}. Previous draft failed. Remove marketplace words and return exactly ${beats.length} scenes.`,
      platform: variant.platform,
      offer,
      durationSec,
      missingAssets: check.missing,
      chosenBrief: variant.brief,
      instructions: note,
    }, factoryScriptLlm(scriptModel));
  }
  const findings: FactoryScript["findings"] = [];
  if (instructions && /ignore|skip the rules|bypass/i.test(instructions)) {
    findings.push({ severity: "INFO", code: "INSTRUCTION_IGNORED", message: "Additional instructions cannot turn off fact checks." });
  }
  const knownFacts = new Set(variant.facts.map((fact) => fact.id));
  const scenes: FactoryScene[] = beats.map((goal, index) => {
    const row = draft.scenes[index];
    const factIds = (row?.factIds || []).map(String).filter((id) => knownFacts.has(id));
    return {
      id: randomUUID(),
      index: index + 1,
      goal,
      spoken: recipe.family === "slideshow" ? "" : String(row?.spoken || draft.hook || "").trim(),
      overlay: String(row?.overlay || goal).trim(),
      factIds: factIds.length ? factIds : variant.facts[0] ? [variant.facts[0].id] : [],
      targetMs: 0,
    };
  });
  let syncedDuration = durationSec;
  if (recipe.family !== "slideshow") {
    let floor = spokenDurationFloorSec(scenes.map((scene) => scene.spoken));
    if (floor > BRIEF_MAX_SEC) {
      draft = await generateBoardScript({
        productName,
        facts: variant.facts,
        recipeName: recipe.name,
        family: recipe.family,
        beats,
        locale: `${variant.locale}. Write in ${localeLanguage(variant.locale)}. The previous lines need more than 30 seconds. Shorten every spoken line so together they finish in 30 seconds at a natural pace. Keep the same facts and the same ${beats.length} scenes.`,
        platform: variant.platform,
        offer,
        durationSec: BRIEF_MAX_SEC,
        missingAssets: check.missing,
        chosenBrief: variant.brief,
        instructions: note,
      }, factoryScriptLlm(scriptModel));
      scenes.forEach((scene, index) => {
        const row = draft.scenes[index];
        scene.spoken = String(row?.spoken || draft.hook || "").trim();
        scene.overlay = String(row?.overlay || scene.goal).trim();
      });
      floor = spokenDurationFloorSec(scenes.map((scene) => scene.spoken));
    }
    if (floor > BRIEF_MAX_SEC) return { error: "These lines need more than 30 seconds at a natural pace. Shorten a line, then write again.", code: "DURATION" as const };
    const decided = await durationForLines(variant, scenes.map((scene) => scene.spoken));
    if ("error" in decided) return decided;
    syncedDuration = decided.durationSec;
  }
  assignSceneTiming(recipe.family, syncedDuration, scenes);
  const spoken = `${draft.hook} ${scenes.map((scene) => scene.spoken).join(" ")} ${draft.cta}`;
  if (MARKETPLACE.test(spoken)) findings.push({ severity: "BLOCK", code: "MARKETPLACE", message: "The script still names a marketplace. Rewrite it before approval." });
  if (BANNED.some((pattern) => pattern.test(spoken))) findings.push({ severity: "BLOCK", code: "INVENTED_CLAIM", message: "The script claims a personal history, ranking, or customer proof." });
  if (!offer && variant.price && variant.currency && variant.currency !== market.currency && new RegExp(variant.price.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(spoken)) {
    findings.push({ severity: "BLOCK", code: "OFFER", message: `${variant.currency} ${variant.price} was spoken. It was not converted and is not this market's offer.` });
  }
  if (draft.scenes.length !== beats.length) findings.push({ severity: "REVIEW", code: "SCENE_COUNT", message: `The script model returned ${draft.scenes.length} scenes. The recipe needs ${beats.length}.` });
  if (check.missing.includes("packaging") && /kotak|buka paket|unbox|open the box|the box/i.test(spoken)) {
    findings.push({ severity: "BLOCK", code: "ASSUMED_PACKAGING", message: "The script opens a box, but no packaging photo is confirmed." });
  }
  if (check.code !== "READY") findings.push({ severity: "BLOCK", code: check.code, message: `Missing ${check.missing.join(", ")}.` });
  findings.push({ severity: "REVIEW", code: "PROFILE", message: "Placement profile is NEEDS_VERIFICATION. This is not a final export." });
  const script: FactoryScript = {
    id: randomUUID(),
    revision: (variant.script?.revision || 0) + 1,
    bibleVersion: "0.1",
    source: "astra",
    model: draft.model,
    referenceIds: [],
    spoken,
    scenes,
    cta: String(draft.cta || "See the listing.").replace(/https?:\/\/\S+/g, "").trim(),
    findings,
    approved: false,
  };
  const fresh = readDb();
  const row = fresh.variants.find((item) => item.id === variantId);
  if (!row) return { error: "not found" as const };
  if (row.script?.approved) return { error: "Approved script is frozen. Write a new revision instead.", code: "FROZEN" as const };
  script.revision = (row.script?.revision || 0) + 1;
  row.script = script;
  row.scriptModel = scriptModel;
  row.durationSec = syncedDuration;
  row.storyboardApproved = false;
  row.outputUrl = undefined;
  row.stage = findings.some((finding) => finding.severity === "BLOCK") ? "DRAFT" : "SCRIPT_REVIEW";
  row.attention = findings.find((finding) => finding.severity === "BLOCK")?.message;
  row.revision += 1;
  row.updatedAt = new Date().toISOString();
  writeDb(fresh);
  return { variant: row, script, durationSec: syncedDuration, mediaJobs: 0, yappingRetrieval: "blocked" as const, providerDispatch: "blocked" as const };
}

export function recheckFactoryScript(variantId: string) {
  const db = readDb();
  const variant = db.variants.find((row) => row.id === variantId);
  if (!variant?.script) return { error: "script missing" as const };
  const recipe = recipeById(variant.templateId);
  if (!recipe) return { error: "template missing" as const };
  const supplied = Object.fromEntries((variant.supplied || []).map((key) => [key, true]));
  const check = readiness(recipe, variant.facts, {
    photo: Boolean(variant.heroImage) || Boolean(supplied.photo),
    talent: variant.talentSource === "NEW" || variant.talentSource === "FASHION_LOOK" || Boolean(supplied.talent),
    ...supplied,
  });
  const spoken = `${variant.script.spoken} ${variant.script.cta}`;
  const findings = variant.script.findings.filter((finding) => finding.code !== "ASSUMED_PACKAGING");
  if (check.missing.includes("packaging") && /kotak|buka paket|unbox|open the box|the box/i.test(spoken)) {
    findings.unshift({ severity: "BLOCK", code: "ASSUMED_PACKAGING", message: "The script opens a box, but no packaging photo is confirmed." });
  }
  variant.script.findings = findings;
  variant.stage = findings.some((finding) => finding.severity === "BLOCK") ? "DRAFT" : variant.script.approved ? "STORYBOARD_REVIEW" : "SCRIPT_REVIEW";
  variant.attention = findings.find((finding) => finding.severity === "BLOCK")?.message;
  variant.updatedAt = new Date().toISOString();
  writeDb(db);
  return { variant, mediaJobs: 0 };
}

export function reopenFactoryScript(variantId: string) {
  const db = readDb();
  const variant = db.variants.find((row) => row.id === variantId);
  if (!variant?.script) return { error: "script missing" as const };
  variant.script.approved = false;
  variant.storyboardApproved = false;
  variant.outputUrl = undefined;
  variant.stage = "SCRIPT_REVIEW";
  variant.attention = "Brief changed. Write the script again.";
  variant.revision += 1;
  variant.updatedAt = new Date().toISOString();
  writeDb(db);
  return { variant };
}

export function approveFactoryScript(variantId: string, expectedRevision: number) {
  const db = readDb();
  const variant = db.variants.find((row) => row.id === variantId);
  if (!variant?.script) return { error: "script missing" as const };
  if (expectedRevision !== variant.revision) return { error: "revision conflict", code: "REVISION" as const, variant };
  if (variant.script.findings.some((finding) => finding.severity === "BLOCK")) return { error: "Blocked findings must be fixed first.", code: "BLOCK" as const };
  variant.script.approved = true;
  variant.stage = "STORYBOARD_REVIEW";
  variant.updatedAt = new Date().toISOString();
  writeDb(db);
  return { variant };
}

export async function writeStoryboardVisual(variantId: string) {
  const db = readDb();
  const variant = db.variants.find((row) => row.id === variantId);
  if (!variant?.script) return { error: "script missing" as const };
  if (variant.script.approved) return { error: "This script is already approved. Visualize the next script before approval.", code: "FROZEN" as const };
  const recipe = recipeById(variant.templateId);
  const scenes = variant.script.scenes.slice().sort((a, b) => a.index - b.index);
  const pass = await generateStoryboardPass({
    productName: spokenProductName(variant.productTitle),
    locale: `${variant.locale}. Write in ${localeLanguage(variant.locale)}.`,
    family: recipe?.family || "faceless",
    durationSec: variantDurationSec(variant),
    chosenBrief: variant.brief,
    scenes: scenes.map((scene) => ({ goal: scene.goal, spoken: scene.spoken, overlay: scene.overlay })),
  });
  if (pass.scenes.length < scenes.length) return { error: "Astra returned too few storyboard rows.", code: "SHORT" as const };
  const fresh = readDb();
  const row = fresh.variants.find((item) => item.id === variantId);
  if (!row?.script) return { error: "script missing" as const };
  if (row.script.approved) return { error: "This script is already approved. Visualize the next script before approval.", code: "FROZEN" as const };
  const saved = row.script.scenes.slice().sort((a, b) => a.index - b.index);
  saved.forEach((scene, index) => {
    const shot = String(pass.scenes[index]?.shot || "").replace(/\s+/g, " ").trim();
    const voiceover = String(pass.scenes[index]?.voiceover || "").replace(/\s+/g, " ").trim();
    if (shot) scene.shot = shot;
    if (voiceover) scene.voiceover = voiceover;
  });
  row.updatedAt = new Date().toISOString();
  writeDb(fresh);
  return { variant: row, mediaJobs: 0 };
}

export function approveStoryboard(variantId: string, expectedRevision: number) {
  const db = readDb();
  const variant = db.variants.find((row) => row.id === variantId);
  if (!variant?.script?.approved) return { error: "Approve the script first.", code: "SCRIPT" as const };
  if (expectedRevision !== variant.revision) return { error: "revision conflict", code: "REVISION" as const };
  variant.storyboardApproved = true;
  variant.stage = "READY_TO_PRODUCE";
  variant.updatedAt = new Date().toISOString();
  writeDb(db);
  return { variant, providerDispatch: "blocked" as const };
}

export { factoryFormatForRecipe, scriptPackFromApproved } from "./ugc-factory-pack";

/** One listing photo, the spoken lines, and the captions. No video model. */
export async function previewFactoryStill(variantId: string) {
  const db = readDb();
  const variant = db.variants.find((row) => row.id === variantId);
  if (!variant) return { error: "not found" as const };
  if (!variant.script?.approved) return { error: "Approve the script first.", code: "SCRIPT" as const };
  const src = mediaUrlToPath(variant.heroImage || "");
  if (!src || !fs.existsSync(src)) return { error: "The listing photo is missing.", code: "PHOTO" as const };
  const scenes = variant.script.scenes.slice().sort((a, b) => a.index - b.index).filter((scene) => (scene.targetMs || 0) >= 1000);
  if (!scenes.length) return { error: "The script has no timed scenes.", code: "SCRIPT" as const };
  const parts: string[] = [];
  const temps: string[] = [];
  try {
    for (const scene of scenes) {
      const seconds = (scene.targetMs || 0) / 1000;
      const held = menuAsset("ugc-factory", randomUUID(), "mp4");
      const burned = menuAsset("ugc-factory", randomUUID(), "mp4");
      const voiced = menuAsset("ugc-factory", randomUUID(), "mp4");
      temps.push(held.path, burned.path, voiced.path);
      await holdStill(src, seconds, held.path);
      await burnStoryboardCard(held.path, burned.path, { overlay: scene.overlay || "", spoken: scene.spoken || "" });
      await attachSceneNarration({
        clipPath: burned.path,
        dest: voiced.path,
        text: scene.spoken || "",
        locale: variant.locale,
        market: variant.market,
      });
      parts.push(voiced.path);
    }
    const joinedAudio = menuAsset("ugc-factory", randomUUID(), "mp4");
    await concatSceneClips(parts, joinedAudio.path);
    temps.push(joinedAudio.path);
    const totalSec = scenes.reduce((sum, scene) => sum + (scene.targetMs || 0) / 1000, 0);
    const moved = menuAsset("ugc-factory", randomUUID(), "mp4");
    const captioned = menuAsset("ugc-factory", randomUUID(), "mp4");
    temps.push(moved.path, captioned.path);
    await pushPhoto(src, totalSec, moved.path);
    let cursor = 0;
    const cues = scenes.map((scene) => {
      const start = cursor;
      cursor += (scene.targetMs || 0) / 1000;
      return { start, end: cursor, overlay: scene.overlay || "", spoken: scene.spoken || "" };
    });
    await burnCaptionTimeline(moved.path, captioned.path, cues);
    const joined = menuAsset("ugc-factory", randomUUID(), "mp4");
    await muxPictureAudio(captioned.path, joinedAudio.path, joined.path);
    for (const file of temps) fs.rmSync(file, { force: true });
    temps.length = 0;
    const fresh = readDb();
    const row = fresh.variants.find((item) => item.id === variantId);
    if (!row) return { error: "not found" as const };
    row.previewUrl = joined.url;
    row.revision += 1;
    row.updatedAt = new Date().toISOString();
    writeDb(fresh);
    return { variant: row, previewUrl: joined.url, mediaJobs: 0, videos: 0 };
  } finally {
    for (const file of temps) {
      if (!parts.includes(file)) fs.rmSync(file, { force: true });
    }
  }
}

export function queueFactoryProduction(variantId: string, expectedRevision: number) {
  const db = readDb();
  const variant = db.variants.find((row) => row.id === variantId);
  if (!variant) return { error: "not found" as const };
  if (variant.stage === "IN_PRODUCTION" && variant.produceJobId) {
    return { variant, jobId: variant.produceJobId, duplicate: true as const };
  }
  if (expectedRevision && expectedRevision !== variant.revision) return { error: "revision conflict", code: "REVISION" as const };
  if (!variant.script?.approved || !variant.storyboardApproved) return { error: "Approve the storyboard first.", code: "SCRIPT" as const };
  const formatId = factoryFormatForRecipe(variant.templateId);
  if (!formatId) return { error: "This template has no clip path yet.", code: "FORMAT" as const };
  const pack = scriptPackFromApproved(variant);
  if (!pack?.hook) return { error: "Approved script missing.", code: "SCRIPT" as const };
  if (!variant.productId || !getProduct(variant.productId)) return { error: "SKU missing.", code: "SKU" as const };
  const jobId = randomUUID();
  variant.produceJobId = jobId;
  variant.stage = "IN_PRODUCTION";
  variant.attention = undefined;
  variant.outputUrl = undefined;
  variant.revision += 1;
  variant.updatedAt = new Date().toISOString();
  writeDb(db);
  return { variant, jobId, duplicate: false as const, formatId, pack };
}

export function finishFactoryProduction(variantId: string, jobId: string, result: { ok: boolean; mediaUrl?: string; error?: string }) {
  const db = readDb();
  const variant = db.variants.find((row) => row.id === variantId);
  if (!variant || variant.produceJobId !== jobId) return;
  if (result.ok && result.mediaUrl) {
    variant.stage = "OUTPUT_REVIEW";
    variant.outputUrl = result.mediaUrl;
    variant.attention = undefined;
  } else {
    variant.stage = "READY_TO_PRODUCE";
    variant.produceJobId = undefined;
    variant.attention = (result.error || "The clip did not finish.").slice(0, 240);
  }
  variant.revision += 1;
  variant.updatedAt = new Date().toISOString();
  writeDb(db);
}

/** Jev estimates 10–30s from the brief and the current lines. Spoken words stay as they are. */
export async function applyJevDuration(variantId: string) {
  const db = readDb();
  const variant = db.variants.find((row) => row.id === variantId);
  if (!variant) return { error: "not found" as const };
  if (!variant.brief?.trim()) return { error: "Write the brief first.", code: "BRIEF" as const };
  const recipe = recipeById(variant.templateId);
  const scenes = variant.script?.scenes.slice().sort((a, b) => a.index - b.index) || [];
  const lines = scenes.map((scene) => ({
    spoken: scene.spoken || "",
    naturalSec: Math.round(estimateSpokenSec(scene.spoken || "") * 10) / 10,
  }));
  if (recipe?.family !== "slideshow") {
    const floor = spokenDurationFloorSec(lines.map((line) => line.spoken));
    if (floor > BRIEF_MAX_SEC) return { error: "These lines need more than 30 seconds at a natural pace. Shorten a line, then estimate again.", code: "DURATION" as const };
  }
  const decided = recipe?.family === "slideshow"
    ? { durationSec: Math.max(BRIEF_MIN_SEC, variantDurationSec(variant) || BRIEF_MIN_SEC) }
    : await durationForLines(variant, lines.map((line) => line.spoken));
  if ("error" in decided) return decided;
  const durationSec = decided.durationSec;
  const fresh = readDb();
  const row = fresh.variants.find((item) => item.id === variantId);
  if (!row) return { error: "not found" as const };
  const freshLines = (row.script?.scenes || []).slice().sort((a, b) => a.index - b.index).map((scene) => scene.spoken || "");
  if (freshLines.join("\n") !== lines.map((line) => line.spoken).join("\n")) {
    return { error: "The script changed while Jev was deciding. Estimate the seconds again.", code: "CHANGED" as const };
  }
  row.durationSec = durationSec;
  let retimed = false;
  if (row.script && !row.script.approved && recipe?.family !== "slideshow") {
    assignSceneTiming(recipe?.family || "faceless", durationSec, row.script.scenes.slice().sort((a, b) => a.index - b.index));
    retimed = true;
  }
  row.revision += 1;
  row.updatedAt = new Date().toISOString();
  writeDb(fresh);
  return { variant: row, durationSec, retimed, mediaJobs: 0, videos: 0 };
}

export function patchFactoryVariant(id: string, body: { name?: string; destinationUrl?: string; expectedRevision?: number; instructions?: string; scriptModel?: string }) {
  const db = readDb();
  const variant = db.variants.find((row) => row.id === id);
  if (!variant) return { error: "not found" as const };
  if (body.expectedRevision && body.expectedRevision !== variant.revision) return { error: "revision conflict", code: "REVISION" as const, variant };
  if (body.name) variant.name = body.name.trim() || variant.name;
  if (body.destinationUrl) {
    variant.destinationUrl = body.destinationUrl.trim();
    if (variant.script?.approved) {
      variant.script.approved = false;
      variant.stage = "SCRIPT_REVIEW";
      variant.attention = "Destination changed. The script needs another check.";
    }
  }
  const model = scriptModelOf(body.scriptModel);
  if (model) variant.scriptModel = model;
  if (body.instructions && /ignore|skip the rules|bypass/i.test(body.instructions)) {
    variant.attention = "Additional instructions were kept as notes. Fact checks stay on.";
  }
  variant.updatedAt = new Date().toISOString();
  writeDb(db);
  return { variant };
}

export function fashionLooksForFactory() {
  return listFashionProjects()
    .filter((project) => project.approvedStillId || project.approvedStillUrl)
    .slice(0, 12)
    .map((project) => ({ id: project.id, name: project.name, stillUrl: project.approvedStillUrl || project.stillUrl || "" }));
}
