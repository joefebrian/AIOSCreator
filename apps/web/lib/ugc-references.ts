import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import OpenAI from "openai";
import { logCloudUsage } from "./cloud-usage";
import { extractPromptStills, stillForVision } from "./media-frame";
import { configuredVisionClient } from "./media-to-prompt";
import { dataRoot, ensureDataDirs, mediaUrlToPath } from "./paths";
import { spendStatus } from "./spend-cap";
import {
  assertUrlShape,
  extractSpeechAudio,
  measurePlayableVideo,
  registerStoredUpload,
  startUgcReferenceImport,
  type ImportAsset,
  type ImportJob,
} from "./ugc-reference-import";
import { canAcquirePost, referenceIdentity } from "./ugc-reference-preview";
import { addExtractedReferenceFact, CATALOG_MARKETS, readSharedCatalog, type FactProvenance } from "./shared-catalog";
import { getProduct } from "./products";

export { referenceIdentity };

export type ReferenceRelation = "SAME_PRODUCT" | "SAME_CATEGORY" | "STYLE_ONLY";
export type ReferenceStatus = "link_saved" | "media_saved" | "analyzing" | "analyzed" | "unavailable" | "failed";
export type ReferenceSource = "match" | "url" | "upload";
export type TranscriptStatus = "ok" | "no-audio" | "no-speech" | "unavailable";

export type SourceFact = {
  statement: string;
  startSec: number | null;
  endSec: number | null;
  source: "speech" | "on-screen";
  reviewStatus: "UNREVIEWED";
  factId?: string | null;
};

export type CreativePattern = {
  hook: string | null;
  beats: string[];
  demo: string | null;
  objections: string[];
  proof: string | null;
  cta: string | null;
  pacing: string | null;
};

export type UgcAnalysis = {
  version: number | null;
  reviewed: boolean;
  transcript: { startSec: number; endSec: number; text: string; observed: boolean }[];
  transcriptStatus: TranscriptStatus;
  beats: { startSec: number | null; endSec: number | null; purpose: string; productAction: string | null; observed: boolean }[];
  hook: { text: string; observed: boolean } | null;
  framing: { text: string; observed: boolean } | null;
  cuts: { text: string; observed: boolean } | null;
  audio: "unknown" | "no-audio" | "present" | "silent";
  cta: { text: string; observed: boolean } | null;
  candidateFacts: SourceFact[];
  pattern: CreativePattern;
  coverage: "full" | "partial";
  unknown: string[];
  reason: string | null;
  providers: { speech: string | null; shots: string | null; vision: string | null };
  failures: string[];
};

export type UgcReference = {
  id: string;
  productId: string;
  skuId: string;
  platform: string;
  postId: string | null;
  url: string | null;
  dedupeKey: string;
  creator: string | null;
  publishedAt: string | null;
  market: string | null;
  locale: string | null;
  relation: ReferenceRelation | null;
  relationBasis?: string | null;
  source: ReferenceSource;
  mediaUrl: string | null;
  fileHash: string | null;
  assetId?: string | null;
  posterUrl?: string | null;
  durationSec?: number | null;
  width?: number | null;
  height?: number | null;
  hasAudio?: boolean | null;
  status: ReferenceStatus;
  failure: string | null;
  analysis: UgcAnalysis | null;
  history?: UgcAnalysis[];
  createdAt: string;
  updatedAt: string;
};

export type ReviewedReferencePattern = {
  referenceId: string;
  analysisVersion: number;
  relation: ReferenceRelation | null;
  hook: string | null;
  beats: string[];
  audio: string;
  cta: string | null;
  unknown: string[];
};

type Db = { references: UgcReference[] };

const UNKNOWN_ANALYSIS = ["transcript", "scenes", "hook", "product actions", "framing", "cuts", "audio", "cta"];

let rootOverride: string | null = null;

export function setUgcReferencesRootForTests(dir: string | null) {
  rootOverride = dir;
}

function now() {
  return new Date().toISOString();
}

function filePath() {
  const root = rootOverride || dataRoot();
  if (rootOverride) fs.mkdirSync(path.join(root, "db"), { recursive: true });
  else ensureDataDirs();
  return path.join(root, "db", "ugc-references.json");
}

function readDb(): Db {
  const file = filePath();
  if (!fs.existsSync(file)) return { references: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Db;
    return { references: Array.isArray(raw.references) ? raw.references : [] };
  } catch {
    return { references: [] };
  }
}

function writeDb(db: Db) {
  fs.writeFileSync(filePath(), JSON.stringify(db, null, 2), "utf8");
}

function assertWorkspace(workspaceId?: string) {
  if (workspaceId && workspaceId !== "local") throw new Error("This workspace cannot use that catalog id.");
}

function assertSku(productId: string, skuId: string) {
  if (!getProduct(productId)) throw new Error("product not found");
  const db = readSharedCatalog();
  const sku = db.skus.find((row) => row.id === skuId && row.legacyProductId === productId);
  if (!sku) throw new Error("SKU not found");
  return db;
}

function cleanCreator(value: string | null | undefined) {
  const creator = (value || "").replace(/\s+/g, " ").trim().replace(/^@/, "");
  if (creator.length > 80) throw new Error("Keep the creator name under 80 characters.");
  return creator || null;
}

function cleanDate(value: string | null | undefined) {
  const date = (value || "").trim();
  if (!date) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("Use a date as YYYY-MM-DD.");
  return date;
}

function cleanMarket(market: string | null | undefined, locale: string | null | undefined) {
  const marketId = (market || "").trim();
  const localeId = (locale || "").trim();
  if (!marketId && !localeId) return { market: null, locale: null };
  const row = CATALOG_MARKETS.find((item) => item.id === marketId);
  if (!row) throw new Error("Market must be Indonesia, Malaysia, Singapore, Thailand, or the United States.");
  if (localeId && !row.locales.includes(localeId as (typeof row.locales)[number])) throw new Error(`${row.label} does not use ${localeId}.`);
  return { market: row.id, locale: localeId || null };
}

function existingForAnotherProduct(db: Db, key: string, productId: string) {
  const other = db.references.find((row) => row.dedupeKey === key && row.productId !== productId);
  if (other) throw new Error("This reference is already saved on another product. It was not copied into a new SKU.");
}

export function listUgcReferences(productId: string) {
  return readDb()
    .references.filter((row) => row.productId === productId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function addUgcReferenceUrl(input: {
  workspaceId?: string;
  productId: string;
  skuId: string;
  url: string;
  creator?: string | null;
  publishedAt?: string | null;
  market?: string | null;
  locale?: string | null;
  source?: ReferenceSource;
}) {
  assertWorkspace(input.workspaceId);
  assertSku(input.productId, input.skuId);
  const identity = referenceIdentity(input.url);
  const creator = cleanCreator(input.creator);
  const publishedAt = cleanDate(input.publishedAt);
  const place = cleanMarket(input.market, input.locale);
  const db = readDb();
  existingForAnotherProduct(db, identity.dedupeKey, input.productId);
  const found = db.references.find((row) => row.dedupeKey === identity.dedupeKey);
  if (found) {
    let changed = false;
    if (!found.creator && creator) {
      found.creator = creator;
      changed = true;
    }
    if (!found.publishedAt && publishedAt) {
      found.publishedAt = publishedAt;
      changed = true;
    }
    if (!found.market && place.market) {
      found.market = place.market;
      changed = true;
    }
    if (!found.locale && place.locale) {
      found.locale = place.locale;
      changed = true;
    }
    if (changed) {
      found.updatedAt = now();
      writeDb(db);
    }
    return { reference: found, created: false };
  }
  const stamp = now();
  const reference: UgcReference = {
    id: randomUUID(),
    productId: input.productId,
    skuId: input.skuId,
    platform: identity.platform,
    postId: identity.postId,
    url: identity.url,
    dedupeKey: identity.dedupeKey,
    creator,
    publishedAt,
    market: place.market,
    locale: place.locale,
    relation: null,
    source: input.source === "match" ? "match" : "url",
    mediaUrl: null,
    fileHash: null,
    status: "link_saved",
    failure: null,
    analysis: null,
    createdAt: stamp,
    updatedAt: stamp,
  };
  db.references.unshift(reference);
  writeDb(db);
  return { reference, created: true };
}

function referenceVideoFile(mediaUrl: string) {
  if (!mediaUrl.startsWith("/api/media/ugc-references/")) throw new Error("Upload the video through this product.");
  const abs = path.resolve(mediaUrlToPath(mediaUrl));
  const root = path.resolve(rootOverride || dataRoot(), "media", "ugc-references");
  const rel = path.relative(root, abs);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("Upload the video through this product.");
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) throw new Error("The video file is missing.");
  return abs;
}

export function fileHashOf(abs: string) {
  return createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
}

export function attachUgcVideo(input: { workspaceId?: string; productId: string; skuId: string; mediaUrl: string; referenceId?: string | null }) {
  assertWorkspace(input.workspaceId);
  assertSku(input.productId, input.skuId);
  const abs = referenceVideoFile(input.mediaUrl);
  const fileHash = fileHashOf(abs);
  const key = `file:${fileHash}`;
  const db = readDb();
  const hashOwner = db.references.find((row) => row.fileHash === fileHash || row.dedupeKey === key);
  if (hashOwner && hashOwner.productId !== input.productId) throw new Error("This video is already saved on another product. It was not copied into a new SKU.");
  const stamp = now();
  if (input.referenceId) {
    const row = db.references.find((item) => item.id === input.referenceId && item.productId === input.productId);
    if (!row) throw new Error("Reference not found");
    if (hashOwner && hashOwner.id !== row.id) throw new Error("This video is already saved. It was not added again.");
    if (row.fileHash === fileHash && row.mediaUrl === input.mediaUrl) return { reference: row, created: false };
    row.mediaUrl = input.mediaUrl;
    row.fileHash = fileHash;
    row.status = "media_saved";
    row.failure = null;
    row.analysis = null;
    row.updatedAt = stamp;
    writeDb(db);
    return { reference: row, created: false };
  }
  if (hashOwner) return { reference: hashOwner, created: false };
  const reference: UgcReference = {
    id: randomUUID(),
    productId: input.productId,
    skuId: input.skuId,
    platform: "upload",
    postId: null,
    url: null,
    dedupeKey: key,
    creator: null,
    publishedAt: null,
    market: null,
    locale: null,
    relation: null,
    source: "upload",
    mediaUrl: input.mediaUrl,
    fileHash,
    status: "media_saved",
    failure: null,
    analysis: null,
    createdAt: stamp,
    updatedAt: stamp,
  };
  db.references.unshift(reference);
  writeDb(db);
  return { reference, created: true };
}

function cleanRelation(relation: string | null | undefined, confirmed?: boolean): ReferenceRelation | null {
  const value = (relation || "").trim();
  if (!value || value === "UNREVIEWED") return null;
  if (value === "SAME_PRODUCT" && !confirmed) throw new Error("Confirm this is the same physical product before saving that relation.");
  if (value !== "SAME_PRODUCT" && value !== "SAME_CATEGORY" && value !== "STYLE_ONLY") throw new Error("Unknown reference relation.");
  return value;
}

export function addReferenceFromImport(input: {
  workspaceId?: string;
  productId: string;
  skuId: string;
  mediaUrl: string;
  fileHash: string;
  sourceUrl: string;
  platform: string;
  postId: string | null;
  creator?: string | null;
  publishedAt?: string | null;
  posterUrl?: string | null;
  durationSec?: number | null;
  width?: number | null;
  height?: number | null;
  hasAudio?: boolean | null;
  assetId: string;
  relation?: string | null;
  confirmed?: boolean;
  market?: string | null;
  locale?: string | null;
  source?: ReferenceSource;
}) {
  assertWorkspace(input.workspaceId);
  assertSku(input.productId, input.skuId);
  const relation = cleanRelation(input.relation, input.confirmed);
  const identity = referenceIdentity(input.sourceUrl);
  const abs = referenceVideoFile(input.mediaUrl);
  const fileHash = fileHashOf(abs);
  if (fileHash !== input.fileHash) throw new Error("The stored video does not match this download.");
  const creator = cleanCreator(input.creator);
  const publishedAt = cleanDate(input.publishedAt);
  const place = cleanMarket(input.market, input.locale);
  const db = readDb();
  existingForAnotherProduct(db, identity.dedupeKey, input.productId);
  const hashOwner = db.references.find((row) => row.fileHash === fileHash && row.id !== db.references.find((item) => item.dedupeKey === identity.dedupeKey && item.productId === input.productId)?.id);
  if (hashOwner && hashOwner.productId !== input.productId) throw new Error("This video is already saved on another product. It was not copied into a new SKU.");
  const stamp = now();
  const found = db.references.find((row) => row.dedupeKey === identity.dedupeKey && row.productId === input.productId);
  if (found) {
    const sameMedia = found.mediaUrl === input.mediaUrl && found.fileHash === fileHash;
    const sameRelation = found.relation === relation;
    const samePlace = found.market === place.market && found.locale === place.locale;
    if (sameMedia && sameRelation && samePlace && found.assetId === input.assetId) return { reference: found, created: false };
    if (!sameMedia) {
      found.analysis = null;
      found.status = "media_saved";
      found.failure = null;
    } else if (found.status === "link_saved" || found.status === "failed") {
      found.status = "media_saved";
      found.failure = null;
    }
    found.mediaUrl = input.mediaUrl;
    found.fileHash = fileHash;
    found.assetId = input.assetId;
    found.posterUrl = input.posterUrl || null;
    found.durationSec = input.durationSec ?? null;
    found.width = input.width ?? null;
    found.height = input.height ?? null;
    found.hasAudio = input.hasAudio ?? null;
    found.relation = relation;
    found.market = place.market;
    found.locale = place.locale;
    if (!found.creator && creator) found.creator = creator;
    if (!found.publishedAt && publishedAt) found.publishedAt = publishedAt;
    found.updatedAt = stamp;
    writeDb(db);
    return { reference: found, created: false };
  }
  const reference: UgcReference = {
    id: randomUUID(),
    productId: input.productId,
    skuId: input.skuId,
    platform: identity.platform,
    postId: identity.postId,
    url: identity.url,
    dedupeKey: identity.dedupeKey,
    creator,
    publishedAt,
    market: place.market,
    locale: place.locale,
    relation,
    source: input.source === "upload" ? "upload" : input.source === "match" ? "match" : "url",
    mediaUrl: input.mediaUrl,
    fileHash,
    assetId: input.assetId,
    posterUrl: input.posterUrl || null,
    durationSec: input.durationSec ?? null,
    width: input.width ?? null,
    height: input.height ?? null,
    hasAudio: input.hasAudio ?? null,
    status: "media_saved",
    failure: null,
    analysis: null,
    createdAt: stamp,
    updatedAt: stamp,
  };
  db.references.unshift(reference);
  writeDb(db);
  return { reference, created: true };
}

export function setUgcReferenceRelation(input: { workspaceId?: string; productId: string; referenceId: string; relation: string; confirmed?: boolean; basis?: string }) {
  assertWorkspace(input.workspaceId);
  if (!getProduct(input.productId)) throw new Error("product not found");
  const relation = input.relation.trim();
  const basis = (input.basis || "").replace(/\s+/g, " ").trim();
  if (relation === "SAME_PRODUCT" && !input.confirmed) throw new Error("Confirm this is the same physical product before saving that relation.");
  if (relation === "SAME_PRODUCT" && basis.length < 8) throw new Error("Write what you compared on this physical SKU.");
  if (relation && relation !== "UNREVIEWED" && relation !== "SAME_PRODUCT" && relation !== "SAME_CATEGORY" && relation !== "STYLE_ONLY") {
    throw new Error("Unknown reference relation.");
  }
  const db = readDb();
  const row = db.references.find((item) => item.id === input.referenceId && item.productId === input.productId);
  if (!row) throw new Error("Reference not found");
  row.relation = !relation || relation === "UNREVIEWED" ? null : relation;
  row.relationBasis = relation === "SAME_PRODUCT" ? basis : null;
  row.updatedAt = now();
  writeDb(db);
  return row;
}

const CTA = /\b(buy|shop|order|tap|click|link in bio|follow|comment|share|subscribe|use code|check (it|this) out|grab yours)\b/i;

function blankAnalysis(reason: string, extra?: Partial<UgcAnalysis>): UgcAnalysis {
  return {
    version: null,
    reviewed: false,
    transcript: [],
    transcriptStatus: "unavailable",
    beats: [],
    hook: null,
    framing: null,
    cuts: null,
    audio: "unknown",
    cta: null,
    candidateFacts: [],
    pattern: { hook: null, beats: [], demo: null, objections: [], proof: null, cta: null, pacing: null },
    coverage: "partial",
    unknown: UNKNOWN_ANALYSIS,
    reason,
    providers: { speech: null, shots: null, vision: null },
    failures: [],
    ...extra,
  };
}

const VISION_SYSTEM = `You observe one reference video from timestamped frames.
Return JSON only:
{"framing":null,"actions":[{"start":0,"end":1,"action":""}],"onScreen":[{"start":0,"text":""}],"demo":null,"objections":[],"proof":null,"cta":null,"pacing":null}
Rules:
- Describe only what is visible in the frames.
- onScreen text must be a verbatim quote of text you can read. Otherwise use [].
- actions describe visible motion only. Use the frame timestamps.
- Use null or [] when a field is not visible.
- Do not invent spoken words, a sales script, product claims, or a personal story.`;

type VisionNote = {
  framing: string | null;
  actions: { start: number; end: number; action: string }[];
  onScreen: { start: number; text: string }[];
  demo: string | null;
  objections: string[];
  proof: string | null;
  cta: string | null;
  pacing: string | null;
};

function emptyVision(): VisionNote {
  return { framing: null, actions: [], onScreen: [], demo: null, objections: [], proof: null, cta: null, pacing: null };
}

function asVision(raw: string): VisionNote | null {
  const text = raw.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const textOf = (value: unknown) => {
      const clean = String(value || "").replace(/\s+/g, " ").trim();
      return clean && !/^null$/i.test(clean) ? clean.slice(0, 240) : null;
    };
    const actions = Array.isArray(parsed.actions) ? parsed.actions.flatMap((row) => {
      if (!row || typeof row !== "object") return [];
      const item = row as { start?: number; end?: number; action?: string };
      const action = textOf(item.action);
      if (!action) return [];
      return [{ start: Number(item.start) || 0, end: Number(item.end) || 0, action }];
    }).slice(0, 12) : [];
    const onScreen = Array.isArray(parsed.onScreen) ? parsed.onScreen.flatMap((row) => {
      if (!row || typeof row !== "object") return [];
      const item = row as { start?: number; text?: string };
      const quote = textOf(item.text);
      if (!quote) return [];
      return [{ start: Number(item.start) || 0, text: quote }];
    }).slice(0, 8) : [];
    const objections = Array.isArray(parsed.objections) ? parsed.objections.map((row) => textOf(row)).filter((row): row is string => Boolean(row)).slice(0, 6) : [];
    return {
      framing: textOf(parsed.framing),
      actions,
      onScreen,
      demo: textOf(parsed.demo),
      objections,
      proof: textOf(parsed.proof),
      cta: textOf(parsed.cta),
      pacing: textOf(parsed.pacing),
    };
  } catch {
    return null;
  }
}

async function observeStoredFrames(file: string, durationSec: number): Promise<{ note: VisionNote; provider: string | null; error: string | null }> {
  const client = (() => {
    try {
      return configuredVisionClient();
    } catch (err) {
      return { error: err instanceof Error ? err.message : "No vision client is configured." };
    }
  })();
  if ("error" in client) return { note: emptyVision(), provider: null, error: client.error };
  if (!client.apiKey || /openrouter\/free/i.test(client.model) || client.model === "qwen3.7-plus") {
    const active = client.model || "none";
    return {
      note: emptyVision(),
      provider: null,
      error: `The active model is ${active}. Visual frames use qwen3-vl-plus on the DashScope account. That client was not selected.`,
    };
  }
  const cap = spendStatus(0.02);
  if (cap.blocked) return { note: emptyVision(), provider: client.model, error: cap.message };
  const tmp = path.join(os.tmpdir(), `ugc-vision-${randomUUID()}`);
  fs.mkdirSync(tmp, { recursive: true });
  const started = Date.now();
  try {
    const extracted = await extractPromptStills(file, tmp);
    const parts: OpenAI.Chat.ChatCompletionContentPart[] = [];
    for (let i = 0; i < extracted.paths.length; i += 1) {
      const jpeg = await stillForVision(extracted.paths[i], path.join(tmp, `v${i}.jpg`));
      const buf = fs.readFileSync(jpeg);
      parts.push({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${buf.toString("base64")}` } });
      parts.push({ type: "text", text: `frame at ${(extracted.times[i] || 0).toFixed(1)}s` });
    }
    parts.push({ type: "text", text: `The clip is ${durationSec.toFixed(1)}s. JSON only.` });
    const openai = new OpenAI({ apiKey: client.apiKey, baseURL: client.baseURL, timeout: 120_000, defaultHeaders: client.headers });
    const completion = await openai.chat.completions.create({
      model: client.model,
      temperature: 0.1,
      messages: [
        { role: "system", content: VISION_SYSTEM },
        { role: "user", content: parts },
      ],
      ...(/dashscope|aliyuncs/i.test(client.baseURL) ? { extra_body: { enable_thinking: false } } : {}),
    } as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming);
    const raw = completion.choices[0]?.message?.content || "";
    const note = asVision(raw);
    const tokens = (completion.usage?.prompt_tokens || 0) + (completion.usage?.completion_tokens || 0);
    if (!note) {
      logCloudUsage({
        at: new Date().toISOString(),
        accountId: "dashscope",
        providerId: "dashscope",
        model: client.model,
        ok: false,
        ms: Date.now() - started,
        baseURL: client.baseURL,
        kind: "ugc-reference-vision",
        tokens,
        error: "empty vision json",
      });
      return { note: emptyVision(), provider: client.model, error: `${client.model} returned no visual observations.` };
    }
    logCloudUsage({
      at: new Date().toISOString(),
      accountId: "dashscope",
      providerId: "dashscope",
      model: client.model,
      ok: true,
      ms: Date.now() - started,
      baseURL: client.baseURL,
      kind: "ugc-reference-vision",
      tokens,
      units: tokens,
      unit: "token",
    });
    return { note, provider: client.model, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Visual analysis failed.";
    return { note: emptyVision(), provider: client.model, error: message.replace(/sk-[A-Za-z0-9_-]+/g, "sk-…").slice(0, 240) };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

type SpeechSegment = { startSec: number; endSec: number; text: string };

async function transcribeStoredAudio(file: string, durationSec: number): Promise<{ segments: SpeechSegment[]; provider: string | null; error: string | null }> {
  const key = process.env.OPENAI_API_KEY || "";
  if (!key) return { segments: [], provider: null, error: "No speech service is configured." };
  const cap = spendStatus(Math.max(0.01, (durationSec / 60) * 0.006));
  if (cap.blocked) return { segments: [], provider: null, error: cap.message };
  let audio = "";
  const started = Date.now();
  try {
    audio = await extractSpeechAudio(file);
    const bytes = fs.readFileSync(audio);
    const form = new FormData();
    form.set("file", new Blob([bytes], { type: "audio/mp4" }), "speech.m4a");
    form.set("model", "whisper-1");
    form.set("response_format", "verbose_json");
    form.append("timestamp_granularities[]", "segment");
    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
    const raw = await response.text();
    if (!response.ok) {
      const message = raw.replace(/sk-[A-Za-z0-9_-]+/g, "sk-…").replace(/\s+/g, " ").trim().slice(0, 240) || `Speech service returned HTTP ${response.status}.`;
      logCloudUsage({
        at: new Date().toISOString(),
        accountId: "openai",
        providerId: "openai",
        model: "whisper-1",
        ok: false,
        status: response.status,
        ms: Date.now() - started,
        baseURL: "https://api.openai.com/v1",
        kind: "ugc-reference-asr",
        durationSec,
        error: message,
      });
      return { segments: [], provider: "whisper-1", error: message };
    }
    const parsed = JSON.parse(raw) as { segments?: { start?: number; end?: number; text?: string }[] };
    const segments = (parsed.segments || [])
      .map((segment) => ({
        startSec: Number(segment.start) || 0,
        endSec: Number(segment.end) || 0,
        text: String(segment.text || "").replace(/\s+/g, " ").trim(),
      }))
      .filter((segment) => segment.text)
      .slice(0, 40);
    logCloudUsage({
      at: new Date().toISOString(),
      accountId: "openai",
      providerId: "openai",
      model: "whisper-1",
      ok: true,
      status: response.status,
      ms: Date.now() - started,
      baseURL: "https://api.openai.com/v1",
      kind: "ugc-reference-asr",
      durationSec,
      estimatedUsd: Math.round((durationSec / 60) * 0.006 * 10_000) / 10_000,
    });
    return { segments, provider: "whisper-1", error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Speech service failed.";
    return { segments: [], provider: "whisper-1", error: message.replace(/sk-[A-Za-z0-9_-]+/g, "sk-…").slice(0, 240) };
  } finally {
    if (audio) fs.rmSync(audio, { force: true });
  }
}

function shotBeats(cuts: number[] | null, durationSec: number) {
  if (!cuts) return [];
  const points = [0, ...cuts.filter((time) => time > 0 && time < durationSec), durationSec];
  const beats: UgcAnalysis["beats"] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const startSec = Math.round(points[i] * 1000) / 1000;
    const endSec = Math.round(points[i + 1] * 1000) / 1000;
    if (endSec - startSec < 0.05) continue;
    beats.push({ startSec, endSec, purpose: "Measured shot", productAction: null, observed: true });
  }
  return beats;
}

export function applyImportedAsset(job: Pick<ImportJob, "productId" | "dedupeKey">, asset: Pick<ImportAsset, "mediaUrl" | "fileHash" | "id" | "posterUrl" | "durationSec" | "width" | "height" | "hasAudio" | "creator" | "publishedAt">) {
  const db = readDb();
  const row = db.references.find((item) => item.productId === job.productId && item.dedupeKey === job.dedupeKey);
  if (!row) return null;
  const sameMedia = row.mediaUrl === asset.mediaUrl && row.fileHash === asset.fileHash && row.assetId === asset.id;
  if (!sameMedia) {
    row.analysis = null;
    row.status = "media_saved";
    row.failure = null;
  } else if (row.status === "link_saved" || row.status === "failed") {
    row.status = "media_saved";
    row.failure = null;
  }
  row.mediaUrl = asset.mediaUrl;
  row.fileHash = asset.fileHash;
  row.assetId = asset.id;
  row.posterUrl = asset.posterUrl;
  row.durationSec = asset.durationSec;
  row.width = asset.width;
  row.height = asset.height;
  row.hasAudio = asset.hasAudio;
  if (!row.creator && asset.creator) row.creator = asset.creator;
  if (!row.publishedAt && asset.publishedAt) row.publishedAt = asset.publishedAt;
  row.updatedAt = now();
  writeDb(db);
  return row;
}

export function failImportedReference(productId: string, dedupeKey: string, error: string) {
  const db = readDb();
  const row = db.references.find((item) => item.productId === productId && item.dedupeKey === dedupeKey);
  if (!row || row.status === "media_saved") return row || null;
  row.status = "failed";
  row.failure = error.slice(0, 400);
  row.updatedAt = now();
  writeDb(db);
  return row;
}

export async function importAndPreviewReference(input: {
  workspaceId?: string;
  productId: string;
  skuId: string;
  url: string;
  creator?: string | null;
  publishedAt?: string | null;
  market?: string | null;
  locale?: string | null;
  source?: ReferenceSource;
}) {
  assertWorkspace(input.workspaceId);
  const identity = referenceIdentity(input.url || "");
  assertUrlShape(identity.url);
  if (!canAcquirePost(identity.url)) throw new Error("This link has no post id. Add the post URL.");
  const saved = addUgcReferenceUrl(input);
  const started = await startUgcReferenceImport({
    workspaceId: input.workspaceId,
    productId: input.productId,
    skuId: input.skuId,
    url: identity.url,
    creator: input.creator,
    publishedAt: input.publishedAt,
    retry: true,
  });
  if (started.job.status === "ready" && started.asset) applyImportedAsset(started.job, started.asset);
  if (started.job.status === "failed") failImportedReference(input.productId, started.job.dedupeKey, started.job.error || "Download failed.");
  const reference = listUgcReferences(input.productId).find((row) => row.id === saved.reference.id) || saved.reference;
  return { reference, created: saved.created, job: started.job, asset: started.asset };
}

export async function retryReferenceImport(input: { workspaceId?: string; productId: string; skuId: string; referenceId: string }) {
  assertWorkspace(input.workspaceId);
  assertSku(input.productId, input.skuId);
  const row = listUgcReferences(input.productId).find((item) => item.id === input.referenceId);
  if (!row) throw new Error("Reference not found");
  if (!row.url) throw new Error("This reference has no source URL. Upload the video.");
  return importAndPreviewReference({
    workspaceId: input.workspaceId,
    productId: input.productId,
    skuId: input.skuId,
    url: row.url,
    creator: row.creator,
    publishedAt: row.publishedAt,
    market: row.market,
    locale: row.locale,
    source: row.source,
  });
}

export async function adoptMeasuredUpload(input: { workspaceId?: string; productId: string; referenceId: string }) {
  assertWorkspace(input.workspaceId);
  const db = readDb();
  const row = db.references.find((item) => item.id === input.referenceId && item.productId === input.productId);
  if (!row?.mediaUrl) throw new Error("Reference not found");
  try {
    const registered = await registerStoredUpload(row.mediaUrl, {
      dedupeKey: row.dedupeKey,
      sourceUrl: row.url,
      platform: row.platform,
      postId: row.postId,
      creator: row.creator,
      publishedAt: row.publishedAt,
    });
    const current = readDb();
    const fresh = current.references.find((item) => item.id === row.id);
    if (!fresh) throw new Error("Reference not found");
    const changed = fresh.mediaUrl !== registered.asset.mediaUrl || fresh.fileHash !== registered.asset.fileHash;
    fresh.mediaUrl = registered.asset.mediaUrl;
    fresh.fileHash = registered.asset.fileHash;
    fresh.assetId = registered.asset.id;
    fresh.posterUrl = registered.asset.posterUrl;
    fresh.durationSec = registered.measured.durationSec;
    fresh.width = registered.measured.width;
    fresh.height = registered.measured.height;
    fresh.hasAudio = registered.measured.hasAudio;
    fresh.status = "media_saved";
    fresh.failure = null;
    if (changed) fresh.analysis = null;
    fresh.updatedAt = now();
    writeDb(current);
    return { reference: fresh, created: false };
  } catch (err) {
    const current = readDb();
    const fresh = current.references.find((item) => item.id === row.id);
    if (!fresh) throw err;
    fresh.status = "failed";
    fresh.failure = (err instanceof Error ? err.message : "The stored file is not a video.").slice(0, 400);
    fresh.analysis = null;
    fresh.updatedAt = now();
    writeDb(current);
    return { reference: fresh, created: false };
  }
}

export function addReferenceCandidateFact(input: {
  workspaceId?: string;
  productId: string;
  referenceId: string;
  statement: string;
  source: "speech" | "on-screen";
  startSec?: number | null;
  endSec?: number | null;
}) {
  assertWorkspace(input.workspaceId);
  const db = readDb();
  const row = db.references.find((item) => item.id === input.referenceId && item.productId === input.productId);
  if (!row) throw new Error("Reference not found");
  if (row.relation !== "SAME_PRODUCT") throw new Error("Confirm this is the same physical product before adding a product fact.");
  if (!row.analysis?.version) throw new Error("Analyze the saved video before adding a fact.");
  const startSec = input.startSec ?? null;
  const endSec = input.endSec ?? null;
  const provenance: FactProvenance = {
    referenceId: row.id,
    assetId: row.assetId || null,
    analysisVersion: row.analysis.version,
    sourceUrl: row.url,
    evidence: input.statement.replace(/\s+/g, " ").trim().slice(0, 400),
    sourceKind: input.source === "speech" ? "spoken" : "visual",
    startSec,
    endSec,
    reviewBasis: row.relationBasis || null,
  };
  const saved = addExtractedReferenceFact({ skuId: row.skuId, statement: input.statement, provenance });
  const candidate = row.analysis.candidateFacts.find((item) => item.source === input.source && item.startSec === startSec) || row.analysis.candidateFacts.find((item) => item.statement === saved.fact.statement);
  if (candidate) candidate.factId = saved.fact.id;
  else row.analysis.candidateFacts.push({ statement: saved.fact.statement, startSec, endSec, source: input.source, reviewStatus: "UNREVIEWED", factId: saved.fact.id });
  row.updatedAt = now();
  writeDb(db);
  return { fact: saved.fact, created: saved.created, reference: row };
}

export function reviewUgcAnalysis(input: { workspaceId?: string; productId: string; referenceId: string }) {
  assertWorkspace(input.workspaceId);
  if (!getProduct(input.productId)) throw new Error("product not found");
  const db = readDb();
  const row = db.references.find((item) => item.id === input.referenceId && item.productId === input.productId);
  if (!row) throw new Error("Reference not found");
  if (row.status !== "analyzed" || row.analysis?.version == null) throw new Error("Analyze the saved video before accepting it.");
  row.analysis.reviewed = true;
  row.updatedAt = now();
  writeDb(db);
  return row;
}

export async function analyzeUgcReference(input: { workspaceId?: string; productId: string; referenceId: string }) {
  assertWorkspace(input.workspaceId);
  if (!getProduct(input.productId)) throw new Error("product not found");
  const db = readDb();
  const row = db.references.find((item) => item.id === input.referenceId && item.productId === input.productId);
  if (!row) throw new Error("Reference not found");
  if (!row.mediaUrl) throw new Error("A saved link has no playable video. Analysis needs the file.");
  let abs = "";
  try {
    abs = referenceVideoFile(row.mediaUrl);
  } catch (err) {
    row.status = "failed";
    row.failure = err instanceof Error ? err.message : "The video file is missing.";
    row.analysis = null;
    row.updatedAt = now();
    writeDb(db);
    return row;
  }
  row.status = "analyzing";
  row.failure = null;
  row.updatedAt = now();
  writeDb(db);
  try {
    const measured = await measurePlayableVideo(abs);
    const unknown: string[] = [];
    const failures: string[] = [];
    const beats = shotBeats(measured.cuts, measured.durationSec);
    let cuts: UgcAnalysis["cuts"] = null;
    if (measured.sceneError) {
      failures.push(measured.sceneError);
      unknown.push("cuts", "scenes");
    } else if (!measured.cuts?.length) {
      cuts = { text: "No cut above the scene threshold.", observed: true };
    } else {
      cuts = { text: `Cuts at ${measured.cuts.map((time) => `${time.toFixed(1)}s`).join(", ")}.`, observed: true };
    }
    let audio: UgcAnalysis["audio"] = "unknown";
    let transcriptStatus: TranscriptStatus = "unavailable";
    let transcript: UgcAnalysis["transcript"] = [];
    let speechProvider: string | null = null;
    const silent = measured.hasAudio && measured.maxVolumeDb != null && measured.maxVolumeDb < -45;
    if (!measured.hasAudio) {
      audio = "no-audio";
      transcriptStatus = "no-audio";
    } else if (silent) {
      audio = "silent";
      transcriptStatus = "no-speech";
    } else {
      audio = "present";
      const speech = await transcribeStoredAudio(abs, measured.durationSec);
      speechProvider = speech.provider;
      if (speech.error) {
        transcriptStatus = "unavailable";
        failures.push(speech.error);
        unknown.push("transcript");
      } else if (!speech.segments.length) {
        transcriptStatus = "no-speech";
      } else {
        transcriptStatus = "ok";
        transcript = speech.segments.map((segment) => ({ ...segment, observed: true }));
      }
    }
    const visual = await observeStoredFrames(abs, measured.durationSec);
    if (visual.error) {
      failures.push(visual.error);
      unknown.push("framing", "product actions");
    }
    const hookSegment = transcript.find((segment) => segment.startSec < 2.5) || null;
    const hook = hookSegment ? { text: hookSegment.text, observed: true } : visual.note.framing ? { text: visual.note.framing, observed: true } : null;
    if (!hook) unknown.push("hook");
    const ctaSegment = transcript.find((segment) => CTA.test(segment.text)) || null;
    const cta = ctaSegment ? { text: ctaSegment.text, observed: true } : visual.note.cta ? { text: visual.note.cta, observed: true } : null;
    if (!cta) unknown.push("cta");
    if (visual.note.actions.length) {
      for (const beat of beats) {
        const match = visual.note.actions.find((action) => beat.startSec != null && action.start <= beat.startSec + 0.4 && action.end >= (beat.startSec || 0));
        if (match) beat.productAction = match.action;
      }
    }
    const candidateFacts: SourceFact[] = [
      ...transcript.map((segment) => ({
        statement: segment.text,
        startSec: segment.startSec,
        endSec: segment.endSec,
        source: "speech" as const,
        reviewStatus: "UNREVIEWED" as const,
      })),
      ...visual.note.onScreen.map((item) => ({
        statement: item.text,
        startSec: item.start,
        endSec: null,
        source: "on-screen" as const,
        reviewStatus: "UNREVIEWED" as const,
      })),
      ...visual.note.actions.map((item) => ({
        statement: item.action,
        startSec: item.start,
        endSec: item.end,
        source: "on-screen" as const,
        reviewStatus: "UNREVIEWED" as const,
      })),
    ];
    const speechReady = transcriptStatus === "ok" || transcriptStatus === "no-audio" || transcriptStatus === "no-speech";
    const visionReady = !visual.error;
    const coverage = speechReady && visionReady && !measured.sceneError ? "full" : "partial";
    const reason = [
      transcriptStatus === "no-audio" ? "This video has no audio track." : "",
      transcriptStatus === "no-speech" ? "The audio track has no speech." : "",
      transcriptStatus === "unavailable" ? "The speech transcript is unavailable." : "",
      ...failures,
    ].filter(Boolean).join(" ");
    const pattern: CreativePattern = {
      hook: hook?.text || null,
      beats: beats.map((beat) => beat.productAction || beat.purpose),
      demo: visual.note.demo,
      objections: visual.note.objections,
      proof: visual.note.proof,
      cta: cta?.text || null,
      pacing: visual.note.pacing,
    };
    const latest = readDb();
    const fresh = latest.references.find((item) => item.id === row.id && item.productId === input.productId);
    if (!fresh) throw new Error("Reference not found");
    const history = [...(fresh.history || [])];
    if (fresh.analysis?.version != null) history.push(fresh.analysis);
    fresh.history = history.slice(-8);
    const version = (fresh.analysis?.version || 0) + 1;
    fresh.durationSec = measured.durationSec;
    fresh.width = measured.width;
    fresh.height = measured.height;
    fresh.hasAudio = measured.hasAudio;
    fresh.status = "analyzed";
    fresh.failure = null;
    fresh.analysis = {
      version,
      reviewed: false,
      transcript,
      transcriptStatus,
      beats,
      hook,
      framing: visual.note.framing ? { text: visual.note.framing, observed: true } : null,
      cuts,
      audio,
      cta,
      candidateFacts,
      pattern,
      coverage,
      unknown: [...new Set(unknown)],
      reason: reason || null,
      providers: { speech: speechProvider, shots: measured.sceneError ? null : "ffmpeg-scene", vision: visual.provider },
      failures,
    };
    fresh.updatedAt = now();
    writeDb(latest);
    return fresh;
  } catch (err) {
    const latest = readDb();
    const fresh = latest.references.find((item) => item.id === row.id && item.productId === input.productId);
    if (!fresh) throw err;
    fresh.status = "failed";
    fresh.failure = (err instanceof Error ? err.message : "Analysis failed.").slice(0, 400);
    fresh.analysis = blankAnalysis(fresh.failure, { failures: [fresh.failure] });
    fresh.updatedAt = now();
    writeDb(latest);
    return fresh;
  }
}

/** Checks only. The product page has no path that invents a transcript. */
export function saveReviewedAnalysisForTests(id: string, input: { hook: string; beat: string; cta?: string }) {
  const db = readDb();
  const row = db.references.find((item) => item.id === id);
  if (!row) throw new Error("Reference not found");
  if (!row.mediaUrl) throw new Error("A saved link has no playable video. Analysis needs the file.");
  const version = (row.analysis?.version || 0) + 1;
  row.analysis = {
    version,
    reviewed: true,
    transcript: [],
    transcriptStatus: "unavailable",
    beats: [{ startSec: null, endSec: null, purpose: input.beat, productAction: input.beat, observed: true }],
    hook: { text: input.hook, observed: true },
    framing: null,
    cuts: null,
    audio: "unknown",
    cta: input.cta ? { text: input.cta, observed: true } : null,
    candidateFacts: [],
    pattern: { hook: input.hook, beats: [input.beat], demo: null, objections: [], proof: null, cta: input.cta || null, pacing: null },
    coverage: "partial",
    unknown: ["transcript", "audio"],
    reason: null,
    providers: { speech: null, shots: null, vision: null },
    failures: [],
  };
  row.status = "analyzed";
  row.failure = null;
  row.updatedAt = now();
  writeDb(db);
  return row;
}

export function reviewedReferencePatterns(pins: { referenceId: string; analysisVersion: number }[]): ReviewedReferencePattern[] {
  const db = readDb();
  const patterns: ReviewedReferencePattern[] = [];
  for (const pin of pins) {
    const row = db.references.find((item) => item.id === pin.referenceId);
    const versions = [row?.analysis, ...(row?.history || [])].filter((item): item is UgcAnalysis => Boolean(item));
    const analysis = versions.find((item) => item.reviewed && item.version === pin.analysisVersion);
    if (!row || !analysis || analysis.version == null) continue;
    patterns.push({
      referenceId: row.id,
      analysisVersion: analysis.version,
      relation: row.relation,
      hook: analysis.hook?.observed ? analysis.hook.text : analysis.pattern?.hook || null,
      beats: analysis.beats.filter((beat) => beat.observed).map((beat) => beat.productAction || beat.purpose),
      audio: analysis.audio,
      cta: analysis.cta?.observed ? analysis.cta.text : analysis.pattern?.cta || null,
      unknown: analysis.unknown,
    });
  }
  return patterns;
}
