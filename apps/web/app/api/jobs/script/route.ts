import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { generateScript, llmModel } from "@/lib/llm";
import { getProduct } from "@/lib/products";
import { insertJob, saveScriptMarkdown, updateJob, type Job } from "@/lib/store";

export const runtime = "nodejs";

function toMarkdown(input: string, pack: Awaited<ReturnType<typeof generateScript>>) {
  return `# ${pack.title}

Input: ${input}

## Hook
${pack.hook}

## Voiceover
${pack.voiceover}

## Scenes
${pack.scenes.map((s, i) => `${i + 1}. ${s}`).join("\n")}

## CTA
${pack.cta}

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
  };
  const product = body.productId ? getProduct(body.productId) : undefined;
  const angle = (body.angle || "").trim();
  const input =
    (body.input ?? "").trim() ||
    (product
      ? `${angle ? `Angle: ${angle}\n` : ""}${product.title}\n${product.affiliateUrl || product.sourceUrl}\n${product.features.slice(0, 6).join("; ")}`
      : "");
  if (!input) {
    return NextResponse.json({ error: "input required (topic or product URL)" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const job: Job = {
    id: randomUUID(),
    module: "content",
    kind: "script",
    input,
    status: "running",
    createdAt: now,
    updatedAt: now,
    model: llmModel(),
    productId: product?.id,
    characterId: body.characterId?.trim() || undefined,
  };
  insertJob(job);

  try {
    const pack = await generateScript(input);
    const scriptPath = saveScriptMarkdown(job.id, toMarkdown(input, pack));
    const done = updateJob(job.id, {
      status: "completed",
      script: pack,
      scriptPath,
      model: llmModel(),
    });
    return NextResponse.json(done);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failed = updateJob(job.id, { status: "failed", error: message });
    return NextResponse.json(failed, { status: 502 });
  }
}
