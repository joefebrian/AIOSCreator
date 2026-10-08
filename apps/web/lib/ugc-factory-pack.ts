import { normalizeScriptPack, type FactoryFormatId } from "./ugc-script";

const RECIPE_FORMAT: Record<string, FactoryFormatId> = {
  F01: "proof-first",
  F02: "screen-record",
  F03: "pack-hero",
  F04: "before-after",
  F05: "problem-payoff",
  F06: "comparison",
  F07: "unboxing",
  F08: "whats-in-box",
  F09: "how-to",
  F10: "hands-only",
  F11: "satisfying",
  F12: "test",
  F13: "stop-scroll",
  F14: "restock",
  S01: "slides-discovery",
  S02: "slides-list",
  S03: "slides-story",
  S04: "slides-faq",
  S05: "slides-mistakes",
  S06: "slides-ranking",
  T01: "unbox-talk",
  T02: "hold",
  T03: "talking",
  T04: "lifestyle",
  T05: "i-found-this",
  T06: "comment-reply",
  T07: "review",
  T08: "grwm",
  T09: "beauty-grwm",
  T10: "pov",
  T11: "day-in-life",
  T12: "haul",
  T13: "talking",
};

export function factoryFormatForRecipe(templateId: string) {
  return RECIPE_FORMAT[templateId];
}

/** Last beat end, in seconds. Crybaby's five 6s scenes return 30. */
export function storyboardSeconds(pack?: { beats?: { t?: string }[] }) {
  let end = 0;
  for (const beat of pack?.beats || []) {
    const match = String(beat.t || "").match(/(\d+)\s*-\s*(\d+)\s*s/i);
    if (match) end = Math.max(end, Number(match[2]));
  }
  return end;
}

export const BRIEF_MIN_SEC = 10;
export const BRIEF_MAX_SEC = 30;

/** Jev picks the length. The engine only keeps it inside 10–30 seconds. */
export function clampBriefDuration(value: number) {
  const seconds = Math.round(Number(value));
  if (!Number.isFinite(seconds)) return BRIEF_MIN_SEC;
  return Math.min(BRIEF_MAX_SEC, Math.max(BRIEF_MIN_SEC, seconds));
}

/** Stored Jev estimate, clamped. Zero means Jev has not chosen yet. */
export function variantDurationSec(variant: { durationSec?: number }) {
  const seconds = Math.round(Number(variant.durationSec));
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return clampBriefDuration(seconds);
}

/** Whole seconds inside Jev's total. Longer lines get more. The parts add up to that total. */
export function fitBeatMs(durationSec: number, spoken: string[]) {
  const total = clampBriefDuration(durationSec);
  const lines = spoken.length ? spoken : [""];
  const need = lines.map((line) => {
    const estimate = estimateSpokenSec(line || "");
    return estimate <= 0 ? 1 : estimate / MAX_NATURAL_TEMPO;
  });
  const minEach = need.map((sec) => Math.max(1, Math.ceil(sec - 1e-9)));
  const minSum = minEach.reduce((sum, value) => sum + value, 0);
  const seconds = minSum <= total ? minEach.slice() : shareSeconds(total, need);
  if (minSum <= total) {
    let extra = total - minSum;
    const order = seconds.map((_, index) => index).sort((a, b) => need[b] - need[a] || a - b);
    let cursor = 0;
    while (extra > 0) {
      seconds[order[cursor % order.length]] += 1;
      extra -= 1;
      cursor += 1;
    }
  }
  return seconds.map((value) => value * 1000);
}

function shareSeconds(total: number, need: number[]) {
  const weightSum = need.reduce((sum, value) => sum + value, 0) || 1;
  const seconds = need.map((value) => Math.max(1, Math.round((total * value) / weightSum)));
  let drift = seconds.reduce((sum, value) => sum + value, 0) - total;
  while (drift > 0) {
    let idx = -1;
    let best = -Infinity;
    seconds.forEach((value, index) => {
      if (value <= 1) return;
      const score = value - 1 - need[index];
      if (score > best) {
        best = score;
        idx = index;
      }
    });
    if (idx < 0) break;
    seconds[idx] -= 1;
    drift -= 1;
  }
  while (drift < 0) {
    seconds[seconds.length - 1] += 1;
    drift += 1;
  }
  return seconds;
}

export function beatTargetMs(durationSec: number, beatCount: number) {
  if (beatCount < 1) return 0;
  return Math.round((durationSec * 1000) / beatCount);
}

/** Measured Malay neural speech on the Crybaby lines lands near 11 characters a second. */
export const SPOKEN_CHARS_PER_SEC = 11;
/** Above this, speeding the line up is no longer natural speech. */
export const MAX_NATURAL_TEMPO = 1.12;

export function estimateSpokenSec(text: string) {
  const chars = text.replace(/\s+/g, " ").trim().length;
  if (!chars) return 0;
  return chars / SPOKEN_CHARS_PER_SEC;
}

/** Smallest whole-second total that lets every line be spoken without speeding it up. */
export function spokenDurationFloorSec(spoken: string[]) {
  return (spoken.length ? spoken : [""]).reduce((sum, line) => {
    const estimate = estimateSpokenSec(line || "");
    if (estimate <= 0) return sum;
    return sum + Math.max(1, Math.ceil(estimate / MAX_NATURAL_TEMPO - 1e-9));
  }, 0);
}

/** A line that does not fit is a script or timing problem. Do not speed the approved wording. */
export function spokenLineFit(text: string, sceneSec: number) {
  const estimateSec = estimateSpokenSec(text);
  const scene = sceneSec > 0 ? sceneSec : 0;
  const ok = !text.trim() || estimateSec <= scene * MAX_NATURAL_TEMPO;
  return { ok, estimateSec, sceneSec: scene };
}

export function spokenLineFitError(text: string, sceneSec: number) {
  const fit = spokenLineFit(text, sceneSec);
  if (fit.ok) return "";
  return `Spoken line is about ${fit.estimateSec.toFixed(1)}s and this scene is ${fit.sceneSec}s. Shorten the line or give the scene more time. Approved wording is not sped up.`;
}

export type StoryboardCut = {
  index: number;
  durationSec: number;
  spoken: string;
  overlay: string;
  goal: string;
  visual: string;
  shot?: string;
};

/** One cut per approved beat. Duration is that beat's length, not the sum. */
export function storyboardCuts(pack?: { beats?: { t?: string; spoken?: string; visual?: string; overlay?: string; goal?: string; shot?: string }[] }): StoryboardCut[] {
  return (pack?.beats || []).map((beat, i) => {
    const match = String(beat.t || "").match(/(\d+)\s*-\s*(\d+)\s*s/i);
    const durationSec = match ? Math.max(1, Number(match[2]) - Number(match[1])) : 6;
    return {
      index: i + 1,
      durationSec,
      spoken: beat.spoken || "",
      overlay: beat.overlay || "",
      goal: beat.goal || "",
      visual: beat.visual || "",
      shot: beat.shot || "",
    };
  });
}

type ApprovedScene = { index: number; goal: string; spoken: string; overlay: string; targetMs?: number; shot?: string; voiceover?: string };

function sceneVisual(scene: ApprovedScene) {
  return [scene.goal, scene.overlay].filter(Boolean).join(". ");
}

export function scriptPackFromApproved(variant: { productTitle: string; templateId: string; platform: string; script?: { cta: string; scenes: ApprovedScene[] } }) {
  const script = variant.script;
  if (!script?.scenes.length) return undefined;
  const scenes = script.scenes.slice().sort((a, b) => a.index - b.index);
  let cursor = 0;
  const beats = scenes.map((scene) => {
    const start = Math.round(cursor / 1000);
    cursor += scene.targetMs || 6000;
    const end = Math.round(cursor / 1000);
    return {
      t: `${start}-${end}s`,
      spoken: scene.voiceover || scene.spoken,
      visual: sceneVisual(scene),
      goal: scene.goal,
      overlay: scene.overlay,
      shot: scene.shot || "",
    };
  });
  const last = scenes[scenes.length - 1];
  return normalizeScriptPack({
    title: variant.productTitle,
    format: variant.templateId,
    hook: scenes[0]?.spoken || "",
    hookVisual: scenes[0] ? sceneVisual(scenes[0]) : "",
    beats,
    cta: script.cta || last?.spoken || "",
    ctaVisual: last ? sceneVisual(last) : "",
    platforms: [variant.platform],
  });
}
