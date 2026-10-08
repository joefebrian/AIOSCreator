import { randomUUID } from "node:crypto";
import { after, NextResponse } from "next/server";
import { getCharacter } from "@/lib/characters";
import { pickPaidI2v, runReplicateTiktok } from "@/lib/replicate-tiktok";
import { resolveRoute } from "@/lib/model-routes";
import { insertJob, updateJob } from "@/lib/store";


export const runtime = "nodejs";
export const maxDuration = 1800;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const row = getCharacter(id);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!row.identityUrl) return NextResponse.json({ error: "Lock identity first." }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as {
    url?: string;
    engineId?: string;
    draftOnly?: boolean;
    variation?: string;
  };
  const url = (body.url || "").trim();
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "Paste a TikTok / video http(s) URL." }, { status: 400 });
  }
  let engineId: string;
  try {
    engineId = pickPaidI2v(body.engineId);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
  const now = new Date().toISOString();
  const route = resolveRoute(engineId, "auto");
  const job = insertJob({
    id: randomUUID(),
    module: "production",
    kind: "motion",
    input: url,
    status: "running",
    model: engineId,
    provider: route?.provider || "unknown",
    characterId: id,
    progress: "Queued replicate…",
    createdAt: now,
    updatedAt: now,
  });
  const jobId = job.id;
  after(async () => {
    try {
      await runReplicateTiktok({
        characterId: id,
        sourceUrl: url,
        engineId,
        draftOnly: Boolean(body.draftOnly),
        variation: body.variation,
        jobId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      updateJob(jobId, { status: "failed", error: message, progress: "" });
    }
  });
  return NextResponse.json({ ...job, pending: true }, { status: 202 });
}
