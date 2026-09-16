import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { after, NextResponse } from "next/server";
import { waitForGpuIdle } from "@/lib/gpu-gate";
import { mediaUrlToPath, motionFile } from "@/lib/paths";
import { insertJob, updateJob, type Job } from "@/lib/store";
import { muxVoiceOntoClip } from "@/lib/voice-mux";
import { voiceFile, voiceMediaUrl, voiceStudioSpeech } from "@/lib/voice-studio";

export const runtime = "nodejs";
export const maxDuration = 1800;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    text?: string;
    voice?: string;
    clipUrl?: string;
    productId?: string;
    characterId?: string;
  };
  const text = (body.text || "").trim();
  if (!text) return NextResponse.json({ error: "voiceover text is empty" }, { status: 400 });

  const now = new Date().toISOString();
  const job: Job = {
    id: randomUUID(),
    module: "production",
    kind: "voice",
    input: text.slice(0, 2000),
    status: "queued",
    createdAt: now,
    updatedAt: now,
    model: "voicestudio",
    provider: "voicestudio",
    progress: "Queued — waiting for GPU…",
    productId: body.productId,
    characterId: body.characterId,
  };
  insertJob(job);
  const jobId = job.id;
  const voice = (body.voice || "").trim();
  const clipUrl = (body.clipUrl || "").trim();

  after(async () => {
    try {
      await waitForGpuIdle({
        jobId,
        onWait: (msg) => updateJob(jobId, { progress: msg }),
      });
      updateJob(jobId, { status: "running", progress: "VoiceStudio /v1/audio/speech…" });
      const buf = await voiceStudioSpeech(text, voice || undefined);
      const wav = voiceFile(jobId, "wav");
      fs.writeFileSync(wav, buf);
      let mediaPath = wav;
      let mediaUrl = voiceMediaUrl(jobId, "wav");
      if (clipUrl) {
        const clipPath = mediaUrlToPath(clipUrl);
        if (fs.existsSync(clipPath)) {
          updateJob(jobId, { progress: "Muxing VO onto clip…" });
          const dest = motionFile(`${jobId}-vo`);
          await muxVoiceOntoClip(clipPath, wav, dest);
          mediaPath = dest;
          mediaUrl = `/api/media/motion/${jobId}-vo.mp4`;
        }
      }
      updateJob(jobId, {
        status: "completed",
        progress: undefined,
        mediaPath,
        mediaUrl,
      });
    } catch (err) {
      updateJob(jobId, {
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return NextResponse.json(job, { status: 202 });
}
