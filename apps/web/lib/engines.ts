import fs from "node:fs";
import path from "node:path";
import { hasImageProvider } from "./image-providers";
import { activeVia, routeStatus, type ActiveVia, type ViaId } from "./model-routes";
import { hasMotionProvider } from "./motion-providers";
import { dataRoot, ensureDataDirs } from "./paths";

export type EngineKind = "llm" | "image" | "motion" | "export";
export type EngineStatus = "ready" | "coming";

export type Engine = {
  id: string;
  kind: EngineKind;
  name: string;
  license: string;
  vram: string;
  status: EngineStatus;
  note: string;
  /** Short “use for” in the picker dropdown. */
  useFor: string;
  /** One-line tip under the picker so we don’t pick the wrong engine. */
  tip: string;
  group: string;
  badges: string[];
  nativeSize?: string;
  cloud?: boolean;
  routes?: { id: string; name: string; ready: boolean; wired?: boolean; keyed?: boolean }[];
  via?: ActiveVia;
};

type Catalog = {
  id: string;
  kind: EngineKind;
  name: string;
  license: string;
  vram: string;
  note: string;
  useFor: string;
  tip: string;
  group: string;
  badges: string[];
  nativeSize?: string;
  bundled?: boolean;
  cloud?: boolean;
  /** Every token must match some filename (AND). */
  weightsAll?: string[];
  /** At least one token must match some filename (OR). */
  weightsAny?: string[];
};

const CATALOG: Catalog[] = [
  {
    id: "flux2-klein-4b",
    kind: "image",
    name: "FLUX.2 Klein 4B FP8",
    license: "Apache-2.0",
    vram: "T0 12GB",
    note: "Local stills + character lock. Face headshot + body front. Not Seedream / GPT Image quality.",
    useFor: "fast lock",
    tip: "Fast identity lock via ReferenceLatent. More AI-beauty. TE is our abliterated Qwen3-4B; Z-Image stays stock.",
    group: "Stills",
    badges: ["768×1280", "identity"],
    nativeSize: "768×1280",
    bundled: true,
    weightsAny: ["flux-2-klein-4b", "flux2-klein-4b"],
  },
  {
    id: "flux2-klein-base-9b",
    kind: "image",
    name: "FLUX.2 Klein Base 9B FP8",
    license: "FLUX non-commercial",
    vram: "T0 12GB tight · research",
    note: "Research only. Not default. Not Apache. Smoke 768. OOM possible.",
    useFor: "research stills",
    tip: "9B base + Qwen3 8B TE. Non-commercial. Do not use for paid character work. 768 class on 3060.",
    group: "Stills",
    badges: ["768", "NCL", "research"],
    nativeSize: "768×768",
    weightsAll: ["flux-2-klein-base-9b", "qwen_3_8b"],
  },
  {
    id: "sd15",
    kind: "image",
    name: "Stable Diffusion 1.5",
    license: "CreativeML Open RAIL-M",
    vram: "T0 12GB",
    note: "Fast/draft. No identity lock.",
    useFor: "draft only",
    tip: "Scratch stills. No character lock. Don’t use for identity or sheets.",
    group: "Stills",
    badges: ["draft"],
    nativeSize: "512×768",
    bundled: true,
    weightsAny: ["v1-5-pruned"],
  },
  {
    id: "z-image-turbo",
    kind: "image",
    name: "Z-Image Turbo",
    license: "Apache-2.0",
    vram: "T0 12GB INT8",
    note: "Local photoreal stills. 8 steps. Better skin than Klein. Identity = img2img.",
    useFor: "orang baru",
    tip: "Orang baru, perawakan sama. Prompt-only plates. Photoreal skin. Then switch to Qwen for the sheet.",
    group: "Stills",
    badges: ["8 step", "Apache"],
    nativeSize: "768×1280",
    weightsAll: ["z_image_turbo", "ae.safetensors"],
  },
  {
    id: "qwen-image-edit",
    kind: "image",
    name: "Qwen Image Edit 2511",
    license: "Apache-2.0",
    vram: "T0 12GB INT8 offload",
    note: "Native edit. Face + body lock, new pose/scene from prompt. 4-step Lightning.",
    useFor: "keep face + body",
    tip: "Image 1 = headshot, image 2 = body front. Pose/wardrobe/scene follow the prompt. Not for inventing a new face.",
    group: "Stills",
    badges: ["edit", "4 step"],
    nativeSize: "768×960",
    weightsAll: ["qwen_image_edit_2511", "qwen_2.5_vl_7b", "qwen_image_vae", "2511-Lightning"],
  },
  {
    id: "klein-qwen",
    kind: "image",
    name: "Klein vibe + Qwen lock",
    license: "Apache-2.0",
    vram: "T0 12GB sequential",
    note: "2-pass, not a merged checkpoint. Klein paints scene, Qwen faceswap identity. ~2× a single still.",
    useFor: "Klein look, locked face",
    tip: "Pass 1 Klein txt2img (vibe). Pass 2 Qwen Image Edit faceswap onto the identity plate. Unloads between. Face lock is Qwen, not Klein.",
    group: "Stills",
    badges: ["2-pass", "lock"],
    nativeSize: "768×1024",
    weightsAll: ["qwen_image_edit_2511", "qwen_2.5_vl_7b", "qwen_image_vae", "2511-Lightning"],
  },
  {
    id: "gpt-image-2.5",
    kind: "image",
    name: "GPT Image 2.5 Sunburst",
    license: "OpenAI paid API",
    vram: "cloud",
    note: "Character complete set. Official openai.com. Key Character_Generation.",
    useFor: "firm identity set",
    tip: "Locked for Character Complete set: Headshot, 3/4 body, Full body. Precision Sunburst. Not Klein/Qwen.",
    group: "Cloud stills",
    badges: ["2.5", "identity"],
    nativeSize: "1024×1536",
    cloud: true,
  },
  {
    id: "gpt-image-2",
    kind: "image",
    name: "GPT Image 2 · ChatGPT",
    license: "OpenAI paid API",
    vram: "cloud",
    note: "Identity plates. Paid API. Key in Settings.",
    useFor: "best plate, paid",
    tip: "Paid. Same model, many pipes. Key lives on the provider (Settings). Follows OpenAI / Comet ToS.",
    group: "Cloud stills",
    badges: ["2K", "identity"],
    nativeSize: "up to 2K",
    cloud: true,
  },
  {
    id: "seedream-4-5",
    kind: "image",
    name: "Seedream 4.5",
    license: "HensunAI · ByteDance Seedream 4.5",
    vram: "cloud",
    note: "Cloud stills via HensunAI NewAPI. Key in Settings.",
    useFor: "cloud stills",
    tip: "ByteDance-Seedream-4.5 on hensunai.com. Paid. Follows the provider ToS.",
    group: "Cloud stills",
    badges: ["cloud", "identity"],
    nativeSize: "up to 2K",
    cloud: true,
  },
  {
    id: "seedream-5-pro",
    kind: "image",
    name: "Seedream 5.0 Pro",
    license: "BytePlus / ByteDance paid API",
    vram: "cloud",
    note: "Identity plates. Paid API. Key in Settings.",
    useFor: "best plate, paid",
    tip: "Paid cloud stills. Add an API key in Settings. Follows the provider ToS.",
    group: "Cloud stills",
    badges: ["2K", "identity"],
    nativeSize: "up to 2K",
    cloud: true,
  },
  {
    id: "nano-banana",
    kind: "image",
    name: "Nano Banana · Gemini",
    license: "CometAPI paid · Google ToS",
    vram: "cloud",
    note: "Gemini Flash Image. Paid API. Key in Settings.",
    useFor: "fast cloud still / edit",
    tip: "Paid. Provider key in Settings. Follows Google / Comet ToS.",
    group: "Cloud stills",
    badges: ["~1–2K", "edit"],
    nativeSize: "up to 2K",
    cloud: true,
  },
  {
    id: "seedance-2-0",
    kind: "motion",
    name: "Seedance 2.0",
    license: "HensunAI · Dreamina Seedance 2.0",
    vram: "cloud",
    note: "Cloud I2V via HensunAI. Paid API. Key in Settings.",
    useFor: "I2V cloud · 2.0",
    tip: "Dreamina-Seedance-2.0 on hensunai.com. Still → short clip. Paid.",
    group: "Cloud motion",
    badges: ["I2V", "2.0"],
    cloud: true,
  },
  {
    id: "seedance-2-5",
    kind: "motion",
    name: "Seedance 2.5",
    license: "CometAPI paid · ByteDance ToS",
    vram: "cloud",
    note: "Cloud I2V 4–30s 720p 9:16. HensunAI or CometAPI. Key in Settings.",
    useFor: "I2V cloud",
    tip: "Dreamina-Seedance-2.5 on HensunAI, or CometAPI. Still → 4–30s clip.",
    group: "Cloud motion",
    badges: ["720p", "4–30s", "I2V"],
    cloud: true,
  },
  {
    id: "kling-2-6",
    kind: "motion",
    name: "Kling Motion Control 2.6",
    license: "Kling / Kuaishou paid API",
    vram: "cloud",
    note: "Official motion copy 2.6. Still + drive, 3–30s, 1080p.",
    useFor: "copy motion · 2.6",
    tip: "Paid Kling. Image identity + drive clip 3–30s. Same key as 3.0.",
    group: "Motion control",
    badges: ["1080p", "3–30s", "2.6"],
    cloud: true,
  },
  {
    id: "kling-3-0",
    kind: "motion",
    name: "Kling Motion Control 3.0",
    license: "Kling / Kuaishou paid API",
    vram: "cloud",
    note: "Official motion copy 3.0. Still + drive, 3–30s, 1080p.",
    useFor: "copy motion · 3.0",
    tip: "Paid Kling. Image identity + drive clip 3–30s mp4/mov. Pick 2.6 if 3.0 is busy.",
    group: "Motion control",
    badges: ["1080p", "3–30s", "3.0"],
    cloud: true,
  },
  {
    id: "dreamactor-v2",
    kind: "motion",
    name: "DreamActor V2",
    license: "fal.ai · ByteDance DreamActor",
    vram: "cloud",
    note: "fal.ai motion copy. Still + drive, face/body/lips. Max 30s. Not Kling.",
    useFor: "copy motion · DreamActor",
    tip: "Paid fal.ai. Motion copy, ≤30s. Weaker photoreal face than Kling 3.0 — use Kling for people.",
    group: "Motion control",
    badges: ["fal", "≤30s", "V2"],
    cloud: true,
  },
  {
    id: "wan-3-0",
    kind: "motion",
    name: "Wan 3.0 Prime",
    license: "Alibaba Model Studio (preview)",
    vram: "cloud",
    note: "Workspace / Studio I2V. Singapore wan3.0-video-prime. Faster. 720p $0.14/s. Not MotionControl.",
    useFor: "Studio I2V · Prime",
    tip: "Still → video on Alibaba Prime. Faster, $0.14/s 720p. Same Wan key as Standard. Not Kling.",
    group: "AI Studio",
    badges: ["720p", "Prime", "Studio"],
    cloud: true,
  },
  {
    id: "wan-3-0-std",
    kind: "motion",
    name: "Wan 3.0",
    license: "Alibaba Model Studio (preview)",
    vram: "cloud",
    note: "Workspace / Studio I2V. Singapore wan3.0-video standard. Slower, cheaper (~$0.07/s 720p promo).",
    useFor: "Studio I2V · std",
    tip: "Still → video on Alibaba Standard. Cheaper than Prime. Same Wan key. Not Kling.",
    group: "AI Studio",
    badges: ["720p", "std", "Studio"],
    cloud: true,
  },
  {
    id: "native-4k",
    kind: "image",
    name: "Native 4K denoise",
    license: "—",
    vram: "T2 24GB+",
    note: "Blocked on RTX 3060 12GB. Use Export 4K.",
    useFor: "blocked 12GB",
    tip: "Native 4K denoise needs 24GB+. On this 3060 use Export 4K upscale instead.",
    group: "Stills",
    badges: ["2160p", "blocked"],
  },
  {
    id: "ltx-2",
    kind: "motion",
    name: "LTX-2 19B",
    license: "LTX-2 Community (revenue cap)",
    vram: "T0 12GB offload · ~36GB disk",
    note: "Native I2V + audio, 8-step distilled fp8. Not LTX-2.3/2.5. Not GGUF. Not motion copy.",
    useFor: "I2V + audio (fast)",
    tip: "Still → ~2s 448×768 with native audio, 8 steps. Faster than H3. Does not copy a reference clip. LTX-2.3 needs 16GB+.",
    group: "Core motion",
    badges: ["8 step", "audio", "448p"],
    weightsAll: ["ltx-2-19b-distilled-fp8", "gemma_3_12b_it_fp4"],
  },
  {
    id: "wan-5b",
    kind: "motion",
    name: "Wan 2.2 5B",
    license: "Apache-2.0",
    vram: "T0 12GB offload",
    note: "Native TI2V. Silent I2V/T2V ~2–3s 480p. Not motion copy. Not audio. Not 4K.",
    useFor: "I2V silent",
    tip: "Still → silent video ~2–3s 480×832. Does not copy a reference clip. Use H3 R2V for motion control.",
    group: "Core motion",
    badges: ["480p", "I2V", "Apache"],
    weightsAll: ["wan2.2_ti2v_5b", "umt5_xxl_fp8", "wan2.2_vae"],
  },
  {
    id: "minimax-h3",
    kind: "motion",
    name: "MiniMax H3",
    license: "MiniMax Community · show name in UI",
    vram: "T0 12GB offload · ~40GB disk",
    note: "T2V/I2V with native stereo audio. 5–15s. T0 I2V 640×1152. Turbo I2V 576×1024. Official 2K is API-only.",
    useFor: "I2V + audio",
    tip: "Still → 5–15s clip + audio. Turbo LoRA v4 = 6 steps at 576×1024. Native 20-step stays 640×1152. Nude H3 stays 20-step. Copy-motion is H3 R2V.",
    group: "Core motion",
    badges: ["5–15s", "audio", "768p"],
    weightsAll: [
      "minimax_h3_fl2va",
      "qwen3vl_32b_minimax_h3",
      "minimax_h3_video_vae",
      "minimax_h3_audio_vae",
    ],
  },
  {
    id: "minimax-h3-long",
    kind: "motion",
    name: "H3 I2V · long (chunked)",
    license: "MiniMax Community · show name in UI",
    vram: "T0 12GB · 5s windows",
    note: "Not native 60s. 5s I2V windows, last-frame continue, 5-frame overlap. Same FL2VA as H3 I2V. No SageAttention. No Motion Director custom node. Wall clock ≈ N×5s jobs.",
    useFor: "I2V long",
    tip: "60s-class on 12GB: stitches proven 5s clips. Seams possible. Not motion copy. Not the Civitai Director UI. NVIDIA upscale after if you want 941p.",
    group: "Core motion",
    badges: ["chunked", "≤60s", "12GB"],
    weightsAll: [
      "minimax_h3_fl2va",
      "qwen3vl_32b_minimax_h3",
      "minimax_h3_video_vae",
      "minimax_h3_audio_vae",
    ],
  },
  {
    id: "minimax-h3-nude",
    kind: "motion",
    name: "H3 I2V · nudity",
    license: "MiniMax Community + community LoRA (adult)",
    vram: "T0 12GB · LoRA may OOM",
    note: "NaughtyTimes LoRA. Adult nudity/sex I2V only. FL2VA. Not R2V. Not default H3. Not minors.",
    useFor: "I2V nudity",
    tip: "Khusus nudity. Still → clip with NaughtyTimes @ 0.5, euler. Not for SFW catalog. Not motion copy. 12GB may OOM.",
    group: "Adult",
    badges: ["NSFW", "nudity", "I2V"],
    weightsAll: [
      "minimax_h3_fl2va",
      "qwen3vl_32b_minimax_h3",
      "minimax_h3_video_vae",
      "minimax_h3_audio_vae",
      "NaughtyTimes",
    ],
  },
  {
    id: "minimax-h3-r2v",
    kind: "motion",
    name: "MiniMax H3 R2V",
    license: "MiniMax Community · show name in UI",
    vram: "T0 12GB offload · +19.5GB",
    note: "Character + reference motion/audio. T0 = 20-step dense 448×800. Turbo/VSA OOM on 12GB. Branding required.",
    useFor: "copy motion",
    tip: "Local copy on 12GB: 2s 448×800. 5s OOM. For 3–30s 1080p copy pick Kling Motion Control (cloud key).",
    group: "Motion control",
    badges: ["R2V", "audio", "identity"],
    weightsAll: [
      "minimax_h3_ref2va",
      "qwen3vl_32b_minimax_h3",
      "minimax_h3_video_vae",
      "minimax_h3_audio_vae",
    ],
  },
  {
    id: "minimax-h3-r2v-nude",
    kind: "motion",
    name: "H3 R2V · nudity",
    license: "MiniMax Community + community LoRA (adult)",
    vram: "T0 12GB · 2s 448×800 · LoRA may OOM",
    note: "AfterMidnight sexytime LoRA. Adult nudity copy only. Ref2VA. Not NaughtyTimes (that's I2V). Not minors.",
    useFor: "copy motion · nudity",
    tip: "Khusus nudity. Still + drive, AfterMidnight @ 1.0, euler/beta. 2s local. 5s OOM. Kling for longer SFW/NSFW cloud.",
    group: "Adult",
    badges: ["NSFW", "nudity", "R2V"],
    weightsAll: [
      "minimax_h3_ref2va",
      "qwen3vl_32b_minimax_h3",
      "minimax_h3_video_vae",
      "minimax_h3_audio_vae",
      "AfterMidnight",
    ],
  },
  {
    id: "wan-animate-2",
    kind: "motion",
    name: "Wan Animate 2",
    license: "Apache-2.0",
    vram: "T0 12GB offload · INT8",
    note: "Native motion copy. Still + driving video. Silent. No pose extractor. Not GGUF.",
    useFor: "copy motion",
    tip: "Copy the driving clip’s body/face onto the still. Silent. Match framing (full-body to full-body). Use H3 R2V if you also need audio.",
    group: "Motion control",
    badges: ["INT8", "81f", "Apache"],
    weightsAll: [
      "wan_animate_2_int8_convrot",
      "umt5_xxl_fp8",
      "clip_vision_h",
      "wan2_1_vae",
      "lightx2v_i2v_14b_480p",
    ],
  },
  {
    id: "hunyuan-1.5",
    kind: "motion",
    name: "HunyuanVideo 1.5",
    license: "Tencent (read before commercial)",
    vram: "T0 480p distilled fp8",
    note: "Native 480p I2V step-distilled 8-step. Silent. Not GGUF. Not motion copy. Not 4K.",
    useFor: "I2V silent",
    tip: "Still → silent video ~3s 480×848, 8 steps. Does not copy a reference clip. Use H3 R2V for motion control.",
    group: "Core motion",
    badges: ["480p", "8 step", "I2V"],
    weightsAll: [
      "hunyuanvideo1.5_480p_i2v_step_distilled",
      "qwen_2.5_vl_7b",
      "byt5_small_glyphxl",
      "hunyuanvideo15_vae",
      "sigclip_vision_patch14_384",
    ],
  },
  {
    id: "ffmpeg-4k",
    kind: "export",
    name: "4K export (upscale)",
    license: "local ffmpeg",
    vram: "CPU / 3060",
    note: "2160×3840. RealESRGAN x4 then crop. Not native 4K denoise.",
    useFor: "export 4K",
    tip: "Upscale a finished still to 2160×3840. Not a generator.",
    group: "Export",
    badges: ["2160×3840"],
    bundled: true,
  },
];

function comfyModelsRoot() {
  return path.join(process.env.LOCALAPPDATA || "", "Programs", "ComfyUI", "models");
}

let nameCache: { at: number; names: string[] } | null = null;

function weightFilenames() {
  if (nameCache && Date.now() - nameCache.at < 4000) return nameCache.names;
  const root = comfyModelsRoot();
  const names: string[] = [];
  if (fs.existsSync(root)) {
    for (const dir of [
        "diffusion_models",
        "checkpoints",
        "text_encoders",
        "clip",
        "clip_vision",
        "vae",
        "loras",
        "unet",
      ]) {
      const p = path.join(root, dir);
      if (!fs.existsSync(p)) continue;
      for (const f of fs.readdirSync(p)) names.push(f.toLowerCase());
    }
  }
  nameCache = { at: Date.now(), names };
  return names;
}

function hasToken(names: string[], token: string) {
  const t = token.toLowerCase();
  return names.some((n) => n.includes(t));
}

function isReady(row: Catalog, names: string[]): EngineStatus {
  if (row.cloud) {
    if (row.kind === "motion") return hasMotionProvider(row.id) ? "ready" : "coming";
    return hasImageProvider(row.id) ? "ready" : "coming";
  }
  if (row.bundled) return "ready";
  if (row.weightsAll?.length) {
    return row.weightsAll.every((t) => hasToken(names, t)) ? "ready" : "coming";
  }
  if (row.weightsAny?.length) {
    return row.weightsAny.some((t) => hasToken(names, t)) ? "ready" : "coming";
  }
  return "coming";
}

export function listEngines(): Engine[] {
  const names = weightFilenames();
  return CATALOG.map((row) => {
    const status = isReady(row, names);
    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      license: row.license,
      vram: row.vram,
      note: row.note,
      useFor: row.useFor,
      tip: row.tip,
      group: row.group,
      badges: row.badges,
      nativeSize: row.nativeSize,
      cloud: row.cloud,
      status,
      routes: routeStatus(row.id),
      via: activeVia(row.id, status === "ready"),
    };
  });
}

type Store = { image: string; motion: string; imageVia?: ViaId; motionVia?: ViaId };

function filePath() {
  ensureDataDirs();
  return path.join(dataRoot(), "db", "engines.json");
}

function readStore(): Store {
  const file = filePath();
  if (!fs.existsSync(file)) {
    return { image: "qwen-image-edit", motion: "kling-3-0", imageVia: "auto", motionVia: "auto" };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<Store>;
    const motionOk = new Set(["kling-2-6", "kling-3-0", "dreamactor-v2"]);
    const motion = motionOk.has(raw.motion || "") ? (raw.motion as string) : "kling-3-0";
    return {
      image: raw.image || "qwen-image-edit",
      motion,
      imageVia: raw.imageVia || "auto",
      motionVia: raw.motionVia || "auto",
    };
  } catch {
    return { image: "qwen-image-edit", motion: "kling-3-0", imageVia: "auto", motionVia: "auto" };
  }
}

function writeStore(store: Store) {
  fs.writeFileSync(filePath(), JSON.stringify(store, null, 2), "utf8");
}

export function selectedEngines() {
  return readStore();
}

export function selectEngine(kind: "image" | "motion", id: string, via?: ViaId) {
  const hit = listEngines().find((e) => e.id === id && e.kind === kind);
  if (!hit) throw new Error("unknown engine");
  if (hit.status !== "ready") {
    throw new Error(
      hit.cloud
        ? `${hit.name} needs an API key in Settings`
        : `${hit.name} is not installed yet — drop weights in ComfyUI/models`,
    );
  }
  const store = readStore();
  store[kind] = id;
  store.imageVia = "auto";
  store.motionVia = "auto";
  void via;
  writeStore(store);
  return store;
}

export function imageEngine() {
  const all = listEngines();
  const id = readStore().image;
  const hit = all.find((e) => e.id === id && e.kind === "image" && e.status === "ready");
  return hit ?? all.find((e) => e.id === "qwen-image-edit" && e.status === "ready") ?? all.find((e) => e.id === "flux2-klein-4b")!;
}

function firstReadyMotion(all: Engine[]) {
  return (
    all.find((e) => e.id === "kling-3-0" && e.status === "ready") ??
    all.find((e) => e.id === "kling-2-6" && e.status === "ready") ??
    all.find((e) => e.id === "dreamactor-v2" && e.status === "ready") ??
    all.find((e) => e.kind === "motion" && e.status === "ready")
  );
}

export function motionEngine() {
  const all = listEngines();
  const id = readStore().motion;
  const hit = all.find((e) => e.id === id && e.kind === "motion" && e.status === "ready");
  return hit ?? firstReadyMotion(all)!;
}

export function resolveMotionEngine(id?: string) {
  const asked = !id || id === "ffmpeg-preview" ? undefined : id;
  if (!asked) return motionEngine();
  const hit = listEngines().find((e) => e.id === asked && e.kind === "motion" && e.status === "ready");
  if (!hit) {
    const row = listEngines().find((e) => e.id === asked && e.kind === "motion");
    throw new Error(
      row?.cloud ? `${asked} needs an API key in Settings` : `${asked} is not installed yet`,
    );
  }
  return hit;
}
