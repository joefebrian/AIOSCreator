import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { grokImagineI2V } from "./grok-imagine";
import { higgsfieldKling30StdI2V, higgsfieldSeedanceExtend, higgsfieldSeedanceI2V, higgsfieldSeedanceRef2V } from "./higgsfield";
import { cloudHttpError, withCloudFailover, type CloudCreds } from "./cloud-router";
import { klingMotionPrompt, type KlingOrientation } from "./kling-lock";
import { klingCallbackUrl } from "./kling-webhook";
import { getJob } from "./store";

function mimeOf(file: string) {
  const lower = file.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/png";
}

function cloudMessage(json: unknown, status: number) {
  const row = json as { message?: string; error?: { message?: string } };
  return row.error?.message || row.message || `Cloud HTTP ${status}`;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type Task = {
  id?: string;
  task_id?: string;
  status?: string;
  progress?: number;
  video_url?: string | null;
  error?: { message?: string };
  message?: string;
};

/** 9:16 720p — UGC / character stills. */
const SIZE_9_16 = "720x1280";

function v1Root(baseURL: string) {
  const root = baseURL.replace(/\/$/, "");
  return root.endsWith("/v1") ? root : `${root}/v1`;
}

function videoUrlFrom(json: Record<string, unknown>): string | undefined {
  const direct = json.video_url;
  if (typeof direct === "string" && direct) return direct;
  const data = json.data as Record<string, unknown> | undefined;
  const nested = data?.url || data?.video_url;
  if (typeof nested === "string" && nested) return nested;
  return undefined;
}

async function seedanceOnce(p: CloudCreds, srcImage: string, prompt: string, seconds: number) {
  const sec = Math.min(30, Math.max(4, Math.round(seconds || 5)));
  const text = (prompt || "").trim() || "Gentle camera push-in, subtle natural motion.";
  const promptText = `Keep the person from [Image 1] — same face, body, and wardrobe. ${text}`;
  const blob = new Blob([new Uint8Array(fs.readFileSync(srcImage))], { type: mimeOf(srcImage) });
  const root = v1Root(p.baseURL);
  const form = new FormData();
  form.append("model", p.model || "seedance-2-5");
  form.append("prompt", promptText);
  form.append("seconds", String(sec));
  form.append("size", SIZE_9_16);
  form.append("input_reference", blob, "reference.png");

  let created = await fetch(`${root}/videos`, {
    method: "POST",
    headers: { Authorization: `Bearer ${p.apiKey}` },
    body: form,
    signal: AbortSignal.timeout(60_000),
  });
  let createdJson = (await created.json().catch(() => ({}))) as Task & Record<string, unknown>;
  if (created.status === 404) {
    const b64 = fs.readFileSync(srcImage).toString("base64");
    created = await fetch(`${root}/video/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${p.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: p.model,
        prompt: promptText,
        duration: sec,
        size: SIZE_9_16,
        image: `data:${mimeOf(srcImage)};base64,${b64}`,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    createdJson = (await created.json().catch(() => ({}))) as Task & Record<string, unknown>;
  }
  if (!created.ok) throw cloudHttpError(created.status, cloudMessage(createdJson, created.status));
  const taskId = createdJson.id || createdJson.task_id || (createdJson.data as { task_id?: string; id?: string } | undefined)?.id;
  if (!taskId) throw new Error("Seedance returned no task id");

  const terminal = new Set(["completed", "succeeded", "success", "failed", "error"]);
  for (let i = 0; i < 90; i++) {
    await sleep(12_000);
    let res = await fetch(`${root}/videos/${encodeURIComponent(String(taskId))}`, {
      headers: { Authorization: `Bearer ${p.apiKey}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 404) {
      res = await fetch(`${root}/video/generations/${encodeURIComponent(String(taskId))}`, {
        headers: { Authorization: `Bearer ${p.apiKey}` },
        signal: AbortSignal.timeout(20_000),
      });
    }
    const json = (await res.json().catch(() => ({}))) as Task & Record<string, unknown>;
    if (!res.ok) throw cloudHttpError(res.status, cloudMessage(json, res.status));
    const status = (json.status || (json.data as { status?: string } | undefined)?.status || "").toLowerCase();
    if (!terminal.has(status)) continue;
    if (status !== "completed" && status !== "succeeded" && status !== "success") {
      throw new Error(json.error?.message || json.message || `Seedance ${status}`);
    }
    const url = videoUrlFrom(json);
    if (!url) throw new Error("Seedance completed with no video_url");
    const dl = await fetch(url, { signal: AbortSignal.timeout(180_000) });
    if (!dl.ok) throw new Error(`video download HTTP ${dl.status}`);
    return Buffer.from(await dl.arrayBuffer());
  }
  throw new Error("Seedance timed out waiting for the clip");
}

export async function higgsfieldSeedanceExtendVideo(srcVideo: string, prompt: string, seconds = 5, stillPath?: string) {
  return withCloudFailover("seedance-2-5-extend", (hit) => higgsfieldSeedanceExtend(hit, srcVideo, prompt, seconds, stillPath), {
    kind: "motion",
    durationSec: Math.min(30, Math.max(4, Math.round(seconds || 5))),
    resolution: "720p",
  });
}

export async function higgsfieldKlingStdI2V(srcImage: string, prompt: string, seconds = 5, sound = true) {
  return withCloudFailover("kling-3-0-std", (hit) => higgsfieldKling30StdI2V(hit, srcImage, prompt, seconds, sound), {
    kind: "motion",
    durationSec: Math.min(15, Math.max(3, Math.round(seconds || 5))),
    resolution: "720p",
  });
}

/** Classifiers still read NEGATIVE: nudity / undressing. Strip those tokens for cloud I2V. */
export function sanitizeCloudVideoPrompt(prompt: string) {
  return (prompt || "")
    .replace(
      /((?:^|\n)\s*(?:NEGATIVE|Avoid)\s*:\s*)([^\n]*)/gi,
      (_all, lead: string, body: string) =>
        `${lead}${body
          .replace(/\b(nudity|nude|undressing|underwear|bralette|boyshorts|see-through|lingerie)\b/gi, "")
          .replace(/[,;]\s*[,;]/g, ",")
          .replace(/^[\s,;]+|[\s,;]+$/g, "")}`,
    )
    .replace(/\bno (garment )?removal on camera\b/gi, "wardrobe already on at each cut")
    .trim();
}

export async function grokImagineVideoI2V(srcImage: string, prompt: string, seconds = 6) {
  return withCloudFailover("grok-imagine-video", (hit) => grokImagineI2V(hit, srcImage, prompt, seconds), {
    kind: "motion",
    durationSec: Math.min(15, Math.max(3, Math.round(seconds || 6))),
    resolution: "720p",
  });
}

export async function cometSeedanceI2V(
  srcImage: string,
  prompt: string,
  seconds = 5,
  engineId = "seedance-2-5",
  extraPaths?: string[],
) {
  const extras = (extraPaths || []).filter((p) => p && p !== srcImage && fs.existsSync(p));
  return withCloudFailover(engineId, (hit) => {
    if (hit.provider === "higgsfield") {
      if (extras.length) return higgsfieldSeedanceRef2V(hit, [srcImage, ...extras], prompt, seconds);
      return higgsfieldSeedanceI2V(hit, srcImage, prompt, seconds);
    }
    return seedanceOnce(hit, srcImage, prompt, seconds);
  }, {
    kind: "motion",
    durationSec: Math.min(30, Math.max(4, Math.round(seconds || 5))),
    resolution: "720p",
  });
}

function klingMessage(json: unknown, status: number) {
  const row = json as { message?: string; error?: { message?: string }; msg?: string };
  return row.message || row.msg || row.error?.message || `Kling HTTP ${status}`;
}

type KlingTask = {
  code?: number;
  message?: string;
  data?:
    | {
        id?: string;
        status?: string;
        message?: string;
        outputs?: { type?: string; url?: string }[];
      }
    | {
        id?: string;
        status?: string;
        message?: string;
        outputs?: { type?: string; url?: string }[];
      }[];
};

function klingTaskRow(json: KlingTask) {
  const data = json.data;
  if (Array.isArray(data)) return data[0];
  return data;
}

function klingHeaders(apiKey: string, json = false) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "User-Agent": "CreatorOS/1.0",
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";

function ffprobeBin() {
  return FFMPEG.replace(/ffmpeg(\.exe)?$/i, "ffprobe$1");
}

/** Format duration for wav or mp4. Does not require a video stream. */
export function probeDuration(src: string) {
  const out = spawnSync(
    ffprobeBin(),
    ["-v", "error", "-show_entries", "format=duration", "-of", "json", src],
    { windowsHide: true, encoding: "utf8" },
  );
  try {
    const j = JSON.parse(out.stdout || "{}") as { format?: { duration?: string } };
    return Number(j.format?.duration || 0);
  } catch {
    return 0;
  }
}

function probeVideo(src: string) {
  const out = spawnSync(
    ffprobeBin(),
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height,duration",
      "-show_entries",
      "format=duration",
      "-of",
      "json",
      src,
    ],
    { windowsHide: true, encoding: "utf8" },
  );
  try {
    const j = JSON.parse(out.stdout || "{}") as {
      streams?: { width?: number; height?: number; duration?: string }[];
      format?: { duration?: string };
    };
    const s = j.streams?.[0] || {};
    return {
      w: Number(s.width || 0),
      h: Number(s.height || 0),
      duration: Number(s.duration || j.format?.duration || 0),
    };
  } catch {
    return { w: 0, h: 0, duration: 0 };
  }
}

function probeCodec(src: string) {
  const out = spawnSync(
    ffprobeBin(),
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,pix_fmt,width,height", "-of", "json", src],
    { windowsHide: true, encoding: "utf8" },
  );
  try {
    const s = (JSON.parse(out.stdout || "{}") as { streams?: { codec_name?: string; pix_fmt?: string; width?: number; height?: number }[] })
      .streams?.[0];
    return {
      codec: (s?.codec_name || "").toLowerCase(),
      pix: (s?.pix_fmt || "").toLowerCase(),
      w: Number(s?.width || 0),
      h: Number(s?.height || 0),
    };
  } catch {
    return { codec: "", pix: "", w: 0, h: 0 };
  }
}

/** Kling 2.6/3.0 only decode H.264 yuv420p. Phone/web .mp4 is often VP9 or HEVC. */
function klingMp4(src: string) {
  if (src.endsWith(".kling.mp4") && fs.existsSync(src)) return src;
  const info = probeCodec(src);
  const even = info.w % 2 === 0 && info.h % 2 === 0;
  if (info.codec === "h264" && info.pix === "yuv420p" && even && /\.(mp4|mov)$/i.test(src)) return src;
  const dest = `${src}.kling.mp4`;
  const vf = even ? "scale=trunc(iw/2)*2:trunc(ih/2)*2" : "scale=trunc(iw/2)*2:trunc(ih/2)*2";
  const enc = spawnSync(
    FFMPEG,
    [
      "-y",
      "-i",
      src,
      "-vf",
      vf,
      "-c:v",
      "libx264",
      "-profile:v",
      "high",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "fast",
      "-crf",
      "18",
      "-c:a",
      "aac",
      "-ar",
      "44100",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      dest,
    ],
    { windowsHide: true, encoding: "utf8" },
  );
  if (enc.status === 0 && fs.existsSync(dest) && fs.statSync(dest).size > 1000) return dest;
  const silent = spawnSync(
    FFMPEG,
    [
      "-y",
      "-i",
      src,
      "-vf",
      vf,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-an",
      "-movflags",
      "+faststart",
      dest,
    ],
    { windowsHide: true, encoding: "utf8" },
  );
  if (silent.status === 0 && fs.existsSync(dest) && fs.statSync(dest).size > 1000) return dest;
  throw new Error(`Kling needs H.264 mp4. ffmpeg transcode failed (${info.codec || "unknown"}).`);
}

/** Kling 2.6/3.0: 340–3850px, ≥3s. Still-lock max 10s; drive-lock max 30s. */
function klingFitDrive(src: string, orientation: KlingOrientation) {
  let file = klingMp4(src);
  const probe = probeVideo(file);
  if (probe.duration && probe.duration < 2.8) {
    throw new Error(`Drive clip is ${probe.duration.toFixed(1)}s. Kling needs at least 3 seconds.`);
  }
  let ori = orientation;
  const notes: string[] = [];
  if (ori === "image" && probe.duration > 10.05) {
    ori = "video";
    notes.push(`Clip ${probe.duration.toFixed(1)}s > 10s still-lock — using drive orientation.`);
  }
  const minPx = 340;
  const maxPx = 3850;
  let { w, h } = probe;
  if (w && h && (w < minPx || h < minPx || w > maxPx || h > maxPx)) {
    let factor = 1;
    if (w < minPx || h < minPx) factor = Math.max(minPx / w, minPx / h);
    if (w * factor > maxPx || h * factor > maxPx) factor = Math.min(maxPx / w, maxPx / h);
    const nw = Math.max(minPx, Math.min(maxPx, Math.round((w * factor) / 2) * 2));
    const nh = Math.max(minPx, Math.min(maxPx, Math.round((h * factor) / 2) * 2));
    const dest = `${file}.klingfit.mp4`;
    const run = spawnSync(
      FFMPEG,
      ["-y", "-i", file, "-vf", `scale=${nw}:${nh}`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "copy", dest],
      { windowsHide: true, encoding: "utf8" },
    );
    if (run.status !== 0 || !fs.existsSync(dest)) {
      spawnSync(
        FFMPEG,
        ["-y", "-i", file, "-vf", `scale=${nw}:${nh}`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", dest],
        { windowsHide: true, encoding: "utf8" },
      );
    }
    if (!fs.existsSync(dest) || fs.statSync(dest).size < 1000) {
      throw new Error(`Drive clip ${w}×${h}px is outside Kling 340–3850px and scale failed.`);
    }
    file = dest;
    notes.push(`Scaled drive ${w}×${h} → ${nw}×${nh}.`);
  }
  return { path: file, orientation: ori, note: notes.join(" ") };
}

function publicUrl(text: string) {
  const line = text.trim().split(/\s+/)[0] || "";
  return /^https?:\/\//i.test(line) ? line : "";
}

function hostFailure(name: string, status: number, text: string) {
  const plain = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return `${name} ${status}${plain ? ` ${plain.slice(0, 80)}` : ""}`;
}

async function urlServesFile(url: string) {
  try {
    const res = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(20_000) });
    const len = Number(res.headers.get("content-length") || "0");
    const type = (res.headers.get("content-type") || "").toLowerCase();
    return res.ok && len > 1000 && !type.includes("text/html");
  } catch {
    return false;
  }
}

/** Kling needs a public video URL. Litterbox and 0x0.st are down, so the clip goes to uguu. */
export async function hostPublicFile(filePath: string, mime: string, fallbackName: string): Promise<string> {
  const buf = fs.readFileSync(filePath);
  const name = path.basename(filePath).replace(/[^\w.-]+/g, "_") || fallbackName;
  const blob = new Blob([new Uint8Array(buf)], { type: mime });
  const failures: string[] = [];

  const uguu = new FormData();
  uguu.append("files[]", blob, name);
  const uguuRes = await fetch("https://uguu.se/upload", {
    method: "POST",
    body: uguu,
    signal: AbortSignal.timeout(180_000),
  });
  const uguuText = (await uguuRes.text()).trim();
  if (uguuRes.ok) {
    try {
      const data = JSON.parse(uguuText) as { success?: boolean; files?: { url?: string }[] };
      const url = data.files?.[0]?.url || "";
      if (data.success && /^https?:\/\//i.test(url) && (await urlServesFile(url))) return url;
    } catch {
      /* fall through */
    }
  }
  failures.push(hostFailure("uguu", uguuRes.status, uguuText));

  const litter = new FormData();
  litter.append("reqtype", "fileupload");
  litter.append("time", "24h");
  litter.append("fileToUpload", blob, name);
  const box = await fetch("https://litterbox.catbox.moe/resources/internals/api.php", {
    method: "POST",
    body: litter,
    signal: AbortSignal.timeout(180_000),
  });
  const boxText = (await box.text()).trim();
  const boxUrl = publicUrl(boxText);
  if (box.ok && boxUrl && (await urlServesFile(boxUrl))) return boxUrl;
  failures.push(hostFailure("litterbox", box.status, boxText));

  throw new Error(`Need a public media URL. ${failures.join("; ")}`);
}

async function klingHostVideo(filePath: string): Promise<string> {
  const mp4 = klingMp4(filePath);
  return hostPublicFile(mp4, "video/mp4", "drive.mp4");
}

function klingStillPng(src: string) {
  const ext = path.extname(src).toLowerCase();
  if (ext === ".png" || ext === ".jpg" || ext === ".jpeg") return src;
  const dest = `${src}.kling.png`;
  const run = spawnSync(FFMPEG, ["-y", "-i", src, dest], { windowsHide: true, encoding: "utf8" });
  if (run.status === 0 && fs.existsSync(dest) && fs.statSync(dest).size > 500) return dest;
  return src;
}

function klingImagePayload(src: string) {
  let file = src;
  const ext = path.extname(src).toLowerCase();
  const big = fs.existsSync(src) && fs.statSync(src).size > 4 * 1024 * 1024;
  if ((ext !== ".jpg" && ext !== ".jpeg" && ext !== ".png") || big) {
    const dest = `${src}.klingface.jpg`;
    const run = spawnSync(
      FFMPEG,
      ["-y", "-i", src, "-vf", "scale='min(1280,iw)':-2", "-q:v", "4", dest],
      { windowsHide: true, encoding: "utf8" },
    );
    if (run.status === 0 && fs.existsSync(dest) && fs.statSync(dest).size > 500) file = dest;
  }
  return fs.readFileSync(file).toString("base64");
}

function klingElementId(json: unknown) {
  const data = (json as { data?: unknown }).data;
  const rows = Array.isArray(data) ? data : data ? [data] : [];
  for (const row of rows) {
    const elements = (row as { task_result?: { elements?: { element_id?: string | number }[] } }).task_result?.elements;
    const id = elements?.find((item) => item.element_id != null)?.element_id;
    if (id != null && String(id)) return String(id);
  }
  return "";
}

function klingElementStatus(json: unknown) {
  const data = (json as { data?: unknown }).data;
  const row = (Array.isArray(data) ? data[0] : data) as { task_status?: string; status?: string; task_status_msg?: string; message?: string } | undefined;
  return {
    status: String(row?.task_status || row?.status || "").toLowerCase(),
    message: row?.task_status_msg || row?.message || "",
  };
}

/** Kling 3.0 face element. Face photos only. Returns element_id. */
async function klingCreateFaceElement(
  p: CloudCreds,
  frontalPath: string,
  extraPaths: string[],
  onProgress?: (label: string) => void,
) {
  const refs = extraPaths.filter((file) => file && file !== frontalPath && fs.existsSync(file)).slice(0, 3);
  if (!refs.length) {
    throw new Error("Facial element needs the front photo plus 1 to 3 different face photos.");
  }
  onProgress?.("Creating facial element…");
  const created = await fetch(`${p.baseURL}/v1/general/advanced-custom-elements`, {
    method: "POST",
    headers: klingHeaders(p.apiKey, true),
    body: JSON.stringify({
      element_name: `face-${Date.now().toString(36)}`.slice(0, 20),
      element_description: "Face only. Not wardrobe, hair, or props.",
      reference_type: "image_refer",
      element_image_list: {
        frontal_image: klingImagePayload(frontalPath),
        refer_images: refs.map((file) => ({ image_url: klingImagePayload(file) })),
      },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const createdJson = await created.json().catch(() => ({}));
  if (!created.ok || (typeof (createdJson as { code?: number }).code === "number" && (createdJson as { code?: number }).code !== 0)) {
    throw new Error(klingMessage(createdJson, created.status));
  }
  const immediate = klingElementId(createdJson);
  if (immediate) return immediate;
  const taskId = String((createdJson as { data?: { task_id?: string } }).data?.task_id || "");
  if (!taskId) throw new Error("Kling facial element returned no task id");
  for (let i = 0; i < 40; i++) {
    await sleep(3_000);
    const res = await fetch(`${p.baseURL}/v1/general/advanced-custom-elements/${encodeURIComponent(taskId)}`, {
      headers: klingHeaders(p.apiKey),
      signal: AbortSignal.timeout(30_000),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || (typeof (json as { code?: number }).code === "number" && (json as { code?: number }).code !== 0)) {
      throw new Error(klingMessage(json, res.status));
    }
    const found = klingElementId(json);
    if (found) return found;
    const row = klingElementStatus(json);
    if (row.status === "failed") throw new Error(row.message || "Kling facial element failed");
    onProgress?.(`Facial element ${row.status || "processing"}…`);
  }
  throw new Error("Kling facial element timed out");
}

async function klingOnce(
  p: CloudCreds,
  srcImage: string,
  motionPath: string,
  prompt: string,
  sound: boolean,
  version: "kling-2.6" | "kling-3.0",
  orientation: KlingOrientation,
  onProgress?: (label: string) => void,
  jobId?: string,
  extra?: { resolution?: "720p" | "1080p"; facePaths?: string[] },
) {
  if (!motionPath || !fs.existsSync(motionPath)) {
    throw new Error("Kling Motion Control needs a driving video (3–30s mp4/mov)");
  }
  const still = klingStillPng(srcImage);
  const fitted = klingFitDrive(motionPath, orientation);
  const lockOrientation = fitted.orientation;
  if (fitted.note) onProgress?.(fitted.note);
  const imgBytes = fs.statSync(still).size;
  const vidBytes = fs.statSync(fitted.path).size;
  if (imgBytes > 50 * 1024 * 1024) throw new Error("still too large for Kling (max 50MB)");
  if (vidBytes > 100 * 1024 * 1024) throw new Error("drive clip too large for Kling (max 100MB)");

  const facePaths = (extra?.facePaths || []).filter((file) => file && file !== still && fs.existsSync(file)).slice(0, 3);
  let faceElement = false;
  let elementId = "";
  if (version === "kling-3.0" && facePaths.length) {
    if (lockOrientation !== "video") {
      throw new Error("Facial element binding only works when orientation matches the drive clip.");
    }
    elementId = await klingCreateFaceElement(p, still, facePaths, onProgress);
    faceElement = true;
  }
  onProgress?.("Hosting drive clip…");
  const videoUrl = await klingHostVideo(fitted.path);
  const resolution = extra?.resolution === "720p" ? "720p" : "1080p";
  const contents: { type: string; text?: string; url?: string; element_id?: string; id?: string }[] = [
    { type: "prompt", text: klingMotionPrompt(prompt, faceElement) },
    { type: "image", url: fs.readFileSync(still).toString("base64") },
    { type: "video", url: videoUrl },
  ];
  if (elementId) contents.push({ type: "element", element_id: elementId, id: "element_1" });

  onProgress?.(`Kling ${version} submitted…`);
  const callbackUrl = klingCallbackUrl();
  const created = await fetch(`${p.baseURL}/motion-control/${version}`, {
    method: "POST",
    headers: klingHeaders(p.apiKey, true),
    body: JSON.stringify({
      contents,
      settings: {
        character_orientation: lockOrientation,
        resolution,
        audio: sound ? "original" : "off",
      },
      options: {
        watermark_info: { enabled: false },
        ...(jobId ? { external_task_id: jobId } : {}),
        ...(callbackUrl ? { callback_url: callbackUrl } : {}),
      },
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const createdJson = (await created.json().catch(() => ({}))) as KlingTask;
  if (!created.ok || (typeof createdJson.code === "number" && createdJson.code !== 0)) {
    throw cloudHttpError(created.status, klingMessage(createdJson, created.status));
  }
  const taskId = klingTaskRow(createdJson)?.id;
  if (!taskId) throw new Error("Kling returned no task id");
  onProgress?.(`Kling task ${taskId}`);

  for (let i = 0; i < 180; i++) {
    if (jobId) {
      const local = getJob(jobId);
      if (local?.status === "completed" && local.mediaPath && fs.existsSync(local.mediaPath)) {
        return fs.readFileSync(local.mediaPath);
      }
      if (local?.status === "failed") throw new Error(local.error || "Kling webhook failed");
    }
    await sleep(8_000);
    const res = await fetch(`${p.baseURL}/tasks?task_ids=${encodeURIComponent(taskId)}`, {
      headers: klingHeaders(p.apiKey),
      signal: AbortSignal.timeout(30_000),
    });
    const json = (await res.json().catch(() => ({}))) as KlingTask;
    if (!res.ok || (typeof json.code === "number" && json.code !== 0)) {
      throw cloudHttpError(res.status, klingMessage(json, res.status));
    }
    const row = klingTaskRow(json);
    const status = (row?.status || "").toLowerCase();
    if (status === "submitted" || status === "processing" || !status) {
      onProgress?.(`Kling ${status || "processing"}…`);
      continue;
    }
    if (status !== "succeeded") {
      throw new Error(row?.message || json.message || `Kling ${status || "failed"}`);
    }
    const url = row?.outputs?.find((o) => o.type === "video" && o.url)?.url;
    if (!url) throw new Error("Kling succeeded with no video url");
    const dl = await fetch(url, { signal: AbortSignal.timeout(180_000) });
    if (!dl.ok) throw new Error(`Kling video download HTTP ${dl.status}`);
    return Buffer.from(await dl.arrayBuffer());
  }
  throw new Error("Kling timed out waiting for the clip");
}

/** Official Kling Motion Control. Still + drive, 3–30s, 1080p. Video must be a public URL. */
export async function klingMotionControl(
  srcImage: string,
  motionPath: string,
  prompt: string,
  sound = true,
  engineId: "kling-2-6" | "kling-3-0" = "kling-3-0",
  orientation: KlingOrientation = "image",
  onProgress?: (label: string) => void,
  jobId?: string,
  extra?: { resolution?: "720p" | "1080p"; facePaths?: string[] },
) {
  const version = engineId === "kling-2-6" ? "kling-2.6" : "kling-3.0";
  const routeId = engineId === "kling-2-6" ? "kling-2-6" : "kling-3-0";
  return withCloudFailover(
    routeId,
    (hit) => klingOnce(hit, srcImage, motionPath, prompt, sound, version, orientation, onProgress, jobId, extra),
    { kind: "motion", jobId, units: 1 },
  );
}

/** Portrait stills must keep 9:16. Old scale capped height at 1080 and crushed catalog photos. */
function falStillJpeg(src: string) {
  const dest = `${src}.fal.jpg`;
  const vf =
    "scale='if(gte(iw,ih),min(1920,iw),min(1080,iw))':'if(gte(iw,ih),min(1080,ih),min(1920,ih))':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2";
  for (const q of ["2", "4", "6"]) {
    const run = spawnSync(FFMPEG, ["-y", "-i", src, "-vf", vf, "-q:v", q, dest], {
      windowsHide: true,
      encoding: "utf8",
    });
    if (run.status === 0 && fs.existsSync(dest) && fs.statSync(dest).size > 500 && fs.statSync(dest).size <= 4.7 * 1024 * 1024) {
      return dest;
    }
  }
  if (fs.existsSync(dest) && fs.statSync(dest).size > 500) return dest;
  throw new Error("DreamActor still must be jpeg/png ≤ 4.7MB.");
}

/** Drive max 2048×1440. VP9/HEVC → H.264. */
function falFitDrive(src: string) {
  const h264 = klingMp4(src);
  const { w, h } = probeCodec(h264);
  const maxW = 2048;
  const maxH = 1440;
  if (w && h && w <= maxW && h <= maxH && w >= 200 && h >= 200) return h264;
  const dest = `${h264}.faldrive.mp4`;
  const run = spawnSync(
    FFMPEG,
    [
      "-y",
      "-i",
      h264,
      "-vf",
      `scale='min(${maxW},iw)':'min(${maxH},ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2`,
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-preset",
      "fast",
      "-crf",
      "18",
      "-c:a",
      "aac",
      "-movflags",
      "+faststart",
      dest,
    ],
    { windowsHide: true, encoding: "utf8" },
  );
  if (run.status === 0 && fs.existsSync(dest) && fs.statSync(dest).size > 1000) return dest;
  throw new Error("DreamActor drive clip must fit 2048×1440.");
}

function falDetail(json: unknown): string {
  if (!json || typeof json !== "object") return "";
  const row = json as { error?: unknown; detail?: unknown; message?: unknown };
  if (typeof row.error === "string" && row.error.trim()) return row.error.trim();
  if (row.error && typeof row.error === "object") {
    const message = (row.error as { message?: string }).message;
    if (message?.trim()) return message.trim();
  }
  if (typeof row.message === "string" && row.message.trim()) return row.message.trim();
  if (typeof row.detail === "string" && row.detail.trim()) return row.detail.trim();
  if (Array.isArray(row.detail)) {
    return row.detail
      .map((item) => (typeof item === "string" ? item : (item as { msg?: string }).msg || ""))
      .filter(Boolean)
      .join("; ");
  }
  return "";
}

function falVideoUrl(json: unknown): string {
  if (!json || typeof json !== "object") return "";
  const row = json as {
    video?: { url?: string } | string;
    data?: { video?: { url?: string } | string };
    payload?: { video?: { url?: string } | string };
    response?: { video?: { url?: string } | string };
  };
  const videos = [row.video, row.data?.video, row.payload?.video, row.response?.video];
  for (const video of videos) {
    if (typeof video === "string" && video.startsWith("http")) return video;
    if (video && typeof video === "object" && video.url?.startsWith("http")) return video.url;
  }
  return "";
}

async function falDreamOnce(p: CloudCreds, srcImage: string, motionPath: string, onProgress?: (label: string) => void) {
  if (!motionPath || !fs.existsSync(motionPath)) {
    throw new Error("DreamActor V2 needs a driving video (≤30s mp4/mov/webm)");
  }
  const still = falStillJpeg(srcImage);
  const drive = falFitDrive(motionPath);
  onProgress?.("Hosting still + drive clip…");
  const imageUrl = await hostPublicFile(still, "image/jpeg", "still.jpg");
  const videoUrl = await hostPublicFile(drive, "video/mp4", "drive.mp4");
  const model = p.model || "fal-ai/bytedance/dreamactor/v2";
  const root = (p.baseURL || "https://queue.fal.run").replace(/\/$/, "");
  const queue = root.includes("queue.fal.run") ? root : "https://queue.fal.run";
  const headers = {
    Authorization: `Key ${p.apiKey}`,
    "Content-Type": "application/json",
    "User-Agent": "CreatorOS/1.0",
  };
  onProgress?.("DreamActor queued…");
  const submitted = await fetch(`${queue}/${model}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ image_url: imageUrl, video_url: videoUrl, trim_first_second: true }),
    signal: AbortSignal.timeout(60_000),
  });
  const subJson = (await submitted.json().catch(() => ({}))) as {
    request_id?: string;
    status_url?: string;
    response_url?: string;
    detail?: string | { msg?: string }[];
    error?: string;
  };
  if (!submitted.ok) {
    const detail = Array.isArray(subJson.detail)
      ? subJson.detail.map((d) => (typeof d === "string" ? d : d.msg || "")).join("; ")
      : subJson.detail || subJson.error;
    throw cloudHttpError(submitted.status, String(detail || `fal HTTP ${submitted.status}`));
  }
  const requestId = subJson.request_id;
  const statusUrl = subJson.status_url || (requestId ? `${queue}/${model}/requests/${requestId}/status` : "");
  const responseUrl = subJson.response_url || (requestId ? `${queue}/${model}/requests/${requestId}` : "");
  if (!statusUrl || !responseUrl) throw new Error("fal returned no request id");

  for (let i = 0; i < 180; i++) {
    await sleep(4_000);
    const st = await fetch(statusUrl, { headers, signal: AbortSignal.timeout(30_000) });
    const stJson = (await st.json().catch(() => ({}))) as { status?: string; error?: string };
    const status = (stJson.status || "").toUpperCase();
    onProgress?.(`DreamActor ${status || "…"}`);
    if (status === "IN_QUEUE" || status === "IN_PROGRESS") continue;
    if (status !== "COMPLETED") {
      throw new Error(falDetail(stJson) || `DreamActor ${status || "failed"}`);
    }
    const done = await fetch(responseUrl, { headers, signal: AbortSignal.timeout(60_000) });
    if (done.status === 202) continue;
    const doneJson = await done.json().catch(() => ({}));
    const url = falVideoUrl(doneJson);
    if (!url) throw new Error(falDetail(doneJson) || `DreamActor result HTTP ${done.status} with no video url`);
    const dl = await fetch(url, { signal: AbortSignal.timeout(180_000) });
    if (!dl.ok) throw new Error(`DreamActor download HTTP ${dl.status}`);
    return Buffer.from(await dl.arrayBuffer());
  }
  throw new Error("DreamActor timed out waiting for the clip");
}

/** fal.ai ByteDance DreamActor V2. Still + drive ≤30s. This fal key is not used for other models. */
export async function falDreamActorV2(
  srcImage: string,
  motionPath: string,
  onProgress?: (label: string) => void,
) {
  return withCloudFailover("dreamactor-v2", (hit) => falDreamOnce(hit, srcImage, motionPath, onProgress), {
    kind: "motion",
    durationSec: 5,
  });
}
