import { spawn } from "node:child_process";
import fs from "node:fs";

function ffmpeg() {
  return process.platform === "win32" && fs.existsSync("C:/ffmpeg/bin/ffmpeg.exe") ? "C:/ffmpeg/bin/ffmpeg.exe" : "ffmpeg";
}

function ffprobe() {
  return ffmpeg().replace(/ffmpeg(\.exe)?$/i, "ffprobe$1");
}

function run(bin: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let out = "";
    let err = "";
    child.stdout.on("data", (chunk) => { out += chunk.toString(); });
    child.stderr.on("data", (chunk) => { err += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(out.trim());
      else reject(new Error(err.slice(-300) || `${bin} failed`));
    });
  });
}

export async function clipHasAudio(file: string) {
  const out = await run(ffprobe(), ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0", file]);
  return out.includes("audio");
}

/** Copies a provider clip without dropping its audio. This is not a TTS replacement. */
export async function retainClipAudio(src: string, dest: string) {
  await run(ffmpeg(), ["-y", "-i", src, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", dest]);
  if (!(await clipHasAudio(dest))) throw new Error("The exported clip has no audio stream.");
}
