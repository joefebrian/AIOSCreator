import { after, NextResponse } from "next/server";
import {
  approveFactoryScript,
  approveStoryboard,
  createFactoryVariants,
  factoryCatalog,
  factoryFormatForRecipe,
  fashionLooksForFactory,
  finishFactoryProduction,
  generateFactoryConcepts,
  listFactoryVariants,
  patchFactoryVariant,
  previewFactoryStill,
  queueFactoryProduction,
  recheckFactoryScript,
  applyJevDuration,
  reopenFactoryScript,
  scriptPackFromApproved,
  writeFactoryBrief,
  writeFactoryScript,
  writeFactoryScriptAstra,
  writeStoryboardVisual,
} from "@/lib/ugc-factory-board";
import { runFactoryOne } from "@/lib/factory-run";
import { brandedResearch } from "@/lib/brand-research";
import { skuIdentityUrl } from "@/lib/product-import";
import { getProduct, listProducts } from "@/lib/products";
import { insertJob, listJobs, updateJob, type Job } from "@/lib/store";
import { spokenLineFit, storyboardCuts, storyboardSeconds } from "@/lib/ugc-factory-pack";
import { FACTORY_I2V, factoryClipDuration } from "@/lib/ugc-script";

export const runtime = "nodejs";
export const maxDuration = 1800;

export async function GET() {
  const products = listProducts().slice(0, 40).map((product) => {
    const research = brandedResearch(product.brandedMatches);
    return {
      id: product.id,
      title: product.title,
      image: skuIdentityUrl(product),
      imageRole: product.imageRoles?.[product.imageRoles.indexOf("identity")] || "",
      sourceUrl: product.sourceUrl,
      currency: product.currency || "",
      price: product.price || "",
      instagramUsername: product.instagramUsername || "",
      suggestedTemplateId: product.brandedMatches?.suggestedTemplateId || "",
      brandedCounts: product.brandedMatches?.counts || {},
      brandedResearch: research?.line || "",
      brandedExamples: research?.examples || [],
    };
  });
  const jobs = listJobs();
  return NextResponse.json({
    ...factoryCatalog(),
    variants: listFactoryVariants().map((variant) => {
      const job = variant.produceJobId ? jobs.find((row) => row.id === variant.produceJobId) : undefined;
      return {
        ...variant,
        produce: job
          ? { status: job.status, progress: job.progress || "", mediaUrl: job.mediaUrl || variant.outputUrl || "", error: job.error || "" }
          : undefined,
      };
    }),
    products,
    fashionLooks: fashionLooksForFactory(),
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const op = String(body.op || "");
  if (op === "create") {
    const result = createFactoryVariants({
      name: stringOf(body.name),
      productId: stringOf(body.productId),
      title: stringOf(body.title),
      sourceUrl: stringOf(body.sourceUrl),
      destinationUrl: stringOf(body.destinationUrl),
      markets: Array.isArray(body.markets) ? body.markets.map(String) : [],
      platform: String(body.platform || ""),
      templateId: String(body.templateId || ""),
      idempotencyKey: stringOf(body.idempotencyKey),
      talentSource: body.talentSource === "NEW" || body.talentSource === "FASHION_LOOK" || body.talentSource === "NONE" ? body.talentSource : undefined,
      fashionProjectId: stringOf(body.fashionProjectId),
      reuseMode: body.reuseMode === "USE_THIS_LOOK" || body.reuseMode === "SAME_TALENT_AND_OUTFIT" || body.reuseMode === "TALENT_ONLY" ? body.reuseMode : undefined,
      extras: extrasOf(body.extras),
    });
    if ("error" in result && result.error) return NextResponse.json(result, { status: 400 });
    return NextResponse.json(result);
  }
  if (op === "concepts") {
    const result = generateFactoryConcepts(String(body.variantId || ""), String(body.idempotencyKey || ""));
    if ("error" in result) return NextResponse.json(result, { status: 404 });
    return NextResponse.json(result);
  }
  if (op === "brief") {
    try {
      const result = await writeFactoryBrief(String(body.variantId || ""));
      if ("error" in result && result.error) return NextResponse.json(result, { status: result.error === "not found" ? 404 : 400 });
      return NextResponse.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: message, mediaJobs: 0 }, { status: 502 });
    }
  }
  if (op === "script") {
    const variantId = String(body.variantId || "");
    const instructions = stringOf(body.instructions);
    try {
      const result = body.engine === "planner" ? writeFactoryScript(variantId, instructions) : await writeFactoryScriptAstra(variantId, instructions, stringOf(body.model));
      if ("error" in result && result.error) return NextResponse.json(result, { status: result.code === "FROZEN" ? 409 : result.code === "DURATION" ? 400 : 404 });
      return NextResponse.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: message, mediaJobs: 0 }, { status: 502 });
    }
  }
  if (op === "recheck") {
    const result = recheckFactoryScript(String(body.variantId || ""));
    if ("error" in result) return NextResponse.json(result, { status: 404 });
    return NextResponse.json(result);
  }
  if (op === "reopen-script") {
    const result = reopenFactoryScript(String(body.variantId || ""));
    if ("error" in result) return NextResponse.json(result, { status: 404 });
    return NextResponse.json(result);
  }
  if (op === "approve-script") {
    const result = approveFactoryScript(String(body.variantId || ""), Number(body.expectedRevision || 0));
    if ("error" in result) return NextResponse.json(result, { status: result.code === "REVISION" ? 409 : 400 });
    return NextResponse.json(result);
  }
  if (op === "visualize") {
    try {
      const result = await writeStoryboardVisual(String(body.variantId || ""));
      if ("error" in result && result.error) return NextResponse.json(result, { status: result.code === "FROZEN" ? 409 : result.code === "SHORT" ? 502 : 404 });
      return NextResponse.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: message, mediaJobs: 0 }, { status: 502 });
    }
  }
  if (op === "approve-storyboard") {
    const result = approveStoryboard(String(body.variantId || ""), Number(body.expectedRevision || 0));
    if ("error" in result) return NextResponse.json(result, { status: result.code === "REVISION" ? 409 : 400 });
    return NextResponse.json(result);
  }
  if (op === "preview") {
    try {
      const result = await previewFactoryStill(String(body.variantId || ""));
      if ("error" in result && result.error) return NextResponse.json(result, { status: result.error === "not found" ? 404 : 400 });
      return NextResponse.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: message, mediaJobs: 0, videos: 0 }, { status: 502 });
    }
  }
  if (op === "produce") {
    const variantId = String(body.variantId || "");
    const requested = String(body.engineId || "");
    const engineId = FACTORY_I2V.some((model) => model.id === requested) ? requested : "wan-3-0";
    const current = listFactoryVariants().find((row) => row.id === variantId);
    if (current && !(current.stage === "IN_PRODUCTION" && current.produceJobId)) {
      const rushed = (current.script?.scenes || []).find((scene) => scene.spoken && !spokenLineFit(scene.spoken, (scene.targetMs || 0) / 1000).ok);
      if (rushed) return NextResponse.json({ error: "A spoken line does not fit its scene. Estimate the seconds again before generating." }, { status: 400 });
      const preview = scriptPackFromApproved(current);
      const cuts = storyboardCuts(preview);
      const pieces = cuts.length ? cuts.map((cut) => cut.durationSec) : [storyboardSeconds(preview)];
      const blocked = pieces.map((seconds) => factoryClipDuration(engineId, seconds)).find((fit) => "error" in fit);
      if (blocked && "error" in blocked) return NextResponse.json({ error: blocked.error }, { status: 400 });
    }
    const queued = queueFactoryProduction(variantId, Number(body.expectedRevision || 0));
    if ("error" in queued) return NextResponse.json(queued, { status: queued.code === "REVISION" ? 409 : 400 });
    if (!queued.duplicate) {
      const product = getProduct(queued.variant.productId || "");
      const formatId = factoryFormatForRecipe(queued.variant.templateId);
      const pack = scriptPackFromApproved(queued.variant);
      if (!product || !formatId || !pack) {
        finishFactoryProduction(variantId, queued.jobId, { ok: false, error: "Approved script missing." });
        return NextResponse.json({ error: "Approved script missing." }, { status: 400 });
      }
      const now = new Date().toISOString();
      const job: Job = {
        id: queued.jobId,
        module: "production",
        kind: "factory",
        input: `one ${formatId} ${product.title}`.slice(0, 2000),
        status: "queued",
        createdAt: now,
        updatedAt: now,
        model: engineId,
        provider: "factory",
        productId: product.id,
        source: "ugc-factory",
        progress: "Queued — approved script…",
        script: pack,
      };
      insertJob(job);
      after(async () => {
        try {
          const result = await runFactoryOne({
            product,
            formatId,
            pack,
            engineId,
            jobId: queued.jobId,
            skipResearch: true,
            market: queued.variant.market,
            locale: queued.variant.locale,
            durationSec: storyboardSeconds(pack),
          });
          const mediaUrl = result.clipUrl || result.stillUrl;
          finishFactoryProduction(variantId, queued.jobId, mediaUrl ? { ok: true, mediaUrl } : { ok: false, error: "The clip did not finish." });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          updateJob(queued.jobId, { status: "failed", error: message.slice(0, 240), progress: undefined });
          finishFactoryProduction(variantId, queued.jobId, { ok: false, error: message });
        }
      });
    }
    return NextResponse.json({ jobId: queued.jobId, duplicate: queued.duplicate, stage: queued.variant.stage });
  }
  if (op === "estimate-duration") {
    try {
      const result = await applyJevDuration(String(body.variantId || ""));
      if ("error" in result && result.error) return NextResponse.json(result, { status: result.error === "not found" ? 404 : 400 });
      return NextResponse.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ error: message, mediaJobs: 0 }, { status: 502 });
    }
  }
  if (op === "patch") {
    const result = patchFactoryVariant(String(body.variantId || ""), {
      name: stringOf(body.name),
      destinationUrl: stringOf(body.destinationUrl),
      expectedRevision: Number(body.expectedRevision || 0) || undefined,
      instructions: stringOf(body.instructions),
      scriptModel: stringOf(body.scriptModel),
    });
    if ("error" in result) return NextResponse.json(result, { status: result.code === "REVISION" ? 409 : 404 });
    return NextResponse.json(result);
  }
  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}

function stringOf(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function extrasOf(value: unknown) {
  if (!value || typeof value !== "object") return undefined;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, on]) => [key, Boolean(on)]));
}
