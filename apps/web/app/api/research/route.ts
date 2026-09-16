import { NextResponse } from "next/server";
import { deleteResearchExtract, listResearchExtracts } from "@/lib/research";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ extracts: listResearchExtracts() });
}

export async function DELETE(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { id?: string };
  const id = (body.id || "").trim();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (!deleteResearchExtract(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
