import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { correctReferenceBlueprint, deriveBlueprint, ensureReferenceBlueprint, setReferenceBlueprintRootForTests } from "./ugc-reference-blueprint";
import "./ugc-reference-factory";

const blueprint = deriveBlueprint("ref", "product", {
  version: 1,
  reviewed: false,
  transcript: [{ startSec: 0, endSec: 1.8, text: "Look how smooth and glowy my skin looks.", observed: true }],
  transcriptStatus: "ok",
  beats: [
    { startSec: 0, endSec: 2, purpose: "Measured shot", productAction: null, observed: true },
    { startSec: 2, endSec: 5, purpose: "Measured shot", productAction: "turns the barrel", observed: true },
  ],
  hook: { text: "Look how smooth and glowy my skin looks.", observed: true },
  framing: null,
  cuts: { text: "Cuts at 2.0s.", observed: true },
  audio: "present",
  cta: null,
  candidateFacts: [],
  pattern: { hook: "Look how smooth and glowy my skin looks.", beats: [], demo: null, objections: [], proof: null, cta: null, pacing: null },
  coverage: "full",
  unknown: ["cta"],
  reason: null,
  providers: { speech: "whisper-1", shots: "ffmpeg-scene", vision: "qwen3-vl-plus" },
  failures: [],
});
if (blueprint.beats.find((beat) => beat.role === "hook")?.evidence !== "Look how smooth and glowy my skin looks.") {
  throw new Error("hook evidence missing");
}
if (blueprint.shots.length !== 2 || blueprint.shots[1].action !== "turns the barrel") {
  throw new Error("shots were not kept");
}
if (blueprint.beats.some((beat) => beat.role === "problem")) throw new Error("an unlabeled role was stored as a scene");
if (blueprint.omissions?.find((row) => row.role === "problem")?.status !== "not_analyzed") {
  throw new Error("missing role was filled in");
}
if (!blueprint.shots[0]?.speech?.some((line) => line.text.includes("smooth and glowy"))) {
  throw new Error("shot speech was dropped");
}
const hookBeat = blueprint.beats.find((beat) => beat.role === "hook");
const linked = blueprint.shots.filter((shot) => shot.beatId === hookBeat?.id);
if (linked.length !== 1) throw new Error("hook beat did not keep its shot");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ugc-bp-"));
setReferenceBlueprintRootForTests(dir);
try {
  const saved = ensureReferenceBlueprint("ref", "product", {
    version: 1,
    reviewed: false,
    transcript: [{ startSec: 0, endSec: 1.8, text: "Look how smooth and glowy my skin looks.", observed: true }],
    transcriptStatus: "ok",
    beats: [{ startSec: 0, endSec: 2, purpose: "Measured shot", productAction: null, observed: true }],
    hook: { text: "Look how smooth and glowy my skin looks.", observed: true },
    framing: null,
    cuts: null,
    audio: "present",
    cta: null,
    candidateFacts: [],
    pattern: { hook: null, beats: [], demo: null, objections: [], proof: null, cta: null, pacing: null },
    coverage: "partial",
    unknown: [],
    reason: null,
    providers: { speech: "whisper-1", shots: "ffmpeg-scene", vision: "qwen3-vl-plus" },
    failures: [],
  });
  const edited = correctReferenceBlueprint(saved.blueprint.id, { beats: [{ id: "beat-hook", evidence: "Corrected hook evidence" }], shots: [{ id: "missing-shot", action: "invented" }] });
  if (!edited.changed || edited.blueprint.version !== 2) throw new Error("correction did not bump the version");
  if (edited.blueprint.shots.length !== 1) throw new Error("correction added a shot");
  if (edited.blueprint.beats.find((beat) => beat.role === "problem")?.evidence) throw new Error("correction filled a missing beat");
} finally {
  setReferenceBlueprintRootForTests(null);
  fs.rmSync(dir, { recursive: true, force: true });
}
console.log("blueprint derive ok");
