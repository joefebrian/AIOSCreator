import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataRoot, ensureDataDirs } from "./paths";
import type { UgcAnalysis } from "./ugc-references";

export type BeatRole = "hook" | "problem" | "demo" | "proof" | "objection" | "cta";

export type BlueprintBeat = {
  id: string;
  role: BeatRole;
  startSec: number | null;
  endSec: number | null;
  evidence: string | null;
  uncertainty: string | null;
};

export type BlueprintShot = {
  id: string;
  beatId: string | null;
  startSec: number;
  endSec: number;
  framing: string | null;
  action: string | null;
  onScreen: string | null;
  audio: string;
  speech?: { startSec: number; endSec: number; text: string }[];
  uncertainty: string | null;
};

export type ReferenceBlueprint = {
  id: string;
  referenceId: string;
  productId: string;
  analysisVersion: number;
  version: number;
  beats: BlueprintBeat[];
  shots: BlueprintShot[];
  /** Optional sales labels that were not observed. They are not empty scenes. */
  omissions?: { role: BeatRole; status: "not_present" | "not_analyzed"; note: string }[];
  reviewed: boolean;
  updatedAt: string;
};

type Db = { blueprints: ReferenceBlueprint[] };

const ROLES: BeatRole[] = ["hook", "problem", "demo", "proof", "objection", "cta"];
const CTA = /\b(buy|shop|order|tap|click|link in bio|follow|comment|share|subscribe|use code|check (it|this) out|grab yours)\b/i;

let rootOverride: string | null = null;

export function setReferenceBlueprintRootForTests(dir: string | null) {
  rootOverride = dir;
}

function filePath() {
  const root = rootOverride || dataRoot();
  if (rootOverride) fs.mkdirSync(path.join(root, "db"), { recursive: true });
  else ensureDataDirs();
  return path.join(root, "db", "ugc-reference-blueprints.json");
}

function readDb(): Db {
  const file = filePath();
  if (!fs.existsSync(file)) return { blueprints: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Db;
    return { blueprints: Array.isArray(raw.blueprints) ? raw.blueprints : [] };
  } catch {
    return { blueprints: [] };
  }
}

function writeDb(db: Db) {
  fs.writeFileSync(filePath(), JSON.stringify(db, null, 2), "utf8");
}

function audioLabel(audio: UgcAnalysis["audio"]) {
  if (audio === "present") return "Audio track present. Speech is separate.";
  if (audio === "silent") return "Audio track is silent.";
  if (audio === "no-audio") return "No audio track.";
  return "Audio was not measured.";
}

/** Structure already measured. Does not write new words. */
export function deriveBlueprint(referenceId: string, productId: string, analysis: UgcAnalysis): Omit<ReferenceBlueprint, "id" | "updatedAt"> {
  if (analysis.version == null) throw new Error("Analyze the saved video before building a blueprint.");
  const transcript = analysis.transcript || [];
  const shotsIn = analysis.beats || [];
  const onScreen = (analysis.candidateFacts || []).filter((fact) => fact.source === "on-screen");
  const hookLine = transcript.find((line) => line.startSec < 3) || null;
  const ctaLine = transcript.find((line) => CTA.test(line.text)) || null;
  const beats: BlueprintBeat[] = [];
  const omissions: { role: BeatRole; status: "not_present" | "not_analyzed"; note: string }[] = [];
  if (hookLine) {
    beats.push({
      id: "beat-hook",
      role: "hook",
      startSec: hookLine.startSec,
      endSec: hookLine.endSec,
      evidence: hookLine.text,
      uncertainty: "Source creator appearance. Not a product result.",
    });
  } else omissions.push({ role: "hook", status: "not_present", note: "No opening line was measured." });
  if (ctaLine) {
    beats.push({ id: "beat-cta", role: "cta", startSec: ctaLine.startSec, endSec: ctaLine.endSec, evidence: ctaLine.text, uncertainty: null });
  } else if (analysis.pattern?.cta) {
    beats.push({ id: "beat-cta", role: "cta", startSec: null, endSec: null, evidence: analysis.pattern.cta, uncertainty: "A CTA was noted without a source time." });
  } else omissions.push({ role: "cta", status: "not_present", note: "The transcript was searched. No CTA line was present." });
  if (analysis.pattern?.demo) beats.push({ id: "beat-demo", role: "demo", startSec: null, endSec: null, evidence: analysis.pattern.demo, uncertainty: "The demo note has no source time range." });
  else omissions.push({ role: "demo", status: "not_analyzed", note: "No demo label was produced. Visible actions stay on the shots." });
  if (analysis.pattern?.proof) beats.push({ id: "beat-proof", role: "proof", startSec: null, endSec: null, evidence: analysis.pattern.proof, uncertainty: "The proof note has no source time range." });
  else omissions.push({ role: "proof", status: "not_analyzed", note: "No proof label was produced." });
  if (analysis.pattern?.objections?.length) beats.push({ id: "beat-objection", role: "objection", startSec: null, endSec: null, evidence: analysis.pattern.objections.join(" "), uncertainty: "The objection note has no source time range." });
  else omissions.push({ role: "objection", status: "not_analyzed", note: "No objection label was produced." });
  omissions.push({ role: "problem", status: "not_analyzed", note: "No problem label was produced. Speech stays on the shots." });
  const shots: BlueprintShot[] = shotsIn.map((shot, index) => {
    const startSec = shot.startSec ?? 0;
    const endSec = shot.endSec ?? startSec;
    const mid = (startSec + endSec) / 2;
    const beat = beats.find((item) => item.startSec != null && item.endSec != null && mid >= item.startSec && mid <= item.endSec);
    const speech = transcript.filter((line) => line.startSec < endSec && line.endSec > startSec).map((line) => ({ startSec: line.startSec, endSec: line.endSec, text: line.text }));
    const caption = onScreen.find((item) => item.startSec != null && item.startSec >= startSec - 0.4 && item.startSec <= endSec + 0.4 && item.statement !== shot.productAction);
    const notes = [];
    if (!analysis.framing?.observed) notes.push("Framing was not analyzed.");
    if (!shot.productAction) notes.push("Visible action was not described for this cut.");
    if (!speech.length) notes.push("No speech falls in this cut.");
    return {
      id: `shot-${index + 1}`,
      beatId: beat?.id || null,
      startSec,
      endSec,
      framing: analysis.framing?.observed ? analysis.framing.text : null,
      action: shot.productAction,
      onScreen: caption?.statement || null,
      audio: audioLabel(analysis.audio),
      speech,
      uncertainty: notes.join(" ") || null,
    };
  });
  return { referenceId, productId, analysisVersion: analysis.version, version: 1, beats, shots, omissions, reviewed: false };
}

export function listReferenceBlueprints(productId: string) {
  return readDb().blueprints.filter((row) => row.productId === productId);
}

export function ensureReferenceBlueprint(referenceId: string, productId: string, analysis: UgcAnalysis) {
  const db = readDb();
  const found = db.blueprints.find((row) => row.referenceId === referenceId && row.analysisVersion === analysis.version);
  if (found) return { blueprint: found, created: false };
  const stamp = new Date().toISOString();
  const blueprint: ReferenceBlueprint = { ...deriveBlueprint(referenceId, productId, analysis), id: randomUUID(), updatedAt: stamp };
  db.blueprints.unshift(blueprint);
  writeDb(db);
  return { blueprint, created: true };
}

/** Keeps earlier blueprint rows. The next version is derived again from the same analysis. */
export function saveBlueprintRevision(referenceId: string, productId: string, analysis: UgcAnalysis) {
  const db = readDb();
  const siblings = db.blueprints.filter((row) => row.referenceId === referenceId && row.analysisVersion === analysis.version);
  const version = siblings.reduce((max, row) => Math.max(max, row.version), 0) + 1;
  const blueprint: ReferenceBlueprint = {
    ...deriveBlueprint(referenceId, productId, analysis),
    id: randomUUID(),
    version,
    reviewed: false,
    updatedAt: new Date().toISOString(),
  };
  db.blueprints.unshift(blueprint);
  writeDb(db);
  return blueprint;
}

export function latestBlueprint(referenceId: string, analysisVersion: number) {
  return readDb().blueprints
    .filter((row) => row.referenceId === referenceId && row.analysisVersion === analysisVersion)
    .sort((a, b) => b.version - a.version)[0] || null;
}

export function pinnedBlueprintStale(pin: { referenceId: string; analysisVersion: number; blueprintVersion?: number }) {
  if (pin.blueprintVersion == null) return false;
  const latest = latestBlueprint(pin.referenceId, pin.analysisVersion);
  return Boolean(latest && latest.version > pin.blueprintVersion);
}

/** User correction of evidence already on the blueprint. Does not add shots or call a model. */
export function correctReferenceBlueprint(id: string, patch: { beats?: { id: string; evidence?: string | null }[]; shots?: { id: string; action?: string | null; framing?: string | null }[] }) {
  const db = readDb();
  const row = db.blueprints.find((item) => item.id === id);
  if (!row) throw new Error("Blueprint not found");
  let changed = false;
  for (const edit of patch.beats || []) {
    const beat = row.beats.find((item) => item.id === edit.id);
    if (!beat || edit.evidence == null) continue;
    const evidence = String(edit.evidence).replace(/\s+/g, " ").trim() || null;
    if (evidence !== beat.evidence) {
      beat.evidence = evidence;
      changed = true;
    }
  }
  for (const edit of patch.shots || []) {
    const shot = row.shots.find((item) => item.id === edit.id);
    if (!shot) continue;
    if (edit.action != null) {
      const action = String(edit.action).replace(/\s+/g, " ").trim() || null;
      if (action !== shot.action) {
        shot.action = action;
        changed = true;
      }
    }
    if (edit.framing != null) {
      const framing = String(edit.framing).replace(/\s+/g, " ").trim() || null;
      if (framing !== shot.framing) {
        shot.framing = framing;
        changed = true;
      }
    }
  }
  if (!changed) return { blueprint: row, changed: false };
  row.version += 1;
  row.reviewed = false;
  row.updatedAt = new Date().toISOString();
  writeDb(db);
  return { blueprint: row, changed: true };
}

export function updateReferenceBlueprint(id: string, patch: { beats?: BlueprintBeat[]; shots?: BlueprintShot[]; reviewed?: boolean }) {
  const db = readDb();
  const row = db.blueprints.find((item) => item.id === id);
  if (!row) throw new Error("Blueprint not found");
  if (patch.beats) row.beats = patch.beats;
  if (patch.shots) row.shots = patch.shots;
  if (patch.beats || patch.shots) {
    row.version += 1;
    row.reviewed = false;
  }
  if (patch.reviewed != null && !patch.beats && !patch.shots) row.reviewed = patch.reviewed;
  row.updatedAt = new Date().toISOString();
  writeDb(db);
  return row;
}
