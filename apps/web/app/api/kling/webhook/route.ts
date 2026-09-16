import fs from "node:fs";
import { NextResponse } from "next/server";
import { klingCallbackUrl, klingWebhookSecret, verifyKlingWebhook, type KlingCallback } from "@/lib/kling-webhook";
import { motionFile } from "@/lib/paths";
import { getJob, listJobs, updateJob } from "@/lib/store";

export const runtime = "nodejs";

function videoUrl(body: KlingCallback) {
  const out = body.outputs?.find((o) => o.type === "video" && o.url)?.url;
  if (out) return out;
  return body.task_result?.videos?.find((v) => v.url)?.url || "";
}

export async function POST(req: Request) {
  const raw = await req.text();
  try {
    if (klingWebhookSecret()) verifyKlingWebhook(raw, req.headers);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const body = JSON.parse(raw || "{}") as KlingCallback;
  const status = (body.status || body.task_status || "").toLowerCase();
  const klingId = body.id || body.task_id || "";
  const jobId = body.external_id || "";

  // Kling console "Send Test Callback" — empty outputs, status submitted.
  if (status === "submitted" || !videoUrl(body)) {
    return NextResponse.json({ ok: true, test: !jobId, id: klingId });
  }

  const job =
    (jobId ? getJob(jobId) : undefined) ||
    listJobs().find((j) => (j.progress || "").includes(klingId) && j.status === "running");

  if (status === "failed" || status === "fail") {
    if (job) updateJob(job.id, { status: "failed", error: body.message || "Kling webhook failed" });
    return NextResponse.json({ ok: true, id: klingId, status: "failed" });
  }

  if ((status === "succeeded" || status === "succeed") && job && job.status === "running") {
    const url = videoUrl(body);
    if (!url) return NextResponse.json({ ok: true, id: klingId, waiting: true });
    const dl = await fetch(url, { signal: AbortSignal.timeout(180_000) });
    if (!dl.ok) return NextResponse.json({ error: `download HTTP ${dl.status}` }, { status: 502 });
    const dest = motionFile(job.id);
    fs.writeFileSync(dest, Buffer.from(await dl.arrayBuffer()));
    updateJob(job.id, {
      status: "completed",
      progress: undefined,
      mediaPath: dest,
      mediaUrl: `/api/media/motion/${job.id}.mp4`,
    });
  }

  return NextResponse.json({ ok: true, id: klingId, status });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    path: "/api/kling/webhook",
    secret: Boolean(klingWebhookSecret()),
    callbackUrl: klingCallbackUrl() || null,
  });
}
