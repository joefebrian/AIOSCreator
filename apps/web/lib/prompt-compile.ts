/** Turn pasted “Image 1 / Image 2” recipes into creative text + slot flags.
 *  The app owns wiring. The model never sees conflicting Image 1/2 labels. */

export type CompiledPrompt = {
  creative: string;
  negative: string;
  needsSceneRef: boolean;
  mentions: string[];
};

const NEG_SPLIT = /\n\s*negative\s*prompt\s*:/i;

export function compileCharacterPrompt(raw: string): CompiledPrompt {
  const src = (raw || "").replace(/\r\n/g, "\n").trim();
  let creative = src;
  let negative = "";
  const neg = src.split(NEG_SPLIT);
  if (neg.length > 1) {
    creative = neg[0]!.trim();
    negative = neg
      .slice(1)
      .join("\n")
      .replace(/\n+/g, ", ")
      .replace(/\s+,/g, ",")
      .replace(/^[,\s]+|[,\s]+$/g, "");
  }

  const needsSceneRef =
    (/image\s*2/i.test(src) &&
      /(reference|pose|camera|composition|framing|body position|hand position|lighting)/i.test(src)) ||
    /keep (the )?(same )?pose|recreate (the )?(seated )?pose/i.test(src);
  // Generate image no longer auto-promotes this to Recast/Clone. Clone Image is a separate tool.

  const mentions = [...src.matchAll(/@([A-Za-z][\w.\-]*(?:\s+[A-Za-z][\w.\-]*){0,4})/g)].map((m) => m[1]!.trim());

  creative = creative
    .replace(/^\s*reference rules:\s*/i, "")
    .replace(/image\s*1\s*=[\s\S]*?(?=image\s*2\s*=|create a )/i, "")
    .replace(/image\s*2\s*=[\s\S]*?(?=create a )/i, "")
    .replace(/\bfrom Image 1\b/gi, "from the face lock")
    .replace(/\bin Image 1\b/gi, "in the face lock")
    .replace(/\bfrom Image 2\b/gi, "from the pose reference")
    .replace(/\bin Image 2\b/gi, "in the pose reference")
    .replace(/@([A-Za-z][\w.\-]*(?:\s+[A-Za-z][\w.\-]*){0,4})/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return { creative, negative, needsSceneRef, mentions };
}

/** Always-on. Face texture first — unretouched skin, not K-beauty CGI. */
export const REALISM_POSITIVE =
  "Unretouched photoreal photograph of a real human, not a 3D character. FACE: visible pores on nose and cheeks, peach fuzz, fine vellus hair, slight redness and uneven tone, natural oil sheen, micro-asymmetry, real catchlights, unfiltered skin. No glass skin, no Facetune. BODY SKIN: pores on chest, shoulders, and cleavage; peach fuzz on arms; faint veins; slight uneven tone and real subsurface scatter on torso and thighs — not a wax figure, not a beauty-app body. Individual hair strands and flyaways. Realistic hands and legs. Exactly one person. Exactly two arms and two hands — never a third arm, never an extra hand, never a duplicate forearm. Two legs when the crop includes them.";

export const REALISM_NEGATIVE =
  "plastic skin, airbrushed, poreless, porcelain, wax figure, doll face, AI face, Instagram face, K-beauty retouch, glass skin, Facetune, frequency separation, beauty filter, flawless complexion, oversmoothed cheeks, ceramic skin, vinyl skin, waxy torso, airbrushed body, plastic thighs, cgi breasts, doll body, CGI, 3D render, Unreal Engine, Octane, Blender, Flux beauty, Midjourney beauty, cartoon, anime, illustration, mannequin, extra fingers, extra limbs, extra arms, third arm, three arms, extra hands, third hand, extra forearm, duplicate arm, fused fingers, bad anatomy, deformed hands, cropped hands, missing legs, missing feet, amputated legs, legless, truncated legs, cut-off legs, no calves, no shins, floating thighs, incomplete body, two people, second person, extra person, duo selfie, couple, photobomb, extra face, anime character in the photo, illustrated girl standing next to her, cartoon overlay, sticker composite, cutout, green screen, halo edge, matte line, pasted subject, floating person, mismatched white balance, studio key light on a location background, two subjects, blurry skin, low detail skin, oversmoothed, oversaturated skin, fake studio glow";

function splitAvoid(s: string) {
  return s
    .split(/[,;\n]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

function mergeAvoid(...parts: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    for (const tok of splitAvoid(part)) {
      if (seen.has(tok)) continue;
      seen.add(tok);
      out.push(tok);
    }
  }
  return out.join(", ");
}

/** Pasted Generate JSON / photoshoot recipe — not a background edit. */
export function looksLikeNewPhotoshoot(raw: string) {
  const t = (raw || "").trim();
  if (!t) return false;
  if (/"subject"\s*:/.test(t) && /"photography"\s*:/.test(t)) return true;
  if (/"mirror_rules"\s*:/.test(t)) return true;
  if (/Generate an Instagram/i.test(t)) return true;
  if (/\bprompt\s*:\s*\{/.test(t)) return true;
  if (/\b(teman|temannya|friend|dua orang|two people|bersama)\b/i.test(t)) return true;
  if (/\b(pakai|wearing|wear|ganti baju|outfit|tank ?top|camisole|jeans|hoodie|dress)\b/i.test(t)) return true;
  if (t.length < 400) return false;
  return false;
}

/** Drop I2V shot-lists pasted into an image prompt (0–2s, 85mm, etc.). */
export function stripI2vScreenplay(prompt: string) {
  let t = (prompt || "").replace(/\r\n/g, "\n");
  t = t.replace(
    /(?:^|\n)\s*\d+\s*[–\-]\s*\d+\s*(?:seconds?|s)\b[\s\S]*?(?=(?:\n\s*\d+\s*[–\-]\s*\d+\s*(?:seconds?|s)\b)|$)/gi,
    "\n",
  );
  t = t.replace(/\b\d{2,3}\s*mm\s+(telephoto|wide|prime|lens)?\b/gi, "");
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

const MULTI_NEG = /\b(two people|second person|extra person|duo selfie|couple|photobomb|extra face|two subjects)\b/gi;

export function withAvoidList(creative: string, negative: string) {
  const body = creative.trim();
  const avoid = mergeAvoid(REALISM_NEGATIVE, negative);
  if (!body) return `Avoid: ${avoid}`;
  const stripped = body.replace(/\nAvoid:\s*[\s\S]*$/i, "").trim();
  const existing = body.match(/\nAvoid:\s*([\s\S]*)$/i)?.[1] || "";
  return `${stripped}\nAvoid: ${mergeAvoid(avoid, existing)}`;
}

/** Default realism on every still. Extra user negatives merge in. */
export function withRealismPrompt(prompt: string, extraNegative = "", opts?: { multi?: boolean }) {
  let body = (prompt || "").trim();
  const positive = opts?.multi
    ? REALISM_POSITIVE.replace(/Exactly one person\.[^.]*\./g, "Keep each uploaded person's identity. No extra invented people.")
    : REALISM_POSITIVE;
  if (!/unretouched|glass skin|visible (skin )?pores|peach fuzz/i.test(body)) {
    body = body ? `${body}\n${positive}` : positive;
  }
  const neg = opts?.multi ? extraNegative : extraNegative;
  const out = withAvoidList(body, neg);
  if (!opts?.multi) return out;
  return out.replace(MULTI_NEG, "").replace(/,\s*,/g, ",").replace(/Avoid:\s*,/i, "Avoid: ");
}
