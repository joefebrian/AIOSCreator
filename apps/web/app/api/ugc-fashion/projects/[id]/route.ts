import { NextResponse } from "next/server";
import { getFashionProject, patchFashionProject, slotConflicts, type FashionProject } from "@/lib/ugc-fashion";

export const runtime = "nodejs";

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const project = getFashionProject(id);
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ...project, conflicts: slotConflicts(project.items) });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const cur = getFashionProject(id);
  if (!cur) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as Partial<FashionProject> & { expectedRevision?: number };
  const result = patchFashionProject(id, body);
  if ("error" in result && result.error) return NextResponse.json(result, { status: result.status || 400 });
  return NextResponse.json({ ...result.project, conflicts: result.conflicts });
}
