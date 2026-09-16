import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";

export function muxVoiceOntoClip(clipPath: string, wavPath: string, dest: string) {
  if (!fs.existsSync(clipPath)) throw new Error("clip not on disk");
  if (!fs.existsSync(wavPath)) throw new Error("voiceover not on disk");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      FFMPEG,
      [
        "-y",
        "-i",
        clipPath,
        "-i",
        wavPath,
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-shortest",
        dest,
      ],
      { windowsHide: true },
    );
    let err = "";
    child.stderr.on("data", (d) => {
      err += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 && fs.existsSync(dest) && fs.statSync(dest).size > 1000) resolve();
      else reject(new Error(`ffmpeg mux failed (${code}). ${err.slice(-300)}`));
    });
  });
}
