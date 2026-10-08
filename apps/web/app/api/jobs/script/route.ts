import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { jevScriptGate } from "@/lib/jev";
import { factoryScriptLlm, generateScript, generateScriptForProduct, llmModel, researchProduct } from "@/lib/llm";
import { productScriptBrief } from "@/lib/product-research";
import { factoryFormatLine } from "@/lib/ugc-script";
import { getProduct, patchProduct } from "@/lib/products";
import { insertJob, saveScriptMarkdown, updateJob, type Job } from "@/lib/store";

export const runtime = "nodejs";

function toMarkdown(input: string, pack: Awaited<ReturnType<typeof generateScript>>) {
  return `# ${pack.title}

Input: ${input}

## HOOK 0-2s
${pack.hook}
Visual: ${pack.hookVisual || pack.firstFrame || "—"}

## Beats
${(pack.beats || []).map((b) => `- ${b.t}: ${b.spoken}\n  Visual: ${b.visual}`).join("\n") || pack.scenes.map((s, i) => `${i + 1}. ${s}`).join("\n")}

## CTA
${pack.cta}
${pack.ctaVisual ? `Visual: ${pack.ctaVisual}` : ""}

## Voiceover (assembled, hook once)
${pack.voiceover}

## Format
${pack.format || "—"}

## Platforms
${pack.platforms.join(", ")}
`;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    input?: string;
    productId?: string;
    characterId?: string;
    angle?: string;
    source?: "studio" | "workspace" | "ugc-factory";
  };
  const product = body.productId ? getProduct(body.productId) : undefined;
  const angle = (body.angle || "").trim();
  const factory = body.source === "ugc-factory";
  if (factory && !product) {
    return NextResponse.json({ error: "Pick a SKU first. Write will not invent a product." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const job: Job = {
    id: randomUUID(),
    module: "content",
    kind: "script",
    input: "",
    status: "running",
    createdAt: now,
    updatedAt: now,
    model: llmModel(),
    productId: product?.id,
    characterId: body.characterId?.trim() || undefined,
    source: factory ? "ugc-factory" : body.source,
    progress: product ? "Researching SKU…" : undefined,
  };
  insertJob(job);

  try {
    let pack;
    let input = (body.input || "").trim();
    if (product) {
      const scriptLlm = factory ? factoryScriptLlm() : undefined;
      const research =
        factory || !product.research
          ? await (scriptLlm ? researchProduct(product, scriptLlm) : researchProduct(product))
          : product.research;
      if (!product.research || factory) {
        try {
          patchProduct(product.id, { research });
        } catch {
          /* research still used in-memory */
        }
      }
      const formatLine = [
        angle ? factoryFormatLine(angle) : "",
        body.characterId ? input : "",
      ]
        .filter(Boolean)
        .join(" ");
      input = productScriptBrief(product, research, formatLine || input);
      updateJob(job.id, { input, progress: "Writing from research…" });
      pack = scriptLlm
        ? await generateScriptForProduct(product, formatLine || input, research, scriptLlm)
        : await generateScriptForProduct(product, formatLine || input, research);
    } else {
      if (!input) {
        updateJob(job.id, { status: "failed", error: "input required (topic or product URL)" });
        return NextResponse.json({ error: "input required (topic or product URL)" }, { status: 400 });
      }
      updateJob(job.id, { input });
      pack = await generateScript(input);
    }

    const scriptPath = saveScriptMarkdown(job.id, toMarkdown(input, pack));
    let jev: Job["jev"];
    if (factory && product) {
      try {
        jev = await jevScriptGate({
          product: product.title,
          format: angle,
          hook: pack.hook,
          cta: pack.cta,
        });
      } catch {
        jev = undefined;
      }
    }
    const done = updateJob(job.id, {
      status: "completed",
      script: pack,
      scriptPath,
      model: llmModel(),
      input,
      jev,
      progress: undefined,
    });
    return NextResponse.json({ ...done, research: product ? getProduct(product.id)?.research : undefined });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failed = updateJob(job.id, { status: "failed", error: message, progress: undefined });
    return NextResponse.json(failed, { status: 502 });
  }
}
