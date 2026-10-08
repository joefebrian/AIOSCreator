import type { Character, CharacterLook } from "./character-types";
export { isMinorLook } from "./character-types";
import { openRouterTidyClient, openRouterTidyConfig } from "./llm";
import { moodPlaceFallback } from "./prompt-presets";

const EXPLICIT_HAIR_RESTYLE =
  /\b(restyle|change|cut|dye)\s+(her\s+|the\s+)?hair\b|\bgive her a (bob|pixie|buzz|undercut)\b|改发型|剪短发|换成短发|染发/i;

const INCIDENTAL_SHORT_HAIR =
  /chin-length|short bob|bob cut|pixie|buzz cut|undercut|short wavy bob|长度到下巴|短波波|短发|齐下巴|波波头/gi;

/** "never a short bob, pixie, or chin-length cut" is already a negative. Leave it. */
function rewriteIncidentalShortHair(scene: string) {
  return scene.replace(INCIDENTAL_SHORT_HAIR, (match, offset, src: string) => {
    const start = Math.max(
      src.lastIndexOf(".", offset),
      src.lastIndexOf("\n", offset),
      src.lastIndexOf("!", offset),
      src.lastIndexOf("?", offset),
    );
    const before = src.slice(start + 1, offset);
    const wide = src.slice(Math.max(0, offset - 180), offset);
    if (/\b(never|not|no|avoid|without|don't|dont)\b/i.test(before)) return match;
    if (/\b(never|avoid|without|don't|dont)\b/i.test(wide)) return match;
    if (/\ba\s$/i.test(src.slice(Math.max(0, offset - 2), offset))) return "haircut on the plate";
    return "the character's hair on the plate";
  });
}

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

const NUDE_ASK =
  /\b(fully nude|completely nude|totally nude|nude adult|naked|no clothes|no clothing|wearing nothing|without clothes|undress(?:ed)?|telanjang|bugil)\b|clothes?(?:\s+in this still)?\s+go(?:es)? away|lepas(?:kan)? baju/i;

export function operatorWantsUndress(prompt: string) {
  const t = prompt || "";
  if (NUDE_ASK.test(t)) return true;
  return false;
}

/** Open robe / in-bed / topless: keep the garment, draw real breasts — not a Barbie chest. */
export function operatorWantsBareChest(prompt: string) {
  const t = prompt || "";
  if (operatorWantsUndress(t)) return false;
  if (/\b(bikini|camisole|bra|lingerie|swimsuit)\b/i.test(t) && !/\b(open robe|bare torso|topless|bare breasts)\b/i.test(t)) {
    return false;
  }
  return /\b(bare torso|bare breasts|open robe|topless|visible nipples|areolae?|sheet low)\b/i.test(t);
}

export const UNDRESS_INSTRUCTION =
  "WARDROBE: completely nude adult. No clothing of any kind. No tank top, no shirt, no shorts, no bra, no bikini, no underwear copied from the identity photo. Bare breasts with visible nipples and areolae, natural breast anatomy, uncensored, not covered, not blurred.";

export const BARE_CHEST_INSTRUCTION =
  "CHEST: bare breasts with visible nipples and areolae, natural anatomy, uncensored. Not a Barbie doll chest, not featureless, not blurred, not pasties. Do not copy the identity-photo tank top or shorts onto the chest.";

export const UNDRESS_NEGATIVE =
  "clothes, clothing, shirt, tank top, camisole, romper, bodysuit, ribbed tank, crop top, sports bra, shorts, pants, jeans, bra, bikini, underwear, swimsuit, dress, towel, robe, lace, straps, censored, mosaic, pasties, nipple tape, covered nipples, featureless breasts, Barbie doll chest";

export const BARE_CHEST_NEGATIVE =
  "tank top, identity-photo shorts, censored, mosaic, pasties, nipple tape, covered nipples, featureless breasts, Barbie doll chest, blurred chest";

export function operatorSetsScene(prompt: string) {
  return operatorWantsUndress(prompt) ||
    /\b(studio|seamless|caf[eé]|hotel|apartment|loft|beach|park|rooftop|alley|subway|gym|kitchen|bathroom|balcony|neon|golden hour|overcast|outdoor|indoor|photography studio|new background|plain studio)\b/i.test(
      prompt,
    );
}

function isLlmRefusal(text: string) {
  return /user safety|safety categor|content.?filter|cannot (help|assist)|i'?m unable|refused|unsafe/i.test(text);
}

/** One place line when a loose essay left Background empty. A named place is left alone. */
export async function fillEmptyPlaceFromMood(
  blocks: Record<string, string>,
): Promise<{ text: string; source: "llm" | "mood" } | null> {
  if ((blocks.background || "").trim()) return null;
  const cue = [blocks.outfit, blocks.pose, blocks.light, blocks.texture, blocks.film, blocks.hair]
    .map((part) => (part || "").trim())
    .filter(Boolean)
    .join(" ");
  if (cue.length < 40) return null;
  try {
    const client = openRouterTidyClient();
    const completion = await Promise.race([
      client.chat.completions.create({
        model: openRouterTidyConfig().model,
        temperature: 0.3,
        max_tokens: 120,
        messages: [
          {
            role: "system",
            content:
              "Write ONE background for a fashion still. The operator named no place. Match the outfit and mood. One room and the objects that belong there. No extra people. No readable lettering. No camera settings. Two short sentences max. Do not repeat the clothes. An evening black dress with gold chains and a leather chair is a dim lounge bar, not a white cyclorama. Return the place only.",
          },
          { role: "user", content: cue.slice(0, 1800) },
        ],
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("mood place timeout")), 20000)),
    ]);
    const text = (completion.choices[0]?.message?.content || "")
      .replace(/\s+/g, " ")
      .replace(/^["']|["']$/g, "")
      .trim();
    if (text && text.length > 20 && text.length < 400 && !isLlmRefusal(text) && !/place not set/i.test(text)) {
      return { text, source: "llm" };
    }
  } catch {
    /* local mood */
  }
  const local = moodPlaceFallback(cue);
  return local ? { text: local, source: "mood" } : null;
}

export function lookSkinNegative() {
  return "bleached skin, paler skin, porcelain skin, whitewashed, lighter complexion, different ethnicity, mismatched face and body skin, orange tan, gray skin, waxy torso, airbrushed body, plastic thighs, vinyl skin, cgi breasts";
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
  push("Wardrobe", j.clothing ?? j.outfit);
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

  const meta = j.meta && typeof j.meta === "object" ? (j.meta as Record<string, unknown>) : undefined;
  const scene = j.scene && typeof j.scene === "object" ? (j.scene as Record<string, unknown>) : undefined;
  const lighting = j.lighting && typeof j.lighting === "object" ? (j.lighting as Record<string, unknown>) : undefined;
  const cam =
    j.camera_perspective && typeof j.camera_perspective === "object"
      ? (j.camera_perspective as Record<string, unknown>)
      : undefined;
  const subject = j.subject && typeof j.subject === "object" ? (j.subject as Record<string, unknown>) : undefined;
  const details = j.details && typeof j.details === "object" ? (j.details as Record<string, unknown>) : undefined;

  if (scene) {
    push("Place", [scene.location, scene.environment, scene.time, scene.atmosphere]);
  }
  if (lighting) push("Light", lighting);
  if (meta || cam) {
    push("Camera", {
      aspect: meta?.aspect_ratio,
      camera: meta?.camera,
      lens: meta?.lens,
      style: meta?.style,
      ...(cam || {}),
    });
  }
  if (subject) {
    push("Pose", subject.pose);
    push("Wardrobe", subject.outfit);
    const body = subject.body && typeof subject.body === "object" ? (subject.body as Record<string, unknown>) : undefined;
    if (body?.skin) push("Skin texture", body.skin);
  }
  if (details) push("Vibe", details.vibe ?? details);

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
    warnings.push("Long prompt trimmed.");
  }

  const sceneOnly = text.replace(/\n(?:Avoid|Negative prompt)\s*:\s*[\s\S]*$/i, "");
  if (!EXPLICIT_HAIR_RESTYLE.test(sceneOnly) && /long|bun|tied|identity plate/i.test(look.hair)) {
    const avoid = text.match(/\n(?:Avoid|Negative prompt)\s*:\s*[\s\S]*$/i)?.[0] || "";
    let scene = rewriteIncidentalShortHair(sceneOnly);
    scene = scene.replace(/\b(petite|porcelain skin|narrow jawline|fair porcelain)\b/gi, "");
    if (scene !== sceneOnly) warnings.push("Incidental bob/bangs/petite stripped. Lock hair/body wins.");
    scene = scene.replace(/\b,?\s*defining (?:her |the )?facial features\b/gi, "");
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
    const client = openRouterTidyClient();
    const completion = await client.chat.completions.create({
      model: openRouterTidyConfig().model,
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
Always include: Style: unretouched photoreal photograph, not 3D, not Pixar, not cartoon, not illustration.
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

const KLEIN_CGI_BAIT =
  /\b(hyper[- ]realistic|ultra[- ]realistic|ultra-detailed|exquisite makeup|hourglass|s-shaped|perfect (foot|leg|figure)|8\s*k|octane|unreal engine|pixar|3d render|cgi character|glass skin|porcelain skin|beauty filter|cinematic beauty|perfectly symmetrical|identity lock|title:\s*|image quality parameters|wispy full bangs)\b/i;

function stripKleinCgi(prompt: string) {
  return prompt
    .replace(/##\s*\[Image Quality[\s\S]*?(?=##|$)/gi, "")
    .replace(KLEIN_CGI_BAIT, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function photoRewrite(prompt: string, engineLabel: string) {
  try {
    const client = openRouterTidyClient();
    const completion = await client.chat.completions.create({
      model: openRouterTidyConfig().model,
      temperature: 0.2,
      max_tokens: 700,
      messages: [
        {
          role: "system",
          content:
            `Rewrite this as a real handheld CAMERA photo prompt for ${engineLabel}. Keep pose, clothes, place, camera angle, and any <image1>/<image2>/<image3> tags. Delete: LOCKED LOOK, TITLE, IDENTITY LOCK, Unretouched photoreal PHOTOGRAPH lead-in, hyper-realistic, ultra-detailed, exquisite makeup, hourglass, S-curve, 8K, Pixar, 3D, CGI, [Image Quality Parameters], Japanese-idol doll language, perfect body ratios, 50-item Avoid lists, blurry skin. Add: phone or film snapshot, visible pores, imperfect light, slight compression, candid not posed-CGI. One woman. Return the prompt only.`,
        },
        { role: "user", content: prompt.slice(0, 3500) },
      ],
    });
    const text = completion.choices[0]?.message?.content?.trim() || "";
    return text.length > 40 ? text : prompt;
  } catch {
    return stripKleinCgi(prompt);
  }
}

async function kleinPhotoRewrite(prompt: string) {
  return photoRewrite(prompt, "Flux Klein");
}

const IDENTITY_BAIT =
  /\b(east asian|south asian|southeast asian|korean|japanese|chinese|caucasian|chestnut|brunette|blonde|auburn|curtain bangs|bangs|bob\b|pixie|half-up|tousled|voluminous dark|wispy|hairline|hairstyle|wavy bob|long hair|short hair|fair with a natural|muted rose lips|rosy cheeks|delicate facial|facial identity|facial features|skin tone|8\s*k|ultra-?realistic|photorealistic|highly detailed|RAW photography|ultra realistic skin texture|slender|skinny|petite|hourglass)\b/i;

function stillHasIdentityBait(text: string) {
  return IDENTITY_BAIT.test(text);
}

/** Phrase-level cuts so mixed sentences (hair + clothes) still lose identity. */
function stripHairAndIdentityPhrases(prompt: string): string {
  let t = prompt;
  t = t.replace(/\bUse the uploaded photo as the facial identity reference[^.]*\.\s*/gi, "");
  t = t.replace(/\bPreserve (his|her|their) recognizable facial features[^.]*\.\s*/gi, "");
  t = t.replace(/\bmake the aspect ratio[^.]*\.?/gi, "");
  t = t.replace(
    /\bwith (a |an )?(tousled|voluminous|long|short|wavy|straight|curly|dark|brunette|blonde|chestnut)[^.,]{0,100}(bob|bangs|hair|hairstyle|hairline)[^.,]{0,80}/gi,
    "",
  );
  t = t.replace(/\b(a |an )?(tousled|voluminous)[^.,]{0,80}(bob|bangs|hair)[^.,]{0,60}/gi, "");
  t = t.replace(/\b(dark |light )?(brunette|blonde|chestnut|auburn) (wavy |straight |curly )?(bob|hair|bangs)\b/gi, "");
  t = t.replace(/\b(wavy |straight |curly )?(bob with bangs|bob|pixie cut|curtain bangs)\b/gi, "");
  t = t.replace(/\bbangs (lightly )?(veiling|covering)[^.,]{0,40}/gi, "");
  t = t.replace(/\bShe has (long |short |wavy |straight |a )?[^.]+\.\s*/gi, "");
  t = t.replace(/\bHer [^.]{0,60}\bhair\b[^.]+\.\s*/gi, "");
  t = t.replace(/\bHer (skin|face) is [^.]+\.\s*/gi, "");
  t = t.replace(/\bShe possesses [^.]+\.\s*/gi, "");
  t = t.replace(/\b(wispy bangs|medium-length dark brown hair|S-shaped|curvaceous|head-to-body ratio|perfect foots|perfect foot lines|perfect leg lines)\b[,.]?\s*/gi, "");
  t = t.replace(/\b(beautiful young |young )?(East Asian|South Asian|Southeast Asian|Korean|Japanese|Chinese|Caucasian)\s+woman\b/gi, "woman");
  t = t.replace(/\ba young woman\b/gi, "a woman");
  t = t.replace(
    /\b(ultra-?realistic|photorealistic|8\s*K|highly detailed|RAW photography|ultra realistic skin texture)\b[,.]?\s*/gi,
    "",
  );
  t = t.replace(/\bKorean fashion editorial,?\s*/gi, "");
  t = t.replace(/\b(slender|skinny|slim|petite|hourglass)\b/gi, "");
  t = t.replace(/[ \t]{2,}/g, " ").replace(/\s+,/g, ",").replace(/\s+\./g, ".").replace(/\n{3,}/g, "\n\n").trim();
  return t;
}

function looksLikeFashionShorthand(prompt: string) {
  const t = prompt.trim();
  if (t.length > 420) return false;
  return /\bfashion girl\b/i.test(t) && /skirt|boots|blazer|polo|shirt|sneakers/i.test(t);
}

function localExpandFashionShorthand(prompt: string): string {
  const clothes = localStripIdentity(
    prompt
      .replace(/\bAdult\b/gi, "")
      .replace(/\b(East Asian|Korean|Japanese|Chinese)\b/gi, "")
      .replace(/\bfashion girl,?\s*/gi, ""),
  )
    .replace(/^[,.\s]+/, "")
    .trim();
  return (
    `Photoreal fashion editorial of a woman. Outfit: ${clothes}. ` +
    `Standing, full-body, relaxed pose, looking at camera. ` +
    `Simple backdrop that matches the outfit mood, natural daylight. One woman.`
  );
}

/** Deterministic. OpenRouter is optional polish only — this always runs last. */
function localStripIdentity(prompt: string): string {
  const paras = prompt.split(/\n\s*\n/).filter((p) => {
    const idn = (
      p.match(
        /\b(hair|bangs|hairstyle|hairline|chestnut|brunette|bob|skin is|rosy cheeks|facial features|eyelashes|brows|muted rose lips|eye makeup|satin glow)\b/gi,
      ) || []
    ).length;
    const scene = (
      p.match(
        /\b(wears?|wearing|shirt|skirt|trousers|pants|boots|necktie|tights|bag|book|coffee|sits?|sitting|leaning|doorway|steps|staircase|lighting|leica|earrings)\b/gi,
      ) || []
    ).length;
    if (idn >= 3 && scene === 0) return false;
    return true;
  });
  const t = stripHairAndIdentityPhrases(paras.join("\n\n"));
  return t.length > 40 ? t : prompt;
}

async function stripIdentityFromGeneratePrompt(prompt: string) {
  const local = looksLikeFashionShorthand(prompt)
    ? localExpandFashionShorthand(prompt)
    : localStripIdentity(prompt);
  let candidate = local;
  try {
    const client = openRouterTidyClient();
    const completion = await client.chat.completions.create({
      model: openRouterTidyConfig().model,
      temperature: 0.1,
      max_tokens: 900,
      messages: [
        {
          role: "system",
          content:
            "Rewrite this as a Generate Image operator prompt. KEEP: clothes, accessories, shoes, vibe tags (Candy Mod, Sporty Doll, etc.), pose, activity, expression, place, lighting, camera, film stock. DELETE: hair color/length/style/bangs/bob/half-up, skin tone, facial features, eye makeup, brows, lips, body type (slender, petite, hourglass, skinny), ethnicity labels (East Asian, Korean, Japanese, Adult East Asian fashion girl, etc.), 8K, ultra-realistic, highly detailed, beauty-CGI bait. If pose/place are missing, ADD a simple standing full-body fashion editorial (relaxed pose, looking at camera, urban or studio backdrop that matches the outfit mood, natural daylight). One woman. Do not describe who she is — only what she is wearing, doing, and where. Return the prompt only.",
        },
        { role: "user", content: local.slice(0, 4500) },
      ],
    });
    const text = completion.choices[0]?.message?.content?.trim() || "";
    if (text.length > 40 && !isLlmRefusal(text)) candidate = text;
  } catch {
    /* OpenRouter down or echo — local strip is already applied */
  }
  const cleaned = localStripIdentity(candidate);
  if (stillHasIdentityBait(cleaned)) return local;
  return cleaned;
}

const DRIFT_FACE_ENGINES = new Set(["grok-imagine", "muse-image-1.0"]);
const LOCAL_EDIT_FACE_ENGINES = new Set(["qwen-image-2.1", "qwen-image-2.1-gguf"]);

/** Grok and Muse redraw a new face on a full-body crop. This lock stays on those two engines. */
export function driftEngineFaceLock(engineId: string): string {
  if (!DRIFT_FACE_ENGINES.has(engineId)) return "";
  return [
    "Image 1 is this exact person's face at every crop, including a full-body shot.",
    "Copy that face: eyes, nose, jaw, cheeks, mouth, and skin. Do not draw a different woman, a doll face, a sharper jaw, or larger eyes.",
    "A head tilt or turn moves only the neck.",
    "Doll-like, haughty, glossy, or innocent wording is makeup and mood on this face.",
    "Hair length and color stay Image 1. Ribbons, buns, and wind are styling on that hair. Do not cut it short. Ribbons sit on the hair. They do not replace the hair or cover the face.",
    "Image 2, when present, is only her body proportions, not a second person.",
  ].join(" ");
}

/** Qwen Image 2.1 and its GGUF redraw a face on a long essay. This lock stays off Grok, Muse, and try-on. */
export function localEditFaceLock(engineId: string): string {
  if (!LOCAL_EDIT_FACE_ENGINES.has(engineId)) return "";
  return [
    "Image 1 is this exact face. Copy eyes, nose, jaw, cheeks, mouth, freckles, and skin.",
    "A wide lens does not enlarge or replace that face.",
    "Lipstick recolors this mouth. It does not draw a new mouth.",
    "Hands have five fingers.",
    "Image 2, when present, is body proportions only.",
  ].join(" ");
}

/** Muse and Grok try-on. Image 1 is the headshot. The chat lock must not call Image 2 a body plate. */
export function usesDriftTryOnFace(engineId: string) {
  return DRIFT_FACE_ENGINES.has(engineId);
}

export type TryOnCrop = "headshot" | "three_quarter" | "full";

/** Baseline file picked in the try-on pane. Unknown stills stay full body. */
export function tryOnBaselineCrop(personPath: string): TryOnCrop {
  const name = personPath.replace(/\\/g, "/").split("/").pop()?.toLowerCase() || "";
  if (name.includes("three_quarter")) return "three_quarter";
  if (name.includes("headshot") || name.includes("identity") || /-close\./.test(name)) return "headshot";
  return "full";
}

/** The baseline crop stays when the note names a new place. */
export function tryOnCropLine(crop: TryOnCrop) {
  if (crop === "three_quarter") {
    return "Keep Image 3's crop. Mid-thigh frame, head to the thighs. Feet and knees stay out of frame. Do not pull back to a full-body shot. A beach, street, or any other place stays behind that same crop.";
  }
  if (crop === "headshot") {
    return "Keep the headshot crop. Shoulders up. Do not pull back to a body shot.";
  }
  return "Full-body crop. Head to feet may be in frame.";
}

/** Every try-on. The note's place, whatever it is, lights her. No location list. */
export function tryOnInPlace(crop: TryOnCrop = "full") {
  const shadow =
    crop === "full"
      ? "A contact shadow sits under her feet and along the floor."
      : "Feet stay out of frame. The shadow falls on her body and the set around her.";
  return [
    "Read the place from the note. A rooftop, cafe, bedroom, street, beach, or any other situation is that place.",
    "She is physically in that place, one photograph, not a cutout pasted on a background.",
    "The studio light, white seamless backdrop, and catalog white balance from Image 1 and Image 3 stay out of the new place.",
    "One camera, one exposure. That place's light falls on her face, hair, clothes, and the set together.",
    `Skin and fabric take that color temperature. ${shadow}`,
    "A few hair strands overlap the background. No halo, no cutout edge, no green-screen matte.",
    "Face identity stays Image 1. The light on that face changes with the place.",
    "If the note does not name a place, keep the plate's place and its light. Outfit and pose may still follow the note.",
    tryOnCropLine(crop),
  ].join(" ");
}

/** Face stays the headshot. Image 2 is the SKU. Image 3, when sent, is body width only. */
export function driftTryOnPrompt(note: string, skuCount: number, hasBodyPlate: boolean, crop: TryOnCrop = "full") {
  const sku =
    skuCount > 1
      ? `Image 2 is a ${skuCount}-item SKU sheet. Apply all ${skuCount} products, not only the first.`
      : "Image 2 is the SKU photo. Put every distinct product from Image 2 onto her. Do not apply only the first cell.";
  const body = hasBodyPlate
    ? "Image 3 is her body proportions only. Copy waist, hip, and thigh width from Image 3. Its studio backdrop and studio light stay out. Image 3 is not a second person and not an outfit."
    : "";
  return [
    "Virtual try-on.",
    "Image 1 is this exact person's face. Copy that face: eyes, nose, jaw, cheeks, mouth, and skin tone. Do not draw a different woman, a doll face, a sharper jaw, or larger eyes. Hair length and color stay Image 1. Do not copy Image 1's studio light.",
    sku,
    "Clothes from Image 2 replace her outfit (color, cut, fabric, logos). Fabric drapes naturally. Earrings, necklace, bracelet, ring, watch, glasses, bag, shoes, hat: add an item only when it is visible in Image 2. If Image 2 has no shoes, her feet stay bare. Do not invent extras.",
    body,
    "Ignore other models in the SKU photos.",
    note.trim(),
    tryOnInPlace(crop),
    "Photoreal.",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Makeup words that made Grok and Muse invent a doll. Other engines keep the operator text. */
export function calmDriftFaceWording(text: string): string {
  return text
    .replace(/\bevoke a doll-like look\b/gi, "stay on this face")
    .replace(/\bdoll-like\b/gi, "this person's")
    .replace(/\bdoll face\b/gi, "this face");
}

const STYLING_CHIP = /\b(same length|styling only|not a cut|does not change length)\b/i;
const OTHER_FACE =
  /\b(see-through bangs|straight bangs|bangs\b|bob cut|short bob|pixie|buzz cut|medium-to-semi-long|medium-length|semi-long|shoulder-length|grazes the collarbone|collarbone and shoulders|espresso|honey-blonde|blonde hair|brunette|chestnut|auburn|half-tied|ivory|porcelain|fair skin|pale skin|warm ivory|large, clear eyes|large clear eyes|oval face|narrow jaw|doll face|street-teen|teenager|teen girl|slender|skinny|petite|hourglass)\b/i;
const SCENE_ANCHOR =
  /\b(jacket|sukajan|velvet|lace|camisole|bustier|dress|shirt|skirt|bubble|bubblegum|neon|street|camera|lens|bokeh|pose|lean|standing|sitting|bag|shoes|sandals|lamp|room|hotel|library|embroidery|satin|coat|tee|jeans|cardigan|knit|mohair|sweater|hoodie|blouse|pants|trousers|loungewear)\b/i;

function isStylingChip(text: string): boolean {
  const t = text.trim();
  if (t.length > 320 || !STYLING_CHIP.test(t)) return false;
  return !/\b(espresso|blonde|brunette|chestnut|auburn|porcelain|fair skin|ivory skin|large eyes|oval face|teenager|\bteen\b)\b/i.test(t);
}

function dedupeRepeatedScene(text: string): { text: string; changed: boolean } {
  const key = text.trim().slice(0, 70);
  if (key.length < 40) return { text, changed: false };
  const second = text.indexOf(key, 80);
  if (second > 300) return { text: text.slice(0, second).trim(), changed: true };
  return { text, changed: false };
}

function softenOtherWoman(sentence: string): string {
  return sentence
    .replace(/\bwith large, clear eyes\b/gi, "")
    .replace(/\blarge, clear eyes\b/gi, "")
    .replace(/\bstreet-teen\b/gi, "")
    .replace(/\b(slender|skinny|petite|hourglass)\b/gi, "")
    .replace(/\btranslucent warm ivory tone of the subject's skin\b/gi, "character's own skin tone")
    .replace(/\bwarm ivory(?: tone)?\b/gi, "character's skin tone")
    .replace(/\b(ivory|porcelain|fair|pale) skin\b/gi, "character's skin")
    .replace(/\b(honey-blonde|dark espresso|espresso|blonde hair|brunette|chestnut|auburn)\b/gi, "")
    .replace(/\bsee-through bangs\b[^,.]{0,90}/gi, "")
    .replace(/\bmedium-to-semi-long cut\b[^,.]{0,90}/gi, "")
    .replace(/\bgrazes the collarbone and shoulders\b/gi, "")
    .replace(/\bloosely half-tied at the crown\b[^,.]{0,90}/gi, "")
    .replace(/"\s*"/g, "")
    .replace(/\bthe the\b/gi, "the")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;])/g, "$1")
    .trim();
}

/** Keep clothes, pose, and place. A prompt that describes another woman loses that face, hair, and skin. */
export function fitSceneToCharacter(raw: string, look: CharacterLook): { text: string; changed: boolean } {
  const src = (raw || "").replace(/\r\n/g, "\n").trim();
  if (!src) return { text: "", changed: false };
  const avoid = src.match(/\n(?:Avoid|Negative prompt)\s*:\s*[\s\S]*$/i)?.[0] || "";
  let scene = src.replace(/\n(?:Avoid|Negative prompt)\s*:\s*[\s\S]*$/i, "").trim();
  if (isStylingChip(scene)) return { text: src, changed: false };
  const dup = dedupeRepeatedScene(scene);
  scene = dup.text;
  let changed = dup.changed;
  const kept: string[] = [];
  for (const part of scene.split(/\n+/)) {
    const next: string[] = [];
    for (const rawBit of part.split(/(?<=[.!?])\s+/)) {
      const original = rawBit.trim();
      if (!original) continue;
      const bit = softenOtherWoman(original);
      if (bit !== original) changed = true;
      const other = OTHER_FACE.test(bit);
      const anchored = SCENE_ANCHOR.test(bit);
      const hairBio = /^\s*(hair\s*:|the hair is\b)/i.test(bit) || /\b(hairstyle|hair length|frame the cheeks)\b/i.test(bit);
      if (!bit || bit.replace(/[^a-z0-9]/gi, "").length < 8 || (other && !anchored) || (hairBio && !anchored)) {
        changed = true;
        continue;
      }
      next.push(bit);
    }
    if (next.length) kept.push(next.join(" "));
    else if (part.trim()) changed = true;
  }
  scene = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (changed) {
    const plate = `Use this character only. Face stays the plate (${look.face}). Hair stays the plate (${look.hair}). Body and skin stay the plate (${look.body}).`;
    scene = [scene, plate].filter(Boolean).join("\n");
  }
  return { text: [scene, avoid.trim()].filter(Boolean).join("\n").trim(), changed };
}

/** Generate Image (chat): operator prompt leads. FACE + BODY SHAPE from refs, not pose/clothes. Paid and local. */
export async function compileGenerateChatPrompt(
  operator: string,
  name: string,
  presets = "",
  framing: "close" | "three_quarter" | "full" = "full",
  look?: CharacterLook,
) {
  const plateLook: CharacterLook = look?.hair
    ? look
    : {
        hair: "same hair as the identity plate — length, color, and part",
        face: "same face as the identity plate: bone structure, eyes, nose, mouth, age, skin color and undertone",
        body: "same body as the identity plate: proportions and skin color",
      };
  const prepared = prepareOperatorPrompt(operator, plateLook);
  const joined = await stripIdentityFromGeneratePrompt(
    [presets.trim(), prepared.creative].filter(Boolean).join("\n"),
  );
  const fitted = fitSceneToCharacter(joined, plateLook);
  const creative = fitted.text;
  const faceLock =
    `Image 1 / <image1> is the FACE + HAIR lock of @${name} (headshot: face, hair length, hair color, hairline). Keep that identity. ` +
    `Do NOT copy Image 1's expression, smile, or straight-on angle. Head turn and tilt follow the operator text. Expression follows the activity. `;
  const bodyLock =
    framing === "close"
      ? `No second body plate. Do not invent a different person or a skinny catalog body.`
      : framing === "three_quarter"
        ? `Image 2 / <image2> is the 3/4 BODY lock: torso, hips, arms, proportions — not pose, crop, clothes, or the catalog skin finish. Recast torso skin as unretouched camera skin.`
        : `Image 2 / <image2> is the FULL BODY lock: physique, proportions, curves, height, and the SHAPE of her hands, fingers, feet, and legs. Do not copy Image 2's standing pose, crop, clothes, or airbrushed catalog skin. Recast body skin as unretouched: pores on chest and shoulders, peach fuzz on arms, slight uneven tone on torso and thighs. Limb pose follows the operator text.`;
  const lock =
    faceLock +
    bodyLock +
    ` Prompt words like slender, skinny, slim, petite, fair, or a different hair color must NOT change this person. ` +
    `One woman, one photograph — not a face cutout, not a collage, not a sticker on another body. ` +
    `She is physically IN this place, not composited over it. Skin, hair, and clothes take the room's color temperature. ` +
    `Contact shadows under chin, arms, and where she meets the seat or table. Hair strands overlap the background. ` +
    `No halo, no cutout edge, no green-screen matte, no different white balance on the person vs the room. ` +
    `One camera, one exposure. Pose, camera, clothes, place, and expression follow the operator text. Real camera photograph of a real person: visible pores on face AND body, peach fuzz, fine grain, motivated shadow on skin. Not 3D, not Unreal, not plastic torso, not beauty-app body.`;
  const plate =
    framing === "close" ? "headshot only" : framing === "three_quarter" ? "headshot + 3/4" : "headshot + full body";
  return {
    prompt: [lock, creative].filter(Boolean).join("\n"),
    warnings: [
      `${plate} plates · identity locked`,
      ...(fitted.changed ? ["Prompt described another woman. Face, hair, and skin stayed this character."] : []),
    ],
  };
}

/** Klein Generate: identity short lock + photo-language operator (no 3D-beauty bait). */
export async function compileKleinGeneratePrompt(
  operator: string,
  name: string,
  look: CharacterLook,
  presets = "",
) {
  const prepared = prepareOperatorPrompt(operator, look);
  let body = [presets.trim(), prepared.creative].filter(Boolean).join("\n");
  body = await kleinPhotoRewrite(body);
  const lock = `Same person as the face photo of @${name}. One woman. Real handheld photograph: pores, slight noise, imperfect light. Not 3D, not Pixar, not illustration, not exquisite-makeup CGI. Pose, clothes, and place follow the text.`;
  return {
    prompt: [lock, body].filter(Boolean).join("\n"),
    warnings: ["Klein: prompt rewritten as a real handheld photo."],
  };
}

/** Qwen Image 2.1 Generate: short identity lock + photo-language operator (no beauty-CGI lock dump). */
export async function compileQwen21GeneratePrompt(
  operator: string,
  name: string,
  look: CharacterLook,
  presets = "",
) {
  const prepared = prepareOperatorPrompt(operator, look);
  let body = [presets.trim(), prepared.creative].filter(Boolean).join("\n");
  body = await photoRewrite(body, "Qwen Image 2.1");
  const lock = `Keep identity from <image1> (@${name}). One woman. Real handheld photograph: pores, slight noise, imperfect light. Not 3D, not Pixar, not illustration, not exquisite-makeup CGI. Pose, clothes, and place follow the text.`;
  return {
    prompt: [lock, body].filter(Boolean).join("\n"),
    warnings: ["Qwen 2.1: prompt rewritten as a real handheld photo."],
  };
}

/** Chat to edit on 2.1: keep the still, rewrite only the place as a real camera photo. */
export async function compileQwen21ScenePrompt(operator: string, presets = "") {
  const raw = [presets.trim(), operator.trim()].filter(Boolean).join("\n");
  const place = await photoRewrite(
    `IMAGE EDIT. Keep the woman, pose, clothes, and crop from <image1>. Only the background/light change. Place from this text:\n${raw}`,
    "Qwen Image 2.1 scene-edit",
  );
  return {
    prompt: `Keep <image1> exactly: same woman, same face, same hair, same clothes, same pose, same crop. Change only the place and light behind her. Handheld phone photo: visible pores, imperfect light, slight compression, candid, not 3D, not Pixar, not CGI doll. One woman. No extra person.\n${place}`,
    warnings: ["Qwen 2.1 Chat to edit: scene rewritten as a real camera place."],
  };
}

export async function compileLockedPrompt(
  operator: string,
  name: string,
  look: CharacterLook,
  opts?: { skipRevamp?: boolean; presets?: string; paid?: boolean },
) {
  const prepared = prepareOperatorPrompt(operator, look);
  const presets = (opts?.presets || "").trim();
  const undress = operatorWantsUndress(prepared.creative) || operatorWantsUndress(operator) || operatorWantsUndress(presets);
  if (opts?.paid) {
    const lock = `Same person as the face reference (@${name}). One woman only. Match identity (face, hair color, body shape) — not the reference pose, hands, crop, or clothes. Pose, camera, crop, and wardrobe follow the operator text exactly. Photoreal photograph, not 3D or cartoon.`;
    const undressLine = undress ? UNDRESS_INSTRUCTION : "";
    return {
      prompt: [lock, undressLine, presets, prepared.creative].filter(Boolean).join("\n"),
      warnings: [...prepared.warnings, "Paid generate: your prompt leads; lock is two lines."],
    };
  }
  const revamped = opts?.skipRevamp
    ? { creative: prepared.creative, warnings: [...prepared.warnings, "Paid model — prompt as written."], revamped: false }
    : await revampOperatorPrompt(operator, look);
  const cleaned = revamped.creative;
  const lock = lookLockBlock(name, look, { explicit: undress });
  const undressLine = undress ? UNDRESS_INSTRUCTION : "";
  const photoLead =
    "Unretouched photoreal PHOTOGRAPH of a real woman. Camera capture. Real pores and peach fuzz. NOT 3D, NOT CGI, NOT Pixar, NOT cartoon, NOT illustration, NOT blender.";
  return {
    prompt: [photoLead, lock, undressLine, presets, cleaned].filter(Boolean).join("\n"),
    warnings: revamped.warnings,
  };
}
