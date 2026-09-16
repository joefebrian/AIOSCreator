import { NextResponse } from "next/server";
import { llmConfig } from "@/lib/llm";
import { PRESETS, activateProvider, addProvider, clearRevamp, deactivateProvider, deleteProvider, listProviders, maskKey, saveRevamp, setRevampMode, revampStatus, type RevampMode } from "@/lib/providers";

export const runtime = "nodejs";

function envFallback() {
  try {
    const cfg = llmConfig();
    return { source: cfg.source, name: cfg.name, baseURL: cfg.baseURL, model: cfg.model, keyHint: maskKey(cfg.apiKey) };
  } catch {
    return null;
  }
}

export async function GET() {
  return NextResponse.json({ presets: PRESETS, ...listProviders(), active: envFallback(), revamp: revampStatus() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: "add" | "activate" | "deactivate" | "delete" | "revamp" | "revamp-clear" | "revamp-mode";
    mode?: RevampMode;
    id?: string;
    preset?: string;
    name?: string;
    baseURL?: string;
    model?: string;
    apiKey?: string;
  };
  try {
    if (body.action === "activate" && body.id) {
      activateProvider(body.id);
      return NextResponse.json({ ok: true, ...listProviders(), revamp: revampStatus() });
    }
    if (body.action === "deactivate") {
      deactivateProvider();
      return NextResponse.json({ ok: true, ...listProviders(), revamp: revampStatus() });
    }
    if (body.action === "delete" && body.id) {
      deleteProvider(body.id);
      return NextResponse.json({ ok: true, ...listProviders(), revamp: revampStatus() });
    }
    if (body.action === "revamp-clear") {
      clearRevamp();
      return NextResponse.json({ ok: true, ...listProviders(), revamp: revampStatus() });
    }
    if (body.action === "revamp-mode" && body.mode) {
      setRevampMode(body.mode);
      return NextResponse.json({ ok: true, ...listProviders(), revamp: revampStatus() });
    }
    if (body.action === "revamp") {
      saveRevamp({
        apiKey: body.apiKey || "",
        name: body.name,
        baseURL: body.baseURL,
        model: body.model,
      });
      return NextResponse.json({ ok: true, ...listProviders(), revamp: revampStatus() });
    }
    const preset = PRESETS.find((p) => p.id === body.preset);
    const id = addProvider({
      name: body.name || preset?.name || "LLM",
      baseURL: body.baseURL || preset?.baseURL || "",
      model: body.model || preset?.model || "",
      apiKey: body.apiKey || "",
      headers: preset?.headers,
      activate: true,
    });
    return NextResponse.json({ ok: true, id, ...listProviders() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
