import { NextResponse } from "next/server";
import { getCharacter, listCharactersLite } from "@/lib/characters";
import { createDrama, deleteDrama, getDrama, listDramas, patchDrama, patchShot } from "@/lib/drama";
import { breakdownDrama } from "@/lib/drama-llm";
import { stitchDrama } from "@/lib/drama-stitch";
import { SpendCapError } from "@/lib/spend-cap";
import { generateStill } from "@/lib/stills";
import { mediaUrlToPath } from "@/lib/paths";
import fs from "node:fs";
import path from "node:path";
import { dramaMediaDir } from "@/lib/paths";
import { imageEngine } from "@/lib/engines";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  return NextResponse.json({ dramas: listDramas(), characters: listCharactersLite() });
}

export async function DELETE(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { id?: string };
  if (!body.id || !deleteDrama(body.id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    id?: string;
    shotId?: string;
    title?: string;
    script?: string;
    characterId?: string;
    stillUrl?: string;
    videoUrl?: string;
    stillJobId?: string;
    videoJobId?: string;
    stage?: string;
    shot?: Record<string, unknown>;
  };
  try {
    if (body.action === "create") {
      const script = (body.script || "").trim();
      if (!script) return NextResponse.json({ error: "paste a script or logline" }, { status: 400 });
      const char = body.characterId ? getCharacter(body.characterId) : undefined;
      const row = createDrama({
        title: body.title || "",
        script,
        characterId: char?.id,
        characterName: char?.name,
      });
      const broken = await breakdownDrama(script, char?.name);
      const next = patchDrama(row.id, {
        title: body.title?.trim() || broken.title,
        logline: broken.logline,
        entities: broken.entities,
        shots: broken.shots,
        stage: "board",
      });
      return NextResponse.json(next);
    }

    if (body.action === "stage") {
      const next = patchDrama(String(body.id || ""), { stage: body.stage as never });
      if (!next) return NextResponse.json({ error: "not found" }, { status: 404 });
      return NextResponse.json(next);
    }

    if (body.action === "save-shot") {
      const next = patchShot(String(body.id || ""), String(body.shotId || ""), (body.shot || {}) as never);
      if (!next) return NextResponse.json({ error: "not found" }, { status: 404 });
      return NextResponse.json(next);
    }

    if (body.action === "still") {
      const drama = getDrama(String(body.id || ""));
      const shot = drama?.shots.find((s) => s.id === body.shotId);
      if (!drama || !shot) return NextResponse.json({ error: "shot not found" }, { status: 404 });
      const char = drama.characterId ? getCharacter(drama.characterId) : undefined;
      const identity = char?.identityUrl ? mediaUrlToPath(char.identityUrl) : undefined;
      const prompt = [
        char ? `Same person as @${char.name}. Keep her exact face, hair, and identity.` : "",
        shot.framing ? `${shot.framing} framing.` : "",
        shot.location ? `Location: ${shot.location}.` : "",
        shot.wardrobe ? `Wardrobe: ${shot.wardrobe}.` : "",
        shot.emotion ? `Expression: ${shot.emotion}.` : "",
        shot.imagePrompt,
        "Unretouched photoreal photograph, 9:16 vertical, one person. Pores on nose and cheeks, no glass skin, no Facetune.",
      ]
        .filter(Boolean)
        .join(" ");
      const engine = imageEngine().id;
      const { buffer } = await generateStill(prompt, identity ? { face: identity } : undefined, engine);
      const dir = dramaMediaDir(drama.id);
      fs.mkdirSync(dir, { recursive: true });
      const dest = path.join(dir, `${shot.id}.png`);
      fs.writeFileSync(dest, buffer);
      const stillUrl = `/api/media/drama/${drama.id}/${shot.id}.png`;
      return NextResponse.json(patchShot(drama.id, shot.id, { stillUrl }));
    }

    if (body.action === "link") {
      const next = patchShot(String(body.id || ""), String(body.shotId || ""), {
        stillUrl: body.stillUrl,
        videoUrl: body.videoUrl,
        stillJobId: body.stillJobId,
        videoJobId: body.videoJobId,
      });
      if (!next) return NextResponse.json({ error: "not found" }, { status: 404 });
      return NextResponse.json(next);
    }

    if (body.action === "stitch") {
      const drama = getDrama(String(body.id || ""));
      if (!drama) return NextResponse.json({ error: "not found" }, { status: 404 });
      const urls = drama.shots.map((s) => s.videoUrl).filter(Boolean) as string[];
      if (urls.length < 2) return NextResponse.json({ error: "need at least two shot videos" }, { status: 400 });
      const episodeUrl = await stitchDrama(drama.id, urls);
      return NextResponse.json(patchDrama(drama.id, { episodeUrl }));
    }

    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = err instanceof SpendCapError ? 402 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
