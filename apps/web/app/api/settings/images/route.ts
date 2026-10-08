import { NextResponse } from "next/server";
import { listEngines, selectEngine } from "@/lib/engines";
import {
  addImageProvider,
  deleteImageProvider,
  listImageProviders,
  type ImageEngineId,
} from "@/lib/image-providers";

export const runtime = "nodejs";

const ENGINES: ImageEngineId[] = [
  "gpt-image-2.5",
  "gpt-image-2.5-flare",
  "gpt-image-2",
  "seedream-5-pro",
  "seedream-5-lite",
  "seedream-4-5",
  "muse-image-1.0",
  "qwen-image-3.0",
  "nano-banana",
  "grok-imagine",
  "grok-imagine-tryon",
  "kling-image-omni",
  "kolors-virtual-try-on",
  "marketing-studio-image",
];

export async function GET() {
  return NextResponse.json(listImageProviders());
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
      deleteImageProvider(body.id);
      return NextResponse.json({ ok: true, ...listImageProviders() });
    }
    const engineId = body.engineId as ImageEngineId;
    if (!ENGINES.includes(engineId)) throw new Error("unknown image engine");
    addImageProvider({
      engineId,
      name: body.name,
      baseURL: body.baseURL,
      model: body.model,
      apiKey: body.apiKey || "",
    });
    try {
      selectEngine("image", engineId);
    } catch {
      // picker stays on Klein if select fails
    }
    return NextResponse.json({
      ok: true,
      ...listImageProviders(),
      engines: listEngines(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
