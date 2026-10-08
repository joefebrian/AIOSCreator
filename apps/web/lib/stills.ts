import { hasXaiProvider } from "./api-providers";
import { cloudTxt2Img, isCloudImageEngine } from "./cloud-image";
import { CloudSafetyError, isCloudSafetyReject } from "./cloud-router";
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
  const refs = normalizeStillRefs(reference);
  if (engine !== "grok-imagine-tryon" && engine !== "kling-image-omni" && engine !== "kolors-virtual-try-on" && engine !== "reactor") {
    prompt = withRealismPrompt(prompt, "", { multi: Boolean(refs.extra?.length) });
  }
  const hasRef = Boolean(refs.face || refs.body || refs.scene);
  // Qwen Image Edit is instruction-edit only. Prompt-only stays on Z-Image.
  if (engine === "qwen-image-2.1" || engine === "z-image-turbo") {
    engine = "qwen-image-2.1";
  }
  // Klein / Z-Image only consume one still (the face). They keep that photo's clothes
  // and ignore a SKU ref. On-model with a product photo must go through Qwen.
  if (
    opts?.kind === "on-model" &&
    refs.face &&
    refs.body &&
    refs.body !== refs.face &&
    (engine === "flux2-klein-4b" || engine === "flux2-klein-base-9b")
  ) {
    engine = "qwen-image-2.1";
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
      if (
        (engine === "marketing-studio-image" || engine.startsWith("seedance") || engine === "kling-3-0-std") &&
        /401|Invalid credentials|upload URL failed/i.test(msg) &&
        hasRef
      ) {
        const local = await comfyTxt2Img(prompt, refs, "qwen-image-2.1", opts);
        return { ...local, provider: "comfy" as const };
      }
      if (
        engine === "marketing-studio-image" &&
        (err instanceof CloudSafetyError || isCloudSafetyReject(msg) || /\bnsfw\b/i.test(msg))
      ) {
        if (hasXaiProvider()) {
          const buffer = await cloudTxt2Img("grok-imagine", prompt, refs, opts);
          return { buffer, provider: "xai" };
        }
        if (hasRef) {
          const local = await comfyTxt2Img(prompt, refs, "qwen-image-2.1", opts);
          return { ...local, provider: "comfy" as const };
        }
        throw new Error("Higgsfield blocked NSFW. Pick Grok Imagine (18+) or Qwen Image Edit (local).");
      }
      if (
        engine === "grok-imagine" &&
        /content moderation|moderated/i.test(msg) &&
        hasRef
      ) {
        const local = await comfyTxt2Img(prompt, refs, "qwen-image-2.1", opts);
        return { ...local, provider: "comfy" as const };
      }
      if (engine.startsWith("gpt-image") && (msg.includes("Switch to a local model") || /safety_violations|safety system/i.test(msg))) {
        throw new Error(
          "GPT Image blocked this (safety filter). Pick Grok Imagine (18+) or Qwen Image Edit (local).",
        );
      }
      if (/Duplicate parameter: 'image'/i.test(msg)) {
        throw new Error(
          "GPT Flare rejected character + SKU as two photos. Pick Qwen Image Edit for on-model, or GPT 2.5 Sunburst.",
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
