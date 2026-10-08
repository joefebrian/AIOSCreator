"use client";

import { Handle, Position, useReactFlow, useUpdateNodeInternals, type Node, type NodeProps } from "@xyflow/react";
import { ChevronDown, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { IDENTITY_PLATE_PROMPT, studioImagePrompt, studioVideoPrompt } from "@/lib/character-prompts";
import { stripI2vScreenplay } from "@/lib/prompt-compile";
import { pollJob } from "@/lib/http";
import { IMAGE_ASPECTS, parseImageAspect } from "@/lib/image-aspect";
import { thumbSrc } from "@/lib/media-url";
import { PRESET_CATEGORIES, presetLabel, presetPrompt } from "@/lib/prompt-presets";
import { CharacterLockMenu, ProductLockMenu } from "./CharacterLockMenu";

export type StudioNodeData = {
  label: string;
  kind: "character" | "image" | "video" | "text" | "motion" | "product";
  body?: string;
  src?: string;
  status?: string;
  error?: string;
  engineId?: string;
  durationSec?: number;
  aspect?: string;
  resolution?: string;
  sound?: boolean;
  characterId?: string;
  lockMode?: "one" | "sheet";
  productId?: string;
  semanticDescription?: string;
  presets?: { art?: string; scene?: string; weather?: string };
};

export const STUDIO_RUN = "creatoros-studio-run";

export type StudioNode = Node<StudioNodeData>;

function Port({ type, position, id }: { type: "source" | "target"; position: Position; id?: string }) {
  return (
    <Handle
      id={id}
      type={type}
      position={position}
      className="!h-3 !w-3 !border-2 !border-[#1c1f27] !bg-[#2ee59d]"
    />
  );
}

function incomingText(
  id: string,
  getNode: (id: string) => StudioNode | undefined,
  edges: { source: string; target: string; targetHandle?: string | null }[],
  selfBody?: string,
) {
  const wired = edges
    .filter((e) => e.target === id && (!e.targetHandle || e.targetHandle === "prompt-input"))
    .map((e) => getNode(e.source)?.data)
    .filter((d) => d?.kind === "text" && d.body)
    .map((d) => d!.body!);
  return [...wired, selfBody || ""].filter(Boolean).join("\n");
}

function incomingImage(id: string, getNode: (id: string) => StudioNode | undefined, edges: { source: string; target: string }[]) {
  const hit = edges
    .filter((e) => e.target === id)
    .map((e) => getNode(e.source)?.data)
    .find((d) => (d?.kind === "image" || d?.kind === "character") && d.src);
  return hit?.src;
}

function incomingCamera(
  id: string,
  getNode: (id: string) => StudioNode | undefined,
  edges: { source: string; target: string }[],
) {
  return edges
    .filter((e) => e.target === id)
    .map((e) => getNode(e.source)?.data)
    .filter((d) => d?.kind === "camera" && d.semanticDescription)
    .map((d) => d!.semanticDescription!)
    .join("; ");
}

function incomingRefs(id: string, getNode: (id: string) => StudioNode | undefined, edges: { source: string; target: string }[]) {
  const ups = edges.filter((e) => e.target === id).map((e) => getNode(e.source)?.data).filter(Boolean);
  const characters = ups.filter((d) => d!.kind === "character" && d!.src);
  const character = characters[0];
  const products = ups.filter((d) => d!.kind === "product" && d!.src);
  const product = products[0];
  const images = ups.filter((d) => d!.kind === "image" && d!.src);
  const image = images[0];
  return { character, characters, product, products, image, images, ups };
}

function aspectFrame(aspect?: string) {
  if (aspect === "3:2") return "aspect-[3/2]";
  switch (parseImageAspect(aspect)) {
    case "16:9":
      return "aspect-video";
    case "1:1":
      return "aspect-square";
    case "3:4":
      return "aspect-[3/4]";
    case "4:5":
      return "aspect-[4/5]";
    default:
      return "aspect-[9/16]";
  }
}

function plateAspect(src?: string) {
  if (!src) return "3:4";
  if (/-studio-sheet(?:\.|$)/i.test(src)) return "3:2";
  if (/-(front|back|side)(?:\.|$)/i.test(src)) return "9:16";
  if (/-(three_quarter|3-4|3_4)/i.test(src)) return "3:4";
  if (/-(headshot|close)(?:\.|$)/i.test(src)) return "3:4";
  return "3:4";
}

function incomingMotion(id: string, getNode: (id: string) => StudioNode | undefined, edges: { source: string; target: string }[]) {
  const hit = edges
    .filter((e) => e.target === id)
    .map((e) => getNode(e.source)?.data)
    .find((d) => (d?.kind === "video" || d?.kind === "motion") && d.src);
  return hit?.src;
}

type EngineOpt = {
  id: string;
  name: string;
  status: "ready" | "coming";
  kind: string;
  useFor?: string;
  tip?: string;
};

function NodeDelete({ id }: { id: string }) {
  const { deleteElements } = useReactFlow();
  return (
    <button
      type="button"
      title="Delete node"
      className="nodrag absolute -right-2 -top-2 z-30 grid h-6 w-6 place-items-center rounded-full border border-white/20 bg-[#1c1f27] text-white/80 shadow hover:bg-[#B91C1C] hover:text-white"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void deleteElements({ nodes: [{ id }] });
      }}
    >
      <X size={12} />
    </button>
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <div className="nodrag nowheel px-2 pb-2">
      <p className="select-text break-words text-[9px] leading-snug text-red-400">{message}</p>
      <button
        type="button"
        className="mt-0.5 text-[9px] font-semibold text-white/45 hover:text-white"
        onClick={() => void navigator.clipboard.writeText(message)}
      >
        Copy error
      </button>
    </div>
  );
}

const IDENTITY = IDENTITY_PLATE_PROMPT;

const STUDIO_IMAGE_IDS = [
  "qwen-image-2.1",
  "qwen-image-2.1-gguf",
  "qwen-image-2.1-viggle",
  "gpt-image-2.5-flare",
  "grok-imagine",
  "grok-imagine-tryon",
  "kling-image-omni",
  "kolors-virtual-try-on",
  "marketing-studio-image",
  "gpt-image-2.5",
  "seedream-5-pro",
  "seedream-5-lite",
  "seedream-4-5",
  "muse-image-1.0",
  "qwen-image-3.0",
  "nano-banana",
  "gpt-image-2",

  "flux2-klein-4b",
];

const STUDIO_ART = PRESET_CATEGORIES.find((c) => c.id === "texture")?.options || [];
const STUDIO_SCENE = PRESET_CATEGORIES.find((c) => c.id === "background")?.options || [];
const STUDIO_LIGHT = PRESET_CATEGORIES.find((c) => c.id === "light")?.options || [];

function studioLookParts(p?: { art?: string; scene?: string; weather?: string }) {
  return {
    place: p?.scene ? presetPrompt("architecture", p.scene) || presetPrompt("landscape", p.scene) : "",
    light: p?.weather ? presetPrompt("weather", p.weather) : "",
    style: p?.art ? presetPrompt("art-style", p.art) : "editorial lookbook, garment-first, full outfit in frame",
  };
}

function studioStyleLine(p?: { art?: string; scene?: string; weather?: string }) {
  const { place, light, style } = studioLookParts(p);
  return [place, light, style].filter(Boolean).join(". ");
}

type PresentDetails = {
  title: string;
  character?: string;
  product?: string;
  engine?: string;
  aspect?: string;
  camera?: string;
  art?: string;
  scene?: string;
  light?: string;
  prompt?: string;
};

function PresentStill({ src, details, onClose }: { src: string; details: PresentDetails; onClose: () => void }) {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  if (!ready) return null;
  const rows: [string, string][] = [
    ["Node", details.title],
    ["Character", details.character || "—"],
    ["Product", details.product || "—"],
    ["Engine", details.engine || "—"],
    ["Aspect", details.aspect || "—"],
    ["Camera", details.camera || "—"],
    ["Scene", details.scene || "Catalog"],
    ["Light", details.light || "Even"],
    ["Style", details.art || "Lookbook"],
  ];
  return createPortal(
    <div className="nodrag nowheel fixed inset-0 z-[90] p-3 sm:p-6" onPointerDown={(e) => e.stopPropagation()}>
      <button type="button" className="absolute inset-0 bg-black/80" onClick={onClose} aria-label="Close" />
      <div className="relative mx-auto flex h-full max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#12151c] shadow-2xl lg:flex-row">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-full bg-black/70 text-white hover:bg-black"
          title="Close"
        >
          <X size={16} />
        </button>
        <div className="flex min-h-0 flex-1 items-center justify-center bg-black p-4 lg:p-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" className="max-h-[70vh] max-w-full object-contain lg:max-h-[86vh]" />
        </div>
        <aside className="max-h-[34vh] shrink-0 overflow-y-auto border-t border-white/10 p-4 lg:max-h-none lg:w-[300px] lg:border-l lg:border-t-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">Preview detail</p>
          <dl className="mt-3 space-y-2.5">
            {rows.map(([k, v]) => (
              <div key={k}>
                <dt className="text-[10px] uppercase tracking-wide text-white/35">{k}</dt>
                <dd className="mt-0.5 text-[12px] font-semibold leading-snug text-white/90">{v}</dd>
              </div>
            ))}
          </dl>
          {details.prompt ? (
            <div className="mt-4">
              <p className="text-[10px] uppercase tracking-wide text-white/35">Prompt</p>
              <p className="mt-1 whitespace-pre-wrap text-[11px] leading-snug text-white/70">{details.prompt}</p>
            </div>
          ) : null}
          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex rounded-lg bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/15"
          >
            Open original
          </a>
        </aside>
      </div>
    </div>,
    document.body,
  );
}

export function MediaNode({ id, data, selected }: NodeProps<StudioNode>) {
  const video = data.kind === "video" || data.kind === "motion";
  const { getNode, getEdges, setNodes } = useReactFlow();
  const updateNodeInternals = useUpdateNodeInternals();
  const [busy, setBusy] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  const [present, setPresent] = useState(false);
  const [imageEngines, setImageEngines] = useState<EngineOpt[]>([]);
  const [openModel, setOpenModel] = useState(false);
  const [openPrompt, setOpenPrompt] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function patch(src: string, extra?: Partial<StudioNodeData>) {
    setNodes((ns) =>
      ns.map((n) =>
        n.id === id
          ? { ...n, data: { ...n.data, ...extra, src, status: "completed", error: undefined } }
          : n,
      ),
    );
  }

  function patchData(partial: Partial<StudioNodeData>) {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...partial } } : n)));
  }

  useEffect(() => {
    if (data.kind !== "image") return;
    fetch("/api/settings/engines")
      .then((r) => r.json())
      .then((j) => {
        const byId = new Map((j.engines as EngineOpt[]).map((e) => [e.id, e]));
        const list = STUDIO_IMAGE_IDS.map((id) => byId.get(id)).filter((e): e is EngineOpt => Boolean(e && e.kind === "image"));
        setImageEngines(list);
        const current = list.find((e) => e.id === data.engineId);
        if (!current || current.status !== "ready") {
          const ready = list.find((e) => e.status === "ready" && e.id !== "marketing-studio-image") || list.find((e) => e.status === "ready");
          if (ready) patchData({ engineId: ready.id });
        }
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, data.kind]);

  useEffect(() => {
    if (typeof updateNodeInternals !== "function") return;
    const t = requestAnimationFrame(() => updateNodeInternals(id));
    return () => cancelAnimationFrame(t);
  }, [id, openModel, openPrompt, data.body, data.aspect, data.src, updateNodeInternals]);

  useEffect(() => {
    if (!lockOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLockOpen(false);
    }
    function onDown(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      if (t?.closest("[data-lock-menu]")) return;
      setLockOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [lockOpen]);

  async function generate() {
    setBusy(true);
    const edges = getEdges();
    const get = (nid: string) => getNode(nid) as StudioNode | undefined;
    try {
      if (data.kind === "character") {
        const prompt = incomingText(id, get, edges) || IDENTITY;
        const res = await fetch("/api/jobs/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, nodeId: id, lock: true, aspect: data.aspect || "9:16" }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || json.status);
        patch(json.mediaUrl);
      } else if (data.kind === "image") {
        const refs = incomingRefs(id, get, edges);
        const productLabel = refs.products.map((p) => p!.label).filter(Boolean).join(", ") || refs.product?.label;
        const cam = incomingCamera(id, get, edges);
        const look = studioLookParts(data.presets);
        const style = studioStyleLine(data.presets);
        const charNames = refs.characters.map((c) => c!.label).filter(Boolean);
        const sheetLock =
          refs.character?.lockMode === "sheet" || /studio-sheet/i.test(refs.character?.src || "");
        const fallback = studioImagePrompt({
          character: refs.character?.label,
          characters: charNames,
          product: productLabel,
          camera: cam,
          place: look.place,
          light: look.light,
          style: look.style,
          aspect: data.aspect || "9:16",
          sheet: sheetLock,
        });
        let prompt = stripI2vScreenplay(incomingText(id, get, edges, data.body));
        if (!prompt.trim()) {
          prompt = fallback;
          if (prompt) patchData({ body: prompt });
        } else if (productLabel && !/wear|wearing|on-model|garment|outfit/i.test(prompt)) {
          prompt = `${refs.character?.label || "The character"} wearing the exact ${productLabel}. ${prompt}`;
        }
        if (cam && prompt && !/CAMERA:/i.test(prompt)) prompt = `CAMERA: ${cam}. ${prompt}`;
        if (style && prompt && !prompt.includes(style.slice(0, 24))) prompt = `${prompt}\n${style}`;
        if (refs.products.length > 1) {
          prompt = `${prompt}\nWear/hold every attached product in one shot: ${refs.products.map((p) => p!.label).join(", ")}. One person.`;
        }
        if (!prompt.trim()) throw new Error("Wire Character + Product, or type a prompt.");
        const referenceUrl = refs.character?.src || refs.image?.src || incomingImage(id, get, edges);
        const extraUrls = [
          ...refs.characters.map((c) => c!.src!).filter((u) => u && u !== referenceUrl),
          ...refs.products.map((p) => p!.src!).filter((u) => u && u !== referenceUrl),
        ];
        const engineId =
          refs.character?.src && refs.product?.src
            ? "qwen-image-2.1"
            : data.engineId || imageEngines.find((e) => e.status === "ready")?.id || "qwen-image-2.1";
        const res = await fetch("/api/jobs/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt,
            nodeId: id,
            referenceUrl,
            extraUrl: extraUrls[0],
            extraUrls,
            aspect: data.aspect || "9:16",
            engineId,
            characterId: refs.character?.characterId,
            productId: refs.product?.productId,
            source: "studio",
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || json.status);
        patch(json.mediaUrl);
      } else if (data.kind === "motion" || data.kind === "video") {
        const refs = incomingRefs(id, get, edges);
        const imageUrl = refs.image?.src || refs.character?.src || incomingImage(id, get, edges);
        if (!imageUrl) throw new Error("Wire Character (or Compose still) into I2V. SKU pack is Image 2, not the first frame.");
        const extraUrls = [
          ...refs.characters.map((c) => c!.src!).filter((u) => u && u !== imageUrl),
          ...refs.products.map((p) => p!.src!).filter((u) => u && u !== imageUrl),
          ...refs.images.map((im) => im!.src!).filter((u) => u && u !== imageUrl),
        ].filter((u, i, a) => a.indexOf(u) === i);
        const motionUrl = incomingMotion(id, get, edges);
        let prompt = incomingText(id, get, edges, data.body);
        if (!prompt.trim()) {
          const auto = await fetch("/api/studio/auto-prompt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: "video",
              character: refs.character?.label || (refs.product ? "faceless product motion, no face" : undefined),
              product: refs.product?.label,
            }),
          }).then((r) => r.json());
          prompt = auto.prompt || "";
        }
        const res = await fetch("/api/jobs/motion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageUrl,
            extraUrls,
            motionUrl,
            prompt,
            nodeId: id,
            engineId: motionUrl ? "seedance-2-5-extend" : data.engineId || "seedance-2-5",
            durationSec: data.durationSec,
            sound: data.sound,
            characterId: refs.character?.characterId,
            productId: refs.product?.productId,
            source: "studio",
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || json.status);
        patch(json.mediaUrl);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setNodes((ns) =>
        ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, status: "failed", error: message } } : n)),
      );
    } finally {
      setBusy(false);
    }
  }

  async function lockFile(file: File) {
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      if (data.kind === "product") form.append("kind", "product");
      const res = await fetch(data.kind === "product" ? "/api/media/upload" : "/api/characters/lock", {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.status);
      const label = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim();
      patch(json.mediaUrl, data.kind === "product" ? { label: label || "Upload" } : undefined);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setNodes((ns) =>
        ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, status: "failed", error: message } } : n)),
      );
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    function onRun(e: Event) {
      if ((e as CustomEvent<{ id?: string }>).detail?.id === id) void generate();
    }
    window.addEventListener(STUDIO_RUN, onRun);
    return () => window.removeEventListener(STUDIO_RUN, onRun);
  });

  const canGen = data.kind === "image" || data.kind === "video" || data.kind === "motion" || data.kind === "character";
  const product = data.kind === "product";
  const liveRefs =
    data.kind === "image"
      ? incomingRefs(id, (nid) => getNode(nid) as StudioNode | undefined, getEdges())
      : null;
  const liveCam = incomingCamera(id, (nid) => getNode(nid) as StudioNode | undefined, getEdges());
  const liveLook = studioLookParts(data.presets);
  const livePrompt = liveRefs
    ? studioImagePrompt({
        character: liveRefs.character?.label,
        characters: liveRefs.characters.map((c) => c!.label).filter(Boolean),
        product: liveRefs.products.map((p) => p!.label).filter(Boolean).join(", ") || liveRefs.product?.label,
        camera: liveCam,
        place: liveLook.place,
        light: liveLook.light,
        style: liveLook.style,
        aspect: data.aspect || "9:16",
        sheet: liveRefs.character?.lockMode === "sheet" || /studio-sheet/i.test(liveRefs.character?.src || ""),
      })
    : "";
  const imageEngineId = data.engineId || imageEngines.find((e) => e.status === "ready")?.id || "";

  return (
    <div
      className={cn(
        "relative overflow-visible rounded-2xl border border-white/10 bg-[#16181f] shadow-lg",
        product ? "w-[280px]" : data.kind === "image" ? "w-[248px]" : "w-[220px]",
      )}
    >
      {selected ? <NodeDelete id={id} /> : null}
      {data.kind === "product" && lockOpen ? (
        <ProductLockMenu
          onPick={(hit) => {
            patch(hit.url, { productId: hit.productId, label: hit.name });
            setLockOpen(false);
          }}
          onUpload={() => {
            setLockOpen(false);
            fileRef.current?.click();
          }}
          onClose={() => setLockOpen(false)}
        />
      ) : null}
      {data.kind === "image" || data.kind === "video" || data.kind === "motion" ? (
        <>
          <Port type="target" position={Position.Top} id="prompt-input" />
          <Port type="target" position={Position.Left} id="ref-input" />
        </>
      ) : (
        <Port type="target" position={Position.Left} id="ref-input" />
      )}
      {present && data.src ? (
        <PresentStill
          src={data.src}
          onClose={() => setPresent(false)}
          details={{
            title: data.label,
            character: liveRefs?.character?.label,
            product: liveRefs?.products.map((p) => p!.label).filter(Boolean).join(", ") || liveRefs?.product?.label || (product ? data.label : undefined),
            engine: imageEngines.find((e) => e.id === imageEngineId)?.name || imageEngineId,
            aspect: data.aspect || "9:16",
            camera: liveCam || undefined,
            art: data.presets?.art ? presetLabel("art-style", data.presets.art) : "Lookbook",
            scene: data.presets?.scene
              ? presetLabel("architecture", data.presets.scene) || presetLabel("landscape", data.presets.scene)
              : undefined,
            light: data.presets?.weather ? presetLabel("weather", data.presets.weather) : undefined,
            prompt: data.body || livePrompt || undefined,
          }}
        />
      ) : null}
      <div
        className={cn(
          "relative grid w-full place-items-center overflow-hidden rounded-t-2xl",
          product
            ? "h-[280px] bg-white"
            : cn(
                "bg-[#07080b]",
                aspectFrame(
                  data.kind === "image"
                    ? data.aspect || "9:16"
                    : data.kind === "character"
                      ? plateAspect(data.src)
                      : data.aspect || "9:16",
                ),
              ),
        )}
      >
        {data.src && !video ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product || data.kind === "image" || data.kind === "character" ? thumbSrc(data.src, 720) : data.src}
            alt=""
            className={cn(
              "max-h-full max-w-full",
              product || data.kind === "image" || data.kind === "character" ? "object-contain" : "object-cover",
            )}
          />
        ) : data.src && video ? (
          <video src={data.src} className="max-h-full max-w-full object-contain" muted loop autoPlay playsInline />
        ) : (
          <div
            className={cn(
              "flex h-full items-center justify-center text-[10px] tracking-[0.16em]",
              product ? "text-black/35" : "text-white/30",
            )}
          >
            {data.kind === "character"
              ? "CHARACTER"
              : data.kind === "product"
                ? "PRODUCT"
                : data.kind === "motion"
                  ? "MOTION"
                  : video
                    ? "VIDEO"
                    : "IMAGE"}
          </div>
        )}
        {data.src && (data.kind === "image" || data.kind === "character" || product) ? (
          <button
            type="button"
            title="Preview"
            className="nodrag absolute inset-0"
            onClick={() => setPresent(true)}
          />
        ) : null}
      </div>
      <div className="relative flex items-center justify-between gap-1 px-2 py-1.5">
        <p
          className={cn(
            "min-w-0",
            product
              ? "line-clamp-2 text-[12px] font-semibold leading-snug text-white/85"
              : "truncate text-[9px] uppercase tracking-[0.14em] text-white/35",
          )}
        >
          {data.label}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {data.kind === "character" || data.kind === "product" ? (
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void lockFile(f);
                e.target.value = "";
              }}
            />
          ) : null}
          {data.kind === "product" ? (
            <button
              type="button"
              data-lock-menu
              onClick={() => setLockOpen((open) => !open)}
              disabled={busy}
              className="nodrag rounded-md border border-white/15 px-1.5 py-0.5 text-[9px] text-white/70 disabled:opacity-50"
            >
              SKU
            </button>
          ) : null}
          {data.kind === "character" ? (
            <>
              {lockOpen ? (
                <CharacterLockMenu
                  mode={data.lockMode === "sheet" ? "sheet" : "one"}
                  onPick={(hit) => {
                    patch(hit.url, {
                      characterId: hit.characterId,
                      label: hit.name,
                      lockMode: hit.lockMode || "one",
                    });
                    setLockOpen(false);
                  }}
                  onUpload={() => {
                    setLockOpen(false);
                    fileRef.current?.click();
                  }}
                  onClose={() => setLockOpen(false)}
                />
              ) : null}
              <button
                type="button"
                data-lock-menu
                onClick={() => setLockOpen((open) => !open)}
                disabled={busy}
                className="nodrag rounded-md border border-white/15 px-1.5 py-0.5 text-[9px] text-white/70 disabled:opacity-50"
              >
                LOCK
              </button>
            </>
          ) : null}
          {canGen ? (
            <button
              type="button"
              onClick={generate}
              disabled={busy}
              className="rounded-md bg-[#652DFF] px-2 py-0.5 text-[9px] font-semibold tracking-wide text-white disabled:opacity-50"
            >
              {busy ? "…" : "GEN"}
            </button>
          ) : null}
        </div>
      </div>
      {data.kind === "image" ? (
        <div className="nodrag mx-2 mb-2 space-y-1">
          <label className="flex items-center justify-between text-[9px] text-white/45">
            Aspect
            <select
              value={data.aspect || "9:16"}
              onChange={(e) => patchData({ aspect: e.target.value })}
              className="rounded border border-white/15 bg-[#0c0e12] px-1 py-0.5 text-[9px] text-white/80"
            >
              {IMAGE_ASPECTS.map((ratio) => (
                <option key={ratio} value={ratio}>
                  {ratio}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setOpenModel((v) => !v)}
            className="flex w-full items-center justify-between rounded-md border border-white/10 bg-black/30 px-1.5 py-1 text-left text-[10px] text-white/75"
          >
            <span className="truncate">
              Model · {imageEngines.find((e) => e.id === imageEngineId)?.name || "Qwen Image 2.1"}
            </span>
            <ChevronDown size={12} className={cn("shrink-0 transition", openModel && "rotate-180")} />
          </button>
          {openModel ? (
            <div className="space-y-1 rounded-md border border-white/10 bg-black/40 p-1.5">
              <select
                value={imageEngineId}
                onChange={(e) => patchData({ engineId: e.target.value })}
                title={imageEngines.find((e) => e.id === imageEngineId)?.tip || "Stills engine"}
                className="w-full rounded-md border border-white/10 bg-[#0c0e12] px-1.5 py-1 text-[10px] text-white"
              >
                {imageEngines.length ? (
                  imageEngines.map((e) => (
                    <option key={e.id} value={e.id} disabled={e.status !== "ready"} title={e.tip}>
                      {e.name}
                      {e.useFor ? ` — ${e.useFor}` : ""}
                      {e.status !== "ready" ? " · key" : ""}
                    </option>
                  ))
                ) : (
                  <option value="qwen-image-2.1">Qwen Image 2.1</option>
                )}
              </select>
              {imageEngines.find((e) => e.id === imageEngineId)?.tip ? (
                <p className="text-[9px] leading-snug text-white/45">{imageEngines.find((e) => e.id === imageEngineId)?.tip}</p>
              ) : null}
              <select
                value={data.presets?.scene || ""}
                onChange={(e) => patchData({ presets: { ...data.presets, scene: e.target.value || undefined } })}
                className="w-full rounded-md border border-white/10 bg-[#0c0e12] px-1.5 py-1 text-[10px] text-white"
              >
                <option value="">Scene · catalog</option>
                {STUDIO_SCENE.map((o) => (
                  <option key={o.id} value={o.id}>
                    Scene · {o.label}
                  </option>
                ))}
              </select>
              <select
                value={data.presets?.weather || ""}
                onChange={(e) => patchData({ presets: { ...data.presets, weather: e.target.value || undefined } })}
                className="w-full rounded-md border border-white/10 bg-[#0c0e12] px-1.5 py-1 text-[10px] text-white"
              >
                <option value="">Light · even</option>
                {STUDIO_LIGHT.map((o) => (
                  <option key={o.id} value={o.id}>
                    Light · {o.label}
                  </option>
                ))}
              </select>
              <select
                value={data.presets?.art || "lookbook"}
                onChange={(e) => patchData({ presets: { ...data.presets, art: e.target.value } })}
                className="w-full rounded-md border border-white/10 bg-[#0c0e12] px-1.5 py-1 text-[10px] text-white"
              >
                {STUDIO_ART.map((o) => (
                  <option key={o.id} value={o.id}>
                    Style · {o.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setOpenPrompt((v) => !v)}
            className="flex w-full items-center justify-between rounded-md border border-white/10 bg-black/30 px-1.5 py-1 text-left text-[10px] text-white/75"
          >
            <span className="truncate">Prompt{data.body?.trim() ? " · custom" : " · auto"}</span>
            <ChevronDown size={12} className={cn("shrink-0 transition", openPrompt && "rotate-180")} />
          </button>
          {openPrompt ? (
            <textarea
              value={data.body || ""}
              onChange={(e) => {
                patchData({ body: e.target.value });
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${el.scrollHeight}px`;
              }}
              onFocus={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.max(el.scrollHeight, 160)}px`;
                if (typeof updateNodeInternals === "function") updateNodeInternals(id);
              }}
              ref={(el) => {
                if (!el) return;
                el.style.height = "auto";
                el.style.height = `${Math.max(el.scrollHeight, 160)}px`;
              }}
              rows={8}
              placeholder={livePrompt || "Prompt kosong = character wearing the locked SKU"}
              className="nodrag w-full overflow-hidden rounded-md border border-white/10 bg-[#0c0e12] px-1.5 py-1.5 text-[10px] leading-snug text-white/80 outline-none"
            />
          ) : null}
        </div>
      ) : null}
      {data.error ? <ErrorLine message={data.error} /> : null}
      <Port
        type="source"
        position={Position.Right}
        id={data.kind === "image" ? "generator-output" : "ref-output"}
      />
    </div>
  );
}

export function TextNode({ id, data, selected }: NodeProps<StudioNode>) {
  const { setNodes } = useReactFlow();
  return (
    <div className="relative w-[184px] rounded-2xl border border-white/10 bg-[#16181f] px-2.5 py-2 shadow-lg">
      {selected ? <NodeDelete id={id} /> : null}
      <Port type="target" position={Position.Left} id="prompt-input" />
      <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-white/35">{data.label}</p>
      <textarea
        value={data.body || ""}
        onChange={(e) =>
          setNodes((ns) =>
            ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, body: e.target.value } } : n)),
          )
        }
        rows={6}
        spellCheck={false}
        className="nodrag nowheel w-full resize-none rounded-md bg-black/35 p-1.5 text-[11px] leading-snug text-white/75 outline-none"
        placeholder="Prompt…"
      />
      <Port type="source" position={Position.Right} id="prompt-output" />
    </div>
  );
}

export function VideoGeneratorNode({ id, data, selected }: NodeProps<StudioNode>) {
  const { getNode, getEdges, setNodes } = useReactFlow();
  const [busy, setBusy] = useState(false);
  const [engines, setEngines] = useState<EngineOpt[]>([]);
  const duration = data.durationSec ?? 5;
  const sound = Boolean(data.sound);
  const engineId =
    data.engineId === "ffmpeg-preview" ||
    data.engineId === "kling-3-0" ||
    data.engineId === "kling-2-6" ||
    data.engineId === "dreamactor-v2" ||
    !data.engineId
      ? "seedance-2-5"
      : data.engineId;

  useEffect(() => {
    fetch("/api/settings/engines")
      .then((r) => r.json())
      .then((j) => {
        const list = (j.engines as EngineOpt[]).filter(
          (e) =>
            e.kind === "motion" &&
            (e.id === "seedance-2-5" ||
              e.id === "seedance-2-5-extend" ||
              e.id === "kling-3-0-std" ||
              e.id === "wan-3-0" ||
              e.id === "wan-3-0-std" ||
              e.id === "grok-imagine-video" ||
              e.id === "minimax-h3"),
        );
        setEngines(list);
        if (!data.engineId || data.engineId === "kling-3-0" || data.engineId === "kling-2-6" || data.engineId === "dreamactor-v2") {
          setNodes((ns) =>
            ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, engineId: "seedance-2-5" } } : n)),
          );
        }
      })
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function patchData(partial: Partial<StudioNodeData>) {
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...partial } } : n)));
  }

  useEffect(() => {
    function onRun(e: Event) {
      if ((e as CustomEvent<{ id?: string }>).detail?.id === id) void generate();
    }
    window.addEventListener(STUDIO_RUN, onRun);
    return () => window.removeEventListener(STUDIO_RUN, onRun);
  });

  async function generate() {
    setBusy(true);
    patchData({ error: undefined, status: "running" });
    const edges = getEdges();
    const get = (nid: string) => getNode(nid) as StudioNode | undefined;
    try {
      const refs = incomingRefs(id, get, edges);
      const imageUrl = refs.image?.src || refs.character?.src || incomingImage(id, get, edges);
      const motionUrl = incomingMotion(id, get, edges);
      const cam = incomingCamera(id, get, edges);
      const still = refs.image;
      const stillId = edges.find((e) => e.target === id && get(e.source)?.data.kind === "image")?.source;
      const fromStill = stillId ? incomingRefs(stillId, get, edges) : refs;
      const extraUrls = [
        ...refs.characters.map((c) => c!.src!).filter((u) => u && u !== imageUrl),
        ...refs.products.map((p) => p!.src!).filter((u) => u && u !== imageUrl),
        ...fromStill.products.map((p) => p!.src!).filter((u) => u && u !== imageUrl),
        ...fromStill.characters.map((c) => c!.src!).filter((u) => u && u !== imageUrl),
        ...refs.images.map((im) => im!.src!).filter((u) => u && u !== imageUrl),
      ].filter((u, i, a) => a.indexOf(u) === i);
      const charNames = [
        ...fromStill.characters.map((c) => c!.label).filter(Boolean),
        ...refs.characters.map((c) => c!.label).filter(Boolean),
      ].filter((n, i, a) => a.indexOf(n) === i);
      const productLabel = fromStill.product?.label || refs.product?.label;
      const aspect = data.aspect || still?.aspect || "9:16";
      const fallback = studioVideoPrompt({
        character: fromStill.character?.label || refs.character?.label,
        characters: charNames,
        product: productLabel,
        scene: cam,
        aspect,
        durationSec: duration,
      });
      let prompt = incomingText(id, get, edges, data.body);
      if (!imageUrl) throw new Error("Wire a Compose still into this I2V node first.");
      if (!prompt.trim() || /on-model still|Image 1 is .*(FACE \+ SKIN|FACE lock)/i.test(prompt)) {
        prompt = fallback;
        if (prompt) patchData({ body: prompt, aspect });
      }
      if (cam && !/CAMERA:/i.test(prompt)) prompt = `${prompt}\nCAMERA: ${cam}. Keep that angle; no sudden orbit.`;
      const res = await fetch("/api/jobs/motion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl,
          extraUrls,
          motionUrl,
          prompt,
          nodeId: id,
          engineId,
          durationSec: duration,
          sound,
          aspect,
          characterId: fromStill.character?.characterId || refs.character?.characterId,
          productId: fromStill.product?.productId || refs.product?.productId,
          source: "studio",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.status);
      if (json.status === "running" || res.status === 202) {
        const job = await pollJob(json.id);
        if (job.status === "failed") throw new Error(job.error || "failed");
        patchData({ src: job.mediaUrl, status: "completed", error: undefined });
        return;
      }
      patchData({ src: json.mediaUrl, status: "completed", error: undefined });
    } catch (err) {
      patchData({ status: "failed", error: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  const liveEdges = getEdges();
  const liveGet = (nid: string) => getNode(nid) as StudioNode | undefined;
  const liveRefs = incomingRefs(id, liveGet, liveEdges);
  const liveStillId = liveEdges.find((e) => e.target === id && liveGet(e.source)?.data.kind === "image")?.source;
  const liveFromStill = liveStillId ? incomingRefs(liveStillId, liveGet, liveEdges) : liveRefs;
  const liveCharNames = [
    ...liveFromStill.characters.map((c) => c!.label).filter(Boolean),
    ...liveRefs.characters.map((c) => c!.label).filter(Boolean),
  ].filter((n, i, a) => a.indexOf(n) === i);
  const liveAspect = data.aspect || liveRefs.image?.aspect || "9:16";
  const liveVideoPrompt = studioVideoPrompt({
    character: liveFromStill.character?.label || liveRefs.character?.label,
    characters: liveCharNames,
    product: liveFromStill.product?.label || liveRefs.product?.label,
    scene: incomingCamera(id, liveGet, liveEdges),
    aspect: liveAspect,
    durationSec: duration,
  });

  return (
    <div className="relative w-[220px] overflow-visible rounded-2xl border border-white/10 bg-[#16181f] shadow-lg">
      {selected ? <NodeDelete id={id} /> : null}
      <Port type="target" position={Position.Top} id="prompt-input" />
      <Port type="target" position={Position.Left} id="ref-input" />
      <div className={cn("relative grid w-full place-items-center overflow-hidden bg-[#07080b]", aspectFrame(liveAspect))}>
        {data.src ? (
          <video src={data.src} className="max-h-full max-w-full object-contain" muted loop autoPlay playsInline />
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] tracking-[0.16em] text-white/25">
            VIDEO
          </div>
        )}
      </div>
      <div className="nodrag space-y-1.5 p-2">
        <select
          value={engineId}
          onChange={(e) => patchData({ engineId: e.target.value })}
          title={engines.find((e) => e.id === engineId)?.tip || ""}
          className="w-full rounded-md border border-white/10 bg-black/40 px-1.5 py-1 text-[10px] text-white"
        >
          {engines.length ? (
            engines.map((e) => (
              <option key={e.id} value={e.id} disabled={e.status !== "ready"} title={e.tip}>
                {e.name}
                {e.useFor ? ` — ${e.useFor}` : ""}
                {e.status !== "ready" ? " · soon" : ""}
              </option>
            ))
          ) : (
            <option value="wan-3-0">Wan 3.0 — Studio I2V</option>
          )}
        </select>
        {engines.find((e) => e.id === engineId)?.tip ? (
          <p className="text-[9px] leading-snug text-white/45">{engines.find((e) => e.id === engineId)?.tip}</p>
        ) : null}
        <div className="flex items-center gap-1">
          <div className="flex items-center rounded-full border border-white/10 bg-black/30">
            <button
              type="button"
              className="px-1.5 py-0.5 text-[11px] text-white/70"
              onClick={() => patchData({ durationSec: Math.max(2, duration - 1) })}
            >
              −
            </button>
            <span className="min-w-[1.8rem] text-center text-[10px] font-semibold text-[#2ee59d]">{duration}s</span>
            <button
              type="button"
              className="px-1.5 py-0.5 text-[11px] text-white/70"
              onClick={() =>
                patchData({
                  durationSec: Math.min(engineId === "ltx-2" ? 3 : engineId.startsWith("wan-3-0") ? 30 : 15, duration + 1),
                })
              }
            >
              +
            </button>
          </div>
          <select
            value={liveAspect}
            onChange={(e) => patchData({ aspect: e.target.value })}
            className="rounded-md border border-white/10 bg-black/40 px-1 py-0.5 text-[10px] text-white"
          >
            {IMAGE_ASPECTS.map((ratio) => (
              <option key={ratio} value={ratio}>
                {ratio}
              </option>
            ))}
          </select>
          <span className="rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-white/50">
            {engineId.startsWith("wan-3-0") || engineId.startsWith("seedance") ? "720p" : "480p"}
          </span>
        </div>
        <textarea
          value={data.body || ""}
          onChange={(e) => patchData({ body: e.target.value })}
          rows={4}
          placeholder={liveVideoPrompt || "I2V prompt — kosong = motion beats otomatis"}
          className="nowheel w-full resize-none rounded-md border border-white/10 bg-[#0c0e12] px-1.5 py-1 text-[10px] leading-snug text-white/80 outline-none"
        />
        {liveCharNames.length <= 1 ? (
          <p className="text-[9px] leading-snug text-white/40">
            I2V follows the wired still. One still = one person. For 3 talent in one clip, compose a group still first (wire AOI + Kim + Amanda into one Image node).
          </p>
        ) : (
          <p className="text-[9px] leading-snug text-[#2ee59d]/80">Group clip: {liveCharNames.join(", ")}</p>
        )}
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => patchData({ sound: !sound })}
            className="flex items-center gap-1 text-[10px] text-white/60"
          >
            <span className={`h-1.5 w-1.5 rounded-full ${sound ? "bg-[#2ee59d]" : "bg-white/20"}`} />
            Sound
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void generate()}
            className="flex items-center gap-1 rounded-md bg-[#652DFF] px-2 py-0.5 text-[10px] font-semibold text-white disabled:opacity-50"
          >
            <Sparkles size={11} />
            {busy ? "…" : "Generate"}
          </button>
        </div>
        {data.error ? <ErrorLine message={data.error} /> : null}
      </div>
      <Port type="source" position={Position.Right} id="generator-output" />
    </div>
  );
}

const CAMERAS = [
  "Front view, Eye-level, Medium shot",
  "Front view, Low-angle (looking up), Medium shot",
  "Front-right quarter, Eye-level, Medium close-up",
  "Right side profile, Eye-level, Medium shot",
  "Back view, Eye-level, Medium shot",
  "Front view, Eye-level, Close-up",
];

export function CameraNode({ id, data, selected }: NodeProps<StudioNode>) {
  const { setNodes } = useReactFlow();
  const value = data.semanticDescription || CAMERAS[0];
  return (
    <div className="relative w-[220px] rounded-2xl border border-white/10 bg-[#16181f] px-2.5 py-2 shadow-lg">
      {selected ? <NodeDelete id={id} /> : null}
      <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-white/35">Camera</p>
      <select
        value={value}
        onChange={(e) =>
          setNodes((ns) =>
            ns.map((n) =>
              n.id === id
                ? { ...n, data: { ...n.data, semanticDescription: e.target.value, label: "Camera" } }
                : n,
            ),
          )
        }
        className="nodrag w-full rounded-md border border-white/10 bg-black/40 px-1.5 py-1 text-[10px] text-white"
      >
        {CAMERAS.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <p className="mt-1 text-[9px] leading-snug text-white/40">Wires into still or I2V as CAMERA line. TVC = same still, new angle, then Autoflow I2V.</p>
      <Port type="source" position={Position.Right} id="camera-output" />
    </div>
  );
}

export const nodeTypes = {
  media: MediaNode,
  avatar: MediaNode,
  product: MediaNode,
  text: TextNode,
  video: VideoGeneratorNode,
  camera: CameraNode,
};
