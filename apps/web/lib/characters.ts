import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { SLOT_DEFS, type SlotKey } from "./character-prompts";
import type { Character, CharacterEdit, CharacterSlot, CharacterSource } from "./character-types";
import { characterFile, charactersDbFile, ensureDataDirs, mediaUrlToPath } from "./paths";
import { deleteJobsByMediaUrl } from "./store";

export type { Character, CharacterSlot, CharacterSource };

type Store = { characters: Character[] };

const SEEDED_PLATE = "ad2564de-7a2c-41b4-8923-54e89f2ab9cd";

function emptySlots(): CharacterSlot[] {
  return SLOT_DEFS.map((s) => ({
    key: s.key,
    label: s.label,
    group: s.group,
    prompt: s.prompt,
    url: null,
  }));
}

function isOldTurnaroundPrompt(prompt: string | undefined) {
  const p = (prompt ?? "").trim();
  if (!p) return true;
  return p.includes("Full-body turnaround");
}

function mergeSlots(existing: CharacterSlot[] | undefined): CharacterSlot[] {
  const byKey = new Map((existing ?? []).map((s) => [s.key, s]));
  return SLOT_DEFS.map((def) => {
    const old = byKey.get(def.key);
    if (!old) {
      return { key: def.key, label: def.label, group: def.group, prompt: def.prompt, url: null };
    }
    const useLibrary =
      def.group === "turnaround" && (isOldTurnaroundPrompt(old.prompt) || !old.prompt?.trim());
    return {
      ...old,
      key: def.key,
      label: def.label,
      group: def.group,
      prompt: useLibrary ? def.prompt : old.prompt?.trim() || def.prompt,
    };
  });
}

function readStore(): Store {
  ensureDataDirs();
  const file = charactersDbFile();
  if (!fs.existsSync(file)) return seedIfEmpty({ characters: [] });
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Store;
    if (!Array.isArray(parsed.characters)) return seedIfEmpty({ characters: [] });
    return seedIfEmpty(parsed);
  } catch {
    return seedIfEmpty({ characters: [] });
  }
}

function writeStore(store: Store) {
  fs.writeFileSync(charactersDbFile(), JSON.stringify(store, null, 2), "utf8");
}

function migrateSlots(store: Store): Store {
  let dirty = false;
  for (const row of store.characters) {
    const merged = mergeSlots(row.slots);
    if (
      merged.length !== row.slots.length ||
      merged.some(
        (s, i) =>
          s.key !== row.slots[i]?.key ||
          s.group !== row.slots[i]?.group ||
          s.prompt !== row.slots[i]?.prompt,
      )
    ) {
      row.slots = merged;
      dirty = true;
    }
  }
  if (dirty) writeStore(store);
  return store;
}

function seedIfEmpty(store: Store): Store {
  if (store.characters.length) return migrateSlots(store);
  const plate = characterFile(SEEDED_PLATE, "png");
  if (!fs.existsSync(plate)) return store;
  const now = new Date().toISOString();
  store.characters.push({
    id: SEEDED_PLATE,
    name: "Skin-real plate",
    source: "prompt",
    sourcePrompt: "Skin-real Klein identity plate (pores / peach fuzz).",
    identityUrl: `/api/media/characters/${SEEDED_PLATE}.png`,
    slots: emptySlots(),
    createdAt: now,
    updatedAt: now,
  });
  writeStore(store);
  return store;
}

export function listCharacters(): Character[] {
  return readStore()
    .characters.slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function listCharactersLite() {
  return listCharacters().map((c) => ({
    id: c.id,
    name: c.name,
    identityUrl: c.identityUrl,
    identityUpscaled: Boolean(c.identityUpscaled),
    updatedAt: c.updatedAt,
    visibility: c.visibility || "private",
    stills: c.slots.filter((s) => s.url).length,
    edits: c.edits?.length ?? 0,
    hasSheet: Boolean(c.slots.find((s) => s.key === "sheet" && s.url)),
    followers: (c.socialAccounts ?? [])
      .filter((a) => a.status === "connected")
      .reduce((n, a) => n + (a.followers || 0), 0),
  }));
}

export function getCharacter(id: string): Character | undefined {
  return readStore().characters.find((c) => c.id === id);
}

export function createCharacter(input: { name?: string; source: CharacterSource; sourcePrompt?: string }): Character {
  const now = new Date().toISOString();
  const name = (input.name ?? "").trim() || "Untitled character";
  const row: Character = {
    id: randomUUID(),
    name,
    source: input.source,
    sourcePrompt: input.sourcePrompt?.trim() || undefined,
    identityUrl: null,
    slots: emptySlots(),
    createdAt: now,
    updatedAt: now,
  };
  const store = readStore();
  store.characters.unshift(row);
  writeStore(store);
  return row;
}

export function updateCharacter(id: string, patch: Partial<Character>): Character | undefined {
  const store = readStore();
  const i = store.characters.findIndex((c) => c.id === id);
  if (i < 0) return undefined;
  const next = { ...store.characters[i], ...patch, id, updatedAt: new Date().toISOString() };
  store.characters[i] = next;
  writeStore(store);
  return next;
}

export function deleteCharacter(id: string): boolean {
  const store = readStore();
  const next = store.characters.filter((c) => c.id !== id);
  if (next.length === store.characters.length) return false;
  writeStore({ characters: next });
  return true;
}

export function setSlot(id: string, key: SlotKey, patch: Partial<CharacterSlot>): Character | undefined {
  const row = getCharacter(id);
  if (!row) return undefined;
  const slots = row.slots.map((s) => (s.key === key ? { ...s, ...patch, key } : s));
  if (!slots.some((s) => s.key === key)) return undefined;
  return updateCharacter(id, { slots });
}

export function addEdit(id: string, edit: CharacterEdit): Character | undefined {
  const row = getCharacter(id);
  if (!row) return undefined;
  return updateCharacter(id, { edits: [edit, ...(row.edits ?? [])] });
}

function unlinkUrl(url?: string | null) {
  if (!url) return;
  const p = mediaUrlToPath(url);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

/** Remove a still or video from this character. Deletes the file. Identity/body lock allowed. */
export function deleteCharacterMedia(id: string, url: string): Character | undefined {
  const row = getCharacter(id);
  if (!row) return undefined;
  const gone = new Set<string>();
  const mark = (u?: string | null) => {
    if (u) gone.add(u);
  };

  let identityUrl = row.identityUrl;
  let identityUrl4k = row.identityUrl4k;
  let identityJobId = row.identityJobId;
  let identityUpscaled = row.identityUpscaled;
  let sourceUrl = row.sourceUrl;
  if (url === row.identityUrl || url === row.identityUrl4k) {
    mark(row.identityUrl);
    mark(row.identityUrl4k);
    identityUrl = null;
    identityUrl4k = null;
    identityJobId = undefined;
    identityUpscaled = false;
  }
  if (url === row.sourceUrl) {
    mark(row.sourceUrl);
    sourceUrl = null;
  }

  const slots = row.slots.map((s) => {
    if (s.url !== url && s.url4k !== url) return s;
    mark(s.url);
    mark(s.url4k);
    return { ...s, url: null, url4k: null, jobId: undefined, upscaled: false };
  });
  const edits = (row.edits ?? []).filter((e) => {
    if (e.url !== url && e.url4k !== url) return true;
    mark(e.url);
    mark(e.url4k);
    return false;
  });

  mark(url);
  for (const u of gone) unlinkUrl(u);
  for (const u of gone) deleteJobsByMediaUrl(u);

  const inspiration = (row.inspiration ?? []).filter((p) => !gone.has(p.url));

  return updateCharacter(id, {
    identityUrl,
    identityUrl4k,
    identityJobId,
    identityUpscaled,
    sourceUrl,
    slots,
    edits,
    inspiration,
  });
}

export function toggleInspiration(
  id: string,
  item: { url: string; kind: "image" | "video"; label?: string },
): Character | undefined {
  const row = getCharacter(id);
  if (!row) return undefined;
  const url = item.url.trim();
  if (!url) return row;
  const current = row.inspiration ?? [];
  const exists = current.some((p) => p.url === url);
  const inspiration = exists
    ? current.filter((p) => p.url !== url)
    : [{ url, kind: item.kind, label: item.label, addedAt: new Date().toISOString() }, ...current].slice(0, 48);
  return updateCharacter(id, { inspiration });
}
