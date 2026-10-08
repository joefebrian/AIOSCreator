/** Pure scene checks shared by the factory editor and the approval gate. */

const TESTIMONY = /\b(glowing|glowy|my skin|i have been|huge fan|i am a fan|dulu|pernah pakai)\b/i;

export const FACTORY_VOICE_IDS = [
  "en-US-AriaNeural",
  "en-SG-LunaNeural",
  "ms-MY-YasminNeural",
  "id-ID-GadisNeural",
  "th-TH-PremwadeeNeural",
  "ja-JP-NanamiNeural",
] as const;

export type FactoryVoiceId = (typeof FACTORY_VOICE_IDS)[number];

export function isFactoryVoice(value: string): value is FactoryVoiceId {
  return (FACTORY_VOICE_IDS as readonly string[]).includes(value);
}

function words(value: string) {
  return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3));
}

/** A caption needs a human look when it carries source testimony or does not follow the spoken line. Silence is not a caption error. */
export function captionNeedsReview(spoken: string, caption: string, sourceSpeech = "") {
  const said = spoken.replace(/\s+/g, " ").trim();
  const shown = caption.replace(/\s+/g, " ").trim();
  if (TESTIMONY.test(`${said}\n${shown}`)) return true;
  if (!shown || !said) return false;
  const sample = shown.toLowerCase();
  const source = sourceSpeech.toLowerCase();
  if (source && sample.length > 8 && source.includes(sample) && !said.toLowerCase().includes(sample.slice(0, 18))) return true;
  const captionWords = [...words(shown)];
  const spokenWords = words(said);
  return captionWords.length > 0 && captionWords.every((word) => !spokenWords.has(word));
}

export function interiorFrameSec(startSec: number, endSec: number) {
  const span = Math.max(0, endSec - startSec);
  if (span <= 0.4) return Math.round((startSec + span / 2) * 1000) / 1000;
  const offset = Math.min(span * 0.45, span - 0.15);
  return Math.round((startSec + offset) * 1000) / 1000;
}

export function referenceFrameFile(mediaFileId: string, analysisVersion: number, startSec: number, endSec: number) {
  const start = Math.round(startSec * 1000);
  const end = Math.round(endSec * 1000);
  return `${mediaFileId}/v${analysisVersion}-${start}-${end}.jpg`;
}

export function referenceFrameUrl(mediaUrl: string | null, analysisVersion: number | null, startSec?: number | null, endSec?: number | null) {
  const file = mediaUrl?.split("/").pop()?.replace(/\.[a-z0-9]+$/i, "") || "";
  if (!file || analysisVersion == null || startSec == null || endSec == null) return "";
  return `/api/media/ugc-reference-frames/${referenceFrameFile(file, analysisVersion, startSec, endSec)}`;
}
