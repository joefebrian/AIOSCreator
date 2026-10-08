import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { affiliateCopyTarget } from "./affiliate-copy";
import { logCloudUsage } from "./cloud-usage";
import { narrationVoice, speakNarration } from "./factory-voice";
import { FACTORY_ASTRA_MODEL, factoryScriptLlm, llmClient } from "./llm";
import { dataRoot } from "./paths";
import { getProduct } from "./products";
import { skuIdentityUrl } from "./product-import";
import { assertSpendAllowed } from "./spend-cap";
import { ensureReferenceBlueprint, latestBlueprint, type ReferenceBlueprint } from "./ugc-reference-blueprint";
import { presentFact } from "./fact-evidence";
import { catalogDisplayName, readSharedCatalog } from "./shared-catalog";
import { createFactoryProduction, pinFactoryReference, readFactoryV2, saveMeasuredVoice, saveRecreationPlan, setFactoryPlanningMode, type FactoryPlanBeat, type PlanDraft } from "./ugc-factory-v2";
import { listUgcReferences, reviewUgcAnalysis } from "./ugc-references";

const LOCALE: Record<string, string> = {
  ID: "id-ID",
  MY: "ms-MY",
  SG: "en-SG",
  TH: "th-TH",
  US: "en-US",
};

function place(market: string | null | undefined, locale: string | null | undefined) {
  const marketId = (market || "").trim();
  if (!marketId) throw new Error("Choose a target market.");
  if (!LOCALE[marketId]) throw new Error("Market must be Indonesia, Malaysia, Singapore, Thailand, or the United States.");
  const localeId = (locale || "").trim() || LOCALE[marketId];
  return { market: marketId, locale: localeId };
}

/** Opens one unapproved Factory draft and pins the reviewed analysis. Does not call Jev, Astra, or a video provider. */
export function openFactoryDraftForReference(input: {
  productId: string;
  referenceId: string;
  market?: string | null;
  locale?: string | null;
  select?: boolean;
}) {
  const product = getProduct(input.productId);
  if (!product) throw new Error("product not found");
  let reference = listUgcReferences(input.productId).find((row) => row.id === input.referenceId);
  if (!reference?.mediaUrl) throw new Error("Recreate needs the saved video.");
  if (input.select && reference.analysis?.version != null && !reference.analysis.reviewed) {
    reference = reviewUgcAnalysis({ productId: input.productId, referenceId: reference.id });
  }
  if (!reference.analysis?.reviewed || reference.analysis.version == null) {
    throw new Error("Recreate needs a reviewed analysis. Import does not analyze the video.");
  }
  const db = readFactoryV2();
  const owned = db.productions.filter((row) => db.skus.find((sku) => sku.id === row.skuId)?.catalogProductId === input.productId);
  const editable = owned.find((row) => !row.planApprovedAt && !row.providerJobId);
  if (!editable && owned.length) throw new Error("The approved plan stays as saved. This reference was not pinned.");
  let production = editable;
  if (!production) {
    const picked = place(reference.market || input.market, reference.locale || input.locale);
    const created = createFactoryProduction({
      idempotencyKey: `ugc-reference:${input.productId}:${picked.market}:${picked.locale}`,
      product: {
        id: product.id,
        title: product.title,
        brand: product.brand,
        category: product.category,
        price: product.price,
        currency: product.currency,
        sourceUrl: product.sourceUrl,
        affiliateUrl: product.affiliateUrl,
        provider: product.provider,
        providerProductId: product.providerProductId,
        features: product.features || [],
        imageUrl: skuIdentityUrl(product) || "",
        hasPackagingImage: (product.imageRoles || []).includes("packaging"),
      },
      market: picked.market,
      locale: picked.locale,
      placement: "TIKTOK",
      durationSec: 30,
    });
    production = created.production;
  }
  const factIds = readSharedCatalog().facts
    .filter((fact) => eligibleConfirmedFact(fact, reference.skuId))
    .map((fact) => fact.id);
  const pinned = pinFactoryReference(production.id, production.revision, {
    referenceId: reference.id,
    analysisVersion: reference.analysis.version,
    factIds,
  });
  return { production: pinned, href: `/create/ugc-factory?production=${pinned.id}` };
}

const SOURCE_TESTIMONY = /\b(dulu|pernah pakai|hasilnya|kulit saya|my skin|i have been|i am a fan|i'm a fan|glowing)\b/i;
const ENGLISH_I = /^(i |i'm |i’ve )/i;

function spokenProductLabel(name: string) {
  const head = name.split("|")[0].replace(/\s+for\s+.*/i, "").trim();
  return head || name;
}

function eligibleConfirmedFact(fact: { state: string; skuId: string; kind?: string; statement: string; reviewBasis?: string | null; provenance?: { claimClass?: string; sourceKind?: string; reviewBasis?: string | null; evidence?: string } | null }, skuId: string) {
  if (fact.skuId !== skuId) return false;
  return presentFact(fact).eligible;
}

function cleanSpoken(value: unknown) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return { text: null as string | null, uncertainty: null as string | null };
  if (ENGLISH_I.test(text) || SOURCE_TESTIMONY.test(text)) return { text: null, uncertainty: "A source-creator result or past experience was returned and was not kept." };
  return { text, uncertainty: null };
}

type SpeechBudget = { shotId: string; windowSec: number; speechSec: number; words: number };

function speechBudgets(blueprint: ReferenceBlueprint, wordsPerSec: number): SpeechBudget[] {
  return blueprint.shots.map((shot) => {
    const windowSec = Math.round(Math.max(0, shot.endSec - shot.startSec) * 10) / 10;
    const speechSec = windowSec < 1 ? 0 : windowSec;
    return { shotId: shot.id, windowSec, speechSec, words: speechSec === 0 ? 0 : Math.max(3, Math.floor(speechSec * wordsPerSec * 0.7)) };
  });
}

function wordCount(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

async function astraLocalizedShots(input: {
  name: string;
  market: string;
  locale: string;
  blueprint: ReferenceBlueprint;
  facts: { id: string; statement: string }[];
  budgets: SpeechBudget[];
  attemptNote?: string;
}) {
  const cfg = factoryScriptLlm(FACTORY_ASTRA_MODEL);
  if (cfg.model !== FACTORY_ASTRA_MODEL) {
    throw new Error(`Recreation planning is gpt-6-astra. The configured script model is ${cfg.model}. Qwen was not called.`);
  }
  assertSpendAllowed({ model: cfg.model, tokens: 4000 });
  const client = llmClient(cfg);
  const started = Date.now();
  const english = input.locale.toLowerCase().startsWith("en");
  const user = [
    `Product label to speak: ${input.name}. Do not recite a marketplace listing title.`,
    ...(english
      ? [
          `Market ${input.market}. Spoken language is ${input.locale}. Keep the market and the language separate. Write English only.`,
          "Off-screen voiceover. Do not write lines for someone to speak on camera.",
          "Shape the spoken lines as a purposeful opening, a concrete demo, a product-name reveal, and a call to action on the last shot.",
          "A generated adult may be visible in a face or demo shot. That person is not the source creator. Do not use her name, a skin result, or a past-use claim.",
          "No price, currency, or discount.",
          "Every shot returns framing, action, stateIn, stateOut, and continuity as the transition into the next shot.",
        ]
      : [
          `Market ${input.market}, locale ${input.locale}. Off-screen voiceover. No on-camera creator.`,
          "Write a concise product demo. Keep the reference rhythm, framing, and visible actions.",
        ]),
    "Do not narrate the source creator's life, past use, skin result, or opinions.",
    "Do not start a spoken line with I. First person is allowed only for an action visible in that shot, such as holding the jar or wiping with the pad.",
    "A shot with a word budget of 0 must return spoken null. Every other shot must return a spoken line.",
    "Stay inside each shot's word budget. estimatedSec must be less than or equal to speechSec. Speech plus the visual pause stays inside the 30 second reference.",
    input.attemptNote || "",
    `Confirmed facts, use only these if you make a product claim: ${JSON.stringify(input.facts)}`,
    `Speech budgets: ${JSON.stringify(input.budgets)}`,
    `Blueprint shots. Use action and timing. Do not translate the source speech: ${JSON.stringify(input.blueprint.shots.map((shot) => ({ id: shot.id, startSec: shot.startSec, endSec: shot.endSec, action: shot.action, framing: shot.framing, onScreen: shot.onScreen })))}`,
    'Return ONLY JSON {"concept":string,"delivery":string,"creativeBeats":[{"id":string,"spoken":string|null,"uncertainty":string|null}],"shots":[{"shotId":string,"beatRole":string,"spoken":string|null,"action":string|null,"stateIn":string|null,"stateOut":string|null,"framing":string|null,"performance":string|null,"audioMode":string|null,"continuity":string|null,"estimatedSec":number|null,"uncertainty":string|null,"factIds":string[]}]}',
    "Include every blueprint beat id once and every blueprint shot id once. Do not add shots. Creative beats are the purpose. Shots are the camera and the action. A shot is not an edit beat.",
  ].join("\n");
  let completion;
  try {
    completion = await client.chat.completions.create({
      model: cfg.model,
      reasoning_effort: "low",
      messages: [
        { role: "system", content: "You adapt a source blueprint into one market's spoken lines and shot plan. Return JSON only. You do not analyze video and you do not start a render." },
        { role: "user", content: user },
      ],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Astra did not return a plan.";
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
  const usage = completion.usage;
  const inputTokens = usage?.prompt_tokens || 0;
  const outputTokens = usage?.completion_tokens || 0;
  const raw = (completion.choices[0]?.message?.content || "").replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  let parsed: { concept?: string; delivery?: string; shots?: Record<string, unknown>[]; creativeBeats?: Record<string, unknown>[] };
  try {
    parsed = JSON.parse(raw) as { concept?: string; delivery?: string; shots?: Record<string, unknown>[] };
  } catch {
    logCloudUsage({
      at: new Date().toISOString(),
      accountId: "Script_UGC",
      providerId: "openai",
      model: "Script_UGC",
      ok: false,
      ms: Date.now() - started,
      baseURL: cfg.baseURL,
      kind: "Script_UGC",
      tokens: inputTokens + outputTokens,
      units: inputTokens + outputTokens,
      unit: "token",
      actualUsd: Math.round(((inputTokens / 1_000_000) * 10 + (outputTokens / 1_000_000) * 50) * 1_000_000) / 1_000_000,
      error: "invalid JSON",
    });
    throw new Error("Astra returned an incomplete plan. It was not saved. Qwen was not called.");
  }
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
  const byId = new Map((parsed.shots || []).map((shot) => [String(shot.shotId || ""), shot]));
  const beats: FactoryPlanBeat[] = input.blueprint.shots.map((shot, index) => {
    const returned = byId.get(shot.id) || {};
    const spoken = cleanSpoken(returned.spoken);
    const beat = input.blueprint.beats.find((item) => item.id === shot.beatId);
    const factIds = Array.isArray(returned.factIds) ? returned.factIds.map(String).filter((id) => input.facts.some((fact) => fact.id === id)) : [];
    return {
      id: `shot-${index + 1}`,
      purpose: beat?.role || "shot",
      spoken: spoken.text,
      onScreen: shot.onScreen,
      action: returned.action ? String(returned.action) : (shot.action || "Not observed in the source."),
      stateIn: returned.stateIn ? String(returned.stateIn) : "Not observed.",
      stateOut: returned.stateOut ? String(returned.stateOut) : "Not observed.",
      factIds,
      sourceStartSec: shot.startSec,
      sourceEndSec: shot.endSec,
      estimatedSec: Number(returned.estimatedSec) || null,
      timing: "estimated",
      framing: returned.framing ? String(returned.framing) : shot.framing,
      performance: returned.performance ? String(returned.performance) : null,
      audioMode: returned.audioMode ? String(returned.audioMode) : "voiceover",
      continuity: returned.continuity ? String(returned.continuity) : null,
      renderNote: "Do not render until Generate is clicked on the approved plan.",
      uncertainty: [shot.uncertainty, spoken.uncertainty, returned.uncertainty ? String(returned.uncertainty) : ""].filter(Boolean).join(" ") || null,
      shotId: shot.id,
      beatRole: beat?.role || null,
    };
  });
  const returnedBeats = new Map((parsed.creativeBeats || []).map((beat) => [String(beat.id || ""), beat]));
  const creativeBeats = input.blueprint.beats.map((beat) => {
    const spoken = cleanSpoken(returnedBeats.get(beat.id)?.spoken);
    return {
      id: beat.id,
      role: beat.role,
      sourceStartSec: beat.startSec,
      sourceEndSec: beat.endSec,
      evidence: beat.evidence,
      spoken: spoken.text,
      uncertainty: [beat.uncertainty, spoken.uncertainty, returnedBeats.get(beat.id)?.uncertainty ? String(returnedBeats.get(beat.id)?.uncertainty) : ""].filter(Boolean).join(" ") || null,
    };
  });
  const plan: PlanDraft = {
    modelId: FACTORY_ASTRA_MODEL,
    concept: String(parsed.concept || "Localized from the source blueprint."),
    spoken: creativeBeats.map((beat) => beat.spoken).filter(Boolean).join(" ") || beats.map((beat) => beat.spoken).filter(Boolean).join(" "),
    delivery: String(parsed.delivery || "Hands stay in frame when the source shows hands. No new testimonial."),
    audio: "Local timing is estimated until a voice recording exists. Source timestamps stay on each shot.",
    edit: "Creative beats hold the purpose. Shots are renderable camera and action shots.",
    beats,
    creativeBeats,
  };
  return plan;
}

/** One draft per market. Astra localizes only the markets listed in localize. Other models are not called. */
export async function recreateReferenceMarkets(input: {
  productId: string;
  referenceId: string;
  markets: { market: string; locale: string }[];
  localize?: string[];
}) {
  const product = getProduct(input.productId);
  if (!product) throw new Error("product not found");
  const reference = listUgcReferences(input.productId).find((row) => row.id === input.referenceId);
  if (!reference?.analysis?.version || !reference.mediaUrl) throw new Error("Analyze the saved video before recreating it.");
  const ensured = ensureReferenceBlueprint(reference.id, input.productId, reference.analysis);
  const catalog = readSharedCatalog();
  const sku = catalog.skus.find((row) => row.legacyProductId === input.productId);
  const facts = catalog.facts
    .filter((fact) => eligibleConfirmedFact(fact, reference.skuId))
    .map((fact) => ({ id: fact.id, statement: fact.statement }));
  const confirmedIds = facts.map((fact) => fact.id);
  const drafts = [];
  for (const requested of input.markets) {
    const picked = place(requested.market, requested.locale);
    const listing = sku ? catalog.listings.find((row) => row.skuId === sku.id && row.market === picked.market && row.variantReview !== "REJECTED") : undefined;
    const copy = sku ? affiliateCopyTarget({
      skuId: sku.id,
      market: picked.market,
      listings: catalog.listings.filter((row) => row.skuId === sku.id),
      destinations: catalog.destinations,
      preferences: catalog.preferences,
    }) : { action: "add-listing" as const };
    const created = createFactoryProduction({
      idempotencyKey: `ugc-recreate:${input.productId}:${reference.id}:${picked.market}:${picked.locale}`,
      product: {
        id: product.id,
        title: catalogDisplayName(product.id, picked.market, picked.locale) || product.title,
        brand: product.brand,
        category: product.category,
        price: product.price,
        currency: product.currency,
        sourceUrl: listing?.sourceUrl || product.sourceUrl,
        affiliateUrl: copy.action === "copy" ? copy.url : "",
        provider: product.provider,
        providerProductId: product.providerProductId,
        features: product.features || [],
        imageUrl: skuIdentityUrl(product) || "",
        hasPackagingImage: (product.imageRoles || []).includes("packaging"),
      },
      market: picked.market,
      locale: picked.locale,
      placement: "TIKTOK",
      durationSec: 30,
      destinationUrl: copy.action === "copy" ? copy.url : "",
    });
    const pinned = pinFactoryReference(created.production.id, created.production.revision, {
      referenceId: reference.id,
      analysisVersion: reference.analysis.version,
      factIds: confirmedIds,
      blueprintVersion: ensured.blueprint.version,
    });
    const routed = pinned.planningMode === "REFERENCE_RECREATE" || pinned.planApprovedAt || pinned.providerJobId
      ? pinned
      : setFactoryPlanningMode(pinned.id, pinned.revision, "REFERENCE_RECREATE");
    let production = routed;
    let model: string | null = null;
    let error: string | null = null;
    const currentPin = (pinned.pinnedReferences || []).find((row) => row.referenceId === reference.id);
    const planIsCurrent = pinned.plan?.modelId === FACTORY_ASTRA_MODEL
      && currentPin?.blueprintVersion === ensured.blueprint.version
      && (pinned.plan.beats || []).length > 0;
    if (planIsCurrent) {
      model = pinned.plan?.modelId || null;
    } else if ((input.localize || []).includes(picked.market)) {
      try {
        const plan = await astraLocalizedShots({
          name: spokenProductLabel(catalogDisplayName(product.id, picked.market, picked.locale) || product.title),
          market: picked.market,
          locale: picked.locale,
          blueprint: ensured.blueprint,
          facts,
          budgets: speechBudgets(ensured.blueprint, 1.2),
        });
        production = saveRecreationPlan(production.id, production.revision, plan);
        model = plan.modelId;
      } catch (err) {
        error = err instanceof Error ? err.message : "Astra did not return a plan.";
      }
    }
    drafts.push({
      market: picked.market,
      locale: picked.locale,
      productionId: production.id,
      revision: production.revision,
      href: `/create/ugc-factory?production=${production.id}`,
      model,
      error,
      listing: listing ? "existing" : "none",
      affiliate: copy.action,
      shots: production.plan?.beats || [],
    });
  }
  return { blueprint: ensured.blueprint, drafts };
}

/** Pins the reference and switches an editable draft to reference recreation. Does not call Astra. */
export function attachReferenceDraft(input: { productionId: string; expectedRevision: number; productId: string; referenceId: string }) {
  const reference = listUgcReferences(input.productId).find((row) => row.id === input.referenceId);
  if (!reference?.analysis?.version || !reference.mediaUrl) throw new Error("Analyze the saved video before this draft uses it.");
  const ensured = ensureReferenceBlueprint(reference.id, input.productId, reference.analysis);
  const catalog = readSharedCatalog();
  const factIds = catalog.facts
    .filter((fact) => eligibleConfirmedFact(fact, reference.skuId))
    .map((fact) => fact.id);
  const pinned = pinFactoryReference(input.productionId, input.expectedRevision, {
    referenceId: reference.id,
    analysisVersion: reference.analysis.version,
    factIds,
    blueprintVersion: ensured.blueprint.version,
  });
  if (pinned.planningMode === "REFERENCE_RECREATE") return pinned;
  return setFactoryPlanningMode(pinned.id, pinned.revision, "REFERENCE_RECREATE");
}

/** Operator action. Calls gpt-6-astra once for this draft and does not render. */
export async function writeReferenceRecreation(productionId: string, expectedRevision: number) {
  const db = readFactoryV2();
  const production = db.productions.find((row) => row.id === productionId);
  if (!production) throw new Error("Production not found");
  if (production.revision !== expectedRevision) throw new Error("This draft changed. Reload it before writing.");
  if (production.planningMode !== "REFERENCE_RECREATE") throw new Error("Switch this draft to reference recreation before Astra writes it.");
  if (production.planApprovedAt || production.providerJobId) throw new Error("The approved plan stays as saved.");
  const sku = db.skus.find((row) => row.id === production.skuId);
  if (!sku?.catalogProductId) throw new Error("This draft has no catalog product.");
  const pin = (production.pinnedReferences || [])[0];
  if (!pin) throw new Error("Analyze the reference and pin the blueprint.");
  const reference = listUgcReferences(sku.catalogProductId).find((row) => row.id === pin.referenceId);
  if (!reference?.analysis) throw new Error("The pinned reference has no stored analysis.");
  const blueprint = latestBlueprint(pin.referenceId, pin.analysisVersion);
  if (!blueprint) throw new Error("The pinned reference has no blueprint.");
  const catalog = readSharedCatalog();
  const facts = catalog.facts
    .filter((fact) => eligibleConfirmedFact(fact, reference.skuId))
    .map((fact) => ({ id: fact.id, statement: fact.statement }));
  const current = pin.blueprintVersion === blueprint.version && (pin.factIds || []).every((id) => facts.some((fact) => fact.id === id))
    ? production
    : pinFactoryReference(production.id, production.revision, {
      referenceId: pin.referenceId,
      analysisVersion: pin.analysisVersion,
      factIds: facts.map((fact) => fact.id),
      blueprintVersion: blueprint.version,
    });
  const voice = narrationVoice(current.locale, current.market);
  const rate = Math.max(1, (await voiceRate(voice)) * 0.85);
  const budgets = speechBudgets(blueprint, rate);
  const anchor = (sku.media || []).find((row) => row.role === "productAppearance" && row.url.startsWith("/api/media/"));
  let note = "Write a spoken line for every shot whose word budget is above zero.";
  let attempts = 0;
  let chosen: PlanDraft | null = null;
  let chosenScore = -1;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    attempts += 1;
    const plan = await astraLocalizedShots({
      name: spokenProductLabel(catalogDisplayName(sku.catalogProductId, current.market, current.locale) || sku.variantLabel),
      market: current.market,
      locale: current.locale,
      blueprint,
      facts,
      budgets,
      attemptNote: note,
    });
    const measured = [];
    for (const beat of plan.beats) {
      const budget = budgets.find((item) => item.shotId === beat.shotId);
      if (!beat.spoken || !budget?.words) {
        measured.push({ ...beat, spoken: budget?.words ? beat.spoken : null, estimatedSec: 0, timing: "measured" as const, audioMode: `voiceover ${voice}`, productAssetId: anchor?.id || null });
        continue;
      }
      const cached = await cachedSpeech(beat.spoken, voice);
      const folder = path.join(dataRoot(), "media", "ugc-factory-vo", current.id);
      fs.mkdirSync(folder, { recursive: true });
      const filename = `${beat.shotId || beat.id}.mp3`;
      fs.copyFileSync(cached, path.join(folder, filename));
      const seconds = await probeSeconds(path.join(folder, filename));
      measured.push({
        ...beat,
        estimatedSec: seconds,
        timing: "measured" as const,
        audioMode: `voiceover ${voice}`,
        productAssetId: anchor?.id || null,
        voiceUrl: `/api/media/ugc-factory-vo/${current.id}/${filename}`,
      });
    }
    const misses = measured.filter((beat) => (budgets.find((item) => item.shotId === beat.shotId)?.words || 0) > 0 && !beat.spoken);
    const timeFails = measured.filter((beat) => {
      const budget = budgets.find((item) => item.shotId === beat.shotId);
      return Boolean(beat.spoken) && (beat.estimatedSec || 0) > (budget?.windowSec || 0) + 0.35;
    });
    const score = measured.filter((beat) => beat.spoken).length * 5 - timeFails.length - misses.length * 3;
    if (score > chosenScore) {
      chosenScore = score;
      chosen = { ...plan, beats: measured };
    }
    if (!misses.length && !timeFails.length) break;
    if (attempt === 2) break;
    const keep = measured.filter((beat) => beat.spoken && !timeFails.some((item) => item.shotId === beat.shotId)).map((beat) => `${beat.shotId}: ${beat.spoken}`).join(" | ");
    const language = current.locale.toLowerCase().startsWith("en") ? "English" : current.locale.toLowerCase().startsWith("ms") ? "Malay" : current.locale.toLowerCase().startsWith("th") ? "Thai" : "Indonesian";
    note = `Keep these spoken lines unchanged: ${keep || "none"}. Write a short ${language} demo line for every other shot that has a word budget. Missing: ${misses.map((beat) => beat.shotId).join(", ") || "none"}. Too long: ${timeFails.map((beat) => `${beat.shotId} ${beat.estimatedSec}s`).join(", ") || "none"}.`;
  }
  if (!chosen) throw new Error("Astra returned no plan.");
  const english = current.locale.toLowerCase().startsWith("en");
  if (english) {
    chosen.beats = retimeToSpeech(chosen.beats.map((beat) => ({
      ...beat,
      framing: beat.framing || "Product in frame.",
      continuity: beat.continuity || "Cut on the action.",
      performance: /face|forehead|skin|cheek/i.test(`${beat.action} ${beat.framing}`)
        ? "One generated adult is reserved for this face or demo shot. No face is selected. The person is not the source creator."
        : "Hands or product only. The voice stays off screen.",
    })));
  } else {
    chosen.beats = chosen.beats.map((beat) => {
      const windowSec = Math.max(0, (beat.sourceEndSec || 0) - (beat.sourceStartSec || 0));
      if (beat.spoken && (beat.estimatedSec || 0) > windowSec + 0.35) {
        return { ...beat, spoken: null, estimatedSec: 0, voiceUrl: null, uncertainty: "This spoken line was longer than the shot, so the shot stays visual." };
      }
      return beat;
    });
  }
  const total = Math.round(chosen.beats.reduce((sum, beat) => sum + (beat.estimatedSec || 0), 0) * 10) / 10;
  chosen.audio = english
    ? `Off-screen English voiceover ${voice}. Market ${current.market}, spoken language ${current.locale}. Measured speech ${total}s. One generated adult is reserved for face and demo shots; no face is selected. The source creator is not the speaker. Repair attempts ${attempts}.`
    : `Off-screen voiceover ${voice}. Measured speech ${total}s inside the 30s reference windows. On-camera creator is not selected. Repair attempts ${attempts}.`;
  chosen.spoken = chosen.beats.map((beat) => beat.spoken).filter(Boolean).join(" ");
  chosen.delivery = english
    ? "Off-screen English voiceover. Face and demo shots use one generated adult who is not the source creator. No face is selected, so those shots stay unrendered."
    : chosen.delivery;
  return saveRecreationPlan(current.id, current.revision, chosen, english ? "GENERATED_ADULT" : undefined);
}

function retimeToSpeech(beats: FactoryPlanBeat[]) {
  const total = 30;
  const rows = beats.map((beat) => {
    const source = Math.max(0.4, (beat.sourceEndSec || 0) - (beat.sourceStartSec || 0));
    const speech = beat.spoken ? Math.round(((beat.estimatedSec || 0) + 0.4) * 10) / 10 : 0;
    const floor = beat.spoken ? Math.max(0.4, speech) : Math.max(0.4, Math.min(source, 2));
    return { beat, floor };
  });
  let sum = rows.reduce((carry, row) => carry + row.floor, 0);
  if (sum > total) {
    let over = sum - total;
    for (const row of rows) {
      if (row.beat.spoken || over <= 0) continue;
      const next = Math.max(0.4, Math.round((row.floor - over) * 10) / 10);
      over -= row.floor - next;
      row.floor = next;
    }
  } else if (sum < total) {
    const host = rows.filter((row) => row.beat.spoken).sort((a, b) => b.floor - a.floor)[0] || rows[rows.length - 1];
    if (host) host.floor = Math.round((host.floor + (total - sum)) * 10) / 10;
  }
  let cursor = 0;
  const timed = rows.map((row) => {
    const start = Math.round(cursor * 10) / 10;
    cursor = Math.round((cursor + row.floor) * 10) / 10;
    return { ...row.beat, sourceStartSec: start, sourceEndSec: cursor };
  });
  if (cursor < total && timed.length) timed[timed.length - 1] = { ...timed[timed.length - 1], sourceEndSec: total };
  return timed;
}

async function cachedSpeech(text: string, voice: string) {
  const hash = createHash("sha256").update(`${voice}\n${text}`).digest("hex").slice(0, 20);
  const dir = path.join(dataRoot(), "media", "ugc-factory-vo", "_cache");
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `${hash}.mp3`);
  if (!fs.existsSync(dest) || fs.statSync(dest).size < 500) {
    const spoken = await speakNarration(text, voice);
    fs.copyFileSync(spoken.file, dest);
    fs.rmSync(spoken.dir, { recursive: true, force: true });
  }
  return dest;
}

async function voiceRate(voice: string) {
  const sample = voice.toLowerCase().startsWith("en-") ? "One two three four five." : "Satu dua tiga empat lima.";
  const seconds = await probeSeconds(await cachedSpeech(sample, voice));
  return wordCount(sample) / seconds;
}

function probeSeconds(file: string) {
  const bin = fs.existsSync("C:/ffmpeg/bin/ffprobe.exe") ? "C:/ffmpeg/bin/ffprobe.exe" : "ffprobe";
  return new Promise<number>((resolve, reject) => {
    const child = spawn(bin, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { windowsHide: true });
    let out = "";
    child.stdout.on("data", (chunk) => { out += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      const value = Number(out.trim());
      if (code === 0 && value > 0) resolve(Math.round(value * 10) / 10);
      else reject(new Error("The voice duration could not be measured."));
    });
  });
}

/** Writes one local voiceover per spoken shot and stores the measured seconds. Does not render video. */
export async function measureRecreationVoice(productionId: string, expectedRevision: number) {
  const db = readFactoryV2();
  const production = db.productions.find((row) => row.id === productionId);
  if (!production?.plan) throw new Error("There is no plan to time.");
  if (production.revision !== expectedRevision) throw new Error("This draft changed. Reload it before measuring the voice.");
  if (production.planApprovedAt || production.providerJobId) throw new Error("The approved plan stays as saved.");
  const voice = narrationVoice(production.locale, production.market);
  const dir = path.join(dataRoot(), "media", "ugc-factory-vo", production.id);
  fs.mkdirSync(dir, { recursive: true });
  const beats = [];
  for (const beat of production.plan.beats) {
    if (!beat.spoken) {
      beats.push(beat);
      continue;
    }
    const spoken = await speakNarration(beat.spoken, voice);
    const name = `${beat.shotId || beat.id}.mp3`;
    const dest = path.join(dir, name);
    fs.copyFileSync(spoken.file, dest);
    fs.rmSync(spoken.dir, { recursive: true, force: true });
    const seconds = await probeSeconds(dest);
    beats.push({ ...beat, estimatedSec: seconds, timing: "measured" as const, audioMode: `voiceover ${voice}`, voiceUrl: `/api/media/ugc-factory-vo/${production.id}/${name}` });
  }
  const total = Math.round(beats.reduce((sum, beat) => sum + (beat.estimatedSec || 0), 0) * 10) / 10;
  const saved = saveMeasuredVoice(production.id, production.revision, beats, `Voiceover ${voice}. Measured total ${total}s. On-camera creator is not selected. The source creator is not the speaker. Source timestamps stay on each shot.`);
  return { production: saved, voice, totalSec: total };
}

export function referenceBoardSources(productions: { id: string; skuId: string; pinnedReferences?: { referenceId: string; analysisVersion: number; blueprintVersion?: number }[] }[], skus: { id: string; catalogProductId: string | null }[]) {
  const cache = new Map<string, ReturnType<typeof listUgcReferences>>();
  return productions.flatMap((production) => {
    const pin = production.pinnedReferences?.[0];
    const sku = skus.find((row) => row.id === production.skuId);
    if (!pin || !sku?.catalogProductId) return [];
    let references = cache.get(sku.catalogProductId);
    if (!references) {
      references = listUgcReferences(sku.catalogProductId);
      cache.set(sku.catalogProductId, references);
    }
    const reference = references.find((row) => row.id === pin.referenceId);
    const blueprint = latestBlueprint(pin.referenceId, pin.analysisVersion);
    return [{
      productionId: production.id,
      referenceId: pin.referenceId,
      analysisVersion: pin.analysisVersion,
      blueprintVersion: pin.blueprintVersion ?? blueprint?.version ?? null,
      creator: reference?.creator || null,
      mediaUrl: reference?.mediaUrl || null,
      posterUrl: reference?.posterUrl || null,
      width: reference?.width ?? null,
      height: reference?.height ?? null,
      sourceMarket: reference?.market || null,
      sourceLocale: reference?.locale || null,
      assetId: reference?.assetId || null,
      transcriptStatus: reference?.analysis?.transcriptStatus || null,
      coverage: reference?.analysis?.coverage || null,
      beats: blueprint?.beats || [],
      shots: blueprint?.shots || [],
    }];
  });
}

/** Drafts that already pin one of this product's references. Does not create or render. */
export function listReferenceRecreations(productId: string) {
  const ids = new Set(listUgcReferences(productId).map((row) => row.id));
  const db = readFactoryV2();
  return db.productions.flatMap((production) => {
    const pin = (production.pinnedReferences || []).find((row) => ids.has(row.referenceId));
    if (!pin) return [];
    return [{
      productionId: production.id,
      revision: production.revision,
      market: production.market,
      locale: production.locale,
      model: production.plan?.modelId || null,
      approved: Boolean(production.planApprovedAt),
      providerJobId: production.providerJobId || null,
      href: `/create/ugc-factory?production=${production.id}`,
      referenceId: pin.referenceId,
      analysisVersion: pin.analysisVersion,
      blueprintVersion: pin.blueprintVersion ?? null,
      shots: (production.plan?.beats || []).map((beat) => ({
        id: beat.id,
        shotId: beat.shotId || null,
        beatRole: beat.beatRole || beat.purpose,
        spoken: beat.spoken,
        onScreen: beat.onScreen,
        action: beat.action,
        stateIn: beat.stateIn,
        stateOut: beat.stateOut,
        sourceStartSec: beat.sourceStartSec ?? null,
        sourceEndSec: beat.sourceEndSec ?? null,
        estimatedSec: beat.estimatedSec ?? null,
        timing: beat.timing || "estimated",
        framing: beat.framing || null,
        performance: beat.performance || null,
        audioMode: beat.audioMode || null,
        continuity: beat.continuity || null,
        renderNote: beat.renderNote || null,
        uncertainty: beat.uncertainty || null,
      })),
    }];
  });
}
