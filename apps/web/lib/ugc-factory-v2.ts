import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataRoot, ensureDataDirs } from "./paths";
import { skuIdentityUrl } from "./product-import";
import { getProduct } from "./products";
import { readSharedCatalog } from "./shared-catalog";
import { estimateSpeechSec, legacyDelivery, parseCreatorLook } from "./factory-native-audio";
import { captionNeedsReview, isFactoryVoice } from "./factory-scene-review";
import { targetListingBlocker } from "./shopee-affiliate-link";
import { pinnedBlueprintStale } from "./ugc-reference-blueprint";
import { reviewedReferencePatterns, type ReviewedReferencePattern } from "./ugc-references";

/** Pilot markets. Japan is not a creation default. */
export const FACTORY_V2_MARKETS = [
  { id: "ID", label: "Indonesia", locales: ["id-ID"], currency: "IDR" },
  { id: "MY", label: "Malaysia", locales: ["ms-MY", "en-MY"], currency: "MYR" },
  { id: "SG", label: "Singapore", locales: ["en-SG"], currency: "SGD" },
  { id: "TH", label: "Thailand", locales: ["th-TH"], currency: "THB" },
  { id: "US", label: "United States", locales: ["en-US"], currency: "USD" },
] as const;

export type FactoryMarketId = (typeof FACTORY_V2_MARKETS)[number]["id"];

export const FACTORY_V2_PLACEMENTS = [
  { id: "TIKTOK", label: "TikTok" },
  { id: "REELS", label: "Reels" },
  { id: "SHORTS", label: "Shorts" },
  { id: "SHOPEE_VIDEO", label: "Shopee Video" },
  { id: "DEMAND_GEN", label: "Demand Gen" },
] as const;

/** Five pilot recipes. Legacy F/S/T templates stay out of this selector. */
export const FACTORY_V2_RECIPES = [
  { id: "HOME_HANDS_DEMO", label: "Hands demo", category: "home_gadget", creator: "HANDS", needs: "Hands only. Needs the real product, a verified way to operate it, and a result the camera can show. Not validated." },
  { id: "HOME_CREATOR_DEMO", label: "Creator demo", category: "home_gadget", creator: "GENERATED_ADULT", needs: "Adult on camera. Needs a locked face, the real product, and a verified action. Not validated, and not a hair-tool recipe." },
  { id: "HOME_UNBOX_FIRST_USE", label: "Unbox then first use", category: "home_gadget", creator: "HANDS", needs: "Needs the local box, confirmed contents, and a first use. Do not invent what is inside. Not validated." },
  { id: "TOY_UNBOX_FIRST_PLAY", label: "Unbox then first play", category: "preschool_toy", creator: "GENERATED_ADULT", needs: "Adult buyer. Needs the local box, confirmed contents, one play episode, and age evidence for the exact SKU. A child on camera is not required. Not validated." },
  { id: "TOY_UNBOX_BUILD_PLAY", label: "Unbox, build, play", category: "preschool_toy", creator: "GENERATED_ADULT", needs: "Needs confirmed contents, a real build sequence, and the finished model. Age evidence stays on the exact SKU. Not validated." },
] as const;

export type FactoryCategory = "home_gadget" | "preschool_toy" | "other";
export type Equivalence = "PROPOSED" | "VERIFIED" | "REJECTED";
export type FactState = "EXTRACTED" | "CONFIRMED" | "CONFLICTED" | "EXPIRED";

export type FactoryAssetKey =
  | "productAppearance"
  | "localPackaging"
  | "operationReference"
  | "outputState"
  | "adultIdentity"
  | "playReference"
  | "assemblyReference";

export type FactoryAssets = Record<FactoryAssetKey, boolean>;

export const EMPTY_FACTORY_ASSETS: FactoryAssets = {
  productAppearance: false,
  localPackaging: false,
  operationReference: false,
  outputState: false,
  adultIdentity: false,
  playReference: false,
  assemblyReference: false,
};

export type FactoryFamily = {
  id: string;
  label: string;
  category: FactoryCategory;
  commercialUse: string;
  createdAt: string;
};

export type FactorySku = {
  id: string;
  familyId: string;
  catalogProductId: string | null;
  revision: number;
  variantLabel: string;
  componentCount: number | null;
  color: string | null;
  modelId: string | null;
  /** Legacy boolean notes. A role counts only when `media` has an inspectable id. */
  assets?: FactoryAssets;
  media?: { id: string; role: FactoryAssetKey; url: string; source: "catalog" | "operator" }[];
  createdAt: string;
};

export type FactoryListing = {
  id: string;
  skuId: string;
  market: FactoryMarketId;
  marketplace: string;
  sourceUrl: string;
  merchantProductId: string | null;
  equivalence: Equivalence;
  availability: "UNKNOWN" | "AVAILABLE" | "UNAVAILABLE";
  createdAt: string;
};

export type FactorySnapshot = {
  id: string;
  listingId: string;
  observedAt: string;
  title: string;
  price: string | null;
  currency: string | null;
  confirmation: "EXTRACTED" | "CONFIRMED";
  extractor: "catalog" | "manual";
};

export type FactKind = "LISTING" | "CONTENTS" | "USE" | "REFERENCE" | "AGE";

export type FactoryFact = {
  id: string;
  skuId: string;
  listingId: string | null;
  statement: string;
  state: FactState;
  sourceLevel: "LISTING" | "OPERATOR_OBSERVATION";
  kind?: FactKind;
  createdAt: string;
};

export type FactoryDecision = {
  status: "BLOCKED" | "SELECTED";
  eligibleRecipeIds: string[];
  rejected: { recipeId: string; missing: string[] }[];
  selectedRecipeId: string | null;
  decisionSource: "JEV" | "DETERMINISTIC" | "OPERATOR" | null;
  modelId: string | null;
  /** Provider decision confidence. Not a virality or conversion probability. */
  confidence: number | null;
  evidenceLabel: "HYPOTHESIS" | "INSUFFICIENT";
  summary: string;
  createdAt: string;
};

export type FactoryPlanBeat = {
  id: string;
  purpose: string;
  spoken: string | null;
  onScreen: string | null;
  action: string;
  stateIn: string;
  stateOut: string;
  factIds: string[];
  sourceStartSec?: number | null;
  sourceEndSec?: number | null;
  targetStartSec?: number | null;
  targetEndSec?: number | null;
  estimatedSec?: number | null;
  timing?: "source" | "estimated" | "measured" | "stale";
  framing?: string | null;
  performance?: string | null;
  /** Who speaks this scene. Absent values are read from the older voiceover fields. */
  speechDelivery?: "CREATOR_SPEAKS" | "VOICEOVER" | "SILENT" | null;
  audioMode?: string | null;
  voiceUrl?: string | null;
  productAssetId?: string | null;
  continuity?: string | null;
  renderNote?: string | null;
  uncertainty?: string | null;
  shotId?: string | null;
  beatRole?: string | null;
};

export type FactoryPlan = {
  status: "DRAFT";
  modelId: string;
  concept: string;
  spoken: string;
  delivery: string;
  beats: FactoryPlanBeat[];
  audio: string;
  edit: string;
  /** Creative purpose. Separate from the renderable shots in `beats`. */
  creativeBeats?: { id: string; role: string; sourceStartSec: number | null; sourceEndSec: number | null; evidence: string | null; spoken: string | null; uncertainty: string | null }[];
  references?: { referenceId: string; analysisVersion: number }[];
  createdAt: string;
};

export type FactoryProduction = {
  id: string;
  revision: number;
  skuId: string;
  listingId: string;
  market: FactoryMarketId;
  locale: string;
  placement: string;
  durationMs: number;
  aspectRatio: "9:16";
  recipeId: string | null;
  /** Template drafts use the five pilot recipes. Reference recreation uses the pinned blueprint. */
  planningMode?: "TEMPLATE" | "REFERENCE_RECREATE" | "CAROUSEL";
  creatorMode: "HANDS" | "GENERATED_ADULT" | "SUPPLIED_ADULT";
  stage: "DRAFT" | "NEEDS_FACTS" | "READY_TO_PLAN" | "READY_TO_GENERATE";
  issue: string;
  allowUnpriced: boolean;
  parentId: string | null;
  destinationUrl: string;
  decision?: FactoryDecision | null;
  plan?: FactoryPlan | null;
  planApprovedAt?: string | null;
  /** Approvals cleared because a pinned blueprint changed. The plan text is not rewritten. */
  approvalHistory?: { at: string; revision: number; blueprintVersion: number }[];
  /** Reviewed reference versions selected for this production. An approved plan keeps the versions it already has. */
  pinnedReferences?: { referenceId: string; analysisVersion: number; factIds?: string[]; blueprintVersion?: number }[];
  /** Pinned catalog revision. A later catalog edit does not rewrite this production until it is applied. */
  pinnedSkuRevision?: number | null;
  destinationVersionId?: string | null;
  /** Catalog listing chosen for this target. Its review state is not changed here. */
  catalogListingId?: string | null;
  providerJobId?: string | null;
  /** Wan clips for this draft. A missing face plate is intentional when the look is text-only. */
  wanClips?: { shotId: string; url: string; durationSec: number; at: string }[] | null;
  carousel?: { slides?: { id: string }[]; fixture?: boolean } | null;
  carouselJob?: { id: string; revision: number; market: string } | null;
  impact?: { at: string; skuRevision: number; fields: string[] } | null;
  /** A catalog fact changed. The pinned plan and revision stay until the operator reviews them. */
  factReview?: { at: string; note: string } | null;
  /** Stored face plate for a generated or supplied adult. A label without this media id is not a selected creator. */
  creatorAnchor?: { mediaId: string; url: string; label: string } | null;
  /** Text look for a generated adult. Not a face plate and not the source creator. */
  creatorLook?: { presentation: "woman" | "man"; age: "20s" | "30s"; hair: string; skin: string; wardrobe: string } | null;
  deliveryMode?: "creator-led" | "voiceover" | null;
  voiceId?: string | null;
  /** Native audiovisual generation is the default. External TTS is an explicit advanced path. */
  audioStrategy?: "NATIVE_AUDIO" | "EXTERNAL_TTS" | null;
  voiceDirection?: string | null;
  productImageId?: string | null;
  operatorNote?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BenchmarkBeat = {
  id: string;
  startSec: number;
  endSec: number;
  purpose: string;
  framing: string;
  productAction: string;
  /** Burned-in caption from the sample. Not an authorized fact. */
  onScreenText: string | null;
  uncertainty: string;
  /** Structure worth borrowing. Must not repeat a sample claim. */
  adapt: string;
};

export type BenchmarkShot = {
  id: string;
  beatId: string;
  framing: string;
  camera: string;
};

export type FactoryBenchmark = {
  id: string;
  role: "quality_benchmark";
  originalName: string;
  path: string;
  sha256: string;
  durationSec: number;
  width: number;
  height: number;
  performance: "unknown";
  speech: "unknown";
  asr: "unavailable";
  review: "visual_only";
  localeOnScreen: "en";
  sampleNote: string;
  categoryNote: string;
  pattern: string;
  doNotCopy: string[];
  beats: BenchmarkBeat[];
  shots: BenchmarkShot[];
  referenceScript: {
    status: "source_reconstruction";
    note: string;
    lines: { beatId: string; structureOnly: string }[];
  };
  productionScript: {
    status: "not_written";
    reason: string;
  };
  notesEditedAt: string | null;
};

type Db = {
  schema: "ugc-factory-v2";
  families: FactoryFamily[];
  skus: FactorySku[];
  listings: FactoryListing[];
  snapshots: FactorySnapshot[];
  facts: FactoryFact[];
  productions: FactoryProduction[];
  idempotency: { key: string; productionId: string }[];
  benchmark: FactoryBenchmark;
};

export type CatalogSlice = {
  id: string;
  title: string;
  brand?: string;
  category?: string;
  price?: string;
  currency?: string;
  sourceUrl: string;
  affiliateUrl: string;
  provider: string;
  providerProductId: string;
  features?: string[];
  imageUrl?: string;
  hasPackagingImage?: boolean;
};

/** Visual samples only. Speech was not transcribed. On-screen lines are source evidence, not facts for another SKU. */
const BENCHMARK: FactoryBenchmark = {
  id: "joe-benchmark-2026-10-02",
  role: "quality_benchmark",
  originalName: "Download.mp4",
  path: "UGC_Factory/benchmarks/joe-benchmark-2026-10-02.mp4",
  sha256: "63d0689dbeb2ba5e99609da92a901b506a80e1f0e652e642f070c6d900932c46",
  durationSec: 35.805,
  width: 576,
  height: 1024,
  performance: "unknown",
  speech: "unknown",
  asr: "unavailable",
  review: "visual_only",
  localeOnScreen: "en",
  sampleNote: "Checked on exact frames at several seconds, not only a 3-second grid. Captions change faster than that grid. Times are still approximate, and the samples do not certify every frame.",
  categoryNote: "The package is a hair styling and drying system. That sits outside the home-gadget and preschool-toy pilots. An adult creator demo is only a neighbor of Creator demo. This file does not add a recipe and does not validate one.",
  pattern: "Useful mechanisms are a clear package, a visible action, and a result the camera can actually show. The sample tours several attachments across about 36 seconds. A new production keeps its own arc and the duration requested for that SKU. Do not copy this product, its counts, its creator, or its testimonials.",
  doNotCopy: [
    "The product name and the slogan printed on this box",
    "Speed, heat, shine, and comparison lines",
    "The recommendation and the travel line",
    "A piece count from the sample, including how many attachments are in the box",
    "The creator handle and the platform end card",
    "Any spoken line — speech was not transcribed",
  ],
  beats: [
    {
      id: "b-package",
      startSec: 0,
      endSec: 2.5,
      purpose: "Open on the package",
      framing: "The sealed box is on the bed, then held up so the front and side show.",
      productAction: "The tool is still in the closed box.",
      onScreenText: "Trying Shark Flexstyle",
      uncertainty: "Samples around 0s to 2s. The box also reads “Style while you dry with no heat damage.” The cut into the open box was not measured.",
      adapt: "Open on the sealed package before the tool is in use.",
    },
    {
      id: "b-contents",
      startSec: 2.5,
      endSec: 4,
      purpose: "Show what is inside",
      framing: "The person holds the open box toward the camera. Brushes sit in the tray.",
      productAction: "Shows the open package. Nothing is assembled yet.",
      onScreenText: "transforms from dryer to styler in seconds · Comes with 5 attachments",
      uncertainty: "Sample at about 3s. The piece count is an on-screen claim, not a count of a catalog SKU.",
      adapt: "Show the open package only when the contents are confirmed.",
    },
    {
      id: "b-setup",
      startSec: 4,
      endSec: 5,
      purpose: "State the setup",
      framing: "Seated on the bed. Dryer in one hand, the other hand lifting the hair.",
      productAction: "Holds the dryer body. The hair is up and is not being dried yet.",
      onScreenText: "Let's start with wet hair",
      uncertainty: "Sample at about 4s. This beat is short. Spoken words were not transcribed.",
      adapt: "Name one starting state only when this SKU's confirmed use starts there.",
    },
    {
      id: "b-settings",
      startSec: 5,
      endSec: 6.5,
      purpose: "Show the buttons",
      framing: "Close on the handle. A finger points at the round buttons.",
      productAction: "Points at the controls. No attachment is on.",
      onScreenText: "adjustable settings to suit your needs",
      uncertainty: "Samples at about 5s and 6s. What each button does was not read off the tool.",
      adapt: "Show one real control. Name it only from a confirmed fact.",
    },
    {
      id: "b-control",
      startSec: 6.5,
      endSec: 8,
      purpose: "Show one control",
      framing: "Close on both hands twisting the handle. The face stays in frame.",
      productAction: "Twists the handle.",
      onScreenText: "With the twist, switch to hair dryer",
      uncertainty: "Sample at about 7s, between the buttons and the outlet close-up.",
      adapt: "Show one physical control in the hands, and give it one job.",
    },
    {
      id: "b-air",
      startSec: 8,
      endSec: 10,
      purpose: "Close on the working end",
      framing: "The outlet points at the camera, then the same heat line stays up as the tool moves to the hair.",
      productAction: "Shows the round outlet, then starts the concentrator on the hair.",
      onScreenText: "Strong airflow · fast drying while maintaining low heat",
      uncertainty: "Samples at about 8s, 9s, and 10s. A line at 9s begins “Can be increased” and the rest is partly hidden, so it was not copied. These frames do not measure airflow or heat.",
      adapt: "Use a close view of the working end. Do not state speed or temperature unless a confirmed fact allows that sentence.",
    },
    {
      id: "b-concentrator",
      startSec: 10,
      endSec: 13,
      purpose: "Use one attachment",
      framing: "Seated, with the white concentrator in the hair.",
      productAction: "Draws the concentrator through the hair.",
      onScreenText: "Styling concentrator · Dry and style at the same time",
      uncertainty: "Sample at about 12s. The change into the paddle brush is approximate.",
      adapt: "Name one attachment while it is being used.",
    },
    {
      id: "b-paddle",
      startSec: 13,
      endSec: 17,
      purpose: "One attachment, one result",
      framing: "Close of the flat brush on the dryer, then a medium shot seated with the same brush.",
      productAction: "Holds the paddle brush near the hair, then lowers it.",
      onScreenText: "Paddle Brush · smooth & straighten all at once for a sleek blowout",
      uncertainty: "Samples at about 14s and 16s. Whether that is two cuts or one hold was not measured.",
      adapt: "Give one attachment its own beat and one result the camera can show.",
    },
    {
      id: "b-oval",
      startSec: 17,
      endSec: 21.5,
      purpose: "Second attachment",
      framing: "Seated medium shot. A round brush is in the hair.",
      productAction: "Draws the oval brush through the hair.",
      onScreenText: "Oval Brush · defrizz while adding volume and bounce",
      uncertainty: "Samples at about 18s and 20s. A separate bristle line was not on these frames, so it is not quoted.",
      adapt: "Keep a second attachment in its own beat instead of stacking it on the first.",
    },
    {
      id: "b-barrel",
      startSec: 21.5,
      endSec: 27,
      purpose: "Show the curling attachment",
      framing: "Seated, holding the barrel. The caption changes across nearby samples.",
      productAction: "Holds the curling barrel.",
      onScreenText: "Auto-wrap curlers · Includes 2 barrels to curl in different directions. Nearby sample: automatically wraps, curls, & sets.",
      uncertainty: "The count line is on the frame at about 24s. A nearby sample also carries the wrap line. The barrel count is an on-screen claim, not a count of a catalog SKU.",
      adapt: "Speak an accessory count only when that count is a confirmed fact.",
    },
    {
      id: "b-diffuser",
      startSec: 27,
      endSec: 29.5,
      purpose: "Another attachment",
      framing: "Hands only. A wide bowl attachment fills the frame.",
      productAction: "Holds the bowl attachment up to the camera.",
      onScreenText: "Deep Bowl · To style larger hair sections, extendable to reach",
      uncertainty: "Sample at about 28s. The line may continue past what was readable. The edges of this beat are approximate.",
      adapt: "Give each confirmed attachment its own beat. Skip any attachment this SKU does not include.",
    },
    {
      id: "b-result",
      startSec: 29.5,
      endSec: 32,
      purpose: "Result, then a recommendation",
      framing: "Seated, one hand in the hair and the dryer down. A closer view then holds the round brush, with the box edge in frame.",
      productAction: "Shows the hair, then holds the brush.",
      onScreenText: "Increases smoothness and shine compared to air drying. Then: The perfect travel companion compact for easy storage. Highly recommend.",
      uncertainty: "The comparison line is on the frame at about 30s. The travel line and the recommendation sit just before the end card. They are not measured results. Speech is still unknown.",
      adapt: "Hold a result pose, then one close. A comparison or a recommendation needs evidence the operator supplied.",
    },
    {
      id: "b-end",
      startSec: 32,
      endSec: 35.8,
      purpose: "Platform end card",
      framing: "Black card, a TikTok mark, then a search field.",
      productAction: "No product action.",
      onScreenText: "@shlechua",
      uncertainty: "The logo is on the frame at about 32s. The handle is in the search field on a later frame of the same card, through 35.8s. This is not product footage.",
      adapt: "End on the product. Leave out the platform card and the creator handle.",
    },
  ],
  shots: [
    { id: "s-package", beatId: "b-package", framing: "Sealed box, then held up", camera: "Hold" },
    { id: "s-contents", beatId: "b-contents", framing: "Open box toward the camera", camera: "Hold" },
    { id: "s-setup", beatId: "b-setup", framing: "Medium, seated, dryer in hand", camera: "Hold" },
    { id: "s-settings", beatId: "b-settings", framing: "Close on the handle buttons", camera: "Hold" },
    { id: "s-control", beatId: "b-control", framing: "Close on both hands twisting", camera: "Hold" },
    { id: "s-air", beatId: "b-air", framing: "Outlet toward the camera", camera: "Hold" },
    { id: "s-concentrator", beatId: "b-concentrator", framing: "Concentrator in the hair", camera: "Hold" },
    { id: "s-paddle-close", beatId: "b-paddle", framing: "Close of the flat brush on the dryer", camera: "Hold" },
    { id: "s-paddle-seat", beatId: "b-paddle", framing: "Medium, seated with the same brush", camera: "Hold" },
    { id: "s-oval", beatId: "b-oval", framing: "Medium, round brush in the hair", camera: "Hold" },
    { id: "s-barrel", beatId: "b-barrel", framing: "Seated, holding the barrel", camera: "Hold" },
    { id: "s-diffuser", beatId: "b-diffuser", framing: "Hands holding the wide bowl", camera: "Hold" },
    { id: "s-result", beatId: "b-result", framing: "Medium, hand in hair, then the brush", camera: "Hold" },
    { id: "s-end", beatId: "b-end", framing: "Black platform card", camera: "Hold" },
  ],
  referenceScript: {
    status: "source_reconstruction",
    note: "On-screen lines are quotes from the sample, not a speech transcript. Structure lines are mechanisms, not a required sequence and not a script for another SKU. Astra did not write them.",
    lines: [
      { beatId: "b-package", structureOnly: "The sample opens on a sealed package before the product is used." },
      { beatId: "b-contents", structureOnly: "The sample shows the open package before any piece is used." },
      { beatId: "b-setup", structureOnly: "The sample shows a starting state before the first action." },
      { beatId: "b-settings", structureOnly: "The sample shows a control before that control is used." },
      { beatId: "b-control", structureOnly: "The sample changes one physical control with both hands." },
      { beatId: "b-air", structureOnly: "The sample shows the working end while it is on." },
      { beatId: "b-concentrator", structureOnly: "The sample fits one accessory and shows that accessory working." },
      { beatId: "b-paddle", structureOnly: "The sample gives the next accessory its own action and a visible result." },
      { beatId: "b-oval", structureOnly: "The sample repeats one action with a different accessory." },
      { beatId: "b-barrel", structureOnly: "The sample holds an accessory and shows what that accessory does." },
      { beatId: "b-diffuser", structureOnly: "The sample shows one more accessory, with hands only." },
      { beatId: "b-result", structureOnly: "The sample holds a visible result. A new production chooses its own ending for the duration it was given." },
      { beatId: "b-end", structureOnly: "Stop on the product. The sample's platform card is not a required ending." },
    ],
  },
  productionScript: {
    status: "not_written",
    reason: "No production is ready to plan. Astra was not called. A catalog script can only use that SKU's confirmed facts.",
  },
  notesEditedAt: null,
};

const SAMPLE_CLAIM = /shark|flexstyle|highly recommend|heat damage|strong airflow|air drying|travel companion|shlechua/i;

function clipNote(value: string, label: string) {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text) throw new Error(`Write the ${label}`);
  if (text.length > 400) throw new Error(`Keep the ${label} under 400 characters`);
  return text;
}

function cleanStructure(value: string, label: string) {
  const text = clipNote(value, label);
  if (SAMPLE_CLAIM.test(text)) throw new Error("That note copies a line from the sample. Keep the sample line in the on-screen field.");
  return text;
}

function captionNote(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length > 280) throw new Error("Keep an on-screen line under 280 characters");
  return text || null;
}

function mergeBenchmark(stored: unknown): FactoryBenchmark {
  const next = structuredClone(BENCHMARK);
  if (!stored || typeof stored !== "object") return next;
  const row = stored as {
    sha256?: string;
    notesEditedAt?: string | null;
    beats?: { id?: string; onScreenText?: string | null; uncertainty?: string; adapt?: string }[];
    referenceScript?: { lines?: { beatId?: string; structureOnly?: string }[] };
  };
  if (row.sha256 && row.sha256 !== next.sha256) return next;
  for (const saved of row.beats || []) {
    const beat = next.beats.find((item) => item.id === saved.id);
    if (!beat) continue;
    if (typeof saved.onScreenText === "string" || saved.onScreenText === null) beat.onScreenText = saved.onScreenText;
    if (typeof saved.uncertainty === "string" && saved.uncertainty.trim()) beat.uncertainty = saved.uncertainty;
    if (typeof saved.adapt === "string" && saved.adapt.trim()) beat.adapt = saved.adapt;
  }
  for (const saved of row.referenceScript?.lines || []) {
    const line = next.referenceScript.lines.find((item) => item.beatId === saved.beatId);
    if (!line || typeof saved.structureOnly !== "string" || !saved.structureOnly.trim()) continue;
    line.structureOnly = saved.structureOnly;
  }
  if (typeof row.notesEditedAt === "string") next.notesEditedAt = row.notesEditedAt;
  return next;
}

let rootOverride: string | null = null;

/** Tests only. Production code leaves this unset. */
export function setFactoryV2RootForTests(dir: string | null) {
  rootOverride = dir;
}

function dbFile() {
  const root = rootOverride || dataRoot();
  if (!rootOverride) ensureDataDirs();
  else fs.mkdirSync(path.join(root, "db"), { recursive: true });
  return path.join(root, "db", "ugc-factory-v2.json");
}

function emptyDb(): Db {
  return {
    schema: "ugc-factory-v2",
    families: [],
    skus: [],
    listings: [],
    snapshots: [],
    facts: [],
    productions: [],
    idempotency: [],
    benchmark: mergeBenchmark(null),
  };
}

export function readFactoryV2(): Db {
  const file = dbFile();
  if (!fs.existsSync(file)) return emptyDb();
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Db;
    if (raw.schema !== "ugc-factory-v2" || !Array.isArray(raw.productions)) return emptyDb();
    raw.benchmark = mergeBenchmark(raw.benchmark);
    return raw;
  } catch {
    return emptyDb();
  }
}

export function commitFactoryDb(db: Db) {
  writeFactoryV2(db);
}

function writeFactoryV2(db: Db) {
  const file = dbFile();
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

export function marketOf(id: string) {
  return FACTORY_V2_MARKETS.find((market) => market.id === id);
}

export function detectCategory(text: string): FactoryCategory {
  const blob = text.toLowerCase();
  if (/toy|lego|brick|preschool|building set|playset|play set/.test(blob)) return "preschool_toy";
  if (/kitchen|clean|gadget|organizer|prep|wipe|brush/.test(blob)) return "home_gadget";
  return "other";
}

function now() {
  return new Date().toISOString();
}

function refresh(db: Db, production: FactoryProduction) {
  const listing = db.listings.find((row) => row.id === production.listingId);
  const sku = db.skus.find((row) => row.id === production.skuId);
  const market = marketOf(production.market);
  const snap = db.snapshots.filter((row) => row.listingId === production.listingId).sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0];
  const currency = (snap?.currency || "").toUpperCase();
  const mismatch = Boolean(currency && market && currency !== market.currency);
  const recipeGaps = production.recipeId ? gapsFor(production.recipeId, factContext(db, production)) : [];
  if (!listing || listing.equivalence === "REJECTED") {
    production.stage = "NEEDS_FACTS";
    production.issue = "This link was rejected for this SKU. Pick another listing.";
  } else if (production.planningMode === "CAROUSEL") {
    production.stage = production.carousel?.slides?.length === 5 ? "READY_TO_GENERATE" : "READY_TO_PLAN";
    production.issue = "Carousel draft. No video was started.";
  } else if (production.planningMode === "REFERENCE_RECREATE") {
    const pinned = (production.pinnedReferences || []).length > 0;
    const shopConfirmed = !targetListingBlocker({ market: production.market, factoryMarketplace: listing?.marketplace || null, shop: catalogShopFor(db, production) });
    const sourcePrice = listing.marketplace === "amazon" && production.market !== "US";
    const priceBlocks = mismatch && !production.allowUnpriced && !sourcePrice;
    if (!pinned) {
      production.stage = "NEEDS_FACTS";
      production.issue = "Select a reviewed reference. Pilot recipes stay on template drafts.";
    } else if (production.planApprovedAt && production.plan && (listing.equivalence === "VERIFIED" || shopConfirmed) && !priceBlocks) {
      production.stage = "READY_TO_GENERATE";
      production.issue = "The plan is approved. Generate is a separate action and has not been started.";
    } else {
      production.stage = "READY_TO_PLAN";
      const imageReady = productImageSelected(db, production);
      production.issue = !(listing.equivalence === "VERIFIED" || shopConfirmed)
        ? "Reference plan can be written. Review the target listing before approval. A pilot recipe is not required."
        : imageReady
          ? "Reference plan can be written. No video has been started."
          : "Reference plan can be written. Approval still needs a selected product image. No video has been started.";
    }
  } else if (listing.equivalence !== "VERIFIED") {
    production.stage = "NEEDS_FACTS";
    production.issue = "Review this listing on the product. A similar title is not enough.";
  } else if (mismatch && !production.allowUnpriced) {
    production.stage = "NEEDS_FACTS";
    production.issue = `Listing price is ${currency}, not ${market?.currency}. It was not converted.`;
  } else if (sku && db.families.find((row) => row.id === sku.familyId)?.category === "other" && !production.recipeId) {
    production.stage = "NEEDS_FACTS";
    production.issue = "This catalog item is outside the pilot categories. Choose a recipe only after the category is set.";
  } else if (!production.recipeId) {
    const ctx = factContext(db, production);
    const feasible = FACTORY_V2_RECIPES.filter((recipe) => gapsFor(recipe.id, ctx).length === 0);
    production.stage = "NEEDS_FACTS";
    production.issue = feasible.length
      ? "A pilot is feasible. Run the decision before a plan. No video has been started."
      : "No pilot recipe has the facts and assets it needs. No video has been started.";
  } else if (recipeGaps.length) {
    production.stage = "NEEDS_FACTS";
    production.issue = `Missing ${recipeGaps[0]}.`;
  } else if (production.planApprovedAt && production.plan) {
    production.stage = "READY_TO_GENERATE";
    production.issue = "The plan is approved. Generate is a separate action and has not been started.";
  } else {
    production.stage = "READY_TO_PLAN";
    production.issue = production.recipeId
      ? "Ready to plan. No video has been started."
      : "Facts are confirmed. Pick a pilot recipe before a plan. No video has been started.";
  }
  production.updatedAt = now();
}

function dropPlan(production: FactoryProduction) {
  production.plan = null;
  production.planApprovedAt = null;
}

function durationMsOf(value: number | undefined) {
  if (value == null) return 30000;
  if (!Number.isInteger(value) || value < 10 || value > 30) {
    throw new Error("Duration must be a whole number of seconds from 10 to 30.");
  }
  return value * 1000;
}

function rememberAssets(sku: FactorySku, product: CatalogSlice) {
  const assets = { ...EMPTY_FACTORY_ASSETS, ...sku.assets };
  if (product.imageUrl) assets.productAppearance = true;
  if (product.hasPackagingImage) assets.localPackaging = true;
  sku.assets = assets;
}

function pushFact(db: Db, fact: Omit<FactoryFact, "id" | "createdAt">) {
  const statement = fact.statement.replace(/\s+/g, " ").trim();
  if (!statement) return;
  if (db.facts.some((row) => row.skuId === fact.skuId && row.statement === statement)) return;
  db.facts.push({ ...fact, statement: statement.slice(0, 400), id: randomUUID(), createdAt: now() });
}

export function createFactoryProduction(input: {
  idempotencyKey: string;
  product: CatalogSlice;
  market: string;
  locale: string;
  placement: string;
  destinationUrl?: string;
  destinationVersionId?: string | null;
  pinnedSkuRevision?: number | null;
  recipeId?: string | null;
  variantLabel?: string;
  componentCount?: number | null;
  category?: FactoryCategory;
  durationSec?: number;
}) {
  const key = input.idempotencyKey.trim();
  if (!key) throw new Error("Missing idempotency key");
  const market = marketOf(input.market);
  if (!market) throw new Error("Market must be Indonesia, Malaysia, Singapore, Thailand, or the United States");
  if (!market.locales.includes(input.locale as (typeof market.locales)[number])) {
    throw new Error(`${market.label} does not use ${input.locale}`);
  }
  if (!FACTORY_V2_PLACEMENTS.some((row) => row.id === input.placement)) throw new Error("Unknown placement");
  const recipe = input.recipeId ? FACTORY_V2_RECIPES.find((row) => row.id === input.recipeId) : null;
  if (input.recipeId && !recipe) throw new Error("New productions use a pilot recipe. Legacy templates stay in the library.");
  const category = input.category || detectCategory(`${input.product.category || ""} ${input.product.title}`);
  if (recipe && recipe.category !== category) throw new Error(`${recipe.label} does not fit this product category`);
  const durationMs = durationMsOf(input.durationSec);
  const variantLabel = (input.variantLabel || "Default package").trim() || "Default package";
  const componentCount = input.componentCount == null || Number.isNaN(input.componentCount) ? null : Math.round(input.componentCount);
  if (componentCount != null && componentCount < 0) throw new Error("Component count cannot be negative");

  const db = readFactoryV2();
  const prior = db.idempotency.find((row) => row.key === key);
  if (prior) {
    const production = db.productions.find((row) => row.id === prior.productionId);
    if (production) return { production, created: false, db };
  }

  let family = db.families.find((row) => row.label === (input.product.brand || input.product.title).slice(0, 80) && row.category === category);
  if (!family) {
    family = {
      id: randomUUID(),
      label: (input.product.brand || input.product.title).slice(0, 80),
      category,
      commercialUse: category === "preschool_toy" ? "Adult gift buyer. Child on camera is not required." : "Adult household buyer.",
      createdAt: now(),
    };
    db.families.push(family);
  }
  let sku = db.skus.find((row) => row.catalogProductId === input.product.id && row.variantLabel === variantLabel && row.componentCount === componentCount);
  if (!sku) {
    sku = {
      id: randomUUID(),
      familyId: family.id,
      catalogProductId: input.product.id,
      revision: 1,
      variantLabel,
      componentCount,
      color: null,
      modelId: input.product.providerProductId || null,
      assets: { ...EMPTY_FACTORY_ASSETS },
      createdAt: now(),
    };
    db.skus.push(sku);
  }
  rememberAssets(sku, input.product);
  const affiliateDestination = (input.product.affiliateUrl || "").trim();
  const sourceDestination = (input.product.sourceUrl || "").trim();
  const destination = input.destinationUrl != null
    ? input.destinationUrl.trim()
    : affiliateDestination && affiliateDestination !== sourceDestination
      ? affiliateDestination
      : "";
  let listing = db.listings.find((row) => row.skuId === sku!.id && row.market === market.id && row.sourceUrl === (input.product.sourceUrl || destination));
  if (!listing) {
    listing = {
      id: randomUUID(),
      skuId: sku.id,
      market: market.id,
      marketplace: input.product.provider || "other",
      sourceUrl: input.product.sourceUrl || destination,
      merchantProductId: input.product.providerProductId || null,
      equivalence: "PROPOSED",
      availability: "UNKNOWN",
      createdAt: now(),
    };
    db.listings.push(listing);
  }
  db.snapshots.push({
    id: randomUUID(),
    listingId: listing.id,
    observedAt: now(),
    title: input.product.title,
    price: input.product.price || null,
    currency: input.product.currency ? input.product.currency.toUpperCase() : null,
    confirmation: "EXTRACTED",
    extractor: "catalog",
  });
  pushFact(db, {
    skuId: sku.id,
    listingId: listing.id,
    statement: input.product.title,
    state: "EXTRACTED",
    sourceLevel: "LISTING",
    kind: "LISTING",
  });
  for (const feature of input.product.features || []) {
    pushFact(db, {
      skuId: sku.id,
      listingId: listing.id,
      statement: feature,
      state: "EXTRACTED",
      sourceLevel: "LISTING",
      kind: "LISTING",
    });
  }
  const production: FactoryProduction = {
    id: randomUUID(),
    revision: 1,
    skuId: sku.id,
    listingId: listing.id,
    market: market.id,
    locale: input.locale,
    placement: input.placement,
    durationMs,
    aspectRatio: "9:16",
    recipeId: recipe?.id || null,
    creatorMode: recipe?.creator || "HANDS",
    stage: "DRAFT",
    issue: "",
    allowUnpriced: false,
    parentId: null,
    destinationUrl: destination,
    destinationVersionId: input.destinationVersionId || null,
    pinnedSkuRevision: input.pinnedSkuRevision ?? null,
    createdAt: now(),
    updatedAt: now(),
  };
  refresh(db, production);
  if (recipe) applyOperatorDecision(db, production, recipe.id);
  db.productions.unshift(production);
  db.idempotency.push({ key, productionId: production.id });
  db.idempotency = db.idempotency.slice(-200);
  writeFactoryV2(db);
  return { production, created: true, db };
}

function requireProduction(db: Db, id: string, expectedRevision: number) {
  const production = db.productions.find((row) => row.id === id);
  if (!production) throw new Error("Production not found");
  if (production.revision !== expectedRevision) throw new Error("This production changed. Reload it and try again.");
  return production;
}

export function confirmListingEquivalence(listingId: string, equivalence: Equivalence) {
  if (equivalence === "PROPOSED") throw new Error("Confirm or reject the link");
  const db = readFactoryV2();
  const listing = db.listings.find((row) => row.id === listingId);
  if (!listing) throw new Error("Listing not found");
  listing.equivalence = equivalence;
  for (const production of db.productions) {
    if (production.listingId === listing.id) {
      dropPlan(production);
      production.revision += 1;
      refresh(db, production);
    }
  }
  writeFactoryV2(db);
  return db;
}

export function confirmFactoryFact(factId: string) {
  const db = readFactoryV2();
  const fact = db.facts.find((row) => row.id === factId);
  if (!fact) throw new Error("Fact not found");
  fact.state = "CONFIRMED";
  for (const production of db.productions) {
    if (production.skuId === fact.skuId) {
      dropPlan(production);
      production.revision += 1;
      refresh(db, production);
    }
  }
  writeFactoryV2(db);
  return db;
}

export function skipLocalOffer(productionId: string, expectedRevision: number) {
  const db = readFactoryV2();
  const production = requireProduction(db, productionId, expectedRevision);
  production.allowUnpriced = true;
  production.revision += 1;
  refresh(db, production);
  writeFactoryV2(db);
  return production;
}

export function addFactoryListing(input: { skuId: string; market: string; sourceUrl: string; marketplace?: string }) {
  const market = marketOf(input.market);
  if (!market) throw new Error("Unknown market");
  const sourceUrl = input.sourceUrl.trim();
  if (!sourceUrl) throw new Error("Save the URL even when the listing cannot be read");
  const db = readFactoryV2();
  const sku = db.skus.find((row) => row.id === input.skuId);
  if (!sku) throw new Error("SKU not found");
  const listing: FactoryListing = {
    id: randomUUID(),
    skuId: sku.id,
    market: market.id,
    marketplace: input.marketplace || "other",
    sourceUrl,
    merchantProductId: null,
    equivalence: "PROPOSED",
    availability: "UNKNOWN",
    createdAt: now(),
  };
  db.listings.push(listing);
  db.snapshots.push({
    id: randomUUID(),
    listingId: listing.id,
    observedAt: now(),
    title: sourceUrl,
    price: null,
    currency: null,
    confirmation: "EXTRACTED",
    extractor: "manual",
  });
  writeFactoryV2(db);
  return { listing, db };
}

export function splitFactorySku(input: { fromSkuId: string; variantLabel: string; componentCount: number | null }) {
  const db = readFactoryV2();
  const from = db.skus.find((row) => row.id === input.fromSkuId);
  if (!from) throw new Error("SKU not found");
  const variantLabel = input.variantLabel.trim();
  if (!variantLabel) throw new Error("Name the different package");
  if (variantLabel === from.variantLabel && input.componentCount === from.componentCount) {
    throw new Error("A different package needs a different label or component count");
  }
  const sku: FactorySku = {
    id: randomUUID(),
    familyId: from.familyId,
    catalogProductId: null,
    revision: 1,
    variantLabel,
    componentCount: input.componentCount,
    color: null,
    modelId: null,
    createdAt: now(),
  };
  db.skus.push(sku);
  writeFactoryV2(db);
  return { sku, db };
}

export function setProductionRecipe(productionId: string, expectedRevision: number, recipeId: string) {
  const recipe = FACTORY_V2_RECIPES.find((row) => row.id === recipeId);
  if (!recipe) throw new Error("Unknown pilot recipe");
  const db = readFactoryV2();
  const production = requireProduction(db, productionId, expectedRevision);
  const sku = db.skus.find((row) => row.id === production.skuId);
  const family = db.families.find((row) => row.id === sku?.familyId);
  if (family && family.category !== "other" && family.category !== recipe.category) {
    throw new Error(`${recipe.label} does not fit this product category`);
  }
  production.recipeId = recipe.id;
  production.creatorMode = recipe.creator;
  dropPlan(production);
  applyOperatorDecision(db, production, recipe.id);
  production.revision += 1;
  refresh(db, production);
  writeFactoryV2(db);
  return production;
}

export function saveBenchmarkNotes(input: {
  beats: { id: string; onScreenText: string; uncertainty: string; adapt: string }[];
  lines: { beatId: string; structureOnly: string }[];
}) {
  const db = readFactoryV2();
  const seenBeats = new Set<string>();
  for (const beat of input.beats) {
    if (seenBeats.has(beat.id)) throw new Error("Duplicate benchmark beat");
    seenBeats.add(beat.id);
    const row = db.benchmark.beats.find((item) => item.id === beat.id);
    if (!row) throw new Error("Unknown benchmark beat");
    row.onScreenText = captionNote(String(beat.onScreenText || ""));
    row.uncertainty = clipNote(String(beat.uncertainty || ""), "uncertainty");
    row.adapt = cleanStructure(String(beat.adapt || ""), "borrow note");
  }
  const seenLines = new Set<string>();
  for (const line of input.lines) {
    if (seenLines.has(line.beatId)) throw new Error("Duplicate script line");
    seenLines.add(line.beatId);
    const row = db.benchmark.referenceScript.lines.find((item) => item.beatId === line.beatId);
    if (!row) throw new Error("Unknown script line");
    row.structureOnly = cleanStructure(String(line.structureOnly || ""), "structure line");
  }
  db.benchmark.notesEditedAt = now();
  db.benchmark.speech = "unknown";
  db.benchmark.performance = "unknown";
  db.benchmark.review = "visual_only";
  writeFactoryV2(db);
  return db.benchmark;
}

const FACT_KINDS: FactKind[] = ["LISTING", "CONTENTS", "USE", "REFERENCE", "AGE"];

const ASSET_GAP: Record<FactoryAssetKey, string> = {
  productAppearance: "a photo of this exact product",
  localPackaging: "a photo of this SKU's own package",
  operationReference: "footage of this SKU being operated",
  outputState: "footage of the result",
  adultIdentity: "a locked adult face",
  playReference: "footage of one play episode",
  assemblyReference: "footage of the build",
};

export type FactoryNext = { label: string; tab: "brief" | "script" | "render" };

export type FactoryReadiness = { id: "listing" | "images" | "reference" | "claims" | "audio"; label: string; done: boolean; action: string };

export type FactoryAssessment = {
  eligibleRecipeIds: string[];
  rejected: { recipeId: string; label: string; missing: string[] }[];
  planBlockers: string[];
  approvalBlockers: string[];
  inputs: FactoryReadiness[];
  planningMode: "TEMPLATE" | "REFERENCE_RECREATE";
  next: FactoryNext;
};

type FactContext = {
  category: FactoryCategory;
  assets: FactoryAssets;
  contents: boolean;
  use: boolean;
  reference: boolean;
  age: boolean;
};

function skuAssets(sku: FactorySku | undefined): FactoryAssets {
  if (sku && Array.isArray(sku.media)) {
    const out = { ...EMPTY_FACTORY_ASSETS };
    for (const ref of sku.media) {
      if (!ref.id || !ref.url) continue;
      if (ref.role in out) out[ref.role] = true;
    }
    return out;
  }
  return { ...EMPTY_FACTORY_ASSETS, ...sku?.assets };
}

function factContext(db: Db, production: FactoryProduction): FactContext {
  const sku = db.skus.find((row) => row.id === production.skuId);
  const family = db.families.find((row) => row.id === sku?.familyId);
  const confirmed = db.facts.filter((fact) => fact.skuId === production.skuId && fact.state === "CONFIRMED");
  return {
    category: family?.category || "other",
    assets: skuAssets(sku),
    contents: confirmed.some((fact) => fact.kind === "CONTENTS"),
    use: confirmed.some((fact) => fact.kind === "USE"),
    reference: confirmed.some((fact) => fact.kind === "REFERENCE"),
    age: confirmed.some((fact) => fact.kind === "AGE"),
  };
}

function gapsFor(recipeId: string, ctx: FactContext) {
  const recipe = FACTORY_V2_RECIPES.find((row) => row.id === recipeId);
  if (!recipe) return ["Unknown recipe"];
  if (ctx.category === "other") return ["a home-gadget or preschool-toy category"];
  if (recipe.category !== ctx.category) return ["the matching product category"];
  const missing: string[] = [];
  const need = (key: FactoryAssetKey) => {
    if (!ctx.assets[key]) missing.push(ASSET_GAP[key]);
  };
  need("productAppearance");
  if (recipeId === "HOME_HANDS_DEMO") {
    need("operationReference");
    need("outputState");
    if (!ctx.use) missing.push("a confirmed supported use");
  } else if (recipeId === "HOME_CREATOR_DEMO") {
    need("adultIdentity");
    need("operationReference");
    if (!ctx.use) missing.push("a confirmed supported use");
  } else if (recipeId === "HOME_UNBOX_FIRST_USE") {
    need("localPackaging");
    if (!ctx.contents) missing.push("confirmed contents");
    need("operationReference");
    if (!ctx.use) missing.push("a confirmed supported use");
    if (!ctx.reference) missing.push("a confirmed product reference");
  } else if (recipeId === "TOY_UNBOX_FIRST_PLAY") {
    need("localPackaging");
    if (!ctx.contents) missing.push("confirmed contents");
    need("playReference");
    need("adultIdentity");
    if (!ctx.age) missing.push("age evidence for this SKU");
    if (!ctx.reference) missing.push("a confirmed product reference");
  } else if (recipeId === "TOY_UNBOX_BUILD_PLAY") {
    if (!ctx.contents) missing.push("confirmed contents");
    need("assemblyReference");
    need("playReference");
    need("outputState");
    if (!ctx.age) missing.push("age evidence for this SKU");
    if (!ctx.reference) missing.push("a confirmed product reference");
  }
  return missing;
}

function latestSnapshot(db: Db, listingId: string) {
  return db.snapshots.filter((row) => row.listingId === listingId).sort((a, b) => b.observedAt.localeCompare(a.observedAt))[0];
}

function productImageSelected(db: Db, production: FactoryProduction) {
  const sku = db.skus.find((row) => row.id === production.skuId);
  return Boolean((sku?.media || []).some((row) => row.role === "productAppearance" && row.id && row.url.startsWith("/api/media/") && !row.url.includes("/ugc-references/")));
}

function planText(production: FactoryProduction) {
  return [production.plan?.spoken, ...(production.plan?.beats || []).map((beat) => beat.spoken || "")].join("\n");
}

function planMentionsPrice(production: FactoryProduction) {
  return /(?:\busd\b|\bidr\b|\bmyr\b|\brp\b|\brm\s?\d|\$\s?\d|\b\d{1,3}(?:[.,]\d{3})+\b)/i.test(planText(production));
}

function planUsesSourceTestimony(production: FactoryProduction) {
  const captions = (production.plan?.beats || []).map((beat) => beat.onScreen || "").join("\n");
  return /\b(glowing|glowy|halus dan glowing|dulu|pernah pakai|my skin|i have been|huge fan|i am a fan)\b/i.test(`${planText(production)}\n${captions}`);
}

function speechOverflow(production: FactoryProduction) {
  const native = production.audioStrategy !== "EXTERNAL_TTS";
  return (production.plan?.beats || []).filter((beat) => {
    const delivery = legacyDelivery(beat);
    if (delivery === "SILENT" || !beat.spoken) return false;
    const end = beat.targetEndSec ?? beat.sourceEndSec ?? 0;
    const start = beat.targetStartSec ?? beat.sourceStartSec ?? 0;
    const windowSec = Math.max(0, end - start);
    if (native) return estimateSpeechSec(beat.spoken, delivery) > windowSec + 0.4;
    if (beat.timing !== "measured") return true;
    return (beat.estimatedSec || 0) > windowSec + 0.2;
  });
}

function catalogShopFor(db: Db, production: FactoryProduction) {
  const sku = db.skus.find((row) => row.id === production.skuId);
  if (!sku?.catalogProductId) return null;
  const catalog = readSharedCatalog();
  const catalogSku = catalog.skus.find((row) => row.legacyProductId === sku.catalogProductId || row.id === sku.catalogProductId);
  if (!catalogSku) return null;
  const shops = catalog.listings.filter((row) => row.skuId === catalogSku.id && row.market === production.market && row.marketplace !== "amazon");
  return shops.find((row) => row.variantReview === "REVIEWED") || shops[0] || null;
}

function referenceApprovalBlockers(db: Db, production: FactoryProduction) {
  const blockers: string[] = [];
  const listing = db.listings.find((row) => row.id === production.listingId);
  const shop = catalogShopFor(db, production);
  const listingBlocker = targetListingBlocker({ market: production.market, factoryMarketplace: listing?.marketplace || null, shop });
  if (listingBlocker) blockers.push(listingBlocker);
  if (planMentionsPrice(production)) {
    const market = marketOf(production.market);
    const currency = (latestSnapshot(db, production.listingId)?.currency || "").toUpperCase();
    if (currency && market && currency !== market.currency) blockers.push(`The script names a price, and the stored offer is ${currency}, not ${market.currency}.`);
  }
  if (!productImageSelected(db, production)) blockers.push("Select a product image. The reference video is source footage, not the generation plate.");
  if (planUsesSourceTestimony(production)) blockers.push("The copy still uses the source creator's result or past experience.");
  const mismatched = (production.plan?.beats || []).filter((beat) => captionNeedsReview(beat.spoken || "", beat.onScreen || ""));
  if (mismatched.length) blockers.push(`On-screen text does not match the spoken line: ${mismatched.map((beat) => beat.shotId || beat.id).join(", ")}.`);
  const overflow = speechOverflow(production);
  if (overflow.length) blockers.push(`${production.audioStrategy === "EXTERNAL_TTS" ? "Measured speech" : "Estimated speech"} is longer than the scene: ${overflow.map((beat) => beat.shotId || beat.id).join(", ")}.`);
  if (!(production.pinnedReferences || []).length) blockers.push("Pin the reference analysis before approval.");
  return blockers;
}

export function assessFactoryProduction(db: Db, production: FactoryProduction): FactoryAssessment {
  const ctx = factContext(db, production);
  const mode = production.planningMode === "REFERENCE_RECREATE" ? "REFERENCE_RECREATE" : "TEMPLATE";
  const rejected = FACTORY_V2_RECIPES.map((recipe) => ({
    recipeId: recipe.id,
    label: recipe.label,
    missing: gapsFor(recipe.id, ctx),
  })).filter((row) => row.missing.length > 0);
  const eligibleRecipeIds = FACTORY_V2_RECIPES.map((recipe) => recipe.id).filter((id) => gapsFor(id, ctx).length === 0);
  const listing = db.listings.find((row) => row.id === production.listingId);
  const market = marketOf(production.market);
  const currency = (latestSnapshot(db, production.listingId)?.currency || "").toUpperCase();
  const verified = Boolean(listing && listing.equivalence === "VERIFIED");
  const imageReady = productImageSelected(db, production);
  const pinned = (production.pinnedReferences || []).length > 0;
  const testimony = planUsesSourceTestimony(production);
  const overflow = speechOverflow(production);
  const priced = planMentionsPrice(production);
  const inputs: FactoryReadiness[] = [
    { id: "listing", label: verified ? "Target listing is verified for this SKU." : "Target listing is not confirmed as this physical SKU.", done: verified, action: "Review SKU/listing" },
    { id: "images", label: imageReady ? "Product plate selected." : "No product image is selected. Catalog photos and the reference video stay separate.", done: imageReady, action: "Select product images" },
    { id: "reference", label: pinned ? "A reference analysis is pinned." : "No reference analysis is pinned.", done: pinned, action: "Analyze reference" },
    { id: "claims", label: testimony ? "The copy still uses the source creator's experience." : priced ? "The copy names a price." : "The copy does not use an unreviewed result claim or a price.", done: !testimony && !priced, action: "Review claims" },
    { id: "audio", label: production.audioStrategy === "EXTERNAL_TTS" ? (overflow.length ? "Measured speech is longer than a shot window." : "External voiceover is measured inside the shot windows.") : (overflow.length ? "Estimated speech is longer than a scene." : "Speech length is an estimate. Native audio is not a saved voice take."), done: production.audioStrategy === "EXTERNAL_TTS" ? !overflow.length && Boolean(production.plan?.beats.some((beat) => beat.timing === "measured" || !beat.spoken)) : !overflow.length, action: production.audioStrategy === "EXTERNAL_TTS" ? "Measure voice" : "Review the estimate" },
  ];
  const planBlockers: string[] = [];
  const approvalBlockers = mode === "REFERENCE_RECREATE" ? referenceApprovalBlockers(db, production) : [];
  if (mode === "REFERENCE_RECREATE") {
    if (!pinned) planBlockers.push("Analyze the reference and pin the blueprint.");
  } else {
    if (!verified) planBlockers.push("Review this listing on the product before a plan.");
    if (currency && market && currency !== market.currency && !production.allowUnpriced) {
      planBlockers.push(`Listing price is ${currency}, not ${market.currency}. It was not converted.`);
    }
    if (!production.recipeId) planBlockers.push("Pick a pilot recipe before a plan.");
    else {
      const missing = rejected.find((row) => row.recipeId === production.recipeId)?.missing || [];
      for (const item of missing) planBlockers.push(`Missing ${item}.`);
    }
  }
  if (production.durationMs < 10000 || production.durationMs > 30000) planBlockers.push("Duration must stay between 10 and 30 seconds.");
  let next: FactoryNext;
  if (mode === "REFERENCE_RECREATE") {
    if (!pinned) next = { label: "Analyze reference", tab: "brief" };
    else if (!production.plan) next = { label: "Write the plan", tab: "script" };
    else if (approvalBlockers.length) next = { label: inputs.find((row) => !row.done)?.action || "Review missing inputs", tab: "brief" };
    else if (!production.planApprovedAt) next = { label: "Approve the plan", tab: "script" };
    else next = { label: "Review the video", tab: "render" };
  } else if (!verified) next = { label: "Review the listing", tab: "brief" };
  else if (currency && market && currency !== market.currency && !production.allowUnpriced) next = { label: "Resolve the price", tab: "brief" };
  else if (!production.recipeId || production.decision?.status === "BLOCKED" || !production.decision) next = { label: "Review missing inputs", tab: "brief" };
  else if (planBlockers.length) next = { label: "Review missing inputs", tab: "brief" };
  else if (!production.plan) next = { label: "Write the plan", tab: "script" };
  else if (!production.planApprovedAt) next = { label: "Approve the plan", tab: "script" };
  else next = { label: "Review the video", tab: "render" };
  return { eligibleRecipeIds, rejected, planBlockers, approvalBlockers, inputs, planningMode: mode, next };
}

function applyOperatorDecision(db: Db, production: FactoryProduction, recipeId: string) {
  const recipe = FACTORY_V2_RECIPES.find((row) => row.id === recipeId);
  if (!recipe) throw new Error("Unknown pilot recipe");
  const report = assessFactoryProduction(db, production);
  const missing = report.rejected.find((row) => row.recipeId === recipeId)?.missing || [];
  production.decision = {
    status: "SELECTED",
    eligibleRecipeIds: report.eligibleRecipeIds,
    rejected: report.rejected.map((row) => ({ recipeId: row.recipeId, missing: row.missing })),
    selectedRecipeId: recipe.id,
    decisionSource: "OPERATOR",
    modelId: null,
    confidence: null,
    evidenceLabel: "HYPOTHESIS",
    summary: missing.length
      ? `Operator override. ${recipe.label} is still a pilot and is missing ${missing.join(", ")}. Jev was not asked. This is an untested hypothesis, not a measured result.`
      : `Operator selected ${recipe.label}. It was already feasible. Jev was not asked. Untested hypothesis. No comparable measured performance is on file. The recipe stays a pilot.`,
    createdAt: now(),
  };
}

function decisionRejected(report: FactoryAssessment) {
  return report.rejected.map((row) => ({ recipeId: row.recipeId, missing: row.missing }));
}

export function addFactoryFact(input: { skuId: string; statement: string; kind: FactKind }) {
  const statement = input.statement.replace(/\s+/g, " ").trim();
  if (!statement) throw new Error("Write the fact");
  if (statement.length > 400) throw new Error("Keep the fact under 400 characters");
  if (!FACT_KINDS.includes(input.kind)) throw new Error("Unknown fact kind");
  const db = readFactoryV2();
  const sku = db.skus.find((row) => row.id === input.skuId);
  if (!sku) throw new Error("SKU not found");
  pushFact(db, {
    skuId: sku.id,
    listingId: null,
    statement,
    state: "EXTRACTED",
    sourceLevel: "OPERATOR_OBSERVATION",
    kind: input.kind,
  });
  for (const production of db.productions) {
    if (production.skuId !== sku.id) continue;
    dropPlan(production);
    production.revision += 1;
    refresh(db, production);
  }
  writeFactoryV2(db);
  return db;
}

export function setFactoryAsset(skuId: string, key: FactoryAssetKey, present: boolean, mediaUrl?: string) {
  if (!Object.prototype.hasOwnProperty.call(EMPTY_FACTORY_ASSETS, key)) throw new Error("Unknown asset");
  const db = readFactoryV2();
  const sku = db.skus.find((row) => row.id === skuId);
  if (!sku) throw new Error("SKU not found");
  const media = sku.media ? sku.media.slice() : [];
  if (present) {
    const url = (mediaUrl || "").trim();
    if (!url.startsWith("/api/media/")) throw new Error("Attach a stored media id.");
    if (!media.some((row) => row.role === key && row.url === url)) {
      media.push({ id: randomUUID(), role: key, url, source: "operator" });
    }
  } else {
    sku.media = media.filter((row) => row.role !== key);
    for (const production of db.productions) {
      if (production.skuId !== sku.id) continue;
      dropPlan(production);
      production.revision += 1;
      refresh(db, production);
    }
    writeFactoryV2(db);
    return db;
  }
  sku.media = media;
  for (const production of db.productions) {
    if (production.skuId !== sku.id) continue;
    dropPlan(production);
    production.revision += 1;
    refresh(db, production);
  }
  writeFactoryV2(db);
  return db;
}

export type RecipeDecider = (input: {
  state: Record<string, unknown>;
  criteria: Record<string, string>;
}) => Promise<{ choice: string; modelId: string; confidence: number | null }>;

function confirmedPinnedCatalogFacts(production: FactoryProduction) {
  const ids = new Set((production.pinnedReferences || []).flatMap((row) => row.factIds || []));
  if (!ids.size) return [];
  return readSharedCatalog().facts
    .filter((fact) => ids.has(fact.id) && fact.state === "CONFIRMED")
    .map((fact) => ({ id: fact.id, kind: fact.kind || "REFERENCE", statement: fact.statement }));
}

function decisionState(db: Db, production: FactoryProduction, eligible: string[]) {
  const sku = db.skus.find((row) => row.id === production.skuId);
  const family = db.families.find((row) => row.id === sku?.familyId);
  const factoryFacts = db.facts
    .filter((fact) => fact.skuId === production.skuId && fact.state === "CONFIRMED")
    .map((fact) => ({ id: fact.id, kind: fact.kind || "LISTING", statement: fact.statement }));
  const facts = [...factoryFacts];
  for (const fact of confirmedPinnedCatalogFacts(production)) {
    if (!facts.some((row) => row.id === fact.id || row.statement === fact.statement)) facts.push(fact);
  }
  return {
    sku: sku?.variantLabel || "",
    family: family?.label || "",
    category: family?.category || "other",
    market: production.market,
    locale: production.locale,
    placement: production.placement,
    durationSec: Math.round(production.durationMs / 1000),
    confirmedFacts: facts,
    eligibleRecipeIds: eligible,
    performance: "unknown",
    reviewedReferences: reviewedReferencePatterns(production.pinnedReferences || []),
    note: "Choose one eligible pilot from the confirmed facts. Reviewed reference patterns are structure only. They are not verified claims, sales results, or a video to watch. A score is not a virality or conversion probability. The recipe stays a pilot.",
  };
}

async function jevPick(state: Record<string, unknown>, criteria: Record<string, string>) {
  const { jevDecide, JEV_MODEL } = await import("./jev");
  const result = await jevDecide(state, {
    recipe: {
      type: "choice",
      instructions: "Choose the one pilot recipe that fits this SKU and the confirmed facts. Choose only an id from the list. Do not invent a recipe. This choice is not a virality or conversion score.",
      criteria,
    },
  });
  const answer = result.answers?.recipe;
  const choice = answer && answer.type === "choice" ? answer.choice : "";
  const raw = answer && typeof answer === "object" && "confidence" in answer ? (answer as { confidence?: unknown }).confidence : null;
  const confidence = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
  return { choice, modelId: result.model || JEV_MODEL, confidence };
}

export async function decideFactoryRecipe(productionId: string, expectedRevision: number, decider?: RecipeDecider) {
  const db = readFactoryV2();
  const production = requireProduction(db, productionId, expectedRevision);
  const report = assessFactoryProduction(db, production);
  const eligible = report.eligibleRecipeIds;
  if (eligible.length === 0) {
    production.decision = {
      status: "BLOCKED",
      eligibleRecipeIds: [],
      rejected: decisionRejected(report),
      selectedRecipeId: production.recipeId,
      decisionSource: production.recipeId ? "OPERATOR" : null,
      modelId: null,
      confidence: null,
      evidenceLabel: "INSUFFICIENT",
      summary: production.recipeId
        ? "Jev was not called. No pilot is feasible yet. The current recipe stays an operator override and stays a pilot."
        : "Jev was not called. No pilot recipe has the facts and assets it needs.",
      createdAt: now(),
    };
    production.revision += 1;
    refresh(db, production);
    writeFactoryV2(db);
    return { production, jevCalled: false };
  }
  if (eligible.length === 1) {
    const recipe = FACTORY_V2_RECIPES.find((row) => row.id === eligible[0]);
    if (!recipe) throw new Error("Unknown pilot recipe");
    production.recipeId = recipe.id;
    production.creatorMode = recipe.creator;
    dropPlan(production);
    production.decision = {
      status: "SELECTED",
      eligibleRecipeIds: eligible,
      rejected: decisionRejected(report),
      selectedRecipeId: recipe.id,
      decisionSource: "DETERMINISTIC",
      modelId: null,
      confidence: null,
      evidenceLabel: "HYPOTHESIS",
      summary: `${recipe.label} is the only feasible pilot, so Jev was not called. Untested hypothesis. No comparable measured performance is on file. The recipe stays a pilot.`,
      createdAt: now(),
    };
    production.revision += 1;
    refresh(db, production);
    writeFactoryV2(db);
    return { production, jevCalled: false };
  }
  const criteria: Record<string, string> = {};
  for (const id of eligible) {
    const recipe = FACTORY_V2_RECIPES.find((row) => row.id === id);
    if (recipe) criteria[id] = `${recipe.label}. ${recipe.needs}`;
  }
  const state = decisionState(db, production, eligible);
  const picked = decider ? await decider({ state, criteria }) : await jevPick(state, criteria);
  if (!eligible.includes(picked.choice)) throw new Error("The decision was outside the feasible recipes. It was not saved.");
  const recipe = FACTORY_V2_RECIPES.find((row) => row.id === picked.choice);
  if (!recipe) throw new Error("Unknown pilot recipe");
  production.recipeId = recipe.id;
  production.creatorMode = recipe.creator;
  dropPlan(production);
  production.decision = {
    status: "SELECTED",
    eligibleRecipeIds: eligible,
    rejected: decisionRejected(report),
    selectedRecipeId: recipe.id,
    decisionSource: "JEV",
    modelId: picked.modelId,
    confidence: typeof picked.confidence === "number" && Number.isFinite(picked.confidence) ? picked.confidence : null,
    evidenceLabel: "HYPOTHESIS",
    summary: `${recipe.label} was chosen from the feasible pilots. Untested hypothesis. No comparable measured performance is on file. The recipe stays a pilot.`,
    createdAt: now(),
  };
  production.revision += 1;
  refresh(db, production);
  writeFactoryV2(db);
  return { production, jevCalled: true };
}

export type PlanPromptInput = {
  market: string;
  locale: string;
  placement: string;
  durationSec: number;
  recipeId: string;
  recipeLabel: string;
  creatorMode: string;
  skuLabel: string;
  variantLabel: string;
  facts: { id: string; kind: string; statement: string }[];
  references: ReviewedReferencePattern[];
};

export type PlanDraft = {
  modelId: string;
  concept: string;
  spoken: string;
  delivery: string;
  audio: string;
  edit: string;
  beats: FactoryPlanBeat[];
  creativeBeats?: FactoryPlan["creativeBeats"];
};

const COPIED_SAMPLE = /flexstyle|heat damage|shlechua|highly recommend|strong airflow|air drying|travel companion/i;

function acceptPlan(draft: PlanDraft, db: Db, production: FactoryProduction): FactoryPlan {
  const concept = String(draft.concept || "").replace(/\s+/g, " ").trim();
  const spoken = String(draft.spoken || "").trim();
  const delivery = String(draft.delivery || "").replace(/\s+/g, " ").trim();
  const audio = String(draft.audio || "").replace(/\s+/g, " ").trim();
  const edit = String(draft.edit || "").replace(/\s+/g, " ").trim();
  const modelId = String(draft.modelId || "").trim();
  if (!concept || !spoken || !delivery || !audio || !edit || !modelId || !Array.isArray(draft.beats) || draft.beats.length === 0) {
    throw new Error("Astra returned an incomplete plan. It was not saved.");
  }
  const blob = `${concept}\n${spoken}\n${delivery}\n${audio}\n${edit}`;
  if (/natural,\s*viral\s*ugc/i.test(blob)) throw new Error("The plan used a generic prompt. It was not saved.");
  const confirmed = db.facts.filter((fact) => fact.skuId === production.skuId && fact.state === "CONFIRMED");
  const known = confirmed.map((fact) => fact.statement).join("\n");
  if (COPIED_SAMPLE.test(blob) && !COPIED_SAMPLE.test(known)) throw new Error("The plan copies a sample claim that is not a confirmed fact. It was not saved.");
  const beats: FactoryPlanBeat[] = draft.beats.map((beat, index) => {
    const action = String(beat.action || "").replace(/\s+/g, " ").trim();
    const stateIn = String(beat.stateIn || "").replace(/\s+/g, " ").trim();
    const stateOut = String(beat.stateOut || "").replace(/\s+/g, " ").trim();
    const factIds = Array.isArray(beat.factIds) ? beat.factIds.map(String) : [];
    if (!action || !stateIn || !stateOut) throw new Error("A shot is missing the action or the start and end state. It was not saved.");
    if (!factIds.length || factIds.some((id) => !confirmed.some((fact) => fact.id === id))) {
      throw new Error("A shot cites a fact that is not confirmed. It was not saved.");
    }
    return {
      id: `beat-${index + 1}`,
      purpose: String(beat.purpose || "").replace(/\s+/g, " ").trim() || "Beat",
      spoken: beat.spoken ? String(beat.spoken).trim() : null,
      onScreen: beat.onScreen ? String(beat.onScreen).trim() : null,
      action,
      stateIn,
      stateOut,
      factIds,
    };
  });
  return {
    status: "DRAFT",
    modelId,
    concept,
    spoken,
    delivery,
    beats,
    audio,
    edit,
    references: (production.pinnedReferences || []).map((row) => ({ referenceId: row.referenceId, analysisVersion: row.analysisVersion })),
    createdAt: now(),
  };
}

export async function writeFactoryPlan(
  productionId: string,
  expectedRevision: number,
  writer: (input: PlanPromptInput) => Promise<PlanDraft>,
  displayName?: string,
) {
  const db = readFactoryV2();
  const production = requireProduction(db, productionId, expectedRevision);
  const report = assessFactoryProduction(db, production);
  if (report.planBlockers.length) throw new Error(`Cannot write a plan yet. ${report.planBlockers.join(" ")}`);
  const sku = db.skus.find((row) => row.id === production.skuId);
  const family = db.families.find((row) => row.id === sku?.familyId);
  const recipe = FACTORY_V2_RECIPES.find((row) => row.id === production.recipeId);
  if (!recipe) throw new Error("Pick a pilot recipe before a plan.");
  const facts = db.facts
    .filter((fact) => fact.skuId === production.skuId && fact.state === "CONFIRMED")
    .map((fact) => ({ id: fact.id, kind: fact.kind || "LISTING", statement: fact.statement }));
  for (const fact of confirmedPinnedCatalogFacts(production)) {
    if (!facts.some((row) => row.id === fact.id || row.statement === fact.statement)) facts.push(fact);
  }
  const draft = await writer({
    market: production.market,
    locale: production.locale,
    placement: production.placement,
    durationSec: Math.round(production.durationMs / 1000),
    recipeId: recipe.id,
    recipeLabel: recipe.label,
    creatorMode: production.creatorMode,
    skuLabel: (displayName || "").replace(/\s+/g, " ").trim() || family?.label || "",
    variantLabel: sku?.variantLabel || "",
    facts,
    references: reviewedReferencePatterns(production.pinnedReferences || []),
  });
  production.plan = acceptPlan(draft, db, production);
  production.planApprovedAt = null;
  production.revision += 1;
  refresh(db, production);
  writeFactoryV2(db);
  return production;
}

export async function astraFactoryPlan(input: PlanPromptInput): Promise<PlanDraft> {
  const { factoryScriptLlm, llmClient, FACTORY_ASTRA_MODEL } = await import("./llm");
  const { assertSpendAllowed } = await import("./spend-cap");
  const { logCloudUsage } = await import("./cloud-usage");
  const cfg = factoryScriptLlm(FACTORY_ASTRA_MODEL);
  if (!/127\.0\.0\.1:1234|localhost:1234|11434/.test(cfg.baseURL)) assertSpendAllowed({ model: cfg.model, tokens: 4000 });
  const client = llmClient(cfg);
  const user = [
    `SKU: ${input.skuLabel}`,
    `Package: ${input.variantLabel}`,
    `Market ${input.market}, locale ${input.locale}, placement ${input.placement}.`,
    `One ${input.durationSec}-second vertical video. Recipe ${input.recipeLabel} (${input.recipeId}) is still a pilot. Creator mode ${input.creatorMode}.`,
    `Confirmed facts: ${JSON.stringify(input.facts)}`,
    "Write this SKU's own arc for the requested duration. Do not replay another video's attachment tour, product claims, creator, or testimonials.",
    "A recommendation is optional. Fit the ending to this SKU and this duration.",
    "Beats are semantic edit beats, not one provider clip per sentence.",
    "Each action names who handles which object, what changes, and what the viewer sees. Keep the product anchor consistent.",
    input.references.length
      ? `Reviewed reference patterns, structure only: ${input.references.map((row) => `Reference ${row.referenceId} version ${row.analysisVersion}, relation ${row.relation || "unreviewed"}, hook ${row.hook || "unknown"}, beats ${row.beats.join("; ") || "unknown"}, audio ${row.audio}, CTA ${row.cta || "unknown"}, unknown ${row.unknown.join(", ") || "none"}.`).join(" ")} Use that structure beside this SKU's confirmed facts. Do not copy creator wording, and do not treat a reference as a verified claim or a sales result.`
      : "No reviewed reference pattern is pinned.",
    "Cite only the confirmed fact ids. Hands mode shows no face. Do not invent a transcript of another video.",
    "Do not write the phrase natural, viral UGC.",
    'Return ONLY JSON {"concept":string,"spoken":string,"delivery":string,"audio":string,"edit":string,"beats":[{"purpose":string,"spoken":string|null,"onScreen":string|null,"action":string,"stateIn":string,"stateOut":string,"factIds":string[]}]}',
  ].join("\n");
  const started = Date.now();
  try {
    const completion = await client.chat.completions.create({
      model: cfg.model,
      reasoning_effort: "low",
      messages: [
        { role: "system", content: "You write one UGC shot plan from confirmed product facts. Return JSON only." },
        { role: "user", content: user },
      ],
    });
    const usage = completion.usage;
    const inputTokens = usage?.prompt_tokens || 0;
    const outputTokens = usage?.completion_tokens || 0;
    const raw = (completion.choices[0]?.message?.content || "").replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    let parsed: Partial<PlanDraft> & { beats?: FactoryPlanBeat[] };
    try {
      parsed = JSON.parse(raw) as Partial<PlanDraft> & { beats?: FactoryPlanBeat[] };
    } catch {
      logCloudUsage({
        at: new Date().toISOString(),
        accountId: "Script_UGC",
        providerId: "openai",
        model: "Script_UGC",
        ok: false,
        ms: Date.now() - started,
        baseURL: cfg.baseURL,
        kind: "Script_UGC",
        tokens: inputTokens + outputTokens,
        units: inputTokens + outputTokens,
        unit: "token",
        actualUsd: Math.round(((inputTokens / 1_000_000) * 10 + (outputTokens / 1_000_000) * 50) * 1_000_000) / 1_000_000,
        error: "invalid JSON",
      });
      throw new Error("Astra returned an incomplete plan. It was not saved.");
    }
    logCloudUsage({
      at: new Date().toISOString(),
      accountId: "Script_UGC",
      providerId: "openai",
      model: "Script_UGC",
      ok: true,
      ms: Date.now() - started,
      baseURL: cfg.baseURL,
      kind: "Script_UGC",
      tokens: inputTokens + outputTokens,
      units: inputTokens + outputTokens,
      unit: "token",
      actualUsd: Math.round(((inputTokens / 1_000_000) * 10 + (outputTokens / 1_000_000) * 50) * 1_000_000) / 1_000_000,
    });
    return {
      modelId: cfg.model,
      concept: String(parsed.concept || ""),
      spoken: String(parsed.spoken || ""),
      delivery: String(parsed.delivery || ""),
      audio: String(parsed.audio || ""),
      edit: String(parsed.edit || ""),
      beats: Array.isArray(parsed.beats) ? parsed.beats : [],
    };
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Astra returned")) throw err;
    const message = err instanceof Error ? err.message : String(err);
    logCloudUsage({
      at: new Date().toISOString(),
      accountId: "Script_UGC",
      providerId: "openai",
      model: "Script_UGC",
      ok: false,
      ms: Date.now() - started,
      baseURL: cfg.baseURL,
      kind: "Script_UGC",
      tokens: 0,
      units: 0,
      unit: "token",
      error: message.slice(0, 160),
    });
    throw new Error(message);
  }
}

export function invalidateApprovalsForBlueprint(referenceId: string, analysisVersion: number, blueprintVersion: number) {
  const db = readFactoryV2();
  let dirty = false;
  for (const production of db.productions) {
    if (production.providerJobId) continue;
    const pin = (production.pinnedReferences || []).find((row) => row.referenceId === referenceId && row.analysisVersion === analysisVersion);
    if (!pin?.blueprintVersion || pin.blueprintVersion >= blueprintVersion || !production.planApprovedAt) continue;
    production.approvalHistory = [...(production.approvalHistory || []), { at: production.planApprovedAt, revision: production.revision, blueprintVersion: pin.blueprintVersion }];
    production.planApprovedAt = null;
    production.revision += 1;
    refresh(db, production);
    dirty = true;
  }
  if (dirty) writeFactoryV2(db);
}

export function approveFactoryPlan(productionId: string, expectedRevision: number) {
  const db = readFactoryV2();
  const production = requireProduction(db, productionId, expectedRevision);
  if (!production.plan) throw new Error("There is no plan to approve.");
  if ((production.pinnedReferences || []).some((pin) => pinnedBlueprintStale(pin))) {
    throw new Error("The blueprint changed after this draft. Approve was not saved. The plan text was left as written.");
  }
  const report = assessFactoryProduction(db, production);
  const blockers = production.planningMode === "REFERENCE_RECREATE" ? report.approvalBlockers : report.planBlockers;
  if (blockers.length) throw new Error(`Cannot approve this plan. ${blockers.join(" ")}`);
  production.planApprovedAt = now();
  production.revision += 1;
  refresh(db, production);
  writeFactoryV2(db);
  return production;
}

/** Drafts opened by Recreate for market keep that path. Approved snapshots stay as stored. */
export function applyStoredRecreationMode(db: Db) {
  let dirty = false;
  for (const row of db.idempotency) {
    if (!row.key.startsWith("ugc-recreate:")) continue;
    const production = db.productions.find((item) => item.id === row.productionId);
    if (!production || production.planApprovedAt || production.providerJobId) continue;
    if (production.planningMode === "REFERENCE_RECREATE") continue;
    production.planningMode = "REFERENCE_RECREATE";
    production.recipeId = null;
    production.revision += 1;
    refresh(db, production);
    dirty = true;
  }
  if (dirty) writeFactoryV2(db);
  return db;
}

export function selectCatalogAnchor(skuId: string, media: { id: string; url: string }) {
  if (!media.url.startsWith("/api/media/") || media.url.includes("/ugc-references/")) throw new Error("The anchor must be a stored product image.");
  const db = readFactoryV2();
  const sku = db.skus.find((row) => row.id === skuId);
  if (!sku) throw new Error("SKU not found");
  const rows = sku.media ? sku.media.slice() : [];
  if (!rows.some((row) => row.role === "productAppearance" && row.url === media.url)) {
    rows.push({ id: media.id, role: "productAppearance", url: media.url, source: "catalog" });
    sku.media = rows;
    writeFactoryV2(db);
  }
  return sku;
}

export function attachTrackedDestination(productionId: string, expectedRevision: number, input: { destinationUrl: string; catalogListingId: string }) {
  const db = readFactoryV2();
  const production = requireProduction(db, productionId, expectedRevision);
  if (production.planApprovedAt || production.providerJobId) throw new Error("The approved plan stays as saved.");
  if (!/^https?:\/\//i.test(input.destinationUrl)) throw new Error("The tracked destination is missing.");
  production.destinationUrl = input.destinationUrl;
  production.catalogListingId = input.catalogListingId;
  production.revision += 1;
  refresh(db, production);
  writeFactoryV2(db);
  return production;
}

export function saveMeasuredVoice(productionId: string, expectedRevision: number, beats: FactoryPlanBeat[], audio: string) {
  const db = readFactoryV2();
  const production = requireProduction(db, productionId, expectedRevision);
  if (!production.plan || production.planApprovedAt || production.providerJobId) throw new Error("The approved plan stays as saved.");
  production.plan.beats = beats;
  production.plan.audio = audio;
  production.revision += 1;
  refresh(db, production);
  writeFactoryV2(db);
  return production;
}

export function releasePinnedFact(factId: string) {
  const db = readFactoryV2();
  let dirty = false;
  for (const production of db.productions) {
    const pins = production.pinnedReferences || [];
    if (!pins.some((pin) => (pin.factIds || []).includes(factId)) || production.providerJobId) continue;
    if (production.planApprovedAt) {
      production.approvalHistory = [...(production.approvalHistory || []), { at: production.planApprovedAt, revision: production.revision, blueprintVersion: pins[0]?.blueprintVersion || 0 }];
      production.planApprovedAt = null;
    }
    production.pinnedReferences = pins.map((pin) => ({ ...pin, factIds: (pin.factIds || []).filter((id) => id !== factId) }));
    production.revision += 1;
    refresh(db, production);
    dirty = true;
  }
  if (dirty) writeFactoryV2(db);
}

export function setFactoryPlanningMode(productionId: string, expectedRevision: number, mode: "TEMPLATE" | "REFERENCE_RECREATE") {
  if (mode !== "TEMPLATE" && mode !== "REFERENCE_RECREATE") throw new Error("Choose template or reference recreation.");
  const db = readFactoryV2();
  const production = requireProduction(db, productionId, expectedRevision);
  if (production.planApprovedAt || production.providerJobId) throw new Error("The approved plan stays as saved.");
  if (mode === "REFERENCE_RECREATE" && !(production.pinnedReferences || []).length) {
    throw new Error("Select a reference before reference recreation.");
  }
  production.planningMode = mode;
  if (mode === "REFERENCE_RECREATE") production.recipeId = null;
  production.revision += 1;
  refresh(db, production);
  writeFactoryV2(db);
  return production;
}

/** Changes the spoken language on one unapproved draft. The market and other drafts stay. */
export function setProductionLocale(productionId: string, expectedRevision: number, locale: string) {
  const db = readFactoryV2();
  const production = requireProduction(db, productionId, expectedRevision);
  if (production.planApprovedAt || production.providerJobId) throw new Error("The approved plan stays as saved.");
  const market = FACTORY_V2_MARKETS.find((row) => row.id === production.market);
  if (!market || !market.locales.includes(locale as (typeof market.locales)[number])) {
    throw new Error(`${production.market} does not use ${locale}.`);
  }
  if (production.locale === locale) return production;
  const previous = production.locale;
  production.locale = locale;
  for (const row of db.idempotency) {
    if (row.productionId !== production.id) continue;
    const parts = row.key.split(":");
    if (parts.length >= 2 && parts[parts.length - 1] === previous && parts[parts.length - 2] === production.market) {
      parts[parts.length - 1] = locale;
      const nextKey = parts.join(":");
      if (!db.idempotency.some((item) => item.key === nextKey)) row.key = nextKey;
    }
  }
  production.revision += 1;
  refresh(db, production);
  writeFactoryV2(db);
  return production;
}

export function refreshStoredStages(db: Db) {
  let dirty = false;
  for (const production of db.productions) {
    const stage = production.stage;
    const issue = production.issue;
    const updatedAt = production.updatedAt;
    refresh(db, production);
    if (production.stage === stage && production.issue === issue) production.updatedAt = updatedAt;
    else dirty = true;
  }
  if (dirty) writeFactoryV2(db);
  return db;
}

export function bindCatalogIdentityMedia(db: Db) {
  let dirty = false;
  for (const sku of db.skus) {
    if (!sku.catalogProductId) continue;
    const product = getProduct(sku.catalogProductId);
    const image = product ? skuIdentityUrl(product) : "";
    if (!image.startsWith("/api/media/")) continue;
    const media = sku.media ? sku.media.slice() : [];
    if (media.some((row) => row.role === "productAppearance" && row.url === image)) {
      sku.media = media;
      continue;
    }
    media.push({ id: `identity:${sku.id}`, role: "productAppearance", url: image, source: "catalog" });
    sku.media = media;
    dirty = true;
  }
  if (dirty) writeFactoryV2(db);
  return db;
}

/** Marks drafts that use this catalog product. Does not change revision, plan text, or approval. */
export function flagDraftFactReview(catalogProductId: string, note: string) {
  const db = readFactoryV2();
  let dirty = false;
  for (const production of db.productions) {
    const sku = db.skus.find((row) => row.id === production.skuId);
    if (sku?.catalogProductId !== catalogProductId || production.providerJobId) continue;
    production.factReview = { at: now(), note };
    dirty = true;
  }
  if (dirty) writeFactoryV2(db);
}

function clearPlanApproval(production: FactoryProduction) {
  if (!production.planApprovedAt) return;
  production.approvalHistory = [...(production.approvalHistory || []), {
    at: production.planApprovedAt,
    revision: production.revision,
    blueprintVersion: production.pinnedReferences?.[0]?.blueprintVersion || 0,
  }];
  production.planApprovedAt = null;
}

function applyBeatPatch(beat: FactoryPlanBeat, patch: { spoken?: string | null; action?: string; onScreen?: string | null; targetStartSec?: number; targetEndSec?: number; speechDelivery?: FactoryPlanBeat["speechDelivery"]; performance?: string | null }) {
  const beforeDelivery = legacyDelivery(beat);
  const spoken = patch.speechDelivery === "SILENT"
    ? null
    : patch.spoken === undefined ? beat.spoken : (patch.spoken || "").replace(/\s+/g, " ").trim() || null;
  const speechChanged = spoken !== beat.spoken;
  if (patch.action != null) beat.action = patch.action.replace(/\s+/g, " ").trim();
  if (patch.onScreen != null) beat.onScreen = patch.onScreen.replace(/\s+/g, " ").trim() || null;
  if (patch.performance !== undefined) beat.performance = (patch.performance || "").replace(/\s+/g, " ").trim() || null;
  if (patch.speechDelivery) beat.speechDelivery = patch.speechDelivery;
  beat.spoken = spoken;
  if (patch.targetStartSec != null) beat.targetStartSec = Math.round(patch.targetStartSec * 10) / 10;
  if (patch.targetEndSec != null) beat.targetEndSec = Math.round(patch.targetEndSec * 10) / 10;
  if (speechChanged || (patch.speechDelivery && patch.speechDelivery !== beforeDelivery)) {
    beat.timing = "stale";
    beat.estimatedSec = null;
  }
}

function assertTargetWindows(beats: FactoryPlanBeat[], durationSec: number) {
  let previousEnd = 0;
  for (const beat of beats) {
    const start = beat.targetStartSec ?? beat.sourceStartSec ?? 0;
    const end = beat.targetEndSec ?? beat.sourceEndSec ?? 0;
    const label = beat.shotId || beat.id;
    if (!(end > start)) throw new Error(`Scene ${label} has no target duration.`);
    if (start < -0.05 || end > durationSec + 0.05) throw new Error(`Scene ${label} sits outside the ${durationSec}s plan.`);
    if (start < previousEnd - 0.05) throw new Error(`Scene ${label} overlaps the previous scene.`);
    previousEnd = end;
  }
}

export function saveSceneEdit(productionId: string, expectedRevision: number, beatId: string, patch: { spoken?: string | null; action?: string; onScreen?: string | null; targetStartSec?: number; targetEndSec?: number; speechDelivery?: FactoryPlanBeat["speechDelivery"]; performance?: string | null }) {
  return saveSceneEdits(productionId, expectedRevision, [{ beatId, ...patch }]);
}

/** Saves every pending scene in one revision. An older revision cannot overwrite a newer draft. */
export function saveSceneEdits(productionId: string, expectedRevision: number, edits: { beatId: string; spoken?: string | null; action?: string; onScreen?: string | null; targetStartSec?: number; targetEndSec?: number; speechDelivery?: FactoryPlanBeat["speechDelivery"]; performance?: string | null }[], operatorNote?: string | null) {
  const db = readFactoryV2();
  const production = requireProduction(db, productionId, expectedRevision);
  if (production.providerJobId) throw new Error("A render is already recorded for this draft.");
  if (!production.plan) throw new Error("No plan is saved.");
  const note = operatorNote == null ? null : operatorNote.replace(/\s+/g, " ").trim();
  if (!edits.length && note == null) throw new Error("Nothing to save.");
  const beats = production.plan.beats.map((beat) => ({ ...beat }));
  const sourceTimes = production.plan.beats.map((beat) => `${beat.id}:${beat.sourceStartSec ?? ""}:${beat.sourceEndSec ?? ""}`);
  for (const patch of edits) {
    const beat = beats.find((row) => row.id === patch.beatId);
    if (!beat) throw new Error("Scene not found.");
    applyBeatPatch(beat, patch);
  }
  assertTargetWindows(beats, production.durationMs / 1000);
  if (sourceTimes.some((row, index) => row !== `${beats[index]?.id}:${beats[index]?.sourceStartSec ?? ""}:${beats[index]?.sourceEndSec ?? ""}`)) {
    throw new Error("Source windows stay on the reference.");
  }
  const noteChanged = note != null && note !== (production.operatorNote || "");
  if (!edits.length && !noteChanged) return production;
  production.plan.beats = beats;
  if (noteChanged) production.operatorNote = note || null;
  if (edits.length) clearPlanApproval(production);
  production.revision += 1;
  refresh(db, production);
  writeFactoryV2(db);
  return production;
}

export function saveVoiceMeasurement(productionId: string, expectedRevision: number, beatId: string, take: { url: string; seconds: number; voice: string; delivery: "creator-led" | "voiceover" }) {
  const db = readFactoryV2();
  const production = requireProduction(db, productionId, expectedRevision);
  if (production.providerJobId) throw new Error("A render is already recorded for this draft.");
  if (!production.plan) throw new Error("No plan is saved.");
  const beat = production.plan.beats.find((row) => row.id === beatId);
  if (!beat) throw new Error("Scene not found.");
  if (!take.url.startsWith("/api/media/ugc-factory-vo/")) throw new Error("The voice take is not a stored file.");
  beat.voiceUrl = take.url;
  beat.estimatedSec = Math.round(take.seconds * 10) / 10;
  beat.timing = "measured";
  beat.audioMode = `${take.delivery} ${take.voice}`;
  production.voiceId = take.voice;
  production.deliveryMode = take.delivery;
  production.revision += 1;
  refresh(db, production);
  writeFactoryV2(db);
  return production;
}

function staleSpokenAudio(production: FactoryProduction) {
  for (const beat of production.plan?.beats || []) {
    if (!beat.spoken) continue;
    beat.timing = "stale";
    beat.estimatedSec = null;
  }
}

/** Changes setup on this draft only. Does not rewrite the script or call a model. */
export function setProductionSetup(productionId: string, expectedRevision: number, patch: {
  locale?: string;
  durationSec?: number;
  creatorMode?: FactoryProduction["creatorMode"];
  creatorAnchor?: { mediaId: string; url: string; label: string } | null;
  creatorLook?: { presentation: "woman" | "man"; age: "20s" | "30s"; hair: string; skin: string; wardrobe: string } | null;
  deliveryMode?: "creator-led" | "voiceover";
  voiceId?: string;
  productImage?: { id: string; url: string } | null;
  audioStrategy?: "NATIVE_AUDIO" | "EXTERNAL_TTS";
  voiceDirection?: string | null;
}) {
  const db = readFactoryV2();
  const production = requireProduction(db, productionId, expectedRevision);
  if (production.providerJobId) throw new Error("A render is already recorded for this draft.");
  let changed = false;
  let staleAudio = false;
  if (patch.locale && patch.locale !== production.locale) {
    const market = FACTORY_V2_MARKETS.find((row) => row.id === production.market);
    if (!market || !(market.locales as readonly string[]).includes(patch.locale)) throw new Error(`${production.market} does not use ${patch.locale}.`);
    production.locale = patch.locale;
    changed = true;
    staleAudio = true;
  }
  if (patch.durationSec != null && patch.durationSec * 1000 !== production.durationMs) {
    production.durationMs = durationMsOf(patch.durationSec);
    if (production.plan) assertTargetWindows(production.plan.beats, production.durationMs / 1000);
    changed = true;
  }
  if (patch.creatorMode && patch.creatorMode !== production.creatorMode) {
    if (patch.creatorMode !== "HANDS" && patch.creatorMode !== "GENERATED_ADULT" && patch.creatorMode !== "SUPPLIED_ADULT") throw new Error("Unknown creator mode.");
    production.creatorMode = patch.creatorMode;
    if (patch.creatorMode === "HANDS") {
      production.creatorAnchor = null;
      production.creatorLook = null;
    }
    changed = true;
  }
  if (patch.creatorAnchor !== undefined) {
    if (patch.creatorAnchor == null) {
      if (production.creatorAnchor) changed = true;
      production.creatorAnchor = null;
    } else {
      const url = patch.creatorAnchor.url.trim();
      if (!url.startsWith("/api/media/") || /ugc-references|ugc-reference-frames/.test(url)) throw new Error("Choose a stored face plate. A source frame is not that plate.");
      const label = patch.creatorAnchor.label.replace(/\s+/g, " ").trim();
      if (!patch.creatorAnchor.mediaId || !label) throw new Error("The face plate needs its stored id.");
      production.creatorAnchor = { mediaId: patch.creatorAnchor.mediaId, url, label };
      changed = true;
    }
  }
  if (patch.creatorLook !== undefined) {
    const next = patch.creatorLook == null ? null : parseCreatorLook(patch.creatorLook);
    const prev = JSON.stringify(production.creatorLook || null);
    if (JSON.stringify(next) !== prev) {
      production.creatorLook = next;
      changed = true;
    }
  }
  const heard = production.plan?.beats.find((beat) => beat.audioMode)?.audioMode || "";
  const currentDelivery = production.deliveryMode || (heard.startsWith("creator-led") ? "creator-led" : heard ? "voiceover" : "");
  const currentVoice = production.voiceId || heard.replace(/^(voiceover|creator-led)\s+/, "");
  if (patch.deliveryMode && patch.deliveryMode !== currentDelivery) {
    if (patch.deliveryMode !== "creator-led" && patch.deliveryMode !== "voiceover") throw new Error("Choose creator-led delivery or off-screen voiceover.");
    production.deliveryMode = patch.deliveryMode;
    changed = true;
    staleAudio = true;
  }
  if (patch.voiceId && patch.voiceId !== currentVoice) {
    if (!isFactoryVoice(patch.voiceId)) throw new Error("That voice is not configured.");
    production.voiceId = patch.voiceId;
    changed = true;
    staleAudio = true;
  }
  if (patch.audioStrategy && patch.audioStrategy !== (production.audioStrategy || "NATIVE_AUDIO")) {
    if (patch.audioStrategy !== "NATIVE_AUDIO" && patch.audioStrategy !== "EXTERNAL_TTS") throw new Error("Choose native audio or external voiceover.");
    production.audioStrategy = patch.audioStrategy;
    changed = true;
  }
  if (patch.voiceDirection !== undefined) {
    const direction = (patch.voiceDirection || "").replace(/\s+/g, " ").trim();
    if (direction !== (production.voiceDirection || "")) {
      production.voiceDirection = direction || null;
      changed = true;
    }
  }
  if (patch.productImage) {
    const url = patch.productImage.url.trim();
    if (!url.startsWith("/api/media/") || url.includes("/ugc-references/")) throw new Error("The product image must be a stored catalog photo.");
    const sku = db.skus.find((row) => row.id === production.skuId);
    if (!sku) throw new Error("SKU not found");
    const media = sku.media ? sku.media.slice() : [];
    if (!media.some((row) => row.role === "productAppearance" && row.url === url)) {
      media.push({ id: patch.productImage.id, role: "productAppearance", url, source: "catalog" });
      sku.media = media;
    }
    if (production.productImageId !== patch.productImage.id) changed = true;
    production.productImageId = patch.productImage.id;
  }
  if (!changed) return production;
  if (staleAudio) staleSpokenAudio(production);
  if (staleAudio && production.plan) {
    const delivery = production.deliveryMode || (currentDelivery === "creator-led" ? "creator-led" : "voiceover");
    const voice = production.voiceId || currentVoice;
    if (voice && isFactoryVoice(voice)) {
      production.deliveryMode = delivery;
      production.voiceId = voice;
      const mode = `${delivery} ${voice}`;
      for (const beat of production.plan.beats) beat.audioMode = mode;
    }
  }
  clearPlanApproval(production);
  production.revision += 1;
  refresh(db, production);
  writeFactoryV2(db);
  return production;
}

export function applySceneCaption(productionId: string, expectedRevision: number, beatId: string, onScreen: string) {
  const db = readFactoryV2();
  const production = requireProduction(db, productionId, expectedRevision);
  if (production.planApprovedAt || production.providerJobId) throw new Error("The approved plan stays as saved.");
  if (!production.plan) throw new Error("No plan is saved.");
  const beat = production.plan.beats.find((row) => row.id === beatId);
  if (!beat) throw new Error("Scene not found.");
  const caption = onScreen.replace(/\s+/g, " ").trim();
  if (caption.length < 2) throw new Error("The caption is empty.");
  beat.onScreen = caption.slice(0, 80);
  production.revision += 1;
  production.updatedAt = now();
  writeFactoryV2(db);
  return production;
}

export function dismissDraftFactReview(productionId: string) {
  const db = readFactoryV2();
  const production = db.productions.find((row) => row.id === productionId);
  if (!production) throw new Error("Production not found");
  production.factReview = null;
  writeFactoryV2(db);
  return production;
}

export function noteFactoryImpact(catalogProductId: string, skuRevision: number, fields: string[]) {
  const db = readFactoryV2();
  let touched = 0;
  for (const production of db.productions) {
    const sku = db.skus.find((row) => row.id === production.skuId);
    if (sku?.catalogProductId !== catalogProductId) continue;
    if (production.providerJobId) continue;
    production.impact = { at: now(), skuRevision, fields };
    if (production.plan || production.planApprovedAt) {
      production.planApprovedAt = null;
      dropPlan(production);
    }
    production.revision += 1;
    refresh(db, production);
    touched += 1;
  }
  if (touched) writeFactoryV2(db);
  return touched;
}

/** Flag drafts whose brief name changed. Approved plans, paid requests, and history stay. */
export function noteFactoryNameImpact(input: {
  catalogProductId: string;
  skuRevision: number;
  field: string;
  market?: string | null;
  locale?: string | null;
  skip?: { market: string; locale: string }[];
}) {
  const db = readFactoryV2();
  let touched = 0;
  for (const production of db.productions) {
    const sku = db.skus.find((row) => row.id === production.skuId);
    if (sku?.catalogProductId !== input.catalogProductId) continue;
    if (production.providerJobId) continue;
    if (input.market && production.market !== input.market) continue;
    if (input.locale && production.locale !== input.locale) continue;
    if (input.skip?.some((row) => row.market === production.market && row.locale === production.locale)) continue;
    const fields = new Set(production.impact?.fields || []);
    fields.add(input.field);
    production.impact = { at: now(), skuRevision: input.skuRevision, fields: [...fields] };
    production.revision += 1;
    production.updatedAt = now();
    touched += 1;
  }
  if (touched) writeFactoryV2(db);
  return touched;
}

export function acknowledgeFactoryImpact(productionId: string, expectedRevision: number, apply: boolean) {
  const db = readFactoryV2();
  const production = requireProduction(db, productionId, expectedRevision);
  if (production.providerJobId) throw new Error("A paid request is already pinned. It was not rewritten.");
  if (apply && production.impact) production.pinnedSkuRevision = production.impact.skuRevision;
  production.impact = null;
  production.revision += 1;
  refresh(db, production);
  writeFactoryV2(db);
  return production;
}

export function forkFactoryProduction(input: {
  productionId: string;
  expectedRevision: number;
  market: string;
  locale: string;
  placement: string;
  listingId: string;
  sourceUrl: string;
  destinationUrl?: string;
  destinationVersionId?: string | null;
}) {
  const market = marketOf(input.market);
  if (!market) throw new Error("Unknown market");
  if (!market.locales.includes(input.locale as (typeof market.locales)[number])) throw new Error(`${market.label} does not use ${input.locale}`);
  if (!FACTORY_V2_PLACEMENTS.some((row) => row.id === input.placement)) throw new Error("Unknown placement");
  const db = readFactoryV2();
  const source = requireProduction(db, input.productionId, input.expectedRevision);
  if (!source.planApprovedAt) throw new Error("Create a new draft from the catalog. This production has no approved plan to keep.");
  const sku = db.skus.find((row) => row.id === source.skuId);
  if (!sku) throw new Error("SKU not found");
  let listing = db.listings.find((row) => row.id === input.listingId);
  if (!listing) {
    listing = {
      id: input.listingId,
      skuId: sku.id,
      market: market.id,
      marketplace: "catalog",
      sourceUrl: input.sourceUrl,
      merchantProductId: sku.modelId,
      equivalence: "PROPOSED",
      availability: "UNKNOWN",
      createdAt: now(),
    };
    db.listings.push(listing);
  }
  const production: FactoryProduction = {
    id: randomUUID(),
    revision: 1,
    skuId: sku.id,
    listingId: listing.id,
    market: market.id,
    locale: input.locale,
    placement: input.placement,
    durationMs: source.durationMs,
    aspectRatio: "9:16",
    recipeId: null,
    creatorMode: source.creatorMode,
    stage: "DRAFT",
    issue: "",
    allowUnpriced: false,
    parentId: source.id,
    destinationUrl: (input.destinationUrl || "").trim(),
    destinationVersionId: input.destinationVersionId || null,
    pinnedSkuRevision: source.pinnedSkuRevision || null,
    pinnedReferences: source.pinnedReferences?.map((row) => ({ ...row })),
    createdAt: now(),
    updatedAt: now(),
  };
  refresh(db, production);
  db.productions.unshift(production);
  writeFactoryV2(db);
  return { production, db };
}

function sameShopUrl(left: string, right: string) {
  return left.trim().replace(/\/+$/, "") === right.trim().replace(/\/+$/, "");
}

/** A catalog review updates the matching factory listing. Verified links stay verified. Paid requests keep their plan. */
export function markFactoryListings(input: {
  catalogProductId: string;
  sourceUrl: string;
  market: string | null;
  equivalence: "VERIFIED" | "REJECTED";
}) {
  if (input.equivalence !== "VERIFIED" && input.equivalence !== "REJECTED") throw new Error("Confirm or reject the link");
  const db = readFactoryV2();
  let touched = 0;
  for (const listing of db.listings) {
    const sku = db.skus.find((row) => row.id === listing.skuId);
    if (sku?.catalogProductId !== input.catalogProductId) continue;
    if (input.market && listing.market !== input.market) continue;
    if (!sameShopUrl(listing.sourceUrl, input.sourceUrl)) continue;
    if (listing.equivalence === "VERIFIED") continue;
    if (listing.equivalence === input.equivalence) continue;
    listing.equivalence = input.equivalence;
    touched += 1;
    for (const production of db.productions) {
      if (production.listingId !== listing.id || production.providerJobId) continue;
      dropPlan(production);
      production.revision += 1;
      refresh(db, production);
    }
  }
  if (touched) writeFactoryV2(db);
  return touched;
}

function sameFactIds(a?: string[], b?: string[]) {
  return [...(a || [])].sort().join() === [...(b || [])].sort().join();
}

export function pinFactoryReference(productionId: string, expectedRevision: number, pin: { referenceId: string; analysisVersion: number; factIds?: string[]; blueprintVersion?: number }) {
  const db = readFactoryV2();
  const production = requireProduction(db, productionId, expectedRevision);
  if (production.planApprovedAt || production.providerJobId) {
    throw new Error("The approved plan stays as saved. This reference was not pinned.");
  }
  const next = { referenceId: pin.referenceId, analysisVersion: pin.analysisVersion, factIds: pin.factIds || [], blueprintVersion: pin.blueprintVersion };
  const current = production.pinnedReferences || [];
  const merged = [...current.filter((row) => row.referenceId !== next.referenceId), next];
  const same = merged.length === current.length && merged.every((row) => current.some((item) => item.referenceId === row.referenceId && item.analysisVersion === row.analysisVersion && sameFactIds(item.factIds, row.factIds) && item.blueprintVersion === row.blueprintVersion));
  const planRefs = production.plan?.references || [];
  const planSame = !production.plan || (planRefs.length === merged.length && merged.every((row) => planRefs.some((item) => item.referenceId === row.referenceId && item.analysisVersion === row.analysisVersion)));
  if (same && planSame) return production;
  production.pinnedReferences = merged;
  if (production.plan) production.plan.references = merged.map((row) => ({ referenceId: row.referenceId, analysisVersion: row.analysisVersion }));
  production.revision += 1;
  production.updatedAt = now();
  writeFactoryV2(db);
  return production;
}

/** Saves a draft plan. Does not approve it and does not start a render. */
export function saveRecreationPlan(productionId: string, expectedRevision: number, draft: PlanDraft, creatorMode?: FactoryProduction["creatorMode"]) {
  const db = readFactoryV2();
  const production = requireProduction(db, productionId, expectedRevision);
  if (production.planApprovedAt || production.providerJobId) {
    throw new Error("The approved plan stays as saved. This reference was not pinned.");
  }
  if (creatorMode) production.creatorMode = creatorMode;
  if (draft.modelId !== "gpt-6-astra") throw new Error("Recreation plans use gpt-6-astra. Another model was not saved.");
  if (!draft.beats.length) throw new Error("Astra returned no shots. Nothing was saved.");
  production.plan = {
    status: "DRAFT",
    modelId: draft.modelId,
    concept: draft.concept,
    spoken: draft.spoken,
    delivery: draft.delivery,
    audio: draft.audio,
    edit: draft.edit,
    beats: draft.beats,
    creativeBeats: draft.creativeBeats,
    references: production.pinnedReferences?.map((row) => ({ referenceId: row.referenceId, analysisVersion: row.analysisVersion })),
    createdAt: now(),
  };
  production.planApprovedAt = null;
  production.revision += 1;
  refresh(db, production);
  writeFactoryV2(db);
  return production;
}

/** Explicit generate. Does not call Wan or Seedance. */
export function refuseFactoryGenerate(productionId: string, expectedRevision: number): never {
  const db = readFactoryV2();
  const production = requireProduction(db, productionId, expectedRevision);
  if (!production.plan || !production.planApprovedAt) {
    throw new Error("No video job was submitted. Approve the current plan first. Approval alone does not start Wan or Seedance.");
  }
  throw new Error("No video job was submitted. This production has no reviewed generation budget, so Wan and Seedance were not called.");
}

export function markFactoryWanClip(productionId: string, clip: { shotId: string; url: string; durationSec: number }) {
  const db = readFactoryV2();
  const production = db.productions.find((row) => row.id === productionId);
  if (!production) throw new Error("Production not found");
  const clips = (production.wanClips || []).filter((row) => row.shotId !== clip.shotId);
  clips.push({ ...clip, at: now() });
  production.wanClips = clips;
  production.providerJobId = production.providerJobId || `wan-3-0:${productionId}`;
  production.updatedAt = now();
  writeFactoryV2(db);
  return production;
}
