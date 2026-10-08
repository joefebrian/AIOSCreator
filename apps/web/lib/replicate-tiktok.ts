import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import OpenAI from "openai";
import { getCharacter } from "./characters";
import { grokImagineVideoI2V, cometSeedanceI2V } from "./cloud-video";
import { dashscopeWan3Video } from "./dashscope-wan";
import { imageEngine, listEngines } from "./engines";
import { extractPromptStills } from "./media-frame";
import { llmConfig } from "./llm";
import { mediaUrlToPath, motionFile, uploadFile } from "./paths";
import { activeProvider } from "./providers";
import { importResearchUrl } from "./research-import";
import { assertSpendAllowed } from "./spend-cap";
import { generateStill } from "./stills";
import { characterStillRefs } from "./still-refs";
import { insertJob, updateJob } from "./store";
import { PAID_I2V_ENGINES } from "./paid-i2v";

export type PaidI2vId = (typeof PAID_I2V_ENGINES)[number];

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const MAX_SCENES = 3;

export function isPaidI2v(id: string): id is PaidI2vId {
  return (PAID_I2V_ENGINES as readonly string[]).includes(id);
}

export function pickPaidI2v(preferred?: string): PaidI2vId {
  const engines = listEngines();
  const ready = (id: string) => engines.find((e) => e.id === id)?.status === "ready";
  if (preferred && isPaidI2v(preferred) && ready(preferred)) return preferred;
  for (const id of PAID_I2V_ENGINES) {
    if (ready(id)) return id;
  }
  throw new Error("No paid I2V key. Add Grok Imagine Video, Wan 3.0, or Seedance in Settings.");
}

function visionCfg() {
  const saved = activeProvider();
  const dash = saved && /dashscope|aliyuncs/i.test(saved.baseURL) ? saved : undefined;
  if (dash) {
    return { apiKey: saved!.apiKey, baseURL: saved!.baseURL.replace(/\/$/, ""), model: "qwen3-vl-plus", headers: saved!.headers };
  }
  const c = llmConfig();
  return {
    apiKey: c.apiKey,
    baseURL: c.baseURL.replace(/\/$/, ""),
    model: /dashscope|aliyuncs/i.test(c.baseURL) ? "qwen3-vl-plus" : c.model,
    headers: c.headers,
  };
}

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(FFMPEG, args, { windowsHide: true });
    let err = "";
    child.stderr.on("data", (d: Buffer) => {
      err += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed (${code}). ${err.slice(-300)}`));
    });
  });
}

async function stitchMp4(paths: string[], dest: string) {
  const dir = path.dirname(dest);
  fs.mkdirSync(dir, { recursive: true });
  const list = path.join(dir, `concat-${randomUUID()}.txt`);
  fs.writeFileSync(list, paths.map((p) => `file '${p.replace(/\\/g, "/")}'`).join("\n"));
  try {
    await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", dest]);
  } catch {
    await runFfmpeg(["-y", "-f", "concat", "-safe", "0", "-i", list, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", dest]);
  } finally {
    fs.unlink(list, () => undefined);
  }
  if (!fs.existsSync(dest) || fs.statSync(dest).size < 8000) throw new Error("stitch produced an empty file");
}

export type Feasibility = {
  ok: boolean;
  reason: string;
  onePerson: boolean;
  vertical: boolean;
  talking: boolean;
  extraPeople: boolean;
  durationSec: number;
};

type SceneBeat = { start: number; end: number; stillPrompt: string; motionPrompt: string };

async function judgeAndScenes(videoPath: string, durationSec: number, framePaths: string[]): Promise<{
  feasibility: Feasibility;
  scenes: SceneBeat[];
}> {
  const cfg = visionCfg();
  if (!cfg.apiKey) throw new Error("Need an LLM/VL key (Settings) to judge the reference clip.");
  assertSpendAllowed({ model: cfg.model, tokens: 8000 });
  const client = new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL, defaultHeaders: cfg.headers });
  const parts: OpenAI.Chat.ChatCompletionContentPart[] = [
    {
      type: "text",
      text: `Judge if this UGC clip can be remade as 9:16 I2V with ONE locked adult character. Duration ~${durationSec.toFixed(1)}s.
Return ONLY JSON:
{"ok":true,"reason":"...","onePerson":true,"vertical":true,"talking":false,"extraPeople":false,"scenes":[{"start":0,"end":4,"stillPrompt":"photoreal still, pose wardrobe scene lighting, no real names","motionPrompt":"small camera/body motion for I2V"}]}
Rules: ok=false if extra people, no human, duration<2, or not 9:16-ish. Max ${MAX_SCENES} scenes covering the window. stillPrompt is a first-frame, motionPrompt is motion only.`,
    },
  ];
  for (const file of framePaths.slice(0, 6)) {
    const b64 = fs.readFileSync(file).toString("base64");
    const mime = file.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
    parts.push({ type: "image_url", image_url: { url: `data:${mime};base64,${b64}` } });
  }
  const res = await client.chat.completions.create({
    model: cfg.model,
    temperature: 0.2,
    messages: [{ role: "user", content: parts }],
  });
  const raw = res.choices[0]?.message?.content || "";
  const json = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(json) as Record<string, unknown>;
  } catch {
    throw new Error("Feasibility judge returned non-JSON.");
  }
  const extraPeople = Boolean(parsed.extraPeople);
  const onePerson = parsed.onePerson !== false;
  const vertical = parsed.vertical !== false;
  const ok =
    parsed.ok !== false &&
    onePerson &&
    !extraPeople &&
    durationSec >= 2 &&
    vertical;
  const scenesIn = Array.isArray(parsed.scenes) ? parsed.scenes : [];
  const scenes: SceneBeat[] = [];
  for (const row of scenesIn.slice(0, MAX_SCENES)) {
    if (!row || typeof row !== "object") continue;
    const r = row as { start?: number; end?: number; stillPrompt?: string; motionPrompt?: string };
    const stillPrompt = String(r.stillPrompt || "").trim();
    if (!stillPrompt) continue;
    scenes.push({
      start: Number(r.start) || 0,
      end: Number(r.end) || 0,
      stillPrompt,
      motionPrompt: String(r.motionPrompt || "Subtle natural motion, keep identity and wardrobe.").trim(),
    });
  }
  if (ok && !scenes.length) {
    scenes.push({
      start: 0,
      end: durationSec,
      stillPrompt: "Photoreal 9:16 UGC still of the locked character, same vibe as the reference, one person.",
      motionPrompt: "Subtle natural motion, keep identity.",
    });
  }
  return {
    feasibility: {
      ok,
      reason: String(parsed.reason || (ok ? "ok" : "not a single-person vertical UGC clip")),
      onePerson,
      vertical,
      talking: Boolean(parsed.talking),
      extraPeople,
      durationSec,
    },
    scenes,
  };
}

async function paidI2v(engineId: PaidI2vId, stillPath: string, prompt: string, seconds: number, jobId: string) {
  const sec = Math.min(engineId === "grok-imagine-video" ? 15 : 12, Math.max(4, Math.round(seconds)));
  if (engineId === "grok-imagine-video") return grokImagineVideoI2V(stillPath, prompt, sec);
  if (engineId === "seedance-2-5" || engineId === "seedance-2-0") return cometSeedanceI2V(stillPath, prompt, sec, engineId);
  return dashscopeWan3Video({
    prompt,
    stillPath,
    durationSec: sec,
    sound: true,
    engineId,
    jobId,
  });
}

export async function runReplicateTiktok(opts: {
  characterId: string;
  sourceUrl: string;
  engineId?: string;
  draftOnly?: boolean;
  variation?: string;
  jobId: string;
}) {
  const row = getCharacter(opts.characterId);
  if (!row?.identityUrl) throw new Error("Lock identity first.");
  const videoEngine = pickPaidI2v(opts.engineId);
  const stillEngine = imageEngine().id;
  const onProg = (label: string) => updateJob(opts.jobId, { progress: label });

  onProg("Downloading reference…");
  const imported = await importResearchUrl(opts.sourceUrl);
  if (imported.kind !== "video") throw new Error("Need a TikTok / video URL, not a still.");
  const videoPath = mediaUrlToPath(imported.mediaUrl);

  onProg("Extracting frames…");
  const tmp = path.join(os.tmpdir(), `creatoros-rep-${randomUUID()}`);
  fs.mkdirSync(tmp, { recursive: true });
  try {
    const extracted = await extractPromptStills(videoPath, tmp);
    onProg("Judging feasibility…");
    const judged = await judgeAndScenes(videoPath, extracted.windowSec || extracted.durationSec, extracted.paths);
    if (!judged.feasibility.ok) {
      throw new Error(`Not replicable: ${judged.feasibility.reason}`);
    }
    const n = Math.max(1, Math.min(MAX_SCENES, judged.scenes.length));
    const scenes = judged.scenes.slice(0, n);
    const per = Math.min(8, Math.max(4, Math.round((extracted.windowSec || 8) / n)));
    const refs = characterStillRefs(row);
    const stillPaths: string[] = [];
    const variation = (opts.variation || "").trim();

    for (const [i, scene] of scenes.entries()) {
      onProg(`Still ${i + 1}/${scenes.length} (${stillEngine})…`);
      const prompt = [
        scene.stillPrompt,
        variation,
        "One person only. Photoreal. 9:16. Keep the locked character identity.",
      ]
        .filter(Boolean)
        .join(" ");
      const { buffer } = await generateStill(prompt, refs, stillEngine, {
        kind: "restyle",
        aspect: "9:16",
      });
      const stillId = `${opts.jobId}-s${i + 1}`;
      const dest = uploadFile(stillId, "png");
      fs.writeFileSync(dest, buffer);
      stillPaths.push(dest);
      insertJob({
        id: randomUUID(),
        module: "production",
        kind: "image",
        input: prompt.slice(0, 240),
        status: "completed",
        mediaPath: dest,
        mediaUrl: `/api/media/uploads/${stillId}.png`,
        model: stillEngine,
        characterId: opts.characterId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    if (opts.draftOnly) {
      const first = stillPaths[0];
      const id = path.basename(first);
      updateJob(opts.jobId, {
        status: "completed",
        progress: `Draft ${stillPaths.length} stills. Run again without stills-only to pay for I2V.`,
        mediaPath: first,
        mediaUrl: `/api/media/uploads/${id}`,
        model: stillEngine,
      });
      return;
    }

    const clipPaths: string[] = [];
    for (const [i, scene] of scenes.entries()) {
      onProg(`Paid I2V ${i + 1}/${scenes.length} (${videoEngine})…`);
      const buf = await paidI2v(videoEngine, stillPaths[i]!, scene.motionPrompt, per, opts.jobId);
      const clipPath = path.join(tmp, `c${i}.mp4`);
      fs.writeFileSync(clipPath, buf);
      clipPaths.push(clipPath);
    }
    onProg("Stitching…");
    const out = motionFile(opts.jobId);
    await stitchMp4(clipPaths, out);
    updateJob(opts.jobId, {
      status: "completed",
      progress: "",
      mediaPath: out,
      mediaUrl: `/api/media/motion/${opts.jobId}.mp4`,
      model: videoEngine,
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}
