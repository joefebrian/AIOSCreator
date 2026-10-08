import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataRoot, ensureDataDirs } from "./paths";
import type { TranscriptStatus, UgcAnalysis } from "./ugc-references";

export type CreativePattern = {
  hook: string | null;
  beats: string[];
  demo: string | null;
  objections: string[];
  proof: string | null;
  cta: string | null;
  pacing: string | null;
};

export type ReferenceScript = {
  id: string;
  productId: string;
  skuId: string;
  referenceId: string;
  analysisVersion: number;
  creator: string | null;
  transcriptStatus: TranscriptStatus;
  transcript: UgcAnalysis["transcript"];
  pattern: CreativePattern;
  createdAt: string;
};

type Db = { scripts: ReferenceScript[] };

let rootOverride: string | null = null;

export function setReferenceScriptsRootForTests(dir: string | null) {
  rootOverride = dir;
}

function filePath() {
  const root = rootOverride || dataRoot();
  if (rootOverride) fs.mkdirSync(path.join(root, "db"), { recursive: true });
  else ensureDataDirs();
  return path.join(root, "db", "ugc-reference-scripts.json");
}

function readDb(): Db {
  const file = filePath();
  if (!fs.existsSync(file)) return { scripts: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Db;
    return { scripts: Array.isArray(raw.scripts) ? raw.scripts : [] };
  } catch {
    return { scripts: [] };
  }
}

function writeDb(db: Db) {
  fs.writeFileSync(filePath(), JSON.stringify(db, null, 2), "utf8");
}

export function listReferenceScripts(productId: string) {
  return readDb().scripts.filter((row) => row.productId === productId);
}

export function saveReferenceScript(input: Omit<ReferenceScript, "id" | "createdAt">) {
  const db = readDb();
  const found = db.scripts.find((row) => row.referenceId === input.referenceId && row.analysisVersion === input.analysisVersion);
  if (found) return { script: found, created: false };
  const script: ReferenceScript = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
  db.scripts.unshift(script);
  writeDb(db);
  return { script, created: true };
}
