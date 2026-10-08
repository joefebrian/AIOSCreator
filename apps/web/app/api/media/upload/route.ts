import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { addProductAsset } from "@/lib/product-assets";
import { uploadCategory } from "@/lib/product-category";
import { productFromManualUpload } from "@/lib/products";
import { dataRoot, productFile, productMediaUrl, uploadFile } from "@/lib/paths";
import { insertJob, listJobs, type Job } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isDriveUpload(name: string) {
  if (!/\.(mp4|webm|mov)$/i.test(name)) return false;
  if (/\.(kling|faldrive)\.mp4$/i.test(name)) return false;
  if (/^(h3-drive|athena-drive|wa2-drive)/i.test(name)) return false;
  return true;
}

function generatedOutputNames() {
  const names = new Set<string>();
  for (const job of listJobs()) {
    if (!job || job.model === "upload") continue;
    for (const raw of [job.mediaUrl, job.mediaPath]) {
      if (!raw) continue;
      const base = path.basename(String(raw).split("?")[0]);
      if (/\.(mp4|webm|mov)$/i.test(base)) names.add(base);
    }
  }
  return names;
}

export async function GET() {
  const dir = path.join(dataRoot(), "media", "uploads");
  if (!fs.existsSync(dir)) return NextResponse.json({ clips: [] });
  const generated = generatedOutputNames();
  const clips = fs
    .readdirSync(dir)
    .filter((name) => isDriveUpload(name) && !generated.has(name))
    .map((name) => {
      const stat = fs.statSync(path.join(dir, name));
      return { id: name, mediaUrl: `/api/media/uploads/${name}`, createdAt: stat.mtime.toISOString() };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 80);
  return NextResponse.json({ clips });
}

function referenceName(raw: string) {
  const name = String(raw || "").trim();
  if (!name || name.includes("/") || name.includes("\\") || name.includes("..")) return "";
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,180}$/.test(name)) return "";
  if (!isDriveUpload(name)) return "";
  return name;
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  let raw = url.searchParams.get("name") || "";
  if (!raw) {
    const body = (await req.json().catch(() => null)) as { name?: string; mediaUrl?: string } | null;
    raw = String(body?.name || body?.mediaUrl || "");
  }
  const name = referenceName(raw);
  if (!name) return NextResponse.json({ error: "not a reference clip" }, { status: 400 });
  const dir = path.resolve(path.join(dataRoot(), "media", "uploads"));
  const dest = path.resolve(dir, name);
  const rel = path.relative(dir, dest);
  if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
    return NextResponse.json({ error: "not a reference clip" }, { status: 400 });
  }
  if (!fs.existsSync(dest) || !fs.statSync(dest).isFile()) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  fs.unlinkSync(dest);
  return NextResponse.json({ ok: true, name });
}

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const VIDEO_EXT = new Set([".mp4", ".webm", ".mov"]);
const IMAGE_TYPE = new Set(["image/png", "image/jpeg", "image/webp", "image/jpg"]);
const VIDEO_TYPE = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const MAX_IMAGE = 20 * 1024 * 1024;
const MAX_VIDEO = 120 * 1024 * 1024;

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "multipart required" }, { status: 400 });

  const file = form.get("file");
  const kind = String(form.get("kind") || "").trim();
  if (!(file instanceof File)) return NextResponse.json({ error: "file required" }, { status: 400 });
  if (kind !== "character" && kind !== "motion" && kind !== "product" && kind !== "ugc-reference") {
    return NextResponse.json({ error: "kind must be character, product, motion, or ugc-reference" }, { status: 400 });
  }

  const ext = path.extname(file.name || "").toLowerCase();
  if (kind === "ugc-reference") {
    if (!VIDEO_EXT.has(ext) && !VIDEO_TYPE.has(file.type)) {
      return NextResponse.json({ error: "video must be mp4, webm, or mov" }, { status: 400 });
    }
    if (file.size > MAX_VIDEO) return NextResponse.json({ error: "video too large (120MB)" }, { status: 400 });
    const safeVideo = (VIDEO_EXT.has(ext) ? ext : ".mp4").replace(".jpeg", ".jpg");
    const videoId = randomUUID();
    const dir = path.join(dataRoot(), "media", "ugc-references");
    fs.mkdirSync(dir, { recursive: true });
    const videoDest = path.join(dir, `${videoId}${safeVideo}`);
    const videoBuf = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(videoDest, videoBuf);
    const fileHash = createHash("sha256").update(videoBuf).digest("hex");
    return NextResponse.json({ id: videoId, mediaUrl: `/api/media/ugc-references/${videoId}${safeVideo}`, fileHash, kind: "ugc-reference" });
  }
  if (kind === "character" || kind === "product") {
    if (!IMAGE_EXT.has(ext) && !IMAGE_TYPE.has(file.type)) {
      return NextResponse.json({ error: "image must be png, jpeg, or webp" }, { status: 400 });
    }
    if (file.size > MAX_IMAGE) return NextResponse.json({ error: "image too large (20MB)" }, { status: 400 });
  } else {
    if (!VIDEO_EXT.has(ext) && !VIDEO_TYPE.has(file.type)) {
      return NextResponse.json({ error: "motion must be mp4, webm, or mov" }, { status: 400 });
    }
    if (file.size > MAX_VIDEO) return NextResponse.json({ error: "video too large (120MB)" }, { status: 400 });
  }

  const safeExt = (
    IMAGE_EXT.has(ext) || VIDEO_EXT.has(ext) ? ext : kind === "motion" ? ".mp4" : ".png"
  ).replace(".jpeg", ".jpg");
  const id = randomUUID();
  if (kind === "product") {
    const categoryRaw = String(form.get("category") || "");
    const category = uploadCategory(categoryRaw);
    if (categoryRaw.trim() && !category) {
      return NextResponse.json({ error: "Unknown category." }, { status: 400 });
    }
    const dest = productFile(id, safeExt.replace(".", ""));
    fs.writeFileSync(dest, Buffer.from(await file.arrayBuffer()));
    const mediaUrl = productMediaUrl(id, safeExt.replace(".", ""));
    const title = file.name || "SKU";
    if (category) {
      const saved = productFromManualUpload({ title, category, imageUrl: mediaUrl });
      addProductAsset({ id, url: mediaUrl, title: saved.title, productId: saved.id, source: "upload", category });
      return NextResponse.json({ id, mediaUrl, productId: saved.id, kind: "product", category });
    }
    addProductAsset({ id, url: mediaUrl, title, source: "upload" });
    return NextResponse.json({ id, mediaUrl, kind: "product", category: "" });
  }
  const dest = uploadFile(id, safeExt);
  fs.writeFileSync(dest, Buffer.from(await file.arrayBuffer()));
  const mediaUrl = `/api/media/uploads/${id}${safeExt}`;

  if (kind === "character") {
    const now = new Date().toISOString();
    const job: Job = {
      id,
      module: "production",
      kind: "image",
      input: file.name || "upload",
      status: "completed",
      createdAt: now,
      updatedAt: now,
      model: "upload",
      mediaPath: dest,
      mediaUrl,
    };
    insertJob(job);
    return NextResponse.json(job);
  }

  return NextResponse.json({ id, mediaUrl, kind: "motion" });
}
