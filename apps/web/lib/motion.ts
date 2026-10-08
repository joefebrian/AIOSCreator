import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const LOCAL = process.env.LOCALAPPDATA || "";
const REALESRGAN_PY =
  process.env.REALESRGAN_PYTHON ||
  path.join(LOCAL, "Programs", "ComfyUI", ".venv", "Scripts", "python.exe");
const REALESRGAN_MODEL =
  process.env.REALESRGAN_MODEL ||
  path.join(LOCAL, "Programs", "ComfyUI", "models", "upscale_models", "RealESRGAN_x4plus.pth");
const REALESRGAN_SCRIPT = path.resolve(process.cwd(), "../../scripts/realesrgan-4k.py");

function run(cmd: string, args: string[], onOut?: (line: string) => void) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let err = "";
    const pump = (d: Buffer) => {
      const s = d.toString();
      err += s;
      if (onOut) for (const line of s.split(/\r?\n/)) if (line.trim()) onOut(line.trim());
    };
    child.stdout.on("data", pump);
    child.stderr.on("data", pump);
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(cmd)} failed (${code}). ${err.slice(-400)}`));
    });
  });
}

/** RealESRGAN x4 then cover-crop 2160×3840. Lanczos only if weights are missing. */
export async function ffmpegStill4k(srcImage: string, destPng: string) {
  fs.mkdirSync(path.dirname(destPng), { recursive: true });
  if (canRealEsrgan()) {
    let last: Error | undefined;
    for (let i = 0; i < 2; i++) {
      try {
        await run(REALESRGAN_PY, [
          REALESRGAN_SCRIPT,
          "--src",
          srcImage,
          "--dest",
          destPng,
          "--model",
          REALESRGAN_MODEL,
        ]);
        if (fs.existsSync(destPng)) return;
      } catch (err) {
        last = err instanceof Error ? err : new Error(String(err));
      }
    }
    throw last || new Error("RealESRGAN 4K produced no file");
  }
  return new Promise<void>((resolve, reject) => {
    const args = [
      "-y",
      "-i",
      srcImage,
      "-vf",
      "scale=2160:3840:force_original_aspect_ratio=increase:flags=lanczos,crop=2160:3840",
      destPng,
    ];
    const child = spawn(FFMPEG, args, { windowsHide: true });
    let err = "";
    child.stderr.on("data", (d) => {
      err += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 && fs.existsSync(destPng)) resolve();
      else reject(new Error(`ffmpeg 4K export failed (${code}). ${err.slice(-400)}`));
    });
  });
}

/** Product-only stills. Never stack the person next to the SKU (that made diptych outputs). */
export async function composeProductRefs(paths: string[], dest: string) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const inputs = paths.filter((p) => fs.existsSync(p)).slice(0, 6);
  if (!inputs.length) throw new Error("product image not on disk");
  const n = inputs.length;
  if (n === 1) {
    await run(FFMPEG, [
      "-y",
      "-i",
      inputs[0],
      "-vf",
      "scale=768:1280:force_original_aspect_ratio=decrease:flags=lanczos,pad=768:1280:(ow-iw)/2:(oh-ih)/2:white",
      dest,
    ]);
    return;
  }
  const cols = n <= 3 ? 1 : n <= 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const cellW = cols === 1 ? 768 : 480;
  const cellH = cols === 1 ? Math.max(280, Math.floor(1280 / n)) : 480;
  const args = ["-y"];
  for (const p of inputs) args.push("-i", p);
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    parts.push(
      `[${i}:v]scale=${cellW}:${cellH}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${cellW}:${cellH}:(ow-iw)/2:(oh-ih)/2:white[p${i}]`,
    );
  }
  const grid = cols * rows;
  for (let i = n; i < grid; i++) {
    parts.push(`color=c=white:s=${cellW}x${cellH}:d=1[p${i}]`);
  }
  if (cols === 1) {
    parts.push(`${inputs.map((_, i) => `[p${i}]`).join("")}vstack=inputs=${n}`);
  } else {
    for (let r = 0; r < rows; r++) {
      const tags = Array.from({ length: cols }, (_, c) => `[p${r * cols + c}]`).join("");
      parts.push(`${tags}hstack=inputs=${cols}[r${r}]`);
    }
    parts.push(`${Array.from({ length: rows }, (_, r) => `[r${r}]`).join("")}vstack=inputs=${rows}`);
  }
  args.push("-filter_complex", parts.join(";"), dest);
  await run(FFMPEG, args);
}

function canRealEsrgan() {
  return fs.existsSync(REALESRGAN_PY) && fs.existsSync(REALESRGAN_MODEL) && fs.existsSync(REALESRGAN_SCRIPT);
}

/** Recover 4K: RealESRGAN each frame → 2160×3840. Cap ~8s. Lanczos only if weights missing. */
export async function ffmpegVideo4k(
  srcVideo: string,
  destMp4: string,
  onProgress?: (msg: string) => void,
) {
  fs.mkdirSync(path.dirname(destMp4), { recursive: true });
  const tmpOut = `${destMp4}.4k-tmp.mp4`;
  if (!canRealEsrgan()) {
    onProgress?.("RealESRGAN missing — lanczos fallback");
    await lanczosVideo(srcVideo, tmpOut);
    fs.copyFileSync(tmpOut, destMp4);
    fs.unlinkSync(tmpOut);
    return;
  }

  const work = fs.mkdtempSync(path.join(os.tmpdir(), "creatoros-v4k-"));
  const inn = path.join(work, "in");
  const out = path.join(work, "out");
  fs.mkdirSync(inn);
  fs.mkdirSync(out);
  try {
    onProgress?.("Extract frames");
    await run(FFMPEG, ["-y", "-i", srcVideo, "-vsync", "0", path.join(inn, "frame_%06d.png")]);
    const n = fs.readdirSync(inn).filter((f) => f.endsWith(".png")).length;
    if (!n) throw new Error("no frames extracted");
    if (n > 192) {
      throw new Error(`Recover 4K max ~8s on 3060 (${n} frames). Cut the clip first.`);
    }
    onProgress?.(`RealESRGAN 0/${n}`);
    await run(
      REALESRGAN_PY,
      [
        REALESRGAN_SCRIPT,
        "--frames-in",
        inn,
        "--frames-out",
        out,
        "--model",
        REALESRGAN_MODEL,
        "--width",
        "2160",
        "--height",
        "3840",
      ],
      (line) => {
        if (line.startsWith("frame ")) onProgress?.(line);
      },
    );
    onProgress?.("Encode 2160×3840");
    await run(FFMPEG, [
      "-y",
      "-framerate",
      "24",
      "-i",
      path.join(out, "frame_%06d.png"),
      "-i",
      srcVideo,
      "-map",
      "0:v:0",
      "-map",
      "1:a?",
      "-c:v",
      "libx264",
      "-crf",
      "17",
      "-preset",
      "slow",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-shortest",
      tmpOut,
    ]);
    fs.copyFileSync(tmpOut, destMp4);
    fs.unlinkSync(tmpOut);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
    if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
  }
}

function lanczosVideo(src: string, dest: string) {
  return run(FFMPEG, [
    "-y",
    "-i",
    src,
    "-vf",
    "scale=2160:3840:force_original_aspect_ratio=increase:flags=lanczos,crop=2160:3840",
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
    "128k",
    dest,
  ]);
}

export function h3FrameCount(seconds: number) {
  const sec = Math.min(15, Math.max(2, seconds || 5));
  const raw = Math.max(5, Math.round(sec * 24));
  const snap = ((5 - (raw % 17)) % 17 + 17) % 17;
  return Math.min(362, raw + snap);
}

/** Wan / Hunyuan length is 4n+1. T0 cap ~3.4s (81 frames @24fps). */
function snap4n1(seconds: number, minSec: number, maxSec: number, maxFrames: number) {
  const sec = Math.min(maxSec, Math.max(minSec, seconds || minSec));
  const raw = Math.round(sec * 24);
  const n = Math.max(8, Math.round((raw - 1) / 4));
  return Math.min(maxFrames, n * 4 + 1);
}

export function wanFrameCount(seconds: number) {
  return snap4n1(seconds, 2, 4, 81);
}

export function hyFrameCount(seconds: number) {
  return snap4n1(seconds, 2, 4, 81);
}

/** LTX-2 length is 8n+1, 25fps. T0 cap ~2.6s (65 frames). */
export function ltxFrameCount(seconds: number) {
  const sec = Math.min(3, Math.max(2, seconds || 2));
  const raw = Math.round(sec * 25);
  const n = Math.max(1, Math.round((raw - 1) / 8));
  return Math.min(65, n * 8 + 1);
}

export function wanAnimateFrameCount(seconds: number) {
  return snap4n1(seconds, 2, 4, 81);
}

export function motionFrameCount(engineId: string, seconds: number) {
  if (engineId === "minimax-h3-long") return Math.round(Math.min(60, Math.max(5, seconds || 5)) * 24);
  if (engineId === "wan-5b") return wanFrameCount(seconds);
  if (engineId === "hunyuan-1.5") return hyFrameCount(seconds);
  if (engineId === "ltx-2") return ltxFrameCount(seconds);
  if (engineId === "wan-animate-2") return wanAnimateFrameCount(seconds);
  return h3FrameCount(seconds);
}

