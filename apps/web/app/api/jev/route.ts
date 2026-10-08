import { NextResponse } from "next/server";
import { jevDecide, probeJev, type JevQuestion } from "@/lib/jev";
import { jevConfig } from "@/lib/providers";

export const runtime = "nodejs";

export async function GET() {
  const cfg = jevConfig();
  const probe = cfg.ready ? await probeJev() : { ok: false, error: "OpenRouter key missing for Jev" };
  return NextResponse.json({
    model: cfg.model,
    keyHint: cfg.keyHint,
    ready: cfg.ready,
    probe,
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    state?: unknown;
    questions?: Record<string, JevQuestion>;
  };
  if (!body.questions || typeof body.questions !== "object") {
    return NextResponse.json({ error: "questions required" }, { status: 400 });
  }
  try {
    const result = await jevDecide(body.state ?? {}, body.questions);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
