import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { upsertApiProvider, type ApiProviderId } from "./api-providers";
import { resolveRoute, type ViaId } from "./model-routes";
import { dataRoot, ensureDataDirs } from "./paths";

export type ImageEngineId = "gpt-image-2.5" | "gpt-image-2" | "seedream-5-pro" | "seedream-4-5" | "nano-banana";

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
    id: "gpt-image-2",
    name: "OpenAI · GPT Image 2",
    baseURL: "https://api.openai.com/v1",
    model: "gpt-image-2",
    hint: "Official Images API. Paid OpenAI key. Best photoreal identity plates.",
  },
  {
    id: "seedream-5-pro",
    name: "BytePlus · Seedream 5.0 Pro",
    baseURL: "https://ark.ap-southeast.bytepluses.com/api/v3",
    model: "seedream-5-0-pro",
    hint: "Official Ark API, or CometAPI if Seedance key exists. Multi-reference stills.",
  },
  {
    id: "seedream-4-5",
    name: "HensunAI · Seedream 4.5",
    baseURL: "https://hensunai.com",
    model: "ByteDance-Seedream-4.5",
    hint: "NewAPI on hensunai.com. ByteDance-Seedream-4.5 stills.",
  },
  {
    id: "nano-banana",
    name: "Comet · Nano Banana",
    baseURL: "https://api.cometapi.com",
    model: "gemini-2.5-flash-image",
    hint: "Google Gemini Flash Image via Comet. Same key as Seedance.",
  },
];

function fromRoute(engineId: ImageEngineId, via?: ViaId): ImageProvider | undefined {
  const hit = resolveRoute(engineId, via ?? "auto");
  if (!hit || hit.provider === "comfy" || !hit.apiKey) return undefined;
  const baseURL =
    hit.provider === "comet" && engineId === "nano-banana"
      ? "https://api.cometapi.com"
      : hit.provider === "comet"
        ? "https://api.cometapi.com/v1"
        : hit.baseURL;
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
  if (u.includes("cometapi")) return "comet";
  if (u.includes("openai.com")) return "openai";
  if (u.includes("byteplus") || u.includes("volces") || u.includes("ark.")) return "byteplus";
  if (u.includes("wavespeed")) return "wavespeed";
  if (u.includes("hensunai")) return "hensun";
  if (engineId === "seedream-4-5") return "hensun";
  if (engineId === "nano-banana") return "comet";
  if (engineId === "gpt-image-2" || engineId === "gpt-image-2.5") return "openai";
  return "byteplus";
}

export function deleteImageProvider(id: string) {
  const store = readStore();
  store.providers = store.providers.filter((p) => p.id !== id);
  writeStore(store);
}
