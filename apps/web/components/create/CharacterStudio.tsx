"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { isMinorLook, type Character, type CharacterSlot } from "@/lib/character-types";
import { cn } from "@/lib/cn";
import { CountryChips } from "@/components/CountryChips";
import { useGpu } from "@/components/GpuStatus";
import { CharacterGallery, type GalleryJob } from "@/components/create/CharacterGallery";
import { PRESET_CATEGORIES, presetBlurb, presetLabel, presetNegative, presetPreview, presetPrompt, subjectPlate, type PresetCategory, type PresetOption } from "@/lib/prompt-presets";
import { SHOT_PRESETS, compileShotPrompt, editUsesShot, type ShotPreset } from "@/lib/shot-presets";
import { isProductMediaUrl } from "@/lib/media-kind";
import { thumbSrc } from "@/lib/media-url";
import { ProductPicker } from "@/components/create/ProductPicker";
import { compileCharacterPrompt, looksLikeNewPhotoshoot, withAvoidList } from "@/lib/prompt-compile";
import { quoteMotionBar } from "@/lib/cloud-rates";
import { isWanEngine } from "@/lib/job-gpu";
import { AffiliateCanvas } from "@/components/create/workspace/AffiliateCanvas";
import { I2VCanvas } from "@/components/create/workspace/I2VCanvas";
import { SoonCanvas } from "@/components/create/workspace/SoonCanvas";
import { ReplicateCanvas } from "@/components/create/workspace/ReplicateCanvas";
import { IMAGE_TOOLS, VIDEO_TOOLS, WORKSPACE_I2V_ENGINES } from "@/components/create/workspace/tools";
import { PAID_I2V_ENGINES } from "@/lib/paid-i2v";
import { IMAGE_ASPECTS } from "@/lib/image-aspect";
import { PRODUCT_CATEGORIES } from "@/lib/product-category";

type PickedChip = { id: string; label: string; prompt: string; negative?: string };

const TRYON_IDS = ["grok-imagine-tryon", "kling-image-omni"];
const PRODUCT_TRYON_IDS = ["muse-image-1.0", "qwen-image-3.0", "kling-image-omni", "grok-imagine-tryon", "qwen-image-2.1"];
const GENERATE_ENGINE_IDS = [
  "qwen-image-2.1",
  "qwen-image-2.1-gguf",
  "qwen-image-2.1-viggle",
  "grok-imagine",
  "muse-image-1.0",
  "qwen-image-3.0",
  "seedream-5-pro",
  "seedream-5-lite",
  "seedream-4-5",
  "gpt-image-2.5",
  "gpt-image-2.5-flare",
];
const EDIT_STILL_ENGINE_IDS = [
  "qwen-image-2.1",
  "qwen-image-2.1-gguf",
  "qwen-image-2.1-viggle",
  "grok-imagine",
  "muse-image-1.0",
  "qwen-image-3.0",
  "seedream-5-pro",
];
type ProductFraming = "headshot" | "three_quarter" | "full";

const ROSE = "#E11D48";

type Clip = GalleryJob;

export function CharacterStudio({
  character,
  clips,
  busy,
  error,
  notice,
  elapsed,
  progress,
  onGenSlot,
  onUpscale,
  onUpscaleVideo,
  onEdit,
  onVideoSet,
  onMotion,
  onReplicate,
  onDelete,
  onDeleteMedia,
  onToggleInspiration,
  onTogglePublic,
  sharedInspiration,
}: {
  character: Character;
  clips: Clip[];
  busy: string;
  error: string;
  notice?: string;
  elapsed: string;
  progress: string;
  onGenSlot: (slot: CharacterSlot, prompt: string) => void;
  onUpscale: (slot: "identity" | string) => void;
  onUpscaleVideo?: (mediaUrl: string) => void;
  onEdit: (opts: {
    baseUrl: string;
    prompt: string;
    mode: string;
    extraUrl?: string;
    extraUrls?: string[];
    aspect?: string;
    presetPrompt?: string;
    presetBlocks?: Record<string, string>;
    presetPlate?: "headshot" | "three_quarter" | "full";
    shotId?: string;
    clonePose?: "character" | "look";
    engineId?: string;
    count?: number;
  }) => void;
  onVideoSet: () => void;
  onMotion: (opts: {
    imageUrl: string;
    prompt: string;
    durationSec: number;
    motionUrl?: string;
    engineId?: string;
    sound?: boolean;
    extraUrls?: string[];
    orientation?: "image" | "video";
    productId?: string;
  }) => void;
  onReplicate: (opts: { url: string; engineId: string; draftOnly: boolean; variation: string }) => void;
  onDelete: (typed: string) => void;
  onDeleteMedia?: (url: string) => void;
  onToggleInspiration?: (item: { url: string; kind: "image" | "video"; label: string }) => void;
  onTogglePublic: (next: boolean) => void;
  sharedInspiration?: Character["inspiration"];
}) {
  const router = useRouter();
  const gpu = useGpu();
  const params = useSearchParams();
  const tool = params.get("tool") || "generate-image";
  const isTryOn = tool === "try-on";
  const isFaceSwap = tool === "face-swap";
  const isEditStill = tool === "edit-image";
  const isEditWorkspace = isTryOn || isFaceSwap || isEditStill;
  const [prompt, setPrompt] = useState("");
  const [editPrompt, setEditPrompt] = useState("");
  const [picked, setPicked] = useState<Record<string, PickedChip>>({});
  const [shotId, setShotId] = useState("");
  const [openCat, setOpenCat] = useState<string | null>(null);
  const [customDraft, setCustomDraft] = useState("");
  const [presetCats, setPresetCats] = useState<PresetCategory[]>(PRESET_CATEGORIES);
  const [qty, setQty] = useState(1);
  const [aspect, setAspect] = useState("9:16");
  const [imageEngines, setImageEngines] = useState<
    {
      id: string;
      kind?: string;
      name: string;
      status: string;
      nativeSize?: string;
      cloud?: boolean;
      via?: { id: string; name: string; canGenerate: boolean; reason: string };
    }[]
  >([]);
  const [imageEngineId, setImageEngineId] = useState("");
  const characterImageEngines = imageEngines.filter((e) => e.id !== "reactor");
  const generateEngines = GENERATE_ENGINE_IDS.map((id) => characterImageEngines.find((e) => e.id === id)).filter(
    (e): e is (typeof characterImageEngines)[number] => Boolean(e),
  );
  const editStillEngines = EDIT_STILL_ENGINE_IDS.map((id) => characterImageEngines.find((e) => e.id === id)).filter(
    (e): e is (typeof characterImageEngines)[number] => Boolean(e),
  );
  const editProductEngines = [...characterImageEngines]
    .filter((e) => PRODUCT_TRYON_IDS.includes(e.id))
    .sort((a, b) => PRODUCT_TRYON_IDS.indexOf(a.id) - PRODUCT_TRYON_IDS.indexOf(b.id));
  const characterImageId =
    tool === "generate-image" && TRYON_IDS.includes(imageEngineId)
      ? characterImageEngines.find((e) => e.id === "qwen-image-2.1")?.id ||
        characterImageEngines.find((e) => e.status === "ready")?.id ||
        imageEngineId
      : imageEngineId;

  const faceUrl = character.slots.find((s) => s.key === "headshot")?.url || character.identityUrl || "";
  const [durationSec, setDurationSec] = useState(5);
  const [motionEngineId, setMotionEngineId] = useState("minimax-h3");
  const [motionEngines, setMotionEngines] = useState<{ id: string; name: string; status: string; cloud?: boolean }[]>([]);
  const [refImage, setRefImage] = useState(faceUrl);
  const [editMode, setEditMode] = useState("chat");
  const lastEdit = character.edits?.[0]?.url || "";
  const [editBase, setEditBase] = useState(lastEdit || faceUrl);
  const [editExtra, setEditExtra] = useState("");
  const [editExtras, setEditExtras] = useState<string[]>(["", "", ""]);
  const [editProducts, setEditProducts] = useState<string[]>([]);
  const [productFraming, setProductFraming] = useState<ProductFraming>("full");
  const plateUrl = (key: string) => character.slots.find((s) => s.key === key && s.url)?.url || "";
  const productPlates: Record<ProductFraming, string> = {
    headshot: plateUrl("headshot") || character.identityUrl || "",
    three_quarter: plateUrl("three_quarter_body"),
    full: plateUrl("front"),
  };
  const productPerson =
    productPlates[productFraming] || productPlates.full || productPlates.three_quarter || productPlates.headshot;
  const [pickBase, setPickBase] = useState(true);
  const [banner, setBanner] = useState(true);
  const [imageMode, setImageMode] = useState<"chat" | "sheet" | "pose-real">("chat");
  const [poseRef, setPoseRef] = useState("");
  const [lookRef, setLookRef] = useState("");
  const [cloneSlot, setCloneSlot] = useState<"pose" | "look">("look");
  const [clonePose, setClonePose] = useState<"character" | "look">("character");
  const [cloneNote, setCloneNote] = useState("");
  const [poseHint, setPoseHint] = useState("");
  const [replicateUrl, setReplicateUrl] = useState("");
  const [replicateVariation, setReplicateVariation] = useState("");
  const [replicateDraft, setReplicateDraft] = useState(false);
  const [confirmDel, setConfirmDel] = useState("");
  const [engineNames, setEngineNames] = useState<Record<string, string>>({});
  const [name, setName] = useState(character.name);
  const [markets, setMarkets] = useState<string[]>(character.markets || []);
  const [library, setLibrary] = useState<
    { id: string; name: string; identityUrl: string | null; thumbUrl?: string | null; poseUrl?: string | null }[]
  >([]);
  const publicOn = character.visibility === "public";

  useEffect(() => {
    fetch("/api/characters?lite=1")
      .then((r) => r.json())
      .then((j) =>
        setLibrary(
          (
            (j.characters || []) as {
              id: string;
              name: string;
              identityUrl: string | null;
              thumbUrl?: string | null;
              poseUrl?: string | null;
            }[]
          ).filter((c) => c.thumbUrl || c.identityUrl || c.poseUrl),
        ),
      )
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setName(character.name);
    setMarkets(character.markets || []);
  }, [character.name, character.markets]);

  useEffect(() => {
    if (isTryOn) setEditMode("product");
    if (isFaceSwap) {
      setEditMode("face-swap");
      setEditExtra("");
    }
    if (isEditStill && (editMode === "product" || editMode === "face-swap")) setEditMode("chat");
  }, [tool]);

  useEffect(() => {
    if (isTryOn && TRYON_IDS.includes(characterImageId)) setEditMode("product");
  }, [tool, characterImageId]);

  const engineBeforeTryOn = useRef("");
  useEffect(() => {
    if (!isTryOn) {
      const back = engineBeforeTryOn.current;
      if (!back) return;
      engineBeforeTryOn.current = "";
      if (back !== imageEngineId) void pickImageEngine(back).catch(() => undefined);
      return;
    }
    if (!engineBeforeTryOn.current && imageEngineId) {
      engineBeforeTryOn.current = imageEngineId;
    }
    if (PRODUCT_TRYON_IDS.includes(imageEngineId)) return;
    const hit =
      characterImageEngines.find((e) => e.id === "muse-image-1.0" && e.status === "ready") ||
      characterImageEngines.find((e) => e.id === "qwen-image-2.1" && e.status === "ready");
    if (hit && hit.id !== imageEngineId) void pickImageEngine(hit.id).catch(() => undefined);
  }, [tool, characterImageEngines, imageEngineId]);

  useEffect(() => {
    if (!isTryOn) return;
    if (productPlates[productFraming]) return;
    const next: ProductFraming = productPlates.full ? "full" : productPlates.three_quarter ? "three_quarter" : "headshot";
    if (next !== productFraming) setProductFraming(next);
  }, [tool, productFraming, productPlates.full, productPlates.three_quarter, productPlates.headshot]);

  useEffect(() => {
    if (!isTryOn) return;
    if (productPerson) setEditBase(productPerson);
  }, [tool, productPerson]);

  useEffect(() => {
    if (tool !== "clone-video") return;
    const paidReady = (PAID_I2V_ENGINES as readonly string[]).includes(motionEngineId)
      && motionEngines.some((e) => e.id === motionEngineId && e.status === "ready");
    if (paidReady) return;
    const hit = PAID_I2V_ENGINES.map((id) => motionEngines.find((e) => e.id === id && e.status === "ready")).find(Boolean);
    if (hit) setMotionEngineId(hit.id);
  }, [tool, motionEngines, motionEngineId]);

  useEffect(() => {
    if (tool !== "affiliate") return;
    const ok = ["wan-3-0", "wan-3-0-std", "seedance-2-5", "grok-imagine-video"];
    if (ok.includes(motionEngineId)) return;
    const hit = ok.map((id) => motionEngines.find((e) => e.id === id && e.status === "ready")).find(Boolean);
    if (hit) setMotionEngineId(hit.id);
  }, [tool, motionEngines, motionEngineId]);

  async function saveName() {
    const next = name.trim() || "Untitled character";
    if (next === character.name) return;
    const res = await fetch(`/api/characters/${character.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: next }),
    });
    if (!res.ok) {
      setName(character.name);
      return;
    }
    setName(next);
    router.refresh();
  }

  async function saveMarkets(next: string[]) {
    const previous = markets;
    setMarkets(next);
    const res = await fetch(`/api/characters/${character.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markets: next }),
    });
    if (!res.ok) setMarkets(previous);
  }

  useEffect(() => {
    fetch("/api/settings/presets")
      .then((r) => r.json())
      .then((j) => {
        if (Array.isArray(j.categories) && j.categories.length) setPresetCats(j.categories);
      })
      .catch(() => undefined);
  }, [character.edits?.length]);

  useEffect(() => {
    fetch("/api/settings/engines")
      .then((r) => r.json())
      .then((j) => {
        const all = ((j.engines || []) as {
          id: string;
          kind: string;
          name: string;
          status: string;
          nativeSize?: string;
          cloud?: boolean;
          via?: { id: string; name: string; canGenerate: boolean; reason: string };
        }[]) || [];
        const names: Record<string, string> = {};
        for (const e of all) names[e.id] = e.name;
        setEngineNames(names);
        const rows = all.filter((e) => e.kind === "image" && e.id !== "native-4k");
        setImageEngines(rows);
        const qwen21 = rows.find((e) => e.id === "qwen-image-2.1" && e.status === "ready");
        const selected = j.selected?.image as string | undefined;
        const saved =
          selected && GENERATE_ENGINE_IDS.includes(selected) && rows.some((e) => e.id === selected)
            ? selected
            : "";
        setImageEngineId(saved || qwen21?.id || rows.find((e) => e.status === "ready")?.id || "");
        const motion = all.filter((e) => e.kind === "motion" && (WORKSPACE_I2V_ENGINES as readonly string[]).includes(e.id));
        setMotionEngines(motion);
        const freeReady = motion.find((e) => e.id === "minimax-h3" && e.status === "ready");
        setMotionEngineId(
          freeReady?.id ||
            motion.find((e) => !e.cloud && e.status === "ready")?.id ||
            motion.find((e) => e.status === "ready")?.id ||
            "minimax-h3",
        );
      })
      .catch(() => undefined);
  }, []);

  const activeImage = imageEngines.find((e) => e.id === characterImageId);
  const creditLabel = !activeImage
    ? "—"
    : activeImage.cloud
      ? activeImage.via?.canGenerate
        ? "Paid · ready"
        : "Paid · need API key"
      : "Free · local 3060";

  async function pickImageEngine(id: string) {
    const prev = imageEngineId;
    setImageEngineId(id);
    if (TRYON_IDS.includes(id) && (isTryOn || isEditStill)) setTool("try-on");
    const res = await fetch("/api/settings/engines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "image", id }),
    });
    if (!res.ok) {
      setImageEngineId(prev);
      return;
    }
    const json = (await res.json()) as {
      engines?: typeof imageEngines;
      selected?: { image?: string };
    };
    if (json.engines) setImageEngines(json.engines.filter((e) => e.kind === "image" && e.id !== "native-4k"));
    setImageEngineId(json.selected?.image || id);
    window.dispatchEvent(new Event("creatoros:engines"));
  }

  useEffect(() => {
    const onGenerateChat = tool === "generate-image" && imageMode === "chat";
    const allowed = onGenerateChat ? GENERATE_ENGINE_IDS : isEditStill ? EDIT_STILL_ENGINE_IDS : null;
    if (!allowed) return;
    const qwen21 = characterImageEngines.find((e) => e.id === "qwen-image-2.1" && e.status === "ready");
    const lockedAway =
      imageEngineId === "reactor" ||
      TRYON_IDS.includes(imageEngineId) ||
      !allowed.includes(imageEngineId);
    if (imageEngineId === "qwen-image-2.1") return;
    if (!lockedAway && allowed.includes(imageEngineId)) return;
    const hit = qwen21 || characterImageEngines.find((e) => allowed.includes(e.id) && e.status === "ready");
    if (hit) void pickImageEngine(hit.id).catch(() => undefined);
  }, [tool, imageMode, isEditStill, imageEngineId, characterImageEngines]);

  const workspaceCats = isMinorLook(character.look) ? presetCats.filter((c) => !c.nsfw) : presetCats;
  const shotPresets = isMinorLook(character.look) ? SHOT_PRESETS.filter((s) => !s.nsfw) : SHOT_PRESETS;
  const readyTools = useMemo(
    () => new Set<string>([...VIDEO_TOOLS, ...IMAGE_TOOLS].filter((t) => t.ready).map((t) => t.id)),
    [],
  );
  const selectedReady = readyTools.has(tool);
  const bodyLockUrl = character.slots.find((s) => s.key === "front" && s.url)?.url || "";
  const sheetStill = tool === "generate-image" && imageMode === "sheet";
  const canGenerateImage =
    imageMode === "pose-real"
      ? Boolean(character.identityUrl && bodyLockUrl && lookRef)
      : imageMode === "sheet"
        ? Boolean(character.identityUrl)
        : Boolean(character.identityUrl && bodyLockUrl);
  const canI2V = Boolean(refImage);
  const stackPrompt = (extra: string) => {
    const compiled = compileCharacterPrompt(extra);
    const fragments = workspaceCats.map((c) => picked[c.id]?.prompt).filter(Boolean);
    const presetNeg = workspaceCats.map((c) => picked[c.id]?.negative).filter(Boolean).join(", ");
    return withAvoidList(
      [...fragments, compiled.creative].filter(Boolean).join("\n"),
      [compiled.negative, presetNeg].filter(Boolean).join(", "),
    );
  };
  const canEdit = isTryOn
    ? Boolean((editBase || productPerson) && editProducts.length)
    : isFaceSwap
      ? Boolean(character.identityUrl && editBase && editBase !== character.identityUrl)
      : Boolean(editBase) &&
        (editMode === "chat"
          ? Boolean(editPrompt.trim()) || editExtras.some(Boolean)
          : editMode === "retouch"
            ? Boolean(editPrompt.trim())
            : true);

  function pickProductFraming(next: ProductFraming) {
    if (!productPlates[next]) return;
    setProductFraming(next);
    setEditBase(productPlates[next]);
    setAspect(next === "full" ? "9:16" : "3:4");
  }

  function setTool(id: string) {
    router.replace(`/create/characters/${character.id}/workspace?tool=${id}`);
  }

  function pickOption(categoryId: string, optionId: string, customText?: string) {
    if (optionId.startsWith("custom:") || customText) {
      const text = customText || optionId.replace(/^custom:/, "");
      setPicked((cur) => ({ ...cur, [categoryId]: { id: "custom", label: text.slice(0, 24), prompt: text, negative: "" } }));
    } else {
      const opt = presetCats.find((c) => c.id === categoryId)?.options.find((o) => o.id === optionId);
      const fromCatalog = presetLabel(categoryId, optionId);
      const rawLabel = opt?.label || fromCatalog || "";
      const label = !rawLabel || /^g-[0-9a-f]/i.test(rawLabel) ? fromCatalog || "Look" : rawLabel;
      const rawPrompt = opt?.prompt?.trim() || presetPrompt(categoryId, optionId) || "";
      const fragment = /^g-[0-9a-f]+$/i.test(rawPrompt) ? label : rawPrompt || label;
      const negative = opt?.negative || presetNegative(categoryId, optionId);
      setPicked((cur) => ({ ...cur, [categoryId]: { id: optionId, label, prompt: fragment, negative } }));
    }
    setCustomDraft("");
  }

  function editChip(categoryId: string, prompt: string) {
    setPicked((cur) => {
      const prev = cur[categoryId];
      if (!prev) return cur;
      return { ...cur, [categoryId]: { ...prev, prompt } };
    });
  }

  function clearCategory(categoryId: string) {
    setPicked((cur) => {
      const next = { ...cur };
      delete next[categoryId];
      return next;
    });
  }

  function generate() {
    if (tool === "generate-image") {
      if (imageMode === "sheet") {
        const sheet = character.slots.find((s) => s.key === "sheet");
        if (!sheet) return;
        void Promise.resolve(onGenSlot(sheet, ""));
        return;
      }
      if (imageMode === "pose-real") {
        if (!character.identityUrl || !bodyLockUrl) {
          setPoseHint("Need FACE + BODY lock. Run Complete set first.");
          return;
        }
        if (!lookRef) {
          setPoseHint("Pick a look / illustration. Face + body stay; clothes come from the photo.");
          return;
        }
        setPoseHint("");
        onEdit({
          baseUrl: faceUrl || character.identityUrl,
          prompt: cloneNote.trim(),
          mode: "pose-real",
          extraUrl: lookRef,
          aspect,
          clonePose,
          engineId: imageEngineId,
        });
        return;
      }
      if (!character.identityUrl || !bodyLockUrl) {
        setPoseHint("Need FACE + BODY lock. Run Complete set first.");
        return;
      }
      const shot = shotPresets.find((s) => s.id === shotId);
      if (shot) {
        setPoseHint("");
        onEdit({
          baseUrl: character.identityUrl,
          prompt: prompt.trim(),
          shotId: shot.id,
          mode: "chat",
          aspect,
          engineId: imageEngineId,
          count: qty,
        });
        return;
      }
      const blocks: Record<string, string> = {};
      for (const cat of workspaceCats) {
        const chip = picked[cat.id]?.prompt?.trim();
        if (chip) blocks[cat.id] = chip;
      }
      const compiled = compileCharacterPrompt(prompt);
      const hasBlocks = Object.keys(blocks).length > 0;
      if (!hasBlocks && !compiled.creative.trim()) return;
      setPoseHint("");
      onEdit({
        baseUrl: character.identityUrl,
        prompt: hasBlocks
          ? compiled.creative
          : compiled.negative
            ? `${compiled.creative}\nNegative prompt: ${compiled.negative}`
            : compiled.creative,
        ...(hasBlocks
          ? { presetBlocks: blocks, presetPlate: subjectPlate(picked.subject?.id || "") }
          : { presetPrompt: compiled.creative }),
        mode: "chat",
        aspect,
        engineId: imageEngineId,
        count: qty,
      });
      return;
    }
    if (tool === "affiliate") {
      window.dispatchEvent(new Event("creatoros:affiliate-generate"));
      return;
    }
    if (tool === "complete-set") {
      if (!character.identityUrl) return;
      onVideoSet();
      return;
    }
    if (tool === "image-to-video") {
      if (!refImage) return;
      onMotion({ imageUrl: refImage, prompt, durationSec, engineId: motionEngineId, sound: true });
      return;
    }
    if (tool === "clone-video") {
      if (!replicateUrl.trim() || !character.identityUrl) return;
      onReplicate({
        url: replicateUrl.trim(),
        engineId: motionEngineId,
        draftOnly: replicateDraft,
        variation: replicateVariation,
      });
      return;
    }
    if (isTryOn || isFaceSwap || isEditStill) {
      if (isTryOn) {
        const person = editBase || productPerson;
        if (!person || !editProducts.length) {
          setPoseHint("Pick a baseline plate and a SKU (clothes, jewelry, bag…).");
          return;
        }
        setPoseHint("");
        onEdit({
          baseUrl: person,
          prompt: editPrompt.trim(),
          mode: "product",
          extraUrl: editProducts[0],
          extraUrls: editProducts,
          aspect,
          engineId: imageEngineId,
        });
        return;
      }
      if (isFaceSwap) {
        const lock = character.identityUrl || "";
        if (!lock) {
          setPoseHint("Need FACE lock. Run Complete set first.");
          return;
        }
        if (!editBase || editBase === lock) {
          setPoseHint("Pick another character's still (pose / clothes) or upload. Not this identity plate.");
          return;
        }
        setPoseHint("");
        onEdit({ baseUrl: editBase, prompt: editPrompt.trim(), mode: "face-swap", aspect, engineId: imageEngineId });
        return;
      }
      if (!editBase) return;
      if (editMode === "chat") {
        const extraStill = editExtras.filter(Boolean);
        if (!extraStill.length && looksLikeNewPhotoshoot(editPrompt)) {
          setPoseHint("Backdrop only changes the place. Clothes go in Edit image.");
          return;
        }
        if (!editPrompt.trim() && !extraStill.length) {
          setPoseHint("Type the new place, or upload Image 2/3/4.");
          return;
        }
        setPoseHint("");
        onEdit({
          baseUrl: editBase,
          prompt: editPrompt,
          mode: "scene",
          extraUrl: editExtras.find(Boolean) || editExtra || undefined,
          extraUrls: editExtras.filter(Boolean),
          aspect,
          engineId: imageEngineId,
        });
        return;
      }
      if (editMode === "retouch") {
        if (!editPrompt.trim()) {
          setPoseHint("Type the clothes. Example: yellow bikini.");
          return;
        }
        setPoseHint("");
        onEdit({
          baseUrl: editBase,
          prompt: editPrompt,
          mode: "retouch",
          extraUrl: editExtras.find(Boolean) || undefined,
          extraUrls: editExtras.filter(Boolean),
          aspect,
          engineId: imageEngineId,
        });
        return;
      }
      setPoseHint("");
      onEdit({
        baseUrl: editBase,
        prompt: editPrompt,
        mode: editMode,
        extraUrl: editExtra || undefined,
        aspect,
        engineId: imageEngineId,
      });
    }
  }

  const jobById = new Map(clips.map((j) => [j.id, j]));
  const jobByUrl = new Map(clips.filter((j) => j.mediaUrl).map((j) => [j.mediaUrl as string, j]));
  const stills = [
    ...(character.identityUrl
      ? [
          {
            slot: "identity" as const,
            url: character.identityUrl,
            url4k: character.identityUrl4k,
            label: "Identity",
            upscaled: Boolean(character.identityUrl4k || character.identityUpscaled),
            createdAt:
              jobById.get(character.identityJobId || "")?.createdAt ||
              jobByUrl.get(character.identityUrl)?.createdAt ||
              character.createdAt,
          },
        ]
      : []),
    ...character.slots
      .filter((s) => s.url && s.url !== character.identityUrl)
      .map((s) => ({
        slot: s.key,
        url: s.url!,
        url4k: s.url4k || undefined,
        label: s.key === "sheet" ? "Sheet" : s.label,
        upscaled: Boolean(s.url4k || s.upscaled),
        createdAt: (s.jobId && jobById.get(s.jobId)?.createdAt) || jobByUrl.get(s.url!)?.createdAt || character.updatedAt,
      })),
    ...(character.edits ?? []).map((e) => ({
      slot: e.id,
      url: e.url,
      url4k: e.url4k,
      label: e.mode === "product" ? "On-model" : e.mode === "chat" ? "Edit" : e.mode,
      upscaled: Boolean(e.url4k || e.upscaled),
      createdAt: e.createdAt || (e.jobId && jobById.get(e.jobId)?.createdAt) || jobByUrl.get(e.url)?.createdAt || "",
    })),
  ];
  const seenStill = new Set(stills.map((s) => s.url));
  for (const job of clips) {
    if (!job.mediaUrl || seenStill.has(job.mediaUrl) || /\.mp4($|\?)/i.test(job.mediaUrl)) continue;
    if (isProductMediaUrl(job.mediaUrl)) continue;
    stills.push({
      slot: job.id,
      url: job.mediaUrl,
      url4k: undefined,
      label: job.model || "Generate",
      upscaled: Boolean(job.upscaled),
      createdAt: job.createdAt || "",
    });
    seenStill.add(job.mediaUrl);
  }
  stills.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

  const cloneLocal = tool === "generate-image" && imageMode === "pose-real" && !activeImage?.cloud;
  const sunburst = characterImageEngines.find((e) => e.id === "gpt-image-2.5");
  const cloudImage = sheetStill || Boolean(activeImage?.cloud);
  const needImageKey = sheetStill
    ? imageEngines.length > 0 && sunburst?.status !== "ready"
    : (tool === "generate-image" || isTryOn || isEditStill) && cloudImage && activeImage?.status !== "ready";
  const motionCloud =
    (tool === "image-to-video" || tool === "affiliate") &&
    (isWanEngine(motionEngineId) || motionEngineId.startsWith("seedance") || motionEngineId.startsWith("kling") || motionEngineId === "grok-imagine-video");
  const gpuBusy = Boolean(busy) || (!cloudImage && !motionCloud && gpu.busy);
  const wanRow = motionEngines.find((e) => e.id === motionEngineId);
  const wanMissing =
    tool === "image-to-video" && isWanEngine(motionEngineId) && motionEngines.length > 0 && wanRow?.status !== "ready";
  const paidI2vReady = motionEngines.some((e) => (PAID_I2V_ENGINES as readonly string[]).includes(e.id) && e.status === "ready");
  const disabled =
    (tool !== "clone-video" && tool !== "affiliate" && gpuBusy) ||
    (tool === "affiliate" && Boolean(busy)) ||
    !selectedReady ||
    (tool === "generate-image" && (needImageKey || !canGenerateImage)) ||
    (tool === "image-to-video" && !canI2V) ||
    (tool === "complete-set" && !character.identityUrl) ||
    (isEditWorkspace && !canEdit) ||
    (tool === "affiliate" && !character.identityUrl && stills.length === 0) ||
    (tool === "clone-video" && (!replicateUrl.trim() || !character.identityUrl || !paidI2vReady));

  return (
    <div className="min-h-[calc(100vh-49px)] bg-white text-[#111827]">
      <header className="flex items-center gap-3 border-b border-[#E5E7EB] px-4 py-2.5">
        <Link href="/create/characters" className="shrink-0 text-[15px] text-[#6B7280] hover:text-[#111827]" title="Characters">
          ←
        </Link>
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-[#F3F4F8]">
          {faceUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbSrc(faceUrl, 96, character.updatedAt)} alt="" className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => void saveName()}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className="min-w-0 max-w-[16rem] bg-transparent text-[15px] font-semibold outline-none"
              title="Rename character"
            />
            <span className="shrink-0 text-[11px] text-[#9CA3AF]">{relativeTime(character.updatedAt)}</span>
          </div>
          <SocialRow character={character} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <label className="flex items-center gap-1.5 text-[12px] text-[#6B7280]">
            Public
            <button
              type="button"
              role="switch"
              aria-checked={publicOn}
              onClick={() => onTogglePublic(!publicOn)}
              className={cn("relative h-5 w-9 rounded-full", publicOn ? "bg-[#111827]" : "bg-[#E5E7EB]")}
            >
              <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition", publicOn ? "left-4" : "left-0.5")} />
            </button>
          </label>
          <Link
            href={`/create/characters/${character.id}`}
            className="rounded-full border border-[#E5E7EB] px-3 py-1 text-[12px] font-semibold"
          >
            Update
          </Link>
          <button type="button" onClick={() => setConfirmDel(confirmDel ? "" : "open")} className="text-[12px] text-[#E11D48]">
            Delete
          </button>
        </div>
      </header>
      <div className="flex flex-wrap items-center gap-2 border-b border-[#E5E7EB] px-4 py-2">
        <span className="text-[11px] font-semibold text-[#6B7280]">Country</span>
        <CountryChips value={markets} onChange={(next) => void saveMarkets(next)} />
      </div>
      {confirmDel ? (
        <div className="flex items-center gap-2 border-b border-[#FEE2E2] bg-[#FEF2F2] px-4 py-2 text-[12px]">
          Type <strong>{character.name}</strong> to delete
          <input
            value={confirmDel === "open" ? "" : confirmDel}
            onChange={(e) => setConfirmDel(e.target.value || "open")}
            className="rounded-md border border-[#FECACA] px-2 py-1"
          />
          <button
            type="button"
            className="font-semibold text-[#E11D48]"
            onClick={() => {
              const typed = confirmDel === "open" ? "" : confirmDel;
              onDelete(typed);
            }}
          >
            Confirm
          </button>
        </div>
      ) : null}

      <div className="flex min-h-[calc(100vh-220px)]">
        <aside className="hidden w-[240px] shrink-0 border-r border-[#E5E7EB] bg-[#F3F6FB] md:block">
          <p className="flex items-center gap-2 px-4 pt-4 text-[13px] font-semibold">
            <span className="h-2 w-2 rounded-full bg-[#2563EB]" /> Video
          </p>
          <nav className="mt-2 px-2">
            {VIDEO_TOOLS.map((t) => (
              <SideLink key={t.id} active={tool === t.id} label={t.label} soon={!t.ready} onClick={() => setTool(t.id)} />
            ))}
          </nav>
          <div className="mt-4 bg-[#FFF7ED] pb-4 pt-3">
            <p className="px-4 text-[13px] font-semibold text-[#C2410C]">Image</p>
            <nav className="mt-1 px-2">
              {IMAGE_TOOLS.map((t) => (
                <SideLink
                  key={t.id}
                  active={tool === t.id}
                  label={t.label}
                  soon={!t.ready}
                  accent
                  onClick={() => setTool(t.id)}
                />
              ))}
            </nav>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {tool === "generate-image" ? (
            <GenerateImageCanvas
              characterId={character.id}
              name={character.name}
              avatar={faceUrl}
              stamp={character.updatedAt}
              prompt={prompt}
              setPrompt={setPrompt}
              picked={picked}
              openCat={openCat}
              customDraft={customDraft}
              setCustomDraft={setCustomDraft}
              onToggleCat={(id) => setOpenCat((cur) => (cur === id ? null : id))}
              onPick={pickOption}
              onEditChip={editChip}
              onClear={clearCategory}
              categories={workspaceCats}
              shots={shotPresets}
              shotId={shotId}
              onShot={setShotId}
              hair={character.look?.hair || ""}
              shotStills={(character.edits || []).map((edit) => ({ url: edit.url, prompt: edit.prompt, shotId: edit.shotId }))}
              banner={banner}
              setBanner={setBanner}
              imageMode={imageMode}
              setImageMode={setImageMode}
              poseRef={poseRef}
              setPoseRef={setPoseRef}
              lookRef={lookRef}
              setLookRef={setLookRef}
              poseHint={poseHint}
              skipRevamp={cloudImage && imageMode !== "chat"}
              onGenerate={generate}
              onEnterClone={() => {
                void pickImageEngine("muse-image-1.0");
              }}
              cloneNote={cloneNote}
              setCloneNote={setCloneNote}
              libraryStills={[
                ...stills.map((s) => ({ url: s.url, label: s.label })),
                ...(sharedInspiration ?? character.inspiration ?? [])
                  .filter((p) => p.kind === "image")
                  .map((p) => ({ url: p.url, label: p.label || "Inspiration" })),
              ].filter((s, i, a) => a.findIndex((x) => x.url === s.url) === i)}
              identityUrl={faceUrl || character.identityUrl}
              cloneSlot={cloneSlot}
              setCloneSlot={setCloneSlot}
              clonePose={clonePose}
              setClonePose={setClonePose}
              bodyLockUrl={bodyLockUrl}
            />
          ) : tool === "affiliate" ? (
            <AffiliateCanvas
              name={character.name}
              characterId={character.id}
              identity={character.identityUrl}
              stills={[
                faceUrl ? { url: faceUrl, label: "Headshot" } : null,
                productPlates.three_quarter ? { url: productPlates.three_quarter, label: "3/4" } : null,
                productPlates.full ? { url: productPlates.full, label: "Full body" } : null,
                ...(character.edits || [])
                  .filter((e) => e.mode === "product" && e.url)
                  .slice(0, 3)
                  .map((e) => ({ url: e.url, label: "On-model" })),
              ].filter((s): s is { url: string; label: string } => Boolean(s))}
              engineId={motionEngineId}
              durationSec={durationSec}
              onMotion={(opts) => onMotion({ ...opts, engineId: opts.engineId || motionEngineId })}
            />
          ) : tool === "complete-set" ? (
            <div className="p-6">
              <p className="text-[11px] font-semibold tracking-[0.16em] text-[#9CA3AF]">VIDEO · COMPLETE SET</p>
              <h2 className="mt-1 text-lg font-black">Headshot · 3/4 body · Full body</h2>
              <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-[#4B5563]">
                Three 5s Wan 3.0 Prime clips from the locked stills. Missing stills generate first with GPT Image 2.5
                Sunburst (hands + feet on body shots). Identity stays this character.
              </p>
              <ul className="mt-4 grid max-w-lg gap-2 text-[13px]">
                {["Headshot — blink / breath", "3/4 body — hands visible", "Full body — feet planted"].map((t) => (
                  <li key={t} className="rounded-xl border border-[#E5E7EB] bg-white px-3 py-2">
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          ) : tool === "clone-video" ? (
            <ReplicateCanvas
              url={replicateUrl}
              setUrl={setReplicateUrl}
              variation={replicateVariation}
              setVariation={setReplicateVariation}
              draftOnly={replicateDraft}
              setDraftOnly={setReplicateDraft}
              engineId={motionEngineId}
              setEngineId={setMotionEngineId}
              engines={motionEngines}
            />
          ) : tool === "image-to-video" ? (
            <I2VCanvas
              name={character.name}
              refImage={refImage}
              setRefImage={setRefImage}
              identity={character.identityUrl}
              stills={stills.map((s) => ({ url: s.url, label: s.label }))}
              inspiration={(sharedInspiration ?? character.inspiration ?? []).map((p) => ({
                url: p.url,
                kind: p.kind,
                label: p.label,
              }))}
              prompt={prompt}
              setPrompt={setPrompt}
            />
          ) : isEditWorkspace ? (
            <EditImageCanvas
              surface={isTryOn ? "try-on" : isFaceSwap ? "face-swap" : "edit"}
              name={character.name}
              identity={isTryOn ? productPerson || character.identityUrl : faceUrl || character.identityUrl}
              stills={stills}
              mode={editMode}
              setMode={setEditMode}
              base={editBase}
              setBase={setEditBase}
              extra={editExtra}
              setExtra={setEditExtra}
              extras={editExtras}
              setExtras={setEditExtras}
              products={editProducts}
              setProducts={setEditProducts}
              plates={productPlates}
              framing={productFraming}
              onFraming={pickProductFraming}
              stamp={character.updatedAt}
              pickBase={pickBase}
              setPickBase={setPickBase}
              prompt={editPrompt}
              setPrompt={setEditPrompt}
              tryOnEngines={editProductEngines}
              tryOnEngineId={characterImageId}
              onTryOnEngine={(id) => void pickImageEngine(id).catch((err) => console.error(err))}
              picked={picked}
              openCat={openCat}
              customDraft={customDraft}
              setCustomDraft={setCustomDraft}
              onToggleCat={(id) => setOpenCat((cur) => (cur === id ? null : id))}
              onPick={pickOption}
              onEditChip={editChip}
              onClear={clearCategory}
              categories={workspaceCats}
              library={library.filter((c) => c.id !== character.id && (c.poseUrl || c.thumbUrl || c.identityUrl))}
            />
          ) : (
            <SoonCanvas tool={tool} />
          )}

          <div className="sticky bottom-0 border-t border-[#E5E7EB] bg-white/95 backdrop-blur-sm">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 text-[12px]">
            {tool === "generate-image" ? (
              <>
                <span className="mr-auto text-[11px] font-semibold tracking-wide text-[#6B7280]">
                  {imageMode === "sheet"
                    ? "Complete set · Headshot · 3/4 · Full"
                    : imageMode === "pose-real"
                      ? "Clone · Muse"
                      : activeImage?.cloud
                        ? "Paid"
                        : "GPU"}
                </span>
                {imageMode === "pose-real" ? (
                  <span className="text-[12px] font-semibold text-[#111827]">Muse Image 1.0</span>
                ) : imageMode === "sheet" ? (
                  <span className="text-[12px] font-semibold text-[#111827]">GPT Image 2.5 Sunburst</span>
                ) : (
                <BarSelect
                  label="Model"
                  value={characterImageId}
                  onChange={(id) => void pickImageEngine(id).catch((err) => console.error(err))}
                  title={activeImage?.nativeSize ? `Native ${activeImage.nativeSize}` : undefined}
                >
                    <optgroup label="GPU">
                      {generateEngines
                        .filter((e) => !e.cloud)
                        .map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                            {!e.cloud && e.status !== "ready" ? " · soon" : ""}
                          </option>
                        ))}
                    </optgroup>
                    <optgroup label="Paid">
                      {generateEngines
                        .filter((e) => e.cloud)
                        .map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                            {e.status === "ready" ? " · Paid" : " · need key"}
                          </option>
                        ))}
                    </optgroup>
                </BarSelect>
                )}
                {imageMode === "chat" ? (
                <BarSelect label="Qty" value={String(qty)} onChange={(v) => setQty(Number(v))}>
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                </BarSelect>
                ) : null}
                <AspectField value={aspect} onChange={setAspect} />
              </>
            ) : isEditWorkspace ? (
              <>
                <span className="mr-auto font-semibold text-[#111827]">
                  {isTryOn
                    ? `Try-on · ${productFraming === "full" ? "full body" : productFraming === "three_quarter" ? "3/4" : "headshot"} + SKU`
                    : isFaceSwap
                      ? `Face swap · @${name}`
                      : editMode === "chat"
                        ? "Edit this still · pose & clothes stay"
                        : editMode === "retouch"
                          ? "Edit this still · clothes follow the note"
                          : creditLabel}
                </span>
                {isTryOn || isFaceSwap ? null : (
                  <BarSelect
                    label="Model"
                    value={characterImageId}
                    onChange={(id) => void pickImageEngine(id).catch((err) => console.error(err))}
                    title={activeImage?.nativeSize ? `Native ${activeImage.nativeSize}` : undefined}
                  >
                      <optgroup label="GPU">
                        {editStillEngines
                          .filter((e) => !e.cloud)
                          .map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.name}
                              {!e.cloud && e.status !== "ready" ? " · soon" : ""}
                            </option>
                          ))}
                      </optgroup>
                      <optgroup label="Paid">
                        {editStillEngines
                          .filter((e) => e.cloud)
                          .map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.name}
                              {e.status === "ready" ? " · Paid" : " · need key"}
                            </option>
                          ))}
                      </optgroup>
                  </BarSelect>
                )}
                {isTryOn ? (
                  <BarSelect
                    label="Model"
                    value={PRODUCT_TRYON_IDS.includes(characterImageId) ? characterImageId : "muse-image-1.0"}
                    onChange={(id) => void pickImageEngine(id).catch((err) => console.error(err))}
                    title={activeImage?.nativeSize ? `Native ${activeImage.nativeSize}` : undefined}
                  >
                    <optgroup label="GPU">
                      {editProductEngines
                        .filter((e) => !e.cloud)
                        .map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                            {e.status !== "ready" ? " · soon" : ""}
                          </option>
                        ))}
                    </optgroup>
                    <optgroup label="Paid">
                      {editProductEngines
                        .filter((e) => e.cloud)
                        .map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                            {e.status === "ready" ? " · Paid" : " · need key"}
                          </option>
                        ))}
                    </optgroup>
                  </BarSelect>
                ) : null}
                {editMode === "upscale" && isEditStill ? null : <AspectField value={aspect} onChange={setAspect} />}
                {isFaceSwap ? <span className="text-[#6B7280]">ReActor · @{name} face on this pose</span> : null}
              </>
            ) : tool === "image-to-video" ? (
              <>
                <span className="mr-auto font-semibold text-[#111827]">{quoteMotionBar(motionEngineId, durationSec)}</span>
                <label className="flex items-center gap-1">
                  Model
                  <select
                    value={motionEngineId}
                    onChange={(e) => setMotionEngineId(e.target.value)}
                    className="max-w-[14rem] rounded-md border border-[#E5E7EB] px-1 py-1"
                  >
                    {motionEngines.map((e) => (
                      <option key={e.id} value={e.id} disabled={e.status !== "ready"}>
                        {e.name}
                        {e.status !== "ready" ? " · need key" : e.cloud ? " · Paid" : " · GPU"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-1">
                  Duration
                  <select value={durationSec} onChange={(e) => setDurationSec(Number(e.target.value))} className="rounded-md border border-[#E5E7EB] px-1 py-1">
                    {[5, 8, 10, 15].map((n) => (
                      <option key={n} value={n}>
                        {n}s
                      </option>
                    ))}
                  </select>
                </label>
                <span>720P · 9:16</span>
              </>
            ) : tool === "complete-set" ? (
              <>
                <span className="mr-auto font-semibold text-[#111827]">
                  3× Wan 5s · ~$2.10
                  {character.slots.filter((s) => ["headshot", "three_quarter_body", "front"].includes(s.key) && s.url).length < 3
                    ? " + stills"
                    : ""}
                </span>
                <span>720P · 9:16</span>
              </>
            ) : tool === "clone-video" ? (
              <>
                <span className="mr-auto font-semibold text-[#111827]">
                  {replicateDraft ? "Stills only" : quoteMotionBar(motionEngineId, 6)} · max 3 scenes
                </span>
                <span>Paid I2V · 9:16</span>
              </>
            ) : tool === "affiliate" ? (
              <>
                <span className="mr-auto text-[11px] font-semibold tracking-wide text-[#6B7280]">I2V · still required</span>
                <BarSelect label="Model" value={motionEngineId} onChange={setMotionEngineId}>
                    {motionEngines
                      .filter((e) => ["wan-3-0", "wan-3-0-std", "seedance-2-5", "grok-imagine-video"].includes(e.id))
                      .map((e) => (
                      <option key={e.id} value={e.id} disabled={e.status !== "ready"}>
                        {e.name}
                        {e.status !== "ready" ? " · need key" : ""}
                      </option>
                    ))}
                </BarSelect>
                <label className="flex items-center gap-1">
                  Duration
                  <select value={durationSec} onChange={(e) => setDurationSec(Number(e.target.value))} className="rounded-md border border-[#E5E7EB] px-1 py-1">
                    {[5, 8, 10, 15].map((n) => (
                      <option key={n} value={n}>
                        {n}s
                      </option>
                    ))}
                  </select>
                </label>
                <span>720P · 9:16</span>
              </>
            ) : (
              <span className="mr-auto text-[#6B7280]">Soon</span>
            )}
            <button
              type="button"
              disabled={needImageKey || wanMissing ? false : disabled}
              title={
                tool === "generate-image" && imageMode !== "sheet" && !bodyLockUrl
                  ? "Need FACE + BODY lock. Open Complete set, then Generate."
                  : undefined
              }
              onClick={() => (needImageKey || wanMissing ? router.push("/system/settings") : generate())}
              className="h-8 shrink-0 rounded-full px-4 text-[13px] font-semibold disabled:opacity-40"
              style={
                gpuBusy
                  ? { background: "#F3F4F8", color: "#6B7280" }
                  : !needImageKey && !wanMissing && !disabled
                    ? { background: ROSE, color: "#fff" }
                    : { background: "#E5E7EB", color: "#111827" }
              }
            >
              {needImageKey
                ? "Add key in Settings"
                : wanMissing
                  ? "Add Wan key in Settings"
                  : gpuBusy
                    ? `GPU busy${elapsed ? ` · ${elapsed}` : ""}`
                    : tool === "generate-image" && imageMode !== "sheet" && !bodyLockUrl
                      ? "Need body lock"
                    : tool === "clone-video"
                      ? replicateDraft
                        ? "Draft stills"
                        : "Replicate"
                      : isTryOn
                        ? "Try on"
                        : isFaceSwap || isEditStill
                          ? "Apply edit"
                        : tool === "affiliate"
                          ? "Generate clip"
                        : "Generate"}
            </button>
            </div>
          {(poseHint || error || notice) ? (
            <p className="border-t border-[#F3F4F8] px-4 py-1.5 text-[11px] leading-snug text-[#6B7280]">
              {error ? <span className="font-semibold text-[#E11D48]">{error}</span> : null}
              {!error && poseHint ? <span className="font-semibold text-[#E11D48]">{poseHint}</span> : null}
              {!error && !poseHint && notice ? notice : null}
            </p>
          ) : null}
          </div>

          {tool === "generate-image" ||
          tool === "image-to-video" ||
          tool === "complete-set" ||
          tool === "affiliate" ||
          isEditWorkspace ||
          tool === "clone-video" ? (
            <CharacterGallery
              character={character}
              jobs={clips}
              engineNames={engineNames}
              busy={busy}
              gpuBusy={gpuBusy}
              onUpscale={onUpscale}
              onUpscaleVideo={onUpscaleVideo}
              onDeleteMedia={(url, item) => {
                const lock = item.slot === "identity" ? "FACE LOCK" : item.slot === "front" ? "BODY LOCK" : item.kind === "video" ? "video" : "still";
                if (!window.confirm(`Delete this ${lock}? File is removed from disk.`)) return;
                onDeleteMedia?.(url);
              }}
              onToggleInspiration={onToggleInspiration}
              focusKind={
                tool === "image-to-video" || tool === "complete-set" || tool === "affiliate" || tool === "clone-video"
                  ? "video"
                  : "image"
              }
              sharedInspiration={sharedInspiration}
              onUseAsReference={(item) => {
                if (item.kind !== "image") return;
                const url = item.url;
                if (tool === "image-to-video") {
                  setRefImage(url);
                  return;
                }
                if (isTryOn) return;
                if (isFaceSwap) {
                    if (url === character.identityUrl) {
                      setPoseHint("Pose can't be this identity plate. Pick another still.");
                      return;
                    }
                    setEditBase(url);
                    return;
                  }
                if (isEditStill) {
                  setEditBase(url);
                  return;
                }
                if (tool === "generate-image" && imageMode === "pose-real") {
                  if (cloneSlot === "look") {
                    setLookRef(url);
                    return;
                  }
                  if (url === character.identityUrl) {
                    setPoseHint("Pose can't be the identity plate. Pick another still.");
                    return;
                  }
                  setPoseRef(url);
                  setPoseHint("");
                  return;
                }
                if (tool !== "generate-image") setTool("generate-image");
              }}
              referenceLabel={
                tool === "image-to-video" ? "Add" : tool === "generate-image" && imageMode === "pose-real" ? (cloneSlot === "look" ? "Look" : "Pose") : "Use as ref"
              }
              referenceAlways={tool === "image-to-video" || (tool === "generate-image" && imageMode === "pose-real")}
            />
          ) : null}
        </div>
        <aside className="hidden w-[272px] shrink-0 flex-col border-l border-[#E5E7EB] bg-[#FAFBFF] xl:flex">
          <WorkspaceRail
            name={name}
            stamp={character.updatedAt}
            faceUrl={faceUrl}
            plates={productPlates}
            productFraming={productFraming}
            onFraming={pickProductFraming}
            isTryOn={isTryOn}
            isFaceSwap={isFaceSwap}
            isEditStill={isEditStill}
            imageMode={imageMode}
            editBase={editBase}
            setEditBase={setEditBase}
            editExtras={editExtras}
            editProducts={editProducts}
            lookRef={lookRef}
            picked={picked}
            lastStill={
              character.edits?.find((e) => e.url)?.url ||
              clips.find((c) => c.mediaUrl && !/\.(mp4|webm|mov)$/i.test(c.mediaUrl || ""))?.mediaUrl ||
              ""
            }
            videoHint={
              tool === "image-to-video" || tool === "complete-set" || tool === "affiliate" || tool === "clone-video"
            }
          />
        </aside>
      </div>
    </div>
  );
}

function RailThumb({
  url,
  stamp,
  label,
  on,
  onClick,
  empty,
}: {
  url?: string;
  stamp?: string;
  label: string;
  on?: boolean;
  onClick?: () => void;
  empty?: string;
}) {
  const inner = url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={thumbSrc(url, 160, stamp)} alt="" className="h-full w-full object-cover" />
  ) : (
    <span className="grid h-full place-items-center px-0.5 text-center text-[8px] leading-tight text-[#9CA3AF]">{empty || "—"}</span>
  );
  const cls = cn("overflow-hidden rounded-md border", on ? "border-[#E11D48]" : "border-[#E5E7EB]", !url && "bg-[#F9FAFB]");
  if (onClick) {
    return (
      <button type="button" title={label} onClick={onClick} disabled={!url} className={cn(cls, "w-full")}>
        <div className="aspect-[3/4]">{inner}</div>
      </button>
    );
  }
  return (
    <div className={cls} title={label}>
      <div className="aspect-[3/4]">{inner}</div>
    </div>
  );
}

function WorkspaceRail({
  name,
  stamp,
  faceUrl,
  plates,
  productFraming,
  onFraming,
  isTryOn,
  isFaceSwap,
  isEditStill,
  imageMode,
  editBase,
  setEditBase,
  editExtras,
  editProducts,
  lookRef,
  picked,
  lastStill,
  videoHint,
}: {
  name: string;
  stamp?: string;
  faceUrl: string;
  plates: Record<ProductFraming, string>;
  productFraming: ProductFraming;
  onFraming: (v: ProductFraming) => void;
  isTryOn: boolean;
  isFaceSwap: boolean;
  isEditStill: boolean;
  imageMode: string;
  editBase: string;
  setEditBase: (v: string) => void;
  editExtras: string[];
  editProducts: string[];
  lookRef: string;
  picked: Record<string, PresetOption>;
  lastStill: string;
  videoHint: boolean;
}) {
  const baseSrc = isEditStill || isFaceSwap ? editBase : isTryOn ? editBase || plates[productFraming] || plates.full : faceUrl;
  const baseLabel = isTryOn
    ? productFraming === "full"
      ? "Full body"
      : productFraming === "three_quarter"
        ? "3/4"
        : "Headshot"
    : isFaceSwap
      ? "Pose still"
      : isEditStill
        ? "Edit base"
        : `@${name}`;
  const locks: { id: ProductFraming; label: string; url: string }[] = [
    { id: "headshot", label: "FACE", url: plates.headshot },
    { id: "three_quarter", label: "3/4", url: plates.three_quarter },
    { id: "full", label: "FULL", url: plates.full },
  ];
  const stack = Object.values(picked)
    .map((p) => p.label)
    .filter(Boolean);
  const extras = editExtras.filter(Boolean);
  const takeThumbs = isTryOn
    ? editProducts
    : isEditStill
      ? extras
      : imageMode === "pose-real" && lookRef
        ? [lookRef]
        : [];
  const takeTitle = isTryOn
    ? `Try-on · ${baseLabel} · ${editProducts.length} SKU`
    : isFaceSwap
      ? editBase
        ? "Face swap · pose picked"
        : "Face swap · pick pose"
      : isEditStill
        ? extras.length
          ? `Edit · ${extras.length} extra`
          : "Edit · freestyle"
        : imageMode === "sheet"
          ? "Complete set"
          : imageMode === "pose-real"
            ? lookRef
              ? "Clone · look set"
              : "Clone · pick look"
            : stack.length
              ? `Generate · ${stack.slice(0, 4).join(" · ")}`
              : "Generate · no presets";

  return (
    <div className="flex-1 space-y-3 overflow-y-auto p-3">
      <div>
        <p className="text-[10px] font-semibold tracking-[0.16em] text-[#9CA3AF]">BASE</p>
        <div className="mt-1.5 overflow-hidden rounded-lg border border-[#E5E7EB] bg-white">
          {baseSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbSrc(baseSrc, 320, stamp)} alt="" className="mx-auto max-h-[168px] w-full object-cover object-top" />
          ) : (
            <div className="grid h-[120px] place-items-center px-3 text-center text-[11px] text-[#9CA3AF]">
              {isFaceSwap ? "Pick a pose still" : isEditStill ? "Pick a still to edit" : "No lock yet"}
            </div>
          )}
        </div>
        <p className="mt-1 truncate text-[11px] font-semibold text-[#111827]">{baseLabel}</p>
      </div>

      <div>
        <p className="text-[10px] font-semibold tracking-[0.16em] text-[#9CA3AF]">LOCK</p>
        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
          {locks.map((p) => (
            <div key={p.id} className="min-w-0">
              <RailThumb
                url={p.url}
                stamp={stamp}
                label={p.label}
                on={isTryOn ? productFraming === p.id : isEditStill && editBase === p.url}
                onClick={
                  p.url
                    ? () => {
                        if (isTryOn) onFraming(p.id);
                        else if (isEditStill) setEditBase(p.url);
                      }
                    : undefined
                }
                empty="—"
              />
              <p className="mt-0.5 text-center text-[9px] font-semibold text-[#6B7280]">{p.label}</p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[10px] font-semibold tracking-[0.16em] text-[#9CA3AF]">THIS TAKE</p>
        <p className="mt-1 text-[11px] leading-snug text-[#4B5563]">{takeTitle}</p>
        {takeThumbs.length ? (
          <div className="mt-1.5 grid grid-cols-4 gap-1">
            {takeThumbs.slice(0, 8).map((url) => (
              <RailThumb key={url} url={url} stamp={stamp} label="ref" />
            ))}
          </div>
        ) : null}
        {videoHint ? <p className="mt-1 text-[11px] text-[#9CA3AF]">Video is 9:16. Aspect lives on Generate / Edit.</p> : null}
      </div>

      <div>
        <p className="text-[10px] font-semibold tracking-[0.16em] text-[#9CA3AF]">LAST RESULT</p>
        {lastStill ? (
          <button
            type="button"
            onClick={() => {
              if (isEditStill) setEditBase(lastStill);
            }}
            className="mt-1.5 w-full overflow-hidden rounded-lg border border-[#E5E7EB] bg-white"
            title={isEditStill ? "Use as edit base" : "Latest still"}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={thumbSrc(lastStill, 320, stamp)} alt="" className="mx-auto max-h-[140px] w-full object-cover object-top" />
          </button>
        ) : (
          <p className="mt-1 text-[11px] text-[#9CA3AF]">Generate to fill</p>
        )}
      </div>
    </div>
  );
}

function relativeTime(iso?: string) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
  if (s < 86400) return `${Math.max(1, Math.round(s / 3600))}h ago`;
  const d = Math.round(s / 86400);
  return d === 1 ? "yesterday" : `${d}d ago`;
}

function SocialRow({ character }: { character: Character }) {
  const accounts = character.socialAccounts ?? [];
  const connected = accounts.filter((a) => a.status === "connected");
  const followers = connected.reduce((n, a) => n + (a.followers || 0), 0);
  const href = `/distribute/accounts?character=${character.id}`;
  return (
    <p className="mt-0.5 truncate text-[11px] text-[#6B7280]">
      <span className="font-semibold text-[#111827]">{followers.toLocaleString()}</span> followers
      {connected.length ? ` · ${connected.length} connected` : ""}
      {" · "}
      <Link href={href} className="font-semibold text-[#E11D48] hover:underline">
        {connected.length ? "Accounts" : "Connect accounts"}
      </Link>
    </p>
  );
}

function BarSelect({
  label,
  value,
  onChange,
  children,
  title,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <label className="flex items-center gap-1.5 text-[11px] font-medium text-[#6B7280]" title={title}>
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 rounded-lg border border-[#E5E7EB] bg-white px-2 text-[12px] font-semibold text-[#111827] outline-none focus:border-[#C4C9D4]"
      >
        {children}
      </select>
    </label>
  );
}

function AspectField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <BarSelect label="Aspect" value={value} onChange={onChange}>
      {IMAGE_ASPECTS.map((n) => (
        <option key={n}>{n}</option>
      ))}
    </BarSelect>
  );
}

function SideLink({
  active,
  label,
  soon,
  accent,
  onClick,
}: {
  active: boolean;
  label: string;
  soon: boolean;
  accent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "mb-0.5 flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-[13px]",
        active && accent && "bg-white font-semibold text-[#EA580C] ring-1 ring-[#FED7AA]",
        active && !accent && "bg-white font-semibold text-[#2563EB] ring-1 ring-[#BFDBFE]",
        !active && "text-[#374151] hover:bg-white/70",
      )}
    >
      {label}
      {soon ? <span className="text-[10px] font-semibold text-[#9CA3AF]">Soon</span> : null}
    </button>
  );
}

function PoseRefDrop({
  value,
  onChange,
  title = "POSE / SCENE",
  hint,
  library,
  active,
  onFocusSlot,
}: {
  value: string;
  onChange: (v: string) => void;
  title?: string;
  hint?: string;
  library?: { url: string; label: string }[];
  active?: boolean;
  onFocusSlot?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function send(file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", "character");
      const res = await fetch("/api/media/upload", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "upload failed");
      onChange(json.mediaUrl);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          onFocusSlot?.();
          inputRef.current?.click();
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) void send(f);
        }}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl border border-dashed bg-[#F9FAFB] px-3 py-2 text-left",
          active ? "border-[#E11D48]" : "border-[#E5E7EB]",
        )}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbSrc(value, 160)} alt="" className="h-14 w-14 rounded-lg object-cover" />
        ) : (
          <span className="grid h-14 w-14 place-items-center rounded-lg bg-white text-[11px] text-[#9CA3AF]">+</span>
        )}
        <span className="min-w-0">
          <span className="block text-[12px] font-semibold">{title}</span>
          <span className="block text-[11px] text-[#6B7280]">
            {hint ||
              (value
                ? "Keep this pose, camera, and café. Click to replace."
                : "Drop the photo you used to call Image 2. Optional if the scene is text-only.")}
          </span>
        </span>
        {value ? (
          <span
            className="ml-auto text-[11px] font-semibold text-[#9CA3AF]"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
          >
            ×
          </span>
        ) : null}
      </button>
      {library?.length ? (
        <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
          {library.slice(0, 24).map((s, i) => (
            <button
              key={`${s.url}#${i}`}
              type="button"
              title={s.label}
              onClick={() => {
                onFocusSlot?.();
                onChange(s.url);
              }}
              className={cn(
                "h-12 w-9 shrink-0 overflow-hidden rounded-md border",
                value === s.url ? "border-[#E11D48]" : "border-[#E5E7EB]",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumbSrc(s.url, 120)} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void send(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function PresetOptionRow({
  catId,
  catNegative,
  opt,
  on,
  onPick,
}: {
  catId: string;
  catNegative?: string;
  opt: PresetOption;
  on: boolean;
  onPick: () => void;
}) {
  const [hover, setHover] = useState(false);
  const [broken, setBroken] = useState(false);
  const preview = opt.preview || presetPreview(catId, opt.id);
  const showThumb = Boolean(preview) && !broken;
  const negative = [catNegative, opt.negative].filter(Boolean).join(", ");
  return (
    <div className="relative" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <button
        type="button"
        onClick={onPick}
        className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left", on ? "bg-[#111827] text-white" : "hover:bg-[#F3F4F8]")}
      >
        {showThumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="h-12 w-9 shrink-0 rounded object-cover" onError={() => setBroken(true)} />
        ) : (
          <span className={cn("grid h-12 w-9 shrink-0 place-items-center rounded text-[10px] font-semibold", on ? "bg-white/15" : "bg-[#F3F4F8] text-[#9CA3AF]")}>
            {opt.label.slice(0, 1)}
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate text-[12px] font-semibold">
            {opt.label}
            {opt.learned ? <span className="ml-1 text-[9px] font-normal opacity-70">custom</span> : null}
          </span>
          <span className={cn("block truncate text-[11px] leading-snug", on ? "text-white/70" : "text-[#6B7280]")}>
            {presetBlurb(opt.prompt)}
          </span>
        </span>
      </button>
      {hover ? (
        <div className="absolute left-full top-0 z-30 ml-2 w-56 overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-lg">
          {showThumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="" className="aspect-[3/4] w-full object-cover" />
          ) : (
            <div className="aspect-[3/4] w-full bg-[#F3F4F8] p-3 text-[11px] text-[#6B7280]">No still yet — prompt preview</div>
          )}
          <div className="space-y-1 p-2 text-[11px] leading-snug">
            <p className="font-semibold text-[#111827]">{opt.label}</p>
            <p className="text-[#4B5563]">{presetBlurb(opt.prompt, 160)}</p>
            {negative ? (
              <p className="text-[#9CA3AF]">
                <span className="font-semibold">Neg · </span>
                {presetBlurb(negative, 96)}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function descriptionWithShot(prev: string, text: string, previous: string[]) {
  let cur = prev.trim();
  const next = text.trim();
  for (const block of previous) {
    if (!block || block === next) continue;
    if (cur === block) return next;
    if (cur.startsWith(block)) {
      const rest = cur.slice(block.length).trim();
      return rest ? `${next}\n\n${rest}` : next;
    }
  }
  if (!cur || cur === next) return next;
  if (cur.startsWith(next)) return prev;
  return `${next}\n\n${cur}`;
}

function ShotPicker({
  shots,
  shotId,
  onShot,
  onAdd,
  hair,
  stills,
}: {
  shots: ShotPreset[];
  shotId: string;
  onShot: (id: string) => void;
  onAdd: (text: string) => void;
  hair: string;
  stills: { url: string; prompt?: string; shotId?: string }[];
}) {
  const [shown, setShown] = useState(true);
  const [popId, setPopId] = useState("");
  const shot = shots.find((s) => s.id === popId);
  const selected = shots.find((s) => s.id === shotId);
  const plate = shot?.plate === "headshot" ? "Headshot" : shot?.plate === "three_quarter" ? "3/4" : "Full body";
  const photos = shot
    ? stills.filter((s) => s.url && !/\.mp4($|\?)/i.test(s.url) && editUsesShot(shot, s))
    : [];
  const blocks = shot
    ? [
        ["1. Subject", `${plate}. Hair length stays${hair ? ` (${hair})` : ""}. Styling can tie, loosen, or sweep.`],
        ["2. Pose and expression", shot.pose],
        ["3. Outfit and accessories", shot.outfit],
        ["4. Hairstyle and makeup", `${shot.hair} ${shot.makeup}`],
        ["5. Lighting", shot.light],
        ["6. Texture and color", shot.texture],
        ["7. Camera", shot.camera],
        ["8. Background", shot.background],
      ]
    : [];
  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[12px] font-semibold">
          Shots
          {!shown && selected ? <span className="font-normal text-[#6B7280]"> · {selected.label}</span> : null}
        </p>
        <button type="button" className="shrink-0 text-[11px] font-semibold text-[#6B7280]" onClick={() => setShown((v) => !v)}>
          {shown ? "Hide" : "Show"}
        </button>
      </div>
      {shown ? (
        <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
          {shots.map((s) => {
            const on = s.id === shotId;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  onShot(s.id);
                  setPopId(s.id);
                }}
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  on ? "bg-[#111827] text-white" : "bg-[#F3F4F8] text-[#374151]",
                )}
              >
                {s.label}
                {s.nsfw ? " · 18+" : ""}
              </button>
            );
          })}
        </div>
      ) : null}
      {shot ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={() => setPopId("")}>
          <div
            role="dialog"
            aria-label={shot.label}
            className="max-h-[min(80vh,640px)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-3 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[13px] font-semibold text-[#111827]">
                  {shot.label}
                  {shot.nsfw ? " · 18+" : ""}
                </p>
                <p className="mt-0.5 text-[11px] text-[#9CA3AF]">Foto yang pernah digenerate dari shot ini.</p>
              </div>
              <button type="button" className="text-[16px] leading-none text-[#6B7280]" onClick={() => setPopId("")} aria-label="Close">
                ×
              </button>
            </div>
            {photos.length ? (
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {photos.map((photo) => (
                  <a key={photo.url} href={photo.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg bg-[#F3F4F8]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={thumbSrc(photo.url, 240)} alt="" className="aspect-[3/4] w-full object-cover" />
                  </a>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[12px] text-[#9CA3AF]">Belum ada foto dari shot ini.</p>
            )}
            <details className="mt-3">
              <summary className="cursor-pointer text-[11px] font-semibold text-[#6B7280]">8 blok</summary>
              <div className="mt-2 space-y-1.5 text-[11px] leading-snug text-[#4B5563]">
                {blocks.map(([title, body]) => (
                  <p key={title}>
                    <span className="font-semibold text-[#111827]">{title}. </span>
                    {body}
                  </p>
                ))}
                <p>
                  <span className="font-semibold text-[#111827]">Visible. </span>
                  {shot.must.join("; ")}.
                </p>
              </div>
            </details>
            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                type="button"
                className="text-[11px] font-semibold text-[#6B7280]"
                onClick={() => {
                  onShot("");
                  setPopId("");
                }}
              >
                Lepas
              </button>
              <button
                type="button"
                className="rounded-full bg-[#111827] px-3 py-1 text-[11px] font-semibold text-white"
                onClick={() => {
                  onShot(shot.id);
                  onAdd(compileShotPrompt(shot, hair));
                  setPopId("");
                }}
              >
                Add to description
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PresetPicker({
  categories,
  picked,
  openCat,
  customDraft,
  setCustomDraft,
  onToggleCat,
  onPick,
  onEditChip,
}: {
  categories: PresetCategory[];
  picked: Record<string, PickedChip>;
  openCat: string | null;
  customDraft: string;
  setCustomDraft: (v: string) => void;
  onToggleCat: (id: string) => void;
  onPick: (categoryId: string, optionId: string, customText?: string) => void;
  onEditChip: (categoryId: string, prompt: string) => void;
}) {
  return (
    <div className="rounded-xl border border-[#FECACA] bg-[#FFF7ED]/30 p-3">
      <p className="text-[12px] font-semibold">Presets</p>
      <p className="mt-0.5 text-[11px] leading-snug text-[#9CA3AF]">
        Delapan blok. Satu pilihan per blok, isinya cuma arti blok itu. Adult 18+ tetap di bawah.
      </p>
      <div className="mt-2 space-y-2">
        {categories.map((cat) => {
          const chip = picked[cat.id];
          const open = openCat === cat.id;
          return (
            <div key={cat.id} className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white">
              <button
                type="button"
                onClick={() => onToggleCat(cat.id)}
                className={cn("flex w-full items-center justify-between px-3 py-2 text-left text-[13px] font-semibold", cat.wash)}
              >
                <span>
                  {cat.label}
                  {cat.nsfw ? <span className="ml-1 text-[10px] font-normal opacity-80">18+</span> : null}
                  {chip ? <span className="ml-1 font-normal opacity-80">· {chip.label}</span> : null}
                </span>
                <span className="text-[10px] opacity-60">{open ? "▴" : "▾"}</span>
              </button>
              {open ? (
                <div className="space-y-1 p-2">
                  {cat.options.map((opt) => {
                    const on = chip?.id === opt.id;
                    return (
                      <PresetOptionRow
                        key={opt.id}
                        catId={cat.id}
                        catNegative={cat.negative}
                        opt={opt}
                        on={on}
                        onPick={() => onPick(cat.id, opt.id)}
                      />
                    );
                  })}
                  {chip ? (
                    <label className="block pt-1 text-[11px] font-semibold text-[#6B7280]">
                      Edit prompt
                      <textarea
                        value={chip.prompt}
                        onChange={(e) => onEditChip(cat.id, e.target.value)}
                        rows={3}
                        className="mt-1 w-full resize-none rounded-lg border border-[#E5E7EB] px-2 py-1.5 text-[12px] font-normal text-[#111827] outline-none focus:border-[#E11D48]"
                      />
                    </label>
                  ) : null}
                  <form
                    className="flex gap-1 pt-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const t = customDraft.trim();
                      if (!t) return;
                      onPick(cat.id, "custom", t);
                    }}
                  >
                    <input
                      value={openCat === cat.id ? customDraft : ""}
                      onChange={(e) => setCustomDraft(e.target.value)}
                      placeholder="Custom fragment…"
                      className="min-w-0 flex-1 rounded-md border border-[#E5E7EB] px-2 py-1 text-[12px]"
                    />
                    <button type="submit" className="text-[11px] font-semibold text-[#E11D48]">
                      Add
                    </button>
                  </form>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PresetChips({
  categories,
  picked,
  onToggleCat,
  onClear,
}: {
  categories: PresetCategory[];
  picked: Record<string, PickedChip>;
  onToggleCat: (id: string) => void;
  onClear: (id: string) => void;
}) {
  return (
    <>
      {categories.map((cat) => {
        const chip = picked[cat.id];
        if (!chip) return null;
        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => onToggleCat(cat.id)}
            className="rounded-full bg-[#111827] px-2 py-0.5 text-[11px] text-white"
          >
            {chip.label}
            <span
              className="ml-1 opacity-70"
              onClick={(e) => {
                e.stopPropagation();
                onClear(cat.id);
              }}
            >
              ×
            </span>
          </button>
        );
      })}
    </>
  );
}

function GenerateImageCanvas({
  characterId,
  name,
  avatar,
  prompt,
  setPrompt,
  picked,
  openCat,
  customDraft,
  setCustomDraft,
  onToggleCat,
  onPick,
  onEditChip,
  onClear,
  categories,
  shots,
  shotId,
  onShot,
  hair,
  shotStills,
  banner,
  setBanner,
  imageMode,
  setImageMode,
  poseRef,
  setPoseRef,
  lookRef,
  setLookRef,
  poseHint,
  skipRevamp,
  onGenerate,
  onEnterClone,
  libraryStills,
  identityUrl,
  cloneSlot,
  setCloneSlot,
  clonePose,
  setClonePose,
  cloneNote,
  setCloneNote,
  bodyLockUrl,
  stamp,
}: {
  characterId: string;
  name: string;
  avatar: string | null;
  stamp?: string;
  prompt: string;
  setPrompt: (v: string) => void;
  picked: Record<string, PickedChip>;
  openCat: string | null;
  customDraft: string;
  setCustomDraft: (v: string) => void;
  onToggleCat: (id: string) => void;
  onPick: (categoryId: string, optionId: string, customText?: string) => void;
  onEditChip: (categoryId: string, prompt: string) => void;
  onClear: (categoryId: string) => void;
  categories: PresetCategory[];
  shots: ShotPreset[];
  shotId: string;
  onShot: (id: string) => void;
  hair: string;
  shotStills: { url: string; prompt?: string; shotId?: string }[];
  banner: boolean;
  setBanner: (v: boolean) => void;
  imageMode: "chat" | "sheet" | "pose-real";
  setImageMode: (v: "chat" | "sheet" | "pose-real") => void;
  poseRef: string;
  setPoseRef: (v: string) => void;
  lookRef: string;
  setLookRef: (v: string) => void;
  poseHint: string;
  skipRevamp?: boolean;
  onGenerate?: () => void;
  onEnterClone?: () => void;
  libraryStills?: { url: string; label: string }[];
  identityUrl?: string | null;
  cloneSlot?: "pose" | "look";
  setCloneSlot?: (v: "pose" | "look") => void;
  clonePose?: "character" | "look";
  setClonePose?: (v: "character" | "look") => void;
  cloneNote?: string;
  setCloneNote?: (v: string) => void;
  bodyLockUrl?: string;
}) {
  const router = useRouter();
  const stack = categories.map((c) => picked[c.id]?.prompt).filter(Boolean);
  const armedShot = shots.find((s) => s.id === shotId);
  const [library, setLibrary] = useState<{ id: string; name: string; identityUrl: string | null; thumbUrl?: string | null }[]>([]);
  const [pickFace, setPickFace] = useState(false);
  const [revampBusy, setRevampBusy] = useState(false);
  const [revampNote, setRevampNote] = useState("");
  useEffect(() => {
    fetch("/api/characters?lite=1")
      .then((r) => r.json())
      .then((j) =>
        setLibrary(
          (
            (j.characters || []) as {
              id: string;
              name: string;
              identityUrl: string | null;
              thumbUrl?: string | null;
              poseUrl?: string | null;
            }[]
          ).filter((c) => c.thumbUrl || c.identityUrl || c.poseUrl),
        ),
      )
      .catch(() => undefined);
  }, []);
  return (
    <div className="p-4">
      <div className="flex justify-center gap-2">
        <button
          type="button"
          onClick={() => setImageMode("chat")}
          className={cn(
            "rounded-full px-3 py-1 text-[12px] font-semibold",
            imageMode === "chat" ? "border border-[#E11D48] text-[#E11D48]" : "bg-[#F3F4F8] text-[#9CA3AF]",
          )}
        >
          Chat to generate
        </button>
        <button
          type="button"
          onClick={() => setImageMode("sheet")}
          className={cn(
            "rounded-full px-3 py-1 text-[12px] font-semibold",
            imageMode === "sheet" ? "border border-[#E11D48] text-[#E11D48]" : "bg-[#F3F4F8] text-[#9CA3AF]",
          )}
        >
          Complete set
        </button>
        <button
          type="button"
          onClick={() => {
            setImageMode("pose-real");
            onEnterClone?.();
          }}
          className={cn(
            "rounded-full px-3 py-1 text-[12px] font-semibold",
            imageMode === "pose-real" ? "border border-[#E11D48] text-[#E11D48]" : "bg-[#F3F4F8] text-[#9CA3AF]",
          )}
        >
          Clone Image
        </button>
      </div>
      {imageMode === "sheet" ? (
        <div className="mx-auto mt-6 max-w-lg rounded-xl border border-[#FECACA] p-5 text-center">
          <p className="text-[14px] font-semibold">Complete set</p>
          <p className="mt-2 text-[13px] leading-relaxed text-[#6B7280]">
            Three locked stills of @{name}: <strong>Headshot</strong>, <strong>3/4 body</strong>, <strong>Full body</strong>.
            Hands and feet stay anatomically correct on the body shots. GPT Image 2.5 Sunburst. Then compose 1×3.
            Existing views are skipped.
          </p>
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbSrc(avatar, 320, stamp)} alt="" className="mx-auto mt-4 aspect-[3/4] w-40 rounded-lg object-cover" />
          ) : null}
          <p className="mt-3 text-[12px] text-[#9CA3AF]">Hit Generate. Locked to GPT Image 2.5 Sunburst.</p>
        </div>
      ) : null}
      {imageMode === "pose-real" ? (
        <div className="mx-auto mt-6 max-w-lg">
          <p className="text-[14px] font-semibold">Clone Image</p>
          <p className="mt-1 text-[13px] leading-relaxed text-[#6B7280]">
            Muse. Look = outfit. Prompt = pose + background. Kosong = studio + pose chip.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setClonePose?.("character")}
              className={`rounded-full px-3 py-1 text-[12px] font-semibold ${clonePose === "character" ? "border border-[#E11D48] text-[#E11D48]" : "bg-[#F3F4F8] text-[#6B7280]"}`}
            >
              Pose: our character
            </button>
            <button
              type="button"
              onClick={() => setClonePose?.("look")}
              className={`rounded-full px-3 py-1 text-[12px] font-semibold ${clonePose === "look" ? "border border-[#E11D48] text-[#E11D48]" : "bg-[#F3F4F8] text-[#6B7280]"}`}
            >
              Pose: look photo
            </button>
          </div>
          <div className="mt-3 flex gap-2">
            {identityUrl ? (
              <div className="overflow-hidden rounded-lg border border-[#E5E7EB]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={thumbSrc(identityUrl, 120)} alt="" className="h-16 w-12 object-cover" />
                <p className="px-1 py-0.5 text-center text-[9px] font-semibold text-[#6B7280]">FACE</p>
              </div>
            ) : null}
            {bodyLockUrl ? (
              <div className="overflow-hidden rounded-lg border border-[#E5E7EB]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={thumbSrc(bodyLockUrl, 120)} alt="" className="h-16 w-12 object-cover" />
                <p className="px-1 py-0.5 text-center text-[9px] font-semibold text-[#6B7280]">BODY</p>
              </div>
            ) : (
              <p className="self-center text-[12px] text-[#E11D48]">No full body — Complete set first.</p>
            )}
          </div>
          <div className="mt-4">
            <PoseRefDrop
              value={lookRef}
              onChange={(u) => {
                setLookRef(u);
                setCloneSlot?.("look");
              }}
              title="LOOK / ILLUSTRATION"
              hint={lookRef ? "This outfit/style goes on @{name}." : "Library or drop illustration. Required."}
              active
              onFocusSlot={() => setCloneSlot?.("look")}
              library={libraryStills}
            />
          </div>
          <textarea
            value={cloneNote || ""}
            onChange={(e) => setCloneNote?.(e.target.value)}
            rows={3}
            placeholder="Pose + latar. Contoh: leaning on a café counter, night street, sitting on office chair, hands on hips…"
            className="mt-4 w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-[13px] outline-none"
          />
          {poseHint ? <p className="mt-2 text-[12px] font-semibold text-[#E11D48]">{poseHint}</p> : null}
        </div>
      ) : null}
      {imageMode === "chat" ? (
      <>
      {!bodyLockUrl ? (
        <div className="mt-3 rounded-xl bg-[#FFF1F2] px-3 py-2 text-[12px] font-semibold text-[#9F1239]">
          @{name} has FACE (identity) but no BODY lock. Open Complete set and hit Generate — then Chat to generate unlocks.
        </div>
      ) : banner ? (
        <div className="mt-3 flex items-start justify-between rounded-xl bg-[#FFF1F2] px-3 py-2 text-[12px] text-[#9F1239]">
          <span>
            Face + body locked. Presets + text set pose, clothes, place. Recast a photo is Clone Image — not a lock.
          </span>
          <button type="button" onClick={() => setBanner(false)}>
            ×
          </button>
        </div>
      ) : null}
      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(280px,34%)_minmax(0,1fr)]">
        <div className="space-y-3">
          <ShotPicker
            shots={shots}
            shotId={shotId}
            onShot={onShot}
            hair={hair}
            stills={shotStills}
            onAdd={(text) => {
              const previous = shots.map((s) => compileShotPrompt(s, hair).trim());
              setPrompt((prev) => descriptionWithShot(prev, text, previous));
            }}
          />
          <PresetPicker
            categories={categories}
            picked={picked}
            openCat={openCat}
            customDraft={customDraft}
            setCustomDraft={setCustomDraft}
            onToggleCat={onToggleCat}
            onPick={onPick}
            onEditChip={onEditChip}
          />
        </div>
        <div className="rounded-xl border border-[#FECACA] p-3">
          <p className="text-[12px] font-semibold">Description</p>
          <div className="relative mt-2 flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => setPickFace((v) => !v)}
              className="inline-flex items-center gap-1 rounded-full border border-[#E5E7EB] bg-[#F9FAFB] px-2 py-0.5 text-[12px] font-semibold"
              title="Face lock. Type @ to switch character."
            >
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumbSrc(avatar, 64)} alt="" className="h-4 w-4 rounded-full object-cover" />
              ) : null}
              FACE · @{name}
            </button>
            {pickFace ? (
              <div className="absolute left-0 top-8 z-20 max-h-56 w-64 overflow-auto rounded-xl border border-[#E5E7EB] bg-white p-1 shadow-lg">
                {library.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setPickFace(false);
                      if (c.id !== characterId) router.push(`/create/characters/${c.id}/workspace?tool=generate-image`);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px]",
                      c.id === characterId ? "bg-[#111827] text-white" : "hover:bg-[#F3F4F8]",
                    )}
                  >
                    {c.thumbUrl || c.identityUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumbSrc(c.thumbUrl || c.identityUrl || "", 64)} alt="" className="h-6 w-6 rounded-full object-cover" />
                    ) : null}
                    @{c.name}
                  </button>
                ))}
              </div>
            ) : null}
            <PresetChips categories={categories} picked={picked} onToggleCat={onToggleCat} onClear={onClear} />
          </div>
          {stack.length ? (
            <p className="mt-2 rounded-lg bg-[#F9FAFB] px-2 py-1.5 text-[11px] leading-relaxed text-[#4B5563]">
              <span className="font-semibold text-[#111827]">Stack · </span>
              {stack.join(" · ")}
            </p>
          ) : null}
          {poseHint && imageMode === "chat" ? <p className="mt-2 text-[12px] font-semibold text-[#E11D48]">{poseHint}</p> : null}
          {imageMode === "chat" && shotId ? (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-lg bg-[#111827] px-2 py-1.5 text-[12px] text-white">
              <p className="min-w-0 truncate font-semibold">
                Shot kepilih · {armedShot?.label || shotId}
                {armedShot?.nsfw ? " · 18+" : ""}
              </p>
              <button type="button" className="shrink-0 font-semibold" onClick={() => onShot("")}>
                Lepas
              </button>
            </div>
          ) : null}
          <textarea
            value={prompt}
            onChange={(e) => {
              const v = e.target.value;
              setPrompt(v);
              if (v.endsWith("@")) setPickFace(true);
            }}
            rows={8}
            placeholder={
              shotId
                ? "Catatan tambahan. Kerangka Shot tetap dipakai."
                : `Pose, clothes, café, camera. Face + body are @${name}.`
            }
            className="mt-2 w-full resize-none text-[14px] outline-none"
          />
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-[#6B7280]">
              {imageMode === "chat"
                ? shotId
                  ? "Shot mengunci 8 blok. Chip diabaikan. Adult 18+ tetap di daftar Presets."
                  : "Chip mengisi bloknya. Delapan judul dikirim apa adanya. Adult 18+ tetap di Presets."
                : skipRevamp
                  ? "Paid model — prompt as written."
                  : "Long JSON is trimmed on Generate."}
            </p>
            {imageMode === "chat" || skipRevamp ? null : (
            <button
              type="button"
              disabled={revampBusy || !prompt.trim()}
              onClick={() => {
                setRevampBusy(true);
                setRevampNote("");
                void fetch(`/api/characters/${characterId}?op=revamp-prompt`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ prompt }),
                })
                  .then(async (res) => {
                    const json = await res.json();
                    if (!res.ok) throw new Error(json.error || "revamp failed");
                    if (json.prompt) setPrompt(json.prompt);
                    setRevampNote(
                      json.revamped
                        ? (json.warnings || []).join(" ") || "Revamped."
                        : "Already short — left as-is.",
                    );
                  })
                  .catch((err) => setRevampNote(err instanceof Error ? err.message : String(err)))
                  .finally(() => setRevampBusy(false));
              }}
              className="text-[11px] font-semibold text-[#E11D48] disabled:text-[#D1D5DB]"
            >
              {revampBusy ? "Revamping…" : "Revamp prompt"}
            </button>
            )}
          </div>
          {imageMode === "chat" ? null : revampNote ? <p className="mt-1 text-[11px] text-[#9A3412]">{revampNote}</p> : null}
        </div>
      </div>
      </>
      ) : null}
    </div>
  );
}

function EditImageCanvas({
  surface = "edit",
  name,
  identity,
  stills,
  mode,
  setMode,
  base,
  setBase,
  extra,
  setExtra,
  extras,
  setExtras,
  products,
  setProducts,
  plates,
  framing,
  onFraming,
  stamp,
  pickBase,
  setPickBase,
  prompt,
  setPrompt,
  tryOnEngines,
  tryOnEngineId,
  onTryOnEngine,
  picked,
  openCat,
  customDraft,
  setCustomDraft,
  onToggleCat,
  onPick,
  onEditChip,
  onClear,
  categories,
  library,
}: {
  surface?: "edit" | "try-on" | "face-swap";
  name: string;
  identity: string | null;
  stills: { slot: string; url: string; label: string }[];
  mode: string;
  setMode: (v: string) => void;
  base: string;
  setBase: (v: string) => void;
  extra: string;
  setExtra: (v: string) => void;
  extras?: string[];
  setExtras?: (v: string[]) => void;
  products: string[];
  setProducts: (v: string[]) => void;
  plates: Record<ProductFraming, string>;
  framing: ProductFraming;
  onFraming: (v: ProductFraming) => void;
  stamp?: string;
  pickBase: boolean;
  setPickBase: (v: boolean) => void;
  prompt: string;
  setPrompt: (v: string) => void;
  tryOnEngines: { id: string; name: string; status: string; cloud?: boolean }[];
  tryOnEngineId: string;
  onTryOnEngine: (id: string) => void;
  picked: Record<string, PickedChip>;
  openCat: string | null;
  customDraft: string;
  setCustomDraft: (v: string) => void;
  onToggleCat: (id: string) => void;
  onPick: (categoryId: string, optionId: string, customText?: string) => void;
  onEditChip: (categoryId: string, prompt: string) => void;
  onClear: (id: string) => void;
  categories: PresetCategory[];
  library: { id: string; name: string; identityUrl: string | null; thumbUrl?: string | null; poseUrl?: string | null }[];
}) {
  const modes =
    surface === "try-on" || surface === "face-swap"
      ? []
      : [
          { id: "chat", label: "Backdrop" },
          { id: "retouch", label: "Edit image" },
          { id: "upscale", label: "Upscale" },
          { id: "bg", label: "Remove background" },
        ];
  const pane = surface === "try-on" ? "product" : surface === "face-swap" ? "face-swap" : mode;
  return (
    <div className="p-4">
      {modes.length ? (
      <div className="flex flex-wrap justify-center gap-2">
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setMode(m.id)}
            className={cn(
              "rounded-full px-3 py-1 text-[12px] font-semibold",
              mode === m.id ? "border border-[#E11D48] text-[#E11D48]" : "bg-[#F3F4F8] text-[#6B7280]",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      ) : null}
      {pane === "product" ? (
        <ProductPane
          plates={plates}
          framing={framing}
          onFraming={onFraming}
          stamp={stamp}
          products={products}
          setProducts={setProducts}
          prompt={prompt}
          setPrompt={setPrompt}
          tryOnEngines={tryOnEngines}
          tryOnEngineId={tryOnEngineId}
          onTryOnEngine={onTryOnEngine}
        />
      ) : pane === "face-swap" ? (
        <FaceSwapPane
          name={name}
          identity={identity}
          stills={stills}
          base={base}
          setBase={setBase}
          extra={extra}
          setExtra={setExtra}
          pickBase={pickBase}
          setPickBase={setPickBase}
          library={library}
        />
      ) : (
        <EditChatPane
          name={name}
          stills={stills}
          base={base}
          setBase={setBase}
          setPickBase={setPickBase}
          extra={extra}
          setExtra={setExtra}
          extras={extras}
          setExtras={setExtras}
          prompt={prompt}
          setPrompt={setPrompt}
          mode={mode}
          picked={picked}
          openCat={openCat}
          customDraft={customDraft}
          setCustomDraft={setCustomDraft}
          onToggleCat={onToggleCat}
          onPick={onPick}
          onEditChip={onEditChip}
          categories={categories}
        />
      )}
    </div>
  );
}

function EditChatPane({
  name,
  stills,
  base,
  setBase,
  setPickBase,
  extra,
  setExtra,
  extras,
  setExtras,
  prompt,
  setPrompt,
  mode,
  picked,
  openCat,
  customDraft,
  setCustomDraft,
  onToggleCat,
  onPick,
  onEditChip,
  categories,
}: {
  name: string;
  stills: { slot: string; url: string; label: string }[];
  base: string;
  setBase: (v: string) => void;
  setPickBase: (v: boolean) => void;
  extra: string;
  setExtra: (v: string) => void;
  extras?: string[];
  setExtras?: (v: string[]) => void;
  prompt: string;
  setPrompt: (v: string) => void;
  mode: string;
  picked: Record<string, PickedChip>;
  openCat: string | null;
  customDraft: string;
  setCustomDraft: (v: string) => void;
  onToggleCat: (id: string) => void;
  onPick: (categoryId: string, optionId: string, customText?: string) => void;
  onEditChip: (categoryId: string, prompt: string) => void;
  categories: PresetCategory[];
}) {
  return (
    <>
      <div className="mt-3 rounded-xl bg-[#FFF1F2] px-3 py-2 text-[12px] text-[#9F1239]">
        {mode === "retouch"
          ? "Pick the still. The note changes the clothes. Face, pose, and place stay."
          : mode === "chat"
            ? "Backdrop only. Pose and clothes stay. Type the new place."
            : "Pick the still to edit."}
      </div>
      <div className="mt-3 grid gap-3 lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="rounded-xl border border-[#FECACA] p-3">
          <p className="text-[12px] font-semibold">Base image</p>
          {base ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={base} alt="" className="mt-2 aspect-[3/4] w-full rounded-lg object-cover" />
          ) : null}
          <p className="mt-2 text-[11px] font-semibold text-[#6B7280]">Library · @{name}</p>
          <label className="mt-2 flex w-full cursor-pointer justify-center rounded-lg bg-[#E11D48] py-3 text-[12px] font-semibold text-white">
            Upload image
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const form = new FormData();
                form.append("file", f);
                form.append("kind", "character");
                const res = await fetch("/api/media/upload", { method: "POST", body: form });
                const json = await res.json();
                if (res.ok) setBase(json.mediaUrl);
              }}
            />
          </label>
          {stills.length ? (
            <div className="mt-2 grid max-h-72 grid-cols-3 gap-1 overflow-auto">
              {stills.map((s) => (
                <button
                  key={s.slot}
                  type="button"
                  onClick={() => {
                    setBase(s.url);
                    setPickBase(false);
                  }}
                  className={cn("overflow-hidden rounded-md border", base === s.url ? "border-[#E11D48]" : "border-[#E5E7EB]")}
                  title={s.label}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumbSrc(s.url, 240)} alt="" className="aspect-square w-full object-cover" loading="lazy" decoding="async" />
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-[#9CA3AF]">No stills yet. Generate first, or upload.</p>
          )}
        </div>
        <div className="flex flex-col rounded-xl border border-[#FECACA] p-3">
          <p className="text-[12px] font-semibold">Edit description</p>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={10}
            maxLength={20000}
            placeholder={
              mode === "upscale"
                ? "Optional. Generate will 4K-upscale the base still and replace the low-res file."
                : mode === "retouch"
                  ? "telanjang, or a yellow bikini. The old outfit goes."
                  : mode === "bg"
                    ? "Optional. Remove the background."
                    : "The new place. Pose and clothes stay."
            }
            className="mt-2 min-h-[180px] w-full flex-1 resize-none text-[14px] outline-none"
          />
          <p className="mt-2 text-right text-[12px] text-[#9CA3AF]">{prompt.length}/20000</p>
          {mode === "chat" || mode === "retouch" ? (
            <div className="mt-3 border-t border-[#FECACA] pt-3">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-[#9CA3AF]">IMAGE 2 · 3 · 4</p>
              <p className="mt-0.5 text-[11px] leading-snug text-[#9CA3AF]">
                {mode === "retouch"
                  ? "Optional. Upload the clothes. Image 1 stays this still."
                  : "Optional. Place, light, object, or another person. Prompt what they do. Image 1 stays this character."}
              </p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {[0, 1, 2].map((i) => {
                  const url = extras?.[i] || "";
                  return (
                    <div key={i} className="overflow-hidden rounded-lg border border-[#FECACA] bg-[#FFF7ED]/40">
                      {url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumbSrc(url, 240)} alt="" className="aspect-square w-full object-cover" />
                      ) : (
                        <div className="grid aspect-square place-items-center text-[11px] font-semibold text-[#9CA3AF]">
                          Image {i + 2}
                        </div>
                      )}
                      <div className="flex border-t border-[#FECACA]">
                        <label className="flex-1 cursor-pointer py-1.5 text-center text-[11px] font-semibold text-[#E11D48]">
                          Upload
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="hidden"
                            onChange={async (e) => {
                              const f = e.target.files?.[0];
                              e.target.value = "";
                              if (!f || !setExtras) return;
                              const form = new FormData();
                              form.append("file", f);
                              form.append("kind", "character");
                              const res = await fetch("/api/media/upload", { method: "POST", body: form });
                              const json = await res.json();
                              if (!res.ok || !json.mediaUrl) return;
                              const next = [...(extras && extras.length === 3 ? extras : ["", "", ""])];
                              next[i] = json.mediaUrl;
                              setExtras(next);
                            }}
                          />
                        </label>
                        {url ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (!setExtras) return;
                              const next = [...(extras && extras.length === 3 ? extras : ["", "", ""])];
                              next[i] = "";
                              setExtras(next);
                            }}
                            className="px-2 text-[11px] text-[#9CA3AF]"
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

function FaceSwapPane({
  name,
  identity,
  stills,
  base,
  setBase,
  pickBase,
  setPickBase,
  library,
}: {
  name: string;
  identity: string | null;
  stills: { slot: string; url: string; label: string }[];
  base: string;
  setBase: (v: string) => void;
  extra: string;
  setExtra: (v: string) => void;
  pickBase: boolean;
  setPickBase: (v: boolean) => void;
  library: { id: string; name: string; identityUrl: string | null; thumbUrl?: string | null; poseUrl?: string | null }[];
}) {
  const [donorId, setDonorId] = useState("");
  const [donorName, setDonorName] = useState("");
  const [donorStills, setDonorStills] = useState<{ url: string; label: string }[]>([]);
  const [donorBusy, setDonorBusy] = useState(false);

  async function loadDonor(id: string, fallbackName: string, fallbackPose: string) {
    setDonorId(id);
    setDonorName(fallbackName);
    setDonorBusy(true);
    setPickBase(false);
    try {
      const res = await fetch(`/api/characters/${id}`);
      const row = await res.json();
      const seen = new Set<string>();
      const next: { url: string; label: string }[] = [];
      const push = (url?: string | null, label?: string) => {
        const u = (url || "").trim();
        if (!u || seen.has(u)) return;
        seen.add(u);
        next.push({ url: u, label: label || "Still" });
      };
      push(row.identityUrl, "Identity");
      for (const s of row.slots || []) push(s.url, s.label || s.key);
      for (const e of row.edits || []) push(e.url, "Edit");
      setDonorStills(next);
      setDonorName(row.name || fallbackName);
      const pick = next.find((s) => s.url === fallbackPose) || next.find((s) => s.url !== row.identityUrl) || next[0];
      if (pick) setBase(pick.url);
    } catch {
      setDonorStills(fallbackPose ? [{ url: fallbackPose, label: fallbackName }] : []);
      if (fallbackPose) setBase(fallbackPose);
    } finally {
      setDonorBusy(false);
    }
  }

  return (
    <>
      <div className="mt-3 flex items-center gap-3 rounded-xl bg-[#FFF1F2] px-3 py-2">
        <div className="min-w-0 flex-1 text-[12px] text-[#9F1239]">
          Hasilnya @{name}, bukan character di Image 1. Image 1 = pinjam pose/baju. FACE lock @{name}. File masuk library @{name}.
        </div>
        {identity ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbSrc(identity, 96)} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" title={`FACE lock @${name}`} />
        ) : (
          <span className="shrink-0 text-[11px] text-[#9F1239]">Need FACE lock</span>
        )}
      </div>
      <div className="mx-auto mt-3 grid max-w-4xl gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-[#FECACA] p-3">
          <p className="text-[12px] font-semibold">Image 1 · pinjam pose (bukan muka)</p>
          <p className="mt-0.5 text-[11px] text-[#6B7280]">Pilih character. Still-nya di Image 2. Muka mereka tidak kepake.</p>
          {library.length ? (
            <div className="mt-2 grid max-h-72 grid-cols-4 gap-1.5 overflow-auto">
              {library.map((c) => {
                const pose = c.poseUrl || c.identityUrl || c.thumbUrl || "";
                if (!pose) return null;
                return (
                  <button
                    key={c.id}
                    type="button"
                    title={c.name}
                    onClick={() => void loadDonor(c.id, c.name, pose)}
                    className={cn("overflow-hidden rounded-md border", donorId === c.id ? "border-[#E11D48]" : "border-[#E5E7EB]")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={thumbSrc(c.thumbUrl || pose, 96)} alt="" className="aspect-square w-full object-cover" />
                    <p className="truncate px-0.5 py-0.5 text-center text-[10px] font-semibold">{c.name}</p>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-[#9CA3AF]">Need another character with a still.</p>
          )}
          <label className="mt-2 flex w-full cursor-pointer justify-center rounded-lg border border-[#E5E7EB] py-2 text-[12px] font-semibold">
            Upload pose
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const form = new FormData();
                form.append("file", f);
                form.append("kind", "character");
                const res = await fetch("/api/media/upload", { method: "POST", body: form });
                const json = await res.json();
                if (res.ok) {
                  setDonorId("");
                  setDonorName("Upload");
                  setDonorStills([{ url: json.mediaUrl, label: "Upload" }]);
                  setBase(json.mediaUrl);
                  setPickBase(false);
                }
              }}
            />
          </label>
        </div>
        <div className="rounded-xl border border-[#FECACA] p-3">
          <p className="text-[12px] font-semibold">Image 2 · {donorName ? `pose @${donorName}` : "pose still"}</p>
          <p className="mt-0.5 text-[11px] text-[#6B7280]">Klik still. Muka di hasil = @{name}, baju/pose dari sini.</p>
          {base && base !== identity ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbSrc(base, 480)} alt="" className="mt-2 aspect-[3/4] w-full rounded-lg object-cover" />
          ) : (
            <div className="mt-2 grid aspect-[3/4] place-items-center rounded-lg border border-dashed border-[#FECACA] text-[12px] text-[#9CA3AF]">
              {donorBusy ? "Loading…" : donorId ? "Pick a still" : "Pick a character first"}
            </div>
          )}
          {donorStills.length ? (
            <div className="mt-2 grid max-h-64 grid-cols-4 gap-1 overflow-auto">
              {donorStills.map((s) => (
                <button
                  key={s.url}
                  type="button"
                  title={s.label}
                  onClick={() => {
                    setBase(s.url);
                    setPickBase(false);
                  }}
                  className={cn("overflow-hidden rounded-md border", base === s.url ? "border-[#E11D48]" : "border-[#E5E7EB]")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumbSrc(s.url, 160)} alt="" className="aspect-square w-full object-cover" loading="lazy" decoding="async" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

function ProductPane({
  plates,
  framing,
  onFraming,
  stamp,
  products,
  setProducts,
  prompt,
  setPrompt,
  tryOnEngines,
  tryOnEngineId,
  onTryOnEngine,
}: {
  plates: Record<ProductFraming, string>;
  framing: ProductFraming;
  onFraming: (v: ProductFraming) => void;
  stamp?: string;
  products: string[];
  setProducts: (v: string[]) => void;
  prompt: string;
  setPrompt: (v: string) => void;
  tryOnEngines: { id: string; name: string; status: string; cloud?: boolean }[];
  tryOnEngineId: string;
  onTryOnEngine: (id: string) => void;
}) {
  const skuMax = 6;
  const room = skuMax - products.length;
  const fileRef = useRef<HTMLInputElement>(null);
  const [skuCategory, setSkuCategory] = useState("");
  const [skuHint, setSkuHint] = useState("");
  const baselines: { id: ProductFraming; label: string }[] = [
    { id: "headshot", label: "Headshot" },
    { id: "three_quarter", label: "3/4" },
    { id: "full", label: "Full body" },
  ];
  function openUpload() {
    if (!skuCategory) {
      setSkuHint("Pick a category first.");
      return;
    }
    setSkuHint("");
    fileRef.current?.click();
  }
  async function addFiles(list: FileList | File[]) {
    if (!skuCategory) {
      setSkuHint("Pick a category first.");
      return;
    }
    const take = [...list].slice(0, Math.max(0, skuMax - products.length));
    if (!take.length) return;
    const urls: string[] = [];
    for (const f of take) {
      const form = new FormData();
      form.append("file", f);
      form.append("kind", "product");
      form.append("category", skuCategory);
      const res = await fetch("/api/media/upload", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok || !json.mediaUrl) {
        setSkuHint(json.error || "Upload failed.");
        break;
      }
      urls.push(json.mediaUrl);
    }
    if (urls.length) {
      setSkuHint("");
      setProducts([...products, ...urls].slice(0, skuMax));
    }
  }
  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold text-[#111827]">Baseline</p>
          <p className="text-[11px] text-[#9CA3AF]">Person plate · Complete set</p>
        </div>
        <div className="flex gap-1.5">
          {baselines.map((b) => {
            const url = plates[b.id];
            const on = framing === b.id;
            return (
              <button
                key={b.id}
                type="button"
                disabled={!url}
                title={url ? b.label : "Need Complete set"}
                onClick={() => onFraming(b.id)}
                className={cn(
                  "w-14 shrink-0 overflow-hidden rounded-lg border text-center",
                  on ? "border-[#E11D48]" : "border-[#E5E7EB]",
                  !url && "opacity-40",
                )}
              >
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbSrc(url, 160, stamp)} alt="" className="aspect-[3/4] w-full object-cover" />
                ) : (
                  <div className="grid aspect-[3/4] place-items-center bg-[#F9FAFB] text-[8px] leading-tight text-[#9CA3AF]">—</div>
                )}
                <p className={cn("px-0.5 py-0.5 text-[9px] font-semibold leading-none", on ? "text-[#E11D48]" : "text-[#6B7280]")}>
                  {b.label}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-[#E6E8EE] bg-white p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold text-[#111827]">SKU {products.length}/{skuMax}</p>
            <p className="text-[11px] text-[#9CA3AF]">Clothes, earrings, necklace, bag, shoes…</p>
          </div>
          {room > 0 ? (
            <div className="flex items-center gap-2">
              <select
                value={skuCategory}
                onChange={(e) => {
                  setSkuCategory(e.target.value);
                  if (e.target.value) setSkuHint("");
                }}
                aria-label="SKU category"
                className="h-7 rounded-lg border border-[#E5E7EB] bg-white px-2 text-[11px] font-semibold text-[#111827] outline-none focus:border-[#C4C9D4]"
              >
                <option value="">Category</option>
                {PRODUCT_CATEGORIES.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              <button type="button" onClick={openUpload} className="text-[11px] font-semibold text-[#E11D48]">
                {products.length ? "Add view" : "Upload"}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const files = e.target.files;
                  if (files?.length) await addFiles(files);
                  e.target.value = "";
                }}
              />
            </div>
          ) : (
            <span className="text-[10px] text-[#9CA3AF]">Full</span>
          )}
        </div>
        {skuHint ? <p className="mt-1 text-[11px] font-medium text-[#E11D48]">{skuHint}</p> : null}
        <div className="mt-1.5 grid grid-cols-6 gap-1.5">
          {Array.from({ length: skuMax }, (_, i) => (
            <div key={i} className="relative">
              {products[i] ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={products[i]} alt="" className="aspect-square w-full rounded-lg bg-[#F9FAFB] object-contain" />
                  <button
                    type="button"
                    onClick={() => setProducts(products.filter((_, j) => j !== i))}
                    className="absolute right-0.5 top-0.5 rounded-full bg-white/90 px-1 text-[10px] font-semibold text-[#6B7280]"
                  >
                    ×
                  </button>
                </>
              ) : (
                <div className="grid aspect-square place-items-center rounded-lg border border-dashed border-[#E5E7EB] text-[10px] text-[#D1D5DB]">
                  {i + 1}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <ProductPicker
        values={products}
        max={skuMax}
        reloadKey={products.join("|")}
        onPick={(url) => {
          if (products.includes(url)) setProducts(products.filter((u) => u !== url));
          else if (products.length < skuMax) setProducts([...products, url]);
        }}
      />

      <input
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="Optional: gold hoops, layer the necklace, wearing the set…"
        className="w-full rounded-lg border border-[#E5E7EB] px-3 py-1.5 text-[13px] outline-none"
      />
    </div>
  );
}


