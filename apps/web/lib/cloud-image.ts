import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cloudHttpError, withCloudFailover, type CloudCreds } from "./cloud-router";
import { grokImagineStill } from "./grok-imagine";
import { isTryOnEngine, runVirtualTryOn } from "./virtual-tryon";
import { higgsfieldMarketingStill } from "./higgsfield";
import { gptImageSize, seedreamSize } from "./image-aspect";
import { normalizeStillRefs, type GenerateStillOpts, type StillRefs } from "./still-refs";

function mimeOf(file: string) {
  const lower = file.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/png";
}

async function bufferFromResponse(json: {
  data?: { b64_json?: string; url?: string }[];
  error?: { message?: string };
}) {
  if (json.error?.message) throw new Error(json.error.message);
  const hit = json.data?.[0];
  if (hit?.b64_json) return Buffer.from(hit.b64_json, "base64");
  if (hit?.url) {
    const res = await fetch(hit.url);
    if (!res.ok) throw new Error(`image download HTTP ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
  throw new Error("cloud image returned no data");
}

function refList(refs: StillRefs, kind?: string): string[] {
  const out: string[] = [];
  const swap = kind === "faceswap" || kind === "scene";
  const seq = swap ? [refs.scene, refs.face, refs.body] : [refs.face, refs.body, refs.scene];
  for (const p of seq) {
    if (p && fs.existsSync(p) && !out.includes(p)) out.push(p);
  }
  return out;
}

async function openaiStill(p: CloudCreds, prompt: string, refs: StillRefs, aspect?: string, kind?: string) {
  const size = gptImageSize(aspect);
  const files = refList(refs, kind);
  if (files.length) {
    const form = new FormData();
    form.append("model", p.model);
    form.append("prompt", prompt);
    form.append("size", size);
    form.append("quality", p.model.includes("flare") ? "medium" : "high");
    const field = files.length > 1 ? "image[]" : "image";
    for (const [i, file] of files.entries()) {
      const blob = new Blob([new Uint8Array(fs.readFileSync(file))], { type: mimeOf(file) });
      form.append(field, blob, i === 0 ? "face.png" : i === 1 ? "product.png" : `ref-${i}.png`);
    }
    const res = await fetch(`${p.baseURL}/images/edits`, {
      method: "POST",
      headers: { Authorization: `Bearer ${p.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(360_000),
    });
    const json = (await res.json().catch(() => ({}))) as Parameters<typeof bufferFromResponse>[0];
    if (!res.ok) throw cloudHttpError(res.status, json.error?.message || `GPT Image HTTP ${res.status}`);
    return bufferFromResponse(json);
  }
  const res = await fetch(`${p.baseURL}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${p.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: p.model,
      prompt,
      size,
      quality: p.model.includes("flare") ? "medium" : "high",
      output_format: "png",
    }),
    signal: AbortSignal.timeout(360_000),
  });
  const json = (await res.json().catch(() => ({}))) as Parameters<typeof bufferFromResponse>[0];
  if (!res.ok) throw cloudHttpError(res.status, json.error?.message || `GPT Image HTTP ${res.status}`);
  return bufferFromResponse(json);
}

function seedreamRefJpeg(file: string) {
  const tmp = path.join(os.tmpdir(), `seedream-ref-${randomBytes(4).toString("hex")}.jpg`);
  const run = spawnSync(
    "ffmpeg",
    ["-y", "-i", file, "-vf", "scale='min(1280,iw)':-2", "-q:v", "3", tmp],
    { encoding: "utf8" },
  );
  if (run.status !== 0 || !fs.existsSync(tmp) || fs.statSync(tmp).size < 1000) {
    return file;
  }
  return tmp;
}

export function isSeedreamEngine(id: string) {
  return id === "seedream-5-pro" || id === "seedream-5-lite" || id === "seedream-4-5";
}

async function seedreamStill(p: CloudCreds, prompt: string, refs: StillRefs, aspect?: string, engineId?: string, kind?: string) {
  const body: Record<string, unknown> = {
    model: p.model,
    prompt,
    size: seedreamSize(aspect),
    watermark: false,
    response_format: "url",
  };
  if (engineId !== "seedream-4-5") body.output_format = "png";
  const files = refList(refs, kind).map(seedreamRefJpeg);
  if (files.length === 1) {
    body.image = `data:${mimeOf(files[0]!)};base64,${fs.readFileSync(files[0]!).toString("base64")}`;
  } else if (files.length > 1) {
    body.image = files.map((f) => `data:${mimeOf(f)};base64,${fs.readFileSync(f).toString("base64")}`);
  }
  const res = await fetch(`${p.baseURL}/images/generations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${p.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(360_000),
  });
  const json = (await res.json().catch(() => ({}))) as Parameters<typeof bufferFromResponse>[0] & {
    message?: string;
  };
  if (!res.ok) throw cloudHttpError(res.status, json.error?.message || json.message || `Seedream HTTP ${res.status}`);
  return bufferFromResponse(json);
}

function museDataUrl(file: string) {
  return `data:${mimeOf(file)};base64,${fs.readFileSync(file).toString("base64")}`;
}

async function museStill(p: CloudCreds, prompt: string, refs: StillRefs, aspect?: string, kind?: string) {
  const files = refList(refs, kind).map(seedreamRefJpeg);
  const body: Record<string, unknown> = {
    model: p.model || "muse-image-1.0",
    prompt,
    n: 1,
    size: gptImageSize(aspect),
    output_format: "png",
    response_format: "b64_json",
  };
  const path = files.length ? "images/edits" : "images/generations";
  if (files.length) {
    body.images = files.map((f) => ({ image_url: museDataUrl(f) }));
  }
  const res = await fetch(`${p.baseURL.replace(/\/$/, "")}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${p.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(360_000),
  });
  const json = (await res.json().catch(() => ({}))) as Parameters<typeof bufferFromResponse>[0] & {
    message?: string;
    error?: { message?: string };
  };
  if (!res.ok) throw cloudHttpError(res.status, json.error?.message || json.message || `Muse HTTP ${res.status}`);
  return bufferFromResponse(json);
}

function qwenImage30Size(aspect?: string) {
  return gptImageSize(aspect).replace("x", "*");
}

function qwenImage30Root(baseURL: string) {
  const raw = baseURL.replace(/\/$/, "");
  if (raw.includes("compatible-mode")) return "https://dashscope-intl.aliyuncs.com/api/v1";
  if (raw.endsWith("/v1")) return raw;
  return `${raw}/api/v1`.replace(/\/api\/v1\/api\/v1$/, "/api/v1");
}

async function qwenImage30Still(p: CloudCreds, prompt: string, refs: StillRefs, aspect?: string, kind?: string) {
  const files = refList(refs, kind).map(seedreamRefJpeg).slice(0, 3);
  const content: Record<string, string>[] = files.map((f) => ({ image: museDataUrl(f) }));
  content.push({ text: prompt });
  const res = await fetch(`${qwenImage30Root(p.baseURL)}/services/aigc/multimodal-generation/generation`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${p.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: p.model || "qwen-image-3.0-pro",
      input: { messages: [{ role: "user", content }] },
      parameters: {
        n: 1,
        size: qwenImage30Size(aspect),
        watermark: false,
        prompt_extend: files.length === 0,
        enable_thinking: true,
      },
    }),
    signal: AbortSignal.timeout(600_000),
  });
  const json = (await res.json().catch(() => ({}))) as {
    code?: string;
    message?: string;
    output?: { choices?: { message?: { content?: { image?: string }[] } }[] };
  };
  if (!res.ok || json.code) {
    throw cloudHttpError(res.status, json.message || json.code || `Qwen Image 3.0 HTTP ${res.status}`);
  }
  const url = json.output?.choices?.[0]?.message?.content?.find((c) => c.image)?.image;
  if (!url) throw new Error("Qwen Image 3.0 returned no image");
  const img = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!img.ok) throw new Error(`Qwen Image 3.0 download HTTP ${img.status}`);
  return Buffer.from(await img.arrayBuffer());
}

function walkInlineImage(node: unknown): Buffer | undefined {
  if (!node || typeof node !== "object") return undefined;
  const row = node as Record<string, unknown>;
  const inline = (row.inline_data || row.inlineData) as { data?: string; mime_type?: string } | undefined;
  if (inline?.data) return Buffer.from(inline.data, "base64");
  for (const v of Object.values(row)) {
    if (Array.isArray(v)) {
      for (const item of v) {
        const hit = walkInlineImage(item);
        if (hit) return hit;
      }
    } else if (v && typeof v === "object") {
      const hit = walkInlineImage(v);
      if (hit) return hit;
    }
  }
  return undefined;
}

async function nanoBananaStill(p: CloudCreds, prompt: string, refs: StillRefs, kind?: string) {
  const parts: Record<string, unknown>[] = [{ text: prompt }];
  for (const file of refList(refs, kind)) {
    parts.push({
      inline_data: {
        mime_type: mimeOf(file),
        data: fs.readFileSync(file).toString("base64"),
      },
    });
  }
  const res = await fetch(`${p.baseURL}/v1beta/models/${encodeURIComponent(p.model)}:generateContent`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${p.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    }),
    signal: AbortSignal.timeout(360_000),
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
    message?: string;
  };
  if (!res.ok) throw cloudHttpError(res.status, json.error?.message || json.message || `Nano Banana HTTP ${res.status}`);
  const buf = walkInlineImage(json);
  if (!buf) throw new Error("Nano Banana returned no image");
  return buf;
}

export async function cloudTxt2Img(engineId: string, prompt: string, reference?: string | StillRefs, opts?: GenerateStillOpts) {
  if (!isCloudImageEngine(engineId)) {
    throw new Error(`not a cloud stills engine: ${engineId}`);
  }
  const refs = normalizeStillRefs(reference);
  const aspect = opts?.aspect;
  return withCloudFailover(engineId, (hit) => {
    if (isTryOnEngine(engineId)) return runVirtualTryOn(hit, engineId, prompt, refs, aspect);
    if (engineId === "grok-imagine") return grokImagineStill(hit, prompt, refs, aspect, opts);
    if (engineId === "marketing-studio-image") return higgsfieldMarketingStill(hit, prompt, refs, aspect);
    if (engineId === "gpt-image-2" || engineId === "gpt-image-2.5" || engineId === "gpt-image-2.5-flare") {
      return openaiStill(hit, prompt, refs, aspect, opts?.kind);
    }
    if (isSeedreamEngine(engineId)) return seedreamStill(hit, prompt, refs, aspect, engineId, opts?.kind);
    if (engineId === "muse-image-1.0") return museStill(hit, prompt, refs, aspect, opts?.kind);
    if (engineId === "qwen-image-3.0") return qwenImage30Still(hit, prompt, refs, aspect, opts?.kind);
    return nanoBananaStill(hit, prompt, refs, opts?.kind);
  });
}

export function isCloudImageEngine(id: string) {
  return (
    id === "gpt-image-2" ||
    id === "gpt-image-2.5" ||
    id === "gpt-image-2.5-flare" ||
    id === "grok-imagine" ||
    id === "grok-imagine-tryon" ||
    id === "kling-image-omni" ||
    id === "kolors-virtual-try-on" ||
    id === "marketing-studio-image" ||
    id === "seedream-5-pro" ||
    id === "seedream-5-lite" ||
    id === "seedream-4-5" ||
    id === "muse-image-1.0" ||
    id === "qwen-image-3.0" ||
    id === "nano-banana"
  );
}
