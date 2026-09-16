"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { isMinorLook, type Character, type CharacterSlot } from "@/lib/character-types";
import { cn } from "@/lib/cn";
import { useGpu } from "@/components/GpuStatus";
import { CharacterGallery, type GalleryJob } from "@/components/create/CharacterGallery";
import { PRESET_CATEGORIES, presetLabel, presetNegative, presetPreview, presetPrompt, type PresetCategory, type PresetOption } from "@/lib/prompt-presets";
import { isProductMediaUrl } from "@/lib/media-kind";
import { thumbSrc } from "@/lib/media-url";
import { ProductPicker } from "@/components/create/ProductPicker";
import { compileCharacterPrompt, withAvoidList } from "@/lib/prompt-compile";
import { quoteMotionBar } from "@/lib/cloud-rates";
import { isWanEngine } from "@/lib/job-gpu";
import { AffiliateCanvas } from "@/components/create/workspace/AffiliateCanvas";
import { I2VCanvas } from "@/components/create/workspace/I2VCanvas";
import { SoonCanvas } from "@/components/create/workspace/SoonCanvas";
import { IMAGE_TOOLS, VIDEO_TOOLS, WORKSPACE_I2V_ENGINES } from "@/components/create/workspace/tools";
import { AspectPicker } from "@/components/AspectPicker";
import { IMAGE_ASPECTS } from "@/lib/image-aspect";

type PickedChip = { id: string; label: string; prompt: string; negative?: string };

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
  onEdit: (opts: { baseUrl: string; prompt: string; mode: string; extraUrl?: string; extraUrls?: string[]; aspect?: string }) => void;
  onVideoSet: () => void;
  onMotion: (opts: {
    imageUrl: string;
    prompt: string;
    durationSec: number;
    motionUrl?: string;
    engineId?: string;
    sound?: boolean;
    orientation?: "image" | "video";
  }) => void;
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
  const [prompt, setPrompt] = useState("");
  const [picked, setPicked] = useState<Record<string, PickedChip>>({});
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

  const faceUrl = character.slots.find((s) => s.key === "headshot")?.url || character.identityUrl || "";
  const [durationSec, setDurationSec] = useState(5);
  const [motionEngineId, setMotionEngineId] = useState("minimax-h3");
  const [motionEngines, setMotionEngines] = useState<{ id: string; name: string; status: string; cloud?: boolean }[]>([]);
  const [refImage, setRefImage] = useState(faceUrl);
  const [editMode, setEditMode] = useState("chat");
  const [editBase, setEditBase] = useState(faceUrl);
  const [editExtra, setEditExtra] = useState("");
  const [editProducts, setEditProducts] = useState<string[]>([]);
  const [pickBase, setPickBase] = useState(true);
  const [banner, setBanner] = useState(true);
  const [imageMode, setImageMode] = useState<"chat" | "sheet" | "pose-real">("chat");
  const [poseRef, setPoseRef] = useState("");
  const [lookRef, setLookRef] = useState("");
  const [cloneSlot, setCloneSlot] = useState<"pose" | "look">("look");
  const [poseHint, setPoseHint] = useState("");
  const [confirmDel, setConfirmDel] = useState("");
  const [engineNames, setEngineNames] = useState<Record<string, string>>({});
  const [name, setName] = useState(character.name);
  const [library, setLibrary] = useState<{ id: string; name: string; identityUrl: string | null }[]>([]);
  const publicOn = character.visibility === "public";

  useEffect(() => {
    fetch("/api/characters?lite=1")
      .then((r) => r.json())
      .then((j) =>
        setLibrary(
          ((j.characters || []) as { id: string; name: string; identityUrl: string | null }[]).filter((c) => c.identityUrl),
        ),
      )
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setName(character.name);
  }, [character.name]);

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

  useEffect(() => {
    fetch("/api/settings/presets")
      .then((r) => r.json())
      .then((j) => {
        if (Array.isArray(j.categories) && j.categories.length) setPresetCats(j.categories);
      })
      .catch(() => undefined);
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
        setImageEngineId(j.selected?.image || rows.find((e) => e.status === "ready")?.id || "");
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

  const activeImage = imageEngines.find((e) => e.id === imageEngineId);
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

  const workspaceCats = isMinorLook(character.look) ? presetCats.filter((c) => !c.nsfw) : presetCats;
  const readyTools = useMemo(
    () => new Set<string>([...VIDEO_TOOLS, ...IMAGE_TOOLS].filter((t) => t.ready).map((t) => t.id)),
    [],
  );
  const selectedReady = readyTools.has(tool);
  const bodyLockUrl = character.slots.find((s) => s.key === "front" && s.url)?.url || "";
  const canGenerateImage =
    imageMode === "pose-real"
      ? Boolean(character.identityUrl && bodyLockUrl && lookRef)
      : Boolean(character.identityUrl);
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
  const canEdit =
    editMode === "product"
      ? Boolean(character.identityUrl && editProducts.length)
      : editMode === "face-swap"
        ? Boolean(editBase && editExtra && editExtra !== character.identityUrl)
        : Boolean(editBase) && (editMode !== "chat" || Boolean(prompt.trim()));

  function setTool(id: string) {
    router.replace(`/create/characters/${character.id}/workspace?tool=${id}`);
  }

  function pickOption(categoryId: string, optionId: string, customText?: string) {
    if (optionId.startsWith("custom:") || customText) {
      const text = customText || optionId.replace(/^custom:/, "");
      setPicked((cur) => ({ ...cur, [categoryId]: { id: "custom", label: text.slice(0, 24), prompt: text, negative: "" } }));
    } else {
      const label = presetLabel(categoryId, optionId) || optionId;
      const fragment = presetPrompt(categoryId, optionId) || label;
      const negative = presetNegative(categoryId, optionId);
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
        const pose = poseRef || bodyLockUrl;
        if (!character.identityUrl || !pose) {
          setPoseHint("Need BODY LOCK (full body). Run Complete set first.");
          return;
        }
        if (!lookRef) {
          setPoseHint("Pick a look / illustration. Character is already locked.");
          return;
        }
        setPoseHint("");
        onEdit({
          baseUrl: pose,
          prompt: stackPrompt(prompt),
          mode: "pose-real",
          extraUrl: lookRef,
          aspect,
        });
        return;
      }
      const text = stackPrompt(prompt);
      if (!text.trim() || !character.identityUrl) return;
      setPoseHint("");
      onEdit({ baseUrl: character.identityUrl, prompt: text, mode: "chat", aspect });
      return;
    }
    if (tool === "affiliate") return;
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
    if (tool === "edit-image") {
      if (editMode === "product") {
        if (!character.identityUrl || !editProducts.length) return;
        onEdit({
          baseUrl: character.identityUrl,
          prompt: stackPrompt(prompt),
          mode: "product",
          extraUrl: editProducts[0],
          extraUrls: editProducts,
          aspect,
        });
        return;
      }
      if (!editBase) return;
      const compiledEdit = compileCharacterPrompt(prompt);
      const lock = character.identityUrl || "";
      if (editMode === "face-swap") {
        if (!editExtra || editExtra === lock) {
          setPoseHint("Pick another character's face. Face swap does not use this identity.");
          return;
        }
        setPoseHint("");
        onEdit({ baseUrl: editBase, prompt, mode: "face-swap", extraUrl: editExtra, aspect });
        return;
      }
      if (compiledEdit.needsSceneRef) {
        const pose =
          (editExtra && editExtra !== lock ? editExtra : "") || (editBase && editBase !== lock ? editBase : "");
        if (!pose) {
          setPoseHint("This prompt needs the pose photo. Use + Additional image.");
          return;
        }
        setPoseHint("");
        onEdit({ baseUrl: pose, prompt, mode: "face-swap", extraUrl: lock || undefined, aspect });
        return;
      }
      if (editMode === "chat" && !prompt.trim()) return;
      onEdit({ baseUrl: editBase, prompt, mode: editMode, extraUrl: editExtra || undefined, aspect });
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
      .filter((s) => s.url)
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
  const cloudImage = Boolean(activeImage?.cloud);
  const needImageKey = (tool === "generate-image" || tool === "edit-image") && cloudImage && activeImage?.status !== "ready";
  const motionCloud = tool === "image-to-video" && (isWanEngine(motionEngineId) || motionEngineId.startsWith("seedance"));
  const gpuBusy = Boolean(busy) || (!cloudImage && !motionCloud && gpu.busy);
  const wanRow = motionEngines.find((e) => e.id === motionEngineId);
  const wanMissing =
    tool === "image-to-video" && isWanEngine(motionEngineId) && motionEngines.length > 0 && wanRow?.status !== "ready";
  const disabled =
    gpuBusy ||
    !selectedReady ||
    (tool === "generate-image" && (needImageKey || !canGenerateImage)) ||
    (tool === "image-to-video" && !canI2V) ||
    (tool === "complete-set" && !character.identityUrl) ||
    (tool === "edit-image" && !canEdit);

  return (
    <div className="min-h-[calc(100vh-49px)] bg-white text-[#111827]">
      <div className="flex items-center border-b border-[#E5E7EB] px-4 py-2">
        <div className="flex items-center gap-2">
          <Link href="/create/characters" className="text-[13px] text-[#6B7280] hover:text-[#111827]">
            ←
          </Link>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void saveName()}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            className="w-[12rem] bg-transparent text-[14px] font-semibold outline-none"
            title="Rename character"
          />
        </div>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#E5E7EB] px-4 py-3">
        <div className="flex min-w-0 gap-3">
          <div className="h-16 w-16 overflow-hidden rounded-xl bg-[#F3F4F8]">
            {faceUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbSrc(faceUrl, 160, character.updatedAt)} alt="" className="h-full w-full object-cover" />
            ) : null}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => void saveName()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                className="bg-transparent text-[16px] font-semibold outline-none"
                title="Rename character"
              />
              <span className="text-[12px] text-[#6B7280]">just now</span>
            </div>
            <button type="button" className="mt-1 rounded-full border border-[#E5E7EB] px-3 py-1 text-[12px] text-[#6B7280]">
              + Create Voice Model
            </button>
            <SocialRow character={character} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-[12px] text-[#6B7280]">
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
              banner={banner}
              setBanner={setBanner}
              imageMode={imageMode}
              setImageMode={setImageMode}
              poseRef={poseRef}
              setPoseRef={setPoseRef}
              lookRef={lookRef}
              setLookRef={setLookRef}
              poseHint={poseHint}
              skipRevamp={cloudImage}
              onGenerate={generate}
              libraryStills={[
                ...stills.map((s) => ({ url: s.url, label: s.label })),
                ...(sharedInspiration ?? character.inspiration ?? [])
                  .filter((p) => p.kind === "image")
                  .map((p) => ({ url: p.url, label: p.label || "Inspiration" })),
              ]}
              identityUrl={character.identityUrl}
              cloneSlot={cloneSlot}
              setCloneSlot={setCloneSlot}
              bodyLockUrl={bodyLockUrl}
            />
          ) : tool === "affiliate" ? (
            <AffiliateCanvas
              name={character.name}
              characterId={character.id}
              identity={character.identityUrl}
              stills={stills.map((s) => ({ url: s.url, label: s.label }))}
              onMotion={(opts) => onMotion(opts)}
            />
          ) : tool === "complete-set" ? (
            <div className="p-6">
              <p className="text-[11px] font-semibold tracking-[0.16em] text-[#9CA3AF]">VIDEO · COMPLETE SET</p>
              <h2 className="mt-1 text-lg font-black">Headshot · 3/4 body · Full body</h2>
              <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-[#4B5563]">
                Three 5s Wan 3.0 Prime clips from the locked stills. Missing stills generate first with the Image model
                in the bar (hands + feet on body shots). Identity stays this character.
              </p>
              <ul className="mt-4 grid max-w-lg gap-2 text-[13px]">
                {["Headshot — blink / breath", "3/4 body — hands visible", "Full body — feet planted"].map((t) => (
                  <li key={t} className="rounded-xl border border-[#E5E7EB] bg-white px-3 py-2">
                    {t}
                  </li>
                ))}
              </ul>
            </div>
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
          ) : tool === "edit-image" ? (
            <EditImageCanvas
              name={character.name}
              identity={character.slots.find((s) => s.key === "front" && s.url)?.url || character.identityUrl}
              stills={stills}
              mode={editMode}
              setMode={setEditMode}
              base={editBase}
              setBase={setEditBase}
              extra={editExtra}
              setExtra={setEditExtra}
              products={editProducts}
              setProducts={setEditProducts}
              pickBase={pickBase}
              setPickBase={setPickBase}
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
              library={library.filter((c) => c.id !== character.id && c.identityUrl)}
            />
          ) : (
            <SoonCanvas tool={tool} />
          )}

          <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-3 border-t border-[#E5E7EB] bg-white px-4 py-3 text-[12px]">
            {tool === "generate-image" ? (
              <>
                <span className="mr-auto font-semibold text-[#111827]">
                  {imageMode === "sheet"
                    ? `${activeImage?.name || "Image"} · Headshot · 3/4 · Full body`
                    : imageMode === "pose-real"
                      ? `${activeImage?.name || "Image"} · Clone Image`
                      : creditLabel}
                </span>
                <label className="flex items-center gap-1">
                  Model
                  <select
                    value={imageEngineId}
                    onChange={(e) => void pickImageEngine(e.target.value).catch((err) => console.error(err))}
                    className="max-w-[12rem] rounded-md border border-[#E5E7EB] px-1 py-1"
                  >
                    {(imageMode === "pose-real"
                      ? imageEngines.filter((e) =>
                          ["qwen-image-edit", "seedream-5-pro", "seedream-4-5", "gpt-image-2", "gpt-image-2.5"].includes(e.id),
                        )
                      : imageEngines
                    ).map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                        {e.cloud ? (e.status === "ready" ? " · Paid" : " · need key") : ""}
                        {!e.cloud && e.status !== "ready" ? " · soon" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="text-[#6B7280]">Native {activeImage?.nativeSize || "—"}</span>
                <label className="flex items-center gap-1">
                  Qty
                  <select value={qty} onChange={(e) => setQty(Number(e.target.value))} className="rounded-md border border-[#E5E7EB] px-1 py-1">
                    {[1, 2, 3, 4].map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </label>
                <AspectField value={aspect} onChange={setAspect} />
              </>
            ) : tool === "edit-image" ? (
              <>
                <span className="mr-auto font-semibold text-[#111827]">{creditLabel}</span>
                <label className="flex items-center gap-1">
                  Model
                  <select
                    value={imageEngineId}
                    onChange={(e) => void pickImageEngine(e.target.value).catch((err) => console.error(err))}
                    className="max-w-[12rem] rounded-md border border-[#E5E7EB] px-1 py-1"
                  >
                    {imageEngines.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                        {e.cloud ? (e.status === "ready" ? " · Paid" : " · need key") : ""}
                        {!e.cloud && e.status !== "ready" ? " · soon" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="text-[#6B7280]">Native {activeImage?.nativeSize || "—"}</span>
                {editMode === "upscale" ? null : <AspectField value={aspect} onChange={setAspect} />}
                {editMode === "product" || editMode === "face-swap" || editMode === "upscale" ? (
                  <span className="text-[#6B7280]">
                    {editMode === "product"
                      ? "SKU image required"
                      : editMode === "face-swap"
                        ? "Other character face + this body"
                        : "Keep original"}
                  </span>
                ) : null}
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
            ) : (
              <span className="mr-auto text-[#6B7280]">Soon</span>
            )}
            <button
              type="button"
              disabled={needImageKey || wanMissing ? false : disabled}
              onClick={() => (needImageKey || wanMissing ? router.push("/system/settings") : generate())}
              className="rounded-full bg-[#E5E7EB] px-4 py-1.5 text-[13px] font-semibold text-[#111827] disabled:opacity-40"
              style={!needImageKey && !wanMissing && !disabled ? { background: ROSE, color: "#fff" } : undefined}
            >
              {needImageKey
                ? "Add key in Settings"
                : wanMissing
                  ? "Add Wan key in Settings"
                  : gpuBusy
                    ? `GPU busy${elapsed ? ` · ${elapsed}` : ""}`
                    : "Generate"}
            </button>
          </div>
          {poseHint ? <p className="px-4 py-2 text-[12px] font-semibold text-[#E11D48]">{poseHint}</p> : null}
          {error ? <p className="px-4 py-2 text-[12px] text-[#E11D48]">{error}</p> : null}
          {notice ? <p className="px-4 py-2 text-[12px] text-[#9A3412]">{notice}</p> : null}

          {tool === "generate-image" ||
          tool === "image-to-video" ||
          tool === "complete-set" ||
          tool === "affiliate" ||
          tool === "edit-image" ? (
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
              focusKind={tool === "image-to-video" || tool === "complete-set" || tool === "affiliate" ? "video" : "image"}
              sharedInspiration={sharedInspiration}
              onUseAsReference={(item) => {
                if (item.kind !== "image") return;
                const url = item.url;
                if (tool === "image-to-video") {
                  setRefImage(url);
                  return;
                }
                if (tool === "edit-image") {
                  if (editMode === "product") return;
                  if (editMode === "face-swap") setEditBase(url);
                  else setEditExtra(url);
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
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.16em] text-[#9CA3AF]">IDENTITY</p>
              <div className="mt-2 overflow-hidden rounded-xl border border-[#E5E7EB] bg-white">
                {faceUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbSrc(faceUrl, 480, character.updatedAt)} alt="" className="aspect-[3/4] w-full object-cover" />
                ) : (
                  <div className="grid aspect-[3/4] place-items-center text-[12px] text-[#9CA3AF]">No lock yet</div>
                )}
              </div>
              <p className="mt-2 truncate text-[12px] font-semibold">@{name}</p>
            </div>
            {tool === "image-to-video" || tool === "complete-set" || tool === "affiliate" ? (
              <p className="text-[12px] leading-relaxed text-[#6B7280]">Video stays 9:16. Change still ratio on Generate / Edit image.</p>
            ) : (
              <AspectPicker value={aspect} onChange={setAspect} />
            )}
            <div className="rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-[12px] text-[#6B7280]">
              <p className="font-semibold text-[#111827]">{activeImage?.name || "Image model"}</p>
              <p className="mt-0.5">Native {activeImage?.nativeSize || "—"} · {aspect}</p>
              <p className="mt-1">
                {gpu.online ? (gpu.busy ? `GPU busy · ${gpu.label}` : "GPU ready") : gpu.online === false ? "GPU off" : "GPU…"}
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function SocialRow({ character }: { character: Character }) {
  const accounts = character.socialAccounts ?? [];
  const connected = accounts.filter((a) => a.status === "connected");
  const followers = connected.reduce((n, a) => n + (a.followers || 0), 0);
  const href = `/distribute/accounts?character=${character.id}`;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[#6B7280]">
      <span>
        <span className="font-semibold text-[#111827]">{followers.toLocaleString()}</span> followers
        {connected.length ? ` · ${connected.length} account${connected.length === 1 ? "" : "s"}` : ""}
      </span>
      <Link href={href} className="font-semibold text-[#E11D48] hover:underline">
        {connected.length ? "Manage accounts" : "Connect TikTok · IG · YT · X · Threads · Pinterest"}
      </Link>
    </div>
  );
}

function AspectField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-1">
      Aspect
      <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-md border border-[#E5E7EB] px-1 py-1">
        {IMAGE_ASPECTS.map((n) => (
          <option key={n}>{n}</option>
        ))}
      </select>
    </label>
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
          {library.slice(0, 24).map((s) => (
            <button
              key={s.url}
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
          <span className={cn("block truncate text-[11px] leading-snug", on ? "text-white/70" : "text-[#6B7280]")}>{opt.prompt}</span>
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
            <p className="text-[#4B5563]">{opt.prompt}</p>
            {negative ? (
              <p className="text-[#9CA3AF]">
                <span className="font-semibold">Neg · </span>
                {negative}
              </p>
            ) : null}
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
      <p className="mt-0.5 text-[11px] leading-snug text-[#9CA3AF]">Satu opsi per kategori. Klik opsi, lalu edit prompt di dalam.</p>
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
  libraryStills,
  identityUrl,
  cloneSlot,
  setCloneSlot,
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
  libraryStills?: { url: string; label: string }[];
  identityUrl?: string | null;
  cloneSlot?: "pose" | "look";
  setCloneSlot?: (v: "pose" | "look") => void;
  bodyLockUrl?: string;
}) {
  const router = useRouter();
  const stack = categories.map((c) => picked[c.id]?.prompt).filter(Boolean);
  const [library, setLibrary] = useState<{ id: string; name: string; identityUrl: string | null }[]>([]);
  const [pickFace, setPickFace] = useState(false);
  const [revampBusy, setRevampBusy] = useState(false);
  const [revampNote, setRevampNote] = useState("");
  useEffect(() => {
    fetch("/api/characters?lite=1")
      .then((r) => r.json())
      .then((j) =>
        setLibrary(
          ((j.characters || []) as { id: string; name: string; identityUrl: string | null }[]).filter((c) => c.identityUrl),
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
          onClick={() => setImageMode("pose-real")}
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
            Hands and feet stay anatomically correct on the body shots. Uses the Image model in the bar. Then compose 1×3.
            Existing views are skipped.
          </p>
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbSrc(avatar, 320, stamp)} alt="" className="mx-auto mt-4 aspect-[3/4] w-40 rounded-lg object-cover" />
          ) : null}
          <p className="mt-3 text-[12px] text-[#9CA3AF]">Hit Generate. Model is the one in the bar.</p>
        </div>
      ) : null}
      {imageMode === "pose-real" ? (
        <div className="mx-auto mt-6 max-w-lg">
          <p className="text-[14px] font-semibold">Clone Image</p>
          <p className="mt-1 text-[13px] leading-relaxed text-[#6B7280]">
            Same @{name}. Face + full body locked. Pick look, then model. Seedream/GPT Image block franchise anime IP — Qwen local does not.
          </p>
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
          {poseHint ? <p className="mt-2 text-[12px] font-semibold text-[#E11D48]">{poseHint}</p> : null}
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder="Kosong = ikut pose ilustrasi. Isi = pose ikut teks ini (look tetap baju)."
            className="mt-3 w-full resize-none text-[13px] outline-none"
          />
          <button
            type="button"
            onClick={() => onGenerate?.()}
            disabled={!bodyLockUrl || !lookRef}
            className="mt-4 rounded-full px-5 py-2 text-[13px] font-semibold text-white disabled:opacity-40"
            style={{ background: poseRef ? "#E11D48" : "#E5E7EB", color: poseRef ? "#fff" : "#111827" }}
          >
            {!bodyLockUrl ? "Need full body lock first" : !lookRef ? "Pick a look first" : "Generate Clone Image"}
          </button>
        </div>
      ) : null}
      {imageMode === "chat" ? (
      <>
      {banner ? (
        <div className="mt-3 flex items-start justify-between rounded-xl bg-[#FFF1F2] px-3 py-2 text-[12px] text-[#9F1239]">
          <span>
            Face lock is @{name}. Presets + text only. To recast a photo, use Clone Image.
          </span>
          <button type="button" onClick={() => setBanner(false)}>
            ×
          </button>
        </div>
      ) : null}
      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(280px,34%)_minmax(0,1fr)]">
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
                    {c.identityUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumbSrc(c.identityUrl, 64)} alt="" className="h-6 w-6 rounded-full object-cover" />
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
          <textarea
            value={prompt}
            onChange={(e) => {
              const v = e.target.value;
              setPrompt(v);
              if (v.endsWith("@")) setPickFace(true);
            }}
            rows={8}
            placeholder={`Makeup, café, camera. Face is @${name}. Recast a photo → Clone Image.`}
            className="mt-2 w-full resize-none text-[14px] outline-none"
          />
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-[#6B7280]">
              {skipRevamp
                ? "Paid model — prompt goes as written. No revamp."
                : "Long JSON is auto-revamped on Generate. Or Revamp now to see 4–8 lines."}
            </p>
            {skipRevamp ? null : (
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
          {revampNote ? <p className="mt-1 text-[11px] text-[#9A3412]">{revampNote}</p> : null}
        </div>
      </div>
      </>
      ) : null}
    </div>
  );
}

function EditImageCanvas({
  name,
  identity,
  stills,
  mode,
  setMode,
  base,
  setBase,
  extra,
  setExtra,
  products,
  setProducts,
  pickBase,
  setPickBase,
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
  library,
}: {
  name: string;
  identity: string | null;
  stills: { slot: string; url: string; label: string }[];
  mode: string;
  setMode: (v: string) => void;
  base: string;
  setBase: (v: string) => void;
  extra: string;
  setExtra: (v: string) => void;
  products: string[];
  setProducts: (v: string[]) => void;
  pickBase: boolean;
  setPickBase: (v: boolean) => void;
  prompt: string;
  setPrompt: (v: string) => void;
  picked: Record<string, PickedChip>;
  openCat: string | null;
  customDraft: string;
  setCustomDraft: (v: string) => void;
  onToggleCat: (id: string) => void;
  onPick: (categoryId: string, optionId: string, customText?: string) => void;
  onEditChip: (categoryId: string, prompt: string) => void;
  onClear: (id: string) => void;
  categories: PresetCategory[];
  library: { id: string; name: string; identityUrl: string | null }[];
}) {
  const modes = [
    { id: "chat", label: "Chat to edit" },
    { id: "face-swap", label: "Face swap" },
    { id: "product", label: "Edit product" },
    { id: "upscale", label: "Upscale" },
    { id: "bg", label: "Remove background" },
  ];
  return (
    <div className="p-4">
      <div className="flex flex-wrap justify-center gap-2">
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => {
              if (m.id === "face-swap") {
                setBase(identity || "");
                if (extra === identity) setExtra("");
              }
              setMode(m.id);
            }}
            className={cn(
              "rounded-full px-3 py-1 text-[12px] font-semibold",
              mode === m.id ? "border border-[#E11D48] text-[#E11D48]" : "bg-[#F3F4F8] text-[#6B7280]",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      {mode === "product" ? (
        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(260px,32%)_minmax(0,1fr)]">
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
          <ProductPane
            name={name}
            identity={identity}
            products={products}
            setProducts={setProducts}
            prompt={prompt}
            setPrompt={setPrompt}
          />
        </div>
      ) : mode === "face-swap" ? (
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
          prompt={prompt}
          setPrompt={setPrompt}
          mode={mode}
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
  prompt,
  setPrompt,
  mode,
}: {
  name: string;
  stills: { slot: string; url: string; label: string }[];
  base: string;
  setBase: (v: string) => void;
  setPickBase: (v: boolean) => void;
  extra: string;
  setExtra: (v: string) => void;
  prompt: string;
  setPrompt: (v: string) => void;
  mode: string;
}) {
  return (
    <>
      <div className="mt-3 rounded-xl bg-[#FFF1F2] px-3 py-2 text-[12px] text-[#9F1239]">
        Select or upload the base image, then describe the edit. @{name} stays locked.
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
                : `Describe how you want to edit this image of @${name}.`
            }
            className="mt-2 min-h-[180px] w-full flex-1 resize-none text-[14px] outline-none"
          />
          <div className="mt-2 flex items-center justify-between text-[12px]">
            <label className="cursor-pointer rounded-full border border-[#E11D48] px-2 py-1 text-[#E11D48]">
              + Additional image (pose / Image 2)
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
                  if (res.ok) setExtra(json.mediaUrl);
                }}
              />
            </label>
            <span className="text-[#9CA3AF]">{prompt.length}/20000</span>
          </div>
          {extra ? (
            <div className="mt-2 flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={extra} alt="" className="h-14 w-14 rounded-md object-cover" />
              <p className="text-[11px] font-semibold text-[#111827]">Pose/scene attached. Face stays @{name}.</p>
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
  extra,
  setExtra,
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
  library: { id: string; name: string; identityUrl: string | null }[];
}) {
  const donor = library.find((c) => c.identityUrl === extra);
  return (
    <>
      <div className="mt-3 rounded-xl bg-[#FFF1F2] px-3 py-2 text-[12px] text-[#9F1239]">
        Face from <strong>another</strong> character. Body / pose / clothes stay this still of @{name}. Not this identity.
      </div>
      <div className="mx-auto mt-3 grid max-w-3xl gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-[#FECACA] p-3">
          <p className="text-[12px] font-semibold">Face · other character</p>
          <p className="mt-0.5 text-[11px] text-[#6B7280]">Pick a library identity. @{name} is excluded.</p>
          {extra ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbSrc(extra, 480)} alt="" className="mt-2 aspect-[3/4] w-full rounded-lg object-cover" />
          ) : (
            <div className="mt-2 grid aspect-[3/4] place-items-center rounded-lg border border-dashed border-[#FECACA] text-[12px] text-[#9CA3AF]">
              No donor face
            </div>
          )}
          <p className="mt-2 text-[12px] font-semibold">{donor ? `@${donor.name}` : extra ? "Donor face" : "—"}</p>
          {library.length ? (
            <div className="mt-2 grid max-h-56 grid-cols-4 gap-1 overflow-auto">
              {library.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  title={c.name}
                  onClick={() => setExtra(c.identityUrl!)}
                  className={cn("overflow-hidden rounded-md border", extra === c.identityUrl ? "border-[#E11D48]" : "border-[#E5E7EB]")}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumbSrc(c.identityUrl, 64)} alt="" className="aspect-square w-full object-cover" />
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[11px] text-[#9CA3AF]">Need another character with an identity plate.</p>
          )}
        </div>
        <div className="rounded-xl border border-[#FECACA] p-3">
          <p className="text-[12px] font-semibold">Body / pose · @{name}</p>
          <p className="mt-0.5 text-[11px] text-[#6B7280]">This character’s still, or upload a pose photo.</p>
          {base ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbSrc(base, 480)} alt="" className="mt-2 aspect-[3/4] w-full rounded-lg object-cover" />
          ) : identity ? (
            <button type="button" onClick={() => setBase(identity)} className="mt-2 block w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumbSrc(identity, 480)} alt="" className="aspect-[3/4] w-full rounded-lg object-cover opacity-70" />
              <p className="mt-1 text-[11px] text-[#6B7280]">Click to use this still</p>
            </button>
          ) : (
            <div className="mt-2 grid aspect-[3/4] place-items-center rounded-lg border border-dashed border-[#FECACA] text-[12px] text-[#9CA3AF]">
              No pose yet
            </div>
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
                if (res.ok) setBase(json.mediaUrl);
              }}
            />
          </label>
          {stills.length ? (
            <div className="mt-2 grid max-h-56 grid-cols-3 gap-1 overflow-auto">
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
          ) : null}
        </div>
      </div>
    </>
  );
}

function ProductPane({
  name,
  identity,
  products,
  setProducts,
  prompt,
  setPrompt,
}: {
  name: string;
  identity: string | null;
  products: string[];
  setProducts: (v: string[]) => void;
  prompt: string;
  setPrompt: (v: string) => void;
}) {
  const room = 3 - products.length;
  async function addFiles(list: FileList | File[]) {
    const take = [...list].slice(0, Math.max(0, 3 - products.length));
    if (!take.length) return;
    const urls: string[] = [];
    for (const f of take) {
      const form = new FormData();
      form.append("file", f);
      form.append("kind", "product");
      const res = await fetch("/api/media/upload", { method: "POST", body: form });
      const json = await res.json();
      if (res.ok && json.mediaUrl) urls.push(json.mediaUrl);
    }
    if (urls.length) setProducts([...products, ...urls].slice(0, 3));
  }
  return (
    <>
      <div className="mt-3 rounded-xl bg-[#FFF1F2] px-3 py-2 text-[12px] text-[#9F1239]">
        Affiliate on-model: lock @{name}. SKU lives in the product catalog — not the character library. Output is{" "}
        <strong>one</strong> 9:16 still of them using the product.
      </div>
      <div className="mx-auto mt-3 max-w-3xl">
        <ProductPicker
          values={products}
          max={3}
          reloadKey={products.join("|")}
          onPick={(url) => {
            if (products.includes(url)) setProducts(products.filter((u) => u !== url));
            else if (products.length < 3) setProducts([...products, url]);
          }}
        />
      </div>
      <div className="mx-auto mt-3 grid max-w-3xl gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-[#E5E7EB] bg-[#F9FAFB] p-3">
          <p className="text-[12px] font-semibold">Character lock</p>
          <p className="mt-0.5 text-[11px] text-[#6B7280]">Face + physique. Not an upload.</p>
          {identity ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={identity} alt="" className="mt-2 aspect-[3/4] w-full rounded-lg object-cover" />
          ) : (
            <p className="mt-4 text-[12px] text-[#9CA3AF]">Lock identity first.</p>
          )}
          <p className="mt-2 text-[12px] font-semibold">@{name} · locked</p>
        </div>
        <div className="rounded-xl border border-[#FECACA] p-3">
          <p className="text-[12px] font-semibold">Product refs</p>
          <p className="mt-0.5 text-[11px] text-[#6B7280]">Same SKU, up to 3 angles. Pack shot + labels help.</p>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="relative">
                {products[i] ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={products[i]} alt="" className="aspect-square w-full rounded-lg object-contain bg-white" />
                    <button
                      type="button"
                      onClick={() => setProducts(products.filter((_, j) => j !== i))}
                      className="absolute right-1 top-1 rounded-full bg-white/90 px-1.5 text-[10px] font-semibold text-[#6B7280]"
                    >
                      ×
                    </button>
                  </>
                ) : (
                  <div className="grid aspect-square place-items-center rounded-lg border border-dashed border-[#FECACA] text-[11px] text-[#9CA3AF]">
                    {i + 1}
                  </div>
                )}
              </div>
            ))}
          </div>
          {room > 0 ? (
            <label className="mt-2 flex w-full cursor-pointer justify-center rounded-lg bg-[#E11D48] py-3 text-[12px] font-semibold text-white">
              {products.length ? `Add view (${products.length}/3)` : "Upload product"}
              <input
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
            </label>
          ) : (
            <p className="mt-2 text-center text-[11px] text-[#6B7280]">3/3 refs</p>
          )}
        </div>
      </div>
      <label className="mx-auto mt-3 block max-w-3xl text-[12px] font-semibold text-[#6B7280]">
        How they use it (optional)
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="holding the bag, wearing the jacket, unboxing the phone…"
          className="mt-1 w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm font-normal outline-none"
        />
      </label>
    </>
  );
}


