import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { dramaMediaDir } from "./paths";
import { mediaUrlToPath } from "./paths";

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";

function run(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(FFMPEG, args, { windowsHide: true });
    let err = "";
    child.stderr.on("data", (d: Buffer) => {
      err += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed (${code}). ${err.slice(-400)}`));
    });
  });
}

export async function stitchDrama(dramaId: string, videoUrls: string[]) {
  const paths = videoUrls.map(mediaUrlToPath);
  if (paths.some((p) => !fs.existsSync(p))) throw new Error("a shot video is missing on disk");
  const dir = dramaMediaDir(dramaId);
  fs.mkdirSync(dir, { recursive: true });
  const list = path.join(dir, "concat.txt");
  fs.writeFileSync(list, paths.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n"));
  const out = path.join(dir, "episode.mp4");
  try {
    await run(["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", out]);
  } catch {
    await run(["-y", "-f", "concat", "-safe", "0", "-i", list, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", out]);
  }
  if (!fs.existsSync(out) || fs.statSync(out).size < 8_000) throw new Error("stitch produced an empty file");
  return `/api/media/drama/${dramaId}/episode.mp4`;
}
