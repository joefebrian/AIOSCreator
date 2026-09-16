import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";

/** Top-center 3:4 crop so Klein/Qwen do not ingest the kitchen behind a 3/4 identity plate. */
export function cropIdentityFace(src: string, dest: string): Promise<string> {
  if (!fs.existsSync(src)) return Promise.resolve(src);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  return new Promise((resolve) => {
    const vf = "crop=min(iw\\,ih*3/4):ih*0.42:(iw-ow)/2:0";
    const child = spawn(FFMPEG, ["-y", "-i", src, "-vf", vf, dest], { windowsHide: true });
    child.on("error", () => resolve(src));
    child.on("close", (code) => {
      if (code === 0 && fs.existsSync(dest) && fs.statSync(dest).size > 1000) resolve(dest);
      else resolve(src);
    });
  });
}
