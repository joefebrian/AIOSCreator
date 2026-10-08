import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { addApiAccount, hasWanProvider, upsertApiProvider } from "./api-providers";
import { resolveRoute, type ViaId } from "./model-routes";
import { dataRoot, ensureDataDirs } from "./paths";

export type MotionEngineId =
  | "seedance-2-5"
  | "seedance-2-5-extend"
  | "kling-3-0-std"
  | "kling-2-6"
  | "kling-3-0"
  | "dreamactor-v2"
  | "wan-3-0"
  | "wan-3-0-std"
  | "grok-imagine-video";

export type MotionProvider = {
  id: string;
  engineId: MotionEngineId;
  name: string;
  baseURL: string;
  model: string;
  apiKey: string;
  createdAt: string;
};

type Store = { providers: MotionProvider[] };

export const MOTION_PRESETS: {
  id: MotionEngineId;
  name: string;
  baseURL: string;
  model: string;
  hint: string;
}[] = [
  {
    id: "seedance-2-5",
    name: "Higgsfield · Seedance 2.5 I2V",
    baseURL: "https://api.higgsfield.ai",
    model: "bytedance/seedance-2.5/image-to-video",
    hint: "Still → 4–30s 720p + audio. Higgsfield key.",
  },
  {
    id: "seedance-2-5-extend",
    name: "Higgsfield · Seedance 2.5 Extend",
    baseURL: "https://api.higgsfield.ai",
    model: "bytedance/seedance-2.5/video-extend",
    hint: "Extend an existing clip 4–30s. Needs a source video.",
  },
  {
    id: "kling-3-0-std",
    name: "Higgsfield · Kling 3.0 Standard I2V",
    baseURL: "https://api.higgsfield.ai",
    model: "kling-video/v3.0/std/image-to-video",
    hint: "Still → 3–15s with audio. Not Motion Control. Not Pro/4K/Turbo.",
  },
  {
    id: "kling-2-6",
    name: "Kling · Motion Control 2.6",
    baseURL: "https://api-singapore.klingai.com",
    model: "kling-2.6",
    hint: "Official Kling 2.6. Still + drive → 3–30s 1080p. Same KLING_API_KEY as 3.0.",
  },
  {
    id: "kling-3-0",
    name: "Kling · Motion Control 3.0",
    baseURL: "https://api-singapore.klingai.com",
    model: "kling-3.0",
    hint: "Official Kling 3.0. Still + drive → 3–30s 1080p copy. Paid. Key also via KLING_API_KEY.",
  },
  {
    id: "dreamactor-v2",
    name: "fal.ai · DreamActor V2",
    baseURL: "https://queue.fal.run",
    model: "fal-ai/bytedance/dreamactor/v2",
    hint: "fal.ai DreamActor V2 only. Still + drive ≤30s. Key via FAL_KEY.",
  },
  {
    id: "wan-3-0",
    name: "Alibaba · Wan 3.0 Prime",
    baseURL: "https://dashscope-intl.aliyuncs.com/api/v1",
    model: "wan3.0-video-prime",
    hint: "Singapore dashscope-intl wan3.0-video-prime. Faster. Same key as Standard.",
  },
  {
    id: "wan-3-0-std",
    name: "Alibaba · Wan 3.0",
    baseURL: "https://dashscope-intl.aliyuncs.com/api/v1",
    model: "wan3.0-video",
    hint: "Singapore dashscope-intl wan3.0-video standard. Cheaper, slower.",
  },
  {
    id: "grok-imagine-video",
    name: "xAI · Grok Imagine Video 1.5",
    baseURL: "https://api.x.ai/v1",
    model: "grok-imagine-video-1.5",
    hint: "I2V 3–15s 720p 9:16. Adult-capable. Same XAI_API_KEY as Imagine stills.",
  },
];

function filePath() {
  ensureDataDirs();
  return path.join(dataRoot(), "db", "motion-providers.json");
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

function maskKey(key: string) {
  if (!key) return "";
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

function isKlingMotion(engineId: string) {
  return engineId === "kling-2-6" || engineId === "kling-3-0";
}

function envKeyFor(engineId: string) {
  if (engineId === "seedance-2-5" || engineId === "seedance-2-5-extend" || engineId === "kling-3-0-std") {
    const id = (process.env.HIGGSFIELD_API_KEY_ID || "").trim();
    const secret = (process.env.HIGGSFIELD_API_KEY_SECRET || "").trim();
    if (id && secret) return `${id}:${secret}`;
    return process.env.COMETAPI_KEY?.trim() || "";
  }
  if (isKlingMotion(engineId)) return process.env.KLING_API_KEY?.trim() || "";
  if (engineId === "dreamactor-v2") return (process.env.FAL_KEY || process.env.FAL_API_KEY || "").trim();
  if (engineId === "wan-3-0" || engineId === "wan-3-0-std") return (process.env.DASHSCOPE_WAN_API_KEY || "").trim();
  if (engineId === "grok-imagine-video") {
    return (process.env.XAI_VIDEO_API_KEY || process.env.XAI_API_KEY || "").trim();
  }
  return "";
}

export function hasMotionProvider(engineId: string) {
  if (engineId === "wan-3-0" || engineId === "wan-3-0-std") return hasWanProvider();
  if (resolveRoute(engineId)) return true;
  const saved = readStore().providers;
  if (saved.some((p) => p.engineId === engineId && p.apiKey)) return true;
  if (isKlingMotion(engineId) && saved.some((p) => isKlingMotion(p.engineId) && p.apiKey)) return true;
  return Boolean(envKeyFor(engineId));
}

export function getMotionProvider(engineId: string, via?: ViaId): MotionProvider | undefined {
  const hit = resolveRoute(engineId, via ?? "auto");
  if (hit && hit.provider !== "comfy" && hit.apiKey) {
    return {
      id: hit.provider,
      engineId: engineId as MotionEngineId,
      name: hit.name,
      baseURL: hit.baseURL,
      model: hit.model,
      apiKey: hit.apiKey,
      createdAt: "",
    };
  }
  const saved = readStore().providers.find((p) => p.engineId === engineId && p.apiKey)
    || (isKlingMotion(engineId) ? readStore().providers.find((p) => isKlingMotion(p.engineId) && p.apiKey) : undefined);
  if (saved) {
    if (saved.engineId === engineId) return saved;
    const preset = MOTION_PRESETS.find((p) => p.id === engineId);
    return preset ? { ...saved, engineId: engineId as MotionEngineId, name: preset.name, model: preset.model } : saved;
  }
  const envKey = envKeyFor(engineId);
  if (!envKey) return undefined;
  const preset = MOTION_PRESETS.find((p) => p.id === engineId);
  if (!preset) return undefined;
  return {
    id: "env",
    engineId: engineId as MotionEngineId,
    name: preset.name,
    baseURL: preset.baseURL,
    model: preset.model,
    apiKey: envKey,
    createdAt: "",
  };
}

export function listMotionProviders() {
  return {
    presets: MOTION_PRESETS,
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

export function addMotionProvider(input: {
  engineId: MotionEngineId;
  name?: string;
  baseURL?: string;
  model?: string;
  apiKey: string;
}) {
  const preset = MOTION_PRESETS.find((p) => p.id === input.engineId);
  if (!preset) throw new Error("unknown motion engine");
  const apiKey = input.apiKey.trim();
  if (!apiKey) throw new Error("api key required");
  const row: MotionProvider = {
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
  if (row.engineId === "seedance-2-5-extend" || row.engineId === "kling-3-0-std") {
    upsertApiProvider("higgsfield", row.apiKey, row.baseURL);
  } else if (row.engineId === "seedance-2-5" && (row.baseURL || "").includes("higgsfield")) {
    upsertApiProvider("higgsfield", row.apiKey, row.baseURL);
  }
  if (isKlingMotion(row.engineId)) upsertApiProvider("kling", row.apiKey, row.baseURL);
  if (row.engineId === "dreamactor-v2") upsertApiProvider("fal", row.apiKey, row.baseURL);
  if (row.engineId === "wan-3-0" || row.engineId === "wan-3-0-std") {
    addApiAccount("dashscope", row.apiKey, {
      baseURL: row.baseURL || "https://dashscope-intl.aliyuncs.com/api/v1",
      label: "wan-3.0",
      tier: "paid",
      note: "Wan 3.0 video only. Singapore. Separate from Qwen LLM.",
    });
  }
  if (row.engineId === "grok-imagine-video") upsertApiProvider("xai", row.apiKey, row.baseURL);
  return row.id;
}

export function deleteMotionProvider(id: string) {
  const store = readStore();
  store.providers = store.providers.filter((p) => p.id !== id);
  writeStore(store);
}
