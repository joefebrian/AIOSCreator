import fs from "node:fs";
import { NextResponse } from "next/server";
import { mergePresetOverlay, tidyLearnedPreset, type LearnedOption } from "@/lib/prompt-presets";
import { mediaUrlToPath, promptPresetsFile } from "@/lib/paths";

export const runtime = "nodejs";

function livePreview(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    return fs.existsSync(mediaUrlToPath(url)) ? url : undefined;
  } catch {
    return undefined;
  }
}

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
  const overlay = readOverlay()
    .map((o) => tidyLearnedPreset({ ...o, preview: livePreview(o.preview) || o.preview }))
    .filter((o): o is LearnedOption => Boolean(o))
    .map((o) => ({ ...o, preview: livePreview(o.preview) }));
  const categories = mergePresetOverlay(overlay).map((cat) => ({
    ...cat,
    options: cat.options.map((opt) => ({ ...opt, preview: livePreview(opt.preview) })),
  }));
  return NextResponse.json({ categories, learned: overlay.length });
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
    const item = tidyLearnedPreset({ ...o, learned: true });
    if (!item) continue;
    const k = `${item.categoryId}:${item.id}`;
    const l = `${item.categoryId}:${item.label.toLowerCase()}`;
    if (seen.has(k) || labels.has(l)) continue;
    seen.add(k);
    labels.add(l);
    next.push(item);
  }
  fs.writeFileSync(promptPresetsFile(), JSON.stringify({ options: next, updatedAt: new Date().toISOString() }, null, 2));
  return NextResponse.json({ ok: true, learned: next.length, added: next.length - prev.length });
}
