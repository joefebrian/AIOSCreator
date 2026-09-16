import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cloudTxt2Img, isCloudImageEngine } from "./cloud-image";
import { assertSpendAllowed } from "./spend-cap";
import { comfyTxt2Img } from "./comfy";
import { imageEngine } from "./engines";
import { resolveRoute } from "./model-routes";
import { withRealismPrompt } from "./prompt-compile";
import { normalizeStillRefs, type GenerateStillOpts, type StillRefs } from "./still-refs";

export async function generateStill(
  prompt: string,
  reference?: string | StillRefs,
  engineId?: string,
  opts?: GenerateStillOpts,
) {
  let engine = engineId || imageEngine().id;
  prompt = withRealismPrompt(prompt);
  const refs = normalizeStillRefs(reference);
  if (engine === "klein-qwen") {
    return generateKleinQwen(prompt, refs, opts);
  }
  const hasRef = Boolean(refs.face || refs.body || refs.scene);
  // Qwen Image Edit is instruction-edit only. Prompt-only stays on Z-Image.
  if (engine === "qwen-image-edit" && !hasRef) {
    engine = "z-image-turbo";
  }
  const route = resolveRoute(engine, "auto");
  if (isCloudImageEngine(engine)) {
    assertSpendAllowed({ model: engine, units: 1 });
    if (route && !route.wired) {
      throw new Error(`${route.name} is not wired for this model yet — add a live key in Settings`);
    }
    try {
      const buffer = await cloudTxt2Img(engine, prompt, refs, opts);
      return { buffer, provider: route?.provider || "unknown" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Switch to a local model") || /safety_violations|safety system/i.test(msg)) {
        throw new Error(
          "GPT Image blocked this (safety filter). Your written scene can be fine — GPT also flags the word “nude” in lock text, and often swimwear/lingerie. Use Qwen Image Edit, Klein, or Z-Image locally. Comfy does not use that filter.",
        );
      }
      if (/copyright/i.test(msg)) {
        throw new Error(
          "Seedream blocked this look as copyrighted IP (anime/character sheet). Use Qwen Image Edit (local) for illustration→real, or pick a look that is not a known franchise character.",
        );
      }
      throw err;
    }
  }
  try {
    const out = await comfyTxt2Img(prompt, refs, engine, opts);
    return { ...out, provider: "comfy" as const };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/out of memory|Allocation on device|cuda.*memory/i.test(msg)) {
      throw new Error(
        "3060 out of VRAM. Close other Comfy/H3 jobs, then retry Clone Image. 3 refs are heavier than Chat.",
      );
    }
    throw err;
  }
}

async function generateKleinQwen(prompt: string, refs: StillRefs, opts?: GenerateStillOpts) {
  const face = refs.face;
  if (!face || !fs.existsSync(face)) {
    throw new Error("Klein+Qwen needs an identity plate. Lock a face first.");
  }
  const vibe = withRealismPrompt(opts?.vibePrompt?.trim() || prompt);
  opts?.onProgress?.("1/2 Klein");
  const klein = await comfyTxt2Img(vibe, undefined, "flux2-klein-4b", {
    width: opts?.width ?? 768,
    height: opts?.height ?? 1024,
    aspect: opts?.aspect,
  });
  const tmp = path.join(os.tmpdir(), `creatoros-klein-qwen-${Date.now()}.png`);
  fs.writeFileSync(tmp, klein.buffer);
  try {
    opts?.onProgress?.("2/2 Qwen");
    const swap =
      "Image 1 is the pose, crop, clothing, lighting, and scene to keep. Image 2 is the FACE lock. The person in image 1 must become the locked identity: same face, same skin, same hair, same age. Keep only pose, camera, wardrobe, lighting, and scene from image 1. Photoreal.";
    const qwen = await comfyTxt2Img(
      swap,
      { face, body: refs.body, scene: tmp },
      "qwen-image-edit",
      { kind: "faceswap", width: opts?.width ?? 768, height: opts?.height ?? 1024, aspect: opts?.aspect },
    );
    return { ...qwen, provider: "comfy" as const };
  } finally {
    fs.unlink(tmp, () => undefined);
  }
}
