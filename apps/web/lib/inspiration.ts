import fs from "node:fs";
import path from "node:path";
import type { CharacterInspiration } from "./character-types";
import { listCharacters, updateCharacter } from "./characters";
import { dataRoot, ensureDataDirs } from "./paths";

type Store = { items: CharacterInspiration[] };

function filePath() {
  ensureDataDirs();
  return path.join(dataRoot(), "db", "inspiration.json");
}

function readStore(): Store {
  const file = filePath();
  if (!fs.existsSync(file)) return { items: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Store;
    return { items: Array.isArray(parsed.items) ? parsed.items : [] };
  } catch {
    return { items: [] };
  }
}

function writeStore(store: Store) {
  fs.writeFileSync(filePath(), JSON.stringify(store, null, 2), "utf8");
}

function seedFromCharacters(items: CharacterInspiration[]) {
  const seen = new Set(items.map((p) => p.url));
  let dirty = false;
  for (const row of listCharacters()) {
    for (const p of row.inspiration ?? []) {
      if (!p.url || seen.has(p.url)) continue;
      seen.add(p.url);
      items.push({ url: p.url, kind: p.kind, label: p.label || row.name, addedAt: p.addedAt });
      dirty = true;
    }
  }
  if (dirty) writeStore({ items });
  return items;
}

export function listInspiration(): CharacterInspiration[] {
  const items = seedFromCharacters(readStore().items);
  return [...items].sort((a, b) => (b.addedAt || "").localeCompare(a.addedAt || ""));
}

export function toggleInspirationShared(item: { url: string; kind: "image" | "video"; label?: string }): CharacterInspiration[] {
  const url = item.url.trim();
  if (!url) return listInspiration();
  const items = seedFromCharacters(readStore().items);
  const exists = items.some((p) => p.url === url);
  const next = exists
    ? items.filter((p) => p.url !== url)
    : [{ url, kind: item.kind, label: item.label, addedAt: new Date().toISOString() }, ...items].slice(0, 80);
  writeStore({ items: next });
  for (const row of listCharacters()) {
    const local = row.inspiration ?? [];
    if (!local.some((p) => p.url === url)) continue;
    updateCharacter(row.id, { inspiration: local.filter((p) => p.url !== url) });
  }
  return next;
}
