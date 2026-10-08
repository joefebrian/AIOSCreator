import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { after, NextResponse } from "next/server";
import { cometSeedanceI2V, falDreamActorV2, grokImagineVideoI2V, higgsfieldKlingStdI2V, higgsfieldSeedanceExtendVideo, hostPublicFile, klingMotionControl, sanitizeCloudVideoPrompt } from "@/lib/cloud-video";
import { dashscopeWan3Video } from "@/lib/dashscope-wan";
import { comfyFreeVram, comfyH3I2V, comfyH3I2VLong, comfyH3R2V, comfyHunyuanI2V, comfyLtxI2V, comfyWanAnimate2, comfyWanI2V } from "@/lib/comfy";
import { resolveMotionEngine } from "@/lib/engines";
import { waitForGpuIdle } from "@/lib/gpu-gate";
import { isWanEngine, jobOccupiesGpu } from "@/lib/job-gpu";
import { resolveRoute } from "@/lib/model-routes";
import { motionFrameCount } from "@/lib/motion";
import { menuAsset } from "@/lib/media-menu";
import { mediaUrlToPath, motionFile } from "@/lib/paths";
import { getCharacter } from "@/lib/characters";
import { marketRegionLine, productMarketId } from "@/lib/markets";
import { getProduct } from "@/lib/products";
import { assertSpendAllowed, SpendCapError } from "@/lib/spend-cap";
import { insertJob, updateJob, type Job } from "@/lib/store";

export const runtime = "nodejs";
export const maxDuration = 1800;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    imageUrl?: string;
    extraUrls?: string[];
    motionUrl?: string;
    prompt?: string;
    nodeId?: string;
    engineId?: string;
    durationSec?: number;
    sound?: boolean;
    orientation?: "image" | "video";
    resolution?: "720p" | "1080p";
    faceUrls?: string[];
    characterId?: string;
    productId?: string;
    aspect?: string;
    source?: "studio" | "workspace" | "ugc-factory" | "ugc-fashion" | "motion";
  };
  const imageUrl = (body.imageUrl ?? "").trim();
  if (body.characterId?.trim() && !(body.engineId || "").trim()) {
    return NextResponse.json({ error: "engineId required for character workspace" }, { status: 400 });
  }
  let promptBody = body.prompt || "";
  const characterId = body.characterId?.trim() || "";
  const productId = body.productId?.trim() || "";
  if (characterId) {
    const character = getCharacter(characterId);
    const product = productId ? getProduct(productId) : undefined;
    const productMarket = product ? productMarketId(product) : "";
    if (character && productMarket && !(character.markets || []).includes(productMarket)) {
      return NextResponse.json({ error: "Set that character's country to this market." }, { status: 400 });
    }
    const market = productMarket || (character?.markets?.length === 1 ? character.markets[0] : "");
    const line = marketRegionLine(market);
    if (line) promptBody = [promptBody, line].filter(Boolean).join(" ");
  }
  if (!imageUrl) {
    return NextResponse.json({ error: "upload or pick a character still first" }, { status: 400 });
  }
  const faceUrls = (Array.isArray(body.faceUrls) ? body.faceUrls : [])
    .map((url) => (typeof url === "string" ? url.trim() : ""))
    .filter((url) => url.startsWith("/api/media/") && url !== imageUrl);
  const facePaths = [...new Set(faceUrls.map((url) => mediaUrlToPath(url)))].filter((file) => file && fs.existsSync(file)).slice(0, 3);
  if ((body.engineId || "") === "kling-3-0" && faceUrls.length > 0 && facePaths.length < 1) {
    return NextResponse.json({ error: "Those face photos are not on disk." }, { status: 400 });
  }
  if ((body.engineId || "") === "kling-3-0" && facePaths.length > 0 && body.orientation !== "video") {
    return NextResponse.json({ error: "Facial element binding only works with drive orientation." }, { status: 400 });
  }

  let engine;
  try {
    engine = resolveMotionEngine(body.engineId);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
  const now = new Date().toISOString();
  const route = resolveRoute(engine.id, "auto");
  const job: Job = {
    id: randomUUID(),
    module: "production",
    kind: "motion",
    input: [promptBody || "motion", imageUrl, body.motionUrl].filter(Boolean).join(" | "),
    status: "running",
    createdAt: now,
    updatedAt: now,
    model: engine.id,
    provider: route?.provider || "comfy",
    characterId: body.characterId?.trim() || undefined,
    productId: body.productId?.trim() || undefined,
    source: body.source === "studio" || body.nodeId ? "studio" : body.source === "ugc-factory" ? "ugc-factory" : body.source,
    nodeId: body.nodeId?.trim() || undefined,
  };
  insertJob(job);

  const src = imageUrl.startsWith("/api/media/") ? mediaUrlToPath(imageUrl) : imageUrl;
  if (!fs.existsSync(src)) {
    updateJob(job.id, { status: "failed", error: "source image not on disk" });
    return NextResponse.json({ error: "source image not on disk" }, { status: 400 });
  }
  const extraPaths = (Array.isArray(body.extraUrls) ? body.extraUrls : [])
    .map((u) => (typeof u === "string" && u.startsWith("/api/media/") ? mediaUrlToPath(u) : ""))
    .filter((p) => p && p !== src && fs.existsSync(p));
  const mot = body.motionUrl
    ? body.motionUrl.startsWith("/api/media/")
      ? mediaUrlToPath(body.motionUrl)
      : body.motionUrl
    : undefined;
  if ((engine.id === "kling-2-6" || engine.id === "kling-3-0" || engine.id === "dreamactor-v2") && !mot) {
    const message =
      engine.id === "dreamactor-v2"
        ? "DreamActor V2 needs a driving video (≤30s mp4/mov/webm). Drop a motion clip first."
        : "Kling Motion Control needs a driving video (3–30s mp4/mov). Drop a motion clip first.";
    updateJob(job.id, { status: "failed", error: message });
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const factoryOut =
    job.source === "ugc-factory"
      ? menuAsset("ugc-factory", job.id, "mp4")
      : job.source === "ugc-fashion"
        ? menuAsset("ugc-fashion", job.id, "mp4")
        : null;
  const dest = factoryOut?.path || motionFile(job.id);
  const destUrl = factoryOut?.url || `/api/media/motion/${job.id}.mp4`;
  const durationSec = Number(body.durationSec) || 5;
  const paidCloud =
    isWanEngine(engine.id) ||
    engine.id.startsWith("kling") ||
    engine.id === "dreamactor-v2" ||
    engine.id.startsWith("seedance") ||
    engine.id === "grok-imagine-video";
  if (paidCloud) {
    try {
      assertSpendAllowed({ model: engine.id, durationSec });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      updateJob(job.id, { status: "failed", error: message });
      return NextResponse.json({ error: message }, { status: err instanceof SpendCapError ? 402 : 400 });
    }
  }
  const frames = motionFrameCount(engine.id, durationSec);
  const prompt = paidCloud ? sanitizeCloudVideoPrompt(promptBody) : promptBody;
  const sound = body.sound !== false;
  const orientation = body.orientation === "video" ? "video" : "image";
  const resolution = body.resolution === "720p" ? "720p" : "1080p";
  const engineId = engine.id;
  const engineName = engine.name;
  const jobId = job.id;
  const nodeId = body.nodeId;

  after(async () => {
    try {
      if (jobOccupiesGpu({ status: "running", provider: route?.provider || "comfy", model: engineId })) {
        await waitForGpuIdle({ jobId, onWait: (msg) => updateJob(jobId, { progress: msg }) });
      }
      if (engineId === "minimax-h3") {
        const { buffer } = await comfyH3I2V(src, prompt, frames);
        fs.writeFileSync(dest, buffer);
      } else if (engineId === "minimax-h3-long") {
        const { buffer } = await comfyH3I2VLong(src, prompt, durationSec, false, (done, total) => {
          updateJob(jobId, { progress: `chunk ${done}/${total}` });
        });
        fs.writeFileSync(dest, buffer);
      } else if (engineId === "minimax-h3-nude") {
        const { buffer } = await comfyH3I2V(src, prompt, frames, true);
        fs.writeFileSync(dest, buffer);
      } else if (engineId === "minimax-h3-r2v") {
        const { buffer } = await comfyH3R2V(src, mot, prompt, frames);
        fs.writeFileSync(dest, buffer);
      } else if (engineId === "minimax-h3-r2v-nude") {
        const { buffer } = await comfyH3R2V(src, mot, prompt, frames, true);
        fs.writeFileSync(dest, buffer);
      } else if (engineId === "wan-5b") {
        const { buffer } = await comfyWanI2V(src, prompt, frames);
        fs.writeFileSync(dest, buffer);
      } else if (engineId === "hunyuan-1.5") {
        const { buffer } = await comfyHunyuanI2V(src, prompt, frames);
        fs.writeFileSync(dest, buffer);
      } else if (engineId === "ltx-2") {
        updateJob(jobId, { progress: "Freeing VRAM for LTX-2…" });
        await comfyFreeVram();
        const { buffer } = await comfyLtxI2V(src, prompt, frames);
        fs.writeFileSync(dest, buffer);
      } else if (engineId === "wan-animate-2") {
        const { buffer } = await comfyWanAnimate2(src, mot, prompt, frames);
        fs.writeFileSync(dest, buffer);
      } else if (engineId === "grok-imagine-video") {
        const buffer = await grokImagineVideoI2V(src, prompt || "", durationSec);
        fs.writeFileSync(dest, buffer);
      } else if (engineId === "seedance-2-5-extend") {
        if (!mot || !fs.existsSync(mot)) throw new Error("Seedance Extend needs a source video (previous clip).");
        const buffer = await higgsfieldSeedanceExtendVideo(mot, prompt || "", durationSec, src);
        fs.writeFileSync(dest, buffer);
      } else if (engineId === "kling-3-0-std") {
        try {
          const buffer = await higgsfieldKlingStdI2V(src, prompt || "", durationSec, sound);
          fs.writeFileSync(dest, buffer);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!/\bnsfw\b|safety|sexual|inappropriate|content policy|green net/i.test(msg)) throw err;
          updateJob(jobId, { progress: "Cloud safety — Grok Imagine Video…" });
          const buffer = await grokImagineVideoI2V(src, prompt || "", durationSec);
          fs.writeFileSync(dest, buffer);
        }
      } else if (engineId === "seedance-2-5" || engineId === "seedance-2-0") {
        try {
          const buffer = await cometSeedanceI2V(src, prompt || "", durationSec, engineId, extraPaths);
          fs.writeFileSync(dest, buffer);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!/\bnsfw\b|safety|sexual|inappropriate|content policy|green net/i.test(msg)) throw err;
          updateJob(jobId, { progress: "Cloud safety — Grok Imagine Video…" });
          const buffer = await grokImagineVideoI2V(src, prompt || "", durationSec);
          fs.writeFileSync(dest, buffer);
        }
      } else if (isWanEngine(engineId)) {
        try {
          let videoUrl: string | undefined;
          if (mot && fs.existsSync(mot)) {
            updateJob(jobId, { progress: "Hosting drive clip…" });
            videoUrl = await hostPublicFile(mot, "video/mp4", "drive.mp4");
          }
          const buffer = await dashscopeWan3Video({
            prompt: prompt || "Natural motion, photoreal, 9:16.",
            stillPath: src,
            extraStillPaths: extraPaths,
            videoUrl,
            durationSec,
            sound,
            engineId,
            jobId,
            ratio: body.aspect || "9:16",
            onProgress: (label) => updateJob(jobId, { progress: label }),
          });
          fs.writeFileSync(dest, buffer);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (!/\bnsfw\b|safety|sexual|inappropriate|content policy|green net/i.test(msg)) throw err;
          updateJob(jobId, { progress: "Wan safety — Grok Imagine Video…" });
          const buffer = await grokImagineVideoI2V(src, prompt || "", durationSec);
          fs.writeFileSync(dest, buffer);
        }
      } else if (engineId === "dreamactor-v2") {
        const buffer = await falDreamActorV2(src, mot!, (label) => updateJob(jobId, { progress: label }));
        fs.writeFileSync(dest, buffer);
      } else if (engineId === "kling-2-6" || engineId === "kling-3-0") {
        const buffer = await klingMotionControl(
          src,
          mot!,
          prompt || "",
          sound,
          engineId,
          orientation,
          (label) => updateJob(jobId, { progress: label }),
          jobId,
          { resolution, facePaths: engineId === "kling-3-0" ? facePaths : [] },
        );
        fs.writeFileSync(dest, buffer);
      } else {
        throw new Error(`${engineName} runner is not wired yet.`);
      }
      updateJob(jobId, {
        status: "completed",
        progress: undefined,
        mediaPath: dest,
        mediaUrl: destUrl,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      updateJob(jobId, { status: "failed", error: message });
    }
  });

  return NextResponse.json({ ...job, nodeId }, { status: 202 });
}
