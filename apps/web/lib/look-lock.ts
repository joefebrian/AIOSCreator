import type { Character, CharacterLook } from "./character-types";
export { isMinorLook } from "./character-types";
import { resolveRevampModel, revampLlmClient } from "./llm";

const EXPLICIT_HAIR_RESTYLE =
  /\b(restyle|change|cut|dye)\s+(her\s+|the\s+)?hair\b|\bgive her a (bob|pixie|buzz|undercut)\b|改发型|剪短发|换成短发|染发/i;

const INCIDENTAL_SHORT_HAIR =
  /chin-length|short bob|bob cut|pixie|buzz cut|undercut|short wavy bob|长度到下巴|短波波|短发|齐下巴|波波头/gi;

export function deriveLook(sourcePrompt?: string): CharacterLook {
  const src = sourcePrompt || "";
  const long =
    /long hair|long dark|tied up|loose bun|clipped|face-framing|past (the )?shoulder|waist-length/i.test(src) ||
    /长发|低丸子|盘发/.test(src);
  const ageHit = /\bage\s+(\d{1,2})\b/i.exec(src);
  const age = ageHit ? Number(ageHit[1]) : undefined;
  return {
    hair: long
      ? "long black or dark-brown hair; down, half-up, or a loose low bun with face-framing strands; never a short bob, pixie, or chin-length cut"
      : "same hair as the identity plate — length, color, and part",
    face: "same face as the identity plate: bone structure, eyes, nose, mouth, age, skin color and undertone",
    body: "same body as the identity plate: proportions, posture, chest, waist, hips, limbs, same skin color on face neck arms and legs",
    age: Number.isFinite(age) ? age : undefined,
  };
}

export function characterLook(row: Character): CharacterLook {
  return row.look || deriveLook(row.sourcePrompt);
}

export function lookLockBlock(name: string, look: CharacterLook, opts?: { explicit?: boolean }) {
  const minor = look.age != null && look.age < 18;
  const wardrobe = minor
    ? "Wardrobe is fully clothed and age-appropriate. SFW only."
    : opts?.explicit
      ? "Wardrobe is NOT locked. Clothes follow the operator. If they say nude / lingerie / a new outfit, do not copy clothing from the identity photo."
      : "Wardrobe is NOT locked. Clothes follow the operator prompt. Do not copy clothing from the identity photo.";
  return [
    `LOCKED LOOK for @${name} — these win if the operator prompt conflicts.`,
    `Hair: ${look.hair}.`,
    `Face: ${look.face}.`,
    `Skin: exact skin color and undertone from the identity plate — not paler, not porcelain, not a different ethnicity.`,
    `Body: ${look.body}.`,
    wardrobe,
    "Scene is NOT locked. Do not copy the kitchen, apartment, furniture, window, or background from the identity photo. New environment from the operator only.",
    "If the operator describes another person's haircut as part of a scene, ignore it. Keep this hair unless they explicitly ask to restyle hair.",
  ].join(" ");
}

export function operatorWantsUndress(prompt: string) {
  return /\b(nude|naked|bare[- ]skin|no clothes|no clothing|wearing no clothes|wearing nothing|without clothes|topless|undressed|uncensored|fully nude|completely nude|lingerie|micro[- ]bikini|body oil|bath towel|open robe)\b|\bsheer\s+(lingerie|robe|dress|fabric)\b/i.test(
    prompt,
  );
}

export const UNDRESS_INSTRUCTION =
  "WARDROBE: completely nude adult. No clothing of any kind. No tank top, no shirt, no shorts, no bra, no bikini, no underwear copied from the identity photo. Bare breasts with visible nipples and areolae, natural breast anatomy, uncensored, not covered, not blurred.";

export const UNDRESS_NEGATIVE =
  "clothes, clothing, shirt, tank top, camisole, romper, bodysuit, ribbed tank, crop top, sports bra, shorts, pants, jeans, bra, bikini, underwear, swimsuit, dress, towel, robe, lace, straps, censored, mosaic, pasties, nipple tape, covered nipples, featureless breasts, Barbie doll chest";

export function operatorSetsScene(prompt: string) {
  return operatorWantsUndress(prompt) ||
    /\b(studio|seamless|caf[eé]|hotel|apartment|loft|beach|park|rooftop|alley|subway|gym|kitchen|bathroom|balcony|neon|golden hour|overcast|outdoor|indoor|photography studio|new background|plain studio)\b/i.test(
      prompt,
    );
}

function isLlmRefusal(text: string) {
  return /user safety|safety categor|content.?filter|cannot (help|assist)|i'?m unable|refused|unsafe/i.test(text);
}

export function lookSkinNegative() {
  return "bleached skin, paler skin, porcelain skin, whitewashed, lighter complexion, different ethnicity, mismatched face and body skin, orange tan, gray skin";
}

export function lookHairNegative(look: CharacterLook) {
  if (!/long|bun|tied/i.test(look.hair)) return "";
  return "short bob, chin-length bob, pixie cut, buzz cut, undercut, 短波波头, 齐下巴短发";
}

const LOCK_PREFIX =
  /LOCKED LOOK for[\s\S]*?(?:restyle hair\.|unless they explicitly ask to restyle hair\.)/i;
const REF_FACE_PREFIX =
  /The reference image is @[\s\S]*?(?:Photoreal\.|from the identity photo\.)/i;

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    /* pasted JSON often invalid */
  }
  return null;
}

function asText(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v)) return v.map(asText).filter(Boolean).join(", ");
  if (v && typeof v === "object") return Object.values(v as Record<string, unknown>).map(asText).filter(Boolean).join(", ");
  return "";
}

function flattenSceneJson(j: Record<string, unknown>): string {
  const lines: string[] = [];
  const push = (label: string, v: unknown) => {
    const t = asText(v);
    if (t) lines.push(`${label}: ${t}`);
  };
  push("Pose", j.pose);
  push("Wardrobe", j.clothing);
  const acc = j.accessories;
  if (acc && typeof acc === "object") {
    const a = acc as Record<string, unknown>;
    push("Accessories", { headwear: a.headwear, jewelry: a.jewelry, device: a.device, prop: a.prop });
  }
  push("Camera", j.photography);
  push("Background", j.background);
  const vibe = j.the_vibe;
  if (vibe && typeof vibe === "object") {
    const v = vibe as Record<string, unknown>;
    push("Mood", { energy: v.energy, mood: v.mood, story: v.story, aesthetic: v.aesthetic });
  }
  const constraints = j.constraints;
  if (constraints && typeof constraints === "object") {
    push("Avoid", (constraints as Record<string, unknown>).avoid);
  }
  push("Avoid", j.negative_prompt);
  return lines.join("\n");
}

function identityRewriteHits(text: string) {
  return /\b(short bob|straight bangs|pixie|petite|porcelain|narrow jawline|glossy lips|soft glam|doll face|wide-eyed)\b/i.test(
    text,
  );
}

/** Drop copied lock text + JSON face/hair/body so sloppy pastes cannot override the plate. */
export function prepareOperatorPrompt(raw: string, look: CharacterLook): { creative: string; warnings: string[] } {
  const warnings: string[] = [];
  let text = (raw || "").replace(/\r\n/g, "\n").trim();
  text = text.replace(LOCK_PREFIX, "").replace(REF_FACE_PREFIX, "").trim();

  const json = extractJsonObject(text);
  if (json) {
    if (json.hair || json.face || json.body || json.subject) {
      warnings.push("JSON face/hair/body ignored. Identity plate stays locked.");
    }
    const keep = asText((json.constraints as Record<string, unknown> | undefined)?.must_keep);
    if (identityRewriteHits(keep) || identityRewriteHits(asText(json.hair))) {
      warnings.push("Hair/body rewrite in must_keep ignored unless you write “Restyle hair …”.");
    }
    const scene = flattenSceneJson(json);
    const before = text.slice(0, text.indexOf("{")).trim();
    text = [before, scene].filter(Boolean).join("\n");
    warnings.push("Long JSON flattened to pose, wardrobe, lighting, scene.");
  } else if (text.length > 420) {
    warnings.push("Long prompt — auto-revamp to pose / clothes / place / light.");
  }

  const sceneOnly = text.replace(/\nAvoid:\s*[\s\S]*$/i, "");
  if (!EXPLICIT_HAIR_RESTYLE.test(sceneOnly) && /long|bun|tied|identity plate/i.test(look.hair)) {
    if (INCIDENTAL_SHORT_HAIR.test(sceneOnly) || identityRewriteHits(sceneOnly)) {
      warnings.push("Incidental bob/bangs/petite stripped. Lock hair/body wins.");
    }
    const avoid = text.match(/\nAvoid:\s*[\s\S]*$/i)?.[0] || "";
    let scene = sceneOnly.replace(INCIDENTAL_SHORT_HAIR, "long dark hair as in the locked look");
    scene = scene.replace(/\b(petite|porcelain skin|narrow jawline|fair porcelain)\b/gi, "");
    text = `${scene.trim()}${avoid}`;
  }

  text = text.replace(/\n{3,}/g, "\n\n").trim();
  return { creative: text, warnings: [...new Set(warnings)] };
}

export function sanitizeAgainstLook(prompt: string, look: CharacterLook) {
  return prepareOperatorPrompt(prompt, look).creative;
}

function heuristicSceneLines(text: string): string {
  const sentences = text
    .split(/[\n.;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 12 && !/^avoid:/i.test(s) && !/^locked look/i.test(s));
  const take = (re: RegExp, label: string) => {
    const hit = sentences.find((s) => re.test(s));
    return hit ? `${label}: ${hit.slice(0, 180)}` : "";
  };
  const lines = [
    take(/\b(pose|lean|sit|stand|hold|look|gaze|selfie|turn)\b/i, "Pose"),
    take(/\b(wear|wearing|dress|lace|camisole|shirt|lingerie|outfit|nude)\b/i, "Clothes"),
    take(/\b(room|bedroom|couch|kitchen|studio|indoor|outdoor|wall|apartment)\b/i, "Place"),
    take(/\b(light|lighting|golden|window|flash|grain|night|daylight)\b/i, "Light"),
  ].filter(Boolean);
  if (lines.length >= 2) return lines.join("\n");
  return sentences.slice(0, 6).join("\n").slice(0, 700);
}

/** Compress sloppy/long operator text to 4–8 scene lines. Face/hair stay on the lock block. */
export async function revampOperatorPrompt(
  raw: string,
  look: CharacterLook,
): Promise<{ creative: string; warnings: string[]; revamped: boolean }> {
  const prepared = prepareOperatorPrompt(raw, look);
  const needs = prepared.creative.length > 420 || prepared.warnings.some((w) => /JSON|Long prompt/i.test(w));
  if (!needs) return { ...prepared, revamped: false };
  try {
    const client = revampLlmClient();
    const completion = await client.chat.completions.create({
      model: await resolveRevampModel(),
      temperature: 0.1,
      messages: [
        {
          role: "system",
          content: `Compress an image prompt to 4–8 short lines. Return ONLY those lines, no markdown.
Use labels:
Pose:
Clothes:
Place:
Light:
Optional: Camera: Accessories:
Drop face, hair, body, identity, lock text, JSON keys, must_keep, negative prompts.
Keep adult/NSFW wardrobe if the operator asked. If they asked nude / no clothes, Clothes: completely nude, visible nipples and areolae, no garments.
Keep glasses, phone, jewelry if present.
Do not invent a new person.`,
        },
        { role: "user", content: prepared.creative.slice(0, 6000) },
      ],
    });
    const text = completion.choices[0]?.message?.content?.trim();
    if (text && text.length > 20 && text.length < prepared.creative.length && !isLlmRefusal(text)) {
      return {
        creative: text,
        warnings: [...prepared.warnings, "Revamped to pose / clothes / place / light."],
        revamped: true,
      };
    }
  } catch {
    /* no LLM */
  }
  return {
    creative: heuristicSceneLines(prepared.creative),
    warnings: [...prepared.warnings, "Revamped locally (LLM unavailable)."],
    revamped: true,
  };
}

export async function compileLockedPrompt(
  operator: string,
  name: string,
  look: CharacterLook,
  opts?: { skipRevamp?: boolean },
) {
  const prepared = prepareOperatorPrompt(operator, look);
  const revamped = opts?.skipRevamp
    ? { creative: prepared.creative, warnings: [...prepared.warnings, "Paid model — prompt as written."], revamped: false }
    : await revampOperatorPrompt(operator, look);
  const cleaned = revamped.creative;
  const undress = operatorWantsUndress(cleaned) || operatorWantsUndress(operator);
  const cloud = Boolean(opts?.skipRevamp);
  const lock = lookLockBlock(name, look, { explicit: undress && !cloud });
  const undressLine = undress && !cloud ? UNDRESS_INSTRUCTION : "";
  return {
    prompt: [lock, undressLine, cleaned].filter(Boolean).join("\n"),
    warnings: revamped.warnings,
  };
}
