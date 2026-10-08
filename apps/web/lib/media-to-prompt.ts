import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import OpenAI from "openai";
import { logCloudUsage } from "./cloud-usage";
import { llmConfig } from "./llm";
import { extractPromptStills, stillForVision } from "./media-frame";
import { isVideoMediaUrl } from "./media-kind";
import { formatMegaChecklist, type MegaBeat } from "./mega-prompt";
import { videoProcedureNote } from "./research-flow";
import { mediaUrlToPath, uploadFile } from "./paths";
import { activeProvider } from "./providers";
import { assertSpendAllowed } from "./spend-cap";

export type MediaToPrompt = {
  kind: "image" | "video";
  imagePrompt: string;
  motionPrompt: string;
  durationSec?: number;
  windowSec?: number;
  windowStartSec?: number;
  trimmed?: boolean;
  tooShort?: boolean;
  note?: string;
  firstFrameUrl?: string;
  megaPrompt?: string;
  model: string;
  tokens: number;
};

/** Vision client. DashScope accounts use qwen3-vl-plus even when the pinned chat model is qwen3.7-plus. */
export function configuredVisionClient() {
  return visionConfig();
}

function visionConfig() {
  const saved = activeProvider();
  const dash = saved && /dashscope|aliyuncs/i.test(saved.baseURL) ? saved : undefined;
  const cfg = dash
    ? {
        apiKey: saved!.apiKey,
        baseURL: saved!.baseURL.replace(/\/$/, ""),
        model: "qwen3-vl-plus",
        headers: saved!.headers,
        name: saved!.name,
      }
    : (() => {
        const c = llmConfig();
        return {
          apiKey: c.apiKey,
          baseURL: c.baseURL.replace(/\/$/, ""),
          model: /dashscope|aliyuncs/i.test(c.baseURL) ? "qwen3-vl-plus" : c.model,
          headers: c.headers,
          name: c.name,
        };
      })();
  return cfg;
}

function mimeOf(file: string) {
  const lower = file.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/png";
}

async function dataUrl(file: string) {
  const tmp = path.join(os.tmpdir(), `creatoros-vl-${randomUUID()}.jpg`);
  try {
    const src = await stillForVision(file, tmp);
    const buf = fs.readFileSync(src);
    return `data:${mimeOf(src)};base64,${buf.toString("base64")}`;
  } finally {
    fs.unlink(tmp, () => undefined);
  }
}

function asBeats(raw: unknown): MegaBeat[] | string | undefined {
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (!Array.isArray(raw)) return undefined;
  const beats: MegaBeat[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as { start?: number; end?: number; t?: string; beat?: string; action?: string };
    const beat = String(r.beat || r.action || "").trim();
    if (!beat) continue;
    beats.push({ start: Number(r.start) || 0, end: Number(r.end) || 0, beat });
  }
  return beats.length ? beats : undefined;
}

function parsePack(raw: string) {
  const text = raw
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    const j = JSON.parse(text) as Record<string, unknown>;
    const imagePrompt = String(j.imagePrompt || j.prompt || "").trim();
    const motionPrompt = String(j.motionPrompt || "").trim();
    if (imagePrompt) {
      return {
        imagePrompt,
        motionPrompt,
        lipSync: String(j.lipSync || "").trim() || undefined,
        performance: asBeats(j.performance),
        camera: String(j.camera || "").trim() || undefined,
        audio: String(j.audio || "").trim() || undefined,
        negative: String(j.negative || "").trim() || undefined,
        singing: Boolean(j.singing),
        speaking: Boolean(j.speaking),
      };
    }
  } catch {
    /* fall through */
  }
  const img = /IMAGE PROMPT:\s*([\s\S]*?)(?=MOTION PROMPT:|$)/i.exec(text);
  const mot = /MOTION PROMPT:\s*([\s\S]*)$/i.exec(text);
  return {
    imagePrompt: (img?.[1] || text).trim(),
    motionPrompt: (mot?.[1] || "").trim(),
    lipSync: undefined,
    performance: undefined,
    camera: undefined,
    audio: undefined,
    negative: undefined,
    singing: undefined,
    speaking: undefined,
  };
}

const SYSTEM = `You write generation prompts for CreatorOS (photoreal UGC stills and I2V).
Return ONLY JSON.
For a STILL:
{"imagePrompt":"...","motionPrompt":""}
imagePrompt = pose, wardrobe, scene, lighting, lens. No real-person names. No markdown.

For a VIDEO, also fill the motion CHECKLIST (what you see in the frames, not a new story):
{"imagePrompt":"...","motionPrompt":"...","singing":false,"speaking":false,"lipSync":"...","performance":[{"start":0,"end":1.5,"beat":"..."},{"start":1.5,"end":3.5,"beat":"..."},{"start":3.5,"end":5,"beat":"..."}],"camera":"...","audio":"...","negative":"..."}
Rules for video checklist:
- performance beats must cover the window in seconds. Small real motion only.
- lipSync: describe mouth vs audio. If silent, say no speech.
- camera: locked-off unless the clip clearly pushes/pans.
- audio: attached clip audio + room tone, or silent.
- negative: desync lips, identity/wardrobe drift, extra people, shake, text.
Do not invent extra people. Adult fictional OK.`;

export async function mediaToPrompt(url: string): Promise<MediaToPrompt> {
  const abs = mediaUrlToPath(url);
  if (!fs.existsSync(abs)) throw new Error("media not on disk");
  const video = isVideoMediaUrl(url) || /\.(mp4|webm|mov)$/i.test(abs);
  const cfg = visionConfig();
  assertSpendAllowed({ model: cfg.model, tokens: 12_000 });

  const tmpDir = path.join(os.tmpdir(), `creatoros-vl-${randomUUID()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const stills: string[] = [];
  const stillTimes: number[] = [];
  let durationSec = 0;
  let windowSec = 0;
  let windowStartSec = 0;
  let trimmed = false;
  let tooShort = false;
  let firstFrameUrl: string | undefined;
  try {
    if (video) {
      const extracted = await extractPromptStills(abs, tmpDir);
      durationSec = extracted.durationSec;
      windowSec = extracted.windowSec;
      windowStartSec = extracted.windowStartSec;
      trimmed = extracted.trimmed;
      tooShort = extracted.tooShort;
      stills.push(...extracted.paths);
      stillTimes.push(...extracted.times);
      const first = extracted.paths[0];
      if (first) {
        const id = randomUUID();
        const dest = uploadFile(id, "jpg");
        fs.copyFileSync(first, dest);
        firstFrameUrl = `/api/media/uploads/${id}.jpg`;
      }
    } else {
      stills.push(abs);
    }

    const parts: OpenAI.Chat.ChatCompletionContentPart[] = [];
    for (const [i, file] of stills.entries()) {
      const t = stillTimes[i];
      const label = video
        ? t != null
          ? `frame at ${t.toFixed(1)}s`
          : i === 0
            ? "first frame"
            : i === stills.length - 1
              ? "last frame"
              : `frame ${i + 1}`
        : "still";
      parts.push({
        type: "image_url",
        image_url: { url: await dataUrl(file) },
      });
      parts.push({ type: "text", text: `(${label})` });
    }
    parts.push({
      type: "text",
      text: video
        ? `This is a ${durationSec.toFixed(1)}s video. Checklist covers ${windowSec.toFixed(1)}s starting at ${windowStartSec.toFixed(1)}s${trimmed ? " (clip longer than 30s — first 30s only)" : " (full clip)"}. Frames are timestamped. performance beats must cover 0–${windowSec.toFixed(1)}s. JSON only.`
        : "This is a still. Write imagePrompt for a photoreal regenerate of this shot. motionPrompt empty. JSON only.",
    });

    const client = new OpenAI({
      apiKey: cfg.apiKey,
      baseURL: cfg.baseURL,
      timeout: 180_000,
      defaultHeaders: cfg.headers,
    });
    const t0 = Date.now();
    let completion: OpenAI.Chat.ChatCompletion;
    try {
      completion = await client.chat.completions.create({
        model: cfg.model,
        temperature: 0.4,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: parts },
        ],
        ...( /dashscope|aliyuncs/i.test(cfg.baseURL) ? { extra_body: { enable_thinking: false } } : {}),
      });
    } catch (err) {
      const msg =
        err instanceof OpenAI.APIError
          ? `${err.status} ${err.message}`
          : err instanceof Error
            ? err.message
            : String(err);
      logCloudUsage({
        at: new Date().toISOString(),
        accountId: "dashscope",
        providerId: "dashscope",
        model: cfg.model,
        ok: false,
        ms: Date.now() - t0,
        baseURL: cfg.baseURL,
        kind: "script",
        error: msg.slice(0, 160),
      });
      throw new Error(msg);
    }

    const tokens = (completion.usage?.prompt_tokens || 0) + (completion.usage?.completion_tokens || 0);
    const raw = completion.choices[0]?.message?.content ?? "";
    const pack = parsePack(raw);
    if (!pack.imagePrompt) {
      logCloudUsage({
        at: new Date().toISOString(),
        accountId: "dashscope",
        providerId: "dashscope",
        model: cfg.model,
        ok: false,
        ms: Date.now() - t0,
        baseURL: cfg.baseURL,
        kind: "script",
        tokens,
        error: "empty prompt",
      });
      throw new Error("Vision model returned an empty prompt");
    }
    logCloudUsage({
      at: new Date().toISOString(),
      accountId: "dashscope",
      providerId: /dashscope|aliyuncs/i.test(cfg.baseURL) ? "dashscope" : "openrouter",
      model: cfg.model,
      ok: true,
      ms: Date.now() - t0,
      baseURL: cfg.baseURL,
      kind: "script",
      tokens,
      units: tokens,
      unit: "token",
    });
    const note = video
      ? videoProcedureNote({ durationSec, windowSec, trimmed, tooShort })
      : "Still — one frame to Qwen VL. No mega checklist (video only).";
    const megaPrompt = video
      ? formatMegaChecklist({
          imagePrompt: pack.imagePrompt,
          motionPrompt: pack.motionPrompt,
          durationSec: windowSec || durationSec,
          kind: "video",
          singing: pack.singing,
          speaking: pack.speaking,
          lipSync: pack.lipSync,
          performance: pack.performance,
          camera: pack.camera,
          audio: pack.audio,
          negative: pack.negative,
        })
      : undefined;
    return {
      kind: video ? "video" : "image",
      imagePrompt: pack.imagePrompt,
      motionPrompt: pack.motionPrompt,
      durationSec: video ? durationSec : undefined,
      windowSec: video ? windowSec : undefined,
      windowStartSec: video ? windowStartSec : undefined,
      trimmed: video ? trimmed : undefined,
      tooShort: video ? tooShort : undefined,
      note,
      firstFrameUrl,
      megaPrompt,
      model: cfg.model,
      tokens,
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
