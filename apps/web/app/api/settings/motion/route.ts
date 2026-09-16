import { NextResponse } from "next/server";
import { listEngines, selectEngine } from "@/lib/engines";
import {
  addMotionProvider,
  deleteMotionProvider,
  listMotionProviders,
  type MotionEngineId,
} from "@/lib/motion-providers";

export const runtime = "nodejs";

const ENGINES: MotionEngineId[] = ["kling-2-6", "kling-3-0", "dreamactor-v2", "wan-3-0"];

export async function GET() {
  return NextResponse.json(listMotionProviders());
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: "add" | "delete";
    id?: string;
    engineId?: string;
    name?: string;
    baseURL?: string;
    model?: string;
    apiKey?: string;
  };
  try {
    if (body.action === "delete" && body.id) {
      deleteMotionProvider(body.id);
      return NextResponse.json({ ok: true, ...listMotionProviders() });
    }
    const engineId = body.engineId as MotionEngineId;
    if (!ENGINES.includes(engineId)) throw new Error("engineId must be kling-2-6, kling-3-0, or dreamactor-v2 (Wan 3.0 lives in AI Studio)");
    addMotionProvider({
      engineId,
      name: body.name,
      baseURL: body.baseURL,
      model: body.model,
      apiKey: body.apiKey || "",
    });
    try {
      selectEngine("motion", engineId);
    } catch {
      /* picker stays on local if select fails */
    }
    return NextResponse.json({
      ok: true,
      ...listMotionProviders(),
      engines: listEngines(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
