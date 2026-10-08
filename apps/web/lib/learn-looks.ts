import fs from "node:fs";
import { openRouterTidyClient, openRouterTidyConfig } from "./llm";
import { promptPresetsFile } from "./paths";
import {
  canonicalPresetCategory,
  derivePresetLabel,
  inferPresetCategory,
  isJunkPresetLabel,
  kerangkaBlockPresets,
  tidyLearnedPreset,
  type LearnedOption,
  type PresetCatId,
} from "./prompt-presets";

const CATS = ["subject", "pose", "outfit", "hair", "light", "texture", "film", "background", "adult"] as const;

async function classifyLook(prompt: string): Promise<{ categoryId: PresetCatId; label: string }> {
  try {
    const client = openRouterTidyClient();
    const completion = await client.chat.completions.create({
      model: openRouterTidyConfig().model,
      temperature: 0.2,
      max_tokens: 80,
      messages: [
        {
          role: "system",
          content: `Classify a character still recipe. Return JSON only:
{"category":"subject|pose|outfit|hair|light|texture|film|background|adult","label":"3 to 6 Title Case words"}
Rules: pick ONE category. subject = headshot, 3/4, or full-body crop. pose = body and expression. outfit = clothes, shoes, bag, jewelry. hair = styling, makeup, nails. light = light direction only. texture = color and material. film = lens and camera angle. background = place and set pieces. adult = lingerie/nude/explicit. No character names. No quotes.`,
        },
        { role: "user", content: prompt.slice(0, 2500) },
      ],
    });
    const text = completion.choices[0]?.message?.content?.trim() || "";
    const json = text.match(/\{[\s\S]*\}/)?.[0];
    const parsed = json ? (JSON.parse(json) as { category?: string; label?: string }) : {};
    let categoryId =
      canonicalPresetCategory(parsed.category || "") ||
      (CATS.includes(parsed.category as PresetCatId) ? (parsed.category as PresetCatId) : inferPresetCategory(prompt));
    const rawLabel = (parsed.label || "")
      .replace(/^["'`]+|["'`]+$/g, "")
      .replace(/[^a-zA-Z0-9 ,'-]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 48);
    const label = isJunkPresetLabel(rawLabel) || rawLabel.split(" ").length < 2 ? derivePresetLabel(prompt) : rawLabel;
    if (categoryId === "adult" && inferPresetCategory(prompt) !== "adult") {
      categoryId = inferPresetCategory(prompt);
    }
    return { categoryId, label };
  } catch {
    return { categoryId: inferPresetCategory(prompt), label: derivePresetLabel(prompt) };
  }
}

function readLearned(file: string): LearnedOption[] {
  if (!fs.existsSync(file)) return [];
  try {
    const j = JSON.parse(fs.readFileSync(file, "utf8")) as { options?: LearnedOption[] };
    return Array.isArray(j.options) ? j.options : [];
  } catch {
    return [];
  }
}

function sameLearnedPrompt(a: string, b: string) {
  const norm = (value: string) => value.toLowerCase().replace(/\s+/g, " ").slice(0, 280);
  return norm(a) === norm(b);
}

/** Persist a Generate-image recipe into an existing preset category. Server-only. A selected Shot is one bundle and is not split. */
export async function learnLookFromGenerate(opts: {
  id: string;
  prompt: string;
  negative?: string;
  preview?: string;
  shot?: boolean;
}) {
  if (opts.shot) return false;
  const prompt = (opts.prompt || "").trim();
  if (prompt.length < 48) return false;
  const f = promptPresetsFile();
  const prev = readLearned(f);
  const blocks = kerangkaBlockPresets(prompt);
  if (blocks) {
    const next = [...prev];
    let added = 0;
    for (const block of blocks) {
      if (next.some((row) => row.categoryId === block.categoryId && sameLearnedPrompt(row.prompt, block.prompt))) continue;
      const item = tidyLearnedPreset({
        categoryId: block.categoryId,
        id: `g-${opts.id.slice(0, 8)}-${block.categoryId}`,
        label: block.label,
        prompt: block.prompt,
        negative: block.categoryId === "adult" ? opts.negative || undefined : undefined,
        preview: opts.preview,
        learned: true,
        singleBlock: true,
      });
      if (!item) continue;
      next.push(item);
      added += 1;
    }
    if (!added) return false;
    fs.writeFileSync(f, JSON.stringify({ options: next, updatedAt: new Date().toISOString() }, null, 2));
    return true;
  }
  if (prev.some((row) => sameLearnedPrompt(row.prompt, prompt))) return false;
  const { categoryId, label } = await classifyLook(prompt);
  const item = tidyLearnedPreset({
    categoryId,
    id: `g-${opts.id.slice(0, 8)}`,
    label,
    prompt,
    negative: opts.negative || undefined,
    preview: opts.preview,
    learned: true,
  });
  if (!item) return false;
  fs.writeFileSync(f, JSON.stringify({ options: [...prev, item], updatedAt: new Date().toISOString() }, null, 2));
  return true;
}
