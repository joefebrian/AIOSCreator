import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { extractFrameCount, videoWindow } from "./research-flow";

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";

function run(cmd: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let err = "";
    child.stderr.on("data", (d: Buffer) => {
      err += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${path.basename(cmd)} failed (${code}). ${err.slice(-400)}`));
    });
  });
}

function runOut(cmd: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let out = "";
    let err = "";
    child.stdout.on("data", (d: Buffer) => {
      out += d.toString();
    });
    child.stderr.on("data", (d: Buffer) => {
      err += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(out.trim());
      else reject(new Error(`${path.basename(cmd)} failed (${code}). ${err.slice(-400)}`));
    });
  });
}

export async function probeDurationSec(videoPath: string) {
  const raw = await runOut(FFPROBE, [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=nw=1:nk=1",
    videoPath,
  ]);
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n;
}

export async function extractFrameAt(videoPath: string, destJpeg: string, timeSec: number) {
  fs.mkdirSync(path.dirname(destJpeg), { recursive: true });
  await run(FFMPEG, [
    "-y",
    "-ss",
    String(Math.max(0, timeSec)),
    "-i",
    videoPath,
    "-update",
    "1",
    "-frames:v",
    "1",
    "-q:v",
    "3",
    destJpeg,
  ]);
  if (!fs.existsSync(destJpeg) || fs.statSync(destJpeg).size < 800) {
    throw new Error("frame extract empty");
  }
  return destJpeg;
}

/** Even stills across the clip. Follows full duration up to maxExtractSec. */
export async function extractPromptStills(videoPath: string, destDir: string) {
  if (!fs.existsSync(videoPath)) throw new Error("video not on disk");
  fs.mkdirSync(destDir, { recursive: true });
  const durationSec = await probeDurationSec(videoPath);
  const win = videoWindow(durationSec);
  const n = extractFrameCount(win.length);
  const times: number[] = [];
  const paths: string[] = [];
  for (let i = 0; i < n; i++) {
    const t =
      n === 1
        ? win.start + 0.05
        : win.start + (win.length * i) / (n - 1);
    const clamped = Math.min(Math.max(t, win.start + 0.04), win.start + win.length - 0.08);
    const dest = path.join(destDir, `f${i}.jpg`);
    if (i === n - 1 && !win.trimmed && durationSec > 1.2) {
      await extractLastFrame(videoPath, dest);
    } else {
      await extractFrameAt(videoPath, dest, clamped);
    }
    if (fs.existsSync(dest) && fs.statSync(dest).size > 800) {
      times.push(clamped);
      paths.push(dest);
    }
  }
  if (!paths.length) throw new Error("video frame extract empty");
  return {
    paths,
    times,
    durationSec,
    windowStartSec: win.start,
    windowSec: win.length,
    trimmed: win.trimmed,
    tooShort: win.tooShort,
  };
}

/** Downscale still for vision tokens. Falls back to the source file. */
export async function stillForVision(srcPath: string, destJpeg: string) {
  try {
    fs.mkdirSync(path.dirname(destJpeg), { recursive: true });
    await run(FFMPEG, ["-y", "-i", srcPath, "-vf", "scale='min(1024,iw)':-2", "-q:v", "5", destJpeg]);
    if (!fs.existsSync(destJpeg) || fs.statSync(destJpeg).size < 400) return srcPath;
    return destJpeg;
  } catch {
    return srcPath;
  }
}

/** Last video frame as jpeg. Same ffmpeg as H3-long continue stills. */
export async function extractLastFrame(videoPath: string, destJpeg: string) {
  if (!fs.existsSync(videoPath)) throw new Error("video not on disk");
  fs.mkdirSync(path.dirname(destJpeg), { recursive: true });
  await run(FFMPEG, ["-y", "-sseof", "-0.15", "-i", videoPath, "-update", "1", "-frames:v", "1", "-q:v", "2", destJpeg]);
  if (!fs.existsSync(destJpeg) || fs.statSync(destJpeg).size < 1000) {
    await run(FFMPEG, ["-y", "-i", videoPath, "-vf", "reverse", "-update", "1", "-frames:v", "1", "-q:v", "2", destJpeg]);
  }
  if (!fs.existsSync(destJpeg) || fs.statSync(destJpeg).size < 1000) {
    throw new Error("last-frame extract empty");
  }
  return destJpeg;
}
