import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataRoot, ensureDataDirs } from "./paths";

export type LlmProvider = {
  id: string;
  name: string;
  baseURL: string;
  model: string;
  apiKey: string;
  headers?: Record<string, string>;
  createdAt: string;
};

export type RevampMode = "lmstudio" | "openrouter";

type Store = {
  activeId: string | null;
  providers: LlmProvider[];
  revampMode?: RevampMode | null;
  revampLm?: LlmProvider | null;
  revampOr?: LlmProvider | null;
  /** @deprecated migrated into revampLm / revampOr */
  revamp?: LlmProvider | null;
  /** TypeSafe Jev via OpenRouter Decisions API — not a chat LLM. */
  jev?: { apiKey: string; model: string; createdAt: string };
};

export const PRESETS: {
  id: string;
  name: string;
  baseURL: string;
  model: string;
  hint: string;
  headers?: Record<string, string>;
}[] = [
  {
    id: "openrouter-free",
    name: "OpenRouter · free (general)",
    baseURL: "https://openrouter.ai/api/v1",
    model: "openai/gpt-oss-20b:free",
    hint: "Optional general LLM. Character Revamp is a separate Qwen3 Coder slot below.",
    headers: { "HTTP-Referer": "http://localhost:3000", "X-Title": "CreatorOS" },
  },
  {
    id: "openrouter",
    name: "OpenRouter · gpt-oss-20b free",
    baseURL: "https://openrouter.ai/api/v1",
    model: "openai/gpt-oss-20b:free",
    hint: "Lighter :free pin if Qwen3 Coder is rate-limited. Same OpenRouter key.",
    headers: { "HTTP-Referer": "http://localhost:3000", "X-Title": "CreatorOS" },
  },
  {
    id: "xai",
    name: "xAI / SpaceXAI",
    baseURL: "https://api.x.ai/v1",
    model: "grok-4.6",
    hint: "Needs credits on the xAI team",
  },
  {
    id: "openai",
    name: "OpenAI",
    baseURL: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    hint: "Paid OpenAI key",
  },
  {
    id: "groq",
    name: "Groq",
    baseURL: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
    hint: "Fast OpenAI-compatible",
  },
  {
    id: "ollama",
    name: "Ollama local",
    baseURL: "http://127.0.0.1:11434/v1",
    model: "llama3.2",
    hint: "No cloud key — api key can be ollama",
  },
  {
    id: "dashscope",
    name: "Alibaba · Qwen 3.7 Plus (scripts)",
    baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    model: "qwen3.7-plus",
    hint: "Singapore. Script / VO LLM. 1M free tokens (90d). Not Wan video. Not China Beijing.",
  },
  {
    id: "lmstudio",
    name: "LM Studio local",
    baseURL: "http://127.0.0.1:1234/v1",
    model: "local-model",
    hint: "OpenAI-compatible. Load a GGUF, Start server on 1234. GPU stays with Comfy if you offload LLM to RAM.",
  },
  {
    id: "custom",
    name: "Custom OpenAI-compatible",
    baseURL: "https://",
    model: "",
    hint: "Any /v1 chat/completions host",
  },
];

function filePath() {
  ensureDataDirs();
  return path.join(dataRoot(), "db", "llm-providers.json");
}

function migrateRevamp(store: Store): Store {
  if (store.revamp && !store.revampLm && !store.revampOr) {
    if (/1234/.test(store.revamp.baseURL || "")) {
      store.revampLm = store.revamp;
      store.revampMode = store.revampMode || "lmstudio";
    } else {
      store.revampOr = store.revamp;
      store.revampMode = store.revampMode || "openrouter";
    }
  }
  if (!store.revampMode) {
    if (store.revampLm) store.revampMode = "lmstudio";
    else if (store.revampOr) store.revampMode = "openrouter";
  }
  return store;
}

function readStore(): Store {
  const file = filePath();
  if (!fs.existsSync(file)) return { activeId: null, providers: [] };
  try {
    return migrateRevamp(JSON.parse(fs.readFileSync(file, "utf8")) as Store);
  } catch {
    return { activeId: null, providers: [] };
  }
}

function writeStore(store: Store) {
  fs.writeFileSync(filePath(), JSON.stringify(store, null, 2), "utf8");
}

export function maskKey(key: string) {
  if (!key) return "";
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

export function listProviders() {
  const store = readStore();
  return {
    activeId: store.activeId,
    providers: store.providers.map((p) => ({
      id: p.id,
      name: p.name,
      baseURL: p.baseURL,
      model: p.model,
      keyHint: maskKey(p.apiKey),
      createdAt: p.createdAt,
    })),
  };
}

export function addProvider(input: {
  name: string;
  baseURL: string;
  model: string;
  apiKey: string;
  headers?: Record<string, string>;
  activate?: boolean;
}) {
  const apiKey = input.apiKey.trim();
  const baseURL = input.baseURL.trim().replace(/\/$/, "");
  const model = input.model.trim();
  const name = input.name.trim() || "LLM";
  if (!apiKey) throw new Error("api key required");
  if (!baseURL) throw new Error("base URL required");
  if (!model) throw new Error("model required");
  const store = readStore();
  const row: LlmProvider = {
    id: randomUUID(),
    name,
    baseURL,
    model,
    apiKey,
    headers: input.headers,
    createdAt: new Date().toISOString(),
  };
  store.providers.push(row);
  if (input.activate !== false || !store.activeId) store.activeId = row.id;
  writeStore(store);
  return row.id;
}

export function activateProvider(id: string) {
  const store = readStore();
  if (!store.providers.some((p) => p.id === id)) throw new Error("provider not found");
  store.activeId = id;
  writeStore(store);
}

export function deactivateProvider() {
  const store = readStore();
  store.activeId = null;
  writeStore(store);
}

export function deleteProvider(id: string) {
  const store = readStore();
  store.providers = store.providers.filter((p) => p.id !== id);
  if (store.activeId === id) store.activeId = store.providers[0]?.id ?? null;
  writeStore(store);
}

export function activeProvider(): LlmProvider | undefined {
  const store = readStore();
  return store.providers.find((p) => p.id === store.activeId);
}

/** OpenRouter key even if Revamp mode is LM Studio. */
export function openRouterAccount(): LlmProvider | undefined {
  const store = readStore();
  if (store.revampOr?.apiKey) return store.revampOr;
  return store.providers.find((p) => (p.baseURL || "").includes("openrouter.ai") && p.apiKey);
}

export function revampProvider(): LlmProvider | undefined {
  const store = readStore();
  if (store.revampMode === "lmstudio") return store.revampLm || undefined;
  if (store.revampMode === "openrouter") return store.revampOr || undefined;
  return store.revampLm || store.revampOr || store.revamp || undefined;
}

export function revampStatus() {
  const store = readStore();
  const pub = (p?: LlmProvider | null) =>
    p ? { name: p.name, model: p.model, baseURL: p.baseURL, keyHint: maskKey(p.apiKey) } : null;
  return {
    mode: store.revampMode || null,
    lmstudio: pub(store.revampLm),
    openrouter: pub(store.revampOr),
    active: pub(revampProvider()),
  };
}

function defaultLm(): LlmProvider {
  return {
    id: randomUUID(),
    name: "LM Studio · Revamp",
    baseURL: "http://127.0.0.1:1234/v1",
    model: "local-model",
    apiKey: "lm-studio",
    createdAt: new Date().toISOString(),
  };
}

export function setRevampMode(mode: RevampMode) {
  const store = readStore();
  if (mode === "lmstudio") {
    store.revampLm = store.revampLm || defaultLm();
    store.revampMode = "lmstudio";
    writeStore(store);
    return store.revampLm;
  }
  if (!store.revampOr?.apiKey) {
    const fromList = store.providers.find((p) => (p.baseURL || "").includes("openrouter.ai") && p.apiKey);
    if (fromList) {
      store.revampOr = {
        ...fromList,
        id: store.revampOr?.id || randomUUID(),
        name: "OpenRouter · Revamp",
        model: "qwen/qwen3-coder:free",
      };
    }
  }
  if (!store.revampOr?.apiKey) throw new Error("Save an OpenRouter key first — it stays stored when you switch to LM Studio.");
  store.revampMode = "openrouter";
  writeStore(store);
  return store.revampOr;
}

export function saveRevamp(input: {
  apiKey?: string;
  name?: string;
  baseURL?: string;
  model?: string;
}): LlmProvider {
  const store = readStore();
  const baseURL = (input.baseURL || "").trim().replace(/\/$/, "");
  const local = /127\.0\.0\.1:1234|localhost:1234/i.test(baseURL) || input.name === "lmstudio";
  if (local) {
    const row: LlmProvider = {
      id: store.revampLm?.id || randomUUID(),
      name: "LM Studio · Revamp",
      baseURL: "http://127.0.0.1:1234/v1",
      model: (input.model || store.revampLm?.model || "local-model").trim(),
      apiKey: (input.apiKey || "lm-studio").trim(),
      createdAt: store.revampLm?.createdAt || new Date().toISOString(),
    };
    store.revampLm = row;
    store.revampMode = "lmstudio";
    writeStore(store);
    return row;
  }
  const apiKey = (input.apiKey || "").trim();
  if (!apiKey) throw new Error("OpenRouter key required");
  const row: LlmProvider = {
    id: store.revampOr?.id || randomUUID(),
    name: "OpenRouter · Revamp",
    baseURL: "https://openrouter.ai/api/v1",
    model: (input.model || "qwen/qwen3-coder:free").trim(),
    apiKey,
    headers: { "HTTP-Referer": "http://localhost:3000", "X-Title": "CreatorOS" },
    createdAt: store.revampOr?.createdAt || new Date().toISOString(),
  };
  store.revampOr = row;
  store.revampMode = "openrouter";
  writeStore(store);
  return row;
}

export function clearRevamp() {
  const store = readStore();
  store.revampMode = null;
  writeStore(store);
}

export function jevConfig() {
  const store = readStore();
  const apiKey =
    (store.jev?.apiKey || "").trim() ||
    (process.env.OPENROUTER_API_KEY || "").trim() ||
    (openRouterAccount()?.apiKey || "").trim();
  return {
    apiKey,
    model: store.jev?.model || "typesafe/jev-1.13",
    keyHint: maskKey(apiKey),
    ready: Boolean(apiKey),
  };
}

export function saveJevKey(apiKey: string, model = "typesafe/jev-1.13") {
  const key = apiKey.trim();
  if (!key) throw new Error("OpenRouter key required for Jev");
  const store = readStore();
  store.jev = {
    apiKey: key,
    model,
    createdAt: store.jev?.createdAt || new Date().toISOString(),
  };
  writeStore(store);
  return jevConfig();
}
