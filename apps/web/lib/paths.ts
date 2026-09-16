import path from "node:path";
import fs from "node:fs";

export function dataRoot() {
  const fromEnv = process.env.CREATOROS_DATA_DIR;
  const root = fromEnv
    ? path.resolve(process.cwd(), fromEnv)
    : path.resolve(process.cwd(), "../../data");
  return root;
}

export function ensureDataDirs() {
  const root = dataRoot();
  for (const dir of [
    root,
    path.join(root, "db"),
    path.join(root, "media"),
    path.join(root, "media", "scripts"),
    path.join(root, "media", "images"),
    path.join(root, "media", "characters"),
    path.join(root, "media", "motion"),
    path.join(root, "media", "exports"),
    path.join(root, "media", "uploads"),
    path.join(root, "media", "products"),
    path.join(root, "media", "thumbs"),
    path.join(root, "media", "voices"),
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return root;
}

export function jobsFile() {
  return path.join(ensureDataDirs(), "db", "jobs.json");
}

export function promptPresetsFile() {
  return path.join(ensureDataDirs(), "db", "prompt-presets.json");
}

export function researchFile() {
  return path.join(ensureDataDirs(), "db", "research.json");
}

export function researchCookiesFile() {
  return path.join(ensureDataDirs(), "db", "research-cookies.json");
}

export function intelligenceFile() {
  return path.join(ensureDataDirs(), "db", "intelligence.json");
}

export function dramasFile() {
  return path.join(ensureDataDirs(), "db", "dramas.json");
}

export function studioWorkflowsFile() {
  return path.join(ensureDataDirs(), "db", "studio-workflows.json");
}

export function dramaMediaDir(id: string) {
  return path.join(ensureDataDirs(), "media", "drama", id);
}

export function scriptFile(id: string) {
  return path.join(ensureDataDirs(), "media", "scripts", `${id}.md`);
}

export function imageFile(id: string, ext = "png") {
  return path.join(ensureDataDirs(), "media", "images", `${id}.${ext}`);
}

export function characterFile(id: string, ext = "png") {
  return path.join(ensureDataDirs(), "media", "characters", `${id}.${ext}`);
}

export function charactersDbFile() {
  return path.join(ensureDataDirs(), "db", "characters.json");
}

export function characterSlotFile(characterId: string, slot: string, ext = "png") {
  const safe = slot.replace(/[^a-z0-9_-]/gi, "");
  return path.join(ensureDataDirs(), "media", "characters", `${characterId}-${safe}.${ext}`);
}

export function characterSlotUrl(characterId: string, slot: string, ext = "png") {
  const safe = slot.replace(/[^a-z0-9_-]/gi, "");
  return `/api/media/characters/${characterId}-${safe}.${ext}`;
}

/** Map a /api/media/... URL back to the file on disk. */
/** Keep the draft still; write RealESRGAN next to it as *-4k.png. */
export function still4kPair(srcPath: string, srcUrl: string) {
  const ext = path.extname(srcPath) || ".png";
  const stem = srcPath.slice(0, -ext.length);
  const dest = stem.endsWith("-4k") ? srcPath : `${stem}-4k${ext}`;
  const url = /[-_]4k\.[a-z0-9]+$/i.test(srcUrl)
    ? srcUrl
    : srcUrl.replace(/(\.[a-z0-9]+)(\?.*)?$/i, "-4k$1");
  return { dest, url };
}

export function mediaUrlToPath(url: string) {
  const rel = url.replace("/api/media/", "").replaceAll("/", path.sep);
  return path.join(dataRoot(), "media", rel);
}

export function motionFile(id: string) {
  return path.join(ensureDataDirs(), "media", "motion", `${id}.mp4`);
}

export function export4kFile(id: string) {
  return path.join(ensureDataDirs(), "media", "exports", `${id}-2160x3840.png`);
}

export function uploadFile(id: string, ext: string) {
  const e = ext.replace(/^\./, "").toLowerCase();
  return path.join(ensureDataDirs(), "media", "uploads", `${id}.${e}`);
}

export function productAssetsFile() {
  return path.join(ensureDataDirs(), "db", "product-assets.json");
}

export function productFile(id: string, ext = "png") {
  const e = ext.replace(/^\./, "").toLowerCase();
  return path.join(ensureDataDirs(), "media", "products", `${id}.${e}`);
}

export function productMediaUrl(id: string, ext = "png") {
  const e = ext.replace(/^\./, "").toLowerCase();
  return `/api/media/products/${id}.${e}`;
}
