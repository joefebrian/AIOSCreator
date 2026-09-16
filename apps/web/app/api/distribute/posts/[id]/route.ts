import { NextResponse } from "next/server";
import { deletePublication, getPublication, updatePublication, type Approval } from "@/lib/publications";
import { publishNow } from "@/lib/social-publish";

export const runtime = "nodejs";
export const maxDuration = 600;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const row = getPublication(id);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; approval?: Approval };
  if (body.action === "approve") {
    const next = updatePublication(id, { approval: body.approval || "approved" });
    return NextResponse.json(next);
  }
  if (body.action === "publish") {
    if (row.approval !== "approved") {
      return NextResponse.json({ error: "approve first — PRD: no public post without approval" }, { status: 400 });
    }
    const next = await publishNow(row);
    return NextResponse.json(next);
  }
  if (body.action === "export") {
    const next = await publishNow({ ...row, mode: "export", approval: "approved" });
    return NextResponse.json(next);
  }
  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!deletePublication(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
