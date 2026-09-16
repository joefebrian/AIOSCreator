import fs from "node:fs";
import { cloudHttpError, withCloudFailover, type CloudCreds } from "./cloud-router";
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

function refList(refs: StillRefs): string[] {
  const out: string[] = [];
  for (const p of [refs.scene, refs.face, refs.body]) {
    if (p && fs.existsSync(p) && !out.includes(p)) out.push(p);
  }
  return out;
}

async function openaiStill(p: CloudCreds, prompt: string, refs: StillRefs, aspect?: string) {
  const size = gptImageSize(aspect);
  const files = refList(refs);
  if (files.length) {
    const form = new FormData();
    form.append("model", p.model);
    form.append("prompt", prompt);
    form.append("size", size);
    form.append("quality", "high");
    for (const [i, file] of files.entries()) {
      const blob = new Blob([new Uint8Array(fs.readFileSync(file))], { type: mimeOf(file) });
      form.append("image", blob, i === 0 ? "face.png" : i === 1 ? "body.png" : `ref-${i}.png`);
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
      quality: "high",
      output_format: "png",
    }),
    signal: AbortSignal.timeout(360_000),
  });
  const json = (await res.json().catch(() => ({}))) as Parameters<typeof bufferFromResponse>[0];
  if (!res.ok) throw cloudHttpError(res.status, json.error?.message || `GPT Image HTTP ${res.status}`);
  return bufferFromResponse(json);
}

async function seedreamStill(p: CloudCreds, prompt: string, refs: StillRefs, aspect?: string) {
  const comet = p.provider === "comet" || p.baseURL.includes("cometapi.com");
  const hensun = p.provider === "hensun" || p.baseURL.includes("hensunai.com");
  const body: Record<string, unknown> = {
    model: p.model,
    prompt,
    size: comet || hensun ? "2K" : seedreamSize(aspect),
    watermark: false,
    response_format: "url",
  };
  const files = refList(refs);
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

async function nanoBananaStill(p: CloudCreds, prompt: string, refs: StillRefs) {
  const parts: Record<string, unknown>[] = [{ text: prompt }];
  for (const file of refList(refs)) {
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
    if (engineId === "gpt-image-2" || engineId === "gpt-image-2.5") return openaiStill(hit, prompt, refs, aspect);
    if (engineId === "seedream-5-pro" || engineId === "seedream-4-5") return seedreamStill(hit, prompt, refs, aspect);
    return nanoBananaStill(hit, prompt, refs);
  });
}

export function isCloudImageEngine(id: string) {
  return (
    id === "gpt-image-2" ||
    id === "gpt-image-2.5" ||
    id === "seedream-5-pro" ||
    id === "seedream-4-5" ||
    id === "nano-banana"
  );
}
