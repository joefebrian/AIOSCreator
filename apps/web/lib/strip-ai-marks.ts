import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataRoot, ensureDataDirs } from "./paths";

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const VIDEO_EXT = new Set([".mp4", ".webm", ".mov", ".m4v"]);

function run(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(FFMPEG, args, { windowsHide: true });
    let err = "";
    child.stderr.on("data", (d) => {
      err += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg strip failed (${code}). ${err.slice(-500)}`));
    });
  });
}

function cachePath(src: string, ext: string) {
  const st = fs.statSync(src);
  const key = crypto.createHash("sha1").update(`${src}|${st.size}|${st.mtimeMs}|v2`).digest("hex").slice(0, 20);
  return path.join(ensureDataDirs(), "media", "clean-dl", `${key}${ext}`);
}

/** Visible Seedance/Kling/Wan "AI" pill is almost always bottom-right. */
function videoVf() {
  return "delogo=x=iw-iw*0.20:y=ih-ih*0.12:w=iw*0.18:h=ih*0.10:show=0";
}

async function stripImage(src: string, dest: string) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const ext = path.extname(dest).toLowerCase();
  const vf = "noise=alls=1.1:allf=t,format=yuv420p";
  if (ext === ".png") {
    await run(["-y", "-i", src, "-map_metadata", "-1", "-vf", "noise=alls=1.1:allf=t,format=rgb24", "-frames:v", "1", dest]);
    return;
  }
  await run(["-y", "-i", src, "-map_metadata", "-1", "-vf", vf, "-q:v", "2", "-frames:v", "1", dest]);
}

async function stripVideo(src: string, dest: string) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const common = ["-y", "-i", src, "-map_metadata", "-1", "-fflags", "+bitexact", "-movflags", "+faststart"];
  try {
    await run([
      ...common,
      "-vf",
      videoVf(),
      "-c:v",
      "libx264",
      "-crf",
      "17",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      dest,
    ]);
  } catch {
    await run([...common, "-c:v", "libx264", "-crf", "17", "-preset", "veryfast", "-pix_fmt", "yuv420p", "-c:a", "copy", dest]);
  }
}

export function canStripAiMarks(ext: string) {
  const e = ext.toLowerCase();
  return IMAGE_EXT.has(e) || VIDEO_EXT.has(e);
}

/** Download-only: strip C2PA/EXIF/XMP + visible Seedance/Kling AI corner. Does not rewrite library masters. */
export async function stripAiMarksForDownload(src: string): Promise<string> {
  const ext = path.extname(src).toLowerCase();
  if (!canStripAiMarks(ext)) return src;
  const outExt = VIDEO_EXT.has(ext) ? ".mp4" : ext === ".png" ? ".png" : ".jpg";
  const dest = cachePath(src, outExt);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 64) return dest;
  const tmp = `${dest}.tmp${outExt}`;
  try {
    if (VIDEO_EXT.has(ext)) await stripVideo(src, tmp);
    else await stripImage(src, tmp);
    fs.renameSync(tmp, dest);
    return dest;
  } catch (err) {
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    throw err;
  }
}

export function stripCacheDir() {
  return path.join(dataRoot(), "media", "clean-dl");
}
