import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { after, NextResponse } from "next/server";
import { menuAsset } from "@/lib/media-menu";
import { mediaUrlToPath } from "@/lib/paths";
import { generateStill } from "@/lib/stills";
import { getFashionProject, saveFashionProject } from "@/lib/ugc-fashion";
import { getJob } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 1800;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const project = getFashionProject(id);
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { action?: "look" | "motion" };
  const action = body.action === "motion" ? "motion" : "look";
  if (action === "look") {
    if (!project.items.length) return NextResponse.json({ error: "Add 1–4 products first." }, { status: 400 });
    if (!project.items.every((i) => i.imageUrl)) return NextResponse.json({ error: "Each item needs a photo." }, { status: 400 });
    saveFashionProject({ ...project, stage: "GENERATING_LOOK", attention: undefined });
  } else {
    if (!project.approvedStillUrl && !project.approvedStillId) {
      return NextResponse.json({ error: "Approve a look first.", code: "NO_APPROVED_STILL" }, { status: 400 });
    }
    const motionRef = project.motionUrl || (project.motions || []).find((row) => row.assetUrl)?.assetUrl;
    if (!motionRef) {
      return NextResponse.json({ error: "Reference video required. No image-to-video fallback.", code: "NO_MOTION_REF" }, { status: 400 });
    }
    saveFashionProject({ ...project, stage: "IN_PRODUCTION", attention: undefined });
  }

  after(async () => {
    const current = getFashionProject(id);
    if (!current) return;
    try {
      if (action === "look") {
        const refs = current.items.map((i) => mediaUrlToPath(i.imageUrl)).filter((p) => p && fs.existsSync(p));
        const { buffer } = await generateStill(
          current.prompt,
          { scene: refs[0], extra: refs.slice(1, 4) },
          "qwen-image-2.1",
          { kind: "on-model", aspect: "9:16" },
        );
        const dest = menuAsset("ugc-fashion", randomUUID(), "png");
        fs.writeFileSync(dest.path, buffer);
        saveFashionProject({
          ...getFashionProject(id)!,
          stillUrl: dest.url,
          stage: "AWAITING_LOOK_APPROVAL",
          attention: undefined,
        });
        return;
      }
      const res = await fetch("http://127.0.0.1:3000/api/jobs/motion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: current.approvedStillUrl,
          motionUrl: current.motionUrl || current.motions?.find((row) => row.assetUrl)?.assetUrl,
          engineId: current.motionEngine === "kling-2-6" ? "kling-2-6" : "kling-3-0",
          durationSec: 8,
          prompt: "Same person and outfit. Follow the reference motion. Keep every product visible.",
          source: "ugc-fashion",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "motion failed");
      let job = getJob(json.id);
      for (let i = 0; i < 400 && job && job.status !== "completed" && job.status !== "failed"; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        job = getJob(json.id);
      }
      if (!job || job.status === "failed") throw new Error(job?.error || "motion failed");
      saveFashionProject({
        ...getFashionProject(id)!,
        videoUrl: job.mediaUrl,
        stage: job.mediaUrl ? "PENDING_REVIEW" : "READY_FOR_MOTION",
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const latest = getFashionProject(id);
      if (!latest) return;
      saveFashionProject({
        ...latest,
        stage: action === "look" ? "DRAFT" : "READY_FOR_MOTION",
        attention: message,
      });
    }
  });

  return NextResponse.json(getFashionProject(id), { status: 202 });
}
