import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { NextResponse } from "next/server";
import { imageEngine, listEngines } from "@/lib/engines";
import { resolveRoute } from "@/lib/model-routes";
import { parseImageAspect, sizeForAspect } from "@/lib/image-aspect";
import { generateStill } from "@/lib/stills";
import { getCharacter } from "@/lib/characters";
import { characterFile, imageFile, mediaUrlToPath } from "@/lib/paths";
import { viggleBodyPlate, viggleGeneratePrompt } from "@/lib/still-refs";
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
    engineId?: string;
    characterId?: string;
    productId?: string;
    source?: "studio" | "workspace";
    kind?: "identity" | "restyle" | "bump" | "transform" | "faceswap" | "on-model";
  };
  let prompt = (body.prompt ?? "").trim();
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
  let refPath = refUrl ? mediaUrlToPath(refUrl) : undefined;
  if (body.engineId === "qwen-image-2.1-viggle" && body.characterId) {
    const row = getCharacter(body.characterId.trim());
    const plate = row ? viggleBodyPlate(row) : null;
    if (!plate) {
      return NextResponse.json(
        { error: "Viggle needs a 3/4 body still. Complete set 3/4 first. Headshot is not used as Image 1." },
        { status: 400 },
      );
    }
    prompt = viggleGeneratePrompt(row!.name, prompt, plate.kind).prompt;
    refPath = plate.path;
  }
  const extraPaths = extraList.map(mediaUrlToPath).filter((p) => p && fs.existsSync(p)) as string[];
  const engine = (body.engineId && listEngines().find((e) => e.id === body.engineId)) || imageEngine();
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
    model: body.kind === "faceswap" ? "reactor" : refPath ? `${engine.id}-ref` : engine.id,
    provider: route?.provider || "comfy",
    characterId: body.characterId?.trim() || undefined,
    productId: body.productId?.trim() || undefined,
    source: body.source === "studio" || body.nodeId ? "studio" : body.source,
    nodeId: body.nodeId?.trim() || undefined,
  };
  insertJob(job);

  try {
    const aspect = parseImageAspect(body.aspect);
    const canvas = sizeForAspect(aspect);
    const swap = body.kind === "faceswap";
    const onModel = !swap && Boolean(refPath && extraPaths[0]);
    const { buffer } = await generateStill(
      prompt,
      swap
        ? { face: refPath, scene: extraPaths[0] }
        : onModel
          ? { face: refPath, body: extraPaths[0], scene: extraPaths[1] }
          : extraPaths[0] && !refPath
            ? extraPaths[0]
            : refPath,
      swap || onModel
        ? engine.id === "qwen-image-2.1" ||
          engine.id === "qwen-image-2.1-gguf" ||
          engine.id === "qwen-image-2.1-viggle" ||
          engine.id === "grok-imagine-tryon" ||
          engine.id === "kling-image-omni" ||
          engine.id === "kolors-virtual-try-on"
          ? engine.id
          : "qwen-image-2.1"
        : engine.id,
      {
        width: canvas.width,
        height: canvas.height,
        aspect,
        kind: swap ? "faceswap" : onModel ? "on-model" : undefined,
      },
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
