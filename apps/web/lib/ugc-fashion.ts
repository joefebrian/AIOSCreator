import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { AIOSCREATORS_AMAZON_TAG, withAmazonTag } from "./products";
import { dataRoot, ensureDataDirs } from "./paths";
import { spokenProductName } from "./product-research";

export const FASHION_SLOTS = [
  "tops",
  "bottoms",
  "set",
  "one-piece",
  "outerwear",
  "footwear",
  "headwear",
  "eyewear",
  "bag",
  "jewelry",
  "other",
] as const;

export const UGC_STYLES = [
  { id: "bedroom", label: "Bedroom outfit check" },
  { id: "living-room", label: "Casual living room" },
  { id: "street", label: "Streetwear daylight" },
  { id: "home-fitting", label: "Clean home fitting" },
  { id: "fitting-room", label: "Fitting room" },
] as const;

export const FASHION_STAGES = [
  "DRAFT",
  "GENERATING_LOOK",
  "AWAITING_LOOK_APPROVAL",
  "READY_FOR_MOTION",
  "IN_PRODUCTION",
  "PENDING_REVIEW",
  "COMPLETED",
] as const;

export type FashionStage = (typeof FASHION_STAGES)[number];
export type FashionSlot = (typeof FASHION_SLOTS)[number];

export type FashionItem = {
  id: string;
  title: string;
  sourceUrl: string;
  imageUrl: string;
  slot: FashionSlot;
  productId?: string;
  marketplace?: string;
};

export type StillCandidate = {
  id: string;
  revision: number;
  status: "queued" | "ready" | "failed";
  url?: string;
  /** planned = admitted, not a provider render. comfy = real still. fixture = acceptance seed. */
  source: "planned" | "comfy" | "fixture" | "nvidia";
  decision?: "pending" | "approved" | "revision" | "skipped";
  reviewNote?: string;
  /** Set when the still is queued but the provider must not run yet. */
  blocked?: string;
};

export type MotionRef = {
  id: string;
  label: string;
  assetUrl: string;
  trimIn: number;
  trimOut: number;
};

export type FashionRender = {
  id: string;
  stillId: string;
  motionId: string;
  status: "queued" | "ready" | "failed" | "reconciling" | "stopped";
  url?: string;
  decision: "pending" | "approved" | "rejected" | "skipped";
  primary?: boolean;
  source: "planned" | "provider" | "fixture";
};

export type FashionProject = {
  id: string;
  name: string;
  stage: FashionStage;
  attention?: string;
  revision: number;
  items: FashionItem[];
  gender: "woman" | "man" | "random";
  age: string;
  market: string;
  style: string;
  framing: string;
  lighting: string;
  ratio: "9:16";
  candidateCount: number;
  instructions: string;
  appearance?: string;
  prompt: string;
  /** NVIDIA chat model that rewrites the still prompt. Stills themselves stay on Qwen Image 2.1. */
  promptModel?: string;
  characterSeed: string;
  characterStrategy?: "same" | "different";
  lookKey?: string;
  presetId?: string;
  /** Per-look fields Apply Preset must keep unless the operator replaces them. */
  overrides?: string[];
  archived?: boolean;
  candidates: StillCandidate[];
  approvedStillId?: string;
  stillUrl?: string;
  approvedStillUrl?: string;
  motions: MotionRef[];
  renders: FashionRender[];
  motionUrl?: string;
  videoUrl?: string;
  motionEngine?: string;
  createdAt: string;
  updatedAt: string;
};

export type FashionBatch = {
  id: string;
  idempotencyKey: string;
  kind: "image" | "motion";
  projectIds: string[];
  state: "admitted" | "queued" | "running" | "terminal";
  candidateCount?: number;
  plannedCandidates: number;
  plannedVideos: number;
  skipped: { projectId: string; reason: string }[];
  providerDispatch: "blocked" | "nvidia";
  items: FashionBatchItem[];
  quoteId?: string;
  note?: string;
  createdAt: string;
};

export type FashionBatchItem = {
  id: string;
  projectId: string;
  target: "still" | "video";
  refId?: string;
  state: "queued" | "stopped" | "held";
};

export const FASHION_MARKETS = ["Indonesia", "Malaysia", "Singapore", "Thailand", "Japan", "United States"] as const;
export const FASHION_DISPATCH_SLOTS = 2;

export type LookPreset = {
  id: string;
  name: string;
  market: string;
  style: string;
  framing: string;
  lighting: string;
  gender: "woman" | "man" | "random";
  candidateCount: number;
  instructions: string;
};

export type FashionQuote = {
  id: string;
  hash: string;
  kind: "image" | "motion";
  projectIds: string[];
  candidateCount: number;
  plannedCandidates: number;
  plannedVideos: number;
  providerReady: number;
  skipped: { projectId: string; reason: string }[];
  expiresAt: string;
  used?: boolean;
  createdAt: string;
};

export type ReviewSubject = { projectId: string; renderId?: string };

export type ReviewQueue = {
  id: string;
  kind: "look" | "video";
  subjects: ReviewSubject[];
  cursor: number;
  decisions: { projectId: string; subjectId: string; decision: string; at: string }[];
  createdAt: string;
};

type Db = {
  projects: FashionProject[];
  batches: FashionBatch[];
  presets: LookPreset[];
  quotes: FashionQuote[];
  queues: ReviewQueue[];
  imports: { key: string; projectIds: string[] }[];
};

const DEFAULT_PRESETS: LookPreset[] = [
  {
    id: "bedroom-daylight",
    name: "Bedroom daylight",
    market: "Indonesia",
    style: "bedroom",
    framing: "full-body",
    lighting: "natural-daylight",
    gender: "woman",
    candidateCount: 2,
    instructions: "",
  },
  {
    id: "street-daylight",
    name: "Street daylight",
    market: "Indonesia",
    style: "street",
    framing: "full-body",
    lighting: "natural-daylight",
    gender: "woman",
    candidateCount: 2,
    instructions: "",
  },
];

const PRESET_FIELDS = ["market", "style", "framing", "lighting", "gender", "candidateCount", "instructions"] as const;
type PresetField = (typeof PRESET_FIELDS)[number];

function file() {
  ensureDataDirs();
  return path.join(dataRoot(), "db", "ugc-fashion.json");
}

function normalizeProject(p: FashionProject): FashionProject {
  return {
    ...p,
    revision: p.revision || 1,
    candidates: p.candidates || [],
    motions: p.motions || [],
    renders: p.renders || [],
    characterSeed: p.characterSeed || p.id,
    market: p.market || "Indonesia",
    framing: p.framing || "full-body",
    lighting: p.lighting || "natural-daylight",
    candidateCount: p.candidateCount || 2,
    overrides: p.overrides || [],
    archived: Boolean(p.archived),
  };
}

function normalizeBatch(b: FashionBatch): FashionBatch {
  return {
    ...b,
    skipped: b.skipped || [],
    providerDispatch: b.providerDispatch === "nvidia" ? "nvidia" : "blocked",
    items: b.items || [],
    plannedCandidates: b.plannedCandidates || 0,
    plannedVideos: b.plannedVideos || 0,
  };
}

export function readFashionDb(): Db {
  const p = file();
  if (!fs.existsSync(p)) return { projects: [], batches: [], presets: DEFAULT_PRESETS, quotes: [], queues: [], imports: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(p, "utf8")) as Db;
    return {
      projects: (Array.isArray(parsed.projects) ? parsed.projects : []).map(normalizeProject),
      batches: (Array.isArray(parsed.batches) ? parsed.batches : []).map(normalizeBatch),
      presets: Array.isArray(parsed.presets) && parsed.presets.length ? parsed.presets : DEFAULT_PRESETS,
      quotes: Array.isArray(parsed.quotes) ? parsed.quotes : [],
      queues: Array.isArray(parsed.queues) ? parsed.queues : [],
      imports: Array.isArray(parsed.imports) ? parsed.imports : [],
    };
  } catch {
    return { projects: [], batches: [], presets: DEFAULT_PRESETS, quotes: [], queues: [], imports: [] };
  }
}

export function writeFashionDb(db: Db) {
  fs.writeFileSync(file(), JSON.stringify(db, null, 2));
}

export function listFashionProjects() {
  return readFashionDb().projects.filter((p) => !p.archived).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getFashionProject(id: string) {
  return readFashionDb().projects.find((p) => p.id === id);
}

export function saveFashionProject(project: FashionProject) {
  const db = readFashionDb();
  const i = db.projects.findIndex((p) => p.id === project.id);
  const next = { ...project, updatedAt: new Date().toISOString() };
  if (i >= 0) db.projects[i] = next;
  else db.projects.unshift(next);
  writeFashionDb(db);
  return next;
}

function blankProject(name?: string): FashionProject {
  const now = new Date().toISOString();
  const project: FashionProject = {
    id: randomUUID(),
    name: name?.trim() || "Untitled look",
    stage: "DRAFT",
    items: [],
    gender: "woman",
    age: "25–34",
    market: "Indonesia",
    style: "bedroom",
    framing: "full-body",
    lighting: "natural-daylight",
    ratio: "9:16",
    candidateCount: 2,
    instructions: "",
    prompt: "",
    revision: 1,
    characterSeed: randomUUID(),
    candidates: [],
    motions: [],
    renders: [],
    overrides: [],
    motionEngine: "kling-3-0",
    createdAt: now,
    updatedAt: now,
  };
  project.prompt = compileFashionPrompt(project);
  return project;
}

export function createFashionProject(name?: string) {
  return saveFashionProject(blankProject(name));
}

const EXCLUSIVE: FashionSlot[] = ["tops", "bottoms", "one-piece", "footwear", "outerwear"];

export function slotConflicts(items: FashionItem[]) {
  const notes: string[] = [];
  const slots = items.map((i) => i.slot);
  if (slots.includes("one-piece") && (slots.includes("tops") || slots.includes("bottoms"))) {
    notes.push("One-piece conflicts with tops or bottoms. Pick one.");
  }
  if (slots.includes("set") && (slots.includes("tops") || slots.includes("bottoms"))) {
    notes.push("A set already includes the top and bottom. Remove the extra piece.");
  }
  for (const slot of EXCLUSIVE) {
    if (items.filter((i) => i.slot === slot).length > 1) notes.push(`Two items in ${slot}.`);
  }
  return notes;
}

function lookProductName(title: string) {
  const decoded = title
    .replace(/&#x27;|&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"');
  const spoken = spokenProductName(decoded).split(/\s+\|\s+/)[0]?.trim() || "";
  return spoken.length > 72 ? `${spoken.slice(0, 69).trim()}…` : spoken;
}

const SLOT_WORD: Record<string, string> = {
  tops: "top",
  bottoms: "bottom",
  set: "matching set",
  "one-piece": "one-piece",
  outerwear: "outer layer",
  footwear: "shoes",
  headwear: "hat",
  eyewear: "glasses",
  bag: "bag",
  jewelry: "jewelry",
  other: "extra item",
};

export function compileFashionPrompt(project: FashionProject) {
  const who = project.gender === "man" ? "adult man" : project.gender === "woman" ? "adult woman" : "adult person";
  const style = UGC_STYLES.find((s) => s.id === project.style)?.label || project.style;
  const lines = project.items.map((item, i) => {
    const slot = SLOT_WORD[item.slot] || item.slot;
    return `Image ${i + 1} is the ${slot}: ${lookProductName(item.title)}. Keep its color, silhouette, material, and logo.`;
  });
  const extra = project.instructions.trim().replace(/[. ]+$/, "");
  return [
    `Photoreal 9:16 UGC fashion still. One ${who}, age ${project.age}, market ${project.market}.`,
    `Style: ${style}. Framing: ${project.framing || "full-body"}. Lighting: ${project.lighting || "natural-daylight"}.`,
    "Natural light, candid, single person, no text, no watermark.",
    ...lines,
    project.items.some((i) => i.slot === "footwear") ? "Full body so the shoes are visible." : "Frame so every product stays visible.",
    extra ? `Extra: ${extra}.` : "",
    "Do not add extra people or extra fashion products.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function stageLabel(stage: FashionStage) {
  const map: Record<FashionStage, string> = {
    DRAFT: "Draft",
    GENERATING_LOOK: "Generating look",
    AWAITING_LOOK_APPROVAL: "Awaiting look approval",
    READY_FOR_MOTION: "Ready for motion",
    IN_PRODUCTION: "In production",
    PENDING_REVIEW: "Pending review",
    COMPLETED: "Completed",
  };
  return map[stage];
}

export function listFashionBatches() {
  return readFashionDb().batches;
}

/** Plan stills only. Never creates motion jobs. candidateCount is per look, not per market. */
export function admitImageBatch(projectIds: string[], candidateCount: number, idempotencyKey: string) {
  const db = readFashionDb();
  const existing = db.batches.find((b) => b.idempotencyKey === idempotencyKey);
  if (existing) return { batch: existing, duplicate: true };
  const count = Math.min(4, Math.max(1, candidateCount || 2));
  const skipped: { projectId: string; reason: string }[] = [];
  const created: { projectId: string; candidateId: string }[] = [];
  let planned = 0;
  for (const id of projectIds) {
    const project = db.projects.find((p) => p.id === id);
    if (!project) {
      skipped.push({ projectId: id, reason: "not found" });
      continue;
    }
    if (project.items.length < 1 || project.items.length > 4) {
      skipped.push({ projectId: id, reason: "need 1–4 products" });
      continue;
    }
    if (project.stage === "GENERATING_LOOK" || project.stage === "IN_PRODUCTION") {
      skipped.push({ projectId: id, reason: "generation already active" });
      continue;
    }
    const missingPhoto = project.items.some((item) => !item.imageUrl);
    const candidates: StillCandidate[] = Array.from({ length: count }, () => ({
      id: randomUUID(),
      revision: project.revision,
      status: "queued" as const,
      source: "planned" as const,
      decision: "pending" as const,
      blocked: missingPhoto ? "product photo missing" : undefined,
    }));
    project.candidates = [...(project.candidates || []), ...candidates];
    project.stage = "GENERATING_LOOK";
    project.updatedAt = new Date().toISOString();
    planned += candidates.length;
    for (const candidate of candidates) created.push({ projectId: id, candidateId: candidate.id });
  }
  const batch: FashionBatch = {
    id: randomUUID(),
    idempotencyKey,
    kind: "image",
    projectIds,
    state: "admitted",
    candidateCount: count,
    plannedCandidates: planned,
    plannedVideos: 0,
    skipped,
    providerDispatch: "nvidia",
    items: created.map((row) => ({ id: randomUUID(), projectId: row.projectId, target: "still" as const, refId: row.candidateId, state: "queued" as const })),
    note: "Stills go to Qwen Image Edit 2.1. Video stays off.",
    createdAt: new Date().toISOString(),
  };
  db.batches.unshift(batch);
  writeFashionDb(db);
  return { batch, duplicate: false };
}

export function approveStill(projectId: string, candidateId: string, expectedRevision?: number) {
  const db = readFashionDb();
  const project = db.projects.find((p) => p.id === projectId);
  if (!project) return { error: "not found" as const };
  if (expectedRevision && expectedRevision !== project.revision) {
    return { error: "revision conflict", code: "REVISION" as const, project };
  }
  const candidate = (project.candidates || []).find((c) => c.id === candidateId);
  if (!candidate) return { error: "candidate not found" as const };
  if (candidate.revision !== project.revision) return { error: "candidate is from an older revision" as const };
  if (candidate.status !== "ready" || !candidate.url) {
    return { error: "candidate is planned, not ready to approve" as const };
  }
  for (const other of project.candidates || []) {
    if (other.revision === project.revision && other.id !== candidate.id && other.decision === "approved") other.decision = "pending";
  }
  candidate.decision = "approved";
  project.approvedStillId = candidate.id;
  project.approvedStillUrl = candidate.url;
  project.stage = "READY_FOR_MOTION";
  project.updatedAt = new Date().toISOString();
  writeFashionDb(db);
  return { project };
}

export function reviseStill(projectId: string, candidateId: string, note: string, expectedRevision?: number) {
  const reason = note.trim();
  if (!reason) return { error: "Write what should change." as const, status: 400 as const };
  const db = readFashionDb();
  const project = db.projects.find((p) => p.id === projectId);
  if (!project) return { error: "not found" as const, status: 404 as const };
  if (expectedRevision && expectedRevision !== project.revision) {
    return { error: "revision conflict" as const, code: "REVISION" as const, status: 409 as const, project };
  }
  const candidate = (project.candidates || []).find((row) => row.id === candidateId);
  if (!candidate || candidate.status !== "ready" || !candidate.url) {
    return { error: "Only a finished still can be revised." as const, status: 400 as const, project };
  }
  candidate.decision = "revision";
  candidate.reviewNote = reason;
  if (project.approvedStillId === candidate.id) {
    project.approvedStillId = undefined;
    project.approvedStillUrl = undefined;
  }
  project.revision += 1;
  project.stage = "DRAFT";
  project.attention = reason;
  const change = `Change: ${reason}`;
  project.prompt = `${project.prompt} ${change}.`.trim().slice(0, 1200);
  project.updatedAt = new Date().toISOString();
  writeFashionDb(db);
  return { project, status: 200 as const };
}

/** Fixture-only: marks planned candidates ready so review can run without a GPU call. */
export function seedFixtureCandidates(projectId: string) {
  const db = readFashionDb();
  const project = db.projects.find((p) => p.id === projectId);
  if (!project) return { error: "not found" as const };
  for (const c of project.candidates || []) {
    if (c.status === "queued" && !c.url) {
      c.status = "ready";
      c.source = "fixture";
      c.url = project.items[0]?.imageUrl || "fixture://still";
      c.decision = "pending";
    }
  }
  if ((project.candidates || []).some((c) => c.status === "ready")) project.stage = "AWAITING_LOOK_APPROVAL";
  for (const batch of db.batches) {
    for (const item of batch.items || []) {
      if (item.projectId !== project.id || item.state !== "queued") continue;
      const candidate = (project.candidates || []).find((row) => row.id === item.refId);
      if (candidate && candidate.status !== "queued") item.state = "held";
    }
  }
  project.updatedAt = new Date().toISOString();
  writeFashionDb(db);
  return { project };
}

export function assignMotions(projectId: string, refs: { label: string; assetUrl: string; trimIn?: number; trimOut?: number }[]) {
  const db = readFashionDb();
  const project = db.projects.find((p) => p.id === projectId);
  if (!project) return { error: "not found" as const };
  const clean = refs.filter((r) => r.assetUrl?.trim());
  if (!clean.length) return { error: "reference video required" as const };
  const bad = clean.find((r) => (r.trimOut || 0) > 0 && (r.trimOut || 0) <= (r.trimIn || 0));
  if (bad) return { error: "trim out must be after trim in" as const };
  project.motions = clean.map((r) => ({
    id: randomUUID(),
    label: r.label || "Motion",
    assetUrl: r.assetUrl.trim(),
    trimIn: Number(r.trimIn) || 0,
    trimOut: Number(r.trimOut) || 0,
  }));
  project.motionUrl = project.motions[0]?.assetUrl;
  project.updatedAt = new Date().toISOString();
  writeFashionDb(db);
  return { project, pairs: project.motions.length };
}

/** One video per approved still × assigned motion. Does not multiply by other candidates or markets. */
export function admitMotionBatch(projectIds: string[], idempotencyKey: string) {
  const db = readFashionDb();
  const existing = db.batches.find((b) => b.idempotencyKey === idempotencyKey);
  if (existing) return { batch: existing, duplicate: true };
  const skipped: { projectId: string; reason: string }[] = [];
  const created: { projectId: string; renderId: string }[] = [];
  let planned = 0;
  for (const id of projectIds) {
    const project = db.projects.find((p) => p.id === id);
    if (!project) {
      skipped.push({ projectId: id, reason: "not found" });
      continue;
    }
    if (!project.approvedStillId) {
      skipped.push({ projectId: id, reason: "no approved still" });
      continue;
    }
    const motions = project.motions || [];
    if (!motions.length) {
      skipped.push({ projectId: id, reason: "reference video required" });
      continue;
    }
    const seen = new Set<string>();
    for (const motion of motions) {
      const key = `${project.approvedStillId}|${motion.assetUrl}|${motion.trimIn}|${motion.trimOut}`;
      if (seen.has(key)) continue;
      seen.add(key);
      project.renders = project.renders || [];
      project.renders.push({
        id: randomUUID(),
        stillId: project.approvedStillId,
        motionId: motion.id,
        status: "queued",
        decision: "pending",
        source: "planned",
      });
      created.push({ projectId: id, renderId: project.renders[project.renders.length - 1]!.id });
      planned += 1;
    }
    project.stage = "IN_PRODUCTION";
    project.updatedAt = new Date().toISOString();
  }
  const batch: FashionBatch = {
    id: randomUUID(),
    idempotencyKey,
    kind: "motion",
    projectIds,
    state: "admitted",
    plannedCandidates: 0,
    plannedVideos: planned,
    skipped,
    providerDispatch: "blocked",
    items: created.map((row) => ({ id: randomUUID(), projectId: row.projectId, target: "video" as const, refId: row.renderId, state: "queued" as const })),
    note: "Persistent queue. Provider dispatch is blocked, so these videos are not sent to Kling.",
    createdAt: new Date().toISOString(),
  };
  db.batches.unshift(batch);
  writeFashionDb(db);
  return { batch, duplicate: false };
}

export function primaryAction(stage: FashionStage) {
  const map: Record<FashionStage, string> = {
    DRAFT: "Continue setup",
    GENERATING_LOOK: "View progress",
    AWAITING_LOOK_APPROVAL: "Review look",
    READY_FOR_MOTION: "Add motion",
    IN_PRODUCTION: "View progress",
    PENDING_REVIEW: "Review video",
    COMPLETED: "Download",
  };
  return map[stage];
}

function stableIndex(seed: string, size: number) {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return size ? hash % size : 0;
}

function itemFromUrl(sourceUrl: string, index: number): FashionItem {
  let title = sourceUrl;
  try {
    const url = new URL(sourceUrl);
    title = url.hostname.replace(/^www\./, "");
  } catch {
    title = sourceUrl;
  }
  const slots: FashionSlot[] = ["tops", "bottoms", "footwear", "bag"];
  return {
    id: randomUUID(),
    title,
    sourceUrl: withAmazonTag(sourceUrl, AIOSCREATORS_AMAZON_TAG),
    imageUrl: "",
    slot: slots[index] || "other",
  };
}

export function createDrafts(input: {
  mode: "one-url-per-look" | "one-look" | "group";
  urls?: string[];
  groups?: { lookKey?: string; name?: string; urls: string[] }[];
  idempotencyKey?: string;
  lookName?: string;
}) {
  const db = readFashionDb();
  const key = input.idempotencyKey?.trim();
  if (key) {
    const prev = db.imports.find((row) => row.key === key);
    if (prev) {
      return {
        projects: prev.projectIds.map((id) => db.projects.find((p) => p.id === id)).filter((p): p is FashionProject => Boolean(p)),
        duplicate: true,
        skipped: [] as { key?: string; reason: string }[],
      };
    }
  }
  const groups: { lookKey?: string; name?: string; urls: string[] }[] =
    input.mode === "one-url-per-look"
      ? (input.urls || []).map((url, index) => ({ name: input.lookName ? `${input.lookName} ${index + 1}` : `Look ${index + 1}`, urls: [url] }))
      : input.mode === "one-look"
        ? [{ name: input.lookName || "Grouped look", urls: input.urls || [] }]
        : input.groups || [];
  if (input.mode === "one-look") {
    const count = (groups[0]?.urls || []).map((url) => url.trim()).filter(Boolean).length;
    if (count < 1 || count > 4) {
      return { error: "One look needs 1–4 URLs.", code: "GROUPING" as const, projects: [] as FashionProject[], skipped: [{ reason: "1–4 products" }] };
    }
  }
  const skipped: { key?: string; reason: string }[] = [];
  const made: FashionProject[] = [];
  const seenKeys = new Set<string>();
  for (const group of groups) {
    const urls = (group.urls || []).map((url) => url.trim()).filter(Boolean);
    if (urls.length < 1 || urls.length > 4) {
      skipped.push({ key: group.lookKey, reason: urls.length > 4 ? "fifth product rejected; look not created" : "need 1–4 products" });
      continue;
    }
    if (group.lookKey) {
      if (seenKeys.has(group.lookKey) || db.projects.some((p) => p.lookKey === group.lookKey)) {
        skipped.push({ key: group.lookKey, reason: "look key already exists" });
        continue;
      }
      seenKeys.add(group.lookKey);
    }
    const project = blankProject(group.name);
    project.lookKey = group.lookKey;
    project.items = urls.map((url, index) => itemFromUrl(url, index));
    project.prompt = compileFashionPrompt(project);
    db.projects.unshift(project);
    made.push(project);
  }
  if (key) db.imports.unshift({ key, projectIds: made.map((p) => p.id) });
  writeFashionDb(db);
  return { projects: made, duplicate: false, skipped };
}

const CSV_COLUMNS = [
  "look_key",
  "look_name",
  "product_1_source",
  "product_2_source",
  "product_3_source",
  "product_4_source",
  "preset_key",
  "character_strategy",
  "market",
  "scene_preset",
  "candidate_count",
  "aspect_ratio",
];

export function csvTemplate() {
  return `${CSV_COLUMNS.join(",")}\nlook-1,Weekend fit,https://example.com/top,,,,bedroom-daylight,different,Indonesia,bedroom,2,9:16\n`;
}

function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const split = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let quoted = false;
    for (const ch of line) {
      if (ch === '"') {
        quoted = !quoted;
        continue;
      }
      if (ch === "," && !quoted) {
        out.push(cur.trim());
        cur = "";
        continue;
      }
      cur += ch;
    }
    out.push(cur.trim());
    return out;
  };
  const headers = split(lines[0] || "");
  return { headers, rows: lines.slice(1).map(split) };
}

export function previewCsv(text: string) {
  const { headers, rows } = parseCsv(text);
  const unknownColumns = headers.filter((header) => header && !CSV_COLUMNS.includes(header));
  const keys = new Map<string, number>();
  rows.forEach((row, index) => {
    const key = row[headers.indexOf("look_key")] || "";
    if (key) keys.set(key, (keys.get(key) || 0) + 1);
    void index;
  });
  const db = readFashionDb();
  const parsed = rows.map((row) => {
    const cell = (name: string) => {
      const index = headers.indexOf(name);
      return index >= 0 ? row[index] || "" : "";
    };
    const sources = [1, 2, 3, 4].map((n) => cell(`product_${n}_source`)).filter(Boolean);
    const errors: string[] = [];
    const lookKey = cell("look_key");
    if (!lookKey) errors.push("look_key required");
    if (!cell("look_name")) errors.push("look_name required");
    if (!cell("product_1_source")) errors.push("product_1_source required");
    if (lookKey && (keys.get(lookKey) || 0) > 1) errors.push("duplicate look_key in this file");
    if (lookKey && db.projects.some((p) => p.lookKey === lookKey)) errors.push("look_key already exists");
    if (sources.length > 4 || cell("product_5_source")) errors.push("fifth product is not allowed");
    for (const source of sources) {
      if (!/^https?:\/\//i.test(source)) errors.push(`source must be an http(s) URL: ${source}`);
    }
    return {
      lookKey,
      lookName: cell("look_name"),
      sources: sources.slice(0, 4),
      presetKey: cell("preset_key"),
      market: cell("market"),
      scene: cell("scene_preset"),
      candidateCount: cell("candidate_count"),
      errors,
      valid: errors.length === 0,
    };
  });
  return { unknownColumns, rows: parsed, valid: parsed.filter((row) => row.valid).length, rejected: parsed.filter((row) => !row.valid).length };
}

export function importCsv(text: string, idempotencyKey: string) {
  const key = idempotencyKey.trim();
  if (!key) return { error: "idempotencyKey required" as const };
  const db = readFashionDb();
  const prev = db.imports.find((row) => row.key === key);
  if (prev) {
    return {
      projects: prev.projectIds.map((id) => db.projects.find((p) => p.id === id)).filter((p): p is FashionProject => Boolean(p)),
      duplicate: true,
      preview: previewCsv(text),
    };
  }
  const preview = previewCsv(text);
  const made: FashionProject[] = [];
  for (const row of preview.rows) {
    if (!row.valid) continue;
    const project = blankProject(row.lookName);
    project.lookKey = row.lookKey;
    project.items = row.sources.map((url, index) => itemFromUrl(url, index));
    if (row.market && (FASHION_MARKETS as readonly string[]).includes(row.market)) project.market = row.market;
    if (row.scene && UGC_STYLES.some((style) => style.id === row.scene)) project.style = row.scene;
    const count = Number(row.candidateCount);
    if (count >= 1 && count <= 4) project.candidateCount = count;
    if (row.presetKey) project.presetId = row.presetKey;
    project.prompt = compileFashionPrompt(project);
    db.projects.unshift(project);
    made.push(project);
  }
  db.imports.unshift({ key, projectIds: made.map((p) => p.id) });
  writeFashionDb(db);
  return { projects: made, duplicate: false, preview };
}

function projectField(project: FashionProject, field: PresetField) {
  return project[field];
}

export function previewPreset(projectIds: string[], presetId: string, fields: string[], replaceOverrides: boolean) {
  const db = readFashionDb();
  const preset = db.presets.find((row) => row.id === presetId);
  if (!preset) return { error: "preset not found" as const };
  const chosen = (fields.length ? fields : [...PRESET_FIELDS]).filter((field): field is PresetField => (PRESET_FIELDS as readonly string[]).includes(field));
  const projects = projectIds.map((id) => db.projects.find((p) => p.id === id)).filter((p): p is FashionProject => Boolean(p));
  const mixed: Record<string, boolean> = {};
  for (const field of chosen) {
    const values = new Set(projects.map((p) => String(projectField(p, field) ?? "")));
    mixed[field] = values.size > 1;
  }
  let approvalLoss = 0;
  const changes = projects.map((project) => {
    const kept: string[] = [];
    const replaced: string[] = [];
    for (const field of chosen) {
      const locked = (project.overrides || []).includes(field) && !replaceOverrides;
      if (locked) kept.push(field);
      else if (String(projectField(project, field) ?? "") !== String(preset[field] ?? "")) replaced.push(field);
    }
    const visual = replaced.some((field) => field !== "candidateCount");
    if (visual && project.approvedStillId) approvalLoss += 1;
    return { projectId: project.id, name: project.name, kept, replaced, clearsApproval: Boolean(visual && project.approvedStillId) };
  });
  return { preset, mixed, replaceOverrides, approvalLoss, changes };
}

export function applyPreset(projectIds: string[], presetId: string, fields: string[], replaceOverrides: boolean) {
  const preview = previewPreset(projectIds, presetId, fields, replaceOverrides);
  if ("error" in preview) return preview;
  const db = readFashionDb();
  const preset = db.presets.find((row) => row.id === presetId)!;
  const chosen = (fields.length ? fields : [...PRESET_FIELDS]).filter((field): field is PresetField => (PRESET_FIELDS as readonly string[]).includes(field));
  let approvalLoss = 0;
  for (const id of projectIds) {
    const project = db.projects.find((p) => p.id === id);
    if (!project) continue;
    if (project.stage === "GENERATING_LOOK" || project.stage === "IN_PRODUCTION") continue;
    let visual = false;
    for (const field of chosen) {
      const locked = (project.overrides || []).includes(field) && !replaceOverrides;
      if (locked) continue;
      if (String(projectField(project, field) ?? "") === String(preset[field] ?? "")) continue;
      if (field === "candidateCount") project.candidateCount = preset.candidateCount;
      else {
        (project as unknown as Record<string, unknown>)[field] = preset[field];
        visual = true;
      }
      project.overrides = (project.overrides || []).filter((name) => name !== field);
    }
    project.presetId = preset.id;
    if (visual && project.approvedStillId) {
      project.revision += 1;
      project.approvedStillId = undefined;
      project.approvedStillUrl = undefined;
      project.stage = "DRAFT";
      project.attention = "Preset changed the look. Active still approval was cleared. Older stills stay in history.";
      approvalLoss += 1;
    }
    project.prompt = compileFashionPrompt(project);
    project.updatedAt = new Date().toISOString();
  }
  writeFashionDb(db);
  return { ...preview, approvalLoss, applied: true };
}

export function applyCharacterStrategy(projectIds: string[], strategy: "same" | "different") {
  const db = readFashionDb();
  const projects = projectIds.map((id) => db.projects.find((p) => p.id === id)).filter((p): p is FashionProject => Boolean(p));
  if (strategy === "same") {
    const seeds = new Set(projects.map((p) => p.characterSeed));
    const seed = seeds.size === 1 ? projects[0]!.characterSeed : randomUUID();
    for (const project of projects) {
      project.characterSeed = seed;
      project.characterStrategy = "same";
      project.updatedAt = new Date().toISOString();
    }
    writeFashionDb(db);
    return { strategy, seed, seeds: projects.map((p) => ({ projectId: p.id, characterSeed: p.characterSeed })) };
  }
  for (const project of projects) {
    if (project.characterStrategy !== "different" || !project.characterSeed) project.characterSeed = randomUUID();
    project.characterStrategy = "different";
    project.updatedAt = new Date().toISOString();
  }
  writeFashionDb(db);
  return { strategy, seed: null, seeds: projects.map((p) => ({ projectId: p.id, characterSeed: p.characterSeed })) };
}

export function resolveProjectMarket(project: FashionProject) {
  if (project.market && project.market.toLowerCase() !== "random") return project.market;
  const market = FASHION_MARKETS[stableIndex(project.characterSeed, FASHION_MARKETS.length)]!;
  project.market = market;
  return market;
}

function quoteHash(db: Db, kind: string, projectIds: string[], extra: string) {
  return [
    kind,
    extra,
    ...projectIds.map((id) => {
      const project = db.projects.find((p) => p.id === id);
      const motions = (project?.motions || []).map((m) => `${m.assetUrl}|${m.trimIn}|${m.trimOut}`).join(",");
      const look = `${project?.style}|${project?.market}|${project?.framing}|${project?.lighting}|${project?.instructions}|${project?.gender}`;
      const photos = (project?.items || []).map((item) => `${item.sourceUrl}|${item.imageUrl}`).join(",");
      return `${id}:${project?.revision || 0}:${project?.approvedStillId || ""}:${look}:${photos}:${motions}`;
    }),
  ].join(";");
}

export function previewImageQuote(projectIds: string[], candidateCount: number) {
  const db = readFashionDb();
  const count = Math.min(4, Math.max(1, candidateCount || 2));
  const skipped: { projectId: string; reason: string }[] = [];
  let planned = 0;
  let providerReady = 0;
  for (const id of projectIds) {
    const project = db.projects.find((p) => p.id === id);
    if (!project) {
      skipped.push({ projectId: id, reason: "not found" });
      continue;
    }
    resolveProjectMarket(project);
    if (project.items.length < 1 || project.items.length > 4) {
      skipped.push({ projectId: id, reason: "need 1–4 products" });
      continue;
    }
    if (project.stage === "GENERATING_LOOK" || project.stage === "IN_PRODUCTION") {
      skipped.push({ projectId: id, reason: "generation already active" });
      continue;
    }
    planned += count;
    if (project.items.every((item) => item.imageUrl)) providerReady += count;
  }
  const quote: FashionQuote = {
    id: randomUUID(),
    hash: quoteHash(db, "image", projectIds, String(count)),
    kind: "image",
    projectIds,
    candidateCount: count,
    plannedCandidates: planned,
    plannedVideos: 0,
    providerReady,
    skipped,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
  };
  db.quotes.unshift(quote);
  writeFashionDb(db);
  return {
    quote,
    providerDispatch: "blocked" as const,
    note: `${planned} stills planned, ${providerReady} have product photos. Queue sends the stills to local Qwen Image Edit 2.1. No video jobs are created.`,
  };
}

export function previewMotionQuote(projectIds: string[]) {
  const db = readFashionDb();
  const skipped: { projectId: string; reason: string }[] = [];
  const pairs: { projectId: string; stillId: string; motionId: string; assetUrl: string; trimIn: number; trimOut: number }[] = [];
  for (const id of projectIds) {
    const project = db.projects.find((p) => p.id === id);
    if (!project) {
      skipped.push({ projectId: id, reason: "not found" });
      continue;
    }
    if (!project.approvedStillId) {
      skipped.push({ projectId: id, reason: "no approved still" });
      continue;
    }
    if (!(project.motions || []).length) {
      skipped.push({ projectId: id, reason: "reference video required" });
      continue;
    }
    const seen = new Set<string>();
    for (const motion of project.motions) {
      if ((motion.trimOut || 0) > 0 && motion.trimOut <= motion.trimIn) {
        skipped.push({ projectId: id, reason: `trim incompatible on ${motion.label}` });
        continue;
      }
      const key = `${project.approvedStillId}|${motion.assetUrl}|${motion.trimIn}|${motion.trimOut}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ projectId: id, stillId: project.approvedStillId, motionId: motion.id, assetUrl: motion.assetUrl, trimIn: motion.trimIn, trimOut: motion.trimOut });
    }
  }
  const quote: FashionQuote = {
    id: randomUUID(),
    hash: quoteHash(db, "motion", projectIds, String(pairs.length)),
    kind: "motion",
    projectIds,
    candidateCount: 0,
    plannedCandidates: 0,
    plannedVideos: pairs.length,
    providerReady: 0,
    skipped,
    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
  };
  db.quotes.unshift(quote);
  writeFashionDb(db);
  return { quote, pairs, providerDispatch: "blocked" as const, note: "Videos follow one approved still per look. Other still candidates and markets are not multiplied." };
}

export function takeQuote(quoteId: string) {
  const db = readFashionDb();
  const quote = db.quotes.find((row) => row.id === quoteId);
  if (!quote) return { error: "quote required", code: "QUOTE_REQUIRED" as const };
  if (quote.used) return { error: "quote already used", code: "QUOTE_USED" as const, quote };
  if (new Date(quote.expiresAt).getTime() < Date.now()) return { error: "quote expired", code: "QUOTE_EXPIRED" as const, quote };
  const hash = quoteHash(db, quote.kind, quote.projectIds, quote.kind === "image" ? String(quote.candidateCount) : String(quote.plannedVideos));
  if (hash !== quote.hash) return { error: "inputs changed after the quote", code: "QUOTE_CONFLICT" as const, quote };
  quote.used = true;
  writeFashionDb(db);
  return { quote };
}

export function tickFashionQueue() {
  const db = readFashionDb();
  let dirty = false;
  for (const batch of db.batches) {
    if (batch.state === "admitted") {
      batch.state = "queued";
      batch.providerDispatch = "blocked";
      dirty = true;
    }
  }
  if (dirty) writeFashionDb(db);
  const fresh = dirty ? readFashionDb() : db;
  return {
    dispatchSlots: FASHION_DISPATCH_SLOTS,
    providerDispatch: "blocked" as const,
    batches: fresh.batches.slice(0, 20).map((batch) => ({
      id: batch.id,
      kind: batch.kind,
      state: batch.state,
      plannedCandidates: batch.plannedCandidates,
      plannedVideos: batch.plannedVideos,
      skipped: batch.skipped.length,
      queued: (batch.items || []).filter((item) => item.state === "queued").length,
      stopped: (batch.items || []).filter((item) => item.state === "stopped").length,
      note: batch.note || "Provider dispatch is blocked.",
      createdAt: batch.createdAt,
    })),
  };
}

export function stopRemaining(batchId: string) {
  const db = readFashionDb();
  const batch = db.batches.find((row) => row.id === batchId);
  if (!batch) return { error: "batch not found" as const };
  let stopped = 0;
  const perLook = new Map<string, number>();
  for (const item of batch.items || []) {
    if (item.state !== "queued") continue;
    const project = db.projects.find((p) => p.id === item.projectId);
    if (item.target === "video") {
      const render = project?.renders?.find((row) => row.id === item.refId);
      if (!render || render.status !== "queued") continue;
      render.status = "stopped";
    }
    if (item.target === "still") {
      const candidate = project?.candidates?.find((row) => row.id === item.refId);
      if (!candidate || candidate.status !== "queued") continue;
      candidate.status = "failed";
      candidate.blocked = "stopped before dispatch";
    }
    item.state = "stopped";
    stopped += 1;
    if (project) {
      const count = (perLook.get(project.id) || 0) + 1;
      perLook.set(project.id, count);
      project.attention = `Stopped ${count} undispatched target(s) on this look. No provider job was running.`;
      settleRenderStage(project);
      project.updatedAt = new Date().toISOString();
    }
  }
  batch.state = "terminal";
  batch.note = `Stopped ${stopped} undispatched targets. Provider work was not running, so nothing was cancelled at Kling or Qwen.`;
  writeFashionDb(db);
  return { batch, stopped };
}

export function listPresets() {
  return readFashionDb().presets;
}

export function duplicateFashionProject(id: string) {
  const db = readFashionDb();
  const src = db.projects.find((p) => p.id === id);
  if (!src) return { error: "not found" as const };
  const copy = blankProject(`${src.name} copy`);
  copy.items = src.items.map((item) => ({ ...item, id: randomUUID() }));
  copy.gender = src.gender;
  copy.age = src.age;
  copy.market = src.market;
  copy.style = src.style;
  copy.framing = src.framing;
  copy.lighting = src.lighting;
  copy.instructions = src.instructions;
  copy.candidateCount = src.candidateCount;
  copy.prompt = compileFashionPrompt(copy);
  db.projects.unshift(copy);
  writeFashionDb(db);
  return { project: copy };
}

export function archiveFashionProject(id: string) {
  const db = readFashionDb();
  const project = db.projects.find((p) => p.id === id);
  if (!project) return { error: "not found" as const };
  project.archived = true;
  project.updatedAt = new Date().toISOString();
  writeFashionDb(db);
  return { project };
}

const VISUAL_KEYS = ["items", "gender", "age", "market", "style", "framing", "lighting", "instructions", "appearance"] as const;

export function patchFashionProject(id: string, body: Partial<FashionProject> & { expectedRevision?: number }) {
  const db = readFashionDb();
  const cur = db.projects.find((p) => p.id === id);
  if (!cur) return { error: "not found" as const, status: 404 as const };
  if (body.expectedRevision && body.expectedRevision !== cur.revision) {
    return { error: "revision conflict", code: "REVISION" as const, status: 409 as const, project: cur };
  }
  if (Array.isArray(body.items) && body.items.length > 4) {
    return { error: "A look holds at most 4 products.", code: "GROUPING" as const, status: 400 as const, project: cur };
  }
  const visualTouched = VISUAL_KEYS.some((key) => body[key] !== undefined && JSON.stringify(body[key]) !== JSON.stringify(cur[key]));
  const queuedPlanOnly = (cur.candidates || []).every((candidate) => candidate.source === "planned" && candidate.status === "queued" && !candidate.url)
    && !(cur.renders || []).some((render) => render.status === "queued" || render.status === "reconciling");
  if (visualTouched && (cur.stage === "GENERATING_LOOK" || cur.stage === "IN_PRODUCTION") && !queuedPlanOnly) {
    return { error: "This look is already generating. Its inputs stay locked.", code: "ACTIVE" as const, status: 409 as const, project: cur };
  }
  const next: FashionProject = { ...cur, overrides: [...(cur.overrides || [])] };
  if (body.name !== undefined) next.name = body.name.trim() || cur.name;
  if (Array.isArray(body.items)) {
    next.items = body.items.slice(0, 4).map((item) => ({ ...item, sourceUrl: withAmazonTag(item.sourceUrl || "", AIOSCREATORS_AMAZON_TAG) }));
  }
  if (body.gender) next.gender = body.gender;
  if (body.age) next.age = body.age;
  if (body.market) next.market = body.market;
  if (body.style) next.style = body.style;
  if (body.framing) next.framing = body.framing;
  if (body.lighting) next.lighting = body.lighting;
  if (body.instructions !== undefined) next.instructions = body.instructions;
  if (body.appearance !== undefined) next.appearance = body.appearance;
  if (body.candidateCount) next.candidateCount = Math.min(4, Math.max(1, body.candidateCount));
  if (typeof body.promptModel === "string" && body.promptModel.trim()) next.promptModel = body.promptModel.trim();
  if (typeof body.prompt === "string" && body.prompt.trim()) next.prompt = body.prompt.trim();
  if (body.motionUrl !== undefined) next.motionUrl = body.motionUrl;
  if (body.motionEngine && body.motionEngine !== "wan-3-0") next.motionEngine = body.motionEngine;
  if (body.videoUrl !== undefined) next.videoUrl = body.videoUrl;
  for (const field of ["market", "style", "framing", "lighting", "gender", "instructions", "candidateCount"] as const) {
    if (body[field] !== undefined && !next.overrides!.includes(field)) next.overrides!.push(field);
  }
  if (visualTouched && queuedPlanOnly && cur.stage === "GENERATING_LOOK") {
    next.candidates = [];
    next.stage = "DRAFT";
    next.attention = "Scene saved. The old queue was cleared. Queue the look again.";
    for (const batch of db.batches) {
      if (!(batch.projectIds || []).includes(id)) continue;
      for (const item of batch.items || []) {
        if (item.projectId === id && item.state === "queued") item.state = "stopped";
      }
      if (!(batch.items || []).some((item) => item.state === "queued")) batch.state = "terminal";
    }
  }
  if (visualTouched && cur.approvedStillId) {
    next.revision = cur.revision + 1;
    next.approvedStillId = undefined;
    next.approvedStillUrl = undefined;
    next.stage = "DRAFT";
    next.attention = "This edit started a new revision and cleared the active still approval. Older stills stay in history.";
  }
  if (body.approvedStillUrl && !cur.approvedStillUrl && !visualTouched) {
    next.approvedStillUrl = body.approvedStillUrl;
    next.stage = "READY_FOR_MOTION";
  }
  if (body.stage === "COMPLETED" && (next.videoUrl || cur.videoUrl)) {
    const url = next.videoUrl || cur.videoUrl;
    const exists = (next.renders || []).some((render) => render.url === url && render.decision === "approved");
    if (!exists && url) {
      next.renders = [
        ...(next.renders || []),
        {
          id: randomUUID(),
          stillId: next.approvedStillId || "legacy",
          motionId: next.motions[0]?.id || "legacy",
          status: "ready",
          url,
          decision: "approved",
          primary: true,
          source: "provider",
        },
      ];
    }
    next.stage = "COMPLETED";
  }
  if (!(typeof body.prompt === "string" && body.prompt.trim())) next.prompt = compileFashionPrompt(next);
  next.updatedAt = new Date().toISOString();
  const index = db.projects.findIndex((p) => p.id === id);
  db.projects[index] = next;
  writeFashionDb(db);
  return { project: next, conflicts: slotConflicts(next.items), status: 200 as const };
}

export function openReviewQueue(projectIds: string[], kind: "look" | "video") {
  const db = readFashionDb();
  const subjects: ReviewSubject[] = [];
  for (const id of projectIds) {
    const project = db.projects.find((p) => p.id === id);
    if (!project) continue;
    if (kind === "look") {
      const ready = (project.candidates || []).some((c) => c.revision === project.revision && c.status === "ready");
      if (ready) subjects.push({ projectId: id });
      continue;
    }
    for (const render of project.renders || []) {
      if (render.status === "ready" && render.decision === "pending") subjects.push({ projectId: id, renderId: render.id });
    }
  }
  const queue: ReviewQueue = {
    id: randomUUID(),
    kind,
    subjects,
    cursor: 0,
    decisions: [],
    createdAt: new Date().toISOString(),
  };
  db.queues.unshift(queue);
  writeFashionDb(db);
  return queue;
}

export function getReviewQueue(id: string) {
  const db = readFashionDb();
  const queue = db.queues.find((row) => row.id === id);
  if (!queue) return null;
  const current = queue.subjects[queue.cursor] || null;
  const project = current ? db.projects.find((p) => p.id === current.projectId) || null : null;
  return { queue, project };
}

export function moveReviewCursor(queueId: string, delta: number) {
  const db = readFashionDb();
  const queue = db.queues.find((row) => row.id === queueId);
  if (!queue) return { error: "queue not found" as const };
  queue.cursor = Math.max(0, Math.min(queue.subjects.length, queue.cursor + delta));
  writeFashionDb(db);
  return { queue };
}

export function reviewDecision(input: {
  queueId: string;
  decision: "approve" | "revision" | "skip";
  candidateId?: string;
  renderId?: string;
  checklist?: boolean;
  expectedRevision?: number;
  note?: string;
}) {
  const db = readFashionDb();
  const queue = db.queues.find((row) => row.id === input.queueId);
  if (!queue) return { error: "queue not found" as const, status: 404 as const };
  const current = queue.subjects[queue.cursor];
  if (!current) return { error: "review queue is finished", status: 400 as const, queue };
  const project = db.projects.find((p) => p.id === current.projectId);
  if (!project) return { error: "not found" as const, status: 404 as const, queue };
  if (input.expectedRevision && input.expectedRevision !== project.revision) {
    return { error: "revision conflict", code: "REVISION" as const, status: 409 as const, queue, project };
  }
  if (queue.kind === "look") {
    if (input.decision === "approve") {
      if (!input.checklist) return { error: "Check every item before approving.", code: "CHECKLIST" as const, status: 400 as const, queue, project };
      const candidate = (project.candidates || []).find((row) => row.id === input.candidateId);
      if (!candidate || candidate.status !== "ready" || !candidate.url) {
        return { error: "Pick a ready candidate.", status: 400 as const, queue, project };
      }
      for (const other of project.candidates || []) {
        if (other.revision === project.revision && other.decision === "approved") other.decision = "pending";
      }
      candidate.decision = "approved";
      project.approvedStillId = candidate.id;
      project.approvedStillUrl = candidate.url;
      project.stage = "READY_FOR_MOTION";
    } else if (input.decision === "revision") {
      if (!input.note?.trim()) return { error: "Needs Revision requires a reason.", status: 400 as const, queue, project };
      const candidate = (project.candidates || []).find((row) => row.id === input.candidateId) || project.candidates.find((row) => row.status === "ready");
      if (candidate) {
        candidate.decision = "revision";
        candidate.reviewNote = input.note.trim();
      }
      project.attention = input.note.trim();
      project.stage = "DRAFT";
    }
  } else {
    const render = (project.renders || []).find((row) => row.id === (input.renderId || current.renderId));
    if (!render) return { error: "render not found", status: 404 as const, queue, project };
    if (input.decision === "approve") {
      if (!input.checklist) return { error: "Check every item before approving.", code: "CHECKLIST" as const, status: 400 as const, queue, project };
      if (render.status !== "ready") return { error: "This render is not ready to approve.", status: 400 as const, queue, project };
      render.decision = "approved";
      if (!(project.renders || []).some((row) => row.primary && row.decision === "approved")) render.primary = true;
    } else if (input.decision === "revision") {
      if (!input.note?.trim()) return { error: "Needs Revision requires a reason.", status: 400 as const, queue, project };
      render.decision = "rejected";
      project.attention = input.note.trim();
    } else render.decision = "skipped";
    settleRenderStage(project);
  }
  queue.decisions.push({
    projectId: project.id,
    subjectId: input.candidateId || input.renderId || current.renderId || project.id,
    decision: input.decision,
    at: new Date().toISOString(),
  });
  queue.cursor += 1;
  project.updatedAt = new Date().toISOString();
  writeFashionDb(db);
  return { queue, project, status: 200 as const };
}

function settleRenderStage(project: FashionProject) {
  const renders = project.renders || [];
  const queued = renders.some((row) => row.status === "queued" || row.status === "reconciling");
  const pending = renders.some((row) => row.status === "ready" && row.decision === "pending");
  const failed = renders.some((row) => row.status === "failed");
  const approved = renders.some((row) => row.decision === "approved");
  if (queued) project.stage = "IN_PRODUCTION";
  else if (pending || failed) project.stage = "PENDING_REVIEW";
  else if (approved) project.stage = "COMPLETED";
  else if (project.approvedStillId) project.stage = "READY_FOR_MOTION";
  if (failed && !project.attention) project.attention = "A video target failed. Approved renders can still be exported.";
}

export function decideRender(projectId: string, renderId: string, decision: "approved" | "rejected" | "skipped", primary?: boolean) {
  const db = readFashionDb();
  const project = db.projects.find((p) => p.id === projectId);
  if (!project) return { error: "not found" as const };
  const render = (project.renders || []).find((row) => row.id === renderId);
  if (!render) return { error: "render not found" as const };
  if (decision === "approved" && render.status !== "ready") return { error: "render is not ready" as const };
  render.decision = decision;
  if (primary) {
    for (const other of project.renders || []) other.primary = other.id === render.id;
  }
  settleRenderStage(project);
  project.updatedAt = new Date().toISOString();
  writeFashionDb(db);
  return { project };
}

export function seedFixtureRenders(projectId: string, failOne = false) {
  const db = readFashionDb();
  const project = db.projects.find((p) => p.id === projectId);
  if (!project) return { error: "not found" as const };
  let failed = false;
  for (const render of project.renders || []) {
    if (render.status !== "queued") continue;
    if (failOne && !failed) {
      render.status = "failed";
      render.source = "fixture";
      failed = true;
      continue;
    }
    render.status = "ready";
    render.source = "fixture";
    render.decision = "pending";
  }
  if (failed) project.attention = "One fixture render failed. Successful rows stay reviewable.";
  for (const batch of db.batches) {
    for (const item of batch.items || []) {
      if (item.projectId !== project.id || item.target !== "video" || item.state !== "queued") continue;
      const render = (project.renders || []).find((row) => row.id === item.refId);
      if (render && render.status !== "queued") item.state = render.status === "stopped" ? "stopped" : "held";
    }
  }
  settleRenderStage(project);
  project.updatedAt = new Date().toISOString();
  writeFashionDb(db);
  return { project, fixture: true as const };
}

export function exportApproved(projectIds?: string[]) {
  const db = readFashionDb();
  const ids = projectIds?.length ? new Set(projectIds) : null;
  const renders = [];
  for (const project of db.projects) {
    if (project.archived) continue;
    if (ids && !ids.has(project.id)) continue;
    for (const render of project.renders || []) {
      if (render.decision !== "approved") continue;
      renders.push({
        projectId: project.id,
        look: project.name,
        renderId: render.id,
        url: render.url || "",
        source: render.source,
        primary: Boolean(render.primary),
        file: Boolean(render.url),
      });
    }
  }
  return {
    renders,
    approved: renders.length,
    files: renders.filter((row) => row.file).length,
    fixtures: renders.filter((row) => row.source === "fixture").length,
    note: "Every approved render is listed. A fixture row is not a video file.",
  };
}

export function searchableProject(project: FashionProject) {
  const domains = project.items
    .map((item) => {
      try {
        return new URL(item.sourceUrl).hostname;
      } catch {
        return "";
      }
    })
    .join(" ");
  return `${project.name} ${project.items.map((item) => `${item.title} ${item.sourceUrl}`).join(" ")} ${domains}`.toLowerCase();
}

export function projectNeedsAttention(project: FashionProject) {
  if (project.attention) return true;
  if ((project.candidates || []).some((c) => c.status === "failed" || c.blocked)) return true;
  if ((project.renders || []).some((r) => r.status === "failed" || r.status === "reconciling")) return true;
  return false;
}

export function assignMotionBulk(
  projectIds: string[],
  mode: "same" | "map" | "multiple",
  motions: { label: string; assetUrl: string; trimIn?: number; trimOut?: number }[],
  map?: { projectId: string; motions: { label: string; assetUrl: string; trimIn?: number; trimOut?: number }[] }[],
) {
  const skipped: { projectId: string; reason: string }[] = [];
  const pairs: { projectId: string; label: string; assetUrl: string }[] = [];
  if (mode === "map") {
    for (const row of map || []) {
      const result = assignMotions(row.projectId, row.motions || []);
      if ("error" in result && result.error) skipped.push({ projectId: row.projectId, reason: result.error });
      else for (const motion of result.project?.motions || []) pairs.push({ projectId: row.projectId, label: motion.label, assetUrl: motion.assetUrl });
    }
    return { pairs, skipped, mode };
  }
  for (const id of projectIds) {
    const result = assignMotions(id, motions);
    if ("error" in result && result.error) skipped.push({ projectId: id, reason: result.error });
    else for (const motion of result.project?.motions || []) pairs.push({ projectId: id, label: motion.label, assetUrl: motion.assetUrl });
  }
  return { pairs, skipped, mode };
}
