import { NextResponse } from "next/server";
import { listInspiration, toggleInspirationShared } from "@/lib/inspiration";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ items: listInspiration() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    url?: string;
    kind?: "image" | "video";
    label?: string;
  };
  const url = (body.url || "").trim();
  if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });
  const kind = body.kind === "video" ? "video" : "image";
  const items = toggleInspirationShared({ url, kind, label: body.label });
  return NextResponse.json({ items });
}
