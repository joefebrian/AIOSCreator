import { NextResponse } from "next/server";
import {
  deleteStudioWorkflow,
  getStudioWorkflow,
  listStudioWorkflows,
  saveStudioWorkflow,
} from "@/lib/studio-workflows";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const row = getStudioWorkflow(id);
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(row);
  }
  return NextResponse.json({ workflows: listStudioWorkflows() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    name?: string;
    nodes?: unknown[];
    edges?: unknown[];
  };
  if (!Array.isArray(body.nodes) || !Array.isArray(body.edges)) {
    return NextResponse.json({ error: "nodes and edges required" }, { status: 400 });
  }
  const row = saveStudioWorkflow({
    id: body.id,
    name: body.name || "Untitled workflow",
    nodes: body.nodes,
    edges: body.edges,
  });
  return NextResponse.json(row);
}

export async function DELETE(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { id?: string };
  if (!body.id || !deleteStudioWorkflow(body.id)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
