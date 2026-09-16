import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { ffmpegStill4k, ffmpegVideo4k } from "@/lib/motion";
import { export4kFile, mediaUrlToPath } from "@/lib/paths";
import { insertJob, listJobs, updateJob, type Job } from "@/lib/store";
import fs from "node:fs";

export const runtime = "nodejs";
export const maxDuration = 1800;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { imageUrl?: string; videoUrl?: string; mediaUrl?: string };
  const mediaUrl = (body.videoUrl || body.imageUrl || body.mediaUrl || "").trim();
  if (!mediaUrl) return NextResponse.json({ error: "mediaUrl required" }, { status: 400 });
  const src = mediaUrlToPath(mediaUrl);
  if (!fs.existsSync(src)) return NextResponse.json({ error: "source not on disk" }, { status: 400 });
  const isVideo = /\.(mp4|webm|mov)$/i.test(src) || /\.mp4(\?|$)/i.test(mediaUrl);

  const now = new Date().toISOString();
  const job: Job = {
    id: randomUUID(),
    module: "production",
    kind: "export",
    input: mediaUrl,
    status: "running",
    createdAt: now,
    updatedAt: now,
    model: "realesrgan-x4-2160x3840",
  };
  insertJob(job);

  try {
    if (isVideo) {
      await ffmpegVideo4k(src, src, (msg) => {
        updateJob(job.id, { progress: msg });
      });
      const orig = listJobs().find((j) => j.kind === "motion" && j.mediaUrl && mediaUrl.startsWith(j.mediaUrl));
      if (orig) updateJob(orig.id, { upscaled: true });
      const done = updateJob(job.id, {
        status: "completed",
        mediaPath: src,
        mediaUrl,
        upscaled: true,
      });
      return NextResponse.json({ ...done, replaced: orig?.id });
    }
    const dest = export4kFile(job.id);
    await ffmpegStill4k(src, dest);
    const done = updateJob(job.id, {
      status: "completed",
      mediaPath: dest,
      mediaUrl: `/api/media/exports/${job.id}-2160x3840.png`,
      upscaled: true,
    });
    return NextResponse.json(done);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failed = updateJob(job.id, { status: "failed", error: message });
    return NextResponse.json({ ...failed }, { status: 502 });
  }
}
