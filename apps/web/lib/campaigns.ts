import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { CAMPAIGN_ANGLE_SET } from "./campaign-angles";
import { listCharactersLite } from "./characters";
import { MARKETS as CAMPAIGN_MARKETS, productMarketId, type MarketId } from "./markets";
import { dataRoot, ensureDataDirs } from "./paths";
import { skuIdentityUrl } from "./product-import";
import { listProducts } from "./products";
import { mediaFileExists } from "./media-menu";
import { listJobs } from "./store";
import { createFactoryVariants, listFactoryVariants } from "./ugc-factory-board";

export { CAMPAIGN_MARKETS };

export const CAMPAIGN_PLATFORMS = ["TikTok", "YouTube", "Instagram", "Shopee"] as const;

export const EXPERIMENT_VARIABLES = ["hook", "character", "duration"] as const;

export type CampaignMarket = MarketId;
export type CampaignPlatform = (typeof CAMPAIGN_PLATFORMS)[number];
export type ExperimentVariable = (typeof EXPERIMENT_VARIABLES)[number];

export type Campaign = {
  id: string;
  name: string;
  productIds: string[];
  characterIds: string[];
  market: CampaignMarket;
  platform: CampaignPlatform | "";
  angle: string;
  createdAt: string;
  updatedAt: string;
};

export type Experiment = {
  id: string;
  campaignId: string;
  variable: ExperimentVariable;
  note: string;
  createdAt: string;
};

type Store = { campaigns: Campaign[]; experiments: Experiment[] };

function filePath() {
  ensureDataDirs();
  return path.join(dataRoot(), "db", "campaigns.json");
}

function cleanList(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of value) {
    const id = String(item || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function readStore(): Store {
  const file = filePath();
  if (!fs.existsSync(file)) return { campaigns: [], experiments: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Store;
    return {
      campaigns: Array.isArray(raw.campaigns) ? raw.campaigns : [],
      experiments: Array.isArray(raw.experiments) ? raw.experiments : [],
    };
  } catch {
    return { campaigns: [], experiments: [] };
  }
}

function writeStore(store: Store) {
  fs.writeFileSync(filePath(), JSON.stringify(store, null, 2), "utf8");
}

function clipText(value: unknown, max: number) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
}

function asMarket(value: unknown): CampaignMarket {
  const id = String(value || "").trim().toUpperCase();
  const row = CAMPAIGN_MARKETS.find((market) => market.id === id);
  if (!row) throw new Error("Pick a market.");
  return row.id;
}

function asPlatform(value: unknown, keep = ""): CampaignPlatform | "" {
  const kept = (CAMPAIGN_PLATFORMS as readonly string[]).includes(keep) ? (keep as CampaignPlatform) : "";
  if (value === undefined || value === null || String(value).trim() === "") return kept;
  const label = String(value).trim();
  const row = CAMPAIGN_PLATFORMS.find((platform) => platform === label);
  if (!row) throw new Error("Pick a platform.");
  return row;
}

function asAngle(value: unknown, keep = "") {
  const text = clipText(value, 80);
  if (CAMPAIGN_ANGLE_SET.has(text)) return text;
  if (text && text === keep) return text;
  throw new Error("Pick an angle.");
}

function asVariable(value: unknown): ExperimentVariable {
  const id = String(value || "").trim().toLowerCase();
  const row = EXPERIMENT_VARIABLES.find((variable) => variable === id);
  if (!row) throw new Error("Pick one variable.");
  return row;
}

function assignment(input: { name?: unknown; productIds?: unknown; characterIds?: unknown; market?: unknown; platform?: unknown; angle?: unknown }, keep?: { platform?: string; angle?: string }) {
  const name = clipText(input.name, 64);
  if (!name) throw new Error("Name the campaign.");
  const market = asMarket(input.market);
  const products = listProducts();
  const knownProducts = cleanList(input.productIds).filter((id) => products.some((product) => product.id === id));
  if (!knownProducts.length) throw new Error("Pick a SKU from the catalog.");
  const productIds = knownProducts.filter((id) => productMarketId(products.find((product) => product.id === id) || { sourceUrl: "" }) === market);
  if (productIds.length !== knownProducts.length) throw new Error("Choose a SKU from this country.");
  const characters = listCharactersLite();
  const knownCharacters = cleanList(input.characterIds).filter((id) => characters.some((character) => character.id === id));
  const characterIds = knownCharacters.filter((id) => (characters.find((character) => character.id === id)?.markets || []).includes(market));
  if (characterIds.length !== knownCharacters.length) throw new Error("Set that character's country to this market.");
  return {
    name,
    productIds,
    characterIds,
    market,
    platform: asPlatform(input.platform, keep?.platform || ""),
    angle: asAngle(input.angle, keep?.angle || ""),
  };
}

export function createCampaign(input: Parameters<typeof assignment>[0]) {
  const store = readStore();
  const now = new Date().toISOString();
  const campaign: Campaign = { id: randomUUID(), ...assignment(input), createdAt: now, updatedAt: now };
  store.campaigns.unshift(campaign);
  writeStore(store);
  return campaign;
}

export function updateCampaign(id: string, input: Parameters<typeof assignment>[0]) {
  const store = readStore();
  const campaign = store.campaigns.find((row) => row.id === id);
  if (!campaign) throw new Error("Campaign not found.");
  Object.assign(campaign, assignment(input, { platform: campaign.platform, angle: campaign.angle }), { updatedAt: new Date().toISOString() });
  writeStore(store);
  return campaign;
}

export function removeCampaign(id: string) {
  const store = readStore();
  const before = store.campaigns.length;
  store.campaigns = store.campaigns.filter((row) => row.id !== id);
  if (store.campaigns.length === before) throw new Error("Campaign not found.");
  store.experiments = store.experiments.filter((row) => row.campaignId !== id);
  writeStore(store);
}

export function addExperiment(campaignId: string, variable: unknown, note: unknown) {
  const store = readStore();
  if (!store.campaigns.some((row) => row.id === campaignId)) throw new Error("Campaign not found.");
  const experiment: Experiment = {
    id: randomUUID(),
    campaignId,
    variable: asVariable(variable),
    note: clipText(note, 160),
    createdAt: new Date().toISOString(),
  };
  store.experiments.unshift(experiment);
  writeStore(store);
  return experiment;
}

function factoryPlatform(platform: string) {
  if (platform === "Instagram") return "META";
  if (platform === "YouTube") return "DEMAND_GEN";
  if (platform === "Shopee") return "SHOPEE";
  return "TIKTOK";
}

export function sendCampaignSelection(id: string) {
  const campaign = readStore().campaigns.find((row) => row.id === id);
  if (!campaign) throw new Error("Campaign not found.");
  if (!campaign.productIds.length) throw new Error("Pick a SKU first.");
  const platform = factoryPlatform(campaign.platform);
  const sent: { id: string; productId: string; duplicate: boolean }[] = [];
  for (const productId of campaign.productIds) {
    const result = createFactoryVariants({
      productId,
      markets: [campaign.market],
      platform,
      templateId: "F03",
      talentSource: "NONE",
      extras: { talent: false },
      idempotencyKey: `commerce-campaign:${campaign.id}:${productId}:${campaign.market}:${platform}:${campaign.angle}`,
      brief: campaign.angle ? `Format: ${campaign.angle}` : undefined,
    });
    if ("error" in result && result.error) throw new Error(result.error);
    for (const variant of result.variants) sent.push({ id: variant.id, productId: variant.productId || productId, duplicate: Boolean(result.duplicate) });
  }
  return { sent, platform, characters: campaign.characterIds };
}

export function removeExperiment(id: string) {
  const store = readStore();
  const before = store.experiments.length;
  store.experiments = store.experiments.filter((row) => row.id !== id);
  if (store.experiments.length === before) throw new Error("Experiment not found.");
  writeStore(store);
}

function stageLabel(stage: string) {
  const words = stage.toLowerCase().split("_").filter(Boolean);
  if (!words.length) return stage;
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

export function campaignBoard() {
  const store = readStore();
  const products = listProducts();
  const characters = listCharactersLite();
  const productById = new Map(products.map((product) => [product.id, product]));
  const characterById = new Map(characters.map((character) => [character.id, character]));
  const jobs = listJobs();
  const variants = listFactoryVariants();

  const campaigns = store.campaigns
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((campaign) => {
      const ids = new Set(campaign.productIds);
      const related = jobs.filter((job) => job.productId && ids.has(job.productId));
      const stills = related
        .filter((job) => job.kind === "image" && job.status === "completed" && job.mediaUrl && mediaFileExists(job.mediaUrl, job.mediaPath))
        .slice(0, 24)
        .map((job) => ({ id: job.id, url: job.mediaUrl as string, createdAt: job.createdAt, source: job.source || "" }));
      const clips = related
        .filter((job) => job.kind === "motion" && job.status === "completed" && job.mediaUrl && mediaFileExists(job.mediaUrl, job.mediaPath))
        .slice(0, 12)
        .map((job) => ({ id: job.id, url: job.mediaUrl as string, createdAt: job.createdAt, source: job.source || "" }));
      const inProgress = related.some((job) => job.status === "queued" || job.status === "running");
      const status = inProgress ? "In progress" : clips.length ? "Clips" : stills.length ? "Stills" : "Assigned";
      const packs = variants
        .filter((variant) => variant.productId && ids.has(variant.productId))
        .slice(0, 8)
        .map((variant) => ({
          id: variant.id,
          name: variant.name,
          market: variant.market,
          platform: variant.platform,
          stage: stageLabel(variant.stage),
          brief: variant.brief || "",
        }));
      return {
        ...campaign,
        products: campaign.productIds.map((id) => {
          const product = productById.get(id);
          return {
            id,
            title: product?.title || "SKU removed",
            image: product ? skuIdentityUrl(product) || product.images.find((url) => url.startsWith("/api/media/")) || "" : "",
          };
        }),
        characters: campaign.characterIds.map((id) => {
          const character = characterById.get(id);
          return { id, name: character?.name || "Character removed", thumbUrl: character?.thumbUrl || "" };
        }),
        stills,
        clips,
        packs,
        experiments: store.experiments.filter((row) => row.campaignId === campaign.id),
        status,
      };
    });

  return {
    campaigns,
    catalog: products.map((product) => ({
      id: product.id,
      title: product.title,
      image: skuIdentityUrl(product) || product.images.find((url) => url.startsWith("/api/media/")) || "",
      market: productMarketId(product),
    })),
    characters: characters.map((character) => ({
      id: character.id,
      name: character.name,
      thumbUrl: character.thumbUrl || "",
      markets: character.markets || [],
    })),
    markets: CAMPAIGN_MARKETS,
    platforms: CAMPAIGN_PLATFORMS,
    variables: EXPERIMENT_VARIABLES,
  };
}
