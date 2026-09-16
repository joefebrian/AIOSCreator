import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { intelligenceFile } from "./paths";

export type IntelligenceObservation = {
  id: string;
  url: string;
  platform: string;
  market?: string;
  note: string;
  createdAt: string;
};

export type SavedHook = {
  id: string;
  text: string;
  source: string;
  platform: string;
  createdAt: string;
};

type Store = {
  pins: string[];
  excludes: string[];
  observations: IntelligenceObservation[];
  hooks: SavedHook[];
};

function readStore(): Store {
  const file = intelligenceFile();
  if (!fs.existsSync(file)) return { pins: [], excludes: [], observations: [], hooks: [] };
  try {
    const p = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<Store>;
    return {
      pins: Array.isArray(p.pins) ? p.pins : [],
      excludes: Array.isArray(p.excludes) ? p.excludes : [],
      observations: Array.isArray(p.observations) ? p.observations : [],
      hooks: Array.isArray(p.hooks) ? p.hooks : [],
    };
  } catch {
    return { pins: [], excludes: [], observations: [], hooks: [] };
  }
}

function writeStore(store: Store) {
  fs.writeFileSync(intelligenceFile(), JSON.stringify(store, null, 2), "utf8");
}

export function getIntelligence() {
  return readStore();
}

export function pinOpportunity(id: string, on: boolean) {
  const s = readStore();
  s.pins = on ? [...new Set([id, ...s.pins])] : s.pins.filter((x) => x !== id);
  if (on) s.excludes = s.excludes.filter((x) => x !== id);
  writeStore(s);
  return s;
}

export function excludeOpportunity(id: string, on: boolean) {
  const s = readStore();
  s.excludes = on ? [...new Set([id, ...s.excludes])] : s.excludes.filter((x) => x !== id);
  if (on) s.pins = s.pins.filter((x) => x !== id);
  writeStore(s);
  return s;
}

export function addObservation(input: { url: string; note?: string; market?: string; platform?: string }) {
  const s = readStore();
  const row: IntelligenceObservation = {
    id: randomUUID(),
    url: input.url.trim(),
    platform: input.platform || platformFromUrl(input.url),
    market: input.market?.trim() || undefined,
    note: (input.note || "").trim(),
    createdAt: new Date().toISOString(),
  };
  s.observations.unshift(row);
  writeStore({ ...s, observations: s.observations.slice(0, 200) });
  return row;
}

export function deleteObservation(id: string) {
  const s = readStore();
  s.observations = s.observations.filter((o) => o.id !== id);
  writeStore(s);
  return s;
}

export function saveHook(input: { text: string; source?: string; platform?: string }) {
  const text = input.text.trim();
  if (!text) throw new Error("hook text required");
  const s = readStore();
  const existing = s.hooks.find((h) => h.text.toLowerCase() === text.toLowerCase());
  if (existing) return existing;
  const row: SavedHook = {
    id: randomUUID(),
    text,
    source: input.source || "operator",
    platform: input.platform || "any",
    createdAt: new Date().toISOString(),
  };
  s.hooks.unshift(row);
  writeStore({ ...s, hooks: s.hooks.slice(0, 200) });
  return row;
}

export function deleteHook(id: string) {
  const s = readStore();
  s.hooks = s.hooks.filter((h) => h.id !== id);
  writeStore(s);
  return s;
}

export function platformFromUrl(url: string) {
  const u = url.toLowerCase();
  if (u.includes("tiktok.com")) return "tiktok";
  if (u.includes("youtube.com") || u.includes("youtu.be")) return "youtube";
  if (u.includes("instagram.com")) return "instagram";
  if (u.includes("x.com/") || u.includes("twitter.com")) return "x";
  if (u.includes("amazon.")) return "amazon";
  return "other";
}
