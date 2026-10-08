import fs from "node:fs";
import path from "node:path";
import { dataRoot, ensureDataDirs } from "./paths";

/** One folder per Create/Intelligence menu. New files: AIOSCreator-{Folder}-{id}.ext */
export const MEDIA_MENUS = {
  "ugc-factory": { folder: "UGC_Factory", label: "UGC Factory" },
  "ugc-fashion": { folder: "UGC_Fashion", label: "UGC Fashion" },
  studio: { folder: "AI_Studio", label: "AI Studio" },
  characters: { folder: "Characters", label: "Characters" },
  motion: { folder: "MotionControl", label: "MotionControl" },
  "short-drama": { folder: "ShortDrama", label: "ShortDrama" },
  research: { folder: "Research", label: "Research" },
  products: { folder: "Products", label: "Products" },
} as const;

export type MediaMenuId = keyof typeof MEDIA_MENUS;

export function menuFolder(menu: MediaMenuId) {
  return MEDIA_MENUS[menu].folder;
}

export function menuFileName(menu: MediaMenuId, id: string, ext: string) {
  const e = ext.replace(/^\./, "").toLowerCase();
  const safe = id.replace(/[^a-zA-Z0-9._-]/g, "");
  return `AIOSCreator-${MEDIA_MENUS[menu].folder}-${safe}.${e}`;
}

export function menuDir(menu: MediaMenuId) {
  const dir = path.join(ensureDataDirs(), "media", MEDIA_MENUS[menu].folder);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function menuAsset(menu: MediaMenuId, id: string, ext: string) {
  const name = menuFileName(menu, id, ext);
  return {
    name,
    path: path.join(menuDir(menu), name),
    url: `/api/media/${MEDIA_MENUS[menu].folder}/${name}`,
  };
}

export function isFactoryMediaUrl(url: string) {
  return /\/api\/media\/(UGC_Factory|factory)\//i.test(url || "");
}

/** True when a served /api/media URL or a stored mediaPath still points at a file. */
export function mediaFileExists(url?: string, mediaPath?: string) {
  if (mediaPath && fs.existsSync(mediaPath)) return true;
  if (!url?.startsWith("/api/media/")) return false;
  const rel = decodeURIComponent(url.split("?")[0].replace(/^\/api\/media\//, ""));
  if (!rel || rel.includes("..")) return false;
  return fs.existsSync(path.join(dataRoot(), "media", ...rel.split("/").filter(Boolean)));
}

export function listMenuMedia(menu: MediaMenuId, exts: RegExp) {
  const dir = menuDir(menu);
  const rows: { id: string; url: string; createdAt: string; name: string }[] = [];
  if (!fs.existsSync(dir)) return rows;
  for (const name of fs.readdirSync(dir)) {
    if (!exts.test(name)) continue;
    const st = fs.statSync(path.join(dir, name));
    if (!st.isFile()) continue;
    rows.push({
      id: name.replace(/\.[^.]+$/, ""),
      url: `/api/media/${MEDIA_MENUS[menu].folder}/${name}`,
      createdAt: st.mtime.toISOString(),
      name,
    });
  }
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return rows;
}

/** Copy legacy media/factory + factory-sourced motion into UGC_Factory with menu filenames. */
export function migrateLegacyFactoryMedia(jobs: { id: string; kind?: string; input?: string; mediaUrl?: string; mediaPath?: string; characterId?: string; source?: string }[]) {
  const destDir = menuDir("ugc-factory");
  const legacyDir = path.join(dataRoot(), "media", "factory");
  const patched: { id: string; mediaUrl: string; mediaPath: string; source: "ugc-factory" }[] = [];

  function copyIntoMenu(src: string, id: string, ext: string) {
    if (!src || !fs.existsSync(src)) return null;
    const asset = menuAsset("ugc-factory", id, ext);
    if (!fs.existsSync(asset.path)) fs.copyFileSync(src, asset.path);
    return asset;
  }

  if (fs.existsSync(legacyDir)) {
    for (const name of fs.readdirSync(legacyDir)) {
      const ext = path.extname(name).slice(1);
      if (!/^(png|jpe?g|webp|mp4|wav)$/i.test(ext)) continue;
      const stem = name.replace(/\.[^.]+$/, "");
      copyIntoMenu(path.join(legacyDir, name), stem, ext);
    }
  }

  for (const j of jobs) {
    const fromFactoryStill = /\/api\/media\/factory\//i.test(j.mediaUrl || "") || /\/api\/media\/factory\//i.test(j.input || "");
    const alreadyMenu = /\/api\/media\/UGC_Factory\//i.test(j.mediaUrl || "");
    if (alreadyMenu && j.source === "ugc-factory") continue;
    if (!fromFactoryStill && j.source !== "ugc-factory") continue;
    const url = j.mediaUrl || "";
    const ext = (path.extname(url.split("?")[0]) || (j.kind === "motion" ? ".mp4" : ".png")).slice(1) || "png";
    const src =
      (j.mediaPath && fs.existsSync(j.mediaPath) ? j.mediaPath : "") ||
      (url.startsWith("/api/media/")
        ? path.join(dataRoot(), "media", url.replace("/api/media/", "").split("?")[0].replaceAll("/", path.sep))
        : "");
    const asset = copyIntoMenu(src, j.id, ext);
    if (!asset) continue;
    patched.push({ id: j.id, mediaUrl: asset.url, mediaPath: asset.path, source: "ugc-factory" });
  }

  return { destDir, patched };
}
