import fs from "node:fs";
import { NextResponse } from "next/server";
import { deleteJob, getJob } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(job);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (job.mediaPath && fs.existsSync(job.mediaPath)) {
    try {
      fs.unlinkSync(job.mediaPath);
    } catch {
      /* ignore */
    }
  }
  deleteJob(id);
  return NextResponse.json({ ok: true, id });
}
