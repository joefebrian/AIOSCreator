import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { RESEARCH_VIDEO } from "./research-flow";
import { writeNetscapeTemp } from "./research-cookies";

const MAX_BYTES = RESEARCH_VIDEO.uploadMb * 1024 * 1024;

function run(cmd: string, args: string[], timeoutMs: number, onText?: (chunk: string) => void) {
  return new Promise<{ code: number; out: string; err: string }>((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let out = "";
    let err = "";
    const t = setTimeout(() => {
      child.kill();
      reject(new Error("yt-dlp timed out"));
    }, timeoutMs);
    child.stdout.on("data", (d: Buffer) => {
      const text = d.toString();
      out += text;
      onText?.(text);
    });
    child.stderr.on("data", (d: Buffer) => {
      const text = d.toString();
      err += text;
      onText?.(text);
    });
    child.on("error", (e) => {
      clearTimeout(t);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(t);
      resolve({ code: code ?? 1, out, err });
    });
  });
}

export async function ytdlpAvailable() {
  try {
    const r = await run("python", ["-m", "yt_dlp", "--version"], 15_000);
    return r.code === 0 && Boolean(r.out.trim() || r.err.trim());
  } catch {
    return false;
  }
}

function scrub(s: string) {
  return s
    .replace(/cookie[^\n]{0,80}/gi, "cookie")
    .replace(/sessionid[^\n]{0,40}/gi, "session")
    .replace(/https?:\/\/[^\s]+(googlevideo|tiktokcdn|cdninstagram|twimg)[^\s]*/gi, "[cdn]")
    .slice(-800);
}

function clipMeta(dir: string) {
  const name = fs.readdirSync(dir).find((entry) => entry.endsWith(".info.json"));
  if (!name) return { creator: null as string | null, publishedAt: null as string | null };
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")) as { uploader?: string; creator?: string; channel?: string; upload_date?: string };
    const creator = String(parsed.uploader || parsed.creator || parsed.channel || "").replace(/^@/, "").replace(/\s+/g, " ").trim().slice(0, 80) || null;
    const raw = String(parsed.upload_date || "");
    const publishedAt = /^\d{8}$/.test(raw) ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : null;
    return { creator, publishedAt };
  } catch {
    return { creator: null as string | null, publishedAt: null as string | null };
  }
}

function noteProgress(onProgress: ((percent: number) => void) | undefined, chunk: string) {
  if (!onProgress) return;
  const match = chunk.match(/(\d{1,3}(?:\.\d+)?)%/);
  if (!match) return;
  const percent = Number(match[1]);
  if (percent >= 0 && percent <= 100) onProgress(percent);
}

/** Download a platform watch URL to a local mp4 using operator cookies. */
export async function ytdlpDownload(url: string, onProgress?: (percent: number) => void) {
  const tmp = path.join(os.tmpdir(), `creatoros-ytdlp-${randomUUID()}`);
  fs.mkdirSync(tmp, { recursive: true });
  const cookies = path.join(tmp, "cookies.txt");
  writeNetscapeTemp(cookies);
  const outTpl = path.join(tmp, "clip.%(ext)s");
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    host = "";
  }
  const youtube = /youtube\.com$|youtu\.be$/.test(host);
  const auth = youtube
    ? ["--extractor-args", "youtube:player_client=android"]
    : ["--impersonate", "chrome", "--cookies", cookies];
  const base = [
    "-m",
    "yt_dlp",
    "--no-playlist",
    "--no-warnings",
    "--no-mtime",
    "--restrict-filenames",
    "-f",
    "bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/b[height<=720]/b",
    "--merge-output-format",
    "mp4",
    "--max-filesize",
    `${RESEARCH_VIDEO.uploadMb}M`,
    "--write-info-json",
    ...auth,
    "-o",
    outTpl,
    url,
  ];
  const clipped = [
    ...base.slice(0, -3),
    "--download-sections",
    `*0-${RESEARCH_VIDEO.maxExtractSec}`,
    "--force-keyframes-at-cuts",
    ...base.slice(-3),
  ];
  try {
    let r = await run("python", clipped, 180_000, (chunk) => noteProgress(onProgress, chunk));
    let files = fs.existsSync(tmp)
      ? fs.readdirSync(tmp).filter((n) => /\.(mp4|webm|mkv|mov|m4a)$/i.test(n))
      : [];
    if (!files.length) {
      r = await run("python", base, 180_000, (chunk) => noteProgress(onProgress, chunk));
      files = fs.existsSync(tmp)
        ? fs.readdirSync(tmp).filter((n) => /\.(mp4|webm|mkv|mov|m4a)$/i.test(n))
        : [];
    }
    const dest = files.map((n) => path.join(tmp, n)).sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)[0];
    if (!dest || !fs.existsSync(dest) || fs.statSync(dest).size < 8000) {
      throw new Error(scrub(r.err || r.out) || `yt-dlp failed (${r.code})`);
    }
    if (fs.statSync(dest).size > MAX_BYTES) throw new Error(`yt-dlp file over ${RESEARCH_VIDEO.uploadMb}MB`);
    const buf = fs.readFileSync(dest);
    const ext = path.extname(dest).toLowerCase() || ".mp4";
    return { buf, ext, bytes: buf.length, ...clipMeta(tmp) };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
