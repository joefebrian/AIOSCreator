import fs from "node:fs";
import path from "node:path";
import OpenAI from "openai";
import { dataRoot } from "./paths";
import { logCloudUsage } from "./cloud-usage";
import { activeProvider, openRouterAccount, revampProvider } from "./providers";
import { assertSpendAllowed } from "./spend-cap";
import type { Product } from "./products";
import {
  PRODUCT_RESEARCH_SYSTEM,
  assertProductLock,
  extractiveResearch,
  productScriptBrief,
  type ProductResearch,
} from "./product-research";
import { assertHook, normalizeScriptPack, type ScriptPack } from "./ugc-script";
import { UGC_SCRIPT_SYSTEM } from "./ugc-system";

export type { ScriptPack };

export type LlmConfig = {
  apiKey: string;
  baseURL: string;
  model: string;
  headers?: Record<string, string>;
  source: "settings" | "env";
  name: string;
};

/** Settings-active provider wins. Env is fallback only. */
export function llmConfig(): LlmConfig {
  const saved = activeProvider();
  if (saved?.apiKey) {
    return {
      apiKey: saved.apiKey,
      baseURL: saved.baseURL,
      model: saved.model,
      headers: saved.headers,
      source: "settings",
      name: saved.name,
    };
  }
  const apiKey = process.env.LLM_API_KEY || process.env.XAI_API_KEY || "";
  const baseURL = process.env.LLM_BASE_URL || process.env.XAI_BASE_URL || "https://api.x.ai/v1";
  const model = process.env.LLM_MODEL || process.env.XAI_MODEL || "grok-4.6";
  if (!apiKey) {
    throw new Error("No LLM key. Add one in System → Settings (scripts / general).");
  }
  const headers = baseURL.includes("openrouter.ai")
    ? { "HTTP-Referer": "http://localhost:3000", "X-Title": "CreatorOS" }
    : undefined;
  return { apiKey, baseURL, model, headers, source: "env", name: "env" };
}

const OR_HEADERS = { "HTTP-Referer": "http://localhost:3000", "X-Title": "CreatorOS" };

/** Character prompt revamp only. Does not replace the Active LLM. */
export function revampLlmConfig(): LlmConfig {
  const saved = revampProvider();
  if (saved?.apiKey) {
    return {
      apiKey: saved.apiKey,
      baseURL: saved.baseURL,
      model: saved.model,
      headers: saved.headers || OR_HEADERS,
      source: "settings",
      name: saved.name,
    };
  }
  const apiKey = process.env.REVAMP_LLM_API_KEY || process.env.OPENROUTER_API_KEY || "";
  if (apiKey) {
    return {
      apiKey,
      baseURL: process.env.REVAMP_LLM_BASE_URL || "https://openrouter.ai/api/v1",
      model: process.env.REVAMP_LLM_MODEL || "qwen/qwen3-coder:free",
      headers: OR_HEADERS,
      source: "env",
      name: "revamp",
    };
  }
  return llmConfig();
}

export function llmClient(cfg: LlmConfig = llmConfig()) {
  return new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL, timeout: 120_000, defaultHeaders: cfg.headers });
}

export const FACTORY_SCRIPT_MODELS = ["gpt-6-luna", "gpt-6-sol", "gpt-6.1-sol"] as const;
export const FACTORY_ASTRA_MODEL = "gpt-6-astra";

/** UGC Factory scripts only. Active LLM (Qwen 3.7) stays for everything else. */
export function factoryScriptLlm(modelOverride?: string): LlmConfig {
  let apiKey = (process.env.FACTORY_LLM_API_KEY || "").trim();
  let model = (process.env.FACTORY_LLM_MODEL || FACTORY_ASTRA_MODEL).trim();
  const baseURL = (process.env.FACTORY_LLM_BASE_URL || "https://api.openai.com/v1").trim();
  if (!apiKey) {
    try {
      const file = path.join(dataRoot(), "db", "factory-llm.json");
      const saved = JSON.parse(fs.readFileSync(file, "utf8")) as { apiKey?: string; model?: string };
      apiKey = (saved.apiKey || "").trim();
      if (saved.model) model = saved.model;
    } catch {
      /* env or file */
    }
  }
  if (!apiKey) throw new Error("Factory script key missing.");
  const allowed = new Set<string>([FACTORY_ASTRA_MODEL, ...FACTORY_SCRIPT_MODELS]);
  if (modelOverride && allowed.has(modelOverride)) model = modelOverride;
  return { apiKey, baseURL, model, source: "env", name: model === FACTORY_ASTRA_MODEL ? "ChatGPT Astra" : model };
}

export function revampLlmClient() {
  const { apiKey, baseURL, headers } = revampLlmConfig();
  return new OpenAI({ apiKey, baseURL, timeout: 180_000, defaultHeaders: headers });
}

/** Prompt tidy only (Klein rewrite, Looks names, Generate revamp). Always OpenRouter. */
export function openRouterTidyConfig(): LlmConfig {
  const acc = openRouterAccount();
  const apiKey = acc?.apiKey || process.env.OPENROUTER_API_KEY || process.env.REVAMP_LLM_API_KEY || "";
  if (!apiKey) throw new Error("No OpenRouter key. Add one in System → Settings → Revamp LLM (OpenRouter).");
  return {
    apiKey,
    baseURL: acc?.baseURL || "https://openrouter.ai/api/v1",
    model: acc?.model || process.env.REVAMP_LLM_MODEL || "qwen/qwen3-coder:free",
    headers: acc?.headers || OR_HEADERS,
    source: acc ? "settings" : "env",
    name: acc?.name || "openrouter",
  };
}

export function openRouterTidyClient() {
  const { apiKey, baseURL, headers } = openRouterTidyConfig();
  return new OpenAI({ apiKey, baseURL, timeout: 60_000, defaultHeaders: headers });
}

/** LM Studio reports the loaded GGUF id on /v1/models. */
export async function resolveRevampModel() {
  const cfg = revampLlmConfig();
  if (!/127\.0\.0\.1:1234|localhost:1234/i.test(cfg.baseURL)) return cfg.model;
  try {
    const r = await fetch(`${cfg.baseURL}/models`, {
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
      signal: AbortSignal.timeout(2500),
    });
    const j = (await r.json()) as { data?: { id?: string }[] };
    const id = j.data?.[0]?.id;
    if (id) return id;
  } catch {
    /* LM Studio not up */
  }
  return cfg.model;
}

export function llmModel() {
  return llmConfig().model;
}

function logLlmUsage(
  cfg: LlmConfig,
  ok: boolean,
  tokens: number,
  error?: string,
  split?: { input?: number; output?: number },
) {
  const astra = cfg.model.startsWith("gpt-6") || cfg.name === "ChatGPT Astra";
  const providerId = astra
    ? "openai"
    : /dashscope|aliyuncs/i.test(cfg.baseURL)
      ? "dashscope"
      : /openrouter/i.test(cfg.baseURL)
        ? "openrouter"
        : /127\.0\.0\.1:1234|localhost:1234/i.test(cfg.baseURL)
          ? "lmstudio"
          : "openrouter";
  if (providerId === "lmstudio") return;
  const input = split?.input || 0;
  const output = split?.output || 0;
  const actualUsd = astra ? Math.round(((input / 1_000_000) * 10 + (output / 1_000_000) * 50) * 1_000_000) / 1_000_000 : undefined;
  logCloudUsage({
    at: new Date().toISOString(),
    accountId: astra ? "Script_UGC" : providerId,
    providerId,
    model: astra ? "Script_UGC" : cfg.model,
    ok,
    ms: 0,
    baseURL: cfg.baseURL,
    kind: astra ? "Script_UGC" : "script",
    tokens,
    units: tokens,
    unit: "token",
    actualUsd,
    error,
  });
}

export async function generateScript(input: string, cfg: LlmConfig = llmConfig()): Promise<ScriptPack> {
  const client = llmClient(cfg);
  const model = cfg.model;
  const astra = model.startsWith("gpt-6");
  if (!/127\.0\.0\.1:1234|localhost:1234|11434/.test(cfg.baseURL)) {
    assertSpendAllowed({ model, tokens: 4000 });
  }
  let completion;
  try {
    completion = await client.chat.completions.create({
      model,
      ...(astra ? { reasoning_effort: "low" } : { temperature: 0.7 }),
      messages: [
        {
          role: "system",
          content: UGC_SCRIPT_SYSTEM,
        },
        { role: "user", content: input },
      ],
    });
  } catch (err) {
    const msg =
      err instanceof OpenAI.APIError
        ? `${err.status} ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
    logLlmUsage(cfg, false, 0, msg);
    throw new Error(msg);
  }

  const usage = completion.usage;
  const tokens = (usage?.prompt_tokens || 0) + (usage?.completion_tokens || 0);
  const raw = completion.choices[0]?.message?.content ?? "";
  const jsonText = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  let parsed: ScriptPack;
  try {
    parsed = JSON.parse(jsonText) as ScriptPack;
  } catch {
    logLlmUsage(cfg, false, tokens, "invalid JSON", { input: usage?.prompt_tokens, output: usage?.completion_tokens });
    throw new Error("Model returned an incomplete script pack");
  }
  const pack = normalizeScriptPack(parsed as unknown as Record<string, unknown>);
  try {
    assertHook(pack);
  } catch (err) {
    logLlmUsage(cfg, false, tokens, "missing hook", { input: usage?.prompt_tokens, output: usage?.completion_tokens });
    throw err;
  }
  if (!pack.voiceover) {
    logLlmUsage(cfg, false, tokens, "incomplete script pack", { input: usage?.prompt_tokens, output: usage?.completion_tokens });
    throw new Error("Model returned an incomplete script pack");
  }
  logLlmUsage(cfg, true, tokens, undefined, { input: usage?.prompt_tokens, output: usage?.completion_tokens });
  return pack;
}

export async function researchProduct(product: Product, cfg: LlmConfig = llmConfig()): Promise<ProductResearch> {
  const base = extractiveResearch(product);
  const client = llmClient(cfg);
  const model = cfg.model;
  const astra = model.startsWith("gpt-6");
  try {
    if (!/127\.0\.0\.1:1234|localhost:1234|11434/.test(cfg.baseURL)) {
      assertSpendAllowed({ model, tokens: 1200 });
    }
    const completion = await client.chat.completions.create({
      model,
      ...(astra ? { reasoning_effort: "low" } : { temperature: 0.1 }),
      messages: [
        { role: "system", content: PRODUCT_RESEARCH_SYSTEM },
        {
          role: "user",
          content: JSON.stringify({
            title: product.title,
            brand: product.brand,
            features: product.features,
            url: product.sourceUrl,
          }),
        },
      ],
    });
    const raw = (completion.choices[0]?.message?.content || "")
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    const parsed = JSON.parse(raw) as Partial<ProductResearch>;
    const kind =
      parsed.objectKind && ["hardware", "pack", "garment", "app", "beauty", "food", "other"].includes(parsed.objectKind)
        ? parsed.objectKind
        : base.objectKind;
    logLlmUsage(cfg, true, (completion.usage?.prompt_tokens || 0) + (completion.usage?.completion_tokens || 0), undefined, {
      input: completion.usage?.prompt_tokens,
      output: completion.usage?.completion_tokens,
    });
    return {
      ...base,
      whatItIs: String(parsed.whatItIs || base.whatItIs).slice(0, 400),
      whatItIsNot: String(parsed.whatItIsNot || base.whatItIsNot).slice(0, 400),
      objectKind: kind,
      claims: Array.isArray(parsed.claims) && parsed.claims.length ? parsed.claims.map(String).slice(0, 8) : base.claims,
      forbidden: [...base.forbidden, ...(Array.isArray(parsed.forbidden) ? parsed.forbidden.map(String) : [])].slice(0, 10),
      source: "llm",
      researchedAt: new Date().toISOString(),
    };
  } catch {
    return base;
  }
}

export async function generateScriptForProduct(
  product: Product,
  formatLine: string,
  research: ProductResearch,
  cfg: LlmConfig = llmConfig(),
): Promise<ScriptPack> {
  const input = productScriptBrief(product, research, formatLine);
  let pack = await generateScript(input, cfg);
  try {
    assertProductLock(pack, research);
    return pack;
  } catch {
    pack = await generateScript(
      `${input}\n\nREWRITE. Previous draft invented a different product. Name THIS SKU in the hook. Stay inside listing claims.`,
      cfg,
    );
    assertProductLock(pack, research);
    return pack;
  }
}

const BATCH_SYSTEM = `You are a performance UGC operator. Return ONLY JSON:
{"concepts":[{ "title": string, "format": string, "hook": { "spoken": string, "visual": string }, "beats": [{ "t": "2-6s", "spoken": string, "visual": string }], "cta": { "spoken": string, "visual": string, "disclosure": string }, "platforms": ["TikTok", "YouTube Shorts"] }]}
Exactly 12 concepts. 4 hook variations (same format, different hook family: pain, proof, curiosity, outcome). 4 format/presentation variations (use the format ids given). 4 new angles (same product value, different reason to care). One variable changes per concept. HOOK spoken+visual required. Name THIS SKU in every hook. No invented claims.`;

export async function generateScriptBatch(
  product: Product,
  research: ProductResearch,
  formatLine: string,
  formatIds: string[],
  cfg: LlmConfig = llmConfig(),
): Promise<ScriptPack[]> {
  const client = llmClient(cfg);
  const model = cfg.model;
  const astra = model.startsWith("gpt-6");
  if (!/127\.0\.0\.1:1234|localhost:1234|11434/.test(cfg.baseURL)) {
    assertSpendAllowed({ model, tokens: 8000 });
  }
  const brief = productScriptBrief(product, research, formatLine);
  const completion = await client.chat.completions.create({
    model,
    ...(astra ? { reasoning_effort: "low" } : { temperature: 0.7 }),
    messages: [
      { role: "system", content: BATCH_SYSTEM },
      {
        role: "user",
        content: `${brief}\n\nFormat ids for the 4 presentation variants: ${formatIds.join(", ")}.\nProduce 12 concepts.`,
      },
    ],
  });
  const raw = (completion.choices[0]?.message?.content || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const parsed = JSON.parse(raw) as { concepts?: Record<string, unknown>[] };
  const rows = Array.isArray(parsed.concepts) ? parsed.concepts : [];
  const packs: ScriptPack[] = [];
  for (const row of rows) {
    try {
      const pack = normalizeScriptPack(row);
      assertHook(pack);
      assertProductLock(pack, research);
      packs.push(pack);
    } catch {
      /* drop drifted concept */
    }
  }
  if (packs.length < 3) throw new Error("Batch returned too few on-SKU concepts. Try Make 1, or Rewrite batch.");
  logLlmUsage(cfg, true, (completion.usage?.prompt_tokens || 0) + (completion.usage?.completion_tokens || 0), undefined, {
    input: completion.usage?.prompt_tokens,
    output: completion.usage?.completion_tokens,
  });
  return packs.slice(0, 12);
}

const BOARD_SCRIPT_SYSTEM = `You write one UGC script for AIOSCreator. Return ONLY JSON:
{"hook": string, "scenes": [{"goal": string, "spoken": string, "overlay": string, "factIds": string[]}], "cta": string}
Rules:
- Use only the supplied facts. Do not add benefits, rankings, reviews, stock, discounts, guarantees, or personal results.
- A presenter may explain and demonstrate. They must not say they bought it, wore it for weeks, or got a personal transformation.
- Say the product the way a person would: brand and model. Never say Amazon, Shopee, Tokopedia, Lazada, marketplace, or an ASIN.
- Do not convert a price into another currency. Speak a price only when an allowed offer is provided.
- Match the locale language exactly. Indonesian is not Malay. Japanese stays Japanese. Thai stays Thai.
- Scene count must equal the beat list. Keep each goal. Do not add a scene.
- For slideshow, spoken is an empty string and overlay is the slide line.
- Do not show or narrate a box, unboxing, screen recording, before/after, or test unless that asset is listed as available.
- For video, the first scene is the 0–2s hook: product visible, one reason to stop, spoken once.
- Later scenes demonstrate one confirmed fact. The CTA points to the listing without a spoken URL and without fake urgency.
- factIds must be chosen from the supplied ids. Yapping reference ads are not a source.`;

export async function generateBoardScript(
  brief: {
    productName: string;
    facts: { id: string; text: string; status: string }[];
    recipeName: string;
    family: string;
    beats: string[];
    locale: string;
    platform: string;
    offer: string;
    durationSec: number;
    missingAssets?: string[];
    chosenBrief?: string;
    instructions?: string;
  },
  cfg: LlmConfig = factoryScriptLlm(),
) {
  const client = llmClient(cfg);
  const model = cfg.model;
  const astra = model.startsWith("gpt-6");
  if (!/127\.0\.0\.1:1234|localhost:1234|11434/.test(cfg.baseURL)) {
    assertSpendAllowed({ model, tokens: 4000 });
  }
  const user = [
    `Product name to speak: ${brief.productName}`,
    `Recipe: ${brief.recipeName}. Family: ${brief.family}.`,
    `Locale: ${brief.locale}. Platform: ${brief.platform}. Brief estimate: ${brief.durationSec}s. Write spoken lines at a natural pace. The total may grow up to 30 seconds so a line is not rushed. Do not write more than 30 seconds of speech altogether. Scene time is assigned afterwards from how long each line is.`,
    brief.chosenBrief ? `Chosen brief, follow this angle only: ${brief.chosenBrief}` : "",
    "The first spoken line is that brief's hook. Later lines stay on the same angle. Do not add a hook or a claim the chosen brief does not make.",
    brief.instructions ? `Operator note: ${brief.instructions}` : "",
    `Allowed offer: ${brief.offer || "(omit price)"}`,
    `Missing assets, do not invent them: ${(brief.missingAssets || []).join(", ") || "none"}`,
    `Facts: ${JSON.stringify(brief.facts)}`,
    `Beats in order: ${brief.beats.map((beat, index) => `${index + 1}. ${beat}`).join(" | ")}`,
    "Return that many scenes and no more.",
  ].join("\n");
  let completion;
  try {
    completion = await client.chat.completions.create({
      model,
      ...(astra ? { reasoning_effort: "low" } : { temperature: 0.4 }),
      messages: [
        { role: "system", content: BOARD_SCRIPT_SYSTEM },
        { role: "user", content: user },
      ],
    });
  } catch (err) {
    const msg = err instanceof OpenAI.APIError ? `${err.status} ${err.message}` : err instanceof Error ? err.message : String(err);
    logLlmUsage(cfg, false, 0, msg);
    throw new Error(msg);
  }
  const usage = completion.usage;
  const tokens = (usage?.prompt_tokens || 0) + (usage?.completion_tokens || 0);
  const raw = (completion.choices[0]?.message?.content || "").replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  let parsed: { hook?: string; scenes?: { goal?: string; spoken?: string; overlay?: string; factIds?: string[] }[]; cta?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    logLlmUsage(cfg, false, tokens, "invalid JSON", { input: usage?.prompt_tokens, output: usage?.completion_tokens });
    throw new Error("Astra returned an incomplete script.");
  }
  logLlmUsage(cfg, true, tokens, undefined, { input: usage?.prompt_tokens, output: usage?.completion_tokens });
  return {
    hook: String(parsed.hook || ""),
    cta: String(parsed.cta || ""),
    scenes: Array.isArray(parsed.scenes) ? parsed.scenes : [],
    model,
  };
}

/** Three researched angles. Jev picks one. This does not write the spoken script. */
export async function generateBriefAngles(input: {
  productName: string;
  facts: { id: string; text: string }[];
  recipeName: string;
  locale: string;
  platform: string;
}) {
  const cfg = factoryScriptLlm(FACTORY_ASTRA_MODEL);
  const client = llmClient(cfg);
  if (!/127\.0\.0\.1:1234|localhost:1234|11434/.test(cfg.baseURL)) assertSpendAllowed({ model: cfg.model, tokens: 3000 });
  const user = [
    `Product: ${input.productName}`,
    `Recipe: ${input.recipeName}. Locale: ${input.locale}. Platform: ${input.platform}.`,
    "Do not lock a runtime. The length is chosen later, between 10 and 30 seconds.",
    `Facts: ${JSON.stringify(input.facts)}`,
    `Return ONLY JSON {"angles":[{"hook": string, "angle": string, "why": string}]} with exactly 3 angles.`,
    "Use only the facts. No marketplace names. No personal history, ranking, or guarantee. Write the hook in the locale language.",
  ].join("\n");
  const completion = await client.chat.completions.create({
    model: cfg.model,
    reasoning_effort: "low",
    messages: [
      { role: "system", content: "You research one affiliate brief. Return JSON only." },
      { role: "user", content: user },
    ],
  });
  const usage = completion.usage;
  const tokens = (usage?.prompt_tokens || 0) + (usage?.completion_tokens || 0);
  const raw = (completion.choices[0]?.message?.content || "").replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  let parsed: { angles?: { hook?: string; angle?: string; why?: string }[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    logLlmUsage(cfg, false, tokens, "invalid JSON", { input: usage?.prompt_tokens, output: usage?.completion_tokens });
    throw new Error("Astra returned an incomplete brief.");
  }
  const angles = (parsed.angles || []).slice(0, 3).map((row) => ({
    hook: String(row.hook || "").trim(),
    angle: String(row.angle || "").trim(),
    why: String(row.why || "").trim(),
  })).filter((row) => row.hook);
  if (angles.length < 2) {
    logLlmUsage(cfg, false, tokens, "too few angles", { input: usage?.prompt_tokens, output: usage?.completion_tokens });
    throw new Error("Astra returned too few brief angles.");
  }
  logLlmUsage(cfg, true, tokens, undefined, { input: usage?.prompt_tokens, output: usage?.completion_tokens });
  return angles;
}

/** Shot direction and the spoken voiceover, one row per scene. */
export async function generateStoryboardPass(input: {
  productName: string;
  locale: string;
  family: string;
  durationSec: number;
  chosenBrief?: string;
  scenes: { goal: string; spoken: string; overlay: string }[];
}) {
  const cfg = factoryScriptLlm(FACTORY_ASTRA_MODEL);
  const client = llmClient(cfg);
  if (!/127\.0\.0\.1:1234|localhost:1234|11434/.test(cfg.baseURL)) assertSpendAllowed({ model: cfg.model, tokens: 3000 });
  const user = [
    `Product: ${input.productName}`,
    `Locale: ${input.locale}. Family: ${input.family}. Duration: ${input.durationSec}s.`,
    input.chosenBrief ? `Brief: ${input.chosenBrief}` : "",
    `Scenes: ${JSON.stringify(input.scenes)}`,
    `Return ONLY JSON {"scenes":[{"shot": string, "voiceover": string}]} with exactly ${input.scenes.length} rows, same order.`,
    "shot is camera movement on what is already in the listing photo. Do not add a person, a new room, or a new product.",
    "voiceover is the spoken line in the locale language. Do not add claims that are not already in the scene.",
  ].filter(Boolean).join("\n");
  const completion = await client.chat.completions.create({
    model: cfg.model,
    reasoning_effort: "low",
    messages: [
      { role: "system", content: "You write storyboard shots and voiceover lines. Return JSON only." },
      { role: "user", content: user },
    ],
  });
  const usage = completion.usage;
  const tokens = (usage?.prompt_tokens || 0) + (usage?.completion_tokens || 0);
  const raw = (completion.choices[0]?.message?.content || "").replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  let parsed: { scenes?: { shot?: string; voiceover?: string }[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    logLlmUsage(cfg, false, tokens, "invalid JSON", { input: usage?.prompt_tokens, output: usage?.completion_tokens });
    throw new Error("Astra returned an incomplete storyboard.");
  }
  logLlmUsage(cfg, true, tokens, undefined, { input: usage?.prompt_tokens, output: usage?.completion_tokens });
  return { scenes: Array.isArray(parsed.scenes) ? parsed.scenes : [], model: cfg.model };
}
