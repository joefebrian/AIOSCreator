export type RateUnit = "sec" | "image" | "token" | "clip";

export type RateCard = {
  model: string;
  label: string;
  provider: string;
  unit: RateUnit;
  usd: number;
  note: string;
};

/** Published / operator-checked list rates. Failed jobs are $0. Invoice may differ. */
export const RATE_CARDS: RateCard[] = [
  {
    model: "wan-3-0",
    label: "Wan 3.0 Prime 720P",
    provider: "dashscope",
    unit: "sec",
    usd: 0.14,
    note: "Singapore wan3.0-video-prime 720P list. Faster. Failed not billed.",
  },
  {
    model: "wan-3-0-std",
    label: "Wan 3.0 720P",
    provider: "dashscope",
    unit: "sec",
    usd: 0.07,
    note: "Singapore wan3.0-video 720P promo. Slower than Prime. Failed not billed.",
  },
  {
    model: "kling-3-0",
    label: "Kling Motion Control 3.0",
    provider: "kling",
    unit: "clip",
    usd: 0.4,
    note: "Estimate. Kling bills credits, not USD. One motion-control clip.",
  },
  {
    model: "kling-2-6",
    label: "Kling Motion Control 2.6",
    provider: "kling",
    unit: "clip",
    usd: 0.3,
    note: "Estimate. Kling bills credits, not USD.",
  },
  {
    model: "dreamactor-v2",
    label: "DreamActor V2",
    provider: "fal",
    unit: "sec",
    usd: 0.05,
    note: "fal.ai DreamActor V2 ~$0.05/s.",
  },
  {
    model: "Script_UGC",
    label: "Script_UGC",
    provider: "openai",
    unit: "token",
    usd: 0,
    note: "ChatGPT Astra gpt-6-astra. $10/M input · $50/M output. Factory scripts only. Spend is the logged split, not this unit rate.",
  },
  {
    model: "gpt-image-2.5",
    label: "GPT Image 2.5 Sunburst",
    provider: "openai",
    unit: "image",
    usd: 0.07,
    note: "Estimate per still (2K-class). Character complete set. Invoice may differ.",
  },
  {
    model: "grok-imagine",
    label: "Grok Imagine 2.0 · 2K medium",
    provider: "xai",
    unit: "image",
    usd: 0.06,
    note: "Auto: 1K medium (face/SKU) or 2K low (poster). Both $0.06 out. Edit +$0.01/ref. Not V1.",
  },
  {
    model: "grok-imagine-tryon",
    label: "Grok Imagine try-on · 2K quality",
    provider: "xai",
    unit: "image",
    usd: 0.07,
    note: "grok-imagine-image-quality 2K ~$0.05–0.07 + $0.01/ref. Person + garment.",
  },
  {
    model: "kling-image-omni",
    label: "Kling Image 3.0 Omni · 2K",
    provider: "kling",
    unit: "image",
    usd: 0.028,
    note: "kling-v3-omni 2K ~$0.028. 4K is $0.056. Person + SKU refs.",
  },
  {
    model: "kolors-virtual-try-on",
    label: "Kolors virtual try-on v1.5",
    provider: "kling",
    unit: "image",
    usd: 0.07,
    note: "Retired 2026-09-15. Use kling-image-omni.",
  },
  {
    model: "grok-imagine-video",
    label: "Grok Imagine Video 1.5 · 720p",
    provider: "xai",
    unit: "sec",
    usd: 0.14,
    note: "720p $0.14/s (480p $0.08, 1080p $0.25). We send 720p 9:16. Max 15s. I2V still also $0.01 image input.",
  },
  {
    model: "gpt-image-2.5-flare",
    label: "GPT Image 2.5 Flare",
    provider: "openai",
    unit: "image",
    usd: 0.02,
    note: "Medium quality estimate. Product/UGC volume. Invoice may differ.",
  },
  {
    model: "gpt-image-2",
    label: "GPT Image 2",
    provider: "openai",
    unit: "image",
    usd: 0.04,
    note: "Estimate per still. OpenAI invoice may differ.",
  },
  {
    model: "seedream-5-pro",
    label: "Seedream 5.0",
    provider: "byteplus",
    unit: "image",
    usd: 0.09,
    note: "BytePlus 2K output. First ref free; extra refs ~$0.003.",
  },
  {
    model: "seedream-5-lite",
    label: "Seedream 5.0 Lite",
    provider: "byteplus",
    unit: "image",
    usd: 0.035,
    note: "BytePlus list ~$0.035/image.",
  },
  {
    model: "seedream-4-5",
    label: "Seedream 4.5",
    provider: "byteplus",
    unit: "image",
    usd: 0.04,
    note: "BytePlus list ~$0.04/image.",
  },
  {
    model: "muse-image-1.0",
    label: "Muse Image 1.0",
    provider: "meta",
    unit: "image",
    usd: 0.01,
    note: "Flat $0.01 per returned image. Search included.",
  },
  {
    model: "qwen-image-3.0",
    label: "Qwen Image 3.0 Pro 1K",
    provider: "dashscope",
    unit: "image",
    usd: 0.046,
    note: "Singapore 1K output $0.04 + ~$0.003 per input image. 2K output is $0.075.",
  },

  {
    model: "qwen3-vl-plus",
    label: "Qwen 3 VL Plus",
    provider: "dashscope",
    unit: "token",
    usd: 0.0000004,
    note: "Singapore vision. Image/video → prompt. ~$0.40/1M blended.",
  },
  {
    model: "nano-banana",
    label: "Nano Banana",
    provider: "comet",
    unit: "image",
    usd: 0.01,
    note: "Estimate per still.",
  },
  {
    model: "seedance-2-5",
    label: "Seedance 2.5 I2V (Higgsfield)",
    provider: "higgsfield",
    unit: "sec",
    usd: 0.0738,
    note: "Higgsfield list ~$0.074/s 720p. Failed not billed.",
  },
  {
    model: "seedance-2-5-extend",
    label: "Seedance 2.5 Extend",
    provider: "higgsfield",
    unit: "sec",
    usd: 0.0738,
    note: "Same rate as I2V. Needs source video.",
  },
  {
    model: "kling-3-0-std",
    label: "Kling 3.0 Standard I2V",
    provider: "higgsfield",
    unit: "sec",
    usd: 0.112,
    note: "Higgsfield Kling 3.0 std I2V. Not Motion Control.",
  },
  {
    model: "marketing-studio-image",
    label: "Marketing Studio Image",
    provider: "higgsfield",
    unit: "image",
    usd: 0.0059,
    note: "Campaign stills 2K high. Product + model refs.",
  },
  {
    model: "z-ai/glm-4.7-flash",
    label: "GLM 4.7 Flash",
    provider: "openrouter",
    unit: "token",
    usd: 0.0000004,
    note: "Caption revamp only. OpenRouter list ~$0.0605/M in · $0.40/M out. Cap uses the output rate. Logged actualUsd is the split. Reasoning stays off.",
  },

];

export function rateFor(model: string): RateCard | undefined {
  const id = (model || "").replace(/-ref$/, "");
  const exact = RATE_CARDS.find((r) => r.model === id);
  if (exact) return exact;
  const prefixed = RATE_CARDS.filter((r) => id.startsWith(r.model)).sort((a, b) => b.model.length - a.model.length);
  return prefixed[0];
}

export function quoteMotionBar(model: string, durationSec?: number) {
  const card = rateFor(model);
  const est = estimateUsd({ model, durationSec, ok: true });
  if (!card || !est) return "—";
  if (card.unit === "sec") return `${card.label} · ~${money(est.usd)} / ${est.units}s`;
  if (card.unit === "clip") return `${card.label} · ~${money(est.usd)} / clip`;
  return `${card.label} · ~${money(est.usd)}`;
}

export function estimateUsd(opts: {
  model: string;
  ok?: boolean;
  durationSec?: number;
  units?: number;
  tokens?: number;
}): { usd: number; units: number; unit: RateUnit } | undefined {
  if (opts.ok === false) return { usd: 0, units: 0, unit: "clip" };
  const card = rateFor(opts.model);
  if (!card) {
    if (opts.tokens && opts.tokens > 0) {
      return { usd: (opts.tokens / 1_000_000) * 0.8, units: opts.tokens, unit: "token" };
    }
    return undefined;
  }
  let units = opts.units;
  if (units == null) {
    if (card.unit === "sec") units = Math.max(1, Math.round(opts.durationSec || 5));
    else if (card.unit === "token") units = opts.tokens || 0;
    else units = 1;
  }
  return { usd: Math.round(card.usd * units * 10_000) / 10_000, units, unit: card.unit };
}

/** Console list rates for Grok Imagine (xAI, 2026-09). What we actually send is marked weUse. */
export const GROK_IMAGINE_QUOTE = {
  imageModel: "grok-imagine-image-2.0",
  videoModel: "grok-imagine-video-1.5",
  weUseImage: "auto-0.06" as const,
  weUseVideo: "720p" as const,
  textInput: 0,
  imageInput: 0.01,
  imageOut: {
    "1k-low": 0.04,
    "1k-medium": 0.06,
    "2k-low": 0.06,
    "2k-medium": 0.08,
  },
  v1Image: 0.02,
  videoSec: { "480p": 0.08, "720p": 0.14, "1080p": 0.25 },
};

export function grokImagineStillUsd(refCount = 0) {
  const out = GROK_IMAGINE_QUOTE.imageOut["1k-medium"];
  const input = Math.max(0, refCount) * GROK_IMAGINE_QUOTE.imageInput;
  return Math.round((out + input) * 10000) / 10000;
}

export function grokImagineVideoUsd(durationSec = 6, refCount = 1) {
  const sec = Math.min(15, Math.max(3, Math.round(durationSec || 6)));
  const motion = sec * GROK_IMAGINE_QUOTE.videoSec[GROK_IMAGINE_QUOTE.weUseVideo];
  const input = Math.max(0, refCount) * GROK_IMAGINE_QUOTE.imageInput;
  return { usd: Math.round((motion + input) * 10000) / 10000, sec };
}

export function money(n: number) {
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "$0";
  if (Math.abs(n) < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}
