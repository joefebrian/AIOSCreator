/** Native audiovisual scene contract. Safe to import from the factory editor. */

export type SceneDelivery = "CREATOR_SPEAKS" | "VOICEOVER" | "SILENT";

export type CreatorLook = {
  presentation: "woman" | "man";
  age: "20s" | "30s";
  hair: string;
  skin: string;
  wardrobe: string;
};

export const CREATOR_HAIR = [
  "short black hair",
  "short dark-brown hair",
  "shoulder-length black hair",
  "shoulder-length dark-brown hair",
  "long black hair",
  "long dark-brown hair",
  "black hair tied back",
  "dark-brown hair tied back",
] as const;

export const CREATOR_SKIN = ["light skin", "light-medium skin", "medium skin", "deep skin"] as const;

export const CREATOR_WARDROBE = ["a plain light top", "a plain dark top", "a white t-shirt", "a black t-shirt"] as const;

export function parseCreatorLook(input: Partial<CreatorLook> | null | undefined): CreatorLook {
  const presentation = input?.presentation;
  const age = input?.age;
  const hair = (input?.hair || "").trim();
  const skin = (input?.skin || "").trim();
  const wardrobe = (input?.wardrobe || "").trim();
  if (presentation !== "woman" && presentation !== "man") throw new Error("Choose woman or man.");
  if (age !== "20s" && age !== "30s") throw new Error("Choose an adult age range.");
  if (!(CREATOR_HAIR as readonly string[]).includes(hair)) throw new Error("Choose a hair option.");
  if (!(CREATOR_SKIN as readonly string[]).includes(skin)) throw new Error("Choose a skin option.");
  if (!(CREATOR_WARDROBE as readonly string[]).includes(wardrobe)) throw new Error("Choose one outfit.");
  return { presentation, age, hair, skin, wardrobe };
}

const COUNTRY_FACE: Record<string, string> = {
  MY: "Malaysian appearance",
  ID: "Indonesian appearance",
  SG: "Singaporean appearance",
  TH: "Thai appearance",
  US: "American appearance",
};

/** Look plus the target market. The face is not locked to a plate and is not the source creator. */
export function creatorLookSentence(look: CreatorLook, market?: string | null) {
  const country = COUNTRY_FACE[(market || "").toUpperCase()] || "";
  return `One ${look.presentation} in their ${look.age}, ${look.hair}, ${look.skin}, wearing ${look.wardrobe}. ${country ? `${country}. ` : ""}The face is not locked to a reference photo and may vary between scenes. The clothes stay the same. This person is not the source creator.`;
}
export type AudioStrategy = "NATIVE_AUDIO" | "EXTERNAL_TTS";

export type NativeAudioSupport = "verified" | "unverified";

export type RenderModelCapability = {
  id: string;
  label: string;
  nativeAudio: NativeAudioSupport;
  durationSec: [number, number];
  acceptsVoiceId: false;
  issue: string;
};

/** What the current adapters actually send. Public product pages are not this record. */
export const FACTORY_RENDER_MODELS: RenderModelCapability[] = [
  {
    id: "wan-3-0",
    label: "Wan 3.0 Prime",
    nativeAudio: "verified",
    durationSec: [2, 30],
    acceptsVoiceId: false,
    issue: "",
  },
  {
    id: "wan-3-0-std",
    label: "Wan 3.0",
    nativeAudio: "verified",
    durationSec: [2, 30],
    acceptsVoiceId: false,
    issue: "",
  },
  {
    id: "seedance-2-5",
    label: "Seedance 2.5",
    nativeAudio: "unverified",
    durationSec: [4, 30],
    acceptsVoiceId: false,
    issue: "The Higgsfield Seedance adapter sends a prompt, seconds, size, and a still. It does not set an audio parameter, so native speech is not verified on this path.",
  },
];

export function renderModel(id: string) {
  return FACTORY_RENDER_MODELS.find((row) => row.id === id) || null;
}

export function legacyDelivery(beat: { spoken?: string | null; speechDelivery?: string | null; audioMode?: string | null }): SceneDelivery {
  if (beat.speechDelivery === "CREATOR_SPEAKS" || beat.speechDelivery === "VOICEOVER" || beat.speechDelivery === "SILENT") return beat.speechDelivery;
  if (!(beat.spoken || "").trim()) return "SILENT";
  if ((beat.audioMode || "").startsWith("creator-led")) return "CREATOR_SPEAKS";
  return "VOICEOVER";
}

/** A planning estimate from words and pauses. It is not a measured voice take. */
export function estimateSpeechSec(text: string, delivery: SceneDelivery) {
  const spoken = text.replace(/\s+/g, " ").trim();
  if (delivery === "SILENT" || !spoken) return 0;
  const words = spoken.split(" ").filter(Boolean).length;
  const rate = delivery === "CREATOR_SPEAKS" ? 2.3 : 2.5;
  const pauses = (spoken.match(/[.!?,]/g) || []).length * 0.15;
  return Math.round((words / rate + pauses) * 10) / 10;
}

export function deliveryLabel(delivery: SceneDelivery) {
  if (delivery === "CREATOR_SPEAKS") return "Creator speaks";
  if (delivery === "VOICEOVER") return "Voiceover";
  return "Silent";
}

export type CompiledSceneRequest = {
  modelId: string;
  audio: true;
  durationSec: number;
  ratio: "9:16";
  prompt: string;
  spoken: string | null;
  delivery: SceneDelivery;
};

/** Maps one scene onto the Wan request this app already sends. No TTS voice id is included. */
export function compileNativeScene(input: {
  modelId: string;
  locale: string;
  voiceDirection?: string | null;
  creatorLook?: string | null;
  scene: {
    spoken: string | null;
    delivery: SceneDelivery;
    performance?: string | null;
    action: string;
    targetStart: number;
    targetEnd: number;
  };
}): { ok: true; request: CompiledSceneRequest } | { ok: false; issue: string } {
  const model = renderModel(input.modelId);
  if (!model) return { ok: false, issue: "That model is not a configured factory video adapter." };
  if (model.nativeAudio !== "verified") return { ok: false, issue: model.issue };
  const duration = Math.round((input.scene.targetEnd - input.scene.targetStart) * 10) / 10;
  if (duration < model.durationSec[0] || duration > model.durationSec[1]) {
    return { ok: false, issue: `${model.label} accepts ${model.durationSec[0]}–${model.durationSec[1]}s. This scene is ${duration}s.` };
  }
  const spoken = input.scene.delivery === "SILENT" ? null : (input.scene.spoken || "").replace(/\s+/g, " ").trim() || null;
  if (input.scene.delivery !== "SILENT" && !spoken) return { ok: false, issue: "This scene has no spoken words. Mark it Silent or write the line." };
  const speech = input.scene.delivery === "CREATOR_SPEAKS"
    ? `The visible generated adult speaks these exact words, with mouth movement that matches them: "${spoken}".`
    : input.scene.delivery === "VOICEOVER"
      ? `Off-screen narration says these exact words: "${spoken}". The visible person's mouth stays closed and does not speak the narration.`
      : "No spoken words and no narration. Ambient sound may remain.";
  const prompt = [
    input.creatorLook || "One generated adult. No face is locked.",
    `Vertical 9:16 UGC. Spoken language ${input.locale}. Target ${input.scene.targetStart.toFixed(1)}–${input.scene.targetEnd.toFixed(1)}s.`,
    `Visual action: ${input.scene.action}`,
    speech,
    input.scene.performance ? `Performance: ${input.scene.performance}` : "",
    input.voiceDirection ? `Voice direction: ${input.voiceDirection}` : "",
    "The source creator is not the speaker. Do not attach an external TTS voice id.",
  ].filter(Boolean).join(" ");
  return {
    ok: true,
    request: { modelId: model.id, audio: true, durationSec: duration, ratio: "9:16", prompt, spoken, delivery: input.scene.delivery },
  };
}
