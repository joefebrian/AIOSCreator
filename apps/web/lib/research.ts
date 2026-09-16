import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { researchFile } from "./paths";

export type ResearchExtract = {
  id: string;
  url: string;
  kind: "image" | "video";
  imagePrompt: string;
  motionPrompt: string;
  firstFrameUrl?: string;
  model: string;
  tokens: number;
  durationSec?: number;
  windowSec?: number;
  trimmed?: boolean;
  tooShort?: boolean;
  note?: string;
  megaPrompt?: string;
  createdAt: string;
};

type Store = { extracts: ResearchExtract[] };

function readStore(): Store {
  const file = researchFile();
  if (!fs.existsSync(file)) return { extracts: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Store;
    return { extracts: Array.isArray(parsed.extracts) ? parsed.extracts : [] };
  } catch {
    return { extracts: [] };
  }
}

function writeStore(store: Store) {
  fs.writeFileSync(researchFile(), JSON.stringify(store, null, 2), "utf8");
}

export function listResearchExtracts() {
  return readStore().extracts.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function addResearchExtract(row: Omit<ResearchExtract, "id" | "createdAt">): ResearchExtract {
  const next: ResearchExtract = {
    ...row,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };
  const store = readStore();
  store.extracts.unshift(next);
  writeStore({ extracts: store.extracts.slice(0, 200) });
  return next;
}

export function patchResearchExtract(id: string, patch: Partial<Omit<ResearchExtract, "id" | "createdAt">>) {
  const store = readStore();
  const i = store.extracts.findIndex((e) => e.id === id);
  if (i < 0) return null;
  store.extracts[i] = { ...store.extracts[i], ...patch, id: store.extracts[i].id, createdAt: store.extracts[i].createdAt };
  writeStore(store);
  return store.extracts[i];
}

export function deleteResearchExtract(id: string) {
  const store = readStore();
  const n = store.extracts.length;
  store.extracts = store.extracts.filter((e) => e.id !== id);
  if (store.extracts.length === n) return false;
  writeStore(store);
  return true;
}
