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
    note: "Singapore wan3.0-video 720P promo (list $0.10, 30% off). Slower than Prime. Failed not billed.",
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
    model: "gpt-image-2.5",
    label: "GPT Image 2.5 Sunburst",
    provider: "openai",
    unit: "image",
    usd: 0.07,
    note: "Estimate per still (2K-class). Character complete set. Invoice may differ.",
  },
  {
    model: "gpt-image-2",
    label: "GPT Image 2",
    provider: "openai",
    unit: "image",
    usd: 0.04,
    note: "Estimate per still. Comet/OpenAI invoice may differ.",
  },
  {
    model: "seedream-5-pro",
    label: "Seedream 5 Pro",
    provider: "comet",
    unit: "image",
    usd: 0.03,
    note: "Estimate per still.",
  },
  {
    model: "seedream-4-5",
    label: "Seedream 4.5",
    provider: "hensun",
    unit: "image",
    usd: 0.02,
    note: "Estimate per still.",
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
    label: "Seedance 2.5",
    provider: "comet",
    unit: "sec",
    usd: 0.03,
    note: "Estimate I2V per output second.",
  },
  {
    model: "seedance-2-0",
    label: "Seedance 2.0",
    provider: "hensun",
    unit: "sec",
    usd: 0.03,
    note: "Estimate I2V per output second.",
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

export function money(n: number) {
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "$0";
  if (Math.abs(n) < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}
