import OpenAI from "openai";
import { logCloudUsage } from "./cloud-usage";
import { activeProvider, revampProvider } from "./providers";
import { assertSpendAllowed } from "./spend-cap";

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

export function llmClient() {
  const { apiKey, baseURL, headers } = llmConfig();
  return new OpenAI({ apiKey, baseURL, timeout: 120_000, defaultHeaders: headers });
}

export function revampLlmClient() {
  const { apiKey, baseURL, headers } = revampLlmConfig();
  return new OpenAI({ apiKey, baseURL, timeout: 180_000, defaultHeaders: headers });
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

function logLlmUsage(model: string, ok: boolean, tokens: number, error?: string) {
  const cfg = llmConfig();
  const providerId = /dashscope|aliyuncs/i.test(cfg.baseURL)
    ? "dashscope"
    : /openrouter/i.test(cfg.baseURL)
      ? "openrouter"
      : /127\.0\.0\.1:1234|localhost:1234/i.test(cfg.baseURL)
        ? "lmstudio"
        : "openrouter";
  if (providerId === "lmstudio") return;
  logCloudUsage({
    at: new Date().toISOString(),
    accountId: providerId,
    providerId,
    model,
    ok,
    ms: 0,
    baseURL: cfg.baseURL,
    kind: "script",
    tokens,
    units: tokens,
    unit: "token",
    error,
  });
}

export type ScriptPack = {
  title: string;
  hook: string;
  voiceover: string;
  scenes: string[];
  cta: string;
  platforms: string[];
};

export async function generateScript(input: string): Promise<ScriptPack> {
  const client = llmClient();
  const model = llmModel();
  if (!/127\.0\.0\.1:1234|localhost:1234|11434/.test(llmConfig().baseURL)) {
    assertSpendAllowed({ model, tokens: 4000 });
  }
  let completion;
  try {
    completion = await client.chat.completions.create({
      model,
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content: `You write 9:16 UGC scripts for CreatorOS / AIOSCreator (P2P Labs).
Return ONLY valid JSON with keys:
title, hook, voiceover, scenes (array of 3-5 short visual beats), cta, platforms (array).
Rules:
- Honest claims only. No invented GMV, followers, or "guaranteed sales".
- 15-35 seconds spoken. Hook in first 2 seconds.
- Platforms default: TikTok, YouTube Shorts.
- If input is a URL, treat it as a product page. Do not invent the brand if unknown — say "this product".
- If the operator names an angle (review, unboxing, hold, talking, lifestyle), write the script in that angle. Do not invent claims.
- English voiceover. Indonesian allowed only if the operator wrote ID.`,
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
    logLlmUsage(model, false, 0, msg);
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
    logLlmUsage(model, false, tokens, "invalid JSON");
    throw new Error("Model returned an incomplete script pack");
  }
  if (!parsed.title || !parsed.voiceover) {
    logLlmUsage(model, false, tokens, "incomplete script pack");
    throw new Error("Model returned an incomplete script pack");
  }
  logLlmUsage(model, true, tokens);
  return {
    title: String(parsed.title),
    hook: String(parsed.hook ?? ""),
    voiceover: String(parsed.voiceover),
    scenes: Array.isArray(parsed.scenes) ? parsed.scenes.map(String) : [],
    cta: String(parsed.cta ?? ""),
    platforms: Array.isArray(parsed.platforms)
      ? parsed.platforms.map(String)
      : ["TikTok", "YouTube Shorts"],
  };
}
