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
  POSE_LOOK_REAL_FOLLOW_LOOK,
  POSE_LOOK_REAL_FOLLOW_TEXT,
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
import { compileCharacterPrompt, withAvoidList } from "./prompt-compile";
import { cropIdentityFace } from "./crop-face";
import { characterLook, compileLockedPrompt, deriveLook, isMinorLook, lookHairNegative, lookSkinNegative, operatorSetsScene, operatorWantsUndress, prepareOperatorPrompt, UNDRESS_INSTRUCTION, UNDRESS_NEGATIVE } from "./look-lock";
import { characterStillRefs } from "./still-refs";
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

/** Workspace stills follow the selected image engine. Identity create stays GPT 2.5. */
function characterEditEngine(mode?: string, opts?: { undress?: boolean }) {
  if (mode === "pose-real") {
    const id = imageEngine().id;
    const ok = new Set(["qwen-image-edit", "seedream-5-pro", "seedream-4-5", "gpt-image-2", "gpt-image-2.5", "klein-qwen"]);
    if (ok.has(id)) return id;
    const qwen = listEngines().find((e) => e.id === "qwen-image-edit");
    if (qwen?.status === "ready") return "qwen-image-edit";
    throw new Error("Clone Image: pick Qwen Image Edit, Seedream, or GPT Image 2.");
  }
  const id = imageEngine().id;
  const qwen = listEngines().find((e) => e.id === "qwen-image-edit");
  const localGen = id === "flux2-klein-4b" || id === "z-image-turbo" || id === "klein-qwen" || id === "flux2-klein-base-9b";
  if (
    (mode === "face-swap" || mode === "repair" || mode === "product" || opts?.undress) &&
    localGen
  ) {
    if (qwen?.status === "ready") return "qwen-image-edit";
  }
  if (opts?.undress && isCloudImageEngine(id) && qwen?.status === "ready") {
    return "qwen-image-edit";
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
  return [...new Set(out)].slice(0, 3);
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
  const engineId = characterEditEngine();
  const job = startJob(BODY_LOCK_PROMPT, `${engineId}-body`, id);
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
    const setEngine = characterEditEngine();
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

  const job = startJob(prompt, `${characterEditEngine()}-ref`, id);
  const next = setSlot(id, key, { jobId: job.id, prompt });
  after(async () => {
    try {
      const { buffer } = await generateStill(prompt, characterStillRefs(getCharacter(id)!), characterEditEngine(), {
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
  otherFace = false,
  aspect = "9:16",
) {
  const extra = user.trim();
  const qwen = engineId === "qwen-image-edit" || engineId === "klein-qwen";
  const lock = hasBody ? FACE_BODY_SCENE_LOCK : FACE_ONLY_SCENE_LOCK;
  if (mode === "pose-real") {
    if (extra) {
      return `${POSE_LOOK_REAL_BASE} ${POSE_LOOK_REAL_FOLLOW_TEXT} Operator pose: ${extra} Photoreal.`.trim();
    }
    return `${POSE_LOOK_REAL_BASE} ${POSE_LOOK_REAL_FOLLOW_LOOK} Photoreal.`;
  }
  if (mode === "face-swap") {
    if (otherFace) {
      return `Image 1 is the BODY / pose / clothes / scene to keep. Image 2 is the FACE from another character — not @${name}. Put Image 2's face, skin tone, and hair onto the person in Image 1. Keep Image 1's body, posture, wardrobe, lighting, crop, and scene. Do not keep @${name}'s face. ${ONE_PERSON_LOCK} Exactly two arms and two hands. Photoreal. ${extra}`.trim();
    }
    if (qwen) {
      return `Image 1 is the pose/scene to keep. Image 2 is @${name}'s FACE lock. The person in image 1 must become @${name}: same face, same skin, same hair. Keep only pose, camera, crop, clothing, lighting, and scene from image 1. ${ONE_PERSON_LOCK} Photoreal. ${extra}`.trim();
    }
    return `The reference image is the pose, camera, crop, lighting, and scene to keep. The person in it must become @${name}: same face, same skin, same hair. Do not keep the reference person's identity. ${ONE_PERSON_LOCK} Photoreal. ${extra}`.trim();
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
  };
  let baseUrl = (body.baseUrl ?? "").trim();
  let mode = (body.mode ?? "chat").trim();
  if (!baseUrl) return NextResponse.json({ error: "select or upload a base image" }, { status: 400 });
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
  const undressAsk =
    !isMinorLook(look) &&
    (operatorWantsUndress(compiled.creative) || operatorWantsUndress(body.prompt ?? ""));
  let user = withAvoidList(
    prepared.creative,
    [compiled.negative, lookHairNegative(look), lookSkinNegative(), undressAsk ? UNDRESS_NEGATIVE : ""].filter(Boolean).join(", "),
  );
  if (!user && mode === "chat") {
    return NextResponse.json({ error: "describe the edit" }, { status: 400 });
  }
  if (mode === "pose-real") {
    const bodyLock = row.slots.find((s) => s.key === "front" && s.url)?.url || "";
    if (!baseUrl || baseUrl === (row.identityUrl || "")) {
      if (!bodyLock) {
        return NextResponse.json({ error: "need BODY LOCK (full body). Run Complete set first." }, { status: 400 });
      }
      baseUrl = bodyLock;
    }
    const extrasNow = collectExtraUrls(body);
    if (!extrasNow[0]) {
      return NextResponse.json({ error: "pick a look / illustration" }, { status: 400 });
    }
  }
  const extras = collectExtraUrls(body);
  const extra = extras[0] || "";
  const lockUrl = row.identityUrl || baseUrl;
  if (mode === "chat" && compiled.needsSceneRef) {
    const pose = extra && extra !== lockUrl ? extra : baseUrl && baseUrl !== lockUrl ? baseUrl : "";
    if (!pose) {
      return NextResponse.json(
        {
          error:
            "This prompt keeps pose from a second photo. Attach it with + Additional image (or drop it on Pose/lighting ref in Generate image).",
        },
        { status: 400 },
      );
    }
    mode = "face-swap";
    body.baseUrl = pose;
  }
  const donorFace = mode === "face-swap" && extra && extra !== lockUrl ? extra : "";
  const sceneUrl = (mode === "face-swap" ? baseUrl : baseUrl).trim();
  if (mode === "product" && extras.length < 1) {
    return NextResponse.json({ error: "upload a product image" }, { status: 400 });
  }
  const src = mediaUrlToPath(mode === "product" ? lockUrl : mode === "face-swap" ? sceneUrl : baseUrl);
  if (!fs.existsSync(src)) return NextResponse.json({ error: "base image not on disk" }, { status: 400 });

  const editId = randomUUID();
  const dest = characterSlotFile(id, `edit-${editId.slice(0, 8)}`, "png");
  const mediaUrl = characterSlotUrl(id, `edit-${editId.slice(0, 8)}`, "png");
  let engineId: string;
  try {
    engineId = characterEditEngine(mode, { undress: undressAsk });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
  const skipRevamp = isCloudImageEngine(engineId);
  let promptWarnings = prepared.warnings;
  if (undressAsk && engineId === "qwen-image-edit" && isCloudImageEngine(imageEngine().id)) {
    promptWarnings = [...promptWarnings, "GPT Image / Seedream block NSFW. This job used Qwen Image Edit (local)."];
  }
  if (mode === "chat") {
    const locked = await compileLockedPrompt(prepared.creative, row.name, look, { skipRevamp });
    user = withAvoidList(
      locked.prompt,
      [compiled.negative, lookHairNegative(look), lookSkinNegative(), undressAsk ? UNDRESS_NEGATIVE : ""].filter(Boolean).join(", "),
    );
    promptWarnings = [...new Set([...prepared.warnings, ...locked.warnings])];
  }
  const aspect = parseImageAspect(body.aspect);
  const canvas = sizeForAspect(aspect);
  const prompt = editPrompt(
    mode,
    user,
    row.name,
    mode === "face-swap" ? false : Boolean(characterStillRefs(row).body),
    engineId,
    extras.length,
    Boolean(donorFace),
    aspect,
  );
  const fullPrompt =
    extra && mode !== "product" && mode !== "pose-real" ? `${prompt} Additional guidance image provided.` : prompt;
  const job = startJob(fullPrompt, engineId, id);
  after(async () => {
    try {
      const locked = characterStillRefs(getCharacter(id)!);
      let refs = locked;
      if (mode === "product") {
        const productPaths = extras.map((u) => mediaUrlToPath(u));
        if (productPaths.some((p) => !fs.existsSync(p))) throw new Error("product image not on disk");
        const p1 = characterSlotFile(id, `product-1-${editId.slice(0, 8)}`, "png");
        await composeProductRefs([productPaths[0]], p1);
        let extraViews: string | undefined;
        if (productPaths.length > 1) {
          extraViews = characterSlotFile(id, `product-rest-${editId.slice(0, 8)}`, "png");
          await composeProductRefs(productPaths.slice(1), extraViews);
        }
        rememberProductUrls(extras, `SKU · ${row.name}`);
        refs = { face: src, body: p1, scene: extraViews };
      } else if (mode === "repair") {
        refs = { face: src };
      } else if (mode === "pose-real") {
        const lookPath = extra && extra !== lockUrl && extra !== baseUrl ? mediaUrlToPath(extra) : "";
        if (!lookPath || !fs.existsSync(lookPath)) throw new Error("pick a look / illustration");
        refs = { face: src, body: lookPath };
      } else if (mode === "face-swap") {
        const donorPath = mediaUrlToPath(donorFace || extra || lockUrl);
        if (!fs.existsSync(donorPath)) throw new Error("donor face not on disk");
        const crop = characterSlotFile(id, `face-crop-${editId.slice(0, 8)}`, "png");
        const face = await cropIdentityFace(donorPath, crop);
        refs = { face, scene: src };
      } else if (mode === "chat") {
        refs = locked.face ? locked : { face: src };
        if (undressAsk) {
          const bodyLock = locked.body && fs.existsSync(locked.body) ? locked.body : src;
          refs = { face: bodyLock };
        } else if (engineId !== "klein-qwen" && operatorSetsScene(fullPrompt) && refs.face) {
          const crop = characterSlotFile(id, `face-crop-${editId.slice(0, 8)}`, "png");
          const face = await cropIdentityFace(refs.face, crop);
          refs = { face };
        }
      } else {
        refs = { face: src, body: locked.body };
      }
      const { buffer } = await generateStill(fullPrompt, refs, engineId, {
        kind:
          engineId === "klein-qwen" || mode === "face-swap"
            ? "faceswap"
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
      });
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
            characterEditEngine(),
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
