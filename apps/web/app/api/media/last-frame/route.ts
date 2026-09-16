import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { NextResponse } from "next/server";
import { extractLastFrame } from "@/lib/media-frame";
import { mediaUrlToPath, uploadFile } from "@/lib/paths";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { videoUrl?: string };
  const videoUrl = (body.videoUrl || "").trim();
  if (!videoUrl) return NextResponse.json({ error: "videoUrl required" }, { status: 400 });
  const src = videoUrl.startsWith("/api/media/") ? mediaUrlToPath(videoUrl) : videoUrl;
  if (!fs.existsSync(src)) return NextResponse.json({ error: "video not on disk" }, { status: 400 });
  const id = randomUUID();
  const dest = uploadFile(id, "jpg");
  try {
    await extractLastFrame(src, dest);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
  return NextResponse.json({ mediaUrl: `/api/media/uploads/${id}.jpg` });
}
