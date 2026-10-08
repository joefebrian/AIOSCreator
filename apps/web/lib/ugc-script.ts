export type ScriptBeat = { t: string; spoken: string; visual: string; goal?: string; overlay?: string; shot?: string };

export type ScriptPack = {
  title: string;
  format?: string;
  hook: string;
  hookVisual?: string;
  firstFrame?: string;
  beats: ScriptBeat[];
  cta: string;
  ctaVisual?: string;
  voiceover: string;
  scenes: string[];
  platforms: string[];
};

function asText(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "object" && v && "spoken" in v) return String((v as { spoken?: string }).spoken || "").trim();
  return String(v).trim();
}

function asVisual(v: unknown): string {
  if (v && typeof v === "object" && "visual" in v) return String((v as { visual?: string }).visual || "").trim();
  return "";
}

function joinSpoken(parts: string[]) {
  const out: string[] = [];
  for (const p of parts) {
    const t = p.trim();
    if (!t) continue;
    if (out.length && out[out.length - 1].toLowerCase() === t.toLowerCase()) continue;
    if (out.length && t.toLowerCase().startsWith(out[0].toLowerCase()) && out[0].length > 20) {
      const rest = t.slice(out[0].length).replace(/^[\s.]+/, "");
      if (rest) out.push(rest);
      continue;
    }
    out.push(t);
  }
  return out.join(" ");
}

export function normalizeScriptPack(raw: Record<string, unknown>): ScriptPack {
  const hookRaw = raw.hook;
  const hook = asText(hookRaw);
  const hookVisual = asVisual(hookRaw) || asText(raw.hookVisual) || asText(raw.firstFrame);
  const ctaRaw = raw.cta;
  const cta = asText(ctaRaw);
  const ctaVisual = asVisual(ctaRaw) || asText(raw.ctaVisual);
  const beatIn = Array.isArray(raw.beats) ? raw.beats : [];
  const scenesIn = Array.isArray(raw.scenes) ? raw.scenes.map(String) : [];
  const beats: ScriptBeat[] =
    beatIn.length > 0
      ? beatIn.map((b, i) => {
          const rec = b && typeof b === "object" ? (b as Record<string, unknown>) : { spoken: String(b || "") };
          return {
            t: asText(rec.t) || (i === 0 ? "2-6s" : i === 1 ? "6-11s" : `${11 + i}s`),
            spoken: asText(rec.spoken ?? rec),
            visual: asText(rec.visual),
            goal: asText(rec.goal) || undefined,
            overlay: asText(rec.overlay) || undefined,
            shot: asText(rec.shot) || undefined,
          };
        })
      : scenesIn.map((s, i) => ({ t: `${2 + i * 3}-${5 + i * 3}s`, spoken: "", visual: s }));
  const spokenParts = [hook, ...beats.map((b) => b.spoken), cta];
  const voiceover = joinSpoken(spokenParts) || asText(raw.voiceover);
  const scenes = [hookVisual, ...beats.map((b) => b.visual), ctaVisual].filter(Boolean);
  return {
    title: asText(raw.title) || "UGC take",
    format: asText(raw.format) || undefined,
    hook,
    hookVisual: hookVisual || undefined,
    firstFrame: hookVisual || asText(raw.firstFrame) || undefined,
    beats,
    cta,
    ctaVisual: ctaVisual || undefined,
    voiceover,
    scenes,
    platforms: Array.isArray(raw.platforms) ? raw.platforms.map(String) : ["TikTok", "YouTube Shorts"],
  };
}

export function assertHook(pack: ScriptPack) {
  if (!pack.hook.trim()) throw new Error("HOOK is required (first 2 seconds). Write again.");
}

export function i2vPromptFromScript(pack: ScriptPack, extra = "") {
  const bits = [
    pack.firstFrame ? `0-2s FIRST FRAME: ${pack.firstFrame}` : "",
    ...pack.beats.map((b) => `${b.t} ${b.visual || b.spoken}`.trim()),
    pack.ctaVisual ? `CTA: ${pack.ctaVisual}` : "",
    extra,
  ].filter(Boolean);
  return bits.join(". ");
}

/** Factory I2V: motion only. Scene/SKU must already be in the still. */
export function factoryI2vPrompt(productTitle: string, pack?: Partial<ScriptPack>, formatId?: string, marketLine = "") {
  const motion = (pack?.beats?.[0]?.visual || pack?.hookVisual || pack?.firstFrame || "").slice(0, 180);
  const lane = FACTORY_FORMATS.find((row) => row.id === formatId)?.lane;
  const unbox =
    formatId === "unbox-talk"
      ? "Handheld: she opens the box, pulls THIS product, holds it to the lens. Keep the same bedroom and the same box. Do not swap the SKU."
      : "";
  return [
    "Keep the first-frame product and scene. Do not replace the object.",
    productTitle ? `Exact product: ${productTitle}.` : "",
    "Keep brand logos and lettering exactly as in the first frame and listing photo. Do not redraw or misspell the wordmark (no extra letters).",
    lane === "talent" ? marketLine : "No new person and no new location. Move only the product already in the first frame.",
    unbox || (motion ? `Motion: ${motion}` : "Natural handheld motion."),
    "9:16.",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Storyboard length, or a refusal when the chosen model cannot hold it. */
export function factoryClipDuration(engineId: string, storyboardSec: number): { durationSec: number } | { error: string } {
  const max = engineId === "grok-imagine-video" ? 15 : 30;
  const min = engineId === "grok-imagine-video" ? 3 : engineId === "seedance-2-5" ? 4 : 2;
  const label = FACTORY_I2V.find((model) => model.id === engineId)?.label || "This model";
  if (!storyboardSec) return { durationSec: 8 };
  if (storyboardSec > max) return { error: `A ${storyboardSec}s scene is too long for ${label}. It stops at ${max}s.` };
  return { durationSec: Math.max(min, storyboardSec) };
}

/** Motion only. The spoken line and overlay are burned on after the clip returns. */
export function factoryScenePrompt(opts: {
  productTitle: string;
  formatId?: string;
  marketLine?: string;
  index: number;
  count: number;
  goal?: string;
  shot?: string;
  durationSec: number;
}) {
  const lane = FACTORY_FORMATS.find((row) => row.id === opts.formatId)?.lane;
  const goal = (opts.goal || "").toLowerCase();
  const directed = (opts.shot || "").replace(/\s+/g, " ").trim().slice(0, 180);
  const motion = directed
    ? directed
    : goal.includes("hero")
    ? "Slow push-in on the product already in frame."
    : goal.includes("pack")
      ? "Move closer to the product already in frame. Do not add a box, a room, or a person."
      : goal.includes("product")
        ? "Hold the product steady and readable."
        : goal.includes("benefit")
          ? "Small tilt. The same product stays in frame."
          : goal.includes("cta")
            ? "Ease back to a centered hold of the same product."
            : "Gentle move on the product already in frame. Do not add a person or a new object.";
  return [
    "Keep the first-frame product and scene. Do not replace the object.",
    opts.productTitle ? `Exact product: ${opts.productTitle}.` : "",
    "Keep brand logos and lettering exactly as in the first frame and listing photo. Do not redraw or misspell the wordmark (no extra letters).",
    lane === "talent" ? opts.marketLine || "" : "No new person and no new location. Move only the product already in the first frame.",
    `Scene ${opts.index} of ${opts.count}, ${opts.durationSec}s. ${motion}`,
    "9:16.",
  ]
    .filter(Boolean)
    .join(" ");
}

export const FACTORY_LANES = [
  { id: "faceless", label: "Faceless" },
  { id: "slideshow", label: "Slideshow" },
  { id: "talent", label: "Talent buang" },
] as const;

export const FACTORY_FORMATS = [
  {
    id: "proof-first",
    lane: "faceless",
    label: "Proof-first",
    hint: "Result first, then how",
    structure:
      "Faceless. THIS SKU’s result/use in frame 1 — not a laptop SaaS demo. " +
      "HOOK 0–2s spoken: one-line surprise about the result. Visual: finished output / product doing the thing, readable. " +
      "2–6s: the input/problem, then THIS SKU being used. " +
      "6–10s: output again, one listing-true detail that makes it believable. " +
      "10–14s: hold on the product. CTA: link below, affiliate. No invented results.",
  },
  {
    id: "screen-record",
    lane: "faceless",
    label: "Screen-record",
    hint: "This SKU’s UI only",
    structure:
      "Crop THIS SKU’s real screen/UI. No fake dashboard. " +
      "HOOK 0–2s spoken: one line over the result already on screen. Visual: UI result first, readable. " +
      "2–6s: 2–4 taps/scrolls through the real flow. " +
      "6–10s: zoom the feature that creates the payoff. " +
      "10–14s: final output. CTA overlay + link below. Voiceover only if it adds info. No invented screens.",
  },
  {
    id: "pack-hero",
    lane: "faceless",
    label: "Pack / hero",
    hint: "SKU full, no face",
    structure:
      "Faceless pack/hero. No face. Hands ok. " +
      "HOOK 0–2s spoken: name THIS SKU in one breath. Visual: pack or hero fills 9:16, logo/color readable. " +
      "2–6s: slow turn / hands lift, pockets or included pieces from the listing. " +
      "6–10s: one listing-true detail in close-up. " +
      "10–14s: hero hold. CTA: link below, affiliate. Do not invent extra accessories.",
  },
  {
    id: "before-after",
    lane: "faceless",
    label: "Before / after",
    hint: "Only if listing-true",
    structure:
      "Only if the listing supports a real before/after. Do not fabricate. " +
      "HOOK 0–2s spoken: name the problem. Visual: before state, no SKU yet. " +
      "2–6s: THIS SKU / process in frame. " +
      "6–10s: after state. One listing-true change that caused it. " +
      "10–14s: product readable. CTA: link below. No fake ‘30-day glow’ unless listed.",
  },
  {
    id: "problem-payoff",
    lane: "faceless",
    label: "Problem → payoff",
    hint: "Pain, mechanism, result",
    structure:
      "Faceless. " +
      "HOOK 0–2s spoken: specific pain, not a slogan. Visual: the annoying old way. " +
      "2–6s: why the usual method sucks, then THIS SKU’s mechanism from the listing. " +
      "6–10s: it working. Payoff/result only if listing-true. " +
      "10–14s: product readable. CTA: link below, affiliate.",
  },
  {
    id: "comparison",
    lane: "faceless",
    label: "A vs B",
    hint: "Same input, two options",
    structure:
      "Same input, same rules. " +
      "HOOK 0–2s spoken: we’re testing A vs B. Visual: side-by-side setup, THIS SKU is one side. " +
      "2–6s: option A. 6–10s: option B (this SKU). " +
      "10–14s: reveal + one listing-true conclusion. No fake winner stats or invented scores. CTA: link below.",
  },
  {
    id: "unboxing",
    lane: "faceless",
    label: "Unbox",
    hint: "Hands, pack, contents",
    structure:
      "Faceless hands. No talking head. " +
      "HOOK 0–2s spoken: one line as the box hits the table. Visual: closed pack of THIS SKU, readable. " +
      "2–6s: open. 6–10s: lay out only what the listing includes. " +
      "10–14s: hero of the main item. CTA: link below. No extra gifts invented.",
  },
  {
    id: "unbox-talk",
    lane: "talent",
    label: "Unbox talk",
    hint: "GRWM haul: box → pull → hold to lens → CTA",
    structure:
      "Bedroom/sunlit haul, throwaway talent (not a roster face). Title like “[SKU] haul / GRWM”. " +
      "HOOK 0–2s spoken: Get ready with me — these JUST came and I’m obsessed. Visual: she sits on the bed, closed box of THIS SKU in frame 1, shocked/happy hands. " +
      "2–6s: open the box, pull the exact product. Spoken + visual name only listing-true details (material, color, sole, stripes, laces, what’s in the box). " +
      "6–10s: hold SKU to the lens / close-up. Talk feel/fit/how it goes with outfits ONLY if those claims are in the listing — no invented sizing or ‘sell out’. " +
      "10–14s: quick mirror or on-body if shoes/clothes, else detail hold. " +
      "CTA: lean into camera. Link below. Disclosure affiliate. Do not copy another brand’s unbox (no Adidas/Gazelle unless that is the SKU).",
  },
  {
    id: "whats-in-box",
    lane: "faceless",
    label: "What’s in the box",
    hint: "Kit layout",
    structure:
      "Top-down kit. Faceless. " +
      "HOOK 0–2s spoken: what’s actually in here. Visual: closed pack, then layout. " +
      "2–6s / 6–10s / 10–14s: name each included piece from the listing, one at a time. No extras. CTA: link below.",
  },
  {
    id: "how-to",
    lane: "faceless",
    label: "How-to",
    hint: "2–4 real steps",
    structure:
      "Hands + THIS SKU. No face required. One job from the listing. " +
      "HOOK 0–2s spoken: I’m gonna show you how to [job]. Visual: SKU + the job setup. " +
      "2–6s: step 1–2. 6–10s: step 3. 10–14s: done / result. CTA: link below. No invented steps.",
  },
  {
    id: "hands-only",
    lane: "faceless",
    label: "Hands-only",
    hint: "Hands + SKU, no face",
    structure:
      "Only hands and THIS SKU. " +
      "HOOK 0–2s: texture/use in frame, one spoken line. " +
      "2–6s / 6–10s: satisfying use from listing (buttons, zip, clip). " +
      "10–14s: product readable. CTA: link below. No talking head.",
  },
  {
    id: "satisfying",
    lane: "faceless",
    label: "Satisfying",
    hint: "Click / peel / texture",
    structure:
      "ASMR-adjacent. First frame = texture of THIS SKU. " +
      "HOOK 0–2s spoken: almost none, or one whisper line. Visual: peel/click/pack tight. " +
      "2–10s: repeat the satisfying action. 10–14s: full product. CTA overlay. No fake slime if the SKU isn’t that.",
  },
  {
    id: "test",
    lane: "faceless",
    label: "Test",
    hint: "Does it actually…",
    structure:
      "One test that the listing actually claims. " +
      "HOOK 0–2s spoken: does it actually [claim]? Visual: the test setup + THIS SKU. " +
      "2–6s: the attempt. 6–10s: what happened (no invented pass/fail numbers). " +
      "10–14s: product readable. CTA: link below.",
  },
  {
    id: "stop-scroll",
    lane: "faceless",
    label: "Stop-scroll",
    hint: "Weird first frame",
    structure:
      "Odd first frame of THIS SKU (extreme close-up, odd angle). " +
      "HOOK 0–2s spoken: wait what is that. Visual: pattern interrupt, product still identifiable. " +
      "2–6s: pull back, name the SKU. 6–10s: one use. 10–14s: readable hero. CTA: link below.",
  },
  {
    id: "restock",
    lane: "faceless",
    label: "Restock",
    hint: "Shelf / desk drop",
    structure:
      "Faceless. Product lands on desk/shelf. " +
      "HOOK 0–2s spoken: restocking this. Visual: THIS SKU dropping into place, readable. " +
      "2–6s: identify. 6–10s: one use. 10–14s: tidy shelf. CTA: link below.",
  },

  {
    id: "slides-discovery",
    lane: "slideshow",
    label: "Discovery 8",
    hint: "Then I found…",
    structure:
      "8 stills, one thought each, 5–14 words. " +
      "1 curiosity hook + strongest visual. 2 old problem. 3 then I found…. 4 THIS SKU. 5 strongest listing feature. 6 second proof. 7 who it’s for. 8 CTA + affiliate. Not every slide an ad.",
  },
  {
    id: "slides-list",
    lane: "slideshow",
    label: "List 8",
    hint: "3–5 things",
    structure:
      "8 stills. Slide 1: 3/5 things hook. 2–5: items. 6: THIS SKU earns one slot from listing facts. 7 summary. 8 CTA. Do not make every slide a disguised ad.",
  },
  {
    id: "slides-story",
    lane: "slideshow",
    label: "Story 8",
    hint: "Tension → payoff",
    structure:
      "8 stills: 1 tension hook. 2 context. 3 failure. 4 turning point. 5 THIS SKU. 6 what changed (listing-true). 7 result. 8 CTA.",
  },
  {
    id: "slides-faq",
    lane: "slideshow",
    label: "FAQ 8",
    hint: "One Q per slide",
    structure:
      "8 stills. Real listing FAQs only. One question per slide, THIS SKU answers. No fake comments, no fake review counts. Last slide CTA.",
  },
  {
    id: "slides-mistakes",
    lane: "slideshow",
    label: "Mistakes 8",
    hint: "Stop doing X",
    structure:
      "8 stills: mistakes people make in this category. THIS SKU is the fix on later slides, from listing facts. Last slide CTA. No invented ‘everyone does this’ stats.",
  },
  {
    id: "slides-ranking",
    lane: "slideshow",
    label: "Rank 8",
    hint: "Best → skip",
    structure:
      "8 stills ranking options. THIS SKU earns a slot from listing facts. No fake #1. Last slide CTA + affiliate.",
  },

  {
    id: "hold",
    lane: "talent",
    label: "Hold",
    hint: "Throwaway + SKU",
    structure:
      "Throwaway talent, not a roster face. " +
      "HOOK 0–2s spoken: look at this. Visual: she holds THIS SKU to camera, readable from frame 1. " +
      "2–6s: turn it, one listing detail. 6–10s: how you’d use it (listing-true). " +
      "10–14s: hold closer. CTA: lean in, link below, affiliate.",
  },
  {
    id: "talking",
    lane: "talent",
    label: "Talking",
    hint: "To camera",
    structure:
      "Throwaway talking head. Conversational, not testimonial-speak. SKU in frame the whole time. " +
      "HOOK 0–2s spoken: mid-thought one-liner naming THIS SKU. Visual: face + product. " +
      "2–6s: old way. 6–10s: one listing feature. 10–14s: why it helps. CTA: link below, affiliate. No ‘changed my life’.",
  },
  {
    id: "lifestyle",
    lane: "talent",
    label: "Lifestyle",
    hint: "In use",
    structure:
      "Throwaway talent using THIS SKU in a real beat (desk, kitchen, commute) — not bolted on at the end. " +
      "HOOK 0–2s spoken: situation, not a slogan. Visual: she’s already using it. " +
      "2–10s: the use, one listing detail. 10–14s: product readable. CTA: link below.",
  },
  {
    id: "i-found-this",
    lane: "talent",
    label: "I found this",
    hint: "Mid-thought",
    structure:
      "Already mid-thought. Conversational. " +
      "HOOK 0–2s spoken: I found this. Visual: natural creator shot, THIS SKU nearby. " +
      "2–6s: old frustration. 6–10s: show product + main listing feature. 10–14s: why it’s useful. CTA: link below. No scripted testimonial.",
  },
  {
    id: "comment-reply",
    lane: "talent",
    label: "Comment reply",
    hint: "On-screen question",
    structure:
      "On-screen question from a listing FAQ — not a fake comment with likes. " +
      "HOOK 0–2s spoken: answering that. Visual: question overlay + talent + THIS SKU. " +
      "2–10s: demo the answer. 10–14s: one extra listing detail. CTA: link below.",
  },
  {
    id: "review",
    lane: "talent",
    label: "Review",
    hint: "First-use honest",
    structure:
      "First-use review. Listing facts only. No star counts, GMV, or ‘changed my life’. " +
      "HOOK 0–2s spoken: first time using THIS SKU. Visual: unbox or hold. " +
      "2–6s: what you notice (listing-true). 6–10s: who it’s for. 10–14s: honest caveat if listing has one, else product readable. CTA: link below, affiliate.",
  },
  {
    id: "grwm",
    lane: "talent",
    label: "GRWM",
    hint: "Get-ready with this SKU",
    structure:
      "Get-ready-with-me. THIS SKU is the object (put on / grab), not a 4-brand beauty vlog unless the SKU is beauty — then use Beauty GRWM. Throwaway talent. " +
      "HOOK 0–2s spoken: get ready with me. Visual: bedroom/vanity, THIS SKU on the table. " +
      "2–6s: pick it up. 6–10s: put it on or use it. 10–14s: mirror. CTA: link below. Listing details only.",
  },
  {
    id: "beauty-grwm",
    lane: "talent",
    label: "Beauty GRWM",
    hint: "Makeup/skincare try-on on face",
    structure:
      "Beauty Get Ready With Me — try-on on the face, not an unbox. Warm sunlit vanity, throwaway talent. Only for makeup/skincare SKUs. " +
      "THIS SKU is the product she applies (lipstick, serum, mascara…). Do not invent a full routine of other brands. Other steps stay generic or skip. " +
      "HOOK 0–2s spoken: get ready with me. Visual: vanity, THIS SKU in hand or on the table, she looks to camera. " +
      "2–6s: prep, then apply THIS SKU to face/skin. " +
      "6–10s: blend/finish, listing-true texture/shade only — no invented ingredients. " +
      "10–14s: mirror close-up of the result on her. " +
      "CTA: lean in, link below, affiliate. Trendy lifestyle, not a studio ad. Not a shoebox unbox.",
  },
  {
    id: "pov",
    lane: "talent",
    label: "POV",
    hint: "Camera is the user",
    structure:
      "POV: viewer’s hands/eyes. Hook is the situation, not a brand slogan. " +
      "HOOK 0–2s spoken: POV you just [situation]. Visual: first-person, THIS SKU entering frame. " +
      "2–10s: use it first-person. 10–14s: result. CTA: link below.",
  },
  {
    id: "day-in-life",
    lane: "talent",
    label: "Day in the life",
    hint: "One beat of the day",
    structure:
      "One real moment, not a 24h montage. " +
      "HOOK 0–2s spoken: a time of day. Visual: talent in that beat, THIS SKU already there. " +
      "2–10s: the use. 10–14s: product readable. CTA: link below. Don’t invent a whole day of products.",
  },
  {
    id: "haul",
    lane: "talent",
    label: "Haul",
    hint: "The one keep",
    structure:
      "Haul energy, but THIS SKU is the keep. Don’t invent a pile of other brands. " +
      "HOOK 0–2s spoken: haul just landed / the one I kept. Visual: bags/box, THIS SKU. " +
      "2–6s: pull it. 6–10s: why it stayed (listing-true). 10–14s: hold to camera. CTA: link below, affiliate.",
  },
] as const;

export type FactoryFormatId = (typeof FACTORY_FORMATS)[number]["id"];
export type FactoryLaneId = (typeof FACTORY_LANES)[number]["id"];

export function isSlideshowFormat(id: string) {
  return id.startsWith("slides-");
}

/** Pack/kit shots can use the listing photo as first frame — no Qwen click. */
export function listingStillOk(id: string) {
  return id === "pack-hero" || id === "whats-in-box" || id === "restock";
}

export function batchFormatIds(selected: string): string[] {
  const fmt = FACTORY_FORMATS.find((f) => f.id === selected);
  const lane = fmt?.lane || "faceless";
  const ids = FACTORY_FORMATS.filter((f) => f.lane === lane).map((f) => f.id);
  const rest = ids.filter((id) => id !== selected);
  return [selected, ...rest].slice(0, 4);
}

export type ProductContext = "makeup" | "skincare" | "shoes" | "garment" | "gadget" | "app" | "food" | "other";

export function productContext(title: string, features: string[] = [], objectKind?: string): ProductContext {
  const blob = `${title} ${features.join(" ")} ${objectKind || ""}`;
  if (/\b(lipstick|lip gloss|lip tint|mascara|foundation|concealer|blush|eyeshadow|eyeliner|makeup|cosmetic|bronzer|highlighter)\b/i.test(blob)) {
    return "makeup";
  }
  if (/\b(serum|moisturizer|skincare|retinol|sunscreen|cleanser|toner|cream|essence|ampoule)\b/i.test(blob)) {
    return "skincare";
  }
  if (/\b(sneaker|gazelle|shoe|boot|trainer|loafer|sandal|footwear|samba|campus)\b/i.test(blob)) return "shoes";
  if (objectKind === "garment" || /\b(dress|shirt|tote|bag|hoodie|kurung|pajama)\b/i.test(blob)) return "garment";
  if (objectKind === "app" || /\b(app|saas|software)\b/i.test(blob)) return "app";
  if (objectKind === "food") return "food";
  if (objectKind === "hardware" || objectKind === "pack" || /\b(gadget|device|multitool|flipper)\b/i.test(blob)) return "gadget";
  return "other";
}

/** SKU context → formats that fit. Operator can still pick others. */
/**
 * Throwaway talent wardrobe for Factory stills only.
 * From SKU context + format — not random, not Character complete-set clothes.
 */
export function factoryWardrobe(ctx: ProductContext, formatId: string) {
  if (formatId === "beauty-grwm" || ctx === "makeup" || ctx === "skincare") {
    return "Camisole or simple tee at a vanity. Shoulders covered enough for a beauty GRWM. No nude, no lingerie set.";
  }
  if (formatId === "unbox-talk" || formatId === "haul") {
    if (ctx === "shoes" || ctx === "garment") {
      return "Casual haul lounge: fitted long-sleeve or jersey + shorts/skirt, sitting on the bed. Soft-girl bedroom, not nude, not a Character identity outfit.";
    }
    return "Hoodie or tee + jeans/shorts on the bed or desk. Home haul clothes. No nude.";
  }
  if (formatId === "grwm") {
    return ctx === "shoes" || ctx === "garment"
      ? "Getting-ready clothes she would actually put the SKU on with (tee + jeans or lounge set). No nude."
      : "Simple home clothes (tee + pants). No nude.";
  }
  if (ctx === "gadget") return "Casual indoor: tee + jeans. No nude.";
  return "Everyday clothed (top + bottoms). No nude, no topless, no Character-library wardrobe.";
}

export function suggestFactoryFormats(ctx: ProductContext): FactoryFormatId[] {
  const map: Record<ProductContext, FactoryFormatId[]> = {
    makeup: ["beauty-grwm", "review", "before-after"],
    skincare: ["beauty-grwm", "before-after", "proof-first"],
    shoes: ["unbox-talk", "haul", "grwm"],
    garment: ["haul", "grwm", "hold"],
    gadget: ["pack-hero", "unbox-talk", "how-to", "proof-first"],
    app: ["screen-record", "proof-first", "slides-list"],
    food: ["satisfying", "proof-first", "review"],
    other: ["pack-hero", "unbox-talk", "review"],
  };
  return map[ctx];
}

export function factoryFormatLine(id: string) {
  const fmt = FACTORY_FORMATS.find((f) => f.id === id);
  if (!fmt) return `Format: ${id}. 9:16 Short/Reels. One format per run.`;
  return `Format: ${fmt.label} (${fmt.id}, ${fmt.lane}). ${fmt.structure} Fill JSON: hook.spoken + hook.visual, beats at 2-6s / 6-10s / 10-14s (spoken+visual, do not repeat the hook), cta.spoken + cta.visual + affiliate disclosure. 9:16 Short/Reels. One format per run. HOOK names this SKU. Listing claims only.`;
}

export const FACTORY_I2V = [
  { id: "wan-3-0", label: "Wan 3.0" },
  { id: "wan-3-0-std", label: "Wan 3.0 std" },
  { id: "seedance-2-5", label: "Seedance 2.5" },
  { id: "grok-imagine-video", label: "Grok Video" },
] as const;
