import fs from "node:fs";
import path from "node:path";
import { dataRoot, ensureDataDirs } from "./paths";
import { emptyWizardDraft, type WizardDraft } from "./factory-wizard";

type Db = { drafts: WizardDraft[] };

function filePath() {
  ensureDataDirs();
  return path.join(dataRoot(), "db", "ugc-factory-wizard.json");
}

function readDb(): Db {
  const file = filePath();
  if (!fs.existsSync(file)) return { drafts: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Db;
    return { drafts: Array.isArray(parsed.drafts) ? parsed.drafts : [] };
  } catch {
    return { drafts: [] };
  }
}

function writeDb(db: Db) {
  const file = filePath();
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, file);
}

export function readWizardDraft(id: string) {
  return readDb().drafts.find((row) => row.id === id) || null;
}

export function latestWizardDraft() {
  const drafts = readDb().drafts;
  return drafts[drafts.length - 1] || null;
}

export function saveWizardDraft(draft: WizardDraft) {
  const db = readDb();
  const index = db.drafts.findIndex((row) => row.id === draft.id);
  const next = { ...draft, updatedAt: new Date().toISOString() };
  if (index >= 0) db.drafts[index] = next;
  else db.drafts.push(next);
  db.drafts = db.drafts.slice(-20);
  writeDb(db);
  return next;
}

export function patchWizardDraft(id: string, patch: Partial<WizardDraft>) {
  const current = readWizardDraft(id) || emptyWizardDraft(id);
  return saveWizardDraft({ ...current, ...patch, id });
}
