import { NextResponse } from "next/server";
import { runEdit, runIdentity, runSlot, runUpscale, runVideoSet } from "@/lib/character-jobs";
import { deleteCharacter, deleteCharacterMedia, getCharacter, toggleInspiration, updateCharacter } from "@/lib/characters";
import { cleanMarkets } from "@/lib/markets";
import { isCloudImageEngine } from "@/lib/cloud-image";
import { imageEngine } from "@/lib/engines";
import { characterLook, revampOperatorPrompt } from "@/lib/look-lock";

export const runtime = "nodejs";
export const maxDuration = 600;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const op = new URL(req.url).searchParams.get("op") || "identity";
  if (op === "slot") return runSlot(req, id);
  if (op === "video-set") return runVideoSet(req, id);
  if (op === "upscale") return runUpscale(req, id);
  if (op === "edit") return runEdit(req, id);
  if (op === "delete-media") {
    const body = (await req.json().catch(() => ({}))) as { url?: string };
    const url = (body.url || "").trim();
    if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });
    const row = deleteCharacterMedia(id, url);
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(row);
  }
  if (op === "revamp-prompt") {
    const body = (await req.json().catch(() => ({}))) as { prompt?: string };
    const row = getCharacter(id);
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
    if (isCloudImageEngine(imageEngine().id)) {
      return NextResponse.json({
        prompt: body.prompt || "",
        warnings: ["Paid model — prompt sent as written, no revamp."],
        revamped: false,
      });
    }
    const out = await revampOperatorPrompt(body.prompt || "", characterLook(row));
    return NextResponse.json({ prompt: out.creative, warnings: out.warnings, revamped: out.revamped });
  }
  if (op === "inspiration") {
    const body = (await req.json().catch(() => ({}))) as {
      url?: string;
      kind?: "image" | "video";
      label?: string;
    };
    const url = (body.url || "").trim();
    if (!url) return NextResponse.json({ error: "url required" }, { status: 400 });
    const kind = body.kind === "video" ? "video" : "image";
    const row = toggleInspiration(id, { url, kind, label: body.label });
    if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(row);
  }
  return runIdentity(req, id);
}

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const row = getCharacter(id);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    sourcePrompt?: string;
    visibility?: "private" | "public";
    markets?: unknown;
  };
  const patch: { name?: string; sourcePrompt?: string; visibility?: "private" | "public"; markets?: ReturnType<typeof cleanMarkets> } = {};
  if (typeof body.name === "string") patch.name = body.name.trim() || "Untitled character";
  if (typeof body.sourcePrompt === "string") patch.sourcePrompt = body.sourcePrompt;
  if (body.visibility === "private" || body.visibility === "public") patch.visibility = body.visibility;
  if ("markets" in body) patch.markets = cleanMarkets(body.markets);
  const row = updateCharacter(id, patch);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!deleteCharacter(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
