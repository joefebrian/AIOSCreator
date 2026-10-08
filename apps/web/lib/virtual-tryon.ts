import fs from "node:fs";
import { cloudHttpError, type CloudCreds } from "./cloud-router";
import { grokImagineTryOn } from "./grok-imagine";
import { normalizeStillRefs, type StillRefs } from "./still-refs";

export const TRYON_ENGINE_IDS = ["kling-image-omni", "grok-imagine-tryon", "kolors-virtual-try-on"] as const;

/** Edit Product chips. Dedicated try-on APIs plus I2I stills (person + SKU). */
export const PRODUCT_TRYON_ENGINE_IDS = [
  "muse-image-1.0",
  "qwen-image-3.0",
  "kling-image-omni",
  "grok-imagine-tryon",
  "qwen-image-2.1",
] as const;

export function isTryOnEngine(id: string) {
  return id === "kling-image-omni" || id === "grok-imagine-tryon" || id === "kolors-virtual-try-on";
}

export function isProductTryOnEngine(id: string) {
  return (PRODUCT_TRYON_ENGINE_IDS as readonly string[]).includes(id);
}

export const TRYON_PROMPT =
  "Virtual try-on. Image 1 is the person — keep her exact face, hair, skin, body, pose, crop, and lighting. Image 2 is one SKU photo, or a sheet of several SKU photos in a grid. Put EVERY distinct product from Image 2 onto her in the same still. Do not apply only the first cell. Clothes/outfit from the sheet replace her original clothes (color, cut, fabric, logos); fabric drapes naturally. Earrings, necklace, bracelet, ring, watch, glasses: ADD each item in the correct place (ears, neck, wrist, finger, face). Bag: she wears or holds it. Shoes: on her feet. Hat/cap/sunglasses: on her head/face. Keep identity. Ignore other models in the SKU photos. Photoreal.";

function personAndGarment(refs: StillRefs) {
  const person = refs.face || refs.scene;
  const garment = refs.body && refs.body !== person ? refs.body : refs.scene && refs.scene !== person ? refs.scene : undefined;
  if (!person || !fs.existsSync(person)) throw new Error("Virtual try-on needs a person still.");
  if (!garment || !fs.existsSync(garment)) throw new Error("Virtual try-on needs a garment / SKU photo.");
  return { person, garment };
}

function rawB64(file: string) {
  return fs.readFileSync(file).toString("base64");
}

function klingMsg(json: { message?: string; code?: number }, status: number) {
  if (typeof json.message === "string" && json.message.trim()) return json.message;
  return `Kling try-on HTTP ${status}`;
}

type KlingTryOnTask = {
  code?: number;
  message?: string;
  data?: {
    task_id?: string;
    task_status?: string;
    task_status_msg?: string;
    task_result?: { images?: { url?: string }[] };
  };
};

function omniAspect(aspect?: string) {
  const a = (aspect || "9:16").trim();
  if (a === "4:5") return "3:4";
  if (["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "21:9"].includes(a)) return a;
  return "9:16";
}

function omniPrompt(prompt: string) {
  const raw = (prompt || "").replace(/\nAvoid:\s*[\s\S]*$/i, "").trim() || TRYON_PROMPT;
  if (/<<<image_1>>>/i.test(raw)) return raw.slice(0, 2500);
  return raw
    .replace(/\bImage 1\b/gi, "<<<image_1>>>")
    .replace(/\bImage 2\b/gi, "<<<image_2>>>")
    .slice(0, 2500);
}

async function klingOmniOnce(p: CloudCreds, person: string, garment: string, aspect?: string, prompt?: string) {
  const root = p.baseURL.replace(/\/$/, "");
  const created = await fetch(`${root}/v1/images/omni-image`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${p.apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "CreatorOS/1.0",
    },
    body: JSON.stringify({
      model_name: p.model || "kling-v3-omni",
      prompt: omniPrompt(prompt || ""),
      image_list: [{ image: rawB64(person) }, { image: rawB64(garment) }],
      resolution: "2k",
      n: 1,
      result_type: "single",
      aspect_ratio: omniAspect(aspect),
      watermark_info: { enabled: false },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const createdJson = (await created.json().catch(() => ({}))) as KlingTryOnTask;
  if (!created.ok || (typeof createdJson.code === "number" && createdJson.code !== 0)) {
    throw cloudHttpError(created.status, klingMsg(createdJson, created.status));
  }
  const taskId = createdJson.data?.task_id;
  if (!taskId) throw new Error("Kling Image Omni returned no task id");
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const res = await fetch(`${root}/v1/images/omni-image/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${p.apiKey}`, "User-Agent": "CreatorOS/1.0" },
      signal: AbortSignal.timeout(30_000),
    });
    const json = (await res.json().catch(() => ({}))) as KlingTryOnTask;
    if (!res.ok || (typeof json.code === "number" && json.code !== 0)) {
      throw cloudHttpError(res.status, klingMsg(json, res.status));
    }
    const status = (json.data?.task_status || "").toLowerCase();
    if (status === "submitted" || status === "processing" || status === "pending" || !status) continue;
    if (status !== "succeed" && status !== "succeeded") {
      throw new Error(json.data?.task_status_msg || json.message || `Kling Image Omni ${status}`);
    }
    const url = json.data?.task_result?.images?.[0]?.url;
    if (!url) throw new Error("Kling Image Omni succeeded with no image");
    const dl = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!dl.ok) throw new Error(`Kling Image Omni download HTTP ${dl.status}`);
    return Buffer.from(await dl.arrayBuffer());
  }
  throw new Error("Kling Image Omni timed out");
}

async function kolorsOnce(p: CloudCreds, person: string, garment: string) {
  const root = p.baseURL.replace(/\/$/, "");
  const created = await fetch(`${root}/v1/images/kolors-virtual-try-on`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${p.apiKey}`,
      "Content-Type": "application/json",
      "User-Agent": "CreatorOS/1.0",
    },
    body: JSON.stringify({
      model_name: "kolors-virtual-try-on-v1-5",
      human_image: rawB64(person),
      cloth_image: rawB64(garment),
    }),
    signal: AbortSignal.timeout(120_000),
  });
  const createdJson = (await created.json().catch(() => ({}))) as KlingTryOnTask;
  if (!created.ok || (typeof createdJson.code === "number" && createdJson.code !== 0)) {
    throw cloudHttpError(created.status, klingMsg(createdJson, created.status));
  }
  const taskId = createdJson.data?.task_id;
  if (!taskId) throw new Error("Kolors try-on returned no task id");
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 4000));
    const res = await fetch(`${root}/v1/images/kolors-virtual-try-on/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${p.apiKey}`, "User-Agent": "CreatorOS/1.0" },
      signal: AbortSignal.timeout(30_000),
    });
    const json = (await res.json().catch(() => ({}))) as KlingTryOnTask;
    if (!res.ok || (typeof json.code === "number" && json.code !== 0)) {
      throw cloudHttpError(res.status, klingMsg(json, res.status));
    }
    const status = (json.data?.task_status || "").toLowerCase();
    if (status === "submitted" || status === "processing" || status === "pending" || !status) continue;
    if (status !== "succeed" && status !== "succeeded") {
      throw new Error(json.data?.task_status_msg || json.message || `Kolors try-on ${status}`);
    }
    const url = json.data?.task_result?.images?.[0]?.url;
    if (!url) throw new Error("Kolors try-on succeeded with no image");
    const dl = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!dl.ok) throw new Error(`Kolors download HTTP ${dl.status}`);
    return Buffer.from(await dl.arrayBuffer());
  }
  throw new Error("Kolors virtual try-on timed out");
}

export async function runVirtualTryOn(
  hit: CloudCreds,
  engineId: string,
  prompt: string,
  reference?: string | StillRefs,
  aspect?: string,
) {
  const { person, garment } = personAndGarment(normalizeStillRefs(reference));
  if (engineId === "grok-imagine-tryon") return grokImagineTryOn(hit, person, garment, aspect, prompt);
  if (engineId === "kling-image-omni") return klingOmniOnce(hit, person, garment, aspect, prompt);
  return kolorsOnce(hit, person, garment);
}
