"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Camera, Package, Play, Plus, Save, UserRound, Video, type LucideIcon } from "lucide-react";
import { STUDIO_RUN, nodeTypes, type StudioNode } from "./nodes";

const STORAGE = "creatoros.studio.workflow.v12";
const COL = 252;
const TEAL = "#2ee59d";
const VIOLET = "#7c6cff";

function i2v(id: string, x: number, y: number, label: string, aspect = "9:16"): StudioNode {
  return {
    id,
    type: "video",
    position: { x, y },
    data: {
      kind: "motion",
      label,
      durationSec: 6,
      aspect,
      resolution: "720p",
      sound: true,
      engineId: "wan-3-0-std",
    },
  };
}

function edge(id: string, source: string, target: string, kind: "ref" | "prompt" | "out", color: string): Edge {
  const sourceHandle = kind === "prompt" ? "prompt-output" : kind === "out" ? "generator-output" : "ref-output";
  const targetHandle = kind === "prompt" ? "prompt-input" : "ref-input";
  return { id, source, target, sourceHandle, targetHandle, style: { stroke: color } };
}

/** Product + one talent. */
function onModelGraph(): { nodes: StudioNode[]; edges: Edge[] } {
  return {
    nodes: [
      { id: "product", type: "product", position: { x: 40, y: 320 }, data: { kind: "product", label: "Product" } },
      { id: "character", type: "avatar", position: { x: 40, y: 80 }, data: { kind: "character", label: "Character" } },
      { id: "image", type: "media", position: { x: 300, y: 180 }, data: { kind: "image", label: "On-model" } },
      i2v("video", 560, 160, "UGC I2V"),
    ],
    edges: [
      edge("e-p-i", "product", "image", "ref", TEAL),
      edge("e-c-i", "character", "image", "ref", VIOLET),
      edge("e-i-v", "image", "video", "out", VIOLET),
    ],
  };
}

/** Product only: pack + hands, no face. */
function facelessGraph(): { nodes: StudioNode[]; edges: Edge[] } {
  return {
    nodes: [
      { id: "product", type: "product", position: { x: 40, y: 280 }, data: { kind: "product", label: "Product" } },
      { id: "img-pack", type: "media", position: { x: 300, y: 80 }, data: { kind: "image", label: "Pack / hero" } },
      { id: "img-hands", type: "media", position: { x: 300, y: 420 }, data: { kind: "image", label: "Hands / demo" } },
      i2v("vid-pack", 560, 60, "Faceless pack"),
      i2v("vid-hands", 560, 400, "Faceless demo"),
    ],
    edges: [
      edge("e-p-pack", "product", "img-pack", "ref", TEAL),
      edge("e-p-hands", "product", "img-hands", "ref", TEAL),
      edge("e-pack-v", "img-pack", "vid-pack", "out", VIOLET),
      edge("e-hands-v", "img-hands", "vid-hands", "out", VIOLET),
    ],
  };
}

/** One SKU, many talent + one faceless pack/hands branch. */
function skuPackGraph(): { nodes: StudioNode[]; edges: Edge[] } {
  const y = [40, 280, 520, 760];
  const chars = ["A", "B", "C"];
  const nodes: StudioNode[] = [
    { id: "product", type: "product", position: { x: 40, y: 360 }, data: { kind: "product", label: "Product" } },
  ];
  const edges: Edge[] = [];
  chars.forEach((tag, i) => {
    const c = `char-${tag}`;
    const img = `img-${tag}`;
    const vid = `vid-${tag}`;
    nodes.push(
      { id: c, type: "avatar", position: { x: 280, y: y[i]! }, data: { kind: "character", label: `Talent ${tag}` } },
      { id: img, type: "media", position: { x: 520, y: y[i]! }, data: { kind: "image", label: `On-model ${tag}` } },
      i2v(vid, 760, y[i]!, `UGC ${tag}`),
    );
    edges.push(
      edge(`e-p-${tag}`, "product", img, "ref", TEAL),
      edge(`e-c-${tag}`, c, img, "ref", VIOLET),
      edge(`e-i-${tag}`, img, vid, "out", VIOLET),
    );
  });
  nodes.push(
    { id: "img-face", type: "media", position: { x: 520, y: y[3]! }, data: { kind: "image", label: "Faceless pack" } },
    i2v("vid-face", 760, y[3]!, "Faceless I2V"),
  );
  edges.push(edge("e-p-face", "product", "img-face", "ref", TEAL), edge("e-i-face", "img-face", "vid-face", "out", VIOLET));
  return { nodes, edges };
}

const seeded = skuPackGraph();
const initialNodes = seeded.nodes;
const initialEdges = seeded.edges;

export function StudioCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const [wfName, setWfName] = useState("product-ugc");
  const [wfList, setWfList] = useState<{ id: string; name: string; updatedAt: string }[]>([]);
  const [flowBusy, setFlowBusy] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { nodes: StudioNode[]; edges: Edge[] };
      if (parsed.nodes?.length) {
        setNodes(
          parsed.nodes.map((n) => {
            if (n.data?.kind !== "motion" && n.data?.kind !== "video") return n;
            const copy = ["kling-2-6", "kling-3-0", "dreamactor-v2"].includes(n.data.engineId || "");
            if (!copy && n.data.engineId) return n;
            return { ...n, data: { ...n.data, engineId: "minimax-h3", resolution: n.data.resolution || "480p" } };
          }),
        );
      }
      if (parsed.edges?.length) setEdges(parsed.edges);
    } catch {
      /* keep defaults */
    }
  }, [setEdges, setNodes]);

  useEffect(() => {
    localStorage.setItem(STORAGE, JSON.stringify({ nodes, edges }));
  }, [nodes, edges]);

  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => addEdge({ ...c, style: { stroke: TEAL } }, eds)),
    [setEdges],
  );

  const addNode = useCallback(
    (kind: StudioNode["data"]["kind"]) => {
      const id = `${kind}-${Date.now()}`;
      setNodes((ns) => [
        ...ns,
        {
          id,
          type:
            kind === "text"
              ? "text"
              : kind === "motion" || kind === "video"
                ? "video"
                : kind === "camera"
                  ? "camera"
                  : kind === "character"
                    ? "avatar"
                    : kind === "product"
                      ? "product"
                      : "media",
          position: {
            x: 48 + COL * ((ns.length % 4) + 1),
            y: 24 + Math.floor(ns.length / 4) * 48,
          },
          data: {
            kind,
            label:
              kind === "text"
                ? "Prompt"
                : kind === "character"
                  ? "Character"
                  : kind === "product"
                    ? "Product"
                    : kind === "camera"
                      ? "Camera"
                      : kind === "motion" || kind === "video"
                        ? "I2V"
                        : "Compose",
            semanticDescription: kind === "camera" ? "Front view, Eye-level, Medium shot" : undefined,
            body: kind === "text" ? "Prompt…" : undefined,
            durationSec: kind === "motion" || kind === "video" ? 6 : undefined,
            aspect: "9:16",
            resolution: kind === "motion" || kind === "video" ? "720p" : "768p",
            sound: kind === "motion" || kind === "video" ? true : false,
            engineId: kind === "motion" || kind === "video" ? "wan-3-0-std" : undefined,
          },
        },
      ]);
    },
    [setNodes],
  );

  async function refreshWf() {
    const res = await fetch("/api/studio/workflows");
    const json = (await res.json()) as { workflows?: { id: string; name: string; updatedAt: string }[] };
    setWfList(json.workflows || []);
  }

  useEffect(() => {
    void refreshWf();
  }, []);

  async function saveWf() {
    setFlowBusy("save");
    try {
      await fetch("/api/studio/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: wfName, nodes, edges }),
      });
      await refreshWf();
    } finally {
      setFlowBusy("");
    }
  }

  async function loadWf(id: string) {
    if (!id) return;
    const res = await fetch(`/api/studio/workflows?id=${encodeURIComponent(id)}`);
    const json = (await res.json()) as { nodes?: StudioNode[]; edges?: Edge[]; name?: string; error?: string };
    if (!res.ok || !json.nodes) return;
    setNodes(json.nodes);
    setEdges(json.edges || []);
    if (json.name) setWfName(json.name);
  }

  function waitNode(id: string) {
    return new Promise<void>((resolve, reject) => {
      const t0 = Date.now();
      const t = window.setInterval(() => {
        const n = nodesRef.current.find((x) => x.id === id);
        if (n?.data.status === "failed") {
          window.clearInterval(t);
          reject(new Error(n.data.error || "node failed"));
        }
        if (n?.data.src && n.data.status !== "running") {
          window.clearInterval(t);
          resolve();
        }
        if (Date.now() - t0 > 12 * 60_000) {
          window.clearInterval(t);
          reject(new Error("autoflow timeout"));
        }
      }, 500);
    });
  }

  async function autoflow() {
    setFlowBusy("flow");
    try {
      const images = nodesRef.current.filter((n) => n.data.kind === "image" && !n.data.src);
      const videos = nodesRef.current.filter((n) => (n.data.kind === "video" || n.data.kind === "motion") && !n.data.src);
      for (const n of [...images, ...videos]) {
        window.dispatchEvent(new CustomEvent(STUDIO_RUN, { detail: { id: n.id } }));
        await waitNode(n.id);
      }
    } finally {
      setFlowBusy("");
    }
  }

  const loadPack = useCallback(
    (kind: "on-model" | "faceless" | "keroyok") => {
      const g = kind === "faceless" ? facelessGraph() : kind === "on-model" ? onModelGraph() : skuPackGraph();
      setNodes(g.nodes);
      setEdges(g.edges);
    },
    [setEdges, setNodes],
  );

  const types = useMemo(() => nodeTypes, []);

  return (
    <div className="relative h-[calc(100vh-45px)] w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={types}
        fitView
        fitViewOptions={{ padding: 0.18, maxZoom: 1 }}
        minZoom={0.35}
        maxZoom={1.4}
        snapToGrid
        snapGrid={[8, 8]}
        colorMode="dark"
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          type: "default",
          style: { strokeWidth: 1.4 },
        }}
        connectionLineStyle={{ stroke: TEAL, strokeWidth: 1.4 }}
        className="!bg-[#0e1014]"
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#252a34" />
        <Controls
          showInteractive={false}
          position="bottom-left"
          className="!m-4 !shadow-none [&>button]:!border-white/10 [&>button]:!bg-[#12151c] [&>button]:!text-white/80"
        />
      </ReactFlow>

      <div className="pointer-events-none absolute left-3 top-[42%] z-10 -translate-y-1/2">
        <div className="pointer-events-auto flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#12151c]/95 shadow-lg">
          <RailBtn icon={UserRound} label="" onClick={() => addNode("character")} title="Character" />
          <RailBtn icon={Package} label="" onClick={() => addNode("product")} title="Product" />
          <RailBtn icon={Plus} label="" onClick={() => addNode("image")} title="Compose still" />
          <RailBtn icon={Camera} label="" onClick={() => addNode("camera")} title="Camera" />
          <RailBtn icon={Video} label="" onClick={() => addNode("motion")} title="I2V" />
        </div>
      </div>

      <div className="pointer-events-none absolute left-16 top-3 z-10">
        <div className="pointer-events-auto flex overflow-hidden rounded-full border border-white/10 bg-[#12151c]/95 text-[10px] font-semibold tracking-wide">
          <button type="button" onClick={() => loadPack("keroyok")} className="px-3 py-1.5 text-white/70 hover:bg-white/5 hover:text-white">
            Product × talent + faceless
          </button>
          <button type="button" onClick={() => loadPack("on-model")} className="border-l border-white/10 px-3 py-1.5 text-white/70 hover:bg-white/5 hover:text-white">
            On-model
          </button>
          <button type="button" onClick={() => loadPack("faceless")} className="border-l border-white/10 px-3 py-1.5 text-white/70 hover:bg-white/5 hover:text-white">
            Faceless UGC
          </button>
        </div>
      </div>

      <div className="pointer-events-none absolute right-3 top-3 z-10">
        <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/10 bg-[#12151c]/95 px-2 py-1">
          <input
            value={wfName}
            onChange={(e) => setWfName(e.target.value)}
            className="w-28 bg-transparent px-1 text-[10px] text-white/80 outline-none"
            placeholder="workflow name"
          />
          <button type="button" disabled={Boolean(flowBusy)} onClick={() => void saveWf()} className="rounded-md px-2 py-1 text-[10px] text-white/70 hover:bg-white/10" title="Save named workflow">
            <Save size={12} />
          </button>
          <select
            value=""
            onChange={(e) => {
              const id = e.target.value;
              if (id) void loadWf(id);
            }}
            className="max-w-[9rem] rounded-md bg-transparent text-[10px] text-white/70 outline-none"
          >
            <option value="">Load…</option>
            {wfList.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={Boolean(flowBusy)}
            onClick={() => void autoflow()}
            className="flex items-center gap-1 rounded-md bg-[#652DFF] px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-50"
            title="Run stills then I2V in order"
          >
            <Play size={11} />
            {flowBusy === "flow" ? "Autoflow…" : "Autoflow"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RailBtn({
  icon: Icon,
  label,
  onClick,
  title,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex h-10 w-10 items-center justify-center text-white/55 hover:bg-white/5 hover:text-white"
    >
      <Icon size={15} />
      {label}
    </button>
  );
}
