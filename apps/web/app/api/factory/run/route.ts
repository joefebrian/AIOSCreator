import { randomUUID } from "node:crypto";
import { after, NextResponse } from "next/server";
import { runFactoryBatch, runFactoryOne } from "@/lib/factory-run";
import { getProduct } from "@/lib/products";
import { insertJob, updateJob, type Job } from "@/lib/store";
import { FACTORY_FORMATS, type FactoryFormatId, type ScriptPack } from "@/lib/ugc-script";

export const runtime = "nodejs";
export const maxDuration = 1800;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    productId?: string;
    formatId?: string;
    engineId?: string;
    mode?: "one" | "batch12";
    pack?: ScriptPack;
  };
  const product = body.productId ? getProduct(body.productId) : undefined;
  if (!product) return NextResponse.json({ error: "Pick a SKU first." }, { status: 400 });
  const formatId = (FACTORY_FORMATS.some((f) => f.id === body.formatId) ? body.formatId : "pack-hero") as FactoryFormatId;
  const mode = body.mode === "batch12" ? "batch12" : "one";
  const now = new Date().toISOString();
  const job: Job = {
    id: randomUUID(),
    module: "production",
    kind: "factory",
    input: `${mode} ${formatId} ${product.title}`.slice(0, 2000),
    status: "queued",
    createdAt: now,
    updatedAt: now,
    model: mode === "batch12" ? "batch12" : body.engineId || "wan-3-0",
    provider: "factory",
    productId: product.id,
    source: "ugc-factory",
    progress: mode === "batch12" ? "Queued — batch 12…" : "Queued — Make…",
    script: body.pack,
  };
  insertJob(job);

  after(async () => {
    try {
      if (mode === "batch12") await runFactoryBatch({ product, formatId, jobId: job.id });
      else await runFactoryOne({ product, formatId, engineId: body.engineId, pack: body.pack, jobId: job.id });
    } catch (err) {
      updateJob(job.id, { status: "failed", error: err instanceof Error ? err.message : String(err), progress: undefined });
    }
  });

  return NextResponse.json(job, { status: 202 });
}
