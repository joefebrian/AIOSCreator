import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { NextResponse } from "next/server";
import { imageEngine } from "@/lib/engines";
import { resolveRoute } from "@/lib/model-routes";
import { parseImageAspect, sizeForAspect } from "@/lib/image-aspect";
import { generateStill } from "@/lib/stills";
import { characterFile, imageFile, mediaUrlToPath } from "@/lib/paths";
import { SpendCapError } from "@/lib/spend-cap";
import { insertJob, updateJob, type Job } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 600;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    prompt?: string;
    nodeId?: string;
    referenceUrl?: string;
    extraUrl?: string;
    extraUrls?: string[];
    lock?: boolean;
    aspect?: string;
  };
  const prompt = (body.prompt ?? "").trim();
  if (!prompt) {
    return NextResponse.json({ error: "prompt required (connect a Text node or wire Character + Product)" }, { status: 400 });
  }

  const refUrl = (body.referenceUrl ?? "").trim();
  const extraList = [
    ...(Array.isArray(body.extraUrls) ? body.extraUrls : []),
    body.extraUrl || "",
  ]
    .map((u) => u.trim())
    .filter((u, i, a) => u && u !== refUrl && a.indexOf(u) === i);
  const refPath = refUrl ? mediaUrlToPath(refUrl) : undefined;
  const extraPaths = extraList.map(mediaUrlToPath).filter((p) => p && fs.existsSync(p)) as string[];
  const engine = imageEngine();
  const route = resolveRoute(engine.id, "auto");
  const now = new Date().toISOString();
  const job: Job = {
    id: randomUUID(),
    module: "production",
    kind: body.lock ? "character" : "image",
    input: prompt,
    status: "running",
    createdAt: now,
    updatedAt: now,
    model: refPath ? `${engine.id}-ref` : engine.id,
    provider: route?.provider || "comfy",
  };
  insertJob(job);

  try {
    const aspect = parseImageAspect(body.aspect);
    const canvas = sizeForAspect(aspect);
    const { buffer } = await generateStill(
      prompt,
      extraPaths.length && refPath
        ? { face: refPath, body: extraPaths[0], scene: extraPaths[1] }
        : extraPaths[0] && !refPath
          ? extraPaths[0]
          : refPath,
      engine.id,
      { width: canvas.width, height: canvas.height, aspect },
    );
    const dest = body.lock ? characterFile(job.id, "png") : imageFile(job.id, "png");
    fs.writeFileSync(dest, buffer);
    const folder = body.lock ? "characters" : "images";
    const done = updateJob(job.id, {
      status: "completed",
      mediaPath: dest,
      mediaUrl: `/api/media/${folder}/${job.id}.png`,
    });
    return NextResponse.json({ ...done, nodeId: body.nodeId });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failed = updateJob(job.id, { status: "failed", error: message });
    return NextResponse.json({ ...failed, nodeId: body.nodeId }, { status: err instanceof SpendCapError ? 402 : 502 });
  }
}
