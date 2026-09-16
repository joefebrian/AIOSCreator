import type { SlotGroup, SlotKey } from "./character-prompts";

export type CharacterSource = "photo" | "transform" | "prompt";

export type CharacterEdit = {
  id: string;
  url: string;
  prompt: string;
  baseUrl: string;
  mode: string;
  upscaled?: boolean;
  url4k?: string;
  jobId?: string;
  model?: string;
  provider?: string;
  createdAt?: string;
};

export type CharacterSlot = {
  key: SlotKey;
  label: string;
  group: SlotGroup;
  prompt: string;
  url: string | null;
  jobId?: string;
  upscaled?: boolean;
  url4k?: string | null;
};

export type CharacterLook = {
  hair: string;
  face: string;
  body: string;
  /** From generator prompt. Under 18 → SFW only, no Adult 18+ chips. */
  age?: number;
};

export function isMinorLook(look?: CharacterLook | null) {
  return typeof look?.age === "number" && look.age < 18;
}

/** Per-character moodboard. Pose/lighting refs — not a second identity. */
export type CharacterInspiration = {
  url: string;
  kind: "image" | "video";
  addedAt: string;
  label?: string;
};

export type Character = {
  id: string;
  name: string;
  source: CharacterSource;
  sourcePrompt?: string;
  sourceUrl?: string | null;
  look?: CharacterLook;
  identityUrl: string | null;
  identityUrl4k?: string | null;
  identityJobId?: string;
  identityUpscaled?: boolean;
  slots: CharacterSlot[];
  edits?: CharacterEdit[];
  inspiration?: CharacterInspiration[];
  visibility?: "private" | "public";
  socialAccounts?: {
    platform: "tiktok" | "instagram" | "youtube" | "threads" | "x" | "pinterest";
    handle?: string;
    followers?: number;
    status: "connected" | "coming";
  }[];
  createdAt: string;
  updatedAt: string;
};
