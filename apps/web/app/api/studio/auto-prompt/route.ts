import { NextResponse } from "next/server";
import { llmClient, llmConfig, llmModel } from "@/lib/llm";
import { SpendCapError } from "@/lib/spend-cap";
import { assertSpendAllowed } from "@/lib/spend-cap";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    kind?: "image" | "video";
    character?: string;
    product?: string;
    scene?: string;
  };
  const kind = body.kind === "video" ? "video" : "image";
  const character = (body.character || "the locked character").trim();
  const product = (body.product || "").trim();
  const scene = (body.scene || "neutral studio").trim();
  try {
    if (!/127\.0\.0\.1:1234|localhost:1234/.test(llmConfig().baseURL)) {
      assertSpendAllowed({ model: llmModel(), tokens: 2_000 });
    }
    const client = llmClient();
    const completion = await client.chat.completions.create({
      model: llmModel(),
      temperature: 0.5,
      messages: [
        {
          role: "system",
          content:
            kind === "image"
              ? `Write ONE photoreal 9:16 fashion-editorial still prompt. Return plain text only.
Lead: ${character}. Product: ${product || "none"}. Scene: ${scene}.
Rules: unretouched skin (pores, no glass skin), product readable if present, knees-up or 3/4, closed-mouth, one person. No watermark.`
              : `Write a motion-only I2V prompt for a 5–8s 9:16 clip. Return plain text only.
Lead: ${character}. Product: ${product || "none"}. Scene: ${scene}.
CAMERA: locked-off static, product stays in frame.
PERFORMANCE beats:
0-2s …
2-4s …
4-6s …
Small editorial motion (breath, glance, hand on garment). No walking off, no identity change.`,
        },
        { role: "user", content: "Write the prompt." },
      ],
    });
    const prompt = (completion.choices[0]?.message?.content || "").replace(/^```[\w]*\s*/i, "").replace(/```$/i, "").trim();
    if (prompt.length < 20) throw new Error("auto-prompt empty");
    return NextResponse.json({ prompt });
  } catch (err) {
    const fallback =
      kind === "video"
        ? `CAMERA: locked-off static, 9:16. Same person as the still. 0-2s small inhale, engage camera. 2-4s half-step or head tilt, product readable. 4-6s settle. No new identity.`
        : `Unretouched photoreal 9:16 of ${character}${product ? ` wearing/holding ${product}` : ""} in ${scene}. Pores, no glass skin, closed mouth, one person.`;
    if (err instanceof SpendCapError) return NextResponse.json({ error: err.message, prompt: fallback }, { status: 402 });
    return NextResponse.json({ prompt: fallback });
  }
}
