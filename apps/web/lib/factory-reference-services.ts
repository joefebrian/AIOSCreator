import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { speakNarration } from "./factory-voice";
import { interiorFrameSec, referenceFrameFile } from "./factory-scene-review";
import { logCloudUsage } from "./cloud-usage";
import { FACTORY_ASTRA_MODEL, factoryScriptLlm, llmClient } from "./llm";
import { dataRoot } from "./paths";
import { assertSpendAllowed } from "./spend-cap";
import { readFactoryV2, saveVoiceMeasurement, type FactoryPlanBeat, type FactoryProduction } from "./ugc-factory-v2";

export type RewriteScene = {
  beatId: string;
  spoken: string | null;
  onScreen: string | null;
  action: string;
  sourceSpeech?: string;
  targetLabel?: string;
};

export type RewriteProposal = {
  mode: "recreate" | "revamp";
  modelId: string;
  mocked?: boolean;
  scenes: RewriteScene[];
};

function clean(value: unknown) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text || null;
}

function buildPrompt(input: {
  mode: "recreate" | "revamp";
  locale: string;
  market: string;
  productName: string;
  delivery: string;
  direction?: string;
  scenes: RewriteScene[];
}) {
  const modeLine = input.mode === "recreate"
    ? "Recreate the reference. Keep the hook's job, the beat order, the pace, and the visual style. Same-language English keeps usable wording and cadence. Do not replace every line with a generic product instruction."
    : "Revamp the wording and angle. Keep the scene structure and visual style unless the operator direction explicitly asks for a larger change.";
  return [
    `Product: ${input.productName}. Market ${input.market}. Spoken language ${input.locale}. Delivery ${input.delivery}.`,
    modeLine,
    "The source speaker is not the new actor. Do not copy that person's name or present their skin result or past use as the new actor's own experience. Adapt the intent of those lines.",
    "Speech, on-screen caption, and visual action must agree. A caption may be shorter than the speech. Do not leave a source-testimonial caption on a different spoken line.",
    "A scene with no speech stays silent. Silence is a hold, not a missing line.",
    "Action text uses the target window. Do not write the source video's clock into the action.",
    "Do not add a price, a measurement, or a product claim that is not already in the current line.",
    input.direction ? `Operator direction: ${input.direction}` : "",
    `Scenes: ${JSON.stringify(input.scenes)}`,
    'Return ONLY JSON {"scenes":[{"beatId":string,"spoken":string|null,"onScreen":string|null,"action":string}]}. Include every scene id once. Do not add scenes.',
  ].filter(Boolean).join("\n");
}

async function astraRewrite(prompt: string) {
  const cfg = factoryScriptLlm(FACTORY_ASTRA_MODEL);
  if (cfg.model !== FACTORY_ASTRA_MODEL) throw new Error(`Recreation writing is gpt-6-astra. The configured script model is ${cfg.model}.`);
  assertSpendAllowed({ model: cfg.model, tokens: 2500 });
  const client = llmClient(cfg);
  const started = Date.now();
  let completion;
  try {
    completion = await client.chat.completions.create({
      model: cfg.model,
      reasoning_effort: "low",
      messages: [
        { role: "system", content: "You rewrite one UGC adaptation. Return JSON only. You do not render video and you do not save the draft." },
        { role: "user", content: prompt },
      ],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "The script service did not return a proposal.";
    logCloudUsage({
      at: new Date().toISOString(),
      accountId: "Script_UGC",
      providerId: "openai",
      model: "Script_UGC",
      ok: false,
      ms: Date.now() - started,
      baseURL: cfg.baseURL,
      kind: "Script_UGC",
      tokens: 0,
      units: 0,
      unit: "token",
      error: message.slice(0, 160),
    });
    throw new Error(message);
  }
  const usage = completion.usage;
  const inputTokens = usage?.prompt_tokens || 0;
  const outputTokens = usage?.completion_tokens || 0;
  logCloudUsage({
    at: new Date().toISOString(),
    accountId: "Script_UGC",
    providerId: "openai",
    model: "Script_UGC",
    ok: true,
    ms: Date.now() - started,
    baseURL: cfg.baseURL,
    kind: "Script_UGC",
    tokens: inputTokens + outputTokens,
    units: inputTokens + outputTokens,
    unit: "token",
    actualUsd: Math.round(((inputTokens / 1_000_000) * 10 + (outputTokens / 1_000_000) * 50) * 1_000_000) / 1_000_000,
  });
  return (completion.choices[0]?.message?.content || "").replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
}

/** Asks the configured script model for a proposal. Does not write the production. */
export async function proposeReferenceRewrite(input: {
  mode: "recreate" | "revamp";
  locale: string;
  market: string;
  productName: string;
  delivery: string;
  direction?: string;
  beatId?: string | null;
  scenes: RewriteScene[];
}, writer?: (prompt: string) => Promise<string>): Promise<RewriteProposal> {
  if (input.mode !== "recreate" && input.mode !== "revamp") throw new Error("Choose recreate or revamp.");
  if (!input.scenes.length) throw new Error("There is no scene to rewrite.");
  const scope = input.beatId ? input.scenes.filter((scene) => scene.beatId === input.beatId) : input.scenes;
  if (!scope.length) throw new Error("That scene is not in this plan.");
  const write = writer || astraRewrite;
  let raw = "";
  try {
    raw = await write(buildPrompt({ ...input, scenes: scope }));
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : "The script service did not return a proposal.");
  }
  let parsed: { scenes?: { beatId?: string; spoken?: unknown; onScreen?: unknown; action?: unknown }[] };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    throw new Error("The script service returned an unreadable proposal. Nothing was saved.");
  }
  const byId = new Map((parsed.scenes || []).map((scene) => [String(scene.beatId || ""), scene]));
  const scenes = scope.map((scene) => {
    const next = byId.get(scene.beatId);
    if (!next) throw new Error("The script service left out a scene. Nothing was saved.");
    const action = clean(next.action);
    if (!action) throw new Error("The script service left out an action. Nothing was saved.");
    return { beatId: scene.beatId, spoken: clean(next.spoken), onScreen: clean(next.onScreen), action, sourceSpeech: scene.sourceSpeech, targetLabel: scene.targetLabel };
  });
  return { mode: input.mode, modelId: writer ? "injected-writer" : FACTORY_ASTRA_MODEL, scenes };
}

function probeSeconds(file: string) {
  const bin = fs.existsSync("C:/ffmpeg/bin/ffprobe.exe") ? "C:/ffmpeg/bin/ffprobe.exe" : "ffprobe";
  return new Promise<number>((resolve, reject) => {
    const child = spawn(bin, ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file], { windowsHide: true });
    let out = "";
    child.stdout.on("data", (chunk) => { out += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      const value = Number(out.trim());
      if (code === 0 && value > 0) resolve(Math.round(value * 10) / 10);
      else reject(new Error("The voice duration could not be measured."));
    });
  });
}

function voiceOf(production: FactoryProduction, beat: FactoryPlanBeat) {
  return production.voiceId || beat.audioMode?.replace(/^(voiceover|creator-led)\s+/, "") || "";
}

function deliveryOf(production: FactoryProduction, beat: FactoryPlanBeat) {
  if (production.deliveryMode === "creator-led" || production.deliveryMode === "voiceover") return production.deliveryMode;
  return beat.audioMode?.startsWith("creator-led") ? "creator-led" as const : "voiceover" as const;
}

/** Plays a matching cached take, or synthesizes one. A line that is not the saved speech stays temporary. */
export async function previewAdaptedVoice(input: {
  productionId: string;
  expectedRevision: number;
  beatId: string;
  spoken: string;
  voice: string;
  delivery: "creator-led" | "voiceover";
  root?: string;
}, deps?: { speak?: (text: string, voice: string) => Promise<{ file: string; seconds: number }> }) {
  const db = readFactoryV2();
  const production = db.productions.find((row) => row.id === input.productionId);
  if (!production?.plan) throw new Error("There is no plan to preview.");
  if (production.revision !== input.expectedRevision) throw new Error("This draft changed. Reload it before previewing the voice.");
  const beat = production.plan.beats.find((row) => row.id === input.beatId);
  if (!beat) throw new Error("Scene not found.");
  const spoken = input.spoken.replace(/\s+/g, " ").trim();
  if (!spoken) return { silent: true, temporary: false, url: null as string | null, seconds: 0, revision: production.revision, current: true };
  const savedVoice = voiceOf(production, beat);
  const savedDelivery = deliveryOf(production, beat);
  const sameLine = spoken === (beat.spoken || "").replace(/\s+/g, " ").trim();
  if (sameLine && input.voice === savedVoice && input.delivery === savedDelivery && beat.timing === "measured" && beat.voiceUrl && beat.estimatedSec != null) {
    return { silent: false, temporary: false, url: beat.voiceUrl, seconds: beat.estimatedSec, revision: production.revision, current: true };
  }
  const root = input.root || dataRoot();
  const hash = createHash("sha256").update(`${input.voice}\n${input.delivery}\n${spoken}`).digest("hex").slice(0, 24);
  const folder = path.join(root, "media", "ugc-factory-vo", "_cache");
  fs.mkdirSync(folder, { recursive: true });
  const dest = path.join(folder, `${hash}.mp3`);
  const meta = `${dest}.json`;
  let seconds = 0;
  const cached = fs.existsSync(dest) && fs.statSync(dest).size >= 500 && fs.existsSync(meta);
  if (cached) {
    seconds = Number(JSON.parse(fs.readFileSync(meta, "utf8")).seconds);
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("The saved voice measurement is unreadable.");
  } else {
    const speak = deps?.speak || (async (text: string, voice: string) => {
      const spokenFile = await speakNarration(text, voice);
      try {
        const measured = await probeSeconds(spokenFile.file);
        fs.copyFileSync(spokenFile.file, dest);
        return { file: dest, seconds: measured };
      } finally {
        fs.rmSync(spokenFile.dir, { recursive: true, force: true });
      }
    });
    const taken = await speak(spoken, input.voice);
    if (!taken.file || !fs.existsSync(taken.file)) throw new Error("The voice service did not return audio.");
    seconds = taken.seconds;
    if (!Number.isFinite(seconds) || seconds <= 0) throw new Error("The voice duration could not be measured.");
    if (path.resolve(taken.file) !== path.resolve(dest)) fs.copyFileSync(taken.file, dest);
    fs.writeFileSync(meta, JSON.stringify({ seconds }));
  }
  if (!fs.existsSync(dest) || fs.statSync(dest).size < 100) throw new Error("The voice preview file is empty.");
  const url = `/api/media/ugc-factory-vo/_cache/${hash}.mp3`;
  if (!sameLine) return { silent: false, temporary: true, url, seconds, revision: production.revision, current: true };
  const saved = saveVoiceMeasurement(input.productionId, input.expectedRevision, input.beatId, {
    url,
    seconds,
    voice: input.voice,
    delivery: input.delivery,
  });
  return { silent: false, temporary: false, url, seconds, revision: saved.revision, current: true };
}

function runFfmpeg(args: string[]) {
  const bin = fs.existsSync("C:/ffmpeg/bin/ffmpeg.exe") ? "C:/ffmpeg/bin/ffmpeg.exe" : "ffmpeg";
  return new Promise<void>((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let err = "";
    child.stderr.on("data", (chunk) => { err += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err.slice(-240) || "ffmpeg failed"));
    });
  });
}

/** Extracts one interior frame from the cached reference video. Does not call a vision model. */
export async function ensureReferenceFrame(input: {
  mediaUrl: string;
  analysisVersion: number;
  startSec: number;
  endSec: number;
  root?: string;
}) {
  const fileId = input.mediaUrl.split("/").pop()?.replace(/\.[a-z0-9]+$/i, "") || "";
  if (!fileId) return { error: "The reference video is not on file." };
  const root = input.root || dataRoot();
  const key = referenceFrameFile(fileId, input.analysisVersion, input.startSec, input.endSec);
  const dest = path.join(root, "media", "ugc-reference-frames", key);
  if (fs.existsSync(dest) && fs.statSync(dest).size > 800) return { url: `/api/media/ugc-reference-frames/${key}` };
  const src = path.join(root, "media", "ugc-references", `${fileId}.mp4`);
  if (!fs.existsSync(src)) return { error: "Frame unavailable. The cached video is not on this machine." };
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const at = interiorFrameSec(input.startSec, input.endSec);
  try {
    await runFfmpeg(["-y", "-ss", String(at), "-i", src, "-frames:v", "1", "-q:v", "2", dest]);
  } catch {
    return { error: "Frame unavailable for this source window." };
  }
  if (!fs.existsSync(dest) || fs.statSync(dest).size < 800) return { error: "Frame unavailable for this source window." };
  return { url: `/api/media/ugc-reference-frames/${key}` };
}
