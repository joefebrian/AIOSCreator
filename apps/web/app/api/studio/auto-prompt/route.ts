import { NextResponse } from "next/server";
import { studioImagePrompt, studioVideoPrompt } from "@/lib/character-prompts";
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
              ? `Write ONE photoreal 9:16 on-model still prompt. Return plain text only.
Lead: ${character}. Product: ${product || "none"}. Scene: ${scene}.
If a product is set, the character MUST wear that exact garment (same color, cut, fabric, logos). Do not invent a different outfit.
Rules: unretouched skin (pores, no glass skin), product fully visible, knees-up or 3/4, closed-mouth, one person. No watermark.`
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
        ? studioVideoPrompt({ character, product, scene, aspect: "9:16", durationSec: 6 })
        : studioImagePrompt({ character, product, place: scene }) ||
          `Unretouched photoreal 9:16 of ${character}${product ? ` wearing the exact ${product}` : ""} in ${scene}. Pores, no glass skin, closed mouth, one person.`;
    if (err instanceof SpendCapError) return NextResponse.json({ error: err.message, prompt: fallback }, { status: 402 });
    return NextResponse.json({ prompt: fallback });
  }
}
