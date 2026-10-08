import fs from "node:fs";
import type { Character } from "./character-types";
import { mediaUrlToPath } from "./paths";

/** Named still inputs. Never pass a 3/4 turnaround as `face`. */
export type StillRefs = {
  face?: string;
  body?: string;
  scene?: string;
  extra?: string[];
};

export type StillKind = "identity" | "restyle" | "bump" | "transform" | "faceswap" | "on-model" | "scene";

export type GenerateStillOpts = {
  kind?: StillKind;
  width?: number;
  height?: number;
  aspect?: string;
  vibePrompt?: string;
  onProgress?: (label: string) => void;
};

export function normalizeStillRefs(input?: string | StillRefs | null): StillRefs {
  if (!input) return {};
  if (typeof input === "string") return { face: input };
  return {
    face: input.face,
    body: input.body,
    scene: input.scene,
    extra: Array.isArray(input.extra) ? input.extra.filter(Boolean) : undefined,
  };
}

export function existingFile(p?: string | null): string | undefined {
  if (!p) return undefined;
  return fs.existsSync(p) ? p : undefined;
}

/** Face = shoulders-up headshot, never a full-body identity plate. Body = front only. */
export function characterStillRefs(row: Character): StillRefs {
  const headshotUrl = row.slots.find((s) => s.key === "headshot")?.url;
  const closeUrl = row.slots.find((s) => s.key === "close")?.url;
  const face = existingFile(headshotUrl ? mediaUrlToPath(headshotUrl) : undefined)
    || existingFile(closeUrl ? mediaUrlToPath(closeUrl) : undefined)
    || existingFile(row.identityUrl ? mediaUrlToPath(row.identityUrl) : undefined);
  const bodyUrl = row.slots.find((s) => s.key === "front")?.url;
  const body = existingFile(bodyUrl ? mediaUrlToPath(bodyUrl) : undefined);
  return {
    face,
    body: body && body !== face ? body : undefined,
  };
}

export type GenerateFraming = "close" | "three_quarter" | "full";

/** Which Complete-set plate is Image 2. FACE is always the headshot. */
export function framingFromPrompt(prompt: string): GenerateFraming {
  const t = prompt.toLowerCase();
  const wantsFull =
    /\b(full[-\s]?body|head[-\s]?to[-\s]?toe|entire woman|both feet|one foot|barefoot|high heels|holding (her )?heels|shoes on the (floor|carpet)|from head to (the )?(toe|heel|feet)|standing full|without cropping|low[-\s]?angle|lengthens the legs)\b/.test(
      t,
    );
  const wantsClose =
    /\b(close[-\s]?up|headshot|beauty shot|shoulders[-\s]?up|face only|bust shot|bust-to-medium)\b/.test(t) &&
    !/\bclose-to-lens\b/.test(t);
  const crowdSit = /\b(people|silhouettes|figures|crowd)\b[^.]{0,40}\bsitting\b/.test(t);
  const bodyTurn = /\bthree[-\s]?quarters?\s+(toward|to)\b/.test(t);
  const wantsThreeQ =
    /\b(3\s*\/\s*4|waist[-\s]?up|cowboy shot|medium[-\s]?shot|knee[-\s]?up|knee[-\s]?shot|down to the knees)\b/.test(t) ||
    (/\bthree[-\s]?quarter/.test(t) && !bodyTurn) ||
    (/\b(seated|sitting)\b/.test(t) && !crowdSit);
  if (wantsFull) return "full";
  if (wantsClose && !wantsThreeQ) return "close";
  if (wantsThreeQ) return "three_quarter";
  return "full";
}

function slotPath(row: Character, key: string) {
  const url = row.slots.find((s) => s.key === key)?.url;
  return existingFile(url ? mediaUrlToPath(url) : undefined);
}

/** Slot URL stays as stored. A file named for another character is not this person's plate. */
function ownedSlot(row: Character, key: string) {
  const path = slotPath(row, key);
  if (!path) return undefined;
  const file = path.replace(/\\/g, "/").split("/").pop() || "";
  if (!file.toLowerCase().startsWith(row.id.toLowerCase())) return undefined;
  return path;
}

/** Viggle only. Image 1 is 3/4, else full body. Never the headshot. */
export function viggleBodyPlate(row: Character): { path: string; kind: "3/4" | "full" } | null {
  const threeQ = ownedSlot(row, "three_quarter_body");
  if (threeQ) return { path: threeQ, kind: "3/4" };
  const front = slotPath(row, "front");
  if (front) return { path: front, kind: "full" };
  return null;
}

const PRODUCT_CLOSE =
  /^\s+of\s+(the\s+)?(shoe|sneaker|necklace|chain|logo|bag|watch|ring|product|sku|sole|lace|heel|strap)\b/i;

/** Person-framing close-up → medium 3/4. Product close-ups stay. */
export function rewriteVigglePersonFraming(prompt: string): { text: string; changed: boolean } {
  let changed = false;
  const text = prompt.replace(
    /\b(extreme\s+close[-\s]?up(?:\s+half[-\s]?body(?:\s+shot)?)?|close[-\s]?up(?:\s+half[-\s]?body(?:\s+shot)?)?|e\.?c\.?u\.?|headshot|shoulders[-\s]?up|beauty shot|face only|bust shot)\b/gi,
    (match, _g, offset: number, src: string) => {
      if (PRODUCT_CLOSE.test(src.slice(offset + match.length))) return match;
      changed = true;
      return "medium 3/4 shot, natural head-to-body proportion";
    },
  );
  return { text, changed };
}

export function viggleGeneratePrompt(name: string, operator: string, plate: "3/4" | "full") {
  const { text, changed } = rewriteVigglePersonFraming(operator);
  const plateLine =
    plate === "3/4"
      ? `Image 1 is the 3/4 body plate of @${name}. Keep her face, hair, and head-to-body proportion from this plate.`
      : `Image 1 is the full-body plate of @${name} (no 3/4 still on file). Keep her face and head-to-body proportion. Do not crop to a headshot.`;
  return {
    changed,
    prompt: [
      plateLine,
      "Medium 3/4 framing. Head not larger than the shoulders. Do not copy the plate's clothes, pose, or studio.",
      "Pose, wardrobe, place, and expression follow the operator text.",
      text,
    ].join(" "),
  };
}

/** Generate Image: headshot always Image 1. Image 2 follows prompt crop. Knee-up uses the full front plate so the thighs are in frame. */
export function characterGenerateRefs(row: Character, framing: GenerateFraming, opts?: { legs?: boolean }): StillRefs {
  const face =
    slotPath(row, "headshot") ||
    slotPath(row, "close") ||
    existingFile(row.identityUrl ? mediaUrlToPath(row.identityUrl) : undefined);
  if (framing === "close") return { face };
  const threeQ = ownedSlot(row, "three_quarter_body");
  const front = slotPath(row, "front");
  const body = framing === "full" || opts?.legs ? front || threeQ : framing === "three_quarter" ? threeQ || front : front || threeQ;
  return { face, body: body && body !== face ? body : undefined };
}
