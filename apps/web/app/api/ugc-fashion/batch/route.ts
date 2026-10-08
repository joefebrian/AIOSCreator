import { NextResponse } from "next/server";
import { fashionPromptModel, renderQueuedFashionStills, rewriteFashionPrompt } from "@/lib/nvidia-fashion";
import {
  admitImageBatch,
  admitMotionBatch,
  applyCharacterStrategy,
  applyPreset,
  approveStill,
  archiveFashionProject,
  assignMotionBulk,
  assignMotions,
  createDrafts,
  csvTemplate,
  decideRender,
  duplicateFashionProject,
  exportApproved,
  getFashionProject,
  getReviewQueue,
  importCsv,
  listFashionBatches,
  listPresets,
  moveReviewCursor,
  openReviewQueue,
  patchFashionProject,
  previewCsv,
  previewImageQuote,
  previewMotionQuote,
  previewPreset,
  reviewDecision,
  reviseStill,
  seedFixtureCandidates,
  seedFixtureRenders,
  stopRemaining,
  takeQuote,
  tickFashionQueue,
} from "@/lib/ugc-fashion";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("template") === "csv") {
    return new NextResponse(csvTemplate(), { headers: { "Content-Type": "text/csv; charset=utf-8" } });
  }
  const queueId = url.searchParams.get("queue") || "";
  if (queueId) {
    const found = getReviewQueue(queueId);
    if (!found) return NextResponse.json({ error: "queue not found" }, { status: 404 });
    return NextResponse.json(found);
  }
  return NextResponse.json({ ...tickFashionQueue(), presets: listPresets() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const op = String(body.op || "");
  const projectIds = Array.isArray(body.projectIds) ? body.projectIds.map(String) : [];
  const idempotencyKey = String(body.idempotencyKey || "");

  if (op === "create-drafts") {
    const result = createDrafts({
      mode: body.mode === "one-look" || body.mode === "group" ? body.mode : "one-url-per-look",
      urls: Array.isArray(body.urls) ? body.urls.map(String) : [],
      groups: Array.isArray(body.groups) ? (body.groups as { lookKey?: string; name?: string; urls: string[] }[]) : [],
      idempotencyKey,
      lookName: typeof body.lookName === "string" ? body.lookName : undefined,
    });
    if ("error" in result && result.error) return NextResponse.json(result, { status: 400 });
    return NextResponse.json(result);
  }
  if (op === "preview-csv") return NextResponse.json(previewCsv(String(body.text || "")));
  if (op === "import-csv") {
    const result = importCsv(String(body.text || ""), idempotencyKey);
    if ("error" in result) return NextResponse.json(result, { status: 400 });
    return NextResponse.json(result);
  }
  if (op === "preview-preset") {
    const result = previewPreset(projectIds, String(body.presetId || ""), arrayOf(body.fields), Boolean(body.replaceOverrides));
    if ("error" in result) return NextResponse.json(result, { status: 404 });
    return NextResponse.json(result);
  }
  if (op === "apply-preset") {
    const result = applyPreset(projectIds, String(body.presetId || ""), arrayOf(body.fields), Boolean(body.replaceOverrides));
    if ("error" in result) return NextResponse.json(result, { status: 404 });
    return NextResponse.json(result);
  }
  if (op === "apply-character") {
    const strategy = body.strategy === "same" ? "same" : "different";
    return NextResponse.json(applyCharacterStrategy(projectIds, strategy));
  }
  if (op === "preview-image") return NextResponse.json(previewImageQuote(projectIds, Number(body.candidateCount || 2)));
  if (op === "rewrite-prompt") {
    const project = getFashionProject(String(body.projectId || ""));
    if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });
    const model = fashionPromptModel(String(body.promptModel || project.promptModel || ""));
    try {
      const prompt = await rewriteFashionPrompt(project, model);
      const saved = patchFashionProject(project.id, { prompt, promptModel: model, expectedRevision: project.revision });
      if ("error" in saved && saved.error) return NextResponse.json(saved, { status: saved.status || 400 });
      return NextResponse.json({ ...saved.project, conflicts: saved.conflicts });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Prompt rewrite failed.";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }
  if (op === "image-batch") {
    const admitted = admitFromQuote("image", idempotencyKey, String(body.quoteId || ""));
    if (admitted.batch && !admitted.duplicate) {
      void renderQueuedFashionStills(admitted.batch.projectIds);
      return jsonStatus(admitted);
    }
    return jsonStatus(admitted);
  }
  if (op === "preview-motion") return NextResponse.json(previewMotionQuote(projectIds));
  if (op === "motion-batch") return jsonStatus(admitFromQuote("motion", idempotencyKey, String(body.quoteId || "")));
  if (op === "seed-fixture") {
    const result = seedFixtureCandidates(String(body.projectId || ""));
    if ("error" in result) return NextResponse.json(result, { status: 404 });
    return NextResponse.json(result);
  }
  if (op === "seed-fixture-renders") {
    const result = seedFixtureRenders(String(body.projectId || ""), Boolean(body.failOne));
    if ("error" in result) return NextResponse.json(result, { status: 404 });
    return NextResponse.json(result);
  }
  if (op === "revise-still") {
    const result = reviseStill(String(body.projectId || ""), String(body.candidateId || ""), String(body.note || ""), numberOrUndefined(body.expectedRevision));
    if ("error" in result && result.error) return NextResponse.json(result, { status: result.status || 400 });
    return NextResponse.json(result);
  }
  if (op === "approve-still") {
    const result = approveStill(String(body.projectId || ""), String(body.candidateId || ""), numberOrUndefined(body.expectedRevision));
    if ("error" in result) return NextResponse.json(result, { status: result.code === "REVISION" ? 409 : 400 });
    return NextResponse.json(result);
  }
  if (op === "assign-motion") {
    const result = assignMotions(String(body.projectId || ""), motionRefs(body.motions));
    if ("error" in result) return NextResponse.json(result, { status: 400 });
    return NextResponse.json(result);
  }
  if (op === "assign-motion-bulk") {
    const mode = body.mode === "map" || body.mode === "multiple" ? body.mode : "same";
    return NextResponse.json(assignMotionBulk(projectIds, mode, motionRefs(body.motions), motionMap(body.map)));
  }
  if (op === "open-review") {
    const kind = body.kind === "video" ? "video" : "look";
    return NextResponse.json(openReviewQueue(projectIds, kind));
  }
  if (op === "review-move") return NextResponse.json(moveReviewCursor(String(body.queueId || ""), Number(body.delta || 0)));
  if (op === "review-decision") {
    const result = reviewDecision({
      queueId: String(body.queueId || ""),
      decision: body.decision === "revision" || body.decision === "skip" ? body.decision : "approve",
      candidateId: typeof body.candidateId === "string" ? body.candidateId : undefined,
      renderId: typeof body.renderId === "string" ? body.renderId : undefined,
      checklist: Boolean(body.checklist),
      expectedRevision: numberOrUndefined(body.expectedRevision),
      note: typeof body.note === "string" ? body.note : undefined,
    });
    return NextResponse.json(result, { status: result.status || 200 });
  }
  if (op === "decide-render") {
    const decision = body.decision === "rejected" || body.decision === "skipped" ? body.decision : "approved";
    const result = decideRender(String(body.projectId || ""), String(body.renderId || ""), decision, Boolean(body.primary));
    if ("error" in result) return NextResponse.json(result, { status: 400 });
    return NextResponse.json(result);
  }
  if (op === "export-approved") return NextResponse.json(exportApproved(projectIds));
  if (op === "stop-remaining") {
    const result = stopRemaining(String(body.batchId || ""));
    if ("error" in result) return NextResponse.json(result, { status: 404 });
    return NextResponse.json(result);
  }
  if (op === "duplicate") {
    const result = duplicateFashionProject(String(body.projectId || ""));
    if ("error" in result) return NextResponse.json(result, { status: 404 });
    return NextResponse.json(result);
  }
  if (op === "archive") {
    const result = archiveFashionProject(String(body.projectId || ""));
    if ("error" in result) return NextResponse.json(result, { status: 404 });
    return NextResponse.json(result);
  }
  return NextResponse.json({ error: "unknown op" }, { status: 400 });
}

function arrayOf(value: unknown) {
  return Array.isArray(value) ? value.map(String) : [];
}

function numberOrUndefined(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function motionRefs(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    const item = row as { label?: string; assetUrl?: string; trimIn?: number; trimOut?: number };
    return { label: item.label || "Motion", assetUrl: item.assetUrl || "", trimIn: Number(item.trimIn) || 0, trimOut: Number(item.trimOut) || 0 };
  });
}

function motionMap(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    const item = row as { projectId?: string; motions?: unknown };
    return { projectId: String(item.projectId || ""), motions: motionRefs(item.motions) };
  });
}

function jsonStatus(result: { status?: number }) {
  return NextResponse.json(result, { status: result.status || 200 });
}

function admitFromQuote(kind: "image" | "motion", idempotencyKey: string, quoteId: string) {
  if (!idempotencyKey.trim()) return { error: "idempotencyKey required", status: 400 };
  const existing = listFashionBatches().find((batch) => batch.idempotencyKey === idempotencyKey);
  if (existing) return { batch: existing, duplicate: true, status: 200 };
  const taken = takeQuote(quoteId);
  if ("error" in taken && taken.error) {
    const status = taken.code === "QUOTE_CONFLICT" || taken.code === "QUOTE_EXPIRED" ? 409 : 400;
    return { ...taken, status };
  }
  if (!("quote" in taken) || !taken.quote) return { error: "quote required", status: 400 };
  if (taken.quote.kind !== kind) return { error: "quote kind does not match", status: 400 };
  const result = kind === "image"
    ? admitImageBatch(taken.quote.projectIds, taken.quote.candidateCount, idempotencyKey)
    : admitMotionBatch(taken.quote.projectIds, idempotencyKey);
  return { ...result, quote: taken.quote, status: 200 };
}
