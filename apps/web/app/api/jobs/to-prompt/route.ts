import { NextResponse } from "next/server";
import { mediaToPrompt } from "@/lib/media-to-prompt";
import { addResearchExtract } from "@/lib/research";
import { SpendCapError } from "@/lib/spend-cap";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { url?: string };
  const url = (body.url || "").trim();
  if (!url.startsWith("/api/media/")) {
    return NextResponse.json({ error: "url must be a local /api/media path" }, { status: 400 });
  }
  try {
    const out = await mediaToPrompt(url);
    const saved = addResearchExtract({
      url,
      kind: out.kind,
      imagePrompt: out.imagePrompt,
      motionPrompt: out.motionPrompt,
      firstFrameUrl: out.firstFrameUrl,
      model: out.model,
      tokens: out.tokens,
      durationSec: out.durationSec,
      windowSec: out.windowSec,
      trimmed: out.trimmed,
      tooShort: out.tooShort,
      note: out.note,
      megaPrompt: out.megaPrompt,
    });
    return NextResponse.json({ ...out, id: saved.id, createdAt: saved.createdAt });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = err instanceof SpendCapError ? 402 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
