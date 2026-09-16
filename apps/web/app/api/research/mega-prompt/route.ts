import { NextResponse } from "next/server";
import { formatMegaChecklist } from "@/lib/mega-prompt";
import { listResearchExtracts, patchResearchExtract } from "@/lib/research";

export const runtime = "nodejs";

/** Local re-format. No LLM. Video extracts only. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    imagePrompt?: string;
    motionPrompt?: string;
    durationSec?: number;
    kind?: "image" | "video";
  };
  const existing = body.id ? listResearchExtracts().find((e) => e.id === body.id) : undefined;
  const kind = body.kind || existing?.kind || "image";
  if (kind !== "video") {
    return NextResponse.json({ error: "Mega checklist is video-only. Extract a clip, not a still." }, { status: 400 });
  }
  const imagePrompt = (body.imagePrompt || existing?.imagePrompt || "").trim();
  const motionPrompt = (body.motionPrompt || existing?.motionPrompt || "").trim();
  if (!imagePrompt && !motionPrompt) {
    return NextResponse.json({ error: "extract a video first" }, { status: 400 });
  }
  const megaPrompt = formatMegaChecklist({
    imagePrompt,
    motionPrompt,
    durationSec: body.durationSec ?? existing?.windowSec ?? existing?.durationSec,
    kind: "video",
  });
  if (existing) patchResearchExtract(existing.id, { megaPrompt });
  return NextResponse.json({ megaPrompt, model: "local-checklist", id: existing?.id || null });
}
