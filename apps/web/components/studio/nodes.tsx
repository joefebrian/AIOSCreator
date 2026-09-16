"use client";

import { Handle, Position, useReactFlow, type Node, type NodeProps } from "@xyflow/react";
import { Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { IDENTITY_PLATE_PROMPT } from "@/lib/character-prompts";
import { pollJob } from "@/lib/http";
import { IMAGE_ASPECTS } from "@/lib/image-aspect";
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
  productId?: string;
  semanticDescription?: string;
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
    .find((d) => (d?.kind === "image" || d?.kind === "character" || d?.kind === "product") && d.src);
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
  const character = ups.find((d) => d!.kind === "character" && d!.src);
  const products = ups.filter((d) => d!.kind === "product" && d!.src);
  const product = products[0];
  const image = ups.find((d) => d!.kind === "image" && d!.src);
  return { character, product, products, image, ups };
}

function incomingMotion(id: string, getNode: (id: string) => StudioNode | undefined, edges: { source: string; target: string }[]) {
  const hit = edges
    .filter((e) => e.target === id)
    .map((e) => getNode(e.source)?.data)
    .find((d) => (d?.kind === "video" || d?.kind === "motion") && d.src);
  return hit?.src;
}

const IDENTITY = IDENTITY_PLATE_PROMPT;

export function MediaNode({ id, data }: NodeProps<StudioNode>) {
  const video = data.kind === "video" || data.kind === "motion";
  const { getNode, getEdges, setNodes } = useReactFlow();
  const [busy, setBusy] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
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
        let prompt = incomingText(id, get, edges, data.body);
        const cam = incomingCamera(id, get, edges);
        if (!prompt.trim()) {
          const auto = await fetch("/api/studio/auto-prompt", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: "image",
              character: refs.character?.label || (refs.product ? "faceless pack shot, no face, product only or hands-only" : undefined),
              product: refs.products.map((p) => p!.label).filter(Boolean).join(", ") || refs.product?.label,
              scene: cam,
            }),
          }).then((r) => r.json());
          prompt = auto.prompt || "";
        }
        if (refs.products.length > 1) {
          prompt = `${prompt}\nWear/hold every attached product in one shot: ${refs.products.map((p) => p!.label).join(", ")}. One person.`;
        }
        if (cam) prompt = `${prompt}\nCAMERA: ${cam}`;
        const referenceUrl = refs.character?.src || refs.image?.src || incomingImage(id, get, edges);
        const extraUrls = refs.products.map((p) => p!.src!).filter((u) => u && u !== referenceUrl);
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
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || json.status);
        patch(json.mediaUrl);
      } else if (data.kind === "motion" || data.kind === "video") {
        const refs = incomingRefs(id, get, edges);
        const imageUrl = refs.image?.src || incomingImage(id, get, edges);
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
            motionUrl,
            prompt,
            nodeId: id,
            engineId: data.engineId,
            durationSec: data.durationSec,
            sound: data.sound,
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
      const res = await fetch("/api/characters/lock", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.status);
      patch(json.mediaUrl);
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

  return (
    <div className="w-[220px] overflow-visible rounded-2xl border border-white/10 bg-[#16181f] shadow-lg">
      {data.kind === "image" || data.kind === "video" || data.kind === "motion" ? (
        <>
          <Port type="target" position={Position.Top} id="prompt-input" />
          <Port type="target" position={Position.Left} id="ref-input" />
        </>
      ) : (
        <Port type="target" position={Position.Left} id="ref-input" />
      )}
      <div className="relative h-[232px] overflow-hidden rounded-t-2xl bg-[#0c0e12]">
        {data.src && !video ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={data.src} alt="" className="h-full w-full object-cover" />
        ) : data.src && video ? (
          <video src={data.src} className="h-full w-full object-cover" muted loop autoPlay playsInline />
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] tracking-[0.16em] text-white/30">
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
      </div>
      <div className="relative flex items-center justify-between gap-1 px-2 py-1.5">
        <p className="truncate text-[9px] uppercase tracking-[0.14em] text-white/35">{data.label}</p>
        <div className="flex items-center gap-1">
          {data.kind === "product" ? (
            <>
              {lockOpen ? (
                <ProductLockMenu
                  onPick={(hit) => {
                    patch(hit.url, { productId: hit.productId, label: hit.name });
                    setLockOpen(false);
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
                SKU
              </button>
            </>
          ) : null}
          {data.kind === "character" ? (
            <>
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
              {lockOpen ? (
                <CharacterLockMenu
                  onPick={(hit) => {
                    patch(hit.url, { characterId: hit.characterId, label: hit.name });
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
      {data.kind === "image" || data.kind === "character" ? (
        <label className="nodrag mx-2 mb-1.5 flex items-center justify-between text-[9px] text-white/45">
          Aspect
          <select
            value={data.aspect || "9:16"}
            onChange={(e) =>
              setNodes((ns) =>
                ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, aspect: e.target.value } } : n)),
              )
            }
            className="rounded border border-white/15 bg-[#0c0e12] px-1 py-0.5 text-[9px] text-white/80"
          >
            {IMAGE_ASPECTS.map((ratio) => (
              <option key={ratio} value={ratio}>
                {ratio}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {data.kind === "image" ? (
        <textarea
          value={data.body || ""}
          onChange={(e) =>
            setNodes((ns) =>
              ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, body: e.target.value } } : n)),
            )
          }
          rows={3}
          placeholder="Prompt (kosong = auto dari product/character)"
          className="nodrag nowheel mx-2 mb-2 w-[calc(100%-16px)] resize-none rounded-md border border-white/10 bg-[#0c0e12] px-1.5 py-1 text-[10px] leading-snug text-white/80 outline-none"
        />
      ) : null}
      {data.error ? <p className="px-2 pb-2 text-[9px] leading-snug text-red-400">{data.error}</p> : null}
      <Port
        type="source"
        position={Position.Right}
        id={data.kind === "image" ? "generator-output" : "ref-output"}
      />
    </div>
  );
}

export function TextNode({ id, data }: NodeProps<StudioNode>) {
  const { setNodes } = useReactFlow();
  return (
    <div className="w-[184px] rounded-2xl border border-white/10 bg-[#16181f] px-2.5 py-2 shadow-lg">
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

type EngineOpt = {
  id: string;
  name: string;
  status: "ready" | "coming";
  kind: string;
  useFor?: string;
  tip?: string;
};

export function VideoGeneratorNode({ id, data }: NodeProps<StudioNode>) {
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
      ? "minimax-h3"
      : data.engineId;

  useEffect(() => {
    fetch("/api/settings/engines")
      .then((r) => r.json())
      .then((j) => {
        const list = (j.engines as EngineOpt[]).filter(
          (e) =>
            e.kind === "motion" &&
            (e.id === "wan-3-0" ||
              e.id === "wan-3-0-std" ||
              e.id === "minimax-h3" ||
              e.id === "wan-5b" ||
              e.id === "hunyuan-1.5" ||
              e.id === "ltx-2"),
        );
        setEngines(list);
        if (!data.engineId || data.engineId === "kling-3-0" || data.engineId === "kling-2-6" || data.engineId === "dreamactor-v2") {
          setNodes((ns) =>
            ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, engineId: "minimax-h3" } } : n)),
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
      const imageUrl = refs.image?.src || incomingImage(id, get, edges);
      const motionUrl = incomingMotion(id, get, edges);
      let prompt = incomingText(id, get, edges, data.body);
      const cam = incomingCamera(id, get, edges);
      if (!imageUrl) throw new Error("Wire a Compose still into this I2V node first.");
      if (!prompt.trim()) {
        const auto = await fetch("/api/studio/auto-prompt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "video",
            character: refs.character?.label || (refs.product ? "faceless product motion, no face" : undefined),
            product: refs.product?.label,
            scene: cam,
          }),
        }).then((r) => r.json());
        prompt = auto.prompt || "";
      }
      if (cam) prompt = `${prompt}\nCAMERA: ${cam}. Keep that angle; no sudden orbit.`;
      const res = await fetch("/api/jobs/motion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl,
          motionUrl,
          prompt,
          nodeId: id,
          engineId,
          durationSec: duration,
          sound,
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

  return (
    <div className="w-[184px] overflow-hidden rounded-2xl border border-white/10 bg-[#16181f] shadow-lg">
      <Port type="target" position={Position.Top} id="prompt-input" />
      <Port type="target" position={Position.Left} id="ref-input" />
      <div className="relative h-[168px] bg-[#0c0e12]">
        {data.src ? (
          <video src={data.src} className="h-full w-full object-cover" muted loop autoPlay playsInline />
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
          <span className="rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-white/50">9:16</span>
          <span className="rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-white/50">
            {engineId === "wan-3-0" ? "720p" : "480p"}
          </span>
        </div>
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
        {data.error ? <p className="text-[10px] leading-snug text-red-400">{data.error}</p> : null}
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

export function CameraNode({ id, data }: NodeProps<StudioNode>) {
  const { setNodes } = useReactFlow();
  const value = data.semanticDescription || CAMERAS[0];
  return (
    <div className="w-[220px] rounded-2xl border border-white/10 bg-[#16181f] px-2.5 py-2 shadow-lg">
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
