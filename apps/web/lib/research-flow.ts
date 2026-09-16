/** Client-safe video → prompt procedure. Server uses the same window rules. */

export const RESEARCH_VIDEO = {
  minSec: 2,
  sweetSec: 8,
  maxFullSec: 15,
  maxExtractSec: 30,
  maxFrames: 8,
  uploadMb: 120,
} as const;

export const RESEARCH_URL_EXTS = ".mp4 .webm .mov .jpg .jpeg .png .webp";

export const RESEARCH_EVENT = "creatoros-research";

export type ResearchExtractRow = {
  id: string;
  url: string;
  kind: "image" | "video";
  imagePrompt: string;
  motionPrompt: string;
  firstFrameUrl?: string;
  model: string;
  tokens: number;
  durationSec?: number;
  windowSec?: number;
  trimmed?: boolean;
  tooShort?: boolean;
  note?: string;
  megaPrompt?: string;
  createdAt: string;
};

export function extractFrameCount(durationSec: number) {
  const d = Math.max(0, durationSec);
  if (d <= 6) return 3;
  if (d <= 12) return 4;
  if (d <= 20) return 5;
  if (d <= 30) return 6;
  if (d <= 45) return 7;
  return RESEARCH_VIDEO.maxFrames;
}

export function videoWindow(durationSec: number) {
  const d = Math.max(0, durationSec);
  if (d > RESEARCH_VIDEO.maxExtractSec) {
    return {
      start: 0,
      length: RESEARCH_VIDEO.maxExtractSec,
      trimmed: true,
      tooShort: false,
    };
  }
  return {
    start: 0,
    length: d,
    trimmed: false,
    tooShort: d > 0 && d < RESEARCH_VIDEO.minSec,
  };
}

export function formatSec(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "—";
  return n < 10 ? `${n.toFixed(1)}s` : `${Math.round(n)}s`;
}

export function videoProcedureNote(opts: {
  durationSec: number;
  windowSec: number;
  trimmed: boolean;
  tooShort: boolean;
}) {
  const dur = formatSec(opts.durationSec);
  if (opts.tooShort) {
    return `${dur} clip — under ${RESEARCH_VIDEO.minSec}s. Motion line will be thin.`;
  }
  if (opts.trimmed) {
    return `${dur} clip — longer than ${RESEARCH_VIDEO.maxExtractSec}s, so the checklist covers the first ${formatSec(opts.windowSec)}.`;
  }
  return `${dur} clip — checklist covers the full ${formatSec(opts.windowSec)}.`;
}
