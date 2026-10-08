import { logCloudUsage } from "./cloud-usage";
import { openRouterTidyConfig } from "./llm";
import { assertSpendAllowed } from "./spend-cap";

/** Pinned caption model. Does not change the saved prompt-revamp or tidy model. */
export const CAPTION_GLM = "z-ai/glm-4.7-flash";

const IN_PER_TOKEN = 0.0000000605;
const OUT_PER_TOKEN = 0.0000004;

const LIMITS: Record<string, number> = {
  x: 280,
  pinterest: 500,
  instagram: 400,
  threads: 500,
  tiktok: 300,
  youtube: 400,
};

export function captionLimit(platform: string) {
  return LIMITS[platform.toLowerCase()] || 400;
}

function stillNote(prompt: string) {
  const cut = prompt.replace(/<think>[\s\S]*?<\/think>/gi, " ").replace(/\bavoid\b[:\s][\s\S]*$/i, " ");
  return cut.replace(/\s+/g, " ").trim().slice(0, 900);
}

const PRODUCTION = /\b(cameras?|lenses?|f-?stops?|shutter|\bISO\b|avoid|prompts?|image\s*[12]|body plate|shots?)\b/i;

function cleanCaption(raw: string, limit: number) {
  let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, " ").replace(/```/g, " ").replace(/\s+/g, " ").trim();
  text = text.replace(/^(caption|script)\s*:\s*/i, "").replace(/^["“]|["”]$/g, "").trim();
  const kept = text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter((part) => part && !PRODUCTION.test(part));
  text = kept.join(" ").trim();
  if (text.length <= limit) return text;
  const cut = text.slice(0, limit);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (stop > limit * 0.6) return cut.slice(0, stop + 1).trim();
  return cut.trim();
}

function safeError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.replace(/sk-[A-Za-z0-9_-]+/g, "sk-…").slice(0, 180);
}

function logFail(baseURL: string, error: string, ms: number) {
  logCloudUsage({
    at: new Date().toISOString(),
    accountId: "openrouter",
    providerId: "openrouter",
    model: CAPTION_GLM,
    ok: false,
    ms,
    baseURL,
    kind: "caption",
    actualUsd: 0,
    error,
  });
}

/**
 * Rewrite the Add to publish caption. Uses the saved OpenRouter key and a pinned GLM,
 * with reasoning off so a caption does not spend thinking tokens.
 */
export async function revampPublishCaption(input: {
  platform?: string;
  characterName?: string;
  caption?: string;
  prompt?: string;
}) {
  const platform = (input.platform || "pinterest").toLowerCase();
  const limit = captionLimit(platform);
  const draft = (input.caption || "").replace(/\s+/g, " ").trim().slice(0, 2000);
  const note = stillNote(input.prompt || "");
  if (!draft && !note) {
    throw new Error("Nothing to revamp. Write a caption, or open a still that has a prompt.");
  }
  const name = (input.characterName || "").replace(/\s+/g, " ").trim().slice(0, 80);
  const cfg = openRouterTidyConfig();
  assertSpendAllowed({ model: CAPTION_GLM, tokens: 1200 });
  const started = Date.now();
  const system = `You write one social caption for a fashion still. Return the caption only. No title, no quotes, no markdown.
Platform: ${platform}. Stay at or under ${limit} characters.
Character: ${name || "the person in the still"}. Use that name at most once. Do not invent another person.
If a draft is present, revamp that draft into a caption. Keep its facts and its language.
If the draft is empty, write from the still note. The note is a photoshoot description. Keep the visible moment: pose, clothes, and place. Do not paste the note.
If both are present, the draft wins. Use the still note only to stay on the same moment.
Do not mention cameras, lenses, plates, shots, Image 1, Image 2, prompts, AI, or the words avoid, negative, f-stop, shutter, ISO.
Do not invent prices, discounts, sizes, or results that are not in the draft.
No hashtag pile. At most two hashtags, and only on TikTok or Instagram.
One caption. Spoken and short.`;
  const user = `Draft:\n${draft || "(empty)"}\n\nStill note:\n${note || "(none)"}`;
  let text = "";
  let inputTokens = 0;
  let outputTokens = 0;
  for (let attempt = 0; attempt < 2 && !text; attempt++) {
    const messages = [
      { role: "system", content: system },
      { role: "user", content: attempt === 0 ? user : `${user}\n\nRewrite again. The last try mentioned how the photo was made. Describe only the person, the clothes, and the place.` },
    ];
    const payload = await askCaption(cfg, messages, started);
    inputTokens += payload.usage?.prompt_tokens || 0;
    outputTokens += payload.usage?.completion_tokens || 0;
    text = cleanCaption(payload.choices?.[0]?.message?.content || "", limit);
  }
  const tokens = inputTokens + outputTokens;
  const actualUsd = Math.round((inputTokens * IN_PER_TOKEN + outputTokens * OUT_PER_TOKEN) * 1_000_000) / 1_000_000;
  logCloudUsage({
    at: new Date().toISOString(),
    accountId: "openrouter",
    providerId: "openrouter",
    model: CAPTION_GLM,
    ok: Boolean(text),
    ms: Date.now() - started,
    baseURL: cfg.baseURL,
    kind: "caption",
    tokens,
    units: tokens,
    unit: "token",
    actualUsd,
    error: text ? undefined : "empty caption",
  });
  if (!text) throw new Error("GLM returned an empty caption.");
  return { caption: text, model: CAPTION_GLM };
}

async function askCaption(
  cfg: { apiKey: string; baseURL: string; headers?: Record<string, string> },
  messages: { role: string; content: string }[],
  started: number,
) {
  let res: Response;
  try {
    res = await fetch(`${cfg.baseURL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
        ...(cfg.headers || {}),
      },
      body: JSON.stringify({
        model: CAPTION_GLM,
        temperature: 0.4,
        max_tokens: 500,
        reasoning: { enabled: false },
        include_reasoning: false,
        messages,
      }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    const msg = safeError(err);
    logFail(cfg.baseURL, msg, Date.now() - started);
    throw new Error(msg);
  }
  if (!res.ok) {
    const errText = await res.text();
    const msg = safeError(new Error(`${res.status} ${errText.slice(0, 140)}`));
    logFail(cfg.baseURL, msg, Date.now() - started);
    throw new Error(msg);
  }
  return (await res.json()) as {
    choices?: { message?: { content?: string | null } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
}
