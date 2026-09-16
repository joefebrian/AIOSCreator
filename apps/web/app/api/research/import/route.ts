import { NextResponse } from "next/server";
import { importResearchUrl } from "@/lib/research-import";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { url?: string; cookie?: string };
  const url = (body.url || "").trim();
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });
  try {
    const out = await importResearchUrl(url, body.cookie || "");
    return NextResponse.json(out);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
