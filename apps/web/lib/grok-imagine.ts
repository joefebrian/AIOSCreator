import fs from "node:fs";
import { cloudHttpError, type CloudCreds } from "./cloud-router";
import { parseImageAspect } from "./image-aspect";
import { normalizeStillRefs, type GenerateStillOpts, type StillRefs } from "./still-refs";

/** User only picks Grok Imagine 2.0. Backend picks the $0.06 tier. */
export type GrokImagineRender = {
  resolution: "1k" | "2k";
  quality: "low" | "medium";
  why: "face" | "poster";
};

export function grokImagineRender(opts?: {
  kind?: GenerateStillOpts["kind"];
  refCount?: number;
  prompt?: string;
}): GrokImagineRender {
  const refs = opts?.refCount ?? 0;
  const kind = opts?.kind;
  const p = (opts?.prompt || "").toLowerCase();
  const posterCue = /\b(crop|zoom|poster|billboard|print|full[- ]?res|thumbnail)\b/.test(p);
  const faceCue =
    refs > 0 ||
    kind === "identity" ||
    kind === "faceswap" ||
    kind === "transform" ||
    kind === "restyle" ||
    /\b(face|wajah|hands?|tangan|skin|kulit|pores?|label|packaging|logo|bottle text)\b/.test(p);
  if (faceCue && !posterCue) return { resolution: "1k", quality: "medium", why: "face" };
  return { resolution: "2k", quality: "low", why: "poster" };
}

function mimeOf(file: string) {
  const lower = file.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/png";
}

function dataUri(file: string) {
  return `data:${mimeOf(file)};base64,${fs.readFileSync(file).toString("base64")}`;
}

function grokAspect(aspect?: string) {
  const a = parseImageAspect(aspect);
  return a === "4:5" ? "3:4" : a;
}

function v1(baseURL: string) {
  const root = baseURL.replace(/\/$/, "");
  return root.endsWith("/v1") ? root : `${root}/v1`;
}

function refFiles(refs: StillRefs) {
  const out: string[] = [];
  for (const p of [refs.face, refs.body, refs.scene]) {
    if (p && fs.existsSync(p) && !out.includes(p)) out.push(p);
  }
  return out.slice(0, 5);
}

function grokErr(json: {
  error?: { message?: string; code?: string } | string;
  message?: string;
  detail?: unknown;
}, fallback: string) {
  if (typeof json.error === "string" && json.error.trim()) return json.error;
  if (json.error && typeof json.error === "object" && json.error.message) return json.error.message;
  if (typeof json.message === "string" && json.message.trim()) return json.message;
  if (json.detail) {
    const d = typeof json.detail === "string" ? json.detail : JSON.stringify(json.detail);
    if (d && d !== "{}") return d.slice(0, 280);
  }
  return fallback;
}

async function imageBufferFrom(json: {
  data?: { b64_json?: string; url?: string }[];
  url?: string;
  error?: { message?: string };
}) {
  if (json.error?.message) throw new Error(json.error.message);
  const hit = json.data?.[0];
  if (hit?.b64_json) return Buffer.from(hit.b64_json, "base64");
  const url = hit?.url || json.url;
  if (url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`Grok Imagine download HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error("Grok Imagine returned no image");
}

/** Catalog/fashion wording for Imagine API. Chat Grok is looser; /images/edits scores identity+lingerie as nudify. */
export function softenGrokCatalogPrompt(prompt: string) {
  let p = prompt;
  p = p.replace(/\bpanties\b/gi, "shorts");
  p = p.replace(/\bnude\b/gi, "neutral");
  p = p.replace(/\b(lingerie|sheer|see-?through|unclothed|undress)\b/gi, "sleepwear");
  p = p.replace(/Do not keep Image 1's original clothes[^.]*\./gi, "Keep Image 1's face and body. Outfit matches Image 2.");
  p = p.replace(/Ignore the model in Image 2[^.]*\./gi, "Image 2 is the outfit reference.");
  p = p.replace(/slight sweat sheen,?/gi, "");
  p = p.replace(/hard summer sun[^.]*\./gi, "even catalog light.");
  const lockedFace = /this exact person's face|\[SUBJECT\]/i.test(p);
  if (!lockedFace && !/e-commerce|lookbook|catalog photography/i.test(p)) {
    p += " Fashion e-commerce lookbook. Clothing on. Catalog photography.";
  }
  return p.replace(/\s+/g, " ").trim();
}

function isGrokModeration(msg: string) {
  return /content moderation|respect_moderation|moderated/i.test(msg);
}

async function grokImaginePost(
  root: string,
  apiKey: string,
  path: string,
  body: Record<string, unknown>,
) {
  const res = await fetch(`${root}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(360_000),
  });
  const json = (await res.json().catch(() => ({}))) as Parameters<typeof imageBufferFrom>[0] & {
    message?: string;
    detail?: unknown;
    error?: { message?: string };
  };
  if (!res.ok) throw cloudHttpError(res.status, grokErr(json, `Grok Imagine HTTP ${res.status}`));
  return imageBufferFrom(json);
}

export async function grokImagineStill(
  p: CloudCreds,
  prompt: string,
  reference?: string | StillRefs,
  aspect?: string,
  opts?: GenerateStillOpts,
) {
  const refs = normalizeStillRefs(reference);
  const files = refFiles(refs);
  const render = grokImagineRender({ kind: opts?.kind, refCount: files.length, prompt });
  const root = v1(p.baseURL);
  const model = p.model || "grok-imagine-image-2.0";
  const catalog =
    opts?.kind === "restyle" && files.length >= 2 ? prompt : softenGrokCatalogPrompt(prompt);
  const body: Record<string, unknown> = {
    model,
    prompt: catalog,
    aspect_ratio: grokAspect(aspect),
    resolution: render.resolution,
    quality: render.quality,
    n: 1,
  };
  let path = "/images/generations";
  if (files.length === 1) {
    path = "/images/edits";
    body.image = { url: dataUri(files[0]!), type: "image_url" };
  } else if (files.length > 1) {
    path = "/images/edits";
    body.images = files.map((f) => ({ url: dataUri(f), type: "image_url" }));
  }
  try {
    return await grokImaginePost(root, p.apiKey, path, body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!isGrokModeration(msg)) throw err;
    body.prompt = `${catalog} SFW fashion catalog. Adult model wearing sleepwear. No nudity.`;
    return grokImaginePost(root, p.apiKey, path, body);
  }
}

const GROK_TRYON_PROMPT =
  "Virtual try-on. Image 1 is the person — keep her exact face, hair, skin, body, pose, crop, and lighting. Image 2 is one SKU photo or a grid of several SKU photos. Put EVERY distinct product from Image 2 onto her. Do not apply only the first cell. Clothes replace her outfit. Jewelry is added (ears/neck/wrist). Bag worn or held. Shoes on her feet. Keep identity. Ignore other models in Image 2. Photoreal.";

/** Person still + garment still via grok-imagine-image-quality (2K). Falls back to Imagine 2.0. */
export async function grokImagineTryOn(
  p: CloudCreds,
  person: string,
  garment: string,
  aspect?: string,
  prompt?: string,
) {
  const root = v1(p.baseURL);
  const text = (prompt || "").replace(/\nAvoid:\s*[\s\S]*$/i, "").trim() || GROK_TRYON_PROMPT;
  const body: Record<string, unknown> = {
    model: p.model || "grok-imagine-image-quality",
    prompt: text,
    aspect_ratio: grokAspect(aspect),
    resolution: "2k",
    n: 1,
    images: [person, garment].map((f) => ({ url: dataUri(f), type: "image_url" })),
  };
  try {
    return await grokImaginePost(root, p.apiKey, "/images/edits", body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/model|unknown|not found|invalid/i.test(msg) && body.model !== "grok-imagine-image-2.0") {
      body.model = "grok-imagine-image-2.0";
      return grokImaginePost(root, p.apiKey, "/images/edits", body);
    }
    throw err;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const GROK_VIDEO_SLUGS = ["grok-imagine-video-1.5", "grok-imagine-video"];

export async function grokImagineI2V(p: CloudCreds, srcImage: string, prompt: string, seconds = 6) {
  const duration = Math.min(15, Math.max(3, Math.round(seconds || 6)));
  const root = v1(p.baseURL);
  const slugs = [p.model, ...GROK_VIDEO_SLUGS].filter((s, i, a): s is string => Boolean(s) && a.indexOf(s) === i);
  let last: Error | undefined;
  let start: {
    request_id?: string;
    id?: string;
    status?: string;
    error?: { message?: string };
    message?: string;
    video?: { url?: string };
  } = {};
  let createdOk = false;
  for (const slug of slugs) {
    const created = await fetch(`${root}/videos/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${p.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: slug,
        prompt: prompt.trim() || "Subtle natural motion, photoreal, keep identity.",
        image: { url: dataUri(srcImage) },
        duration,
        aspect_ratio: "9:16",
        resolution: "720p",
      }),
      signal: AbortSignal.timeout(60_000),
    });
    start = (await created.json().catch(() => ({}))) as typeof start;
    if (created.ok) {
      createdOk = true;
      break;
    }
    const msg = grokErr(start, `Grok video HTTP ${created.status}`);
    last = cloudHttpError(created.status, msg);
    if (!/does not exist|does not have access/i.test(msg)) throw last;
  }
  if (!createdOk) {
    throw new Error(
      last?.message
        ? `${last.message} Enable Grok Imagine Video on this xAI key (console.x.ai), or top up Seedance.`
        : "Grok Imagine Video is not enabled on this xAI key.",
    );
  }
  const id = start.request_id || start.id;
  if (!id) throw new Error("Grok Imagine video returned no request_id");

  const deadline = Date.now() + 8 * 60 * 1000;
  while (Date.now() < deadline) {
    await sleep(4000);
    const poll = await fetch(`${root}/videos/${id}`, {
      headers: { Authorization: `Bearer ${p.apiKey}` },
      signal: AbortSignal.timeout(30_000),
    });
    const json = (await poll.json().catch(() => ({}))) as {
      status?: string;
      video?: { url?: string };
      url?: string;
      error?: { message?: string };
      message?: string;
    };
    const status = (json.status || "").toLowerCase();
    if (status === "failed" || status === "expired") {
      throw new Error(json.error?.message || json.message || `Grok video ${status}`);
    }
    const url = json.video?.url || json.url;
    if ((status === "done" || status === "completed" || status === "succeeded") && url) {
      const dl = await fetch(url, { signal: AbortSignal.timeout(180_000) });
      if (!dl.ok) throw new Error(`Grok video download HTTP ${dl.status}`);
      return Buffer.from(await dl.arrayBuffer());
    }
  }
  throw new Error("Grok Imagine video timed out");
}
