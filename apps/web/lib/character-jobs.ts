import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { after, NextResponse } from "next/server";
import {
  BODY_LOCK_PROMPT,
  COMPLETE_SET_ENGINE,
  COMPLETE_SET_KEYS,
  COMPLETE_SET_PROMPTS,
  COMPLETE_SET_VIDEO_PROMPTS,
  FACE_BODY_SCENE_LOCK,
  FACE_ONLY_SCENE_LOCK,
  ONE_PERSON_LOCK,
  POSE_LOOK_REAL_BASE,
  POSE_LOOK_REAL_FOLLOW_CHARACTER,
  POSE_LOOK_REAL_FOLLOW_LOOK,
  POSE_LOOK_REAL_FOLLOW_TEXT,
  POSE_LOOK_REAL_OPERATOR,
  SKIN_LOCK,
  IDENTITY_PLATE_PROMPT,
  KEEP_FACE_GENERATOR_PREFIX,
  SLOT_DEFS,
  TRANSFORM_PLATE_PROMPT,
  type SlotKey,
} from "./character-prompts";
import { composeCharacterSheet } from "./character-sheet";
import { addEdit, getCharacter, setSlot, updateCharacter } from "./characters";
import { isCloudImageEngine } from "./cloud-image";
import { imageEngine, listEngines } from "./engines";
import { resolveRoute } from "./model-routes";
import { generateStill } from "./stills";
import { compileCharacterPrompt, looksLikeNewPhotoshoot, withAvoidList } from "./prompt-compile";
import { learnLookFromGenerate } from "./learn-looks";
import { cropIdentityFace } from "./crop-face";
import { BARE_CHEST_INSTRUCTION, BARE_CHEST_NEGATIVE, calmDriftFaceWording, characterLook, compileGenerateChatPrompt, compileKleinGeneratePrompt, compileLockedPrompt, compileQwen21GeneratePrompt, compileQwen21ScenePrompt, deriveLook, driftEngineFaceLock, driftTryOnPrompt, fillEmptyPlaceFromMood, fitSceneToCharacter, isMinorLook, localEditFaceLock, lookHairNegative, lookSkinNegative, operatorWantsBareChest, operatorWantsUndress, prepareOperatorPrompt, tryOnBaselineCrop, tryOnInPlace, UNDRESS_INSTRUCTION, UNDRESS_NEGATIVE, usesDriftTryOnFace } from "./look-lock";

import { characterGenerateRefs, characterStillRefs, framingFromPrompt, viggleBodyPlate, viggleGeneratePrompt } from "./still-refs";
import { arrangeLooseKerangka, compilePresetKerangka, isAdultPresetPrompt, parseExternalKerangka, plateFromSubjectBlock, readPresetBlocks } from "./prompt-presets";
import { compileShotPrompt, shotById, type ShotPlate } from "./shot-presets";
import { isProductTryOnEngine, isTryOnEngine, TRYON_PROMPT } from "./virtual-tryon";
import { composeProductRefs, ffmpegStill4k } from "./motion";
import { rememberProductUrls } from "./product-assets";
import { dashscopeWan3Video } from "./dashscope-wan";
import { characterSlotFile, characterSlotUrl, mediaUrlToPath, motionFile, still4kPair } from "./paths";
import { parseImageAspect, sizeForAspect } from "./image-aspect";
import { insertJob, updateJob, type Job } from "./store";

function startJob(input: string, model: string, characterId?: string): Job {
  const now = new Date().toISOString();
  const engineId = model.replace(/-ref$/, "");
  const route = resolveRoute(engineId, "auto");
  const job: Job = {
    id: randomUUID(),
    module: "production",
    kind: "character",
    input,
    status: "running",
    createdAt: now,
    updatedAt: now,
    model,
    provider: route?.provider || "comfy",
    characterId,
  };
  insertJob(job);
  return job;
}

/** Z-Image is Studio/UGC only. Character Generate/Clone/Edit never keep it as the engine. */
function characterStillEngineId(mode?: string) {
  const id = imageEngine().id;
  if (id === "z-image-turbo" || (isTryOnEngine(id) && mode !== "product")) {
    const qwen = listEngines().find((e) => e.id === "qwen-image-2.1");
    if (qwen?.status === "ready") return "qwen-image-2.1";
  }
  return id;
}

function isLocalQwen21(id?: string) {
  return id === "qwen-image-2.1" || id === "qwen-image-2.1-gguf";
}

/** Workspace stills follow the picker. Local Qwen 2.1 is never swapped to Muse (Meta policy). */
function characterEditEngine(mode?: string, opts?: { undress?: boolean; faceBody?: boolean; requested?: string }) {
  const requested = (opts?.requested || "").trim();
  if (mode === "face-swap") return "reactor";
  if (isLocalQwen21(requested)) return requested;
  if (mode === "pose-real") {
    return requested || "muse-image-1.0";
  }
  if (mode === "product") {
    if (requested && (isProductTryOnEngine(requested) || isTryOnEngine(requested))) return requested;
    return "muse-image-1.0";
  }
  if (requested) return requested;
  const id = characterStillEngineId(mode);
  const qwen = listEngines().find((e) => e.id === "qwen-image-2.1");
  const localGen = id === "flux2-klein-4b" || id === "flux2-klein-base-9b";
  if (mode === "scene" && localGen && qwen?.status === "ready") {
    return "qwen-image-2.1";
  }
  if (mode === "face-swap") {
    return "reactor";
  }
  if (
    (mode === "repair" || mode === "product" || opts?.undress) &&
    localGen
  ) {
    if (qwen?.status === "ready") return "qwen-image-2.1";
  }
  if (opts?.undress) {
    const grok = listEngines().find((e) => e.id === "grok-imagine");
    if (grok?.status === "ready") return "grok-imagine";
    if (isCloudImageEngine(id) && qwen?.status === "ready") return "qwen-image-2.1";
  }
  return id;
}

function collectExtraUrls(body: { extraUrl?: unknown; extraUrls?: unknown }): string[] {
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string" && v.trim()) out.push(v.trim());
    else if (Array.isArray(v)) for (const x of v) if (typeof x === "string" && x.trim()) out.push(x.trim());
  };
  push(body.extraUrl);
  push(body.extraUrls);
  return [...new Set(out)].slice(0, 6);
}

async function fillBodyIfMissing(id: string) {
  const row = getCharacter(id);
  if (!row?.identityUrl) return;
  const front = row.slots.find((s) => s.key === "front");
  if (front?.url && fs.existsSync(mediaUrlToPath(front.url))) return;
  const face = mediaUrlToPath(row.identityUrl);
  if (!fs.existsSync(face)) return;
  const dest = characterSlotFile(id, "front", "png");
  const mediaUrl = characterSlotUrl(id, "front", "png");
  const engineId = COMPLETE_SET_ENGINE;
  const job = startJob(BODY_LOCK_PROMPT, engineId, id);
  setSlot(id, "front", { jobId: job.id, prompt: BODY_LOCK_PROMPT });
  try {
    const { buffer } = await generateStill(BODY_LOCK_PROMPT, { face }, engineId, {
      kind: "restyle",
      width: 768,
      height: 1280,
    });
    fs.writeFileSync(dest, buffer);
    updateJob(job.id, { status: "completed", mediaPath: dest, mediaUrl, characterId: id });
    setSlot(id, "front", { url: mediaUrl, jobId: job.id, prompt: BODY_LOCK_PROMPT, upscaled: false });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    updateJob(job.id, { status: "failed", error: message });
  }
}

export async function runIdentity(req: Request, id: string) {
  const row = getCharacter(id);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  const dest = characterSlotFile(id, "identity", "png");
  const mediaUrl = characterSlotUrl(id, "identity", "png");
  const sourceDest = characterSlotFile(id, "source", "png");
  const sourceUrl = characterSlotUrl(id, "source", "png");
  const ctype = req.headers.get("content-type") || "";
  let jobId: string | undefined;

  try {
    if (ctype.includes("multipart/form-data")) {
      const form = await req.formData();
      const mode = String(form.get("mode") || "lock");
      const file = form.get("file");
      const prompt = String(form.get("prompt") || "").trim();
      const aspect = parseImageAspect(String(form.get("aspect") || ""));
      const canvas = sizeForAspect(aspect);

      if (mode === "lock") {
        if (!(file instanceof File)) throw new Error("file required");
        const buf = Buffer.from(await file.arrayBuffer());
        fs.writeFileSync(dest, buf);
        fs.writeFileSync(sourceDest, buf);
        const job = startJob("lock", "lock", id);
        jobId = job.id;
        updateJob(job.id, { status: "completed", mediaPath: dest, mediaUrl });
        const next = updateCharacter(id, {
          source: "photo",
          sourceUrl,
          identityUrl: mediaUrl,
          identityUpscaled: false,
          identityJobId: job.id,
          look: deriveLook(prompt || row.sourcePrompt),
        });
        after(() => fillBodyIfMissing(id));
        return NextResponse.json(next);
      }

      if (mode === "transform") {
        if (!(file instanceof File)) throw new Error("file required");
        fs.writeFileSync(sourceDest, Buffer.from(await file.arrayBuffer()));
        const keepFace = String(form.get("keepFace") || "") === "1";
        const engineId = COMPLETE_SET_ENGINE;
        const platePrompt = keepFace
          ? `${KEEP_FACE_GENERATOR_PREFIX} ${prompt || ""}`.trim()
          : prompt || TRANSFORM_PLATE_PROMPT;
        const job = startJob(platePrompt, `${engineId}-ref`, id);
        jobId = job.id;
        const next = updateCharacter(id, {
          source: "transform",
          sourcePrompt: platePrompt,
          sourceUrl,
          identityJobId: job.id,
        });
        after(async () => {
          try {
            const { buffer } = await generateStill(platePrompt, { face: sourceDest }, engineId, {
              kind: "identity",
              width: canvas.width,
              height: canvas.height,
              aspect,
            });
            fs.writeFileSync(dest, buffer);
            updateJob(job.id, { status: "completed", mediaPath: dest, mediaUrl });
            updateCharacter(id, {
              identityUrl: mediaUrl,
              identityJobId: job.id,
              identityUpscaled: false,
              look: deriveLook(platePrompt),
            });
            await fillBodyIfMissing(id);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            updateJob(job.id, { status: "failed", error: message });
          }
        });
        return NextResponse.json({ ...next, jobId: job.id, pending: "identity" }, { status: 202 });
      }

      throw new Error("mode must be lock or transform");
    }

    const body = (await req.json().catch(() => ({}))) as {
      prompt?: string;
      referenceUrl?: string;
      aspect?: string;
    };
    const prompt = (body.prompt ?? "").trim() || IDENTITY_PLATE_PROMPT;
    const refUrl = (body.referenceUrl ?? "").trim();
    const refPath = refUrl ? mediaUrlToPath(refUrl) : undefined;
    if (refPath && !fs.existsSync(refPath)) throw new Error("referenceUrl not on disk");

    const engineId = COMPLETE_SET_ENGINE;
    const job = startJob(prompt, refPath ? `${engineId}-ref` : engineId, id);
    jobId = job.id;
    const next = updateCharacter(id, {
      source: refPath ? "transform" : "prompt",
      sourcePrompt: prompt,
      sourceUrl: refUrl || row.sourceUrl || null,
      identityJobId: job.id,
    });
    after(async () => {
      try {
        const identAspect = parseImageAspect(body.aspect);
        const identCanvas = sizeForAspect(identAspect);
        const { buffer } = await generateStill(
          prompt,
          refPath ? { face: refPath } : undefined,
          engineId,
          { kind: "identity", width: identCanvas.width, height: identCanvas.height, aspect: identAspect },
        );
        fs.writeFileSync(dest, buffer);
        updateJob(job.id, { status: "completed", mediaPath: dest, mediaUrl });
        updateCharacter(id, {
          identityUrl: mediaUrl,
          identityJobId: job.id,
          identityUpscaled: false,
          look: deriveLook(prompt),
        });
        await fillBodyIfMissing(id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        updateJob(job.id, { status: "failed", error: message });
      }
    });
    return NextResponse.json({ ...next, jobId: job.id, pending: "identity" }, { status: 202 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (jobId) updateJob(jobId, { status: "failed", error: message });
    const status = /required|must be|not on disk/i.test(message) ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function runSlot(req: Request, id: string) {
  const row = getCharacter(id);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!row.identityUrl) {
    return NextResponse.json({ error: "lock identity first" }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { key?: string; prompt?: string };
  const key = body.key as SlotKey;
  const def = SLOT_DEFS.find((s) => s.key === key);
  if (!def) return NextResponse.json({ error: "unknown slot" }, { status: 400 });

  const slot = row.slots.find((s) => s.key === key);
  if (!slot) return NextResponse.json({ error: "unknown slot" }, { status: 400 });
  const prompt = (body.prompt ?? slot.prompt ?? def.prompt).trim();
  const refs = characterStillRefs(row);
  if (!refs.face) {
    return NextResponse.json({ error: "identity file missing" }, { status: 400 });
  }

  const dest = characterSlotFile(id, key, "png");
  const mediaUrl = characterSlotUrl(id, key, "png");

  if (key === "sheet") {
    const setEngine = COMPLETE_SET_ENGINE;
    const job = startJob("complete set headshot · 3/4 · full body", setEngine, id);
    const pending = setSlot(id, key, { jobId: job.id, prompt: "complete-set" });
    after(async () => {
      try {
        const paths: string[] = [];
        const n = COMPLETE_SET_KEYS.length;
        for (let i = 0; i < n; i++) {
          const k = COMPLETE_SET_KEYS[i]!;
          const def = SLOT_DEFS.find((s) => s.key === k);
          const prompt = COMPLETE_SET_PROMPTS[k] || def?.prompt || "";
          const slotDest = characterSlotFile(id, k, "png");
          const slotUrl = characterSlotUrl(id, k, "png");
          const existing = getCharacter(id)?.slots.find((s) => s.key === k);
          updateJob(job.id, { progress: `${i + 1}/${n} ${def?.label || k}` });
          if (existing?.url && fs.existsSync(mediaUrlToPath(existing.url))) {
            paths.push(mediaUrlToPath(existing.url));
            continue;
          }
          const { buffer } = await generateStill(prompt, characterStillRefs(getCharacter(id)!), setEngine, {
            kind: "restyle",
          });
          fs.writeFileSync(slotDest, buffer);
          setSlot(id, k, { url: slotUrl, jobId: job.id, prompt, upscaled: false });
          paths.push(slotDest);
        }
        updateJob(job.id, { progress: "compose 1×3" });
        await composeCharacterSheet(paths, dest);
        updateJob(job.id, { status: "completed", mediaPath: dest, mediaUrl });
        setSlot(id, key, { url: mediaUrl, jobId: job.id, prompt: "complete-set", upscaled: false });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        updateJob(job.id, { status: "failed", error: message });
      }
    });
    return NextResponse.json({ ...pending, jobId: job.id, pending: "sheet" }, { status: 202 });
  }

  const slotEngine = (COMPLETE_SET_KEYS as readonly string[]).includes(key) ? COMPLETE_SET_ENGINE : characterEditEngine();
  const job = startJob(prompt, `${slotEngine}-ref`, id);
  const next = setSlot(id, key, { jobId: job.id, prompt });
  after(async () => {
    try {
      const { buffer } = await generateStill(prompt, characterStillRefs(getCharacter(id)!), slotEngine, {
        kind: "restyle",
      });
      fs.writeFileSync(dest, buffer);
      updateJob(job.id, { status: "completed", mediaPath: dest, mediaUrl });
      setSlot(id, key, { url: mediaUrl, jobId: job.id, prompt, upscaled: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      updateJob(job.id, { status: "failed", error: message });
    }
  });
  return NextResponse.json({ ...next, jobId: job.id, pending: key }, { status: 202 });
}

/** RealESRGAN 4K next to the draft. Original generate file stays. */
export async function runUpscale(req: Request, id: string) {
  const row = getCharacter(id);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { slot?: string };
  const slot = (body.slot || "").trim();
  const isIdentity = slot === "identity";
  const editHit = row.edits?.find((e) => e.id === slot);
  const url = isIdentity ? row.identityUrl : editHit?.url || row.slots.find((s) => s.key === slot)?.url;
  if (!url) return NextResponse.json({ error: "no still to upscale" }, { status: 400 });
  const already = isIdentity
    ? Boolean(row.identityUrl4k || row.identityUpscaled)
    : editHit
      ? Boolean(editHit.url4k || editHit.upscaled)
      : Boolean(row.slots.find((s) => s.key === slot)?.url4k || row.slots.find((s) => s.key === slot)?.upscaled);
  if (already) return NextResponse.json({ error: "already 4K" }, { status: 400 });
  const src = mediaUrlToPath(url);
  if (!fs.existsSync(src)) return NextResponse.json({ error: "still not on disk" }, { status: 400 });

  const { dest, url: url4k } = still4kPair(src, url);
  const job = startJob(url, "realesrgan-4k", id);
  try {
    await ffmpegStill4k(src, dest);
    updateJob(job.id, { status: "completed", mediaPath: dest, mediaUrl: url4k });
    const next = isIdentity
      ? updateCharacter(id, { identityUpscaled: true, identityUrl4k: url4k })
      : editHit
        ? updateCharacter(id, {
            edits: (row.edits ?? []).map((e) => (e.id === slot ? { ...e, upscaled: true, url4k } : e)),
          })
        : setSlot(id, slot as SlotKey, { upscaled: true, url4k });
    return NextResponse.json(next);
  } catch (err) {
    if (fs.existsSync(dest) && dest !== src) fs.unlinkSync(dest);
    const message = err instanceof Error ? err.message : String(err);
    updateJob(job.id, { status: "failed", error: message });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

function editPrompt(
  mode: string,
  user: string,
  name: string,
  hasBody: boolean,
  engineId: string,
  productCount = 0,
  aspect = "9:16",
  scenePreset = "",
) {
  const extra = user.trim();
  const qwen =
    engineId === "qwen-image-2.1" ||
    engineId === "qwen-image-2.1" ||
    engineId === "qwen-image-2.1-gguf";
  const lock = hasBody ? FACE_BODY_SCENE_LOCK : FACE_ONLY_SCENE_LOCK;
  if (isTryOnEngine(engineId) || (mode === "product" && isProductTryOnEngine(engineId))) {
    return extra ? `${TRYON_PROMPT} ${extra}` : TRYON_PROMPT;
  }
  if (mode === "chat") return extra;
  if (mode === "pose-real") {
    const poseText = extra.replace(/(?:^|\n)Avoid:\s*[\s\S]*$/i, "").trim();
    if (poseText) {
      return `${POSE_LOOK_REAL_BASE} ${POSE_LOOK_REAL_FOLLOW_TEXT} ${POSE_LOOK_REAL_OPERATOR} Operator: ${poseText} Photoreal.`.trim();
    }
    return `${POSE_LOOK_REAL_BASE} ${POSE_LOOK_REAL_FOLLOW_CHARACTER} Photoreal.`;
  }
  if (mode === "face-swap") {
    return `Image 1 is the pose, body, clothes, camera, crop, lighting, and scene to keep. Image 2 is @${name}'s FACE lock. The person in Image 1 must become @${name}: same face, same skin, same hair. Keep only pose, wardrobe, and scene from Image 1. Do not keep the pose-photo's original face. ${ONE_PERSON_LOCK} Photoreal. ${extra}`.trim();
  }
  if (mode === "product") {
    const extraViews =
      productCount > 1
        ? " Image 3 is extra views of that same SKU for appearance only — do not paint a second copy of the item in her hands."
        : "";
    const wear = /\b(wear|wearing|outfit|dress|on her|put (it |the )on)\b/i.test(extra);
    const action = wear
      ? "She is WEARING that exact product as her only outfit. Hands empty or a natural pose. Do not also hold a duplicate of the same garment on a hanger."
      : "She uses that exact product once: hold it or wear it, not both. One product instance in the frame.";
    return `Image 1 is @${name} (locked face, posture, physique, and SKIN COLOR, head to toe). Image 2 is the affiliate product.${extraViews} ${SKIN_LOCK} ${ONE_PERSON_LOCK} Copy skin tone from Image 1 onto face, neck, chest, arms, and legs. Do not pale or bleach her for beach light. Output ONE ${aspect} photograph. ${action} Exactly two arms and two hands, five fingers each. No third arm, no extra hand, no extra forearm. Single camera, single frame, one person. Not a split screen, not a diptych, not left-right panels, not a collage, not two photos side by side, not a contact sheet. Keep @${name}'s identity. Do not invent a different person. Photoreal. ${extra}`.trim();
  }
  if (mode === "bg") {
    return `${lock} @${name}. Remove the background. Clean cutout or seamless studio, keep the person sharp. ${extra}`.trim();
  }
  if (mode === "scene") {
    const place = [scenePreset, extra.replace(/(?:^|\n)Avoid:\s*[\s\S]*$/i, "").trim()].filter(Boolean).join("\n").trim();
    const extraHint =
      productCount > 0
        ? ` Image 2${productCount > 1 ? "/3" : ""}${productCount > 2 ? "/4" : ""} are extra stills. If a slot is a person, keep that person's face and body in the frame; their pose and action follow the operator text. If a slot is a place/object, use it as scene or prop. Do not invent extra people who are not in Image 1–4.`
        : "";
    return `Image 1 is the photograph to keep. Same woman, face, hair, clothes, pose, and crop. Change only the background and lighting behind her. Do not write a new photoshoot. Do not change outfit or pose. Do not remove her from the frame. The new place must look like a real camera photo, not 3D or Unreal.${extraHint} ${place}`.trim();
  }
  if (mode === "repair") {
    return `Keep this photograph: same face, pose, clothes, and scene. Exactly two arms and two hands. Remove any extra arm or extra hand. Cigarette in at most one hand. Photoreal. ${extra}`.trim();
  }
  const undress = operatorWantsUndress(extra);
  if (undress) {
    return `${lock} @${name}. ${UNDRESS_INSTRUCTION} Do not copy any garment, neckline, strap, camisole, or shorts from the reference. Seamless photography studio. Photoreal. ${extra}`.trim();
  }
  if (!qwen) {
    return `The reference image is @${name}'s FACE only. Keep this exact face, hair, and${hasBody ? " body proportions" : " identity"}. Exactly two arms and two hands, five fingers each. No third arm. Do not copy crop, pose, clothing, furniture, kitchen, window, or background from the reference. New scene and wardrobe follow the operator. Do not copy clothing from the identity photo. Hair follows the locked look. Photoreal. ${extra}`.trim();
  }
  return `${lock} @${name}. Do not copy clothing, furniture, or the identity-photo room when the operator specifies a different wardrobe or scene. ${extra}`.trim();
}

export async function runEdit(req: Request, id: string) {
  const row = getCharacter(id);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as {
    baseUrl?: string;
    prompt?: string;
    mode?: string;
    extraUrl?: string | string[];
    extraUrls?: string[];
    aspect?: string;
    presetPrompt?: string;
    presetBlocks?: Record<string, string>;
    presetPlate?: string;
    shotId?: string;
    engineId?: string;
  };
  let baseUrl = (body.baseUrl ?? "").trim();
  let mode = (body.mode ?? "chat").trim();
  if (!baseUrl) return NextResponse.json({ error: "select or upload a base image" }, { status: 400 });
  if (mode === "scene" && collectExtraUrls(body).length === 0 && looksLikeNewPhotoshoot(body.prompt ?? "")) {
    return NextResponse.json(
      {
        error:
          "That prompt is a new photoshoot. Use Generate image (face + body lock, new pose/clothes/place). Chat to edit only changes the backdrop of the selected still.",
      },
      { status: 400 },
    );
  }
  if (mode === "upscale") {
    const slot =
      baseUrl === row.identityUrl
        ? "identity"
        : row.slots.find((s) => s.url === baseUrl)?.key ||
          row.edits?.find((e) => e.url === baseUrl)?.id;
    if (slot === "identity" || (slot && row.slots.some((s) => s.key === slot))) {
      return runUpscale(new Request(req.url, { method: "POST", body: JSON.stringify({ slot }) }), id);
    }
    return NextResponse.json({ error: "upscale that still from the gallery" }, { status: 400 });
  }
  const compiled = compileCharacterPrompt(body.prompt ?? "");
  const look = characterLook(row);
  const prepared = prepareOperatorPrompt(compiled.creative, look);
  const outside = parseExternalKerangka(prepared.creative);
  const loose = outside ? null : arrangeLooseKerangka(prepared.creative);
  const fittedOp = outside || loose ? { text: prepared.creative, changed: false } : fitSceneToCharacter(prepared.creative, look);
  if (fittedOp.changed) {
    prepared.creative = fittedOp.text;
    prepared.warnings.push("Prompt described another woman. Face, hair, and skin stayed this character.");
  }
  const undressAsk =
    !isMinorLook(look) &&
    (operatorWantsUndress(compiled.creative) || operatorWantsUndress(body.prompt ?? "") || operatorWantsUndress(String(body.presetPrompt || "")));
  const bareChestAsk =
    !isMinorLook(look) &&
    !undressAsk &&
    (operatorWantsBareChest(compiled.creative) ||
      operatorWantsBareChest(body.prompt ?? "") ||
      operatorWantsBareChest(String(body.presetPrompt || "")));
  let user = withAvoidList(
    prepared.creative,
    [compiled.negative, lookHairNegative(look), lookSkinNegative(), undressAsk ? UNDRESS_NEGATIVE : bareChestAsk ? BARE_CHEST_NEGATIVE : ""]
      .filter(Boolean)
      .join(", "),
  );
  const shot = mode === "chat" ? shotById(String(body.shotId || "")) : undefined;
  let presetBlocks = mode === "chat" ? readPresetBlocks(body.presetBlocks) : {};
  let hasPresetBlocks = Object.keys(presetBlocks).length > 0;
  if (!hasPresetBlocks && !shot && (outside || loose)) {
    presetBlocks = (outside || loose)!;
    hasPresetBlocks = true;
    prepared.warnings.push(outside ? "Outside prompt arranged into the eight blocks." : "Loose prompt arranged into the eight blocks.");
  }
  let placeFromMood = false;
  if ((outside || loose) && hasPresetBlocks && !(presetBlocks.background || "").trim()) {
    const filled = await fillEmptyPlaceFromMood(presetBlocks);
    if (filled) {
      presetBlocks = { ...presetBlocks, background: filled.text };
      placeFromMood = true;
    }
  }
  const plateRaw = String(body.presetPlate || "");
  const presetPlate: ShotPlate | undefined = hasPresetBlocks
    ? plateRaw === "headshot" || plateRaw === "three_quarter" || plateRaw === "full"
      ? plateRaw
      : plateFromSubjectBlock(presetBlocks.subject || "")
    : undefined;
  if (shot?.nsfw && isMinorLook(look)) {
    return NextResponse.json({ error: "That shot is 18+." }, { status: 400 });
  }
  if (
    isMinorLook(look) &&
    (presetBlocks.adult || Object.values(presetBlocks).some((text) => isAdultPresetPrompt(text)))
  ) {
    return NextResponse.json({ error: "That preset is 18+." }, { status: 400 });
  }
  if (
    mode === "retouch" &&
    isMinorLook(look) &&
    /\b(bikini|nude|naked|lingerie|underwear|undress)\b/i.test(body.prompt ?? "")
  ) {
    return NextResponse.json({ error: "That edit is 18+." }, { status: 400 });
  }
  if (
    !user.replace(/\nAvoid:\s*[\s\S]*$/i, "").trim() &&
    (mode === "chat" || mode === "scene") &&
    !String(body.presetPrompt || "").trim() &&
    !shot &&
    !hasPresetBlocks
  ) {
    return NextResponse.json({ error: "pick a preset or describe pose / clothes / place" }, { status: 400 });
  }
  if (mode === "pose-real") {
    const bodyLock = row.slots.find((s) => s.key === "front" && s.url)?.url || "";
    if (!row.identityUrl && !bodyLock) {
      return NextResponse.json({ error: "need FACE + BODY lock. Run Complete set first." }, { status: 400 });
    }
    if (!baseUrl) baseUrl = row.identityUrl || bodyLock;
    const extrasNow = collectExtraUrls(body);
    if (!extrasNow[0]) {
      return NextResponse.json({ error: "pick a look / illustration" }, { status: 400 });
    }
  }
  const extras = collectExtraUrls(body);
  const extra = extras[0] || "";
  const lockUrl = row.identityUrl || baseUrl;
  if (mode === "face-swap") {
    if (!row.identityUrl) {
      return NextResponse.json({ error: "need FACE lock. Run Complete set first." }, { status: 400 });
    }
    if (!baseUrl || baseUrl === row.identityUrl) {
      return NextResponse.json({ error: "pick another character's still (pose / clothes), not this identity plate" }, { status: 400 });
    }
  }
  if (mode === "product" && extras.length < 1) {
    return NextResponse.json({ error: "upload a product image" }, { status: 400 });
  }
  const src = mediaUrlToPath(mode === "product" ? baseUrl || lockUrl : baseUrl);
  if (!fs.existsSync(src)) return NextResponse.json({ error: "base image not on disk" }, { status: 400 });

  const editId = randomUUID();
  const dest = characterSlotFile(id, `edit-${editId.slice(0, 8)}`, "png");
  const mediaUrl = characterSlotUrl(id, `edit-${editId.slice(0, 8)}`, "png");
  let engineId: string;
  try {
    engineId = characterEditEngine(mode, {
      undress: undressAsk,
      faceBody: mode === "chat" && Boolean(characterStillRefs(row).body),
      requested: body.engineId,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
  let promptWarnings = prepared.warnings;
  if (undressAsk && engineId === "qwen-image-2.1" && isCloudImageEngine(imageEngine().id)) {
    promptWarnings = [...promptWarnings, "GPT Image / Seedream block NSFW. This job used Qwen Image Edit (local)."];
  }
  if (isTryOnEngine(engineId) || (mode === "product" && isProductTryOnEngine(engineId))) {
    const extraText = prepared.creative.replace(/(?:^|\n)Avoid:\s*[\s\S]*$/i, "").trim();
    const count =
      extras.length > 1 ? ` Image 2 is a ${extras.length}-item SKU sheet. Apply all ${extras.length} products, not only the first.` : "";
    const crop = tryOnBaselineCrop(src);
    const cropWarning =
      crop === "three_quarter" ? "3/4 crop stays. Feet stay out." : crop === "headshot" ? "Headshot crop stays." : "Full-body crop.";
    if (usesDriftTryOnFace(engineId)) {
      const head = characterStillRefs(row).face;
      const hasBody = Boolean(head && src !== head && fs.existsSync(src));
      user = driftTryOnPrompt(extraText, extras.length, hasBody, crop);
      promptWarnings = [
        ...promptWarnings,
        hasBody
          ? "Muse try-on. Image 1 is the headshot. Image 2 is the SKU. Image 3 is the body plate."
          : "Muse try-on. Image 1 is the headshot. Image 2 is the SKU.",
        "A new place uses that place's light.",
        cropWarning,
      ];
    } else {
      user = [extraText ? `${TRYON_PROMPT}${count}\n${extraText}` : `${TRYON_PROMPT}${count}`, tryOnInPlace(crop)]
        .filter(Boolean)
        .join("\n");
      promptWarnings = [...promptWarnings, "A new place uses that place's light.", cropWarning];
    }
  } else if (mode === "pose-real") {
    const followLook = String((body as { clonePose?: string }).clonePose || "character") === "look";
    const note = prepared.creative.replace(/(?:^|\n)Avoid:\s*[\s\S]*$/i, "").trim();
    user = note
      ? `${POSE_LOOK_REAL_BASE} ${followLook ? POSE_LOOK_REAL_FOLLOW_LOOK : POSE_LOOK_REAL_FOLLOW_CHARACTER} ${POSE_LOOK_REAL_OPERATOR} Operator: ${note} Photoreal.`
      : `${POSE_LOOK_REAL_BASE} ${followLook ? POSE_LOOK_REAL_FOLLOW_LOOK : POSE_LOOK_REAL_FOLLOW_CHARACTER} Photoreal.`;
  } else if (mode === "chat" && shot) {
    const compiled = compileShotPrompt(shot, look.hair || "").trim();
    const raw = (body.prompt ?? "").trim();
    const pose = shot.pose.trim().slice(0, 42);
    const inBox = pose.length >= 24 && raw.includes("[SUBJECT]") && raw.includes(pose);
    if (inBox) {
      user = raw;
      promptWarnings = ["Shot is in the description. Chips ignored."];
    } else {
      const note = prepared.creative.replace(/\nAvoid:\s*[\s\S]*$/i, "").trim();
      user = [compiled, note ? `Operator note: ${note}` : ""].filter(Boolean).join("\n\n");
      promptWarnings = ["Shot preset. Eight-block frame sent as written. Chips ignored."];
    }
  } else if (mode === "chat" && hasPresetBlocks) {
    const note = outside || loose
      ? ""
      : prepared.creative.replace(/\n(?:Avoid|Negative prompt)\s*:\s*[\s\S]*$/i, "").trim();
    const fittedBlocks: Record<string, string> = {};
    let blockFit = false;
    for (const [key, value] of Object.entries(presetBlocks)) {
      const fitted = fitSceneToCharacter(value, look);
      fittedBlocks[key] = fitted.text;
      if (fitted.changed) blockFit = true;
    }
    user = [compilePresetKerangka(fittedBlocks, look.hair || ""), note ? `Operator note: ${note}` : ""]
      .filter(Boolean)
      .join("\n\n");
    promptWarnings = [
      placeFromMood
        ? "Preset kerangka. Each block tightened to its own job. Empty place filled from the outfit mood."
        : "Preset kerangka. Each block tightened to its own job. Not an LLM rewrite.",
      ...(outside ? ["Outside prompt arranged into the eight blocks."] : []),
      ...(loose ? ["Loose prompt arranged into the eight blocks."] : []),
      ...(placeFromMood ? ["Empty place filled from the outfit mood."] : []),
      ...(blockFit ? ["Prompt described another woman. Face, hair, and skin stayed this character."] : []),
    ];
  } else if (mode === "chat" && engineId === "qwen-image-2.1-viggle") {
    const plate = viggleBodyPlate(row);
    if (!plate) {
      return NextResponse.json(
        { error: "Viggle needs a 3/4 body still. Complete set 3/4 first. Headshot is not used as Image 1." },
        { status: 400 },
      );
    }
    const viggle = viggleGeneratePrompt(row.name, prepared.creative, plate.kind);
    user = viggle.prompt;
    if (viggle.changed) promptWarnings = [...promptWarnings, "Viggle rewrote a close-up into a medium 3/4 shot."];
    promptWarnings = [...promptWarnings, `Viggle Image 1 = ${plate.kind} plate. Headshot not sent.`];
  } else if (mode === "chat") {
    const qwen21 = engineId === "qwen-image-2.1" || engineId === "qwen-image-2.1-gguf";
    const skipClothedBody = qwen21 && (undressAsk || bareChestAsk);
    const framing = skipClothedBody
      ? "close"
      : framingFromPrompt(
          [String(body.presetPrompt || "").trim(), prepared.creative].filter(Boolean).join("\n"),
        );
    const locked = await compileGenerateChatPrompt(
      prepared.creative,
      row.name,
      fitSceneToCharacter(String(body.presetPrompt || ""), look).text,
      framing,
      look,
    );
    user = [
      locked.prompt,
      undressAsk ? UNDRESS_INSTRUCTION : bareChestAsk ? BARE_CHEST_INSTRUCTION : "",
      compiled.negative ? `Negative prompt: ${compiled.negative}` : "",
      undressAsk ? UNDRESS_NEGATIVE : bareChestAsk ? BARE_CHEST_NEGATIVE : "",
    ]
      .filter(Boolean)
      .join("\n");
    promptWarnings = [...new Set([...prepared.warnings, ...locked.warnings])];
  } else if (mode === "retouch") {
    const note = prepared.creative.replace(/\n(?:Avoid|Negative prompt)\s*:\s*[\s\S]*$/i, "").trim();
    const clothes = undressAsk
      ? UNDRESS_INSTRUCTION
      : bareChestAsk
        ? BARE_CHEST_INSTRUCTION
        : "Change the clothes to the note. The outfit in the photograph is gone. Do not keep that outfit.";
    const garmentRef = !undressAsk && extras.length ? "Image 2 is the garment to put on her." : "";
    const noteLine = undressAsk ? "" : note ? `Note: ${note}` : "";
    user = [
      "IMAGE EDIT of <image1>. This photograph is the one to change.",
      "Keep her face, hair, pose, crop, and the place. Do not keep the clothes.",
      clothes,
      garmentRef,
      noteLine,
      undressAsk ? `Avoid: ${UNDRESS_NEGATIVE}` : "",
      "One woman. Real photograph, pores visible. Not a new person.",
    ]
      .filter(Boolean)
      .join("\n");
    promptWarnings = [...promptWarnings, "Edit image. Clothes follow the note. Face, pose, and place stay."];
  } else if (mode === "scene" && (engineId === "qwen-image-2.1" || engineId === "qwen-image-2.1-gguf")) {
    const scene = await compileQwen21ScenePrompt(prepared.creative, String(body.presetPrompt || "").trim());
    user = scene.prompt;
    promptWarnings = [...new Set([...prepared.warnings, ...scene.warnings])];
  }
  const aspect = parseImageAspect(body.aspect);
  const canvas = sizeForAspect(aspect);
  const qwen21Scene = mode === "scene" && (engineId === "qwen-image-2.1" || engineId === "qwen-image-2.1-gguf");
  const viggleChat = mode === "chat" && engineId === "qwen-image-2.1-viggle";
  const prompt = viggleChat || qwen21Scene || mode === "retouch" || mode === "pose-real" || isTryOnEngine(engineId) || (mode === "product" && isProductTryOnEngine(engineId))
    ? user
    : editPrompt(
    mode,
    user,
    row.name,
    mode === "face-swap" ? false : Boolean(characterStillRefs(row).body),
    engineId,
    extras.length,
    aspect,
    String(body.presetPrompt || "").trim(),
  );
  const driftLock = mode === "chat" ? driftEngineFaceLock(engineId) : "";
  const localLock = mode === "chat" ? localEditFaceLock(engineId) : "";
  const faceLock = [driftLock, localLock].filter(Boolean).join("\n");
  const voicedBody = faceLock ? calmDriftFaceWording(prompt) : prompt;
  const voiced = faceLock ? `${faceLock}\n\n${voicedBody}` : voicedBody;
  const fullPrompt =
    extra && mode !== "product" && mode !== "pose-real" ? `${voiced} Additional guidance image provided.` : voiced;
  const job = startJob(fullPrompt, engineId, id);
  after(async () => {
    try {
      const locked = characterStillRefs(getCharacter(id)!);
      let refs = locked;
      if (mode === "product") {
        const productPaths = extras.map((u) => mediaUrlToPath(u));
        if (productPaths.some((p) => !fs.existsSync(p))) throw new Error("product image not on disk");
        if (isTryOnEngine(engineId) || isProductTryOnEngine(engineId)) {
          rememberProductUrls(extras, `try-on · ${row.name}`);
          let skuSheet = productPaths[0]!;
          if (productPaths.length > 1) {
            skuSheet = characterSlotFile(id, `sku-sheet-${editId.slice(0, 8)}`, "png");
            await composeProductRefs(productPaths, skuSheet);
          }
          if (usesDriftTryOnFace(engineId)) {
            const head = characterStillRefs(getCharacter(id)!).face;
            const face = head && fs.existsSync(head) ? head : src;
            refs = { face, body: skuSheet, scene: src !== face && fs.existsSync(src) ? src : undefined };
          } else {
            refs = { face: src, body: skuSheet };
          }
        } else {
        const p1 = characterSlotFile(id, `product-1-${editId.slice(0, 8)}`, "png");
        await composeProductRefs([productPaths[0]], p1);
        let extraViews: string | undefined;
        if (productPaths.length > 1) {
          extraViews = characterSlotFile(id, `product-rest-${editId.slice(0, 8)}`, "png");
          await composeProductRefs(productPaths.slice(1), extraViews);
        }
        rememberProductUrls(extras, `SKU · ${row.name}`);
        refs = { face: src, body: p1, scene: extraViews };
        }
      } else if (mode === "repair") {
        refs = { face: src };
      } else if (mode === "pose-real") {
        const lookPath = extra && extra !== lockUrl && extra !== baseUrl ? mediaUrlToPath(extra) : "";
        if (!lookPath || !fs.existsSync(lookPath)) throw new Error("pick a look / illustration");
        const plates = characterStillRefs(getCharacter(id)!);
        const facePath = plates.face || (lockUrl ? mediaUrlToPath(lockUrl) : src);
        const qwenEdit =
          engineId === "qwen-image-2.1" ||
          engineId === "qwen-image-2.1-gguf" ||
          engineId === "qwen-image-2.1" ||
          engineId === "qwen-image-3.0";
        refs = {
          face: fs.existsSync(facePath) ? facePath : src,
          body: qwenEdit ? undefined : plates.body && plates.body !== facePath ? plates.body : undefined,
          scene: lookPath,
        };
      } else if (mode === "face-swap") {
        const plates = characterStillRefs(getCharacter(id)!);
        const faceSrc = plates.face || mediaUrlToPath(row.identityUrl || "");
        if (!faceSrc || !fs.existsSync(faceSrc)) throw new Error("need FACE lock");
        const crop = characterSlotFile(id, `face-crop-${editId.slice(0, 8)}`, "png");
        const face = await cropIdentityFace(faceSrc, crop);
        refs = { face, scene: src };
      } else if (mode === "scene" || mode === "retouch") {
        const extraPaths = extras
          .map((u) => mediaUrlToPath(u))
          .filter((p) => p && p !== src && fs.existsSync(p))
          .slice(0, 3);
        refs = { scene: src, extra: extraPaths };
      } else if (mode === "chat" && engineId === "qwen-image-2.1-viggle" && !shot && !hasPresetBlocks) {
        const plate = viggleBodyPlate(getCharacter(id)!);
        if (!plate) throw new Error("Viggle needs a 3/4 body still. Headshot is not used.");
        refs = { face: plate.path };
      } else if (mode === "chat") {
        const qwen21 = engineId === "qwen-image-2.1" || engineId === "qwen-image-2.1-gguf";
        const skipClothedBody = qwen21 && (undressAsk || bareChestAsk);
        const shotPlate: Record<ShotPlate, "close" | "three_quarter" | "full"> = {
          headshot: "close",
          three_quarter: "three_quarter",
          full: "full",
        };
        const framingSource = [String(body.presetPrompt || "").trim(), prepared.creative, ...Object.values(presetBlocks)]
          .filter(Boolean)
          .join("\n");
        const legs = /\bknee[-\s]?shot\b|\bknee[-\s]?up\b|\bhead to the knees\b|\bdown to the knees\b/i.test(framingSource);
        const framing = skipClothedBody
          ? "close"
          : shot
            ? shotPlate[shot.plate]
            : presetPlate
              ? shotPlate[presetPlate]
              : framingFromPrompt(framingSource);
        const picked = characterGenerateRefs(getCharacter(id)!, framing, { legs });
        const face = picked.face && fs.existsSync(picked.face) ? picked.face : src;
        const bodyFile =
          skipClothedBody
            ? undefined
            : picked.body && fs.existsSync(picked.body) && picked.body !== face
              ? picked.body
              : undefined;
        refs = { face, body: bodyFile };
      } else {
        refs = { face: src, body: locked.body };
      }
      const { buffer } = await generateStill(fullPrompt, refs, engineId, {
        kind:
          isTryOnEngine(engineId) || mode === "product"
            ? "on-model"
            : mode === "face-swap"
            ? "faceswap"
            : mode === "scene" || mode === "retouch"
              ? "scene"
              : mode === "bg" || mode === "repair"
                ? "bump"
                : "restyle",
        width: canvas.width,
        height: canvas.height,
        aspect,
        vibePrompt: prepared.creative,
        onProgress: (label) => updateJob(job.id, { progress: label }),
      });
      fs.writeFileSync(dest, buffer);
      updateJob(job.id, { status: "completed", mediaPath: dest, mediaUrl, characterId: id });
      addEdit(id, {
        id: editId,
        url: mediaUrl,
        prompt: fullPrompt,
        baseUrl: extras.join(" | ") || extra || baseUrl,
        mode,
        jobId: job.id,
        model: engineId,
        provider: job.provider,
        createdAt: job.createdAt,
        shotId: shot?.id,
      });
      if (mode === "chat") {
        try {
          const learnedBlocks = outside || loose ? presetBlocks : null;
          const learnedPrompt = learnedBlocks
            ? Object.entries(learnedBlocks)
                .filter(([, text]) => String(text || "").trim())
                .map(([id, text]) => `[${id}]\n${String(text).trim()}`)
                .join("\n\n")
            : [String(body.presetPrompt || "").trim(), prepared.creative].filter(Boolean).join("\n");
          await learnLookFromGenerate({
            id: editId,
            prompt: learnedPrompt,
            negative: compiled.negative,
            preview: mediaUrl,
            shot: Boolean(shot),
          });
        } catch {
          /* overlay write is best-effort */
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      updateJob(job.id, { status: "failed", error: message });
    }
  });
  return NextResponse.json({ jobId: job.id, pending: "edit", warnings: promptWarnings }, { status: 202 });
}

/** Image complete set (if missing) then Wan 3.0 Prime 5s per still. */
export async function runVideoSet(_req: Request, id: string) {
  const row = getCharacter(id);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!row.identityUrl) return NextResponse.json({ error: "lock identity first" }, { status: 400 });
  const job = startJob("complete set video · headshot · 3/4 · full body", "wan-3-0", id);
  after(async () => {
    try {
      const n = COMPLETE_SET_KEYS.length;
      let lastUrl = "";
      for (let i = 0; i < n; i++) {
        const k = COMPLETE_SET_KEYS[i]!;
        const def = SLOT_DEFS.find((s) => s.key === k);
        const label = def?.label || k;
        let stillUrl = getCharacter(id)?.slots.find((s) => s.key === k)?.url;
        const stillPath = stillUrl ? mediaUrlToPath(stillUrl) : "";
        if (!stillUrl || !fs.existsSync(stillPath)) {
          updateJob(job.id, { progress: `still ${i + 1}/${n} ${label}` });
          const prompt = COMPLETE_SET_PROMPTS[k];
          const destStill = characterSlotFile(id, k, "png");
          const url = characterSlotUrl(id, k, "png");
          const { buffer } = await generateStill(
            prompt,
            characterStillRefs(getCharacter(id)!),
            COMPLETE_SET_ENGINE,
            { kind: "restyle" },
          );
          fs.writeFileSync(destStill, buffer);
          setSlot(id, k, { url, jobId: job.id, prompt, upscaled: false });
          stillUrl = url;
        }
        updateJob(job.id, { progress: `video ${i + 1}/${n} ${label}` });
        const clipId = randomUUID();
        const dest = motionFile(clipId);
        const buffer = await dashscopeWan3Video({
          prompt: COMPLETE_SET_VIDEO_PROMPTS[k],
          stillPath: mediaUrlToPath(stillUrl),
          durationSec: 5,
          sound: true,
          engineId: "wan-3-0",
          jobId: job.id,
          onProgress: (label) => updateJob(job.id, { progress: `${i + 1}/${n} ${label}` }),
        });
        fs.writeFileSync(dest, buffer);
        const now = new Date().toISOString();
        const mediaUrl = `/api/media/motion/${clipId}.mp4`;
        lastUrl = mediaUrl;
        insertJob({
          id: clipId,
          module: "production",
          kind: "motion",
          input: `${COMPLETE_SET_VIDEO_PROMPTS[k]} | ${stillUrl}`,
          status: "completed",
          mediaPath: dest,
          mediaUrl,
          model: "wan-3-0",
          provider: "dashscope",
          characterId: id,
          createdAt: now,
          updatedAt: now,
        });
      }
      updateJob(job.id, { status: "completed", mediaUrl: lastUrl, mediaPath: lastUrl ? mediaUrlToPath(lastUrl) : undefined });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      updateJob(job.id, { status: "failed", error: message });
    }
  });
  return NextResponse.json({ jobId: job.id, pending: "video-set" }, { status: 202 });
}
