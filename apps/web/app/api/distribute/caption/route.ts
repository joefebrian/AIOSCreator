import { NextResponse } from "next/server";
import { revampPublishCaption } from "@/lib/caption-revamp";
import { SpendCapError } from "@/lib/spend-cap";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    platform?: string;
    characterName?: string;
    caption?: string;
    prompt?: string;
  };
  try {
    const result = await revampPublishCaption(body);
    return NextResponse.json(result);
  } catch (err) {
    const status = err instanceof SpendCapError ? 402 : 400;
    const message = err instanceof Error ? err.message : "Could not revamp the caption.";
    return NextResponse.json({ error: message }, { status });
  }
}
