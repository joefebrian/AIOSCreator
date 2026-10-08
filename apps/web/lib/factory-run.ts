import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { cometSeedanceI2V, grokImagineVideoI2V } from "./cloud-video";
import { dashscopeWan3Video } from "./dashscope-wan";
import { waitForGpuIdle } from "./gpu-gate";
import { factoryScriptLlm, generateScriptBatch, generateScriptForProduct, researchProduct } from "./llm";
import { menuAsset } from "./media-menu";
import { mediaUrlToPath } from "./paths";
import { marketRegionLine } from "./markets";
import { spokenProductName } from "./product-research";
import { skuIdentityUrl } from "./product-import";
import { patchProduct, type Product } from "./products";
import { generateStill } from "./stills";
import { insertJob, updateJob, type Job } from "./store";
import {
  batchFormatIds,
  FACTORY_FORMATS,
  factoryClipDuration,
  factoryFormatLine,
  factoryScenePrompt,
  factoryWardrobe,
  isSlideshowFormat,
  listingStillOk,
  productContext,
  type FactoryFormatId,
  type ScriptPack,
} from "./ugc-script";
import { attachSceneNarration, narrationVoice, speakNarration } from "./factory-voice";
import { burnStoryboardCard, concatSceneClips } from "./ugc-factory-assemble";
import { storyboardCuts, storyboardSeconds } from "./ugc-factory-pack";
import { fitVoiceOntoClip, mediaHasAudio, probeMedia } from "./voice-mux";

function nowIso() {
  return new Date().toISOString();
}

function listingLocal(product: Product) {
  const url = skuIdentityUrl(product);
  if (!url) return "";
  const file = mediaUrlToPath(url);
  return file && fs.existsSync(file) ? url : "";
}

function copyListingStill(product: Product, jobId: string) {
  const url = listingLocal(product);
  if (!url) return null;
  const src = mediaUrlToPath(url);
  const ext = (path.extname(src).replace(".", "") || "jpg").toLowerCase();
  const dest = menuAsset("ugc-factory", jobId, ext === "jpeg" ? "jpg" : ext);
  fs.copyFileSync(src, dest.path);
  return dest;
}

function stillPrompt(product: Product, pack: ScriptPack, formatId: string, market = "") {
  const visual = pack.firstFrame || pack.hookVisual || pack.hook;
  const name = spokenProductName(product.title);
  const ctx = productContext(product.title, product.features || [], product.research?.objectKind);
  const wardrobe = factoryWardrobe(ctx, formatId);
  const talent = ["hold", "talking", "lifestyle", "i-found-this", "comment-reply", "review", "grwm", "beauty-grwm", "pov", "day-in-life", "haul", "unbox-talk"].includes(formatId);
  const region = talent ? marketRegionLine(market) : "";
  const lock = talent
    ? `Throwaway talent (not a Character-library face or wardrobe). ${region} ${wardrobe} Photoreal phone still. Product/box matches the listing photo — never print the words THIS SKU on a fake box.`
    : "Faceless. Hands or pack only. Clothed. No extra people. No nude. Factory still only — do not use Character plates.";
  const unbox =
    formatId === "unbox-talk"
      ? `Cozy sunlit bedroom. ${wardrobe} She sits on the bed. Closed retail box of ${name} in the foreground (real packaging from the listing, not a white box labeled THIS SKU). Shocked/happy face. Box logo/color readable.`
      : formatId === "beauty-grwm"
        ? `Sunlit vanity. ${wardrobe} ${name} in her hand or on the table. About to apply it. Not an unbox, not a shoe box.`
        : "";
  return `9:16 Factory UGC first frame (not a Character still). ${unbox || visual}. Exact product: ${name}. Copy logos from the listing reference — spell the brand exactly, no extra letters. ${lock} Product readable, no watermark.`;
}

async function writeStill(opts: {
  product: Product;
  pack: ScriptPack;
  formatId: string;
  market?: string;
  onProgress: (msg: string) => void;
}) {
  const { product, pack, formatId, market, onProgress } = opts;
  const stillJobId = randomUUID();
  const listing = listingLocal(product);
  if (listingStillOk(formatId) && listing) {
    onProgress("First frame from listing…");
    const dest = copyListingStill(product, stillJobId);
    if (!dest) throw new Error("Listing photo missing on disk. Re-import the SKU.");
    const job: Job = {
      id: stillJobId,
      module: "production",
      kind: "image",
      input: `listing still ${product.title}`,
      status: "completed",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      model: "listing",
      provider: "catalog",
      productId: product.id,
      source: "ugc-factory",
      sourceKind: "listing_still",
      mediaPath: dest.path,
      mediaUrl: dest.url,
    };
    insertJob(job);
    return dest.url;
  }
  const prompt = stillPrompt(product, pack, formatId, market);
  insertJob({
    id: stillJobId,
    module: "production",
    kind: "image",
    input: prompt.slice(0, 2000),
    status: "queued",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    model: "qwen-image-2.1",
    provider: "comfy",
    productId: product.id,
    source: "ugc-factory",
    progress: "Queued — Qwen 2.1 still…",
  });
  onProgress("Waiting for GPU…");
  await waitForGpuIdle({ jobId: stillJobId, onWait: onProgress });
  updateJob(stillJobId, { status: "running", progress: "Qwen 2.1 still…" });
  onProgress("Composing first frame…");
  const ref = listing ? mediaUrlToPath(listing) : "";
  const { buffer } = await generateStill(
    prompt,
    ref && fs.existsSync(ref) ? { scene: ref } : undefined,
    "qwen-image-2.1",
    { kind: "transform", aspect: "9:16" },
  );
  const dest = menuAsset("ugc-factory", stillJobId, "png");
  fs.writeFileSync(dest.path, buffer);
  updateJob(stillJobId, {
    status: "completed",
    sourceKind: "generated_still",
    mediaPath: dest.path,
    mediaUrl: dest.url,
    progress: undefined,
  });
  return dest.url;
}

function engineProvider(engineId: string) {
  if (engineId === "grok-imagine-video") return "grok";
  if (engineId === "seedance-2-5") return "higgsfield";
  return "dashscope";
}

function engineLabel(engineId: string) {
  if (engineId === "grok-imagine-video") return "Grok Video";
  if (engineId === "seedance-2-5") return "Seedance";
  return "Wan";
}

async function renderScene(opts: {
  src: string;
  prompt: string;
  durationSec: number;
  engineId: string;
  extra: string[];
  clipId: string;
  onProgress: (msg: string) => void;
}) {
  const { src, prompt, durationSec, engineId, extra, clipId, onProgress } = opts;
  try {
    if (engineId === "grok-imagine-video") return await grokImagineVideoI2V(src, prompt, durationSec);
    if (engineId === "seedance-2-5") return await cometSeedanceI2V(src, prompt, durationSec, engineId, extra);
    return await dashscopeWan3Video({
      prompt,
      stillPath: src,
      extraStillPaths: extra,
      durationSec,
      sound: false,
      engineId: engineId === "wan-3-0-std" ? "wan-3-0-std" : "wan-3-0",
      jobId: clipId,
      ratio: "9:16",
      onProgress,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/\bnsfw\b|safety|sexual|inappropriate|content policy|green net/i.test(msg)) throw err;
    onProgress("Safety block — Grok Imagine Video…");
    return grokImagineVideoI2V(src, prompt, Math.min(15, Math.max(3, durationSec)));
  }
}

async function writeClip(opts: {
  product: Product;
  pack: ScriptPack;
  stillUrl: string;
  engineId: string;
  formatId: string;
  durationSec: number;
  market?: string;
  locale?: string;
  onProgress: (msg: string) => void;
}) {
  const { product, pack, stillUrl, engineId, formatId, durationSec, market, locale, onProgress } = opts;
  const src = mediaUrlToPath(stillUrl);
  if (!fs.existsSync(src)) throw new Error("First frame missing on disk.");
  const cuts = storyboardCuts(pack);
  const plan = cuts.length
    ? cuts
    : [{ index: 1, durationSec, spoken: pack.hook || "", overlay: "", goal: "", visual: pack.hookVisual || "" }];
  // Any extra gallery photo flips Wan into "she wears these". Faceless recipes stay on the listing still.
  const lane = FACTORY_FORMATS.find((row) => row.id === formatId)?.lane;
  const extra = lane === "talent"
    ? (product.images || [])
      .filter((u) => u.startsWith("/api/media/") && u !== stillUrl)
      .map(mediaUrlToPath)
      .filter((p) => p && fs.existsSync(p))
      .slice(0, 2)
    : [];
  const title = spokenProductName(product.title);
  const parts: string[] = [];
  for (const cut of plan) {
    const fitted = factoryClipDuration(engineId, cut.durationSec);
    if ("error" in fitted) throw new Error(fitted.error);
    const prompt = factoryScenePrompt({
      productTitle: title,
      formatId,
      marketLine: marketRegionLine(market),
      index: cut.index,
      count: plan.length,
      goal: cut.goal,
      shot: cut.shot,
      durationSec: fitted.durationSec,
    });
    const clipId = randomUUID();
    const raw = menuAsset("ugc-factory", clipId, "mp4");
    const burned = menuAsset("ugc-factory", `${clipId}-card`, "mp4");
    insertJob({
      id: clipId,
      module: "production",
      kind: "motion",
      input: [prompt, stillUrl, cut.overlay, cut.spoken].filter(Boolean).join(" | ").slice(0, 2000),
      status: "running",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      model: engineId,
      provider: engineProvider(engineId),
      productId: product.id,
      source: "ugc-factory",
      progress: `Scene ${cut.index}/${plan.length} · ${engineLabel(engineId)}…`,
    });
    onProgress(`Scene ${cut.index}/${plan.length} · ${engineLabel(engineId)}…`);
    try {
      const buffer = await renderScene({
        src,
        prompt,
        durationSec: fitted.durationSec,
        engineId,
        extra,
        clipId,
        onProgress: (msg) => onProgress(`Scene ${cut.index}/${plan.length} · ${msg}`),
      });
      fs.writeFileSync(raw.path, buffer);
      await burnStoryboardCard(raw.path, burned.path, cut);
      onProgress(`Scene ${cut.index}/${plan.length} · voiceover…`);
      const voiced = menuAsset("ugc-factory", `${clipId}-voice`, "mp4");
      await attachSceneNarration({
        clipPath: burned.path,
        dest: voiced.path,
        text: cut.spoken,
        locale,
        market,
      });
      updateJob(clipId, {
        status: "completed",
        mediaPath: voiced.path,
        mediaUrl: voiced.url,
        sourceKind: "generated_video",
        progress: undefined,
      });
      parts.push(voiced.path);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      updateJob(clipId, { status: "failed", error: msg, progress: undefined });
      throw err;
    }
  }
  const joined = menuAsset("ugc-factory", randomUUID(), "mp4");
  await concatSceneClips(parts, joined.path);
  if (plan.some((cut) => cut.spoken.trim())) {
    const inspected = await probeMedia(joined.path);
    if (!inspected.hasAudio) throw new Error("This export needs a voice track. Burned text is not the voiceover.");
  }
  return joined.url;
}

async function writeVo(opts: {
  product: Product;
  pack: ScriptPack;
  clipUrl: string;
  market?: string;
  locale?: string;
  onProgress: (msg: string) => void;
}) {
  const clipPath = mediaUrlToPath(opts.clipUrl);
  if (clipPath && fs.existsSync(clipPath) && await mediaHasAudio(clipPath)) return opts.clipUrl;
  const vo = (opts.pack.voiceover || "").trim();
  if (!vo || !clipPath || !fs.existsSync(clipPath)) return opts.clipUrl;
  const voice = narrationVoice(opts.locale, opts.market);
  const jobId = randomUUID();
  insertJob({
    id: jobId,
    module: "production",
    kind: "voice",
    input: vo.slice(0, 2000),
    status: "running",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    model: voice,
    provider: "voice",
    productId: opts.product.id,
    source: "ugc-factory",
    progress: "VO…",
  });
  opts.onProgress("Voiceover…");
  let spoken: Awaited<ReturnType<typeof speakNarration>> | undefined;
  try {
    spoken = await speakNarration(vo, voice);
    const mux = menuAsset("ugc-factory", `${jobId}-vo`, "mp4");
    await fitVoiceOntoClip(clipPath, spoken.file, mux.path);
    updateJob(jobId, { status: "completed", mediaPath: mux.path, mediaUrl: mux.url, progress: undefined });
    return mux.url;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    updateJob(jobId, { status: "failed", error: message.slice(0, 240), progress: undefined });
    throw err;
  } finally {
    if (spoken) fs.rmSync(spoken.dir, { recursive: true, force: true });
  }
}

export async function runFactoryOne(opts: {
  product: Product;
  formatId: FactoryFormatId;
  engineId?: string;
  pack?: ScriptPack;
  jobId: string;
  skipResearch?: boolean;
  market?: string;
  locale?: string;
  durationSec?: number;
}) {
  const { product, formatId, jobId } = opts;
  const engineId = opts.engineId || "wan-3-0";
  const tick = (msg: string) => updateJob(jobId, { progress: msg, status: "running" });
  let pack = opts.pack;
  if (opts.skipResearch && !pack) throw new Error("Approved script missing.");
  if (opts.skipResearch) {
    tick("Using the approved script…");
  } else {
    tick("Researching SKU…");
    const research = await researchProduct(product, factoryScriptLlm());
    try {
      patchProduct(product.id, { research });
    } catch {
      /* in-memory */
    }
    if (!pack) {
      tick("Writing…");
      pack = await generateScriptForProduct(product, factoryFormatLine(formatId), research, factoryScriptLlm());
    }
  }
  if (!pack) throw new Error("Approved script missing.");
  updateJob(jobId, { script: pack, progress: "First frame…" });
  if (isSlideshowFormat(formatId)) {
    const briefs = pack.beats.map((beat) => beat.visual || beat.spoken).filter(Boolean).slice(0, 6);
    if (briefs.length !== 6) throw new Error("A slideshow is exactly six images.");
    let first = "";
    for (let i = 0; i < briefs.length; i++) {
      tick(`Slide ${i + 1} / 6`);
      const slidePack = { ...pack, firstFrame: briefs[i], hookVisual: briefs[i] };
      const url = await writeStill({ product, pack: slidePack, formatId, market: opts.market, onProgress: tick });
      if (!first) first = url;
    }
    updateJob(jobId, {
      status: "completed",
      mediaUrl: first,
      stillUrl: first,
      script: pack,
      progress: undefined,
    });
    return { stillUrl: first, clipUrl: "", pack };
  }
  const stillUrl = await writeStill({ product, pack, formatId, market: opts.market, onProgress: tick });
  updateJob(jobId, { stillUrl, progress: "First frame ready" });
  const clipUrl = await writeClip({
    product,
    pack,
    stillUrl,
    engineId,
    formatId,
    durationSec: opts.durationSec || storyboardSeconds(pack) || 8,
    market: opts.market,
    locale: opts.locale,
    onProgress: tick,
  });
  const out = await writeVo({ product, pack, clipUrl, market: opts.market, locale: opts.locale, onProgress: tick });
  updateJob(jobId, {
    status: "completed",
    mediaUrl: out,
    stillUrl,
    script: pack,
    progress: undefined,
  });
  return { stillUrl, clipUrl: out, pack };
}

export async function runFactoryBatch(opts: { product: Product; formatId: FactoryFormatId; jobId: string }) {
  const { product, formatId, jobId } = opts;
  const tick = (msg: string) => updateJob(jobId, { progress: msg, status: "running" });
  tick("Researching SKU…");
  const research = await researchProduct(product, factoryScriptLlm());
  try {
    patchProduct(product.id, { research });
  } catch {
    /* in-memory */
  }
  tick("Batch 12 concepts…");
  const concepts = await generateScriptBatch(product, research, factoryFormatLine(formatId), batchFormatIds(formatId), factoryScriptLlm());
  updateJob(jobId, {
    status: "completed",
    script: concepts[0],
    concepts,
    progress: undefined,
    input: `batch12 ${product.title}`,
  });
  return concepts;
}
