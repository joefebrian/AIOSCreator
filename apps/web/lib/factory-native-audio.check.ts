import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { compileNativeScene, creatorLookSentence, estimateSpeechSec, legacyDelivery, parseCreatorLook } from "./factory-native-audio";
import { targetListingBlocker } from "./shopee-affiliate-link";
import { clipHasAudio, retainClipAudio } from "./factory-native-export";
import { saveSceneEdits, setFactoryV2RootForTests } from "./ugc-factory-v2";

function check(name: string, ok: boolean) {
  if (!ok) throw new Error(name);
  console.log("ok", name);
}

function run(bin: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${bin} ${code}`))));
  });
}

async function main() {
  check("legacy voiceover stays voiceover", legacyDelivery({ spoken: "Start with prep.", audioMode: "voiceover en-US-AriaNeural" }) === "VOICEOVER");
  const look = parseCreatorLook({ presentation: "woman", age: "20s", hair: "dark-brown hair tied back", skin: "light-medium skin", wardrobe: "a plain light top" });
  const sentence = creatorLookSentence(look, "MY");
  check("look sentence follows the market and does not lock a plate", /Malaysian appearance/.test(sentence) && /not locked to a reference photo/.test(sentence) && /not the source creator/.test(sentence) && !/braid|blue eyes|hoodie|hoop/i.test(sentence));
  let rejectedLook = false;
  try { parseCreatorLook({ presentation: "woman", age: "20s", hair: "blonde braid", skin: "light skin", wardrobe: "a grey hoodie" }); } catch { rejectedLook = true; }
  check("a source-like hair choice is rejected", rejectedLook);
  check("a reviewed shop clears the blocker", targetListingBlocker({ market: "MY", factoryMarketplace: "amazon", shop: { variantReview: "REVIEWED", sourceUrl: "https://shopee.com.my/product/1/2?display_model_id=421235103862", reviewedVariantKey: "421235103862", reviewEvidence: "" } }) === "");
  check("a provisional shop still needs confirmation", /same product/.test(targetListingBlocker({ market: "MY", factoryMarketplace: "amazon", shop: { variantReview: "PROVISIONAL", sourceUrl: "https://shopee.com.my/product/1/2", reviewEvidence: "" } })));
  check("empty speech is silent", legacyDelivery({ spoken: null, audioMode: "voiceover en-US-AriaNeural" }) === "SILENT");
  check("estimate is not a measured take", estimateSpeechSec("Start with prep.", "VOICEOVER") > 0 && estimateSpeechSec("", "SILENT") === 0);
  const wan = compileNativeScene({
    modelId: "wan-3-0",
    locale: "en-MY",
    voiceDirection: "Casual English",
    scene: { spoken: "Start with prep.", delivery: "CREATOR_SPEAKS", performance: "Short pause after prep.", action: "Point toward the face.", targetStart: 0, targetEnd: 2.4 },
  });
  check("wan prompt carries the words and the speaker", wan.ok === true && wan.ok && wan.request.audio === true && wan.request.prompt.includes("Start with prep.") && wan.request.prompt.includes("visible generated adult") && !/AriaNeural|voice id/i.test(wan.request.prompt.replace("Do not attach an external TTS voice id.", "")));
  const silent = compileNativeScene({
    modelId: "wan-3-0",
    locale: "en-MY",
    scene: { spoken: "Let me show you.", delivery: "SILENT", action: "Hold the jar.", targetStart: 9.2, targetEnd: 12 },
  });
  check("silent scene sends no spoken line", silent.ok === true && silent.ok && silent.request.spoken == null && silent.request.prompt.includes("No spoken words"));
  const seedance = compileNativeScene({
    modelId: "seedance-2-5",
    locale: "en-MY",
    scene: { spoken: "Start with prep.", delivery: "VOICEOVER", action: "Show the pad.", targetStart: 0, targetEnd: 5 },
  });
  check("unverified seedance is an error", seedance.ok === false && seedance.ok === false && /audio parameter/i.test(seedance.issue));

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "native-audio-"));
  const src = path.join(dir, "src.mp4");
  const dest = path.join(dir, "out.mp4");
  const silentFile = path.join(dir, "silent.mp4");
  const ffmpeg = fs.existsSync("C:/ffmpeg/bin/ffmpeg.exe") ? "C:/ffmpeg/bin/ffmpeg.exe" : "ffmpeg";
  await run(ffmpeg, ["-y", "-f", "lavfi", "-i", "testsrc=size=160x284:rate=25:duration=1", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-shortest", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", src]);
  await run(ffmpeg, ["-y", "-f", "lavfi", "-i", "testsrc=size=160x284:rate=25:duration=1", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an", silentFile]);
  check("fixture has audio", await clipHasAudio(src));
  check("silent fixture is detected", (await clipHasAudio(silentFile)) === false);
  await retainClipAudio(src, dest);
  check("export keeps the audio stream", await clipHasAudio(dest));

  setFactoryV2RootForTests(dir);
  fs.mkdirSync(path.join(dir, "db"), { recursive: true });
  const { createFactoryProduction, pinFactoryReference, saveRecreationPlan, setFactoryPlanningMode, readFactoryV2 } = await import("./ugc-factory-v2");
  const made = createFactoryProduction({
    idempotencyKey: "native",
    product: { id: "pad", title: "Pads", brand: "Medicube", category: "Beauty", price: "1", currency: "USD", sourceUrl: "https://example.com/p", affiliateUrl: "https://example.com/p?tag=1", provider: "amazon", providerProductId: "B00", features: [] },
    market: "MY",
    locale: "en-MY",
    placement: "TIKTOK",
  });
  const pinned = pinFactoryReference(made.production.id, made.production.revision, { referenceId: "ref", analysisVersion: 3, blueprintVersion: 2 });
  const mode = setFactoryPlanningMode(pinned.id, pinned.revision, "REFERENCE_RECREATE");
  const planned = saveRecreationPlan(mode.id, mode.revision, {
    modelId: "gpt-6-astra",
    concept: "Fixture. No model was called.",
    spoken: "Start with prep.",
    delivery: "Voiceover.",
    audio: "Old measurement.",
    edit: "Cuts.",
    beats: [{ id: "shot-1", purpose: "hook", spoken: "Start with prep.", onScreen: "look how smooth and glowy", action: "Point.", stateIn: "In.", stateOut: "Out.", factIds: [], shotId: "shot-1", sourceStartSec: 0, sourceEndSec: 2.4, timing: "measured", estimatedSec: 2, audioMode: "voiceover en-US-AriaNeural" }],
  });
  const saved = saveSceneEdits(planned.id, planned.revision, [{ beatId: "shot-1", onScreen: "Start with prep", speechDelivery: "CREATOR_SPEAKS", performance: "Casual." }]);
  const beat = saved.plan?.beats[0];
  check("same scene keeps speech delivery and caption", beat?.id === "shot-1" && beat.spoken === "Start with prep." && beat.onScreen === "Start with prep" && beat.speechDelivery === "CREATOR_SPEAKS" && beat.performance === "Casual.");
  check("other fields stay on that revision", readFactoryV2().productions.length === 1);
  setFactoryV2RootForTests(null);
  console.log("native audio checks passed");
}

void main();
