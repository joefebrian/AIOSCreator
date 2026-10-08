import { RATE_CARDS } from "./cloud-rates";
import { estimateSpeechSec, parseCreatorLook, type CreatorLook } from "./factory-native-audio";

/** Template-ad wizard. Reference recreate stays on the earlier-drafts board. */

export const WIZARD_HOOKS = [
  { id: "auto", label: "Auto" },
  { id: "question", label: "Question" },
  { id: "pattern", label: "Pattern interrupt" },
  { id: "social", label: "Social proof" },
  { id: "pov", label: "POV grab" },
  { id: "whisper", label: "Whisper secret" },
  { id: "bold", label: "Bold claim first" },
] as const;

export type WizardHook = (typeof WIZARD_HOOKS)[number]["id"];
export type WizardRatio = "9:16" | "16:9" | "1:1";
export type WizardDuration = 10 | 15;

export type WizardDraft = {
  id: string;
  updatedAt: string;
  catalogProductId: string;
  market: string;
  locale: string;
  listingId: string;
  productImageUrl: string;
  dialog: string;
  hook: WizardHook;
  look: CreatorLook | null;
  stillUrl: string;
  stillAspect: string;
  stillSource: "generated" | "upload" | "";
  stillJobId: string;
  stillError: string;
  volume: number;
  durationSec: WizardDuration;
  ratio: WizardRatio;
  clipJobIds: string[];
  clipError: string;
};

const TESTIMONIAL = /\b(my skin|i have been|i am a fan|i'm a fan|glowing|glowy|hasilnya|kulit saya|dulu|pernah pakai)\b/i;
const PRICE = /[$€£]|\b(?:usd|idr|myr|sgd|thb|rm|rp)\b|\b(?:discount|% off|harga)\b/i;
const STARTS_WITH_I = /^(i |i'm |i’ve )/i;

const HOOK_LINE: Record<WizardHook, string> = {
  auto: "Open with the clearest confirmed fact, said the way a person would.",
  question: "Open with one question a buyer would ask. The question must be answerable from the facts.",
  pattern: "Open by interrupting a routine, then land on a confirmed fact.",
  social: "Open with social proof only when a confirmed fact already says it. Otherwise open with a question about a confirmed feature.",
  pov: "Open in second person, about a confirmed use.",
  whisper: "Open with one quiet sentence about a confirmed detail.",
  bold: "Open with the strongest confirmed feature. Do not intensify it past the fact.",
};

const COUNTRY: Record<string, string> = {
  MY: "Malaysian appearance",
  ID: "Indonesian appearance",
  SG: "Singaporean appearance",
  TH: "Thai appearance",
  US: "American appearance",
};

export function emptyWizardDraft(id: string): WizardDraft {
  return {
    id,
    updatedAt: new Date().toISOString(),
    catalogProductId: "",
    market: "MY",
    locale: "en-MY",
    listingId: "",
    productImageUrl: "",
    dialog: "",
    hook: "auto",
    look: null,
    stillUrl: "",
    stillAspect: "",
    stillSource: "",
    stillJobId: "",
    stillError: "",
    volume: 1,
    durationSec: 10,
    ratio: "9:16",
    clipJobIds: [],
    clipError: "",
  };
}

export function isWizardHook(value: string): value is WizardHook {
  return WIZARD_HOOKS.some((row) => row.id === value);
}

export function clampVolume(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(10, Math.max(1, Math.round(value)));
}

export function asDuration(value: number): WizardDuration {
  return value === 15 ? 15 : 10;
}

export function asRatio(value: string): WizardRatio {
  if (value === "16:9" || value === "1:1") return value;
  return "9:16";
}

export function spokenProductName(name: string) {
  const head = name.split("|")[0].replace(/\s+for\s+.*/i, "").trim();
  return head || name;
}

export function descriptionFromFacts(facts: { statement: string }[]) {
  return facts
    .map((fact) => fact.statement.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

export function wordBudget(durationSec: number) {
  return Math.max(8, Math.floor((durationSec - 0.8) * 2.3));
}

export function seedanceUsdPerSec() {
  return RATE_CARDS.find((row) => row.model === "seedance-2-5")?.usd || 0.0738;
}

export function wizardCostUsd(durationSec: number, volume: number) {
  const total = seedanceUsdPerSec() * durationSec * clampVolume(volume);
  return Math.round(total * 100) / 100;
}

export function dialogIssues(dialog: string, durationSec: number) {
  const text = dialog.replace(/\s+/g, " ").trim();
  const issues: string[] = [];
  if (!text) issues.push("Dialog is empty.");
  if (text.length > 400) issues.push("Dialog is over 400 characters.");
  if (STARTS_WITH_I.test(text)) issues.push("Dialog starts with I.");
  if (TESTIMONIAL.test(text)) issues.push("Dialog uses a source testimonial or a skin-result claim.");
  if (PRICE.test(text)) issues.push("Dialog names a price.");
  if (text) {
    const sec = estimateSpeechSec(text, "CREATOR_SPEAKS");
    if (sec > durationSec) issues.push(`Dialog is about ${sec}s. This ad is ${durationSec}s.`);
  }
  return issues;
}

export function dialogUserPrompt(input: {
  name: string;
  market: string;
  locale: string;
  hook: WizardHook;
  durationSec: number;
  facts: { id: string; statement: string }[];
}) {
  return [
    `Product label to speak: ${spokenProductName(input.name)}. Do not recite a marketplace listing title.`,
    `Market ${input.market}. Spoken language ${input.locale}.`,
    `One adult speaking to camera for ${input.durationSec} seconds. About ${wordBudget(input.durationSec)} words maximum.`,
    HOOK_LINE[input.hook],
    "Then one demo line from a confirmed fact, then a short shop call to action with no price.",
    "Do not narrate a source creator's life, past use, skin result, or opinions.",
    "Do not start with I. No price, currency, discount, or percentage.",
    `Confirmed facts, use only these: ${JSON.stringify(input.facts)}`,
    'Return ONLY JSON {"dialog":string}',
  ].join("\n");
}

export function variantUserPrompt(input: {
  name: string;
  market: string;
  locale: string;
  durationSec: number;
  count: number;
  base: string;
  facts: { id: string; statement: string }[];
}) {
  return [
    `Product label to speak: ${spokenProductName(input.name)}. Do not recite a marketplace listing title.`,
    `Market ${input.market}. Spoken language ${input.locale}.`,
    `Write ${input.count} alternate spoken ads. Each is one adult speaking for ${input.durationSec} seconds, about ${wordBudget(input.durationSec)} words.`,
    "Each ad uses a different opening. Keep the same confirmed facts and the same shop call to action.",
    `Do not repeat this opening: ${input.base.split(/[.!?]/)[0] || input.base}`,
    "Do not start with I. No price, currency, discount, percentage, or skin-result claim.",
    `Confirmed facts, use only these: ${JSON.stringify(input.facts)}`,
    'Return ONLY JSON {"dialogs":string[]}',
  ].join("\n");
}

export function creatorStillPrompt(look: CreatorLook, market: string) {
  const parsed = parseCreatorLook(look);
  const country = COUNTRY[(market || "").toUpperCase()] || "adult appearance for the selected market";
  return [
    `Photoreal photograph of one adult ${parsed.presentation} in their ${parsed.age}, ${parsed.hair}, ${parsed.skin}, wearing ${parsed.wardrobe}.`,
    `${country}. Waist-up, facing the camera, plain indoor wall, soft daylight.`,
    "Hands out of frame. No product, no bottle, no jar, no logo, no readable text, no extra people.",
    "Ordinary adult. Not a celebrity. Not a child.",
  ].join(" ");
}

export function seedancePrompt(input: { dialog: string; locale: string; ratio: WizardRatio }) {
  const frame = input.ratio === "9:16" ? "Vertical 9:16" : input.ratio === "1:1" ? "Square 1:1" : "Widescreen 16:9";
  return [
    "@Image1 is the person. Keep that face, body, and clothes.",
    "@Image2 is the product. The person holds or shows that exact product. Do not redraw the label.",
    `${frame}. Spoken language ${input.locale}.`,
    `The visible adult speaks these exact words, with mouth movement that matches them: "${input.dialog.replace(/\s+/g, " ").trim()}".`,
    "No burned-in captions. No price. This person is not the source creator.",
  ].join(" ");
}

export function wizardBlockers(input: {
  productImageUrl: string;
  listingReview: string;
  eligibleFactCount: number;
  dialog: string;
  durationSec: number;
  stillUrl: string;
  stillAspect: string;
  ratio: string;
  stillSource: WizardDraft["stillSource"];
  volume: number;
}) {
  const issues: string[] = [];
  if (!input.productImageUrl.startsWith("/api/media/") || input.productImageUrl.includes("/ugc-references/")) {
    issues.push("Choose a catalog photo of this SKU.");
  }
  if (input.listingReview !== "REVIEWED") issues.push("Confirm this market's shop as the same physical SKU before generating.");
  if (input.eligibleFactCount < 1) issues.push("No confirmed fact can go into the script yet.");
  issues.push(...dialogIssues(input.dialog, input.durationSec));
  if (!input.stillUrl.startsWith("/api/media/")) issues.push("Generate the person, or upload an adult photo.");
  if (input.stillSource === "generated" && input.stillAspect && input.stillAspect !== input.ratio) {
    issues.push("The person photo was made for a different ratio. Generate it again.");
  }
  if (clampVolume(input.volume) !== input.volume) issues.push("Volume is 1 to 10 ads.");
  return issues;
}
