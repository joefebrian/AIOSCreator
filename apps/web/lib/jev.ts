import { jevConfig } from "./providers";

export const JEV_MODEL = "typesafe/jev-1.13";
const DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";

export type JevNoulQ = {
  type: "noul";
  instructions: string;
  criteria?: { true: string; false: string };
};
export type JevChoiceQ = {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
};
export type JevScoreQ = {
  type: "score";
  instructions: string;
  criteria: Record<string, string>;
};
export type JevQuestion = JevNoulQ | JevChoiceQ | JevScoreQ;

export type JevAnswer =
  | { type: "noul"; noul: number }
  | { type: "choice"; choice: string; scores?: Record<string, number> }
  | { type: "score"; score: string | number };

export type JevResult = {
  model: string;
  answers: Record<string, JevAnswer>;
  usage?: { input_tokens?: number; output_tokens?: number; cost?: number };
};

export async function jevDecide(state: unknown, questions: Record<string, JevQuestion>): Promise<JevResult> {
  const { apiKey, model } = jevConfig();
  if (!apiKey) throw new Error("OpenRouter key missing for Jev");
  let res: Response;
  try {
    res = await fetch(DECISIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "CreatorOS",
      },
      body: JSON.stringify({ model, state, questions }),
      signal: AbortSignal.timeout(60000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : "";
    throw new Error(cause ? `${message} (${cause})` : message);
  }
  const json = (await res.json().catch(() => ({}))) as JevResult & { error?: { message?: string } | string };
  if (!res.ok) {
    const msg = typeof json.error === "string" ? json.error : json.error?.message || `Jev HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

export async function probeJev() {
  try {
    const r = await jevDecide("CreatorOS UGC Factory is a local video pipeline.", {
      alive: {
        type: "noul",
        instructions: "Is the state describing a live software system?",
        criteria: { true: "A running app or pipeline", false: "Unrelated or empty" },
      },
    });
    const noul = r.answers?.alive && r.answers.alive.type === "noul" ? r.answers.alive.noul : undefined;
    return { ok: true, model: r.model || JEV_MODEL, noul, usage: r.usage };
  } catch (err) {
    return { ok: false, model: JEV_MODEL, error: err instanceof Error ? err.message : String(err) };
  }
}

/** True when the photo instruction would erase a brand printed on the product, not shop overlay text. */
export async function jevPhotoTextGate(state: { title?: string; brand?: string; instruction: string }) {
  const r = await jevDecide(
    {
      title: state.title || "",
      brand: state.brand || "",
      instruction: state.instruction,
      rule: "Extra text means shop overlay only: prices, discount banners, star ratings, marketplace watermarks, captions beside the product. A brand name, logo, or label printed on the product is not extra text.",
    },
    {
      strips_brand: {
        type: "noul",
        instructions: "Would following the instruction remove a brand name, logo, or label that is part of the product itself?",
        criteria: {
          true: "The instruction targets the product brand, logo, or on-product label",
          false: "The instruction only targets shop overlay text, or does not remove on-product brand text",
        },
      },
    },
  );
  const noul = r.answers.strips_brand?.type === "noul" ? r.answers.strips_brand.noul : 0;
  return { stripsBrand: noul >= 0.5, noul, model: r.model || JEV_MODEL };
}

export async function jevScriptGate(state: { product?: string; format?: string; hook?: string; cta?: string }) {
  const r = await jevDecide(state, {
    invented_claim: {
      type: "noul",
      instructions: "Does the hook or CTA invent results, numbers, medical claims, or guarantees not present in the product state?",
      criteria: {
        true: "Invented or unverifiable claim",
        false: "Stays inside given product facts",
      },
    },
    speak_price: {
      type: "noul",
      instructions: "Should the voiceover speak a price out loud?",
      criteria: {
        true: "Price is in the state and helps the hook",
        false: "No price, or price should stay on-screen only",
      },
    },
  });
  const invented = r.answers.invented_claim?.type === "noul" ? r.answers.invented_claim.noul : 0;
  const speakPrice = r.answers.speak_price?.type === "noul" ? r.answers.speak_price.noul : 0;
  return { inventedClaim: invented, speakPrice, model: r.model };
}

export function durationChoices(minSec = 10, maxSec = 30) {
  const min = Math.max(10, Math.min(30, Math.round(minSec)));
  const max = Math.max(min, Math.min(30, Math.round(maxSec)));
  const criteria: Record<string, string> = {};
  for (let sec = min; sec <= max; sec++) {
    criteria[String(sec)] = sec === min
      ? `${sec} seconds, the shortest cut these lines can finish`
      : sec === max
        ? `${sec} seconds, the longest allowed cut`
        : `${sec} seconds at a natural speaking pace`;
  }
  return criteria;
}

function durationFromAnswer(answer: JevAnswer | undefined, min = 10, max = 30) {
  const choice = answer && answer.type === "choice" ? answer.choice : "";
  const seconds = Math.round(Number(choice));
  if (!Number.isFinite(seconds)) throw new Error("Jev did not choose a duration.");
  if (seconds >= min && seconds <= max) return seconds;
  if (seconds >= 10 && seconds <= 30) return Math.min(max, Math.max(min, seconds));
  throw new Error("Jev did not choose a duration.");
}

/** Total runtime. Choices start at the shortest length the lines can finish, and stop at 30. */
export async function jevDuration(opts: { state: Record<string, unknown>; minSec?: number; maxSec?: number }) {
  const minSec = Math.max(10, Math.min(30, Math.round(opts.minSec || 10)));
  const maxSec = Math.max(minSec, Math.min(30, Math.round(opts.maxSec || 30)));
  const r = await jevDecide(opts.state, {
    duration: {
      type: "choice",
      instructions: `Estimate the total runtime in whole seconds so every spoken line in the state fits at a natural pace. The shortest length that fits is ${minSec}. The ceiling is ${maxSec}. Pick ${minSec} unless a longer listed length is clearly better. Do not pick a length the lines cannot finish. A number written inside the brief is not a preset.`,
      criteria: durationChoices(minSec, maxSec),
    },
  });
  return durationFromAnswer(r.answers?.duration, minSec, maxSec);
}

/** Angle plus runtime. Jev does not write the brief. */
export async function jevBriefDecision(opts: {
  state: Record<string, unknown>;
  criteria: Record<string, string>;
}) {
  const r = await jevDecide(opts.state, {
    pick: {
      type: "choice",
      instructions: "Pick the angle most likely to stop a scroll on this platform and market. Choose only from the listed angles. Do not write new copy.",
      criteria: opts.criteria,
    },
    duration: {
      type: "choice",
      instructions: "Estimate the total runtime in whole seconds for the picked angle at a natural speaking pace. The floor is 10 and the ceiling is 30. Pick the shortest length that still fits. Do not prefer 15 or 30 just because they are round.",
      criteria: durationChoices(),
    },
  });
  const answer = r.answers?.pick;
  const choice = answer && answer.type === "choice" ? answer.choice : "";
  if (!opts.criteria[choice]) throw new Error("Jev did not choose.");
  return { choice, durationSec: durationFromAnswer(r.answers?.duration) };
}

/** One angle. Jev does not write the brief. */
export async function jevChoose(opts: {
  state: Record<string, unknown>;
  instructions: string;
  criteria: Record<string, string>;
}) {
  const r = await jevDecide(opts.state, {
    pick: { type: "choice", instructions: opts.instructions, criteria: opts.criteria },
  });
  const answer = r.answers?.pick;
  const choice = answer && answer.type === "choice" ? answer.choice : "";
  if (!opts.criteria[choice]) throw new Error("Jev did not choose.");
  return choice;
}
