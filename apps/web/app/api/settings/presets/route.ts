import fs from "node:fs";
import { NextResponse } from "next/server";
import { mergePresetOverlay, PRESET_CATEGORIES, type LearnedOption } from "@/lib/prompt-presets";
import { promptPresetsFile } from "@/lib/paths";

export const runtime = "nodejs";

function readOverlay(): LearnedOption[] {
  const f = promptPresetsFile();
  if (!fs.existsSync(f)) return [];
  try {
    const j = JSON.parse(fs.readFileSync(f, "utf8")) as { options?: LearnedOption[] };
    return Array.isArray(j.options) ? j.options : [];
  } catch {
    return [];
  }
}

export async function GET() {
  const overlay = readOverlay();
  return NextResponse.json({ categories: mergePresetOverlay(overlay), learned: overlay.length });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { options?: LearnedOption[] };
  const incoming = Array.isArray(body.options) ? body.options : [];
  if (!incoming.length) return NextResponse.json({ error: "options required" }, { status: 400 });
  const prev = readOverlay();
  const seen = new Set(prev.map((o) => `${o.categoryId}:${o.id}`));
  const labels = new Set(prev.map((o) => `${o.categoryId}:${o.label.toLowerCase()}`));
  const next = [...prev];
  for (const o of incoming) {
    if (!o.categoryId || !o.id || !o.label || !o.prompt) continue;
    const k = `${o.categoryId}:${o.id}`;
    const l = `${o.categoryId}:${o.label.toLowerCase()}`;
    if (seen.has(k) || labels.has(l)) continue;
    seen.add(k);
    labels.add(l);
    next.push({ ...o, learned: true });
  }
  fs.writeFileSync(promptPresetsFile(), JSON.stringify({ options: next, updatedAt: new Date().toISOString() }, null, 2));
  return NextResponse.json({ ok: true, learned: next.length, added: next.length - prev.length });
}
