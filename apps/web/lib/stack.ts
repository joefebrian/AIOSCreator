import { listApiAccounts, type ApiProviderId } from "./api-providers";
import { listEngines, selectedEngines } from "./engines";
import { probeJev } from "./jev";
import { llmConfig, revampLlmConfig } from "./llm";
import { jevConfig } from "./providers";
import { voiceStudioConfig, probeVoiceStudio } from "./voice-studio";

export type StackJob = {
  id: string;
  job: string;
  where: string;
  model: string;
  modelId: string;
  provider: string;
  providerId: string;
  cost: string;
  topup: string;
  ready: boolean;
  note: string;
};

export type StackWallet = {
  id: string;
  name: string;
  for: string;
  topup: string;
  ready: boolean;
  balance?: string;
  note: string;
};

const TOPUP: Record<string, string> = {
  comfy: "Local 3060 — no top-up",
  openai: "platform.openai.com → Billing",
  byteplus: "BytePlus Ark console",
  meta: "dev.meta.ai → API keys",
  kling: "kling.ai / app.klingai.com → API credits",
  fal: "fal.ai → Billing",
  dashscope: "modelstudio.console.alibabacloud.com → Singapore billing",

  openrouter: "openrouter.ai → Credits",
  lmstudio: "Local RAM/CPU — no top-up",
  voicestudio: "Local VoiceStudio — no top-up",
  wavespeed: "wavespeed.ai (not wired)",
};

function keyed(id: ApiProviderId) {
  return listApiAccounts().some((a) => a.providerId === id && a.apiKey && a.status !== "dead");
}

export function buildStack() {
  const engines = listEngines();
  const sel = selectedEngines();
  const img = engines.find((e) => e.id === sel.image);
  const mot = engines.find((e) => e.id === sel.motion);
  let llmName = "—";
  let llmModel = "—";
  let llmReady = false;
  try {
    const c = llmConfig();
    llmName = c.name;
    llmModel = c.model;
    llmReady = Boolean(c.apiKey);
  } catch {
    /* none */
  }
  let revampName = "—";
  let revampReady = false;
  try {
    const r = revampLlmConfig();
    revampName = `${r.name} · ${r.model}`;
    revampReady = Boolean(r.apiKey);
  } catch {
    /* none */
  }
  const vs = voiceStudioConfig();
  const jev = jevConfig();

  const jobs: StackJob[] = [
    {
      id: "still",
      job: "Generate still / identity",
      where: "Characters · Generate image",
      model: img?.name || sel.image,
      modelId: sel.image,
      provider: img?.cloud ? (img.via?.name || "Cloud") : "Local Comfy",
      providerId: img?.cloud ? img.via?.id || "cloud" : "comfy",
      cost: img?.cloud ? "Paid per image" : "GPU only",
      topup: img?.cloud ? TOPUP[img.via?.id || ""] || "Cloud console" : TOPUP.comfy,
      ready: img?.status === "ready",
      note: img?.tip || "",
    },
    {
      id: "edit",
      job: "Edit image (chat / product / undress)",
      where: "Characters · Edit image",
      model: "Qwen Image 2.1",
      modelId: "qwen-image-2.1",
      provider: "Local Comfy",
      providerId: "comfy",
      cost: "GPU only",
      topup: TOPUP.comfy,
      ready: engines.find((e) => e.id === "qwen-image-2.1")?.status === "ready",
      note: "3060. One GPU job at a time.",
    },
    {
      id: "motion",
      job: "Motion copy (still + drive clip)",
      where: "MotionControl",
      model: mot?.name || sel.motion,
      modelId: sel.motion,
      provider: mot?.cloud ? (mot.via?.name || mot.name) : "Local Comfy",
      providerId: mot?.id === "wan-3-0" ? "dashscope" : mot?.id?.startsWith("kling") ? "kling" : mot?.id === "dreamactor-v2" ? "fal" : "comfy",
      cost:
        mot?.id === "wan-3-0"
          ? "~$0.07 / sec 720p"
          : mot?.id?.startsWith("kling")
            ? "Kling credits / clip"
            : mot?.id === "dreamactor-v2"
              ? "~$0.05 / sec"
              : "GPU only",
      topup:
        mot?.id === "wan-3-0"
          ? TOPUP.dashscope
          : mot?.id?.startsWith("kling")
            ? TOPUP.kling
            : mot?.id === "dreamactor-v2"
              ? TOPUP.fal
              : TOPUP.comfy,
      ready: mot?.status === "ready",
      note: "Kling 3.0 for face-lock copy. Wan 3.0 I2V is AI Studio, not here.",
    },
    {
      id: "studio-i2v",
      job: "Studio still → video (Wan 3.0)",
      where: "AI Studio · video node",
      model: "Wan 3.0 Prime / Standard",
      modelId: "wan-3-0",
      provider: "Alibaba Model Studio",
      providerId: "dashscope",
      cost: "Prime $0.14/s · std ~$0.07/s",
      topup: TOPUP.dashscope,
      ready: engines.find((e) => e.id === "wan-3-0")?.status === "ready",
      note: "Cloud I2V. Not MotionControl. Not 3060. Failed jobs not billed.",
    },
    {
      id: "i2v",
      job: "UGC 5s clip (no drive)",
      where: "UGC Factory",
      model: "MiniMax H3 I2V",
      modelId: "minimax-h3",
      provider: "Local Comfy",
      providerId: "comfy",
      cost: "GPU only",
      topup: TOPUP.comfy,
      ready: engines.find((e) => e.id === "minimax-h3")?.status === "ready",
      note: "Factory still → 5s. Waits if another GPU job is running.",
    },
    {
      id: "vo",
      job: "Voiceover from script",
      where: "UGC Factory · 4b",
      model: "VoiceStudio /v1/audio/speech",
      modelId: "voicestudio",
      provider: "VoiceStudio :3900",
      providerId: "voicestudio",
      cost: "Local",
      topup: TOPUP.voicestudio,
      ready: Boolean(vs.baseURL),
      note: "Queued until Comfy/Kling idle.",
    },
    {
      id: "revamp",
      job: "Revamp messy prompts",
      where: "Characters · Revamp prompt",
      model: revampName,
      modelId: "revamp",
      provider: revampName.includes("LM Studio") ? "LM Studio :1234" : "Cloud LLM",
      providerId: revampName.includes("LM Studio") ? "lmstudio" : "openrouter",
      cost: revampName.includes("LM Studio") ? "Local" : "Tokens",
      topup: revampName.includes("LM Studio") ? TOPUP.lmstudio : TOPUP.openrouter,
      ready: revampReady,
      note: "Toggle LM Studio / OpenRouter in Settings. Does not steal GPU if LLM is CPU-offload.",
    },
    {
      id: "script",
      job: "UGC script / general chat",
      where: "UGC Factory · Script",
      model: `${llmName} · ${llmModel}`,
      modelId: "llm",
      provider: llmName,
      providerId: "llm",
      cost: "Tokens",
      topup: llmName.toLowerCase().includes("alibaba") || llmName.toLowerCase().includes("qwen")
        ? TOPUP.dashscope
        : TOPUP.openrouter,
      ready: llmReady,
      note: "Settings → Saved LLM On/Off. DashScope Qwen is Singapore only.",
    },
    {
      id: "jev",
      job: "Typed decisions (not chat)",
      where: "UGC Factory · claim gate",
      model: jev.model,
      modelId: "jev",
      provider: "OpenRouter · TypeSafe",
      providerId: "openrouter",
      cost: "$0.042/M in · out free",
      topup: TOPUP.openrouter,
      ready: jev.ready,
      note: "Decisions API. Not a stills/script writer.",
    },
  ];

  const accounts = listApiAccounts();
  const wallets: StackWallet[] = [
    {
      id: "comfy",
      name: "Local Comfy · 3060 12GB",
      for: "Stills, edit, H3 I2V",
      topup: TOPUP.comfy,
      ready: true,
      note: "One GPU owner. VO waits.",
    },
    {
      id: "meta",
      name: "Meta Muse",
      for: "Muse Image 1.0 stills",
      topup: TOPUP.meta,
      ready: keyed("meta"),
      note: "$0.01/image. Generate + multi-ref edit. Key in Settings.",
    },
    {
      id: "kling",
      name: "Kling",
      for: "Motion Control 2.6 / 3.0",
      topup: TOPUP.kling,
      ready: keyed("kling"),
      note: "Top up API credits on kling.ai. Not stills.",
    },
    {
      id: "fal",
      name: "fal.ai",
      for: "DreamActor V2 only",
      topup: TOPUP.fal,
      ready: keyed("fal"),
      note: "~$0.05/s. Don't use for photoreal face lock.",
    },
    {
      id: "dashscope",
      name: "Alibaba Qwen LLM",
      for: "Script / VO (qwen3.7-plus)",
      topup: TOPUP.dashscope,
      ready: accounts.some((a) => a.providerId === "dashscope" && !/wan/i.test(a.label) && a.ready),
      note: "Singapore qwen3.7-plus. 1M free tokens ~90d. Scripts only. Not Wan. Not stills.",
    },
    {
      id: "dashscope-wan",
      name: "Alibaba Wan 3.0",
      for: "AI Studio I2V (Wan 3.0)",
      topup: TOPUP.dashscope,
      ready: accounts.some((a) => a.providerId === "dashscope" && /wan/i.test(a.label) && a.ready),
      note: "Singapore video-synthesis. Separate key from Qwen. Not 3060. Not Kling face-lock.",
    },
    {
      id: "openrouter",
      name: "OpenRouter",
      for: "Jev 1.13 + revamp fallback",
      topup: TOPUP.openrouter,
      ready: jev.ready,
      note: "Jev is Decisions API (typesafe/jev-1.13). Not chat completions.",
    },
    {
      id: "openai",
      name: "OpenAI",
      for: "GPT Image 2 (optional)",
      topup: TOPUP.openai,
      ready: keyed("openai"),
      note: "Not default. Klein/Qwen local first.",
    },
  ];

  return {
    jobs,
    wallets,
    selected: sel,
    voice: { baseURL: vs.baseURL, voice: vs.voice },
  };
}

export async function buildStackLive() {
  const stack = buildStack();
  const probe = await probeVoiceStudio();
  const vo = stack.jobs.find((j) => j.id === "vo");
  if (vo) vo.ready = probe.ok;
  const jevProbe = await probeJev();
  const jevJob = stack.jobs.find((j) => j.id === "jev");
  if (jevJob) jevJob.ready = jevProbe.ok;
  const orWallet = stack.wallets.find((w) => w.id === "openrouter");
  if (orWallet) orWallet.ready = jevProbe.ok || jevConfig().ready;
  return { ...stack, voiceProbe: probe, jevProbe };
}
