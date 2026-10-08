import { getApiProvider, getDashscopeImageAccount, getHiggsfieldAccount, getOpenaiAccount, getWanAccount, getXaiAccount, hasApiProvider, hasHiggsfieldProvider, hasWanProvider, hasXaiProvider, type ApiProviderId } from "./api-providers";

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

  fal: "fal.ai",
  dashscope: "Alibaba Model Studio",
  xai: "xAI Grok Imagine",
  higgsfield: "Higgsfield",
  meta: "Meta Muse",
};

/** Preference order. First keyed provider wins unless via is pinned. */
export const MODEL_ROUTES: Record<string, Array<ApiProviderId | "comfy">> = {
  "gpt-image-2.5": ["openai"],
  "gpt-image-2.5-flare": ["openai"],
  "grok-imagine": ["xai"],
  "grok-imagine-tryon": ["xai"],
  "kling-image-omni": ["kling"],
  "kolors-virtual-try-on": ["kling"],
  "gpt-image-2": ["openai"],
  "seedream-5-pro": ["byteplus"],
  "seedream-5-lite": ["byteplus"],
  "seedream-4-5": ["byteplus"],
  "muse-image-1.0": ["meta"],
  "qwen-image-3.0": ["dashscope"],
  "reactor": ["comfy"],
  "nano-banana": [],
  "seedance-2-5": ["higgsfield", "wavespeed", "byteplus"],
  "seedance-2-5-extend": ["higgsfield"],
  "kling-3-0-std": ["higgsfield"],
  "marketing-studio-image": ["higgsfield"],
  "kling-2-6": ["kling"],
  "kling-3-0": ["kling"],
  "dreamactor-v2": ["fal"],
  "wan-3-0": ["dashscope"],
  "wan-3-0-std": ["dashscope"],
  "grok-imagine-video": ["xai"],
  "flux2-klein-4b": ["comfy"],
  "flux2-klein-base-9b": ["comfy"],
  sd15: ["comfy"],
  "z-image-turbo": ["comfy"],
  "qwen-image-edit": ["comfy"],
  "qwen-image-2.1": ["comfy"],
  "qwen-image-2.1-gguf": ["comfy"],
  "qwen-image-2.1-viggle": ["comfy"],
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
  "gpt-image-2.5-flare": ["openai"],
  "grok-imagine": ["xai"],
  "grok-imagine-tryon": ["xai"],
  "kling-image-omni": ["kling"],
  "kolors-virtual-try-on": [],
  "gpt-image-2": ["openai"],
  "seedream-5-pro": ["byteplus"],
  "seedream-5-lite": ["byteplus"],
  "seedream-4-5": ["byteplus"],
  "muse-image-1.0": ["meta"],
  "qwen-image-3.0": ["dashscope"],
  "reactor": ["comfy"],
  "nano-banana": [],
  "seedance-2-5": ["higgsfield"],
  "seedance-2-5-extend": ["higgsfield"],
  "kling-2-6": ["kling"],
  "kling-3-0": ["kling"],
  "kling-3-0-std": ["higgsfield"],
  "marketing-studio-image": ["higgsfield"],
  "dreamactor-v2": ["fal"],
  "wan-3-0": ["dashscope"],
  "wan-3-0-std": ["dashscope"],
  "grok-imagine-video": ["xai"],
};

export function isWired(modelId: string, provider: ApiProviderId | "comfy") {
  if (provider === "comfy") return true;
  const live = WIRED[modelId];
  if (!live) return false;
  return live.includes(provider);
}

export const MODEL_SLUG: Partial<Record<string, Partial<Record<ApiProviderId, string>>>> = {
  "gpt-image-2.5": { openai: "gpt-image-2.5-sunburst" },
  "gpt-image-2.5-flare": { openai: "gpt-image-2.5-flare" },
  "gpt-image-2": { openai: "gpt-image-2" },
  "seedream-5-pro": { byteplus: "dola-seedream-5-0-pro-260628" },
  "seedream-5-lite": { byteplus: "seedream-5-0-lite-260128" },
  "seedream-4-5": { byteplus: "seedream-4-5-251128" },
  "muse-image-1.0": { meta: "muse-image-1.0" },
  "qwen-image-3.0": { dashscope: "qwen-image-3.0-pro" },
  "seedance-2-5": { higgsfield: "bytedance/seedance-2.5/image-to-video" },
  "seedance-2-5-extend": { higgsfield: "bytedance/seedance-2.5/video-extend" },
  "kling-3-0-std": { higgsfield: "kling-video/v3.0/std/image-to-video" },
  "marketing-studio-image": { higgsfield: "marketing-studio/image" },
  "kling-2-6": { kling: "kling-2.6" },
  "kling-3-0": { kling: "kling-3.0" },
  "dreamactor-v2": { fal: "fal-ai/bytedance/dreamactor/v2" },
  "wan-3-0": { dashscope: "wan3.0-video-prime" },
  "wan-3-0-std": { dashscope: "wan3.0-video" },
  "grok-imagine": { xai: "grok-imagine-image-2.0" },
  "grok-imagine-tryon": { xai: "grok-imagine-image-quality" },
  "kling-image-omni": { kling: "kling-v3-omni" },
  "kolors-virtual-try-on": { kling: "kolors-virtual-try-on-v1-5" },
  "grok-imagine-video": { xai: "grok-imagine-video-1.5" },
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
          : (modelId === "gpt-image-2.5" || modelId === "gpt-image-2.5-flare") && id === "openai"
            ? Boolean(getOpenaiAccount())
            : modelId === "qwen-image-3.0" && id === "dashscope"
              ? Boolean(getDashscopeImageAccount())
            : id === "xai"
              ? hasXaiProvider()
              : id === "higgsfield"
                ? hasHiggsfieldProvider()
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
      : (modelId === "gpt-image-2.5" || modelId === "gpt-image-2.5-flare") && id === "openai"
        ? getOpenaiAccount()
        : modelId === "qwen-image-3.0" && id === "dashscope"
          ? getDashscopeImageAccount()
        : id === "xai"
          ? getXaiAccount()
          : id === "higgsfield"
            ? getHiggsfieldAccount()
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
    if ((modelId === "gpt-image-2.5" || modelId === "gpt-image-2.5-flare") && id === "openai") return Boolean(getOpenaiAccount());
    if (modelId === "qwen-image-3.0" && id === "dashscope") return Boolean(getDashscopeImageAccount());
    if (id === "xai") return hasXaiProvider();
    if (id === "higgsfield") return hasHiggsfieldProvider();
    return hasApiProvider(id);
  });
}

export function listModelMap() {
  return Object.entries(MODEL_ROUTES).map(([model, routes]) => ({
    model,
    routes: routeStatus(model).filter((r) => routes.includes(r.id as ApiProviderId | "comfy")),
  }));
}
