import { NextResponse } from "next/server";
import { invalidateApprovalsForBlueprint, pinFactoryReference, readFactoryV2 } from "@/lib/ugc-factory-v2";
import { listReferenceRecreations, openFactoryDraftForReference, recreateReferenceMarkets } from "@/lib/ugc-reference-factory";
import { correctReferenceBlueprint, listReferenceBlueprints } from "@/lib/ugc-reference-blueprint";
import { listReferenceScripts, saveReferenceScript } from "@/lib/ugc-reference-scripts";
import {
  getUgcImportAsset,
  getUgcImportJob,
  listUgcImportState,
  resumeUgcImports,
  startUgcReferenceImport,
} from "@/lib/ugc-reference-import";
import {
  addReferenceFromImport,
  addReferenceCandidateFact,
  addUgcReferenceUrl,
  adoptMeasuredUpload,
  analyzeUgcReference,
  attachUgcVideo,
  importAndPreviewReference,
  listUgcReferences,
  retryReferenceImport,
  reviewUgcAnalysis,
  setUgcReferenceRelation,
} from "@/lib/ugc-references";

export const runtime = "nodejs";

function fail(err: unknown) {
  const message = (err instanceof Error ? err.message : String(err)).replace(/sk-[A-Za-z0-9_-]+/g, "sk-…").replace(/EAA[A-Za-z0-9]+/g, "");
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const productId = url.searchParams.get("productId") || "";
  const importId = url.searchParams.get("importId") || "";
  resumeUgcImports();
  if (importId) {
    const job = getUgcImportJob(importId);
    const asset = job?.assetId ? getUgcImportAsset(job.assetId) : null;
    return NextResponse.json({ job, asset });
  }
  if (!productId) return NextResponse.json({ references: [], imports: { jobs: [], assets: [] }, scripts: [] });
  return NextResponse.json({
    references: listUgcReferences(productId),
    imports: listUgcImportState(),
    scripts: listReferenceScripts(productId),
    blueprints: listReferenceBlueprints(productId),
    recreations: listReferenceRecreations(productId),
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const op = String(body.op || "");
  const productId = String(body.productId || "");
  try {
    if (op === "add-url") {
      const result = addUgcReferenceUrl({
        workspaceId: body.workspaceId ? String(body.workspaceId) : undefined,
        productId,
        skuId: String(body.skuId || ""),
        url: String(body.url || ""),
        creator: body.creator ? String(body.creator) : null,
        publishedAt: body.publishedAt ? String(body.publishedAt) : null,
        market: body.market ? String(body.market) : null,
        locale: body.locale ? String(body.locale) : null,
        source: body.source === "match" ? "match" : "url",
      });
      return NextResponse.json(result);
    }
    if (op === "attach-video") {
      const result = attachUgcVideo({
        workspaceId: body.workspaceId ? String(body.workspaceId) : undefined,
        productId,
        skuId: String(body.skuId || ""),
        mediaUrl: String(body.mediaUrl || ""),
        referenceId: body.referenceId ? String(body.referenceId) : null,
      });
      const measured = await adoptMeasuredUpload({
        workspaceId: body.workspaceId ? String(body.workspaceId) : undefined,
        productId,
        referenceId: result.reference.id,
      });
      return NextResponse.json(measured);
    }
    if (op === "import-preview") {
      const result = await importAndPreviewReference({
        workspaceId: body.workspaceId ? String(body.workspaceId) : undefined,
        productId,
        skuId: String(body.skuId || ""),
        url: String(body.url || ""),
        creator: body.creator ? String(body.creator) : null,
        publishedAt: body.publishedAt ? String(body.publishedAt) : null,
        market: body.market ? String(body.market) : null,
        locale: body.locale ? String(body.locale) : null,
        source: body.source === "match" ? "match" : "url",
      });
      return NextResponse.json(result);
    }
    if (op === "retry-import") {
      const result = await retryReferenceImport({
        workspaceId: body.workspaceId ? String(body.workspaceId) : undefined,
        productId,
        skuId: String(body.skuId || ""),
        referenceId: String(body.referenceId || ""),
      });
      return NextResponse.json(result);
    }
    if (op === "set-relation") {
      const reference = setUgcReferenceRelation({
        workspaceId: body.workspaceId ? String(body.workspaceId) : undefined,
        productId,
        referenceId: String(body.referenceId || ""),
        relation: String(body.relation || ""),
        confirmed: Boolean(body.confirmed),
        basis: body.basis ? String(body.basis) : "",
      });
      return NextResponse.json({ reference });
    }
    if (op === "analyze") {
      const reference = await analyzeUgcReference({
        workspaceId: body.workspaceId ? String(body.workspaceId) : undefined,
        productId,
        referenceId: String(body.referenceId || ""),
      });
      return NextResponse.json({ reference });
    }
    if (op === "review-analysis") {
      const reference = reviewUgcAnalysis({
        workspaceId: body.workspaceId ? String(body.workspaceId) : undefined,
        productId,
        referenceId: String(body.referenceId || ""),
      });
      return NextResponse.json({ reference });
    }
    if (op === "import-video") {
      const result = await startUgcReferenceImport({
        workspaceId: body.workspaceId ? String(body.workspaceId) : undefined,
        productId,
        skuId: String(body.skuId || ""),
        url: String(body.url || ""),
        creator: body.creator ? String(body.creator) : null,
        publishedAt: body.publishedAt ? String(body.publishedAt) : null,
      });
      return NextResponse.json(result);
    }
    if (op === "add-from-import") {
      const asset = getUgcImportAsset(String(body.assetId || ""));
      if (!asset) throw new Error("Download the video before adding it.");
      const result = addReferenceFromImport({
        workspaceId: body.workspaceId ? String(body.workspaceId) : undefined,
        productId,
        skuId: String(body.skuId || ""),
        mediaUrl: asset.mediaUrl,
        fileHash: asset.fileHash,
        sourceUrl: asset.sourceUrl,
        platform: asset.platform,
        postId: asset.postId,
        creator: asset.creator,
        publishedAt: asset.publishedAt,
        posterUrl: asset.posterUrl,
        durationSec: asset.durationSec,
        width: asset.width,
        height: asset.height,
        hasAudio: asset.hasAudio,
        assetId: asset.id,
        relation: body.relation ? String(body.relation) : null,
        confirmed: Boolean(body.confirmed),
        market: body.market ? String(body.market) : null,
        locale: body.locale ? String(body.locale) : null,
        source: body.source === "match" ? "match" : "url",
      });
      return NextResponse.json(result);
    }
    if (op === "add-reference-fact") {
      const result = addReferenceCandidateFact({
        workspaceId: body.workspaceId ? String(body.workspaceId) : undefined,
        productId,
        referenceId: String(body.referenceId || ""),
        statement: String(body.statement || ""),
        source: body.source === "on-screen" ? "on-screen" : "speech",
        startSec: body.startSec == null || body.startSec === "" ? null : Number(body.startSec),
        endSec: body.endSec == null || body.endSec === "" ? null : Number(body.endSec),
      });
      return NextResponse.json(result);
    }
    if (op === "save-script") {
      const reference = listUgcReferences(productId).find((row) => row.id === String(body.referenceId || ""));
      if (!reference?.analysis?.version) throw new Error("Analyze the saved video before saving a script.");
      const saved = saveReferenceScript({
        productId,
        skuId: reference.skuId,
        referenceId: reference.id,
        analysisVersion: reference.analysis.version,
        creator: reference.creator,
        transcriptStatus: reference.analysis.transcriptStatus,
        transcript: reference.analysis.transcript,
        pattern: reference.analysis.pattern || { hook: null, beats: [], demo: null, objections: [], proof: null, cta: null, pacing: null },
      });
      return NextResponse.json(saved);
    }
    if (op === "correct-blueprint") {
      const beats = Array.isArray(body.beats) ? body.beats as { id?: unknown; evidence?: unknown }[] : [];
      const shots = Array.isArray(body.shots) ? body.shots as { id?: unknown; action?: unknown; framing?: unknown }[] : [];
      const result = correctReferenceBlueprint(String(body.blueprintId || ""), {
        beats: beats.map((row) => ({ id: String(row.id || ""), evidence: row.evidence == null ? null : String(row.evidence) })),
        shots: shots.map((row) => ({ id: String(row.id || ""), action: row.action == null ? null : String(row.action), framing: row.framing == null ? null : String(row.framing) })),
      });
      if (result.changed) invalidateApprovalsForBlueprint(result.blueprint.referenceId, result.blueprint.analysisVersion, result.blueprint.version);
      return NextResponse.json(result);
    }
    if (op === "recreate-markets") {
      const markets = Array.isArray(body.markets) ? body.markets : [];
      const result = await recreateReferenceMarkets({
        productId,
        referenceId: String(body.referenceId || ""),
        markets: markets.map((row) => {
          const item = row as { market?: unknown; locale?: unknown };
          return { market: String(item.market || ""), locale: String(item.locale || "") };
        }),
        localize: Array.isArray(body.localize) ? body.localize.map(String) : [],
      });
      return NextResponse.json(result);
    }
    if (op === "recreate") {
      const opened = openFactoryDraftForReference({
        productId,
        referenceId: String(body.referenceId || ""),
        market: body.market ? String(body.market) : null,
        locale: body.locale ? String(body.locale) : null,
        select: Boolean(body.select),
      });
      return NextResponse.json(opened);
    }
    if (op === "use-in-factory") {
      const referenceId = String(body.referenceId || "");
      const reference = listUgcReferences(productId).find((row) => row.id === referenceId);
      if (!reference?.analysis?.reviewed || reference.analysis.version == null) {
        throw new Error("Factory can use this reference after a reviewed analysis.");
      }
      const board = readFactoryV2();
      const production = board.productions.find((row) => row.id === String(body.productionId || ""));
      const sku = production ? board.skus.find((row) => row.id === production.skuId) : null;
      if (!production || sku?.catalogProductId !== productId) throw new Error("That production is for a different product.");
      const pinned = pinFactoryReference(production.id, Number(body.expectedRevision), {
        referenceId: reference.id,
        analysisVersion: reference.analysis.version,
      });
      return NextResponse.json({ production: pinned });
    }
    return NextResponse.json({ error: "Unknown operation" }, { status: 400 });
  } catch (err) {
    return fail(err);
  }
}
