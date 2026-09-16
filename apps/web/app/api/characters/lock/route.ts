import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { NextResponse } from "next/server";
import { characterFile, mediaUrlToPath } from "@/lib/paths";
import { insertJob, updateJob, type Job } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(req: Request) {
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

  try {
    const ctype = req.headers.get("content-type") || "";
    if (ctype.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw new Error("file required");
      fs.writeFileSync(dest, Buffer.from(await file.arrayBuffer()));
    } else {
      const body = (await req.json().catch(() => ({}))) as { imageUrl?: string };
      const src = body.imageUrl ? mediaUrlToPath(body.imageUrl) : "";
      if (!src || !fs.existsSync(src)) throw new Error("imageUrl not on disk");
      fs.copyFileSync(src, dest);
    }
    const done = updateJob(id, {
      status: "completed",
      mediaPath: dest,
      mediaUrl: `/api/media/characters/${id}.png`,
    });
    return NextResponse.json(done);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failed = updateJob(id, { status: "failed", error: message });
    return NextResponse.json({ ...failed }, { status: 400 });
  }
}
