import { createHash, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { once } from "node:events";
import fs from "node:fs";
import { isIP } from "node:net";
import os from "node:os";
import path from "node:path";
import { finished } from "node:stream/promises";
import { spawn } from "node:child_process";
import { dataRoot, ensureDataDirs, mediaUrlToPath } from "./paths";
import { getProduct } from "./products";
import { canAcquirePost, referenceIdentity } from "./ugc-reference-preview";
import { readSharedCatalog } from "./shared-catalog";
import { ytdlpAvailable, ytdlpDownload } from "./ytdlp";

export type ImportStatus = "queued" | "resolving" | "downloading" | "processing" | "ready" | "failed";

export type ImportJob = {
  id: string;
  productId: string;
  skuId: string;
  sourceUrl: string;
  dedupeKey: string;
  platform: string;
  postId: string | null;
  creator: string | null;
  publishedAt: string | null;
  status: ImportStatus;
  progress: number | null;
  attempt: number;
  error: string | null;
  assetId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ImportAsset = {
  id: string;
  dedupeKey: string;
  sourceUrl: string;
  platform: string;
  postId: string | null;
  creator: string | null;
  publishedAt: string | null;
  mediaUrl: string;
  posterUrl: string | null;
  fileHash: string;
  bytes: number;
  durationSec: number;
  width: number;
  height: number;
  hasAudio: boolean;
  provider: "direct" | "yt-dlp";
  createdAt: string;
};

type Db = { jobs: ImportJob[]; assets: ImportAsset[] };
type WatchClip = { buf: Buffer; ext: string; creator?: string | null; publishedAt?: string | null };

export type MeasuredVideo = {
  width: number;
  height: number;
  durationSec: number;
  hasAudio: boolean;
  videoCodec: string;
  audioCodec: string | null;
  meanVolumeDb: number | null;
  maxVolumeDb: number | null;
  cuts: number[] | null;
  sceneError: string | null;
};

const MAX_BYTES = 120 * 1024 * 1024;
const MAX_ATTEMPTS = 3;
const PLAYABLE = new Set(["h264", "avc1", "vp8", "vp9", "av1"]);

let rootOverride: string | null = null;
let fetchImpl: typeof fetch | null = null;
let resolveHost: ((host: string) => Promise<{ address: string }[]>) | null = null;
let watchDownloader: ((url: string, onProgress?: (percent: number) => void) => Promise<WatchClip>) | null = null;
const active = new Map<string, Promise<void>>();
let chain: Promise<unknown> = Promise.resolve();

export function setUgcReferenceImportRootForTests(dir: string | null) {
  rootOverride = dir;
  active.clear();
  fetchImpl = null;
  resolveHost = null;
  watchDownloader = null;
}

export function setReferenceResolverForTests(fn: ((host: string) => Promise<{ address: string }[]>) | null) {
  resolveHost = fn;
}

export function setReferenceFetchForTests(fn: typeof fetch | null) {
  fetchImpl = fn;
}

export function setReferenceWatchDownloaderForTests(fn: ((url: string, onProgress?: (percent: number) => void) => Promise<WatchClip>) | null) {
  watchDownloader = fn;
}

export function ugcImportTask(id: string) {
  return active.get(id) || Promise.resolve();
}

function now() {
  return new Date().toISOString();
}

function rootDir() {
  const dir = rootOverride || dataRoot();
  if (rootOverride) fs.mkdirSync(path.join(dir, "db"), { recursive: true });
  else ensureDataDirs();
  return dir;
}

function filePath() {
  return path.join(rootDir(), "db", "ugc-reference-imports.json");
}

function mediaDir() {
  const dir = path.join(rootDir(), "media", "ugc-references");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function readDb(): Db {
  const file = filePath();
  if (!fs.existsSync(file)) return { jobs: [], assets: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Db;
    return {
      jobs: Array.isArray(raw.jobs) ? raw.jobs : [],
      assets: Array.isArray(raw.assets) ? raw.assets : [],
    };
  } catch {
    return { jobs: [], assets: [] };
  }
}

function writeDb(db: Db) {
  fs.writeFileSync(filePath(), JSON.stringify(db, null, 2), "utf8");
}

function locked<T>(fn: () => T): Promise<T> {
  const run = chain.then(() => fn()) as Promise<T>;
  chain = run.then(() => undefined, () => undefined);
  return run;
}

function scrub(err: unknown) {
  const text = err instanceof Error ? err.message : String(err);
  return text
    .replace(/cookie[^\n]{0,80}/gi, "cookie")
    .replace(/sessionid[^\s]{0,40}/gi, "session")
    .replace(/https?:\/\/\S+/g, "[url]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 400);
}

function isPrivateIp(ip: string) {
  const value = ip.toLowerCase().replace(/^\[|\]$/g, "");
  const mapped = value.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  const v4 = mapped ? mapped[1] : value;
  if (v4.includes(":")) {
    return v4 === "::" || v4 === "::1" || v4.startsWith("fc") || v4.startsWith("fd") || v4.startsWith("fe80");
  }
  const parts = v4.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127 || a === 255) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

export function assertUrlShape(raw: string) {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error("Enter an http or https URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("Enter an http or https URL.");
  if (parsed.username || parsed.password) throw new Error("URLs with credentials are blocked.");
  if (/[\r\n]/.test(raw)) throw new Error("Enter an http or https URL.");
  const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".localhost")) {
    throw new Error("Private URLs are blocked.");
  }
  if (isIP(host) && isPrivateIp(host)) throw new Error("Private URLs are blocked.");
  return parsed;
}

export async function assertPublicPostUrl(raw: string) {
  const parsed = assertUrlShape(raw);
  const host = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!isIP(host)) {
    const records = resolveHost ? await resolveHost(host) : await lookup(host, { all: true, verbatim: true });
    if (!records.length || records.some((row) => isPrivateIp(row.address))) throw new Error("Private URLs are blocked.");
  }
  return parsed;
}

function isWatchHost(host: string) {
  const name = host.replace(/^www\./, "").toLowerCase();
  return (
    name === "tiktok.com" || name.endsWith(".tiktok.com") ||
    name === "youtube.com" || name.endsWith(".youtube.com") ||
    name === "youtu.be" ||
    name === "instagram.com" ||
    name === "facebook.com" || name.endsWith(".facebook.com") ||
    name === "fb.watch" ||
    name === "x.com" || name === "twitter.com"
  );
}

function transient(message: string) {
  return /timed out|ECONNRESET|ENOTFOUND|EAI_AGAIN|HTTP 429|HTTP 5\d\d|network/i.test(message);
}

function tool(name: "ffmpeg" | "ffprobe") {
  const fromEnv = name === "ffmpeg" ? process.env.FFMPEG_PATH : process.env.FFPROBE_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const known = name === "ffmpeg" ? "C:\\ffmpeg\\bin\\ffmpeg.exe" : "C:\\ffmpeg\\bin\\ffprobe.exe";
  if (fs.existsSync(known)) return known;
  return name;
}

function runTool(bin: string, args: string[], timeoutMs = 30_000) {
  return new Promise<{ code: number; out: string; err: string }>((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Media validation timed out"));
    }, timeoutMs);
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      err += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, out, err });
    });
  });
}

function videoMagic(file: string) {
  const head = Buffer.alloc(12);
  const fd = fs.openSync(file, "r");
  try {
    fs.readSync(fd, head, 0, 12, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) return ".webm";
  if (head.subarray(4, 8).toString() === "ftyp") return ".mp4";
  return "";
}

export function storedPlayerReady(mediaUrl: string) {
  if (!mediaUrl.startsWith("/api/media/ugc-references/")) return false;
  const abs = path.resolve(mediaUrlToPath(mediaUrl));
  const root = path.resolve(rootOverride || dataRoot(), "media");
  const rel = path.relative(root, abs);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) return false;
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile() || fs.statSync(abs).size < 1000) return false;
  return Boolean(videoMagic(abs));
}

async function probeVideo(file: string) {
  const result = await runTool(tool("ffprobe"), [
    "-v", "error",
    "-show_entries", "stream=codec_type,codec_name,width,height,duration",
    "-show_entries", "format=duration",
    "-of", "json",
    file,
  ]);
  if (result.code !== 0) throw new Error("Media validation did not find a playable video.");
  const parsed = JSON.parse(result.out || "{}") as {
    streams?: { codec_type?: string; codec_name?: string; width?: number; height?: number; duration?: string }[];
    format?: { duration?: string };
  };
  const streams = parsed.streams || [];
  const video = streams.find((row) => row.codec_type === "video");
  const audio = streams.find((row) => row.codec_type === "audio");
  const width = Number(video?.width || 0);
  const height = Number(video?.height || 0);
  const durationSec = Number(video?.duration || parsed.format?.duration || 0);
  const codec = (video?.codec_name || "").toLowerCase();
  if (!video || width < 2 || height < 2 || !(durationSec > 0)) throw new Error("Media validation did not find a playable video.");
  if (!PLAYABLE.has(codec)) throw new Error("This video codec cannot play in the browser.");
  return { width, height, durationSec, hasAudio: Boolean(audio), videoCodec: codec, audioCodec: (audio?.codec_name || "").toLowerCase() || null };
}

function sceneCuts(stderr: string) {
  const times: number[] = [];
  for (const match of stderr.matchAll(/pts_time:([0-9.]+)/g)) {
    const time = Number(match[1]);
    if (!Number.isFinite(time) || time < 0.15) continue;
    if (times.length && time - times[times.length - 1] < 0.45) continue;
    times.push(Math.round(time * 1000) / 1000);
  }
  return times;
}

/** Probe, loudness, and measured cuts. A page, poster, or embed is not accepted. */
export async function measurePlayableVideo(file: string): Promise<MeasuredVideo> {
  if (!videoMagic(file)) throw new Error("The stored file is not a video.");
  const probed = await probeVideo(file);
  let meanVolumeDb: number | null = null;
  let maxVolumeDb: number | null = null;
  if (probed.hasAudio) {
    const volume = await runTool(tool("ffmpeg"), ["-hide_banner", "-i", file, "-af", "volumedetect", "-f", "null", "-"], 60_000);
    const mean = /mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/.exec(volume.err);
    const max = /max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/.exec(volume.err);
    meanVolumeDb = mean ? Number(mean[1]) : null;
    maxVolumeDb = max ? Number(max[1]) : null;
  }
  let cuts: number[] | null = null;
  let sceneError: string | null = null;
  try {
    const scene = await runTool(tool("ffmpeg"), ["-hide_banner", "-i", file, "-filter:v", "select='gt(scene,0.20)',showinfo", "-an", "-f", "null", "-"], 60_000);
    if (scene.code !== 0) sceneError = "Shot detection did not finish.";
    else cuts = sceneCuts(scene.err);
  } catch (err) {
    sceneError = err instanceof Error ? err.message : "Shot detection did not finish.";
  }
  return { ...probed, meanVolumeDb, maxVolumeDb, cuts, sceneError };
}

/** Audio track only. The post page is never sent to a speech service. */
export async function extractSpeechAudio(file: string) {
  const dest = path.join(os.tmpdir(), `ugc-asr-${randomUUID()}.m4a`);
  const result = await runTool(tool("ffmpeg"), ["-y", "-i", file, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "aac", "-b:a", "64k", dest], 60_000);
  if (result.code !== 0 || !fs.existsSync(dest) || fs.statSync(dest).size < 400) {
    fs.rmSync(dest, { force: true });
    throw new Error("Could not read the audio track.");
  }
  return dest;
}

async function posterFor(video: string, dest: string) {
  const result = await runTool(tool("ffmpeg"), ["-y", "-ss", "0.2", "-i", video, "-frames:v", "1", "-vf", "scale=320:-1", "-q:v", "3", dest]);
  if (result.code !== 0 || !fs.existsSync(dest) || fs.statSync(dest).size < 400) {
    fs.rmSync(dest, { force: true });
    return false;
  }
  return true;
}

function patchJob(id: string, patch: Partial<ImportJob>) {
  const db = readDb();
  const job = db.jobs.find((row) => row.id === id);
  if (!job) return null;
  Object.assign(job, patch, { updatedAt: now() });
  writeDb(db);
  return job;
}

function readJob(id: string) {
  return readDb().jobs.find((row) => row.id === id) || null;
}

export function listUgcImportState() {
  const db = readDb();
  return { jobs: db.jobs.slice(0, 200), assets: db.assets.slice(0, 200) };
}

export function getUgcImportAsset(id: string) {
  return readDb().assets.find((row) => row.id === id) || null;
}

export function getUgcImportJob(id: string) {
  return readJob(id);
}

export async function publicPostDownloaderCapability() {
  return { ytdlp: await ytdlpAvailable(), direct: true };
}

function assertSku(productId: string, skuId: string) {
  if (!getProduct(productId)) throw new Error("product not found");
  const sku = readSharedCatalog().skus.find((row) => row.id === skuId && row.legacyProductId === productId);
  if (!sku) throw new Error("SKU not found");
}

function noteProgress(id: string, percent: number) {
  const job = readJob(id);
  if (!job || job.status === "ready" || job.status === "failed") return;
  if (job.progress != null && Math.abs(job.progress - percent) < 5 && percent < 100) return;
  patchJob(id, { status: "downloading", progress: Math.max(0, Math.min(99, Math.round(percent))) });
}

async function downloadDirect(url: string, dest: string, onProgress: (percent: number) => void) {
  let current = await assertPublicPostUrl(url);
  const request = fetchImpl || fetch;
  for (let hop = 0; hop <= 4; hop += 1) {
    const response = await request(current.href, {
      redirect: "manual",
      headers: { Accept: "video/mp4,video/webm,video/quicktime,*/*", "User-Agent": "AIOSCreator/1.0" },
      signal: AbortSignal.timeout(60_000),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw new Error("Redirect had no location.");
      current = await assertPublicPostUrl(new URL(location, current).href);
      continue;
    }
    if (!response.ok) throw new Error(`Download failed (HTTP ${response.status}).`);
    const type = (response.headers.get("content-type") || "").toLowerCase();
    if (/text\/html|application\/json|text\/plain|image\//.test(type)) throw new Error("That URL is a page, not a video file.");
    const length = Number(response.headers.get("content-length") || 0);
    if (length > MAX_BYTES) throw new Error("File is over 120MB.");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Download failed.");
    const sink = fs.createWriteStream(dest);
    let received = 0;
    try {
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) break;
        received += chunk.value.byteLength;
        if (received > MAX_BYTES) throw new Error("File is over 120MB.");
        if (length) onProgress((received / length) * 100);
        if (!sink.write(Buffer.from(chunk.value))) await once(sink, "drain");
      }
    } catch (err) {
      sink.destroy();
      fs.rmSync(dest, { force: true });
      throw err;
    }
    sink.end();
    await finished(sink);
    if (!fs.existsSync(dest) || fs.statSync(dest).size < 1000) throw new Error("Downloaded file is not a video.");
    if (!videoMagic(dest)) throw new Error("Downloaded file is not a video.");
    return dest;
  }
  throw new Error("Too many redirects.");
}

async function storeFile(job: ImportJob, file: string, provider: "direct" | "yt-dlp") {
  const existing = readDb().assets.find((row) => row.dedupeKey === job.dedupeKey);
  if (existing && storedPlayerReady(existing.mediaUrl)) {
    patchJob(job.id, { status: "ready", progress: 100, assetId: existing.id, error: null });
    await syncImportedReference(readJob(job.id) || job, existing);
    return existing;
  }
  patchJob(job.id, { status: "processing", progress: null });
  const ext = videoMagic(file);
  if (!ext) throw new Error("Downloaded file is not a video.");
  const id = randomUUID();
  const dest = path.join(mediaDir(), `${id}${ext}`);
  const poster = path.join(mediaDir(), `${id}-poster.jpg`);
  fs.copyFileSync(file, dest);
  try {
    const probed = await probeVideo(dest);
    const hash = createHash("sha256").update(fs.readFileSync(dest)).digest("hex");
    const hasPoster = await posterFor(dest, poster).catch(() => false);
    const mediaUrl = `/api/media/ugc-references/${id}${ext}`;
    if (!storedPlayerReady(mediaUrl)) throw new Error("The stored player URL does not open.");
    const asset: ImportAsset = {
      id,
      dedupeKey: job.dedupeKey,
      sourceUrl: job.sourceUrl,
      platform: job.platform,
      postId: job.postId,
      creator: job.creator,
      publishedAt: job.publishedAt,
      mediaUrl,
      posterUrl: hasPoster ? `/api/media/ugc-references/${id}-poster.jpg` : null,
      fileHash: hash,
      bytes: fs.statSync(dest).size,
      durationSec: probed.durationSec,
      width: probed.width,
      height: probed.height,
      hasAudio: probed.hasAudio,
      provider,
      createdAt: now(),
    };
    const db = readDb();
    db.assets.unshift(asset);
    const row = db.jobs.find((item) => item.id === job.id);
    if (row) Object.assign(row, { status: "ready", progress: 100, assetId: asset.id, error: null, updatedAt: now() });
    writeDb(db);
    await syncImportedReference(row || job, asset);
    return asset;
  } catch (err) {
    fs.rmSync(dest, { force: true });
    fs.rmSync(poster, { force: true });
    throw err;
  }
}

async function syncImportedReference(job: ImportJob, asset: ImportAsset) {
  const { applyImportedAsset } = await import("./ugc-references");
  applyImportedAsset(job, asset);
}

async function syncImportFailure(job: ImportJob | null, error: string) {
  if (!job) return;
  const { failImportedReference } = await import("./ugc-references");
  failImportedReference(job.productId, job.dedupeKey, error);
}

export async function registerStoredUpload(mediaUrl: string, meta: {
  dedupeKey: string;
  sourceUrl: string | null;
  platform: string;
  postId: string | null;
  creator: string | null;
  publishedAt: string | null;
}) {
  if (!storedPlayerReady(mediaUrl)) throw new Error("The stored player URL does not open.");
  const abs = path.resolve(mediaUrlToPath(mediaUrl));
  const measured = await measurePlayableVideo(abs);
  const hash = createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
  const db = readDb();
  const existing = db.assets.find((row) => row.fileHash === hash && storedPlayerReady(row.mediaUrl));
  if (existing) return { asset: existing, measured };
  const id = path.basename(abs, path.extname(abs));
  const poster = path.join(path.dirname(abs), `${id}-poster.jpg`);
  const hasPoster = fs.existsSync(poster) && fs.statSync(poster).size > 400 ? true : await posterFor(abs, poster).catch(() => false);
  const asset: ImportAsset = {
    id,
    dedupeKey: meta.dedupeKey,
    sourceUrl: meta.sourceUrl || mediaUrl,
    platform: meta.platform,
    postId: meta.postId,
    creator: meta.creator,
    publishedAt: meta.publishedAt,
    mediaUrl,
    posterUrl: hasPoster ? `/api/media/ugc-references/${id}-poster.jpg` : null,
    fileHash: hash,
    bytes: fs.statSync(abs).size,
    durationSec: measured.durationSec,
    width: measured.width,
    height: measured.height,
    hasAudio: measured.hasAudio,
    provider: "direct",
    createdAt: now(),
  };
  db.assets.unshift(asset);
  writeDb(db);
  return { asset, measured };
}

async function runJob(id: string) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ugc-import-"));
  try {
    for (;;) {
      const job = readJob(id);
      if (!job || job.status === "ready" || job.status === "failed") return;
      const attempt = job.attempt + 1;
      patchJob(id, { status: "resolving", attempt, error: null, progress: null });
      const local = path.join(tmp, "video.bin");
      try {
        const source = await assertPublicPostUrl(job.sourceUrl);
        if (!canAcquirePost(job.sourceUrl)) throw new Error("This link has no post id. Add the post URL.");
        let provider: "direct" | "yt-dlp" = "direct";
        if (isWatchHost(source.hostname)) {
          patchJob(id, { status: "downloading", progress: null });
          const download = watchDownloader || ytdlpDownload;
          if (!watchDownloader && !(await ytdlpAvailable())) throw new Error("Public post download is unavailable. yt-dlp is not installed.");
          const clip = await download(source.href, (percent) => noteProgress(id, percent));
          const ext = clip.ext === ".webm" || clip.ext === ".mov" ? clip.ext : ".mp4";
          fs.writeFileSync(path.join(tmp, `clip${ext}`), clip.buf);
          fs.copyFileSync(path.join(tmp, `clip${ext}`), local);
          const current = readJob(id);
          if (current && (clip.creator || clip.publishedAt)) {
            patchJob(id, {
              creator: current.creator || clip.creator || null,
              publishedAt: current.publishedAt || clip.publishedAt || null,
            });
          }
          provider = "yt-dlp";
        } else {
          patchJob(id, { status: "downloading", progress: null });
          await downloadDirect(source.href, local, (percent) => noteProgress(id, percent));
        }
        await storeFile(readJob(id) || job, local, provider);
        return;
      } catch (err) {
        const message = scrub(err);
        fs.rmSync(local, { force: true });
        if (attempt < MAX_ATTEMPTS && transient(message)) {
          patchJob(id, { status: "queued", error: message, progress: null });
          await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
          continue;
        }
        patchJob(id, { status: "failed", error: message, progress: null });
        await syncImportFailure(readJob(id), message);
        return;
      }
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function kick(id: string) {
  if (active.has(id)) return;
  const task = runJob(id).catch((err) => {
    patchJob(id, { status: "failed", error: scrub(err), progress: null });
  }).finally(() => {
    active.delete(id);
  });
  active.set(id, task);
}

export function resumeUgcImports() {
  const db = readDb();
  for (const job of db.jobs) {
    if (job.status === "ready" || job.status === "failed") continue;
    if (active.has(job.id)) continue;
    if (job.attempt >= MAX_ATTEMPTS) {
      patchJob(job.id, { status: "failed", error: job.error || "The download stopped.", progress: null });
      continue;
    }
    kick(job.id);
  }
}

export async function startUgcReferenceImport(input: {
  workspaceId?: string;
  productId: string;
  skuId: string;
  url: string;
  creator?: string | null;
  publishedAt?: string | null;
  retry?: boolean;
}) {
  if (input.workspaceId && input.workspaceId !== "local") throw new Error("This workspace cannot use that catalog id.");
  assertSku(input.productId, input.skuId);
  const identity = referenceIdentity(input.url || "");
  if (!canAcquirePost(identity.url)) throw new Error("This link has no post id. Add the post URL.");
  assertUrlShape(identity.url);
  const creator = (input.creator || "").replace(/\s+/g, " ").trim().replace(/^@/, "");
  if (creator.length > 80) throw new Error("Keep the creator name under 80 characters.");
  const publishedAt = (input.publishedAt || "").trim();
  if (publishedAt && !/^\d{4}-\d{2}-\d{2}$/.test(publishedAt)) throw new Error("Use a date as YYYY-MM-DD.");
  const job = await locked(() => {
    const db = readDb();
    const existing = db.jobs.find((row) => row.dedupeKey === identity.dedupeKey);
    if (existing?.status === "ready") {
      const asset = db.assets.find((row) => row.id === existing.assetId);
      if (asset && storedPlayerReady(asset.mediaUrl)) return existing;
      existing.status = "queued";
      existing.attempt = 0;
      existing.assetId = null;
      existing.error = null;
      existing.updatedAt = now();
      writeDb(db);
      return existing;
    }
    if (existing && existing.status !== "failed" && existing.status !== "ready") return existing;
    if (existing?.status === "failed") {
      if (existing.attempt >= MAX_ATTEMPTS && !input.retry) return existing;
      existing.status = "queued";
      existing.error = null;
      existing.progress = null;
      if (input.retry) existing.attempt = 0;
      existing.updatedAt = now();
      writeDb(db);
      return existing;
    }
    const stamp = now();
    const created: ImportJob = {
      id: randomUUID(),
      productId: input.productId,
      skuId: input.skuId,
      sourceUrl: identity.url,
      dedupeKey: identity.dedupeKey,
      platform: identity.platform,
      postId: identity.postId,
      creator: creator || null,
      publishedAt: publishedAt || null,
      status: "queued",
      progress: null,
      attempt: 0,
      error: null,
      assetId: null,
      createdAt: stamp,
      updatedAt: stamp,
    };
    db.jobs.unshift(created);
    writeDb(db);
    return created;
  });
  if (job.status !== "ready" && job.status !== "failed") kick(job.id);
  return { job: readJob(job.id) || job, asset: getUgcImportAsset((readJob(job.id) || job).assetId || "") };
}

/** Validates a file that is already on disk. Does not download and does not save a reference. */
export async function importPreparedFile(input: {
  productId: string;
  skuId: string;
  url: string;
  filePath: string;
  creator?: string | null;
  publishedAt?: string | null;
}) {
  if (!fs.existsSync(input.filePath)) throw new Error("The video file is missing.");
  const identity = referenceIdentity(input.url);
  assertUrlShape(identity.url);
  assertSku(input.productId, input.skuId);
  const creator = (input.creator || "").replace(/\s+/g, " ").trim().replace(/^@/, "") || null;
  const publishedAt = (input.publishedAt || "").trim() || null;
  const job = await locked(() => {
    const db = readDb();
    const existing = db.jobs.find((row) => row.dedupeKey === identity.dedupeKey);
    if (existing?.status === "ready") {
      const asset = db.assets.find((row) => row.id === existing.assetId);
      if (asset && storedPlayerReady(asset.mediaUrl)) return existing;
    }
    if (existing && existing.status !== "ready") return existing;
    const stamp = now();
    const created: ImportJob = {
      id: randomUUID(),
      productId: input.productId,
      skuId: input.skuId,
      sourceUrl: identity.url,
      dedupeKey: identity.dedupeKey,
      platform: identity.platform,
      postId: identity.postId,
      creator,
      publishedAt,
      status: "processing",
      progress: null,
      attempt: 1,
      error: null,
      assetId: null,
      createdAt: stamp,
      updatedAt: stamp,
    };
    db.jobs.unshift(created);
    writeDb(db);
    return created;
  });
  if (job.status === "ready") return { job, asset: getUgcImportAsset(job.assetId || "") };
  try {
    const asset = await storeFile({ ...job, creator, publishedAt }, input.filePath, "direct");
    return { job: readJob(job.id) || job, asset };
  } catch (err) {
    patchJob(job.id, { status: "failed", error: scrub(err), progress: null });
    return { job: readJob(job.id) || job, asset: null };
  }
}
