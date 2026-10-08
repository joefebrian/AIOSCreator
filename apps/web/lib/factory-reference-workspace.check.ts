import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { captionNeedsReview, referenceFrameUrl } from "./factory-scene-review";
import { ensureReferenceFrame, previewAdaptedVoice, proposeReferenceRewrite } from "./factory-reference-services";
import {
  createFactoryProduction,
  pinFactoryReference,
  readFactoryV2,
  saveRecreationPlan,
  saveSceneEdits,
  setFactoryPlanningMode,
  setFactoryV2RootForTests,
  setProductionSetup,
} from "./ugc-factory-v2";

const product = {
  id: "pad-1",
  title: "Medicube toner pads",
  brand: "Medicube",
  category: "Beauty",
  price: "19.00",
  currency: "USD",
  sourceUrl: "https://example.com/pad",
  affiliateUrl: "https://example.com/pad?tag=1",
  provider: "amazon",
  providerProductId: "B00PADS",
  features: ["Pads"],
};

function check(name: string, ok: boolean) {
  if (!ok) throw new Error(name);
  console.log("ok", name);
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-ref-"));
  setFactoryV2RootForTests(dir);
  const made = createFactoryProduction({ idempotencyKey: "my-pad", product, market: "MY", locale: "en-MY", placement: "TIKTOK" });
  const other = createFactoryProduction({ idempotencyKey: "th-pad", product, market: "TH", locale: "th-TH", placement: "TIKTOK" });
  const pinned = pinFactoryReference(made.production.id, made.production.revision, { referenceId: "ref-soph", analysisVersion: 3, blueprintVersion: 2 });
  const mode = setFactoryPlanningMode(pinned.id, pinned.revision, "REFERENCE_RECREATE");
  const planned = saveRecreationPlan(mode.id, mode.revision, {
    modelId: "gpt-6-astra",
    concept: "Fixture plan. The script model was not called.",
    spoken: "Start with prep. Next, the forehead.",
    delivery: "Off-screen voiceover.",
    audio: "Fixture measurement.",
    edit: "Cuts follow the reference.",
    beats: [
      { id: "shot-1", purpose: "hook", spoken: "Start with prep.", onScreen: "look how smooth and glowy", action: "From 0-1.833 seconds, point at the face.", stateIn: "Face in frame.", stateOut: "Face in frame.", factIds: [], shotId: "shot-1", sourceStartSec: 0, sourceEndSec: 2.4, estimatedSec: 2, timing: "measured", audioMode: "voiceover en-US-AriaNeural", voiceUrl: "/api/media/ugc-factory-vo/fixture/shot-1.mp3" },
      { id: "shot-2", purpose: "demo", spoken: "Next, the forehead.", onScreen: "I am happy to report I am a huge fan.", action: "Bring the pad to the forehead.", stateIn: "Pad in hand.", stateOut: "Pad on the forehead.", factIds: [], shotId: "shot-2", sourceStartSec: 2.4, sourceEndSec: 6, estimatedSec: 2.4, timing: "measured", audioMode: "voiceover en-US-AriaNeural", voiceUrl: "/api/media/ugc-factory-vo/fixture/shot-2.mp3" },
    ],
  });
  console.log("fixture plan, not a live Astra call");
  const beforeOther = readFactoryV2().productions.find((row) => row.id === other.production.id)!;
  check("caption review catches the hook mismatch", captionNeedsReview("Start with prep.", "look how smooth and glowy"));
  check("caption review catches the fan line", captionNeedsReview("Next, the forehead.", "I am happy to report I am a huge fan."));
  check("a matching caption is not a review", captionNeedsReview("Start with prep.", "Prep") === false);
  check("silence is not a caption error", captionNeedsReview("", "") === false);

  const captioned = saveSceneEdits(planned.id, planned.revision, [{ beatId: "shot-1", onScreen: "Start with prep." }]);
  const captionBeat = captioned.plan?.beats.find((beat) => beat.id === "shot-1");
  check("caption save keeps the measured voice", captionBeat?.onScreen === "Start with prep." && captionBeat.timing === "measured" && captionBeat.estimatedSec === 2);
  check("caption save keeps the source window", captionBeat?.sourceStartSec === 0 && captionBeat.sourceEndSec === 2.4);

  const file = path.join(dir, "db", "ugc-factory-v2.json");
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  raw.productions.find((row: { id: string; planApprovedAt?: string | null }) => row.id === planned.id).planApprovedAt = "2026-10-07T00:00:00.000Z";
  fs.writeFileSync(file, JSON.stringify(raw));
  const approvedRev = readFactoryV2().productions.find((row) => row.id === planned.id)!;
  const edited = saveSceneEdits(planned.id, approvedRev.revision, [
    { beatId: "shot-1", spoken: "Start with a clean face.", action: "During 0.0–2.4s, show the pad.", targetStartSec: 0, targetEndSec: 2.4 },
    { beatId: "shot-2", onScreen: "Next, the forehead.", targetStartSec: 2.4, targetEndSec: 6 },
  ]);
  const first = edited.plan?.beats.find((beat) => beat.id === "shot-1");
  const second = edited.plan?.beats.find((beat) => beat.id === "shot-2");
  check("one save updates both scenes", first?.spoken === "Start with a clean face." && second?.onScreen === "Next, the forehead." && second.spoken === "Next, the forehead.");
  check("speech edit clears approval and stales only that voice", edited.planApprovedAt == null && first?.timing === "stale" && first.estimatedSec == null && second?.timing === "measured");
  check("target time is stored apart from the source window", first?.targetStartSec === 0 && first.targetEndSec === 2.4 && first.sourceEndSec === 2.4);
  check("other market draft stays put", readFactoryV2().productions.find((row) => row.id === other.production.id)?.revision === beforeOther.revision);

  let stale = false;
  try {
    saveSceneEdits(planned.id, edited.revision - 1, [{ beatId: "shot-1", spoken: "Older text." }]);
  } catch (err) {
    stale = err instanceof Error && /changed/.test(err.message);
  }
  check("older revision does not overwrite", stale && readFactoryV2().productions.find((row) => row.id === planned.id)?.plan?.beats[0]?.spoken === "Start with a clean face.");

  let overlap = false;
  try {
    saveSceneEdits(planned.id, edited.revision, [
      { beatId: "shot-1", targetStartSec: 0, targetEndSec: 4 },
      { beatId: "shot-2", targetStartSec: 3, targetEndSec: 6 },
    ]);
  } catch (err) {
    overlap = err instanceof Error && /overlaps/.test(err.message);
  }
  check("overlap is rejected", overlap && readFactoryV2().productions.find((row) => row.id === planned.id)?.revision === edited.revision);

  const urls = [0, 1.833, 9.533, 13.533, 14.067, 24, 26.367].map((start, index) => referenceFrameUrl("/api/media/ugc-references/clip.mp4", 3, start, start + 1));
  check("frames are keyed per window", new Set(urls).size === urls.length && urls[0].includes("v3-"));

  const revisionBeforeProposal = readFactoryV2().productions.find((row) => row.id === planned.id)!.revision;
  const proposal = await proposeReferenceRewrite({
    mode: "recreate",
    locale: "en-MY",
    market: "MY",
    productName: "Zero Pore Pad",
    delivery: "voiceover",
    scenes: [
      { beatId: "shot-1", spoken: "Start with prep.", onScreen: "look how smooth and glowy", action: "Show the pad.", sourceSpeech: "Look how smooth and glowy my skin looks." },
      { beatId: "shot-2", spoken: "Next, the forehead.", onScreen: "I am happy to report I am a huge fan.", action: "Pad on the forehead.", sourceSpeech: "I am happy to report I am a huge fan." },
    ],
  }, async () => JSON.stringify({
    scenes: [
      { beatId: "shot-1", spoken: "Start with prep.", onScreen: "Start with prep.", action: "During 0.0–2.4s, show the pad." },
      { beatId: "shot-2", spoken: "Next, the forehead.", onScreen: "Next, the forehead.", action: "During 2.4–6.0s, wipe the forehead." },
    ],
  }));
  check("proposal updates speech caption and action together", proposal.scenes[0]?.onScreen === "Start with prep." && proposal.scenes[1]?.action.includes("forehead") && proposal.modelId === "injected-writer");
  check("proposal does not write the draft", readFactoryV2().productions.find((row) => row.id === planned.id)?.revision === revisionBeforeProposal);
  let writerFailed = false;
  try {
    await proposeReferenceRewrite({
      mode: "revamp",
      locale: "en-MY",
      market: "MY",
      productName: "Zero Pore Pad",
      delivery: "voiceover",
      scenes: [{ beatId: "shot-1", spoken: "Start with prep.", onScreen: "Prep", action: "Show the pad." }],
    }, async () => { throw new Error("Script service unavailable."); });
  } catch (err) {
    writerFailed = err instanceof Error && /unavailable/.test(err.message);
  }
  check("a failed rewrite saves nothing", writerFailed && readFactoryV2().productions.find((row) => row.id === planned.id)?.plan?.beats[0]?.spoken === "Start with a clean face.");

  let speaks = 0;
  const clip = path.join(dir, "take.mp3");
  fs.writeFileSync(clip, Buffer.alloc(800, 2));
  const speak = async () => {
    speaks += 1;
    return { file: clip, seconds: 1.1 };
  };
  const current = readFactoryV2().productions.find((row) => row.id === planned.id)!;
  const matched = await previewAdaptedVoice({
    productionId: planned.id,
    expectedRevision: current.revision,
    beatId: "shot-2",
    spoken: "Next, the forehead.",
    voice: "en-US-AriaNeural",
    delivery: "voiceover",
    root: dir,
  }, { speak });
  check("matching saved take does not synthesize", speaks === 0 && matched.seconds === 2.4 && matched.temporary === false && Boolean(matched.url && matched.url.includes("shot-2.mp3")));
  const temporary = await previewAdaptedVoice({
    productionId: planned.id,
    expectedRevision: current.revision,
    beatId: "shot-2",
    spoken: "Then wipe the forehead.",
    voice: "en-US-AriaNeural",
    delivery: "voiceover",
    root: dir,
  }, { speak });
  check("edited speech gets a new temporary take", speaks === 1 && temporary.temporary === true && temporary.seconds === 1.1 && readFactoryV2().productions.find((row) => row.id === planned.id)?.revision === current.revision);
  const again = await previewAdaptedVoice({
    productionId: planned.id,
    expectedRevision: current.revision,
    beatId: "shot-2",
    spoken: "Then wipe the forehead.",
    voice: "en-US-AriaNeural",
    delivery: "voiceover",
    root: dir,
  }, { speak });
  check("the same unsaved line reuses the cached take", speaks === 1 && again.url === temporary.url);
  const voiced = setProductionSetup(planned.id, current.revision, { voiceId: "en-SG-LunaNeural" });
  const staleBeat = voiced.plan?.beats.find((beat) => beat.id === "shot-2");
  check("a voice change marks the old measurement stale", voiced.voiceId === "en-SG-LunaNeural" && staleBeat?.timing === "stale" && staleBeat.estimatedSec == null);
  const renewed = await previewAdaptedVoice({
    productionId: planned.id,
    expectedRevision: voiced.revision,
    beatId: "shot-2",
    spoken: "Next, the forehead.",
    voice: "en-SG-LunaNeural",
    delivery: "voiceover",
    root: dir,
  }, { speak });
  const renewedBeat = readFactoryV2().productions.find((row) => row.id === planned.id)?.plan?.beats.find((beat) => beat.id === "shot-2");
  check("a new take replaces the stale number", speaks === 2 && renewed.seconds === 1.1 && renewed.temporary === false && renewedBeat?.estimatedSec === 1.1 && renewedBeat.timing === "measured");
  const missing = await ensureReferenceFrame({ mediaUrl: "/api/media/ugc-references/missing-clip.mp4", analysisVersion: 3, startSec: 0, endSec: 1, root: dir });
  check("a missing video reports frame unavailable", "error" in missing && /unavailable|not on/i.test(missing.error || ""));
  check("catalog counts were not this test", other.production.market === "TH" && made.production.market === "MY");
  setFactoryV2RootForTests(null);
  console.log("factory reference workspace checks passed");
}

void main();
