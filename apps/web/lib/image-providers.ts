import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { upsertApiProvider, type ApiProviderId } from "./api-providers";
import { resolveRoute, type ViaId } from "./model-routes";
import { dataRoot, ensureDataDirs } from "./paths";

export type ImageEngineId =
  | "gpt-image-2.5"
  | "gpt-image-2.5-flare"
  | "gpt-image-2"
  | "seedream-5-pro"
  | "seedream-5-lite"
  | "seedream-4-5"
  | "muse-image-1.0"
  | "qwen-image-3.0"
  | "nano-banana"
  | "grok-imagine"
  | "grok-imagine-tryon"
  | "kling-image-omni"
  | "kolors-virtual-try-on"
  | "marketing-studio-image";

export type ImageProvider = {
  id: string;
  engineId: ImageEngineId;
  name: string;
  baseURL: string;
  model: string;
  apiKey: string;
  createdAt: string;
};

type Store = { providers: ImageProvider[] };

export const IMAGE_PRESETS: {
  id: ImageEngineId;
  name: string;
  baseURL: string;
  model: string;
  hint: string;
}[] = [
  {
    id: "gpt-image-2.5",
    name: "OpenAI · GPT Image 2.5 Sunburst",
    baseURL: "https://api.openai.com/v1",
    model: "gpt-image-2.5-sunburst",
    hint: "Character complete set. Official key Character_Generation. Precision, hands/feet.",
  },
  {
    id: "gpt-image-2.5-flare",
    name: "OpenAI · GPT Image 2.5 Flare",
    baseURL: "https://api.openai.com/v1",
    model: "gpt-image-2.5-flare",
    hint: "Everyday UGC / product stills. Same OpenAI key. Quality medium — faster, cheaper than Sunburst.",
  },
  {
    id: "gpt-image-2",
    name: "OpenAI · GPT Image 2",
    baseURL: "https://api.openai.com/v1",
    model: "gpt-image-2",
    hint: "Official Images API. Paid OpenAI key. Best photoreal identity plates.",
  },
  {
    id: "seedream-5-pro",
    name: "BytePlus · Seedream 5.0",
    baseURL: "https://ark.ap-southeast.bytepluses.com/api/v3",
    model: "dola-seedream-5-0-pro-260628",
    hint: "ModelArk ap-southeast-1. Precision stills. Same ARK key as Lite/4.5.",
  },
  {
    id: "seedream-5-lite",
    name: "BytePlus · Seedream 5.0 Lite",
    baseURL: "https://ark.ap-southeast.bytepluses.com/api/v3",
    model: "seedream-5-0-lite-260128",
    hint: "Faster 5.0. 2K/3K. Same BytePlus ARK key.",
  },
  {
    id: "seedream-4-5",
    name: "BytePlus · Seedream 4.5",
    baseURL: "https://ark.ap-southeast.bytepluses.com/api/v3",
    model: "seedream-4-5-251128",
    hint: "2K/4K. Same BytePlus ARK key.",
  },
  {
    id: "muse-image-1.0",
    name: "Meta · Muse Image 1.0",
    baseURL: "https://api.meta.ai/v1",
    model: "muse-image-1.0",
    hint: "OpenAI-compatible images API. Generate + multi-ref edit. $0.01/image.",
  },
  {
    id: "qwen-image-3.0",
    name: "Alibaba · Qwen Image 3.0 Pro",
    baseURL: "https://dashscope-intl.aliyuncs.com/api/v1",
    model: "qwen-image-3.0-pro",
    hint: "Singapore DashScope multimodal. Same Qwen LLM key, not Wan video. 1–3 refs. ~$0.04/1K.",
  },
  {
    id: "nano-banana",
    name: "Nano Banana · Gemini",
    baseURL: "",
    model: "gemini-2.5-flash-image",
    hint: "Was Comet-only. Pipe removed — no remaining provider.",
  },
  {
    id: "grok-imagine",
    name: "xAI · Grok Imagine 2.0",
    baseURL: "https://api.x.ai/v1",
    model: "grok-imagine-image-2.0",
    hint: "Adult 18+ stills. XAI_API_KEY. Not the LLM key.",
  },
  {
    id: "grok-imagine-tryon",
    name: "xAI · Grok Imagine try-on",
    baseURL: "https://api.x.ai/v1",
    model: "grok-imagine-image-quality",
    hint: "Virtual try-on. Same xAI Imagine key. Person + garment. 2K quality.",
  },
  {
    id: "kling-image-omni",
    name: "Kling · Image 3.0 Omni",
    baseURL: "https://api-singapore.klingai.com",
    model: "kling-v3-omni",
    hint: "Same Kling key as Motion Control. Person + SKU via omni-image. Kolors try-on retired.",
  },
  {
    id: "kolors-virtual-try-on",
    name: "Kling · Kolors try-on v1.5",
    baseURL: "https://api-singapore.klingai.com",
    model: "kolors-virtual-try-on-v1-5",
    hint: "Retired 2026-09-15. Use Kling Image Omni.",
  },
  {
    id: "marketing-studio-image",
    name: "Higgsfield · Marketing Studio Image",
    baseURL: "https://api.higgsfield.ai",
    model: "marketing-studio/image",
    hint: "Campaign stills. Product + optional model refs. ~$0.006/image.",
  },
];

function fromRoute(engineId: ImageEngineId, via?: ViaId): ImageProvider | undefined {
  const hit = resolveRoute(engineId, via ?? "auto");
  if (!hit || hit.provider === "comfy" || !hit.apiKey) return undefined;
  const baseURL = hit.baseURL;
  return {
    id: hit.provider,
    engineId,
    name: hit.name,
    baseURL,
    model: hit.model,
    apiKey: hit.apiKey,
    createdAt: "",
  };
}

function filePath() {
  ensureDataDirs();
  return path.join(dataRoot(), "db", "image-providers.json");
}

function readStore(): Store {
  const file = filePath();
  if (!fs.existsSync(file)) return { providers: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Store;
    return Array.isArray(parsed.providers) ? parsed : { providers: [] };
  } catch {
    return { providers: [] };
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

export function hasImageProvider(engineId: string) {
  if (readStore().providers.some((p) => p.engineId === engineId && p.apiKey)) return true;
  return Boolean(fromRoute(engineId as ImageEngineId));
}

export function getImageProvider(engineId: string, via?: ViaId): ImageProvider | undefined {
  return fromRoute(engineId as ImageEngineId, via) || readStore().providers.find((p) => p.engineId === engineId && p.apiKey);
}

export function listImageProviders() {
  return {
    presets: IMAGE_PRESETS,
    providers: readStore().providers.map((p) => ({
      id: p.id,
      engineId: p.engineId,
      name: p.name,
      baseURL: p.baseURL,
      model: p.model,
      keyHint: maskKey(p.apiKey),
      createdAt: p.createdAt,
    })),
  };
}

export function addImageProvider(input: {
  engineId: ImageEngineId;
  name?: string;
  baseURL?: string;
  model?: string;
  apiKey: string;
}) {
  const preset = IMAGE_PRESETS.find((p) => p.id === input.engineId);
  if (!preset) throw new Error("unknown image engine");
  const apiKey = input.apiKey.trim();
  if (!apiKey) throw new Error("api key required");
  const row: ImageProvider = {
    id: randomUUID(),
    engineId: input.engineId,
    name: (input.name ?? "").trim() || preset.name,
    baseURL: (input.baseURL ?? preset.baseURL).trim().replace(/\/$/, ""),
    model: (input.model ?? preset.model).trim() || preset.model,
    apiKey,
    createdAt: new Date().toISOString(),
  };
  const store = readStore();
  store.providers = store.providers.filter((p) => p.engineId !== row.engineId);
  store.providers.push(row);
  writeStore(store);
  upsertApiProvider(inferApiProvider(row.engineId, row.baseURL), row.apiKey, row.baseURL);
  return row.id;
}

function inferApiProvider(engineId: ImageEngineId, baseURL: string): ApiProviderId {
  const u = baseURL.toLowerCase();
  if (u.includes("meta.ai")) return "meta";
  if (u.includes("openai.com")) return "openai";
  if (u.includes("x.ai") || u.includes("xai")) return "xai";
  if (u.includes("byteplus") || u.includes("volces") || u.includes("ark.")) return "byteplus";
  if (u.includes("wavespeed")) return "wavespeed";

  if (engineId === "nano-banana") throw new Error("Nano Banana has no remaining provider (Comet removed).");
  if (engineId === "gpt-image-2" || engineId === "gpt-image-2.5" || engineId === "gpt-image-2.5-flare") return "openai";
  if (engineId === "grok-imagine" || engineId === "grok-imagine-tryon") return "xai";
  if (engineId === "kolors-virtual-try-on" || engineId === "kling-image-omni") return "kling";
  if (engineId === "marketing-studio-image") return "higgsfield";
  if (engineId === "muse-image-1.0") return "meta";
  if (engineId === "qwen-image-3.0") return "dashscope";
  if (engineId === "seedream-5-pro" || engineId === "seedream-5-lite" || engineId === "seedream-4-5") return "byteplus";
  return "byteplus";
}

export function deleteImageProvider(id: string) {
  const store = readStore();
  store.providers = store.providers.filter((p) => p.id !== id);
  writeStore(store);
}
