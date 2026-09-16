import fs from "node:fs";
import type { Character } from "./character-types";
import { mediaUrlToPath } from "./paths";

/** Named still inputs. Never pass a 3/4 turnaround as `face`. */
export type StillRefs = {
  face?: string;
  body?: string;
  scene?: string;
};

export type StillKind = "identity" | "restyle" | "bump" | "transform" | "faceswap";

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
  };
}

export function existingFile(p?: string | null): string | undefined {
  if (!p) return undefined;
  return fs.existsSync(p) ? p : undefined;
}

/** Face = identity headshot. Body = turnaround front only — not 3/4 / side / back. */
export function characterStillRefs(row: Character): StillRefs {
  const closeUrl = row.slots.find((s) => s.key === "close")?.url;
  const face = existingFile(closeUrl ? mediaUrlToPath(closeUrl) : undefined)
    || existingFile(row.identityUrl ? mediaUrlToPath(row.identityUrl) : undefined);
  const bodyUrl = row.slots.find((s) => s.key === "front")?.url;
  const body = existingFile(bodyUrl ? mediaUrlToPath(bodyUrl) : undefined);
  return {
    face,
    body: body && body !== face ? body : undefined,
  };
}
