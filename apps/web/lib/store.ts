import fs from "node:fs";
import { jobsFile, scriptFile, ensureDataDirs } from "./paths";
import { listResearchExtracts } from "./research";
import { getIntelligence } from "./intelligence";

export type JobStatus = "queued" | "running" | "completed" | "failed";
export type ModuleId =
  | "research"
  | "content"
  | "production"
  | "distribution"
  | "engagement"
  | "analytics"
  | "monetization";

export type Job = {
  id: string;
  module: ModuleId;
  kind: "script" | "image" | "motion" | "character" | "export" | "voice" | "factory";
  input: string;
  status: JobStatus;
  error?: string;
  scriptPath?: string;
  mediaPath?: string;
  mediaUrl?: string;
  script?: {
    title: string;
    hook: string;
    voiceover: string;
    scenes: string[];
    cta: string;
    platforms: string[];
    format?: string;
    hookVisual?: string;
    firstFrame?: string;
    beats?: { t: string; spoken: string; visual: string }[];
    ctaVisual?: string;
  };
  model?: string;
  /** Billed pipe: comet | openai | byteplus | kling | wavespeed | comfy */
  provider?: string;
  progress?: string;
  characterId?: string;
  productId?: string;
  /** studio = AI Studio graph GEN. workspace = character tools. ugc-factory = Factory only. */
  source?: "studio" | "workspace" | "ugc-factory" | "ugc-fashion" | "motion";
  /** generated_video is a provider clip. listing_still is the catalog photo, not a generated shot. */
  sourceKind?: "generated_video" | "generated_still" | "listing_still" | "uploaded";
  nodeId?: string;
  upscaled?: boolean;
  jev?: { inventedClaim?: number; speakPrice?: number; model?: string };
  stillUrl?: string;
  concepts?: {
    title: string;
    format?: string;
    hook: string;
    hookVisual?: string;
    firstFrame?: string;
    beats: { t: string; spoken: string; visual: string }[];
    cta: string;
    ctaVisual?: string;
    voiceover: string;
    scenes: string[];
    platforms: string[];
  }[];
  createdAt: string;
  updatedAt: string;
};

type Db = { jobs: Job[] };

function readDb(): Db {
  ensureDataDirs();
  const file = jobsFile();
  if (!fs.existsSync(file)) return { jobs: [] };
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as Db;
  } catch {
    return { jobs: [] };
  }
}

function writeDb(db: Db) {
  fs.writeFileSync(jobsFile(), JSON.stringify(db, null, 2), "utf8");
}

export function listJobs(): Job[] {
  return readDb()
    .jobs.slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getJob(id: string): Job | undefined {
  return readDb().jobs.find((j) => j.id === id);
}

export function jobBelongsToCharacter(job: Job, characterId: string): boolean {
  if (!characterId) return false;
  if (job.characterId === characterId) return true;
  const blob = `${job.input || ""} ${job.mediaUrl || ""} ${job.mediaPath || ""}`;
  return blob.includes(characterId);
}

export function insertJob(job: Job): Job {
  const db = readDb();
  db.jobs.push(job);
  writeDb(db);
  return job;
}

export function deleteJob(id: string): boolean {
  const db = readDb();
  const n = db.jobs.length;
  db.jobs = db.jobs.filter((j) => j.id !== id);
  if (db.jobs.length === n) return false;
  writeDb(db);
  return true;
}

export function deleteJobsByMediaUrl(url: string): string[] {
  const db = readDb();
  const removed: string[] = [];
  db.jobs = db.jobs.filter((j) => {
    if (j.mediaUrl === url) {
      removed.push(j.id);
      return false;
    }
    return true;
  });
  if (removed.length) writeDb(db);
  return removed;
}

export function updateJob(id: string, patch: Partial<Job>): Job | undefined {
  const db = readDb();
  const i = db.jobs.findIndex((j) => j.id === id);
  if (i < 0) return undefined;
  db.jobs[i] = { ...db.jobs[i], ...patch, updatedAt: new Date().toISOString() };
  writeDb(db);
  return db.jobs[i];
}

export function saveScriptMarkdown(id: string, body: string) {
  const file = scriptFile(id);
  fs.writeFileSync(file, body, "utf8");
  return file;
}

export function liveModules(): ModuleId[] {
  const live = new Set<ModuleId>();
  for (const job of listJobs()) {
    if (job.status === "completed") live.add(job.module);
  }
  if (listResearchExtracts().length) live.add("research");
  const intel = getIntelligence();
  if (intel.hooks.length || intel.observations.length || intel.pins.length) live.add("analytics");
  return [...live];
}
