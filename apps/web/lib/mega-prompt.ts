import { RESEARCH_VIDEO } from "./research-flow";

export type MegaBeat = { start: number; end: number; beat: string };

export type MegaChecklist = {
  imagePrompt: string;
  motionPrompt: string;
  durationSec: number;
  kind: "image" | "video";
  singing?: boolean;
  speaking?: boolean;
  lipSync?: string;
  performance?: MegaBeat[] | string;
  camera?: string;
  audio?: string;
  negative?: string;
};

function clampDur(n?: number) {
  const d = Number(n);
  if (!Number.isFinite(d) || d <= 0) return RESEARCH_VIDEO.sweetSec;
  return Math.min(RESEARCH_VIDEO.maxExtractSec, Math.max(RESEARCH_VIDEO.minSec, Math.round(d * 10) / 10));
}

function sec(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function defaultBeats(dur: number, motion: string): MegaBeat[] {
  const a = Math.round((dur / 3) * 10) / 10;
  const b = Math.round((dur * 2) / 3 * 10) / 10;
  const line = motion.replace(/\s+/g, " ").trim() || "small naturalistic motion matching the still";
  return [
    { start: 0, end: a, beat: `Settle into the still. ${line}. Tiny breath. No large gesture.` },
    { start: a, end: b, beat: `Continue the same action. Weight shift in the torso. Hands stay in frame.` },
    { start: b, end: dur, beat: `Ease to a hold matching the last sampled frame. Eyes alive, body quiet.` },
  ];
}

function beatsToLines(beats: MegaBeat[]) {
  return beats.map((x) => `${sec(x.start)}-${sec(x.end)}s ${x.beat.replace(/\s+/g, " ").trim()}`).join("\n");
}

/** Local. No LLM. Turns VL checklist + notes into the mega sheet. Video only. */
export function formatMegaChecklist(input: MegaChecklist): string {
  if (input.kind !== "video") return "";
  const dur = clampDur(input.durationSec);
  const singing = input.singing ?? /sing|vocal|lyric|karaoke|microphone/i.test(`${input.imagePrompt} ${input.motionPrompt} ${input.lipSync || ""}`);
  const speaking = input.speaking ?? /speak|talk|lip.?sync|dialogue/i.test(`${input.imagePrompt} ${input.motionPrompt} ${input.lipSync || ""}`);
  const lip =
    (input.lipSync || "").trim() ||
    (singing
      ? "She is singing live to the attached audio. Mouth shapes follow that audio, not generic talking. Jaw opens with each vowel and closes fully on M, B and P. Lips round on O and U, spread on E and I. Between phrases the mouth rests closed. It never chews, never flaps, and never keeps moving after the vocal stops."
      : speaking
        ? "Mouth shapes follow the attached audio. Close fully on M, B and P. Rest closed between phrases. No chewing, no flapping after speech stops."
        : "No speech. Mouth stays natural and mostly closed. No chewing, no talking, no singing.");
  let performance = "";
  if (Array.isArray(input.performance) && input.performance.length) {
    performance = beatsToLines(input.performance);
  } else if (typeof input.performance === "string" && input.performance.trim()) {
    performance = input.performance.trim();
  } else {
    performance = beatsToLines(defaultBeats(dur, input.motionPrompt || ""));
  }
  const camera =
    (input.camera || "").trim() ||
    "Locked-off static frame, tripod steady, no push, no pan, no zoom, no rack focus. Shallow depth of field holding the face sharp.";
  const audio =
    (input.audio || "").trim() ||
    "The attached clip audio only, plus faint room tone. No added music, no crowd.";
  const negative =
    (input.negative || "").trim() ||
    "lip movement out of sync with the audio, mouth moving during silence, exaggerated cartoon mouth, chewing motion, teeth clipping through lips, face morphing, changing hairstyle, changing clothing, extra fingers, deformed hands, duplicated person, camera shake, handheld wobble, zoom, slow motion, on-screen text, watermark, subtitles, plastic skin, beauty filter, standing up, leaving frame, dancing, large gestures, altered neckline, revealing clothing not in the still";

  return [
    "Follow the attached reference image exactly for the subject, face, wardrobe, hair, props and the entire set. Do not restyle, re-light or re-dress anything. This prompt controls performance and motion only.",
    "",
    `Single continuous ${sec(dur)}-second take, 9:16 vertical, no cuts.`,
    "",
    `LIP SYNC: ${lip}`,
    "",
    "PERFORMANCE, in order:",
    performance,
    "",
    "Everything stays small. Quiet take, not a stage show. No pointing, no dancing, no walking out of frame.",
    "",
    `CAMERA: ${camera}`,
    "",
    `AUDIO: ${audio}`,
    "",
    `NEGATIVE: ${negative}`,
  ].join("\n");
}
