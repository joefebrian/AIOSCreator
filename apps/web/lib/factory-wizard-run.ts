import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { logCloudUsage } from "./cloud-usage";
import { cometSeedanceI2V } from "./cloud-video";
import { presentFact } from "./fact-evidence";
import {
  asDuration,
  asRatio,
  creatorStillPrompt,
  descriptionFromFacts,
  dialogIssues,
  dialogUserPrompt,
  isWizardHook,
  seedancePrompt,
  spokenProductName,
  variantUserPrompt,
  wizardBlockers,
  wizardCostUsd,
  type WizardDraft,
  type WizardHook,
} from "./factory-wizard";
import { patchWizardDraft } from "./factory-wizard-store";
import { waitForGpuIdle } from "./gpu-gate";
import { parseImageAspect, sizeForAspect } from "./image-aspect";
import { FACTORY_ASTRA_MODEL, factoryScriptLlm, llmClient } from "./llm";
import { menuAsset } from "./media-menu";
import { mediaUrlToPath } from "./paths";
import { skuIdentityUrl } from "./product-import";
import { getProduct, listProducts } from "./products";
import { catalogDisplayName, readSharedCatalog } from "./shared-catalog";
import { assertSpendAllowed, SpendCapError } from "./spend-cap";
import { generateStill } from "./stills";
import { insertJob, updateJob, type Job } from "./store";
import { parseCreatorLook } from "./factory-native-audio";
import { FACTORY_V2_MARKETS } from "./ugc-factory-v2";

export type WizardImage = { url: string; role: string };
export type WizardFact = { id: string; statement: string; source: string };
export type WizardListing = { id: string; marketplace: string; variantReview: string; sourceUrl: string };

export type WizardSheet = {
  skuId: string;
  name: string;
  spokenName: string;
  market: string;
  locale: string;
  locales: string[];
  images: WizardImage[];
  facts: WizardFact[];
  withheld: number;
  description: string;
  listings: WizardListing[];
};

export function listWizardProducts() {
  return listProducts()
    .slice(0, 200)
    .map((product) => ({
      id: product.id,
      title: product.title,
      image: skuIdentityUrl(product) || (product.images || []).find((url) => url.startsWith("/api/media/") && !url.includes("/ugc-references/")) || "",
    }));
}

export function wizardMarkets() {
  return FACTORY_V2_MARKETS.map((row) => ({ id: row.id, label: row.label, locales: [...row.locales], currency: row.currency }));
}

function plates(product: NonNullable<ReturnType<typeof getProduct>>): WizardImage[] {
  const images = product.images || [];
  const roles = product.imageRoles || [];
  const rows = images
    .map((url, index) => ({ url, role: roles[index] || "other" }))
    .filter((row) => row.url.startsWith("/api/media/") && !row.url.includes("/ugc-references/") && !row.url.includes("/characters/"));
  const rank: Record<string, number> = { identity: 0, packaging: 1, detail: 2, usage: 3, other: 4 };
  return rows.sort((a, b) => (rank[a.role] ?? 9) - (rank[b.role] ?? 9));
}

export function loadWizardSheet(catalogProductId: string, market: string, locale: string): WizardSheet {
  const product = getProduct(catalogProductId);
  if (!product) throw new Error("Choose a catalog product.");
  const catalog = readSharedCatalog();
  const link = catalog.legacy.find((row) => row.productId === product.id);
  if (!link) throw new Error("This product is not in the shared catalog yet.");
  const marketRow = FACTORY_V2_MARKETS.find((row) => row.id === market);
  if (!marketRow) throw new Error("Choose a market.");
  const locales = [...marketRow.locales];
  const pickedLocale = locales.includes(locale) ? locale : locales[0];
  const facts = catalog.facts.filter((row) => row.skuId === link.skuId);
  const eligible = facts
    .filter((row) => presentFact(row).eligible)
    .map((row) => ({ id: row.id, statement: row.statement, source: presentFact(row).sourceLabel }));
  const name = catalogDisplayName(product.id, market, pickedLocale) || product.title;
  return {
    skuId: link.skuId,
    name,
    spokenName: spokenProductName(name),
    market,
    locale: pickedLocale,
    locales,
    images: plates(product),
    facts: eligible,
    withheld: facts.length - eligible.length,
    description: descriptionFromFacts(eligible),
    listings: catalog.listings
      .filter((row) => row.skuId === link.skuId && row.market === market)
      .map((row) => ({ id: row.id, marketplace: row.marketplace, variantReview: row.variantReview, sourceUrl: row.sourceUrl })),
  };
}

function parseAstra(raw: string) {
  const text = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(text) as { dialog?: unknown; dialogs?: unknown };
}

async function astraText(user: string) {
  const cfg = factoryScriptLlm(FACTORY_ASTRA_MODEL);
  if (cfg.model !== FACTORY_ASTRA_MODEL) {
    throw new Error(`Wizard dialogs use gpt-6-astra. The configured script model is ${cfg.model}.`);
  }
  assertSpendAllowed({ model: cfg.model, tokens: 2500 });
  const client = llmClient(cfg);
  const started = Date.now();
  try {
    const completion = await client.chat.completions.create({
      model: cfg.model,
      reasoning_effort: "low",
      messages: [
        { role: "system", content: "You write one short UGC spoken line from confirmed product facts. Return JSON only. You do not start a video." },
        { role: "user", content: user },
      ],
    });
    const usage = completion.usage;
    const inputTokens = usage?.prompt_tokens || 0;
    const outputTokens = usage?.completion_tokens || 0;
    logCloudUsage({
      at: new Date().toISOString(),
      accountId: "Script_UGC",
      providerId: "openai",
      model: "Script_UGC",
      ok: true,
      ms: Date.now() - started,
      baseURL: cfg.baseURL,
      kind: "Script_UGC",
      tokens: inputTokens + outputTokens,
      units: inputTokens + outputTokens,
      unit: "token",
      actualUsd: Math.round(((inputTokens / 1_000_000) * 10 + (outputTokens / 1_000_000) * 50) * 1_000_000) / 1_000_000,
    });
    return (completion.choices[0]?.message?.content || "").trim();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Astra did not return a dialog.";
    logCloudUsage({
      at: new Date().toISOString(),
      accountId: "Script_UGC",
      providerId: "openai",
      model: "Script_UGC",
      ok: false,
      ms: Date.now() - started,
      baseURL: cfg.baseURL,
      kind: "Script_UGC",
      tokens: 0,
      units: 0,
      unit: "token",
      error: message.slice(0, 160),
    });
    throw err;
  }
}

export async function writeWizardDialog(input: {
  catalogProductId: string;
  market: string;
  locale: string;
  hook: string;
  durationSec: number;
}) {
  if (!isWizardHook(input.hook)) throw new Error("Choose a hook.");
  const durationSec = asDuration(input.durationSec);
  const sheet = loadWizardSheet(input.catalogProductId, input.market, input.locale);
  if (!sheet.facts.length) throw new Error("No confirmed fact can go into the script yet.");
  const prompt = dialogUserPrompt({
    name: sheet.name,
    market: sheet.market,
    locale: sheet.locale,
    hook: input.hook,
    durationSec,
    facts: sheet.facts,
  });
  let dialog = "";
  let issues: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await astraText(attempt === 0 ? prompt : `${prompt}\n\nRewrite. The previous line was refused: ${issues[0]}`);
    let parsed: { dialog?: unknown };
    try {
      parsed = parseAstra(raw);
    } catch {
      issues = ["Astra returned an unreadable dialog."];
      continue;
    }
    dialog = String(parsed.dialog || "").replace(/\s+/g, " ").trim();
    issues = dialogIssues(dialog, durationSec);
    if (!issues.length) return { dialog, description: sheet.description, locale: sheet.locale, facts: sheet.facts };
  }
  throw new Error(issues[0] || "Astra did not return a usable dialog.");
}

async function alternateDialogs(input: {
  sheet: WizardSheet;
  hook: WizardHook;
  durationSec: number;
  count: number;
  base: string;
}) {
  if (input.count < 1) return [];
  const raw = await astraText(variantUserPrompt({
    name: input.sheet.name,
    market: input.sheet.market,
    locale: input.sheet.locale,
    durationSec: input.durationSec,
    count: input.count,
    base: input.base,
    facts: input.sheet.facts,
  }));
  let parsed: { dialogs?: unknown };
  try {
    parsed = parseAstra(raw);
  } catch {
    throw new Error("Astra returned unreadable variants. No video was started.");
  }
  const rows = Array.isArray(parsed.dialogs) ? parsed.dialogs.map((row) => String(row || "").replace(/\s+/g, " ").trim()) : [];
  if (rows.length < input.count) throw new Error("Astra did not return enough variants. No video was started.");
  const dialogs = rows.slice(0, input.count);
  for (const dialog of dialogs) {
    const issues = dialogIssues(dialog, input.durationSec);
    if (issues.length) throw new Error(`${issues[0]} No video was started.`);
  }
  return dialogs;
}

function onDisk(url: string) {
  if (!url.startsWith("/api/media/") || url.includes("/ugc-references/") || url.includes("/characters/")) return "";
  const file = mediaUrlToPath(url);
  return file && fs.existsSync(file) ? file : "";
}

function openJob(input: { prompt: string; model: string; provider: string; kind: Job["kind"]; productId?: string }): Job {
  const now = new Date().toISOString();
  const job: Job = {
    id: randomUUID(),
    module: "production",
    kind: input.kind,
    input: input.prompt,
    status: "running",
    createdAt: now,
    updatedAt: now,
    model: input.model,
    provider: input.provider,
    productId: input.productId,
    source: "ugc-factory",
  };
  insertJob(job);
  return job;
}

export function beginCreatorStill(draft: WizardDraft) {
  const look = parseCreatorLook(draft.look);
  const ratio = asRatio(draft.ratio);
  const prompt = creatorStillPrompt(look, draft.market);
  const job = openJob({ prompt, model: "qwen-image-2.1", provider: "comfy", kind: "image", productId: draft.catalogProductId });
  const saved = patchWizardDraft(draft.id, { stillJobId: job.id, stillUrl: "", stillError: "", stillAspect: "", stillSource: "", look });
  return { job, prompt, ratio, draft: saved };
}

export async function renderCreatorStill(jobId: string, draftId: string, prompt: string, ratio: string) {
  try {
    await waitForGpuIdle({ jobId, onWait: (msg) => updateJob(jobId, { progress: msg }) });
    const aspect = parseImageAspect(ratio);
    const canvas = sizeForAspect(aspect);
    const { buffer } = await generateStill(prompt, undefined, "qwen-image-2.1", {
      width: canvas.width,
      height: canvas.height,
      aspect,
    });
    const asset = menuAsset("ugc-factory", jobId, "png");
    fs.writeFileSync(asset.path, buffer);
    updateJob(jobId, { status: "completed", progress: undefined, mediaPath: asset.path, mediaUrl: asset.url });
    patchWizardDraft(draftId, { stillUrl: asset.url, stillAspect: ratio, stillSource: "generated", stillError: "" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    updateJob(jobId, { status: "failed", error: message });
    patchWizardDraft(draftId, { stillError: message });
  }
}

export async function beginWizardClips(draft: WizardDraft) {
  const durationSec = asDuration(draft.durationSec);
  const ratio = asRatio(draft.ratio);
  const volume = draft.volume;
  const sheet = loadWizardSheet(draft.catalogProductId, draft.market, draft.locale);
  const listing = sheet.listings.find((row) => row.id === draft.listingId) || sheet.listings[0];
  if (!sheet.images.some((row) => row.url === draft.productImageUrl)) throw new Error("That photo is not on this SKU.");
  const person = onDisk(draft.stillUrl);
  const product = onDisk(draft.productImageUrl);
  if (!person) throw new Error("The person photo is not on disk.");
  if (!product) throw new Error("The product photo is not on disk.");
  const blockers = wizardBlockers({
    productImageUrl: draft.productImageUrl,
    listingReview: listing?.variantReview || "",
    eligibleFactCount: sheet.facts.length,
    dialog: draft.dialog,
    durationSec,
    stillUrl: draft.stillUrl,
    stillAspect: draft.stillAspect,
    ratio,
    stillSource: draft.stillSource,
    volume,
  });
  if (blockers.length) throw new Error(blockers[0]);
  const dialogs = [draft.dialog.replace(/\s+/g, " ").trim()];
  if (volume > 1) {
    dialogs.push(...await alternateDialogs({
      sheet,
      hook: draft.hook,
      durationSec,
      count: volume - 1,
      base: dialogs[0],
    }));
  }
  assertSpendAllowed({ model: "seedance-2-5", durationSec: durationSec * volume });
  const jobs = dialogs.map((dialog) => openJob({
    prompt: seedancePrompt({ dialog, locale: sheet.locale, ratio }),
    model: "seedance-2-5",
    provider: "higgsfield",
    kind: "motion",
    productId: draft.catalogProductId,
  }));
  const saved = patchWizardDraft(draft.id, { clipJobIds: jobs.map((job) => job.id), clipError: "", locale: sheet.locale });
  return {
    draft: saved,
    jobs: jobs.map((job, index) => ({ id: job.id, dialog: dialogs[index] })),
    person,
    product,
    locale: sheet.locale,
    ratio,
    durationSec,
    estimateUsd: wizardCostUsd(durationSec, volume),
  };
}

export async function renderWizardClips(input: {
  draftId: string;
  jobs: { id: string; dialog: string }[];
  person: string;
  product: string;
  locale: string;
  ratio: WizardDraft["ratio"];
  durationSec: number;
}) {
  for (let index = 0; index < input.jobs.length; index++) {
    const job = input.jobs[index];
    try {
      const buffer = await cometSeedanceI2V(
        input.person,
        seedancePrompt({ dialog: job.dialog, locale: input.locale, ratio: input.ratio }),
        input.durationSec,
        "seedance-2-5",
        [input.product],
      );
      const asset = menuAsset("ugc-factory", job.id, "mp4");
      fs.writeFileSync(asset.path, buffer);
      updateJob(job.id, { status: "completed", progress: undefined, mediaPath: asset.path, mediaUrl: asset.url });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      updateJob(job.id, { status: "failed", error: message });
      patchWizardDraft(input.draftId, { clipError: message });
      for (const rest of input.jobs.slice(index + 1)) {
        updateJob(rest.id, { status: "failed", error: "Stopped because an earlier clip failed." });
      }
      return;
    }
  }
  patchWizardDraft(input.draftId, { clipError: "" });
}

export function attachUploadedStill(draftId: string, url: string) {
  if (!onDisk(url)) throw new Error("That photo is not on disk.");
  return patchWizardDraft(draftId, { stillUrl: url, stillSource: "upload", stillAspect: "", stillError: "", stillJobId: "" });
}

export { SpendCapError };
