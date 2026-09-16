import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { addApiAccount, hasWanProvider, upsertApiProvider } from "./api-providers";
import { resolveRoute, type ViaId } from "./model-routes";
import { dataRoot, ensureDataDirs } from "./paths";

export type MotionEngineId = "seedance-2-5" | "seedance-2-0" | "kling-2-6" | "kling-3-0" | "dreamactor-v2" | "wan-3-0" | "wan-3-0-std";

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
    id: "seedance-2-0",
    name: "HensunAI · Seedance 2.0",
    baseURL: "https://hensunai.com",
    model: "Dreamina-Seedance-2.0",
    hint: "NewAPI on hensunai.com. Dreamina-Seedance-2.0 I2V.",
  },
  {
    id: "seedance-2-5",
    name: "CometAPI · Seedance 2.5",
    baseURL: "https://api.cometapi.com",
    model: "seedance-2-5",
    hint: "Paid CometAPI. Still → 4–30s 720p I2V. Not motion copy. Key also via COMETAPI_KEY.",
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
    hint: "Singapore wan3.0-video-prime. Faster. $0.14/s 720p. Same key as Standard.",
  },
  {
    id: "wan-3-0-std",
    name: "Alibaba · Wan 3.0",
    baseURL: "https://dashscope-intl.aliyuncs.com/api/v1",
    model: "wan3.0-video",
    hint: "Singapore wan3.0-video standard. Cheaper, slower. ~$0.07/s 720p promo.",
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
  if (engineId === "seedance-2-5") return process.env.COMETAPI_KEY?.trim() || "";
  if (isKlingMotion(engineId)) return process.env.KLING_API_KEY?.trim() || "";
  if (engineId === "dreamactor-v2") return (process.env.FAL_KEY || process.env.FAL_API_KEY || "").trim();
  if (engineId === "wan-3-0" || engineId === "wan-3-0-std") return (process.env.DASHSCOPE_WAN_API_KEY || "").trim();
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
  if (row.engineId === "seedance-2-5" && (row.baseURL || "").includes("hensunai")) {
    upsertApiProvider("hensun", row.apiKey, row.baseURL);
  } else if (row.engineId === "seedance-2-5") upsertApiProvider("comet", row.apiKey, row.baseURL);
  if (row.engineId === "seedance-2-0") upsertApiProvider("hensun", row.apiKey, row.baseURL);
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
  return row.id;
}

export function deleteMotionProvider(id: string) {
  const store = readStore();
  store.providers = store.providers.filter((p) => p.id !== id);
  writeStore(store);
}
