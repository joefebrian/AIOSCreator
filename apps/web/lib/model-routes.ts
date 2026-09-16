import { getApiProvider, getOpenaiAccount, getWanAccount, hasApiProvider, hasWanProvider, type ApiProviderId } from "./api-providers";

export type ViaId = ApiProviderId | "comfy" | "auto";

type RouteHit = {
  provider: ApiProviderId | "comfy";
  name: string;
  baseURL: string;
  apiKey: string;
  model: string;
  wired: boolean;
};

const PROVIDER_NAME: Record<ApiProviderId | "comfy", string> = {
  comfy: "Local Comfy",
  comet: "CometAPI",
  openai: "OpenAI",
  byteplus: "BytePlus",
  kling: "Kling",
  wavespeed: "Wavespeed",
  hensun: "HensunAI",
  fal: "fal.ai",
  dashscope: "Alibaba Model Studio",
};

/** Preference order. First keyed provider wins unless via is pinned. */
export const MODEL_ROUTES: Record<string, Array<ApiProviderId | "comfy">> = {
  "gpt-image-2.5": ["openai"],
  "gpt-image-2": ["comet", "openai"],
  "seedream-5-pro": ["comet", "byteplus"],
  "seedream-4-5": ["hensun"],
  "nano-banana": ["comet"],
  "seedance-2-5": ["hensun", "comet", "wavespeed", "byteplus"],
  "seedance-2-0": ["hensun"],
  "kling-2-6": ["kling"],
  "kling-3-0": ["kling"],
  "dreamactor-v2": ["fal"],
  "wan-3-0": ["dashscope"],
  "wan-3-0-std": ["dashscope"],
  "flux2-klein-4b": ["comfy"],
  "flux2-klein-base-9b": ["comfy"],
  sd15: ["comfy"],
  "z-image-turbo": ["comfy"],
  "qwen-image-edit": ["comfy"],
  "klein-qwen": ["comfy"],
  "minimax-h3": ["comfy"],
  "minimax-h3-long": ["comfy"],
  "minimax-h3-r2v": ["comfy"],
  "minimax-h3-nude": ["comfy"],
  "minimax-h3-r2v-nude": ["comfy"],
  "wan22-5b": ["comfy"],
  "ltx2-19b": ["comfy"],
  "hyvideo15-480": ["comfy"],
  "ffmpeg-4k": ["comfy"],
};

/** Callable today. Catalog can list more pipes; Auto never picks an unwired one. */
const WIRED: Record<string, Array<ApiProviderId | "comfy">> = {
  "gpt-image-2.5": ["openai"],
  "gpt-image-2": ["comet", "openai"],
  "seedream-5-pro": ["comet", "byteplus"],
  "seedream-4-5": ["hensun"],
  "nano-banana": ["comet"],
  "seedance-2-5": ["hensun", "comet"],
  "seedance-2-0": ["hensun"],
  "kling-2-6": ["kling"],
  "kling-3-0": ["kling"],
  "dreamactor-v2": ["fal"],
  "wan-3-0": ["dashscope"],
  "wan-3-0-std": ["dashscope"],
};

export function isWired(modelId: string, provider: ApiProviderId | "comfy") {
  if (provider === "comfy") return true;
  const live = WIRED[modelId];
  if (!live) return false;
  return live.includes(provider);
}

export const MODEL_SLUG: Partial<Record<string, Partial<Record<ApiProviderId, string>>>> = {
  "gpt-image-2.5": { openai: "gpt-image-2.5-sunburst" },
  "gpt-image-2": { comet: "gpt-image-2", openai: "gpt-image-2" },
  "seedream-5-pro": { comet: "seedream-5-0-pro-260628", byteplus: "seedream-5-0-pro" },
  "seedream-4-5": { hensun: "ByteDance-Seedream-4.5" },
  "nano-banana": { comet: "gemini-2.5-flash-image" },
  "seedance-2-5": { hensun: "Dreamina-Seedance-2.5", comet: "seedance-2-5" },
  "seedance-2-0": { hensun: "Dreamina-Seedance-2.0" },
  "kling-2-6": { kling: "kling-2.6" },
  "kling-3-0": { kling: "kling-3.0" },
  "dreamactor-v2": { fal: "fal-ai/bytedance/dreamactor/v2" },
  "wan-3-0": { dashscope: "wan3.0-video-prime" },
  "wan-3-0-std": { dashscope: "wan3.0-video" },
};

export function routesFor(modelId: string): Array<ApiProviderId | "comfy"> {
  return MODEL_ROUTES[modelId] ?? ["comfy"];
}

export function routeStatus(modelId: string) {
  return routesFor(modelId).map((id) => {
    const keyed =
      id === "comfy"
        ? true
        : (modelId === "wan-3-0" || modelId === "wan-3-0-std") && id === "dashscope"
          ? hasWanProvider()
          : modelId === "gpt-image-2.5" && id === "openai"
            ? Boolean(getOpenaiAccount())
            : hasApiProvider(id);
    const wired = isWired(modelId, id);
    return {
      id,
      name: PROVIDER_NAME[id],
      ready: keyed && wired,
      wired,
      keyed,
    };
  });
}

function hitFor(
  modelId: string,
  id: ApiProviderId | "comfy",
): RouteHit | undefined {
  if (id === "comfy") {
    return {
      provider: "comfy",
      name: "Local Comfy",
      baseURL: "http://127.0.0.1:8188",
      apiKey: "",
      model: modelId,
      wired: true,
    };
  }
  const creds =
    (modelId === "wan-3-0" || modelId === "wan-3-0-std") && id === "dashscope"
      ? getWanAccount()
      : modelId === "gpt-image-2.5" && id === "openai"
        ? getOpenaiAccount()
        : getApiProvider(id);
  if (!creds) return undefined;
  return {
    provider: id,
    name: PROVIDER_NAME[id],
    baseURL: creds.baseURL,
    apiKey: creds.apiKey,
    model: MODEL_SLUG[modelId]?.[id] || modelId,
    wired: isWired(modelId, id),
  };
}

/** Always first keyed + wired pipe. UI does not pin Via. */
export function resolveRoute(modelId: string, _via: ViaId = "auto"): RouteHit | undefined {
  const routes = routesFor(modelId);
  for (const id of routes) {
    if (!isWired(modelId, id)) continue;
    const hit = hitFor(modelId, id);
    if (hit) return hit;
  }
  return undefined;
}

export type ActiveVia = {
  id: string;
  name: string;
  canGenerate: boolean;
  reason: string;
};

export function activeVia(modelId: string, engineReady: boolean): ActiveVia {
  const hit = resolveRoute(modelId, "auto");
  if (hit && engineReady) {
    return { id: hit.provider, name: hit.name, canGenerate: true, reason: "" };
  }
  const listed = routeStatus(modelId).filter((r) => r.id !== "comfy");
  const keyedUnwired = listed.find((r) => r.keyed && !r.wired);
  if (keyedUnwired) {
    return { id: keyedUnwired.id, name: keyedUnwired.name, canGenerate: false, reason: "not wired" };
  }
  if (listed.length) {
    return { id: listed[0].id, name: listed[0].name, canGenerate: false, reason: "need key" };
  }
  return {
    id: "comfy",
    name: "Local Comfy",
    canGenerate: engineReady,
    reason: engineReady ? "" : "not installed",
  };
}

export function hasAnyRoute(modelId: string) {
  return routesFor(modelId).some((id) => {
    if (id === "comfy") return true;
    if (!isWired(modelId, id)) return false;
    if ((modelId === "wan-3-0" || modelId === "wan-3-0-std") && id === "dashscope") return hasWanProvider();
    if (modelId === "gpt-image-2.5" && id === "openai") return Boolean(getOpenaiAccount());
    return hasApiProvider(id);
  });
}

export function listModelMap() {
  return Object.entries(MODEL_ROUTES).map(([model, routes]) => ({
    model,
    routes: routeStatus(model).filter((r) => routes.includes(r.id as ApiProviderId | "comfy")),
  }));
}
