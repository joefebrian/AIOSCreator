import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { after, NextResponse } from "next/server";
import { generateStill } from "@/lib/stills";
import { waitForGpuIdle } from "@/lib/gpu-gate";
import { menuAsset } from "@/lib/media-menu";
import { mediaUrlToPath } from "@/lib/paths";
import { getProduct } from "@/lib/products";
import { insertJob, updateJob, type Job } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 1800;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    prompt?: string;
    productId?: string;
    imageUrl?: string;
  };
  const prompt = (body.prompt || "").trim();
  if (!prompt) return NextResponse.json({ error: "prompt required" }, { status: 400 });
  const product = body.productId ? getProduct(body.productId) : undefined;
  const refUrl = (body.imageUrl || product?.images?.[0] || "").trim();
  const refPath = refUrl.startsWith("/api/media/") ? mediaUrlToPath(refUrl) : "";
  const now = new Date().toISOString();
  const job: Job = {
    id: randomUUID(),
    module: "production",
    kind: "image",
    input: prompt.slice(0, 2000),
    status: "queued",
    createdAt: now,
    updatedAt: now,
    model: "qwen-image-2.1",
    provider: "comfy",
    productId: product?.id,
    source: "ugc-factory",
    progress: "Queued — Qwen 2.1 still…",
  };
  insertJob(job);
  const jobId = job.id;

  after(async () => {
    try {
      await waitForGpuIdle({ jobId, onWait: (msg) => updateJob(jobId, { progress: msg }) });
      updateJob(jobId, { status: "running", progress: "Qwen 2.1 still…" });
      const { buffer } = await generateStill(
        prompt,
        refPath && fs.existsSync(refPath) ? { scene: refPath } : undefined,
        "qwen-image-2.1",
        { kind: "transform", aspect: "9:16" },
      );
      const dest = menuAsset("ugc-factory", jobId, "png");
      fs.writeFileSync(dest.path, buffer);
      updateJob(jobId, {
        status: "completed",
        mediaPath: dest.path,
        mediaUrl: dest.url,
        source: "ugc-factory",
        progress: undefined,
      });
    } catch (err) {
      updateJob(jobId, { status: "failed", error: err instanceof Error ? err.message : String(err) });
    }
  });

  return NextResponse.json(job, { status: 202 });
}
