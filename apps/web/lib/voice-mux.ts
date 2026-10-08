import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";

function spawnDone(bin: string, args: string[]) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

export async function probeMedia(file: string) {
  const result = await spawnDone(FFPROBE, [
    "-v", "error",
    "-show_entries", "format=duration:stream=codec_type,duration",
    "-of", "json",
    file,
  ]);
  if (result.code !== 0) throw new Error(`ffprobe failed (${result.code}). ${result.stderr.slice(-200)}`);
  const parsed = JSON.parse(result.stdout) as {
    format?: { duration?: string };
    streams?: { codec_type?: string; duration?: string }[];
  };
  const streams = parsed.streams || [];
  const video = streams.find((row) => row.codec_type === "video");
  const audio = streams.find((row) => row.codec_type === "audio");
  const duration = Number(video?.duration || parsed.format?.duration || 0);
  const audioDuration = Number(audio?.duration || (audio ? parsed.format?.duration : 0) || 0);
  return { duration, hasAudio: Boolean(audio), audioDuration };
}

export async function mediaHasAudio(file: string) {
  if (!fs.existsSync(file)) return false;
  return (await probeMedia(file)).hasAudio;
}

export function silenceOntoClip(clipPath: string, dest: string) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      FFMPEG,
      [
        "-y",
        "-i", clipPath,
        "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-c:v", "copy",
        "-c:a", "aac",
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
      else reject(new Error(`silent mux failed (${code}). ${err.slice(-300)}`));
    });
  });
}

/** Fit narration into the picture length. Allows a small pace change, then pads. Does not stretch the picture or rush the line. */
export async function fitVoiceOntoClip(clipPath: string, voicePath: string, dest: string) {
  if (!fs.existsSync(clipPath)) throw new Error("clip not on disk");
  if (!fs.existsSync(voicePath)) throw new Error("voiceover not on disk");
  const video = await probeMedia(clipPath);
  const voice = await probeMedia(voicePath);
  const seconds = video.duration > 0.2 ? video.duration : 6;
  const ratio = voice.audioDuration > 0.2 ? voice.audioDuration / seconds : 1;
  if (ratio > 1.12) {
    throw new Error(
      `Spoken line is ${voice.audioDuration.toFixed(1)}s and this scene is ${seconds.toFixed(1)}s. Shorten the line or give the scene more time. Approved wording is not sped up.`,
    );
  }
  const tempo = Math.min(1.12, Math.max(1, ratio));
  const chain = tempo > 1.02
    ? `[1:a]atempo=${tempo.toFixed(3)},apad,asetpts=PTS-STARTPTS[a]`
    : `[1:a]apad,asetpts=PTS-STARTPTS[a]`;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const result = await spawnDone(FFMPEG, [
    "-y",
    "-i", clipPath,
    "-i", voicePath,
    "-filter_complex", chain,
    "-map", "0:v:0",
    "-map", "[a]",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "160k",
    "-ar", "44100",
    "-ac", "2",
    "-t", seconds.toFixed(3),
    dest,
  ]);
  if (result.code !== 0 || !fs.existsSync(dest) || fs.statSync(dest).size < 1000) {
    throw new Error(`voice fit failed (${result.code}). ${result.stderr.slice(-300)}`);
  }
  return { tempo, videoSec: seconds, voiceSec: voice.audioDuration };
}

export function muxVoiceOntoClip(clipPath: string, wavPath: string, dest: string, shortest = true) {
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
        ...(shortest ? ["-shortest"] : []),
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
