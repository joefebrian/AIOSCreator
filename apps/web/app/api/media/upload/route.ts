import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { addProductAsset } from "@/lib/product-assets";
import { productFile, productMediaUrl, uploadFile } from "@/lib/paths";
import { insertJob, type Job } from "@/lib/store";

export const runtime = "nodejs";

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
  if (kind !== "character" && kind !== "motion" && kind !== "product") {
    return NextResponse.json({ error: "kind must be character, product, or motion" }, { status: 400 });
  }

  const ext = path.extname(file.name || "").toLowerCase();
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
    const dest = productFile(id, safeExt.replace(".", ""));
    fs.writeFileSync(dest, Buffer.from(await file.arrayBuffer()));
    const mediaUrl = productMediaUrl(id, safeExt.replace(".", ""));
    addProductAsset({ id, url: mediaUrl, title: file.name || "SKU", source: "upload" });
    return NextResponse.json({ id, mediaUrl, kind: "product" });
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
