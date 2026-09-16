import { randomUUID } from "node:crypto";
import { llmClient, llmConfig, llmModel } from "./llm";
import { assertSpendAllowed } from "./spend-cap";
import type { DramaEntities, DramaShot, ShotSize } from "./drama";

const SIZES = new Set<ShotSize>(["ECU", "CU", "MCU", "MS", "WS"]);

function sizeOf(v: unknown): ShotSize {
  const s = String(v || "").toUpperCase() as ShotSize;
  return SIZES.has(s) ? s : "MCU";
}

export async function breakdownDrama(
  script: string,
  characterName?: string,
): Promise<{ title: string; logline: string; entities: DramaEntities; shots: DramaShot[] }> {
  const model = llmModel();
  if (!/127\.0\.0\.1:1234|localhost:1234|11434/.test(llmConfig().baseURL)) {
    assertSpendAllowed({ model, tokens: 10_000 });
  }
  const lead = characterName || "the locked lead";
  const client = llmClient();
  const completion = await client.chat.completions.create({
    model,
    temperature: 0.4,
    messages: [
      {
        role: "system",
        content: `You are the storyboard breaker + extractor for CreatorOS ShortDrama (Jellyfish-style board, Huobao-style episode rail).
Return ONLY JSON:
{
  "title":"",
  "logline":"one sentence",
  "entities":{"characters":[],"scenes":[],"props":[],"costumes":[]},
  "shots":[{
    "title":"",
    "summary":"what happens",
    "dialogue":"",
    "durationSec":5,
    "framing":"CU|MCU|MS|WS",
    "camera":"locked-off|slow push-in|tiny pan",
    "emotion":"",
    "location":"",
    "wardrobe":"",
    "cast":["${lead}"],
    "imagePrompt":"photoreal still, 9:16, unretouched skin, pores, no glass skin",
    "videoPrompt":"motion-only: camera + small performance for this duration. Same wardrobe as the still. No new identity."
  }]
}
Rules:
- 4 to 10 shots. durationSec 4–8 integer. Total 20–45s.
- Vary framing across the episode (not all MCU).
- Keep ${lead} identity locked in every imagePrompt.
- Continuity: same location name when the scene does not cut geography. Same wardrobe unless the beat changes clothes.
- imagePrompt = one still, one beat, one location.
- videoPrompt = performance + camera only. No restyle.
- Adult fictional OK. No minors.
- Dedup entity names (short, reusable).`,
      },
      { role: "user", content: script.slice(0, 12_000) },
    ],
  });
  const raw = (completion.choices[0]?.message?.content || "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const parsed = JSON.parse(raw) as {
    title?: string;
    logline?: string;
    entities?: Partial<DramaEntities>;
    shots?: Record<string, unknown>[];
  };
  const shots: DramaShot[] = (parsed.shots || []).slice(0, 10).map((s, i) => {
    const durationSec = Math.min(8, Math.max(4, Math.round(Number(s.durationSec) || 5)));
    return {
      id: randomUUID(),
      index: i,
      title: String(s.title || `Shot ${i + 1}`),
      summary: String(s.summary || ""),
      dialogue: String(s.dialogue || ""),
      durationSec,
      imagePrompt: String(s.imagePrompt || ""),
      videoPrompt: String(s.videoPrompt || ""),
      framing: sizeOf(s.framing),
      camera: String(s.camera || "locked-off"),
      emotion: String(s.emotion || ""),
      location: String(s.location || ""),
      wardrobe: String(s.wardrobe || ""),
      cast: Array.isArray(s.cast) ? s.cast.map(String) : lead ? [lead] : [],
    };
  });
  if (!shots.length) throw new Error("Breakdown returned no shots");
  const ent = parsed.entities || {};
  return {
    title: String(parsed.title || "Short drama"),
    logline: String(parsed.logline || ""),
    entities: {
      characters: Array.isArray(ent.characters) ? ent.characters.map(String) : [],
      scenes: Array.isArray(ent.scenes) ? ent.scenes.map(String) : [],
      props: Array.isArray(ent.props) ? ent.props.map(String) : [],
      costumes: Array.isArray(ent.costumes) ? ent.costumes.map(String) : [],
    },
    shots,
  };
}
