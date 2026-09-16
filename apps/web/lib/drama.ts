import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { dramasFile } from "./paths";

export type ShotStatus = "draft" | "prepared" | "still" | "video";
export type DramaStage = "script" | "board" | "generate" | "export";
export type ShotSize = "ECU" | "CU" | "MCU" | "MS" | "WS";

export type DramaEntities = {
  characters: string[];
  scenes: string[];
  props: string[];
  costumes: string[];
};

export type DramaShot = {
  id: string;
  index: number;
  title: string;
  summary: string;
  dialogue: string;
  durationSec: number;
  imagePrompt: string;
  videoPrompt: string;
  framing: ShotSize;
  camera: string;
  emotion: string;
  location: string;
  wardrobe: string;
  cast: string[];
  stillUrl?: string;
  videoUrl?: string;
  stillJobId?: string;
  videoJobId?: string;
};

export type Drama = {
  id: string;
  title: string;
  logline: string;
  script: string;
  characterId?: string;
  characterName?: string;
  aspect: "9:16";
  style: "photoreal";
  stage: DramaStage;
  entities: DramaEntities;
  shots: DramaShot[];
  episodeUrl?: string;
  createdAt: string;
  updatedAt: string;
};

type Store = { dramas: Drama[] };

const EMPTY_ENTITIES: DramaEntities = { characters: [], scenes: [], props: [], costumes: [] };

function migrateShot(s: Partial<DramaShot>, i: number): DramaShot {
  return {
    id: s.id || randomUUID(),
    index: s.index ?? i,
    title: s.title || `Shot ${i + 1}`,
    summary: s.summary || "",
    dialogue: s.dialogue || "",
    durationSec: Math.min(8, Math.max(4, Number(s.durationSec) || 5)),
    imagePrompt: s.imagePrompt || "",
    videoPrompt: s.videoPrompt || "",
    framing: (s.framing as ShotSize) || "MCU",
    camera: s.camera || "locked-off",
    emotion: s.emotion || "neutral",
    location: s.location || "",
    wardrobe: s.wardrobe || "",
    cast: Array.isArray(s.cast) ? s.cast : [],
    stillUrl: s.stillUrl,
    videoUrl: s.videoUrl,
    stillJobId: s.stillJobId,
    videoJobId: s.videoJobId,
  };
}

function migrateDrama(d: Partial<Drama> & { id: string }): Drama {
  const shots = (d.shots || []).map(migrateShot);
  const stage: DramaStage =
    d.stage ||
    (d.episodeUrl ? "export" : shots.some((s) => s.videoUrl) ? "generate" : shots.length ? "board" : "script");
  return {
    id: d.id,
    title: d.title || "Untitled",
    logline: d.logline || "",
    script: d.script || "",
    characterId: d.characterId,
    characterName: d.characterName,
    aspect: "9:16",
    style: "photoreal",
    stage,
    entities: d.entities || EMPTY_ENTITIES,
    shots,
    episodeUrl: d.episodeUrl,
    createdAt: d.createdAt || new Date().toISOString(),
    updatedAt: d.updatedAt || new Date().toISOString(),
  };
}

function shotStatus(s: DramaShot): ShotStatus {
  if (s.videoUrl) return "video";
  if (s.stillUrl) return "still";
  if (s.imagePrompt && s.videoPrompt) return "prepared";
  return "draft";
}

export function dramaShotStatus(s: DramaShot) {
  return shotStatus(s);
}

export function dramaReadyCount(d: Drama) {
  const prepared = d.shots.filter((s) => shotStatus(s) !== "draft").length;
  const stills = d.shots.filter((s) => s.stillUrl).length;
  const videos = d.shots.filter((s) => s.videoUrl).length;
  const totalSec = d.shots.reduce((n, s) => n + (s.durationSec || 0), 0);
  return { prepared, stills, videos, total: d.shots.length, totalSec };
}

function readStore(): Store {
  const file = dramasFile();
  if (!fs.existsSync(file)) return { dramas: [] };
  try {
    const p = JSON.parse(fs.readFileSync(file, "utf8")) as Store;
    return { dramas: Array.isArray(p.dramas) ? p.dramas.map(migrateDrama) : [] };
  } catch {
    return { dramas: [] };
  }
}

function writeStore(store: Store) {
  fs.writeFileSync(dramasFile(), JSON.stringify(store, null, 2), "utf8");
}

export function listDramas() {
  return readStore().dramas.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getDrama(id: string) {
  return readStore().dramas.find((d) => d.id === id);
}

export function upsertDrama(row: Drama) {
  const store = readStore();
  const i = store.dramas.findIndex((d) => d.id === row.id);
  const next = migrateDrama({ ...row, updatedAt: new Date().toISOString() });
  if (i < 0) store.dramas.unshift(next);
  else store.dramas[i] = next;
  writeStore(store);
  return next;
}

export function createDrama(input: {
  title: string;
  script: string;
  logline?: string;
  characterId?: string;
  characterName?: string;
}): Drama {
  const now = new Date().toISOString();
  return upsertDrama({
    id: randomUUID(),
    title: input.title.trim() || "Untitled short drama",
    logline: (input.logline || "").trim(),
    script: input.script.trim(),
    characterId: input.characterId,
    characterName: input.characterName,
    aspect: "9:16",
    style: "photoreal",
    stage: "script",
    entities: EMPTY_ENTITIES,
    shots: [],
    createdAt: now,
    updatedAt: now,
  });
}

export function patchDrama(id: string, patch: Partial<Drama>) {
  const cur = getDrama(id);
  if (!cur) return null;
  return upsertDrama({ ...cur, ...patch, id: cur.id, createdAt: cur.createdAt });
}

export function patchShot(dramaId: string, shotId: string, patch: Partial<DramaShot>) {
  const cur = getDrama(dramaId);
  if (!cur) return null;
  const shots = cur.shots.map((s) => (s.id === shotId ? migrateShot({ ...s, ...patch, id: s.id, index: s.index }, s.index) : s));
  return upsertDrama({ ...cur, shots });
}

export function deleteDrama(id: string) {
  const store = readStore();
  const n = store.dramas.length;
  store.dramas = store.dramas.filter((d) => d.id !== id);
  if (store.dramas.length === n) return false;
  writeStore(store);
  return true;
}
