import fs from "node:fs";
import { CloudSafetyError, cloudHttpError, type CloudCreds } from "./cloud-router";
import { parseImageAspect } from "./image-aspect";
import { normalizeStillRefs, type StillRefs } from "./still-refs";

const HF_ROOT = "https://api.higgsfield.ai";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isNetFail(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  const code =
    err && typeof err === "object" && "cause" in err
      ? String((err as { cause?: { code?: string } }).cause?.code || "")
      : "";
  return /fetch failed|ECONNRESET|ETIMEDOUT|UND_ERR|socket|network|aborted/i.test(`${msg} ${code}`);
}

async function hfFetch(url: string, init: RequestInit, tries = 4) {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      last = err;
      if (!isNetFail(err) || i === tries - 1) {
        const cause =
          err && typeof err === "object" && "cause" in err
            ? (err as { cause?: { code?: string; message?: string } }).cause
            : undefined;
        const host = url.replace(/^https?:\/\//, "").split("/")[0];
        throw new Error(
          `Higgsfield fetch failed (${host}): ${cause?.code || cause?.message || (err instanceof Error ? err.message : String(err))}`,
        );
      }
      await sleep(1200 * (i + 1));
    }
  }
  throw last instanceof Error ? last : new Error("Higgsfield fetch failed");
}

function mimeOf(file: string) {
  const lower = file.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".mp4") || lower.endsWith(".mov")) return "video/mp4";
  return "image/png";
}

export function higgsfieldAuth(apiKey: string) {
  const raw = apiKey.trim();
  if (raw.toLowerCase().startsWith("key ")) return raw;
  return `Key ${raw}`;
}

function higgsfieldHeaders(apiKey: string) {
  const raw = apiKey.trim().replace(/^key\s+/i, "");
  const i = raw.indexOf(":");
  const id = i >= 0 ? raw.slice(0, i) : raw;
  const secret = i >= 0 ? raw.slice(i + 1) : "";
  const headers: Record<string, string> = {
    Authorization: higgsfieldAuth(apiKey),
  };
  if (id) headers["hf-api-key"] = id;
  if (secret) headers["hf-secret"] = secret;
  return headers;
}

async function downloadUrl(url: string) {
  const res = await hfFetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!res.ok) throw new Error(`Higgsfield download HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function higgsfieldUpload(apiKey: string, filePath: string): Promise<string> {
  const contentType = mimeOf(filePath);
  const created = await hfFetch(`${HF_ROOT}/files/generate-upload-url`, {
    method: "POST",
    headers: {
      ...higgsfieldHeaders(apiKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content_type: contentType }),
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await created.json().catch(() => ({}))) as {
    public_url?: string;
    upload_url?: string;
    content_type?: string;
    upload_headers?: Record<string, string>;
    error?: { message?: string };
    message?: string;
    detail?: string;
  };
  if (!created.ok || !json.upload_url || !json.public_url) {
    const detail = json.error?.message || json.message || json.detail || `HTTP ${created.status}`;
    throw cloudHttpError(created.status || 502, `Higgsfield upload URL failed (${detail}). Pick another stills engine on the image node.`);
  }
  const headers: Record<string, string> = { ...(json.upload_headers || {}) };
  if (!headers["Content-Type"] && !headers["content-type"]) headers["Content-Type"] = json.content_type || contentType;
  const put = await hfFetch(json.upload_url, {
    method: "PUT",
    headers,
    body: new Uint8Array(fs.readFileSync(filePath)),
    signal: AbortSignal.timeout(120_000),
  });
  if (!put.ok) throw new Error(`Higgsfield file PUT HTTP ${put.status}`);
  return json.public_url;
}

type HfStatus = {
  status?: string;
  request_id?: string;
  status_url?: string;
  images?: { url?: string }[];
  video?: { url?: string };
  videos?: { url?: string }[];
  error?: string | { message?: string };
  message?: string;
};

async function pollHiggsfield(apiKey: string, statusUrl: string): Promise<HfStatus> {
  const deadline = Date.now() + 12 * 60 * 1000;
  let delay = 2000;
  while (Date.now() < deadline) {
    await sleep(delay);
    delay = Math.min(8000, delay + 500);
    const res = await hfFetch(statusUrl, {
      headers: higgsfieldHeaders(apiKey),
      signal: AbortSignal.timeout(30_000),
    });
    const json = (await res.json().catch(() => ({}))) as HfStatus;
    const status = (json.status || "").toLowerCase();
    if (status === "completed") return json;
    if (status === "nsfw" || /\bnsfw\b/i.test(typeof json.error === "string" ? json.error : json.error?.message || json.message || "")) {
      throw new CloudSafetyError(
        "Higgsfield blocked this as NSFW. For video: Grok Imagine Video, and drop nudity/undressing/underwear from the prompt (including NEGATIVE). For stills: Grok Imagine or Qwen Image Edit.",
      );
    }
    if (status === "failed" || status === "canceled") {
      const err = typeof json.error === "string" ? json.error : json.error?.message || json.message || status;
      throw new Error(`Higgsfield ${status}: ${err}`);
    }
  }
  throw new Error("Higgsfield timed out");
}

export async function higgsfieldSubmit(apiKey: string, path: string, body: Record<string, unknown>) {
  const res = await hfFetch(`${HF_ROOT}/${path.replace(/^\//, "")}`, {
    method: "POST",
    headers: {
      ...higgsfieldHeaders(apiKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const json = (await res.json().catch(() => ({}))) as HfStatus;
  const st = (json.status || "").toLowerCase();
  if (st === "nsfw" || /nsfw/i.test(String(json.error || json.message || ""))) {
    throw new CloudSafetyError(
      "Higgsfield blocked this as NSFW. For video: Grok Imagine Video, and drop nudity/undressing/underwear from the prompt (including NEGATIVE). For stills: Grok Imagine or Qwen Image Edit.",
    );
  }
  if (!res.ok) throw cloudHttpError(res.status, json.error?.toString() || json.message || `Higgsfield HTTP ${res.status}`);
  const statusUrl = json.status_url || (json.request_id ? `${HF_ROOT}/requests/${json.request_id}/status` : "");
  if (!statusUrl) throw new Error("Higgsfield returned no status_url");
  return pollHiggsfield(apiKey, statusUrl);
}

function videoFrom(json: HfStatus) {
  const url = json.video?.url || json.videos?.[0]?.url;
  if (!url) throw new Error("Higgsfield returned no video url");
  return downloadUrl(url);
}

function imageFrom(json: HfStatus) {
  const url = json.images?.[0]?.url;
  if (!url) throw new Error("Higgsfield returned no image url");
  return downloadUrl(url);
}

export async function higgsfieldSeedanceI2V(p: CloudCreds, stillPath: string, prompt: string, seconds = 5) {
  const imageUrl = await higgsfieldUpload(p.apiKey, stillPath);
  const duration = Math.min(30, Math.max(4, Math.round(seconds || 5)));
  const done = await higgsfieldSubmit(p.apiKey, "bytedance/seedance-2.5/image-to-video", {
    prompt: (prompt || "").trim() || "Subtle natural motion, photoreal, keep identity.",
    resolution: "720p",
    generate_audio: true,
    duration,
    image_url: imageUrl,
    output_format: "mp4",
  });
  return videoFrom(done);
}

/** Character + wardrobe (and more) as @Image1 / @Image2. Not first-frame-only I2V. */
export async function higgsfieldSeedanceRef2V(p: CloudCreds, stillPaths: string[], prompt: string, seconds = 5) {
  const files = stillPaths.filter((f) => f && fs.existsSync(f)).slice(0, 8);
  if (!files.length) throw new Error("Seedance needs at least one still");
  if (files.length === 1) return higgsfieldSeedanceI2V(p, files[0], prompt, seconds);
  const image_urls: string[] = [];
  for (const f of files) image_urls.push(await higgsfieldUpload(p.apiKey, f));
  const duration = Math.min(30, Math.max(4, Math.round(seconds || 5)));
  const raw = (prompt || "").trim();
  const tagged =
    /@Image\s*1|Image\s*1\b/i.test(raw)
      ? raw
      : `@Image1 is the person — face, body, identity. @Image2 is the wardrobe/product. Keep identity from @Image1 and garments from @Image2. ${raw}`.trim();
  try {
    const done = await higgsfieldSubmit(p.apiKey, "bytedance/seedance-2.5/reference-to-video", {
      prompt: tagged || "Photoreal UGC. Same person as @Image1 wearing @Image2.",
      resolution: "720p",
      generate_audio: true,
      duration,
      image_urls,
    });
    return videoFrom(done);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/nsfw|safety|sexual/i.test(msg)) throw err;
    return higgsfieldSeedanceI2V(p, files[0], tagged, seconds);
  }
}

export async function higgsfieldSeedanceExtend(p: CloudCreds, videoPath: string, prompt: string, seconds = 5, imagePath?: string) {
  const videoUrl = await higgsfieldUpload(p.apiKey, videoPath);
  const duration = Math.min(30, Math.max(4, Math.round(seconds || 5)));
  const body: Record<string, unknown> = {
    prompt: (prompt || "").trim() || "Continue the motion naturally, keep identity and product.",
    resolution: "720p",
    generate_audio: true,
    duration,
    video_url: videoUrl,
    output_format: "mp4",
  };
  if (imagePath && fs.existsSync(imagePath)) {
    body.image_urls = [await higgsfieldUpload(p.apiKey, imagePath)];
  }
  const done = await higgsfieldSubmit(p.apiKey, "bytedance/seedance-2.5/video-extend", body);
  return videoFrom(done);
}

/** Kling 3.0 Standard I2V — UGC still → clip. Not Motion Control / Pro / 4K. */
export async function higgsfieldKling30StdI2V(p: CloudCreds, stillPath: string, prompt: string, seconds = 5, sound = true) {
  const imageUrl = await higgsfieldUpload(p.apiKey, stillPath);
  const duration = Math.min(15, Math.max(3, Math.round(seconds || 5)));
  const done = await higgsfieldSubmit(p.apiKey, "kling-video/v3.0/std/image-to-video", {
    prompt: (prompt || "").trim() || "Natural motion, photoreal.",
    image_url: imageUrl,
    duration,
    sound: sound ? "on" : "off",
    cfg_scale: 0.5,
  });
  return videoFrom(done);
}

export async function higgsfieldMarketingStill(p: CloudCreds, prompt: string, reference?: string | StillRefs, aspect?: string) {
  const refs = normalizeStillRefs(reference);
  const files = [refs.scene, refs.body, refs.face].filter((f): f is string => Boolean(f && fs.existsSync(f)));
  const unique = [...new Set(files)];
  const image_urls: string[] = [];
  for (const f of unique.slice(0, 16)) image_urls.push(await higgsfieldUpload(p.apiKey, f));
  const ratio = parseImageAspect(aspect);
  const done = await higgsfieldSubmit(p.apiKey, "marketing-studio/image", {
    prompt: (prompt || "").trim() || "Campaign product still, photoreal, 9:16.",
    resolution: "2k",
    aspect_ratio: ratio === "4:5" ? "3:4" : ratio,
    quality: "high",
    ...(image_urls.length ? { image_urls } : {}),
  });
  return imageFrom(done);
}
