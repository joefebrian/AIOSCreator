import { NextResponse } from "next/server";
import { listApiProviders } from "@/lib/api-providers";
import { llmConfig } from "@/lib/llm";
import { listEngines, selectEngine, selectedEngines } from "@/lib/engines";
import { listModelMap } from "@/lib/model-routes";
import { maskKey } from "@/lib/providers";

export const runtime = "nodejs";

function llmActive() {
  try {
    const cfg = llmConfig();
    return { name: cfg.name, model: cfg.model, baseURL: cfg.baseURL, source: cfg.source, keyHint: maskKey(cfg.apiKey) };
  } catch {
    return null;
  }
}

export async function GET() {
  return NextResponse.json({
    engines: listEngines(),
    selected: selectedEngines(),
    llm: llmActive(),
    providers: listApiProviders(),
    map: listModelMap().filter((row) => row.routes.some((r) => r.id !== "comfy")),
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    kind?: "image" | "motion";
    id?: string;
    via?: "auto" | "comet" | "openai" | "byteplus" | "kling" | "wavespeed" | "hensun" | "fal" | "comfy";
  };
  try {
    if (body.kind !== "image" && body.kind !== "motion") throw new Error("kind must be image or motion");
    if (!body.id) throw new Error("id required");
    const selected = selectEngine(body.kind, body.id, body.via);
    return NextResponse.json({ ok: true, engines: listEngines(), selected, llm: llmActive() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
