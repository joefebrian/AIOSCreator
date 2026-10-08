/** Isomorphic — safe in client GpuStatus. No fs / Comfy. */

const CLOUD_PROVIDERS = new Set([
  "kling",
  "fal",
  "dashscope",
  "xai",
  "higgsfield",
  "meta",
  "comet",
  "openai",
  "byteplus",
  "ffmpeg",
]);

const CLOUD_MODELS = new Set([
  "wan-3-0",
  "wan-3-0-std",
  "kling-2-6",
  "kling-3-0",
  "dreamactor-v2",
  "seedance-2-5",
  "seedance-2-5-extend",
  "kling-3-0-std",
  "marketing-studio-image",
  "gpt-image-2",
  "gpt-image-2.5",
  "gpt-image-2.5-flare",
  "grok-imagine",
  "grok-imagine-tryon",
  "kling-image-omni",
  "kolors-virtual-try-on",
  "grok-imagine-video",
  "seedream-5-pro",
  "seedream-5-lite",
  "seedream-4-5",
  "muse-image-1.0",
  "qwen-image-3.0",
  "nano-banana",
  "qwen3-vl-plus",
]);

export function jobOccupiesGpu(job: {
  status?: string;
  provider?: string;
  model?: string;
  kind?: string;
}): boolean {
  if (job.status !== "running" && job.status !== "queued") return false;
  if (job.kind === "factory") return false;
  const p = (job.provider || "").toLowerCase();
  const m = (job.model || "").toLowerCase();
  if (CLOUD_PROVIDERS.has(p)) return false;
  if (CLOUD_MODELS.has(m) || m.startsWith("wan-3-0") || m.startsWith("kling-") || m.startsWith("ffmpeg") || m.startsWith("seedance") || m.startsWith("seedream")) {
    return false;
  }
  return true;
}

export function isWanEngine(id?: string) {
  return id === "wan-3-0" || id === "wan-3-0-std";
}
