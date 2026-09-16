import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { dataRoot, ensureDataDirs } from "./paths";

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export function isThumbable(ext: string) {
  return IMAGE_EXT.has(ext.toLowerCase());
}

/** Cached JPEG thumb. Rebuilds when the source is newer. */
export function ensureImageThumb(abs: string, width: number) {
  const w = Math.min(1280, Math.max(64, Math.round(width)));
  const root = path.join(ensureDataDirs(), "media", "thumbs");
  fs.mkdirSync(root, { recursive: true });
  const rel = path.relative(path.join(dataRoot(), "media"), abs).replace(/[\\/]/g, "__");
  const dest = path.join(root, `${rel}.w${w}.jpg`);
  const srcM = fs.statSync(abs).mtimeMs;
  if (fs.existsSync(dest) && fs.statSync(dest).mtimeMs >= srcM && fs.statSync(dest).size > 200) {
    return dest;
  }
  const run = spawnSync(
    FFMPEG,
    ["-y", "-i", abs, "-vf", `scale=${w}:-2`, "-q:v", "5", dest],
    { windowsHide: true, encoding: "utf8" },
  );
  if (run.status === 0 && fs.existsSync(dest) && fs.statSync(dest).size > 200) return dest;
  return abs;
}
