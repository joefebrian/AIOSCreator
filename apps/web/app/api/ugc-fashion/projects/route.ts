import { NextResponse } from "next/server";
import { createFashionProject, FASHION_STAGES, listFashionProjects, projectNeedsAttention, searchableProject, type FashionStage } from "@/lib/ugc-fashion";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim().toLowerCase();
  const stage = url.searchParams.get("stage") || "";
  const sort = url.searchParams.get("sort") || "newest";
  const attention = url.searchParams.get("attention") === "1";
  const all = listFashionProjects();
  let rows = all.filter((p) => !q || searchableProject(p).includes(q));
  if (stage && FASHION_STAGES.includes(stage as FashionStage)) rows = rows.filter((p) => p.stage === stage);
  if (attention) rows = rows.filter((p) => projectNeedsAttention(p));
  if (sort === "oldest") rows = [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (sort === "updated") rows = [...rows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const counts = Object.fromEntries(FASHION_STAGES.map((s) => [s, all.filter((p) => p.stage === s).length]));
  return NextResponse.json({ projects: rows, counts, total: all.length, attention: all.filter((p) => projectNeedsAttention(p)).length });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { name?: string };
  return NextResponse.json(createFashionProject(body.name), { status: 201 });
}
