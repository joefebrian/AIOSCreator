import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { NextResponse } from "next/server";
import { getCharacter } from "@/lib/characters";
import { composeIdentitySheet } from "@/lib/character-sheet";
import { characterFile, characterSlotFile, characterSlotUrl, mediaUrlToPath } from "@/lib/paths";
import { insertJob, updateJob, type Job } from "@/lib/store";

export const runtime = "nodejs";

function plateUrl(characterId: string, key: "headshot" | "front") {
  const row = getCharacter(characterId);
  if (!row) return "";
  if (key === "headshot") return row.slots.find((s) => s.key === "headshot")?.url || row.identityUrl || "";
  return row.slots.find((s) => s.key === "front")?.url || row.slots.find((s) => s.key === "body")?.url || "";
}

export async function POST(req: Request) {
  const ctype = req.headers.get("content-type") || "";
  try {
    if (ctype.includes("multipart/form-data")) {
      const id = randomUUID();
      const dest = characterFile(id, "png");
      const now = new Date().toISOString();
      const job: Job = {
        id,
        module: "production",
        kind: "character",
        input: "lock",
        status: "running",
        createdAt: now,
        updatedAt: now,
        model: "lock",
      };
      insertJob(job);
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw new Error("file required");
      fs.writeFileSync(dest, Buffer.from(await file.arrayBuffer()));
      const done = updateJob(id, {
        status: "completed",
        mediaPath: dest,
        mediaUrl: `/api/media/characters/${id}.png`,
      });
      return NextResponse.json(done);
    }

    const body = (await req.json().catch(() => ({}))) as {
      imageUrl?: string;
      characterId?: string;
      sheet?: boolean;
    };

    if (body.characterId && body.sheet) {
      const row = getCharacter(body.characterId);
      if (!row) throw new Error("character not found");
      const head = plateUrl(row.id, "headshot");
      const bodyPlate = plateUrl(row.id, "front");
      const headPath = head ? mediaUrlToPath(head) : "";
      const bodyPath = bodyPlate ? mediaUrlToPath(bodyPlate) : "";
      if (!headPath || !fs.existsSync(headPath) || !bodyPath || !fs.existsSync(bodyPath)) {
        throw new Error("need headshot and full body — run Complete set first");
      }
      const dest = characterSlotFile(row.id, "studio-sheet", "png");
      await composeIdentitySheet(headPath, bodyPath, dest);
      return NextResponse.json({
        ok: true,
        mediaUrl: characterSlotUrl(row.id, "studio-sheet", "png"),
        characterId: row.id,
        name: row.name,
        lockMode: "sheet",
      });
    }

    const id = randomUUID();
    const dest = characterFile(id, "png");
    const now = new Date().toISOString();
    const job: Job = {
      id,
      module: "production",
      kind: "character",
      input: "lock",
      status: "running",
      createdAt: now,
      updatedAt: now,
      model: "lock",
    };
    insertJob(job);
    const src = body.imageUrl ? mediaUrlToPath(body.imageUrl) : "";
    if (!src || !fs.existsSync(src)) throw new Error("imageUrl not on disk");
    fs.copyFileSync(src, dest);
    const done = updateJob(id, {
      status: "completed",
      mediaPath: dest,
      mediaUrl: `/api/media/characters/${id}.png`,
    });
    return NextResponse.json(done);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
