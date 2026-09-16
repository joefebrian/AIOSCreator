import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TRANSFORM_LOCK_PREFIX } from "./character-prompts";
import { h3FrameCount } from "./motion";
import { normalizeStillRefs, type GenerateStillOpts, type StillRefs } from "./still-refs";

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";

function ffmpegCrf18(buf: Buffer) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "creatoros-h3-"));
  const src = path.join(dir, "in.mp4");
  const dest = path.join(dir, "out.mp4");
  fs.writeFileSync(src, buf);
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn(
      FFMPEG,
      ["-y", "-i", src, "-c:v", "libx264", "-crf", "18", "-preset", "fast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", dest],
      { windowsHide: true },
    );
    let err = "";
    child.stderr.on("data", (d) => {
      err += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      try {
        if (code === 0 && fs.existsSync(dest) && fs.statSync(dest).size > 10_000) {
          resolve(fs.readFileSync(dest));
        } else reject(new Error(`ffmpeg crf18 failed (${code}). ${err.slice(-300)}`));
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  });
}

const COMFY = process.env.COMFYUI_URL || "http://127.0.0.1:8188";
const UNET = process.env.COMFY_UNET || "flux-2-klein-4b-fp8.safetensors";
const CLIP_STOCK = "qwen_3_4b.safetensors";
const CLIP_UNCENSORED = "qwen_3_4b_uncensored.safetensors";
const VAE = process.env.COMFY_VAE || "flux2-vae.safetensors";

function comfyTextEncoderDir() {
  return path.join(process.env.LOCALAPPDATA || "", "Programs", "ComfyUI", "models", "text_encoders");
}

/** Klein 4B only. Z-Image stays on stock Qwen3-4B. Falls back if the abliterated TE is missing. */
function klein4ClipName() {
  const want = process.env.COMFY_KLEIN_CLIP || CLIP_UNCENSORED;
  if (want === CLIP_STOCK) return CLIP_STOCK;
  const p = path.join(comfyTextEncoderDir(), want);
  return fs.existsSync(p) ? want : CLIP_STOCK;
}

const WIDTH = Number(process.env.COMFY_WIDTH || 768);
const HEIGHT = Number(process.env.COMFY_HEIGHT || 1280);
const STEPS = Number(process.env.COMFY_STEPS || 4);

function comfyInputDir() {
  return (
    process.env.COMFY_INPUT ||
    path.join(process.env.LOCALAPPDATA || "", "Programs", "ComfyUI", "input")
  );
}

export type ComfyStatus = {
  ok: boolean;
  url: string;
  error?: string;
  device?: string;
};

export async function comfyStatus(): Promise<ComfyStatus> {
  try {
    const res = await fetch(`${COMFY}/system_stats`, { cache: "no-store" });
    if (!res.ok) return { ok: false, url: COMFY, error: `HTTP ${res.status}` };
    const json = (await res.json()) as { devices?: { name?: string }[] };
    return { ok: true, url: COMFY, device: json.devices?.[0]?.name };
  } catch (err) {
    return {
      ok: false,
      url: COMFY,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function comfyFreeVram() {
  try {
    await fetch(`${COMFY}/free`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ unload_models: true, free_memory: true }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    /* Comfy old builds may lack /free */
  }
}

export async function comfyQueueBusy(): Promise<boolean> {
  try {
    const res = await fetch(`${COMFY}/queue`, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (!res.ok) return false;
    const q = (await res.json()) as { queue_running?: unknown[]; queue_pending?: unknown[] };
    return (q.queue_running?.length || 0) + (q.queue_pending?.length || 0) > 0;
  } catch {
    return false;
  }
}

function loaders() {
  return {
    "1": {
      class_type: "UNETLoader",
      inputs: { unet_name: UNET, weight_dtype: "default" },
    },
    "2": {
      class_type: "CLIPLoader",
      inputs: { clip_name: process.env.COMFY_CLIP || klein4ClipName(), type: "flux2", device: "cpu" },
    },
    "3": {
      class_type: "VAELoader",
      inputs: { vae_name: VAE },
    },
  };
}

function kleinTxt2ImgGraph(prompt: string, seed: number, w = WIDTH, h = HEIGHT) {
  return {
    ...loaders(),
    "4": {
      class_type: "CLIPTextEncode",
      inputs: { text: prompt, clip: ["2", 0] },
    },
    "5": {
      class_type: "ConditioningZeroOut",
      inputs: { conditioning: ["4", 0] },
    },
    "6": {
      class_type: "EmptyFlux2LatentImage",
      inputs: { width: w, height: h, batch_size: 1 },
    },
    "7": {
      class_type: "RandomNoise",
      inputs: { noise_seed: seed },
    },
    "8": {
      class_type: "KSamplerSelect",
      inputs: { sampler_name: "euler" },
    },
    "9": {
      class_type: "Flux2Scheduler",
      inputs: { steps: STEPS, width: w, height: h },
    },
    "10": {
      class_type: "CFGGuider",
      inputs: { model: ["1", 0], positive: ["4", 0], negative: ["5", 0], cfg: 1 },
    },
    "11": {
      class_type: "SamplerCustomAdvanced",
      inputs: {
        noise: ["7", 0],
        guider: ["10", 0],
        sampler: ["8", 0],
        sigmas: ["9", 0],
        latent_image: ["6", 0],
      },
    },
    "12": {
      class_type: "VAEDecode",
      inputs: { samples: ["11", 0], vae: ["3", 0] },
    },
    "13": {
      class_type: "SaveImage",
      inputs: { filename_prefix: "creatoros", images: ["12", 0] },
    },
  };
}

/** Keep-face (default) or physique-only transform. Klein has one ReferenceLatent. */
function kleinRefGraph(
  prompt: string,
  seed: number,
  refName: string,
  opts?: { transform?: boolean; width?: number; height?: number },
) {
  const locked = opts?.transform ? `${TRANSFORM_LOCK_PREFIX}${prompt}` : prompt;
  const w = opts?.width ?? WIDTH;
  const h = opts?.height ?? HEIGHT;
  return {
    ...loaders(),
    "4": {
      class_type: "LoadImage",
      inputs: { image: refName },
    },
    "5": {
      class_type: "FluxKontextImageScale",
      inputs: { image: ["4", 0] },
    },
    "6": {
      class_type: "VAEEncode",
      inputs: { pixels: ["5", 0], vae: ["3", 0] },
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: { text: locked, clip: ["2", 0] },
    },
    "8": {
      class_type: "ConditioningZeroOut",
      inputs: { conditioning: ["7", 0] },
    },
    "9": {
      class_type: "ReferenceLatent",
      inputs: { conditioning: ["7", 0], latent: ["6", 0] },
    },
    "10": {
      class_type: "ReferenceLatent",
      inputs: { conditioning: ["8", 0], latent: ["6", 0] },
    },
    "11": {
      class_type: "EmptyFlux2LatentImage",
      inputs: { width: w, height: h, batch_size: 1 },
    },
    "12": {
      class_type: "RandomNoise",
      inputs: { noise_seed: seed },
    },
    "13": {
      class_type: "KSamplerSelect",
      inputs: { sampler_name: "euler" },
    },
    "14": {
      class_type: "Flux2Scheduler",
      inputs: { steps: STEPS, width: w, height: h },
    },
    "15": {
      class_type: "CFGGuider",
      inputs: { model: ["1", 0], positive: ["9", 0], negative: ["10", 0], cfg: 1 },
    },
    "16": {
      class_type: "SamplerCustomAdvanced",
      inputs: {
        noise: ["12", 0],
        guider: ["15", 0],
        sampler: ["13", 0],
        sigmas: ["14", 0],
        latent_image: ["11", 0],
      },
    },
    "17": {
      class_type: "VAEDecode",
      inputs: { samples: ["16", 0], vae: ["3", 0] },
    },
    "18": {
      class_type: "SaveImage",
      inputs: { filename_prefix: "creatoros-id", images: ["17", 0] },
    },
  };
}

function stageInput(srcPath: string, prefix: string) {
  const dir = comfyInputDir();
  fs.mkdirSync(dir, { recursive: true });
  const name = `${prefix}${path.extname(srcPath) || ".png"}`;
  fs.copyFileSync(srcPath, path.join(dir, name));
  return name;
}

function stageRef(srcPath: string, prefix = "creatoros-ref") {
  return stageInput(srcPath, prefix);
}

type SavedFile = { filename: string; subfolder: string; type: string };

type HistoryEntry = {
  status?: { status_str?: string; messages?: unknown[] };
  outputs?: Record<
    string,
    {
      images?: SavedFile[];
      gifs?: SavedFile[];
      videos?: SavedFile[];
    }
  >;
};

function pickSaved(entry: HistoryEntry | undefined, saveNode: string): SavedFile | undefined {
  const out = entry?.outputs?.[saveNode];
  return out?.gifs?.[0] || out?.videos?.[0] || out?.images?.[0];
}

async function fetchComfyFile(file: SavedFile) {
  const qs = new URLSearchParams({
    filename: file.filename,
    subfolder: file.subfolder || "",
    type: file.type || "output",
  });
  const bin = await fetch(`${COMFY}/view?${qs.toString()}`);
  if (!bin.ok) throw new Error("ComfyUI view failed");
  return { buffer: Buffer.from(await bin.arrayBuffer()), filename: file.filename };
}

function comfyDown(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  if (/fetch failed|ECONNREFUSED|ECONNRESET|UND_ERR|Failed to fetch/i.test(msg)) {
    return `ComfyUI is offline or crashed at ${COMFY}. Restart Comfy, then retry. LTX-2 19B often kills the 3060 if H3/Klein is still loaded — wait for the other job to finish.`;
  }
  return msg;
}

async function queueAndWait(
  graph: Record<string, unknown>,
  saveNode: string,
  opts?: { timeoutMs?: number },
) {
  const status = await comfyStatus();
  if (!status.ok) {
    throw new Error(comfyDown(status.error || "offline"));
  }
  let queued: Response;
  try {
    queued = await fetch(`${COMFY}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: graph, client_id: "creatoros" }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    throw new Error(comfyDown(err));
  }
  const queuedBody = await queued.text();
  if (!queued.ok) {
    throw new Error(`ComfyUI queue failed: ${queued.status} ${queuedBody}`.slice(0, 400));
  }
  const parsed = JSON.parse(queuedBody) as {
    prompt_id?: string;
    node_errors?: Record<string, { errors?: { message?: string }[] }>;
  };
  const nodeErrors = parsed.node_errors
    ? Object.values(parsed.node_errors)
        .flatMap((n) => n.errors ?? [])
        .map((e) => e.message)
        .filter(Boolean)
    : [];
  if (nodeErrors.length) {
    throw new Error(`ComfyUI graph error: ${nodeErrors.join("; ")}`);
  }
  const prompt_id = parsed.prompt_id;
  if (!prompt_id) throw new Error("ComfyUI did not return prompt_id");
  const timeoutMs = opts?.timeoutMs ?? 300_000;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, 2000));
    let hist: Response;
    try {
      hist = await fetch(`${COMFY}/history/${prompt_id}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    } catch (err) {
      throw new Error(comfyDown(err));
    }
    const data = (await hist.json()) as Record<string, HistoryEntry>;
    const entry = data[prompt_id];
    if (entry?.status?.status_str === "error") {
      const msgs = entry.status.messages ?? [];
      const err = msgs.find((m) => Array.isArray(m) && m[0] === "execution_error") as
        | [string, { exception_message?: string; exception_type?: string }]
        | undefined;
      const detail = err?.[1]?.exception_message || err?.[1]?.exception_type || "execution failed";
      throw new Error(`ComfyUI ${detail}`.slice(0, 400));
    }
    const saved = pickSaved(entry, saveNode);
    if (saved) return fetchComfyFile(saved);
  }
  throw new Error("ComfyUI timed out waiting for output");
}

const Z_UNET = "z_image_turbo_int8_convrot.safetensors";
const Z_CLIP = process.env.COMFY_Z_CLIP || CLIP_STOCK;
const Z_VAE = "ae.safetensors";
const Z_W = Number(process.env.COMFY_Z_WIDTH || 768);
const Z_H = Number(process.env.COMFY_Z_HEIGHT || 1280);
const Z_STEPS = 8;

function zImageLoaders() {
  return {
    "1": {
      class_type: "UNETLoader",
      inputs: { unet_name: Z_UNET, weight_dtype: "default" },
    },
    "2": {
      class_type: "CLIPLoader",
      inputs: { clip_name: Z_CLIP, type: "lumina2", device: "cpu" },
    },
    "3": {
      class_type: "VAELoader",
      inputs: { vae_name: Z_VAE },
    },
  };
}

function zImageTxt2ImgGraph(prompt: string, seed: number, w = Z_W, h = Z_H) {
  return {
    ...zImageLoaders(),
    "4": {
      class_type: "CLIPTextEncode",
      inputs: { text: prompt, clip: ["2", 0] },
    },
    "5": {
      class_type: "ConditioningZeroOut",
      inputs: { conditioning: ["4", 0] },
    },
    "6": {
      class_type: "EmptySD3LatentImage",
      inputs: { width: w, height: h, batch_size: 1 },
    },
    "7": {
      class_type: "ModelSamplingAuraFlow",
      inputs: { model: ["1", 0], shift: 3 },
    },
    "8": {
      class_type: "KSampler",
      inputs: {
        seed,
        steps: Z_STEPS,
        cfg: 1,
        sampler_name: "res_multistep",
        scheduler: "simple",
        denoise: 1,
        model: ["7", 0],
        positive: ["4", 0],
        negative: ["5", 0],
        latent_image: ["6", 0],
      },
    },
    "9": {
      class_type: "VAEDecode",
      inputs: { samples: ["8", 0], vae: ["3", 0] },
    },
    "10": {
      class_type: "SaveImage",
      inputs: { filename_prefix: "creatoros-zimage", images: ["9", 0] },
    },
  };
}

/** Physique from the photo, new face — only when kind=transform. Keep-face uses the prompt as-is. */
function zImageRefGraph(prompt: string, seed: number, refName: string, transform = false, w = Z_W, h = Z_H) {
  const locked = transform ? `${TRANSFORM_LOCK_PREFIX}${prompt}` : prompt;
  return {
    ...zImageLoaders(),
    "4": {
      class_type: "LoadImage",
      inputs: { image: refName },
    },
    "5": {
      class_type: "ImageScale",
      inputs: {
        image: ["4", 0],
        width: w,
        height: h,
        upscale_method: "lanczos",
        crop: "center",
      },
    },
    "6": {
      class_type: "VAEEncode",
      inputs: { pixels: ["5", 0], vae: ["3", 0] },
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: { text: locked, clip: ["2", 0] },
    },
    "8": {
      class_type: "ConditioningZeroOut",
      inputs: { conditioning: ["7", 0] },
    },
    "9": {
      class_type: "ModelSamplingAuraFlow",
      inputs: { model: ["1", 0], shift: 3 },
    },
    "10": {
      class_type: "KSampler",
      inputs: {
        seed,
        steps: Z_STEPS,
        cfg: 1,
        sampler_name: "res_multistep",
        scheduler: "simple",
        denoise: 0.8,
        model: ["9", 0],
        positive: ["7", 0],
        negative: ["8", 0],
        latent_image: ["6", 0],
      },
    },
    "11": {
      class_type: "VAEDecode",
      inputs: { samples: ["10", 0], vae: ["3", 0] },
    },
    "12": {
      class_type: "SaveImage",
      inputs: { filename_prefix: "creatoros-zimage-id", images: ["11", 0] },
    },
  };
}

function sd15Graph(prompt: string, seed: number) {
  const ckpt = process.env.COMFY_CKPT || "v1-5-pruned-emaonly.safetensors";
  return {
    "4": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: ckpt },
    },
    "5": {
      class_type: "EmptyLatentImage",
      inputs: { width: 512, height: 768, batch_size: 1 },
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: { text: prompt, clip: ["4", 1] },
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: { text: "blurry, low quality, watermark, extra limbs, extra faces", clip: ["4", 1] },
    },
    "3": {
      class_type: "KSampler",
      inputs: {
        seed,
        steps: 20,
        cfg: 7,
        sampler_name: "euler",
        scheduler: "normal",
        denoise: 1,
        model: ["4", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["5", 0],
      },
    },
    "8": {
      class_type: "VAEDecode",
      inputs: { samples: ["3", 0], vae: ["4", 2] },
    },
    "9": {
      class_type: "SaveImage",
      inputs: { filename_prefix: "creatoros-sd15", images: ["8", 0] },
    },
  };
}

const Q_UNET = "qwen_image_edit_2511_int8_convrot.safetensors";
const Q_CLIP = "qwen_2.5_vl_7b_fp8_scaled.safetensors";
const Q_VAE = "qwen_image_vae.safetensors";
const Q_LORA = "Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors";
/** Face lock headshot. 512×640 was T0 emergency; 768×960 is the quality plate. */
const Q_W = 768;
const Q_H = 960;
const Q_FACE_W = 768;
const Q_FACE_H = 960;
const Q_BODY_W = 768;
const Q_BODY_H = 1280;

function qwenIsTransform(prompt: string) {
  return prompt.startsWith(TRANSFORM_LOCK_PREFIX) || /different person from the reference|a different person, not the same identity/i.test(prompt);
}

function qwenIsBump(prompt: string) {
  return /same crop, same pose|reproduce this exact (shoulders-up|full-length)?\s*FACE LOCK|reproduce this exact .* identity plate/i.test(
    prompt,
  );
}

function qwenSize(prompt: string, kind?: GenerateStillOpts["kind"], fallback?: { w: number; h: number }) {
  if (/\b3:4\b/.test(prompt)) return { w: 768, h: 1024 };
  if (/\b9:16\b/.test(prompt)) return { w: 768, h: 1280 };
  if (/\b16:9\b/.test(prompt)) return { w: 1024, h: 576 };
  if (/\b4:5\b/.test(prompt)) return { w: 768, h: 960 };
  if (/\b1:1\b/.test(prompt)) return { w: 768, h: 768 };
  if (kind === "identity") return { w: 768, h: 1024 };
  if (fallback) return fallback;
  return { w: Q_W, h: Q_H };
}

function qwenCanvasSize(
  prompt: string,
  kind: GenerateStillOpts["kind"],
  opts: GenerateStillOpts | undefined,
  triple: boolean,
  restyle: boolean,
) {
  const maxW = 1280;
  const maxH = triple ? 1024 : 1280;
  if (opts?.width && opts?.height) {
    let w = opts.width;
    let h = opts.height;
    if (w > maxW || h > maxH) {
      const s = Math.min(maxW / w, maxH / h);
      w = Math.max(64, Math.round((w * s) / 8) * 8);
      h = Math.max(64, Math.round((h * s) / 8) * 8);
    }
    return { w, h };
  }
  return qwenSize(prompt, kind, restyle || triple ? { w: 768, h: 1024 } : { w: Q_W, h: Q_H });
}

function qwenKind(prompt: string, kind?: GenerateStillOpts["kind"]): NonNullable<GenerateStillOpts["kind"]> {
  if (kind) return kind;
  if (qwenIsTransform(prompt)) return "transform";
  if (qwenIsBump(prompt)) return "bump";
  return "restyle";
}

function qwenEditGraph(
  prompt: string,
  seed: number,
  refs: { faceName: string; bodyName?: string; sceneName?: string },
  opts?: GenerateStillOpts,
) {
  const kind = qwenKind(prompt, opts?.kind);
  const restyle = kind === "restyle" || kind === "identity";
  const faceswap = kind === "faceswap";
  const triple = Boolean(refs.faceName && refs.bodyName && refs.sceneName);
  const size = qwenCanvasSize(prompt, kind, opts, triple, restyle);
  const denoise = kind === "bump" ? 0.55 : 1;
  const encodePixels = faceswap && refs.sceneName ? "19" : "5";
  const faceW = triple ? 512 : Q_FACE_W;
  const faceH = triple ? 640 : Q_FACE_H;
  const bodyW = triple ? 512 : Q_BODY_W;
  const bodyH = triple ? 768 : Q_BODY_H;
  const useCanvas = restyle || triple || (faceswap && Boolean(opts?.width && opts?.height));
  const latent = useCanvas
    ? {
        class_type: "EmptyLatentImage",
        inputs: { width: size.w, height: size.h, batch_size: 1 },
      }
    : {
        class_type: "VAEEncode",
        inputs: { pixels: [encodePixels, 0], vae: ["3", 0] },
      };

  const encodeInputs: Record<string, unknown> = {
    clip: ["2", 0],
    image1: faceswap && refs.sceneName ? ["19", 0] : ["5", 0],
    prompt,
  };
  if (faceswap && refs.sceneName) {
    if (refs.faceName) encodeInputs.image2 = ["5", 0];
    if (refs.bodyName) encodeInputs.image3 = ["21", 0];
  } else {
    if (refs.bodyName) encodeInputs.image2 = ["21", 0];
    if (refs.sceneName) encodeInputs.image3 = ["19", 0];
  }

  const graph: Record<string, unknown> = {
    "1": {
      class_type: "UNETLoader",
      inputs: { unet_name: Q_UNET, weight_dtype: "default" },
    },
    "2": {
      class_type: "CLIPLoader",
      inputs: { clip_name: Q_CLIP, type: "qwen_image", device: "cpu" },
    },
    "3": {
      class_type: "VAELoader",
      inputs: { vae_name: Q_VAE },
    },
    "4": {
      class_type: "LoadImage",
      inputs: { image: refs.faceName },
    },
    "5": {
      class_type: "ImageScale",
      inputs: {
        image: ["4", 0],
        width: faceW,
        height: faceH,
        upscale_method: "lanczos",
        crop: "center",
      },
    },
    "6": {
      class_type: "ModelSamplingAuraFlow",
      inputs: { model: ["1", 0], shift: 3.1 },
    },
    "7": {
      class_type: "CFGNorm",
      inputs: { model: ["6", 0], strength: 1, pre_cfg: false },
    },
    "8": {
      class_type: "LoraLoaderModelOnly",
      inputs: { model: ["7", 0], lora_name: Q_LORA, strength_model: 1 },
    },
    "9": {
      class_type: "TextEncodeQwenImageEditPlus",
      inputs: encodeInputs,
    },
    "10": {
      class_type: "TextEncodeQwenImageEditPlus",
      inputs: { clip: ["2", 0], prompt: "" },
    },
    "11": latent,
    "12": {
      class_type: "KSampler",
      inputs: {
        seed,
        steps: 4,
        cfg: 1,
        sampler_name: "euler",
        scheduler: "simple",
        denoise,
        model: ["8", 0],
        positive: ["9", 0],
        negative: ["10", 0],
        latent_image: ["11", 0],
      },
    },
    "13": {
      class_type: "VAEDecode",
      inputs: { samples: ["12", 0], vae: ["3", 0] },
    },
    "14": {
      class_type: "SaveImage",
      inputs: { filename_prefix: "creatoros-qwen-edit", images: ["13", 0] },
    },
  };
  if (refs.bodyName) {
    graph["20"] = {
      class_type: "LoadImage",
      inputs: { image: refs.bodyName },
    };
    graph["21"] = {
      class_type: "ImageScale",
      inputs: {
        image: ["20", 0],
        width: bodyW,
        height: bodyH,
        upscale_method: "lanczos",
        crop: "center",
      },
    };
  }
  if (refs.sceneName) {
    graph["18"] = {
      class_type: "LoadImage",
      inputs: { image: refs.sceneName },
    };
    graph["19"] = {
      class_type: "ImageScale",
      inputs: {
        image: ["18", 0],
        width: size.w,
        height: size.h,
        upscale_method: "lanczos",
        crop: "center",
      },
    };
  }
  return graph;
}

function klein9bTxt2ImgGraph(prompt: string, seed: number) {
  const w = 768;
  const h = 768;
  const steps = 20;
  return {
    "1": {
      class_type: "UNETLoader",
      inputs: { unet_name: "flux-2-klein-base-9b-fp8.safetensors", weight_dtype: "default" },
    },
    "2": {
      class_type: "CLIPLoader",
      inputs: { clip_name: "qwen_3_8b_fp8mixed.safetensors", type: "flux2", device: "cpu" },
    },
    "3": {
      class_type: "VAELoader",
      inputs: { vae_name: VAE },
    },
    "4": {
      class_type: "CLIPTextEncode",
      inputs: { text: prompt, clip: ["2", 0] },
    },
    "5": {
      class_type: "ConditioningZeroOut",
      inputs: { conditioning: ["4", 0] },
    },
    "6": {
      class_type: "EmptyFlux2LatentImage",
      inputs: { width: w, height: h, batch_size: 1 },
    },
    "7": {
      class_type: "RandomNoise",
      inputs: { noise_seed: seed },
    },
    "8": {
      class_type: "KSamplerSelect",
      inputs: { sampler_name: "euler" },
    },
    "9": {
      class_type: "Flux2Scheduler",
      inputs: { steps, width: w, height: h },
    },
    "10": {
      class_type: "CFGGuider",
      inputs: { model: ["1", 0], positive: ["4", 0], negative: ["5", 0], cfg: 1 },
    },
    "11": {
      class_type: "SamplerCustomAdvanced",
      inputs: {
        noise: ["7", 0],
        guider: ["10", 0],
        sampler: ["8", 0],
        sigmas: ["9", 0],
        latent_image: ["6", 0],
      },
    },
    "12": {
      class_type: "VAEDecode",
      inputs: { samples: ["11", 0], vae: ["3", 0] },
    },
    "13": {
      class_type: "SaveImage",
      inputs: { filename_prefix: "creatoros-klein9b", images: ["12", 0] },
    },
  };
}

export async function comfyTxt2Img(
  prompt: string,
  reference?: string | StillRefs,
  engine = "flux2-klein-4b",
  opts?: GenerateStillOpts,
) {
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const refs = normalizeStillRefs(reference);
  const primary = refs.scene || refs.face || refs.body;
  const w = opts?.width;
  const h = opts?.height;
  if (engine === "sd15") {
    if (primary) {
      throw new Error("SD 1.5 has no character lock. Switch image engine to Klein or Z-Image Turbo.");
    }
    return queueAndWait(sd15Graph(prompt, seed), "9");
  }
  if (engine === "z-image-turbo") {
    if (primary) {
      if (!fs.existsSync(primary)) throw new Error("character lock file missing");
      const refName = stageRef(primary);
      return queueAndWait(zImageRefGraph(prompt, seed, refName, opts?.kind === "transform", w ?? Z_W, h ?? Z_H), "12");
    }
    return queueAndWait(zImageTxt2ImgGraph(prompt, seed, w ?? Z_W, h ?? Z_H), "10");
  }
  if (engine === "flux2-klein-base-9b") {
    if (primary) {
      throw new Error("Klein 9B research smoke is text-to-image only for now.");
    }
    return queueAndWait(klein9bTxt2ImgGraph(prompt, seed), "13", { timeoutMs: 30 * 60 * 1000 });
  }
  if (engine === "qwen-image-edit") {
    const facePath = refs.face || primary;
    if (!facePath) {
      throw new Error("Qwen Image Edit needs a reference photo. Use Z-Image Turbo for prompt-only.");
    }
    if (!fs.existsSync(facePath)) throw new Error("character lock file missing");
    await comfyFreeVram();
    const faceName = stageRef(facePath, "creatoros-face");
    const bodyName =
      refs.body && refs.body !== facePath && fs.existsSync(refs.body)
        ? stageRef(refs.body, "creatoros-body")
        : undefined;
    const sceneName =
      refs.scene && fs.existsSync(refs.scene) ? stageRef(refs.scene, "creatoros-scene") : undefined;
    return queueAndWait(qwenEditGraph(prompt, seed, { faceName, bodyName, sceneName }, opts), "14", {
      timeoutMs: 20 * 60 * 1000,
    });
  }
  if (primary) {
    if (!fs.existsSync(primary)) throw new Error("character lock file missing");
    const refName = stageRef(primary);
    return queueAndWait(
      kleinRefGraph(prompt, seed, refName, {
        transform: opts?.kind === "transform",
        width: w,
        height: h,
      }),
      "18",
    );
  }
  return queueAndWait(kleinTxt2ImgGraph(prompt, seed, w ?? WIDTH, h ?? HEIGHT), "13");
}

const H3_FL2VA = "minimax_h3_fl2va_pruned_int8_convrot.safetensors";
const H3_REF2VA = "minimax_h3_ref2va_pruned_int8_convrot.safetensors";
const H3_CLIP = "qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors";
const H3_VVAE = "minimax_h3_video_vae_fp16.safetensors";
const H3_AVAE = "minimax_h3_audio_vae_fp32.safetensors";
/** LightX2V Ref2V distill. Full BF16 (~1.87GB) OOM'd 2s 448×800 on 3060 12GB. Rank-21 resize is the T0 file. */
const H3_REF2V_TURBO_FULL = "minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors";
const H3_REF2V_TURBO = "minimax_h3_ref2v_turbo_4step_v0.1_comfyui_resized_avg_rank_21_bf16.safetensors";
/** 9:16. Native 20-step I2V 640×1152. Turbo LoRA v4 OOM'd that on 3060 — 576×1024 only. R2V stays 448×800. */
const H3_I2V_W = 640;
const H3_I2V_H = 1152;
const H3_I2V_TURBO_W = 576;
const H3_I2V_TURBO_H = 1024;
const H3_R2V_W = 448;
const H3_R2V_H = 800;
const H3_LEN = 73;
const H3_STEPS = 20;
const H3_TURBO_STEPS = 4;
/** larryvrh I2V/T2V turbo. 6 steps for small-motion UGC (v4 smear at 4-step heavy motion). */
const H3_I2V_TURBO_STEPS = 6;
const H3_I2V_TURBO_LORA = "minimax_h3_turbo_v4_step600_ema.safetensors";
/** Community NSFW. I2V/T2V only — FL2VA trunk. Not R2V. Strength 0.5 on pruned INT8. */
const H3_NUDE_I2V_LORA = "SexGod_NaughtyTimes_v3_rank64_unpruned.safetensors";
/** Community NSFW copy. Ref2VA trunk only. Strength 1.0. Do not mix with NaughtyTimes. */
const H3_NUDE_R2V_LORA = "AfterMidnight_ref2va_h3_sexytime_rank64-v1.2.safetensors";

function comfyLoraDir() {
  return (
    process.env.COMFY_LORA ||
    path.join(process.env.LOCALAPPDATA || "", "Programs", "ComfyUI", "models", "loras")
  );
}

function h3Ref2vTurboName() {
  // 3060 12GB: both full BF16 (~1.87GB) and rank-21 (~312MB) OOM'd 2s 448×800 R2V.
  // Dense 20-step without LoRA is the proven T0 path. Opt-in only.
  if (process.env.CREATOROS_H3_TURBO !== "1") return null;
  const dir = comfyLoraDir();
  if (fs.existsSync(path.join(dir, H3_REF2V_TURBO))) return H3_REF2V_TURBO;
  if (process.env.CREATOROS_H3_TURBO_FULL === "1" && fs.existsSync(path.join(dir, H3_REF2V_TURBO_FULL))) {
    return H3_REF2V_TURBO_FULL;
  }
  return null;
}

function h3SaveVideo(prefix: string, video: [string, number]) {
  return {
    class_type: "SaveVideo",
    inputs: {
      video,
      filename_prefix: prefix,
      format: "mp4",
      codec: "h264",
    },
  };
}
const H3_TIMEOUT = 180 * 60 * 1000;

const H3_I2V_PROMPT =
  "Cinematic 9:16 live-action. The person in the first frame looks at camera, natural blink and breath, hair moves in light air, product-ad energy. Audio: quiet studio room tone, soft fabric rustle. Music: N/A.";

const H3_R2V_PROMPT =
  "<Subject 1> is the person in <Picture 1>, same face and body. [reference generation] They keep identity from <Picture 1>. Wardrobe matches the still (nude if the still is nude). If a motion clip is attached as <Video 1>, follow that movement. Cinematic 9:16. Audio: quiet studio room tone.";

function h3I2vTurboOn() {
  const lora = fs.existsSync(path.join(comfyLoraDir(), H3_I2V_TURBO_LORA));
  const node = fs.existsSync(
    path.join(process.env.LOCALAPPDATA || "", "Programs", "ComfyUI", "custom_nodes", "ComfyUI-MiniMax-H3-Turbo", "__init__.py"),
  );
  return lora && node;
}

function h3NudeI2vOn() {
  return fs.existsSync(path.join(comfyLoraDir(), H3_NUDE_I2V_LORA));
}

function h3NudeR2vOn() {
  return fs.existsSync(path.join(comfyLoraDir(), H3_NUDE_R2V_LORA));
}

function h3I2vGraph(prompt: string, seed: number, firstFrame: string, length = H3_LEN, nude = false) {
  const useNude = nude && h3NudeI2vOn();
  const useTurbo = !useNude && h3I2vTurboOn();
  const model: [string, number] = useNude ? ["16", 0] : useTurbo ? ["16", 0] : ["1", 0];
  const width = useTurbo ? H3_I2V_TURBO_W : H3_I2V_W;
  const height = useTurbo ? H3_I2V_TURBO_H : H3_I2V_H;
  const graph: Record<string, unknown> = {
    "1": {
      class_type: "UNETLoader",
      inputs: { unet_name: H3_FL2VA, weight_dtype: "default" },
    },
    "2": {
      class_type: "CLIPLoader",
      inputs: { clip_name: H3_CLIP, type: "minimax", device: "cpu" },
    },
    "3": {
      class_type: "VAELoader",
      inputs: { vae_name: H3_VVAE },
    },
    "4": {
      class_type: "VAELoader",
      inputs: { vae_name: H3_AVAE },
    },
    "5": {
      class_type: "LoadImage",
      inputs: { image: firstFrame },
    },
    "19": {
      class_type: "ImageScale",
      inputs: {
        image: ["5", 0],
        width,
        height,
        upscale_method: "lanczos",
        crop: "center",
      },
    },
    "6": {
      class_type: "MiniMaxH3ImageToVideo",
      inputs: {
        clip: ["2", 0],
        vae: ["3", 0],
        first_frame: ["19", 0],
        prompt,
        width,
        height,
        length,
      },
    },
    "7": {
      class_type: "RandomNoise",
      inputs: { noise_seed: seed },
    },
    "8": useTurbo
      ? { class_type: "MiniMaxH3TurboSampler", inputs: {} }
      : { class_type: "KSamplerSelect", inputs: { sampler_name: useNude ? "euler" : "res_multistep" } },
    "9": {
      class_type: "BasicScheduler",
      inputs: { model, scheduler: "simple", steps: useTurbo ? H3_I2V_TURBO_STEPS : H3_STEPS, denoise: 1 },
    },
    "10": {
      class_type: "BasicGuider",
      inputs: { model, conditioning: ["6", 0] },
    },
    "11": {
      class_type: "SamplerCustomAdvanced",
      inputs: {
        noise: ["7", 0],
        guider: ["10", 0],
        sampler: ["8", 0],
        sigmas: ["9", 0],
        latent_image: ["6", 1],
      },
    },
    "12": {
      class_type: "VAEDecode",
      inputs: { samples: ["11", 0], vae: ["3", 0] },
    },
    "13": {
      class_type: "VAEDecodeAudio",
      inputs: { samples: ["11", 0], vae: ["4", 0] },
    },
    "14": {
      class_type: "CreateVideo",
      inputs: { images: ["12", 0], audio: ["13", 0], fps: 24 },
    },
    "15": h3SaveVideo("creatoros-h3", ["14", 0]),
  };
  if (useNude) {
    graph["16"] = {
      class_type: "LoraLoaderModelOnly",
      inputs: { model: ["1", 0], lora_name: H3_NUDE_I2V_LORA, strength_model: 0.5 },
    };
  } else if (useTurbo) {
    graph["16"] = {
      class_type: "MiniMaxH3TurboLoRA",
      inputs: {
        model: ["1", 0],
        lora_name: H3_I2V_TURBO_LORA,
        strength: 1.0,
        low_vram: true,
      },
    };
  }
  return graph;
}

function h3R2vGraph(prompt: string, seed: number, picture: string, motionFile?: string, length = H3_LEN, nude = false) {
  const useNude = nude && h3NudeR2vOn();
  const turboLora = useNude ? null : h3Ref2vTurboName();
  const turbo = Boolean(turboLora);
  const model: [string, number] = useNude || turbo ? ["17", 0] : ["1", 0];
  const graph: Record<string, unknown> = {
    "1": {
      class_type: "UNETLoader",
      inputs: { unet_name: H3_REF2VA, weight_dtype: "default" },
    },
    "2": {
      class_type: "CLIPLoader",
      inputs: { clip_name: H3_CLIP, type: "minimax", device: "cpu" },
    },
    "3": {
      class_type: "VAELoader",
      inputs: { vae_name: H3_VVAE },
    },
    "4": {
      class_type: "VAELoader",
      inputs: { vae_name: H3_AVAE },
    },
    "5": {
      class_type: "LoadImage",
      inputs: { image: picture },
    },
    "18": {
      class_type: "ImageScale",
      inputs: {
        image: ["5", 0],
        width: H3_R2V_W,
        height: H3_R2V_H,
        upscale_method: "lanczos",
        crop: "center",
      },
    },
    "6": {
      class_type: "MiniMaxH3ReferenceToVideo",
      inputs: {
        clip: ["2", 0],
        vae: ["3", 0],
        audio_vae: ["4", 0],
        prompt,
        width: H3_R2V_W,
        height: H3_R2V_H,
        length,
        ref_image_size: "match",
        "ref_images.ref_image_0": ["18", 0],
      },
    },
    "7": {
      class_type: "RandomNoise",
      inputs: { noise_seed: seed },
    },
    "8": {
      class_type: "KSamplerSelect",
      inputs: { sampler_name: useNude || turbo ? "euler" : "res_multistep" },
    },
    "9": {
      class_type: "BasicScheduler",
      inputs: {
        model,
        scheduler: useNude ? "beta" : "simple",
        steps: turbo ? H3_TURBO_STEPS : H3_STEPS,
        denoise: 1,
      },
    },
    "10": {
      class_type: "BasicGuider",
      inputs: { model, conditioning: ["6", 0] },
    },
    "11": {
      class_type: "SamplerCustomAdvanced",
      inputs: {
        noise: ["7", 0],
        guider: ["10", 0],
        sampler: ["8", 0],
        sigmas: ["9", 0],
        latent_image: ["6", 1],
      },
    },
    "12": {
      class_type: "VAEDecode",
      inputs: { samples: ["11", 0], vae: ["3", 0] },
    },
    "13": {
      class_type: "VAEDecodeAudio",
      inputs: { samples: ["11", 0], vae: ["4", 0] },
    },
    "14": {
      class_type: "CreateVideo",
      inputs: { images: ["12", 0], audio: ["13", 0], fps: 24 },
    },
    "15": h3SaveVideo("creatoros-h3r2v", ["14", 0]),
  };
  if (useNude) {
    graph["16"] = {
      class_type: "LoraLoaderModelOnly",
      inputs: { model: ["1", 0], lora_name: H3_NUDE_R2V_LORA, strength_model: 1 },
    };
    graph["17"] = {
      class_type: "MiniMaxH3SigmaShift",
      inputs: { model: ["16", 0], shift_video: 12, shift_audio: 3 },
    };
  } else if (turbo) {
    // Distill LoRA wants strength 1.0 (Kablex / LightX2V). 0.75 is for mixing turbo onto longer schedules.
    graph["16"] = {
      class_type: "LoraLoaderModelOnly",
      inputs: { model: ["1", 0], lora_name: turboLora, strength_model: 1 },
    };
    graph["17"] = {
      class_type: "MiniMaxH3SigmaShift",
      inputs: { model: ["16", 0], shift_video: 12, shift_audio: 3 },
    };
  }
  if (motionFile) {
    const r2v = graph["6"] as { inputs: Record<string, unknown> };
    graph["20"] = { class_type: "LoadVideo", inputs: { file: motionFile } };
    graph["21"] = { class_type: "GetVideoComponents", inputs: { video: ["20", 0] } };
    r2v.inputs["ref_videos.ref_video_0"] = ["21", 0];
    r2v.inputs["ref_video_audios.ref_video_audio_0"] = ["21", 1];
  }
  return graph;
}

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(FFMPEG, args, { windowsHide: true });
    let err = "";
    child.stderr.on("data", (d) => {
      err += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed (${code}). ${err.slice(-400)}`));
    });
  });
}

/** 60s-class I2V on 12GB: 5s windows (proven), last frame continues, drop 5 overlap frames. Not native 60s denoise. Not SageAttention. */
export async function comfyH3I2VLong(
  imagePath: string,
  prompt?: string,
  totalSec = 60,
  nude = false,
  onChunk?: (done: number, total: number) => void,
) {
  if (!fs.existsSync(imagePath)) throw new Error("character still not on disk");
  const windowSec = 5;
  const overlapFrames = 5;
  const sec = Math.min(60, Math.max(5, Math.round(totalSec || 60)));
  const chunks = Math.max(1, Math.ceil(sec / windowSec));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "creatoros-h3-long-"));
  const frames = h3FrameCount(windowSec);
  let still = imagePath;
  const cuts: string[] = [];
  try {
    for (let i = 0; i < chunks; i++) {
      onChunk?.(i + 1, chunks);
      const { buffer } = await comfyH3I2V(still, prompt, frames, nude);
      const raw = path.join(dir, `raw-${i}.mp4`);
      fs.writeFileSync(raw, buffer);
      const cut = path.join(dir, `cut-${i}.mp4`);
      if (i === 0) {
        fs.copyFileSync(raw, cut);
      } else {
        await runFfmpeg([
          "-y",
          "-i",
          raw,
          "-vf",
          `trim=start_frame=${overlapFrames},setpts=PTS-STARTPTS`,
          "-af",
          `atrim=start=${(overlapFrames / 24).toFixed(4)},asetpts=PTS-STARTPTS`,
          "-c:v",
          "libx264",
          "-crf",
          "18",
          "-preset",
          "fast",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-b:a",
          "160k",
          cut,
        ]);
      }
      cuts.push(cut);
      // image2 treats `still-0.png` as a sequence and may not write that path.
      const next = path.join(dir, `continue${i}.png`);
      await runFfmpeg(["-y", "-sseof", "-0.15", "-i", raw, "-update", "1", "-frames:v", "1", "-q:v", "2", next]);
      if (!fs.existsSync(next) || fs.statSync(next).size < 1000) {
        await runFfmpeg(["-y", "-i", raw, "-vf", "reverse", "-update", "1", "-frames:v", "1", "-q:v", "2", next]);
      }
      if (!fs.existsSync(next) || fs.statSync(next).size < 1000) {
        throw new Error(`last-frame extract empty for chunk ${i}`);
      }
      still = next;
    }
    const list = path.join(dir, "concat.txt");
    fs.writeFileSync(
      list,
      cuts.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n"),
    );
    const out = path.join(dir, "out.mp4");
    await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", out]);
    if (!fs.existsSync(out) || fs.statSync(out).size < 10_000) throw new Error("long I2V concat produced empty file");
    return { buffer: fs.readFileSync(out) };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export async function comfyH3I2V(imagePath: string, prompt?: string, length = H3_LEN, nude = false) {
  if (!fs.existsSync(imagePath)) throw new Error("character still not on disk");
  if (nude && !h3NudeI2vOn()) throw new Error("NaughtyTimes nudity LoRA missing — drop SexGod_NaughtyTimes_v3_rank64_unpruned.safetensors in ComfyUI/models/loras");
  const name = stageInput(imagePath, "creatoros-h3-still");
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const out = await queueAndWait(h3I2vGraph(prompt?.trim() || H3_I2V_PROMPT, seed, name, length, nude), "15", {
    timeoutMs: H3_TIMEOUT,
  });
  try {
    return { ...out, buffer: await ffmpegCrf18(out.buffer) };
  } catch {
    return out;
  }
}

export async function comfyH3R2V(imagePath: string, motionPath?: string, prompt?: string, length = H3_LEN, nude = false) {
  if (!fs.existsSync(imagePath)) throw new Error("character still not on disk");
  if (nude && !h3NudeR2vOn()) throw new Error("AfterMidnight nudity LoRA missing — drop AfterMidnight_ref2va_h3_sexytime_rank64-v1.2.safetensors in ComfyUI/models/loras");
  const picture = stageInput(imagePath, "creatoros-h3-r2v-pic");
  const motion = motionPath && fs.existsSync(motionPath) ? stageInput(motionPath, "creatoros-h3-r2v-mot") : undefined;
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const text = prompt?.trim() || (motion ? H3_R2V_PROMPT : H3_R2V_PROMPT.replace("If a motion clip is attached as <Video 1>, follow that movement. ", ""));
  return queueAndWait(h3R2vGraph(text, seed, picture, motion, length, nude), "15", { timeoutMs: H3_TIMEOUT });
}

const WAN_UNET = "wan2.2_ti2v_5B_fp16.safetensors";
const WAN_CLIP = "umt5_xxl_fp8_e4m3fn_scaled.safetensors";
const WAN_VAE = "wan2.2_vae.safetensors";
const WAN_W = 480;
const WAN_H = 832;
const WAN_LEN = 49;
const WAN_STEPS = 20;
const WAN_TIMEOUT = 30 * 60 * 1000;
const WAN_NEG =
  "色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走";
const WAN_I2V_PROMPT =
  "Cinematic 9:16 live-action. The person in the first frame looks at camera, natural blink and breath, hair moves in light air, product-ad energy.";

function wanI2vGraph(prompt: string, seed: number, picture: string, length = WAN_LEN) {
  return {
    "1": {
      class_type: "UNETLoader",
      inputs: { unet_name: WAN_UNET, weight_dtype: "default" },
    },
    "2": {
      class_type: "CLIPLoader",
      inputs: { clip_name: WAN_CLIP, type: "wan", device: "cpu" },
    },
    "3": {
      class_type: "VAELoader",
      inputs: { vae_name: WAN_VAE },
    },
    "4": {
      class_type: "LoadImage",
      inputs: { image: picture },
    },
    "5": {
      class_type: "CLIPTextEncode",
      inputs: { text: prompt, clip: ["2", 0] },
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: { text: WAN_NEG, clip: ["2", 0] },
    },
    "7": {
      class_type: "Wan22ImageToVideoLatent",
      inputs: {
        vae: ["3", 0],
        start_image: ["4", 0],
        width: WAN_W,
        height: WAN_H,
        length,
        batch_size: 1,
      },
    },
    "8": {
      class_type: "ModelSamplingSD3",
      inputs: { model: ["1", 0], shift: 8 },
    },
    "9": {
      class_type: "KSampler",
      inputs: {
        seed,
        steps: WAN_STEPS,
        cfg: 5,
        sampler_name: "uni_pc",
        scheduler: "simple",
        denoise: 1,
        model: ["8", 0],
        positive: ["5", 0],
        negative: ["6", 0],
        latent_image: ["7", 0],
      },
    },
    "10": {
      class_type: "VAEDecode",
      inputs: { samples: ["9", 0], vae: ["3", 0] },
    },
    "11": {
      class_type: "CreateVideo",
      inputs: { images: ["10", 0], fps: 24 },
    },
    "12": {
      class_type: "SaveVideo",
      inputs: { video: ["11", 0], filename_prefix: "creatoros-wan5b", format: "mp4", codec: "h264" },
    },
  };
}

export async function comfyWanI2V(imagePath: string, prompt?: string, length = WAN_LEN) {
  if (!fs.existsSync(imagePath)) throw new Error("character still not on disk");
  const picture = stageInput(imagePath, "creatoros-wan-still");
  const seed = Math.floor(Math.random() * 1_000_000_000);
  return queueAndWait(wanI2vGraph(prompt?.trim() || WAN_I2V_PROMPT, seed, picture, length), "12", {
    timeoutMs: WAN_TIMEOUT,
  });
}

const HY_UNET = "hunyuanvideo1.5_480p_i2v_step_distilled_fp8_scaled.safetensors";
const HY_CLIP1 = "qwen_2.5_vl_7b_fp8_scaled.safetensors";
const HY_CLIP2 = "byt5_small_glyphxl_fp16.safetensors";
const HY_VAE = "hunyuanvideo15_vae_fp16.safetensors";
const HY_VISION = "sigclip_vision_patch14_384.safetensors";
const HY_W = 480;
const HY_H = 848;
const HY_LEN = 81;
const HY_STEPS = 8;
const HY_TIMEOUT = 30 * 60 * 1000;
const HY_I2V_PROMPT =
  "Cinematic 9:16 live-action. The person in the first frame looks at camera, natural blink and breath, hair moves in light air, product-ad energy.";

function hunyuanI2vGraph(prompt: string, seed: number, picture: string, length = HY_LEN) {
  return {
    "1": {
      class_type: "UNETLoader",
      inputs: { unet_name: HY_UNET, weight_dtype: "default" },
    },
    "2": {
      class_type: "DualCLIPLoader",
      inputs: {
        clip_name1: HY_CLIP1,
        clip_name2: HY_CLIP2,
        type: "hunyuan_video_15",
        device: "cpu",
      },
    },
    "3": {
      class_type: "VAELoader",
      inputs: { vae_name: HY_VAE },
    },
    "4": {
      class_type: "CLIPVisionLoader",
      inputs: { clip_name: HY_VISION },
    },
    "5": {
      class_type: "LoadImage",
      inputs: { image: picture },
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: { text: prompt, clip: ["2", 0] },
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: { text: "", clip: ["2", 0] },
    },
    "8": {
      class_type: "CLIPVisionEncode",
      inputs: { clip_vision: ["4", 0], image: ["5", 0], crop: "center" },
    },
    "9": {
      class_type: "HunyuanVideo15ImageToVideo",
      inputs: {
        positive: ["6", 0],
        negative: ["7", 0],
        vae: ["3", 0],
        start_image: ["5", 0],
        clip_vision_output: ["8", 0],
        width: HY_W,
        height: HY_H,
        length,
        batch_size: 1,
      },
    },
    "10": {
      class_type: "RandomNoise",
      inputs: { noise_seed: seed },
    },
    "11": {
      class_type: "KSamplerSelect",
      inputs: { sampler_name: "euler" },
    },
    "12": {
      class_type: "BasicScheduler",
      inputs: { model: ["1", 0], scheduler: "simple", steps: HY_STEPS, denoise: 1 },
    },
    "13": {
      class_type: "ModelSamplingSD3",
      inputs: { model: ["1", 0], shift: 7 },
    },
    "14": {
      class_type: "CFGGuider",
      inputs: { model: ["13", 0], positive: ["9", 0], negative: ["9", 1], cfg: 1 },
    },
    "15": {
      class_type: "SamplerCustomAdvanced",
      inputs: {
        noise: ["10", 0],
        guider: ["14", 0],
        sampler: ["11", 0],
        sigmas: ["12", 0],
        latent_image: ["9", 2],
      },
    },
    "16": {
      class_type: "VAEDecode",
      inputs: { samples: ["15", 0], vae: ["3", 0] },
    },
    "17": {
      class_type: "CreateVideo",
      inputs: { images: ["16", 0], fps: 24 },
    },
    "18": {
      class_type: "SaveVideo",
      inputs: { video: ["17", 0], filename_prefix: "creatoros-hunyuan", format: "mp4", codec: "h264" },
    },
  };
}

export async function comfyHunyuanI2V(imagePath: string, prompt?: string, length = HY_LEN) {
  if (!fs.existsSync(imagePath)) throw new Error("character still not on disk");
  const picture = stageInput(imagePath, "creatoros-hy-still");
  const seed = Math.floor(Math.random() * 1_000_000_000);
  return queueAndWait(hunyuanI2vGraph(prompt?.trim() || HY_I2V_PROMPT, seed, picture, length), "18", {
    timeoutMs: HY_TIMEOUT,
  });
}

const LTX_CKPT = "ltx-2-19b-distilled-fp8.safetensors";
const LTX_GEMMA = "gemma_3_12B_it_fp4_mixed.safetensors";
/** 64-grid 9:16-ish. Official 720p needs the spatial upscaler stage — skip on 12GB. */
const LTX_W = 448;
const LTX_H = 768;
const LTX_LEN = 49;
const LTX_FPS = 25;
const LTX_STEPS = 8;
const LTX_TIMEOUT = 30 * 60 * 1000;
const LTX_I2V_PROMPT =
  "Cinematic 9:16 live-action. The person in the first frame looks at camera, natural blink and breath, hair moves in light air, product-ad energy. Audio: quiet studio room tone, soft fabric rustle.";

function ltxI2vGraph(prompt: string, seed: number, picture: string, length = LTX_LEN) {
  return {
    "1": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: LTX_CKPT },
    },
    "2": {
      class_type: "LTXAVTextEncoderLoader",
      inputs: { text_encoder: LTX_GEMMA, ckpt_name: LTX_CKPT, device: "cpu" },
    },
    "3": {
      class_type: "LTXVAudioVAELoader",
      inputs: { ckpt_name: LTX_CKPT },
    },
    "4": {
      class_type: "LoadImage",
      inputs: { image: picture },
    },
    "5": {
      class_type: "LTXVPreprocess",
      inputs: { image: ["4", 0], img_compression: 33 },
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: { text: prompt, clip: ["2", 0] },
    },
    "7": {
      class_type: "ConditioningZeroOut",
      inputs: { conditioning: ["6", 0] },
    },
    "8": {
      class_type: "LTXVConditioning",
      inputs: { positive: ["6", 0], negative: ["7", 0], frame_rate: LTX_FPS },
    },
    "9": {
      class_type: "EmptyLTXVLatentVideo",
      inputs: { width: LTX_W, height: LTX_H, length, batch_size: 1 },
    },
    "10": {
      class_type: "LTXVImgToVideoInplace",
      inputs: { vae: ["1", 2], image: ["5", 0], latent: ["9", 0], strength: 1, bypass: false },
    },
    "11": {
      class_type: "LTXVEmptyLatentAudio",
      inputs: { audio_vae: ["3", 0], frames_number: length, frame_rate: LTX_FPS, batch_size: 1 },
    },
    "12": {
      class_type: "LTXVConcatAVLatent",
      inputs: { video_latent: ["10", 0], audio_latent: ["11", 0] },
    },
    "13": {
      class_type: "ModelSamplingLTXV",
      inputs: { model: ["1", 0], max_shift: 2.05, base_shift: 0.95, latent: ["12", 0] },
    },
    "14": {
      class_type: "LTXVScheduler",
      inputs: {
        steps: LTX_STEPS,
        max_shift: 2.05,
        base_shift: 0.95,
        stretch: true,
        terminal: 0.1,
        latent: ["12", 0],
      },
    },
    "15": {
      class_type: "CFGGuider",
      inputs: { model: ["13", 0], positive: ["8", 0], negative: ["8", 1], cfg: 1 },
    },
    "16": {
      class_type: "KSamplerSelect",
      inputs: { sampler_name: "euler" },
    },
    "17": {
      class_type: "RandomNoise",
      inputs: { noise_seed: seed },
    },
    "18": {
      class_type: "SamplerCustomAdvanced",
      inputs: {
        noise: ["17", 0],
        guider: ["15", 0],
        sampler: ["16", 0],
        sigmas: ["14", 0],
        latent_image: ["12", 0],
      },
    },
    "19": {
      class_type: "LTXVSeparateAVLatent",
      inputs: { av_latent: ["18", 0] },
    },
    "20": {
      class_type: "LTXVCropGuides",
      inputs: { positive: ["8", 0], negative: ["8", 1], latent: ["19", 0] },
    },
    "21": {
      class_type: "VAEDecode",
      inputs: { samples: ["20", 2], vae: ["1", 2] },
    },
    "22": {
      class_type: "LTXVAudioVAEDecode",
      inputs: { samples: ["19", 1], audio_vae: ["3", 0] },
    },
    "23": {
      class_type: "CreateVideo",
      inputs: { images: ["21", 0], audio: ["22", 0], fps: LTX_FPS },
    },
    "24": {
      class_type: "SaveVideo",
      inputs: { video: ["23", 0], filename_prefix: "creatoros-ltx2", format: "mp4", codec: "h264" },
    },
  };
}

export async function comfyLtxI2V(imagePath: string, prompt?: string, length = LTX_LEN) {
  if (!fs.existsSync(imagePath)) throw new Error("character still not on disk");
  const picture = stageInput(imagePath, "creatoros-ltx-still");
  const seed = Math.floor(Math.random() * 1_000_000_000);
  return queueAndWait(ltxI2vGraph(prompt?.trim() || LTX_I2V_PROMPT, seed, picture, length), "24", {
    timeoutMs: LTX_TIMEOUT,
  });
}

const WA2_UNET = "wan_animate_2_int8_convrot.safetensors";
const WA2_LORA = "lightx2v_I2V_14B_480p_cfg_step_distill_rank64_bf16.safetensors";
const WA2_CLIP = "umt5_xxl_fp8_e4m3fn_scaled.safetensors";
const WA2_VISION = "clip_vision_h.safetensors";
const WA2_VAE = "Wan2_1_VAE_bf16.safetensors";
const WA2_W = 480;
const WA2_H = 848;
const WA2_LEN = 81;
const WA2_TIMEOUT = 40 * 60 * 1000;
const WA2_NEG =
  "色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走";
const WA2_LOOK =
  "Character appearance description: the person in the reference image, same face, body, and wardrobe. Background description: cinematic 9:16, soft studio light.";
const WA2_POSE = "The person performs the motion from the driving video, natural body and face.";

function wanAnimate2Graph(
  lookPrompt: string,
  posePrompt: string,
  seed: number,
  picture: string,
  motionFile: string,
  length = WA2_LEN,
) {
  return {
    "1": {
      class_type: "UNETLoader",
      inputs: { unet_name: WA2_UNET, weight_dtype: "default" },
    },
    "2": {
      class_type: "LoraLoaderModelOnly",
      inputs: { model: ["1", 0], lora_name: WA2_LORA, strength_model: 1 },
    },
    "3": {
      class_type: "WanAnimate2Cache",
      inputs: { model: ["2", 0], device: "cpu", dtype: "int8" },
    },
    "4": {
      class_type: "CLIPLoader",
      inputs: { clip_name: WA2_CLIP, type: "wan", device: "cpu" },
    },
    "5": {
      class_type: "VAELoader",
      inputs: { vae_name: WA2_VAE },
    },
    "6": {
      class_type: "CLIPVisionLoader",
      inputs: { clip_name: WA2_VISION },
    },
    "7": {
      class_type: "LoadImage",
      inputs: { image: picture },
    },
    "8": {
      class_type: "LoadVideo",
      inputs: { file: motionFile },
    },
    "9": {
      class_type: "GetVideoComponents",
      inputs: { video: ["8", 0] },
    },
    "10": {
      class_type: "ImageScale",
      inputs: {
        image: ["7", 0],
        upscale_method: "area",
        width: WA2_W,
        height: WA2_H,
        crop: "center",
      },
    },
    "11": {
      class_type: "ImageScale",
      inputs: {
        image: ["9", 0],
        upscale_method: "area",
        width: WA2_W,
        height: WA2_H,
        crop: "center",
      },
    },
    "12": {
      class_type: "ImageFromBatch",
      inputs: { image: ["11", 0], batch_index: 0, length: 1 },
    },
    "13": {
      class_type: "CLIPVisionEncode",
      inputs: { clip_vision: ["6", 0], image: ["10", 0], crop: "none" },
    },
    "14": {
      class_type: "CLIPVisionEncode",
      inputs: { clip_vision: ["6", 0], image: ["12", 0], crop: "none" },
    },
    "15": {
      class_type: "CLIPTextEncode",
      inputs: { text: lookPrompt, clip: ["4", 0] },
    },
    "16": {
      class_type: "CLIPTextEncode",
      inputs: { text: WA2_NEG, clip: ["4", 0] },
    },
    "17": {
      class_type: "CLIPTextEncode",
      inputs: { text: posePrompt, clip: ["4", 0] },
    },
    "18": {
      class_type: "ModelSamplingSD3",
      inputs: { model: ["3", 0], shift: 5 },
    },
    "19": {
      class_type: "WanAnimate2ToVideo",
      inputs: {
        positive: ["15", 0],
        negative: ["16", 0],
        vae: ["5", 0],
        reference_image: ["10", 0],
        pose_video: ["11", 0],
        clip_vision_output: ["13", 0],
        positive_pose: ["17", 0],
        clip_vision_output_pose: ["14", 0],
        width: WA2_W,
        height: WA2_H,
        length,
        batch_size: 1,
        video_frame_offset: 0,
        pose_strength: 1,
        pose_start_percent: 0,
        pose_end_percent: 1,
        reference_image_strength: 1,
      },
    },
    "20": {
      class_type: "BasicScheduler",
      inputs: { model: ["18", 0], scheduler: "simple", steps: 6, denoise: 1 },
    },
    "21": {
      class_type: "KSamplerSelect",
      inputs: { sampler_name: "lcm" },
    },
    "22": {
      class_type: "SamplerCustom",
      inputs: {
        model: ["18", 0],
        add_noise: true,
        noise_seed: seed,
        cfg: 1,
        positive: ["19", 0],
        negative: ["19", 1],
        sampler: ["21", 0],
        sigmas: ["20", 0],
        latent_image: ["19", 2],
      },
    },
    "23": {
      class_type: "TrimVideoLatent",
      inputs: { samples: ["22", 0], trim_amount: ["19", 3] },
    },
    "24": {
      class_type: "VAEDecode",
      inputs: { samples: ["23", 0], vae: ["5", 0] },
    },
    "25": {
      class_type: "CreateVideo",
      inputs: { images: ["24", 0], audio: ["9", 1], fps: ["9", 2] },
    },
    "26": {
      class_type: "SaveVideo",
      inputs: { video: ["25", 0], filename_prefix: "creatoros-wan-animate2", format: "mp4", codec: "h264" },
    },
  };
}

export async function comfyWanAnimate2(
  imagePath: string,
  motionPath: string,
  prompt?: string,
  length = WA2_LEN,
) {
  if (!fs.existsSync(imagePath)) throw new Error("character still not on disk");
  if (!motionPath || !fs.existsSync(motionPath)) {
    throw new Error("Wan Animate 2 needs a driving video. Drop a motion clip, or pick H3 I2V / Wan 5B for still-only.");
  }
  const picture = stageInput(imagePath, "creatoros-wa2-still");
  const motion = stageInput(motionPath, "creatoros-wa2-mot");
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const look = prompt?.trim() || WA2_LOOK;
  return queueAndWait(wanAnimate2Graph(look, WA2_POSE, seed, picture, motion, length), "26", {
    timeoutMs: WA2_TIMEOUT,
  });
}
