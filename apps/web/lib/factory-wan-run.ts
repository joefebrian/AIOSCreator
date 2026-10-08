import fs from "node:fs";
import path from "node:path";
import { dashscopeWan3Video } from "./dashscope-wan";
import { compileNativeScene, creatorLookSentence } from "./factory-native-audio";
import { clipHasAudio } from "./factory-native-export";
import { dataRoot } from "./paths";
import { assertSpendAllowed } from "./spend-cap";
import { markFactoryWanClip, readFactoryV2 } from "./ugc-factory-v2";

function fittedSec(start: number, end: number) {
  return Math.max(2, Math.min(30, Math.round(end - start) || 2));
}

export async function runFactoryWan(productionId: string) {
  const db = readFactoryV2();
  const production = db.productions.find((row) => row.id === productionId);
  if (!production?.plan || !production.planApprovedAt) throw new Error("Approve the plan before Wan. Nothing was submitted.");
  if (production.providerJobId) throw new Error("A Wan job is already recorded for this draft. Nothing new was submitted.");
  const dir = path.join(dataRoot(), "media", "ugc-factory-wan", productionId);
  const lock = path.join(dir, "LOCK");
  if (fs.existsSync(lock)) throw new Error("Wan is already running for this draft.");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(lock, new Date().toISOString());
  const look = production.creatorLook ? creatorLookSentence(production.creatorLook, production.market) : "";
  const beats = production.plan.beats;
  const total = beats.reduce((sum, beat) => sum + fittedSec(beat.targetStartSec ?? beat.sourceStartSec ?? 0, beat.targetEndSec ?? beat.sourceEndSec ?? 0), 0);
  assertSpendAllowed({ model: "wan-3-0", durationSec: total });
  const logPath = path.join(dir, "status.json");
  const writeStatus = (status: unknown) => fs.writeFileSync(logPath, JSON.stringify(status, null, 2));
  writeStatus({ model: "wan-3-0", startedAt: new Date().toISOString(), totalSec: total, scenes: [] });
  try {
    for (const beat of beats) {
      const start = beat.targetStartSec ?? beat.sourceStartSec ?? 0;
      const end = beat.targetEndSec ?? beat.sourceEndSec ?? start;
      const durationSec = fittedSec(start, end);
      const compiled = compileNativeScene({
        modelId: "wan-3-0",
        locale: production.locale,
        voiceDirection: production.voiceDirection,
        creatorLook: look,
        scene: {
          spoken: beat.spoken,
          delivery: beat.speechDelivery || (beat.spoken ? "CREATOR_SPEAKS" : "SILENT"),
          performance: beat.performance,
          action: beat.action,
          targetStart: 0,
          targetEnd: durationSec,
        },
      });
      if (!compiled.ok) throw new Error(compiled.issue);
      const dest = path.join(dir, `${beat.id}.mp4`);
      writeStatus({ model: "wan-3-0", scene: beat.id, state: "submitting", durationSec });
      const buffer = await dashscopeWan3Video({
        prompt: compiled.request.prompt,
        durationSec,
        sound: true,
        promptExtend: false,
        engineId: "wan-3-0",
        jobId: `${productionId}:${beat.id}`,
        ratio: "9:16",
        onProgress: (label) => writeStatus({ model: "wan-3-0", scene: beat.id, state: label, durationSec }),
      });
      fs.writeFileSync(dest, buffer);
      if (!(await clipHasAudio(dest))) throw new Error(`${beat.id} came back without an audio stream.`);
      const url = `/api/media/ugc-factory-wan/${productionId}/${beat.id}.mp4`;
      markFactoryWanClip(productionId, { shotId: beat.id, url, durationSec });
      writeStatus({ model: "wan-3-0", scene: beat.id, state: "saved", url, durationSec });
    }
    writeStatus({ model: "wan-3-0", state: "done", at: new Date().toISOString() });
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

const id = process.argv[2];
if (id) {
  runFactoryWan(id).then(() => {
    console.log("wan done", id);
  }).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
