"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  Panel,
  ReactFlow,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Camera, Package, Play, Plus, Save, UserRound, Video, type LucideIcon } from "lucide-react";
import { CharacterLockMenu, ProductLockMenu, type CharacterLockMode } from "./CharacterLockMenu";
import { STUDIO_RUN, nodeTypes, type StudioNode } from "./nodes";
import { StudioTakes } from "./StudioTakes";

const STORAGE = "creatoros.studio.workflow.v15";
const COL = 360;
const ROW = 760;
const TEAL = "#2ee59d";
const VIOLET = "#7c6cff";

const GRID_X: Record<string, number> = {
  product: 48,
  character: 360,
  image: 680,
  video: 1040,
  "char-A": 360,
  "img-A": 680,
  "vid-A": 1040,
  "char-B": 360,
  "img-B": 680,
  "vid-B": 1040,
  "char-C": 360,
  "img-C": 680,
  "vid-C": 1040,
  "img-face": 680,
  "vid-face": 1040,
  "img-pack": 360,
  "vid-pack": 720,
  "img-hands": 360,
  "vid-hands": 720,
};

const GRID_Y: Record<string, number> = {
  product: 48 + ROW,
  character: 48,
  image: 80,
  video: 80,
  "char-A": 48,
  "img-A": 48,
  "vid-A": 48,
  "char-B": 48 + ROW,
  "img-B": 48 + ROW,
  "vid-B": 48 + ROW,
  "char-C": 48 + ROW * 2,
  "img-C": 48 + ROW * 2,
  "vid-C": 48 + ROW * 2,
  "img-face": 48 + ROW * 3,
  "vid-face": 48 + ROW * 3,
  "img-pack": 48,
  "vid-pack": 48,
  "img-hands": 48 + ROW,
  "vid-hands": 48 + ROW,
};

function spaceNodes(nodes: StudioNode[]): StudioNode[] {
  return nodes.map((n) => {
    const x = GRID_X[n.id];
    const y = GRID_Y[n.id];
    if (x == null || y == null) return n;
    return { ...n, position: { x, y } };
  });
}

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
      engineId: "seedance-2-5",
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
    nodes: spaceNodes([
      { id: "product", type: "product", position: { x: 0, y: 0 }, data: { kind: "product", label: "Product" } },
      { id: "character", type: "avatar", position: { x: 0, y: 0 }, data: { kind: "character", label: "Character" } },
      { id: "image", type: "media", position: { x: 0, y: 0 }, data: { kind: "image", label: "On-model" } },
      i2v("video", 0, 0, "UGC I2V"),
    ]),
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
    nodes: spaceNodes([
      { id: "product", type: "product", position: { x: 0, y: 0 }, data: { kind: "product", label: "Product" } },
      { id: "img-pack", type: "media", position: { x: 0, y: 0 }, data: { kind: "image", label: "Pack / hero" } },
      { id: "img-hands", type: "media", position: { x: 0, y: 0 }, data: { kind: "image", label: "Hands / demo" } },
      i2v("vid-pack", 0, 0, "Faceless pack"),
      i2v("vid-hands", 0, 0, "Faceless demo"),
    ]),
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
  const chars = ["A", "B", "C"];
  const nodes: StudioNode[] = [{ id: "product", type: "product", position: { x: 0, y: 0 }, data: { kind: "product", label: "Product" } }];
  const edges: Edge[] = [];
  chars.forEach((tag) => {
    const c = `char-${tag}`;
    const img = `img-${tag}`;
    const vid = `vid-${tag}`;
    nodes.push(
      { id: c, type: "avatar", position: { x: 0, y: 0 }, data: { kind: "character", label: `Talent ${tag}` } },
      { id: img, type: "media", position: { x: 0, y: 0 }, data: { kind: "image", label: `On-model ${tag}` } },
      i2v(vid, 0, 0, `UGC ${tag}`),
    );
    edges.push(
      edge(`e-p-${tag}`, "product", img, "ref", TEAL),
      edge(`e-c-${tag}`, c, img, "ref", VIOLET),
      edge(`e-i-${tag}`, img, vid, "out", VIOLET),
    );
  });
  nodes.push(
    { id: "img-face", type: "media", position: { x: 0, y: 0 }, data: { kind: "image", label: "Faceless pack" } },
    i2v("vid-face", 0, 0, "Faceless I2V"),
  );
  edges.push(edge("e-p-face", "product", "img-face", "ref", TEAL), edge("e-i-face", "img-face", "vid-face", "out", VIOLET));
  return { nodes: spaceNodes(nodes), edges };
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
  const [wfId, setWfId] = useState<string | null>(null);
  const [wfList, setWfList] = useState<{ id: string; name: string; updatedAt: string }[]>([]);
  const [flowBusy, setFlowBusy] = useState("");
  const [charAdd, setCharAdd] = useState<null | "menu" | CharacterLockMode>(null);
  const [skuAdd, setSkuAdd] = useState(false);
  const charFileRef = useRef<HTMLInputElement>(null);
  const skuFileRef = useRef<HTMLInputElement>(null);
  const saveAbort = useRef<AbortController | null>(null);
  const skipAutoSave = useRef(true);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { nodes: StudioNode[]; edges: Edge[]; wfId?: string; wfName?: string };
      if (parsed.wfId) setWfId(parsed.wfId);
      if (parsed.wfName) setWfName(parsed.wfName);
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
    localStorage.setItem(STORAGE, JSON.stringify({ nodes, edges, wfId, wfName }));
  }, [nodes, edges, wfId, wfName]);

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
            engineId: kind === "motion" || kind === "video" ? "seedance-2-5" : undefined,
          },
        },
      ]);
    },
    [setNodes],
  );

  const addSkuCompose = useCallback(
    (hit: { url: string; name: string; productId: string }) => {
      const t = Date.now();
      const pid = `product-${t}`;
      const iid = `image-${t}`;
      setNodes((ns) => {
        const x = 48 + COL * ((ns.length % 4) + 1);
        const y = 24 + Math.floor(ns.length / 4) * 48;
        return [
          ...ns,
          {
            id: pid,
            type: "product",
            position: { x, y },
            data: { kind: "product", label: hit.name, src: hit.url, productId: hit.productId },
          },
          {
            id: iid,
            type: "media",
            position: { x: x + 320, y },
            data: { kind: "image", label: "Compose", aspect: "9:16" },
          },
        ];
      });
      setEdges((es) => {
        const next = [...es, edge(`e-${pid}-${iid}`, pid, iid, "ref", TEAL)];
        const char = nodesRef.current.find((n) => n.data.kind === "character" && n.data.src);
        if (char) next.push(edge(`e-${char.id}-${iid}`, char.id, iid, "ref", VIOLET));
        return next;
      });
      setSkuAdd(false);
    },
    [setEdges, setNodes],
  );

  const addLockedCharacter = useCallback(
    (hit: { url: string; name: string; characterId: string; lockMode?: CharacterLockMode }) => {
      const id = `character-${Date.now()}`;
      setNodes((ns) => [
        ...ns,
        {
          id,
          type: "avatar",
          position: {
            x: 48 + COL * ((ns.length % 4) + 1),
            y: 24 + Math.floor(ns.length / 4) * 48,
          },
          data: {
            kind: "character",
            label: hit.name,
            src: hit.url,
            characterId: hit.characterId,
            lockMode: hit.lockMode || "one",
            aspect: hit.lockMode === "sheet" ? "3:2" : "3:4",
          },
        },
      ]);
      setCharAdd(null);
    },
    [setNodes],
  );

  useEffect(() => {
    if (charAdd !== "menu") return;
    function onDown(e: MouseEvent) {
      const t = e.target as HTMLElement | null;
      if (t?.closest("[data-char-add]")) return;
      setCharAdd(null);
    }
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [charAdd]);

  async function refreshWf() {
    try {
      const res = await fetch("/api/studio/workflows");
      if (!res.ok) return;
      const json = (await res.json()) as { workflows?: { id: string; name: string; updatedAt: string }[] };
      setWfList(json.workflows || []);
    } catch {
      /* offline / HMR */
    }
  }

  useEffect(() => {
    void (async () => {
      skipAutoSave.current = true;
      await refreshWf();
      try {
        const res = await fetch("/api/studio/workflows");
        if (!res.ok) return;
        const json = (await res.json()) as { workflows?: { id: string; name: string }[] };
        const named = (json.workflows || []).filter((w) => w.name && w.name !== "product-ugc");
        if (named[0]?.id) await loadWf(named[0].id);
      } catch {
        /* keep local canvas */
      } finally {
        window.setTimeout(() => {
          skipAutoSave.current = false;
        }, 1500);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (skipAutoSave.current) return;
    if (!wfId) return;
    if (!wfName.trim() || wfName === "product-ugc") return;
    const t = window.setTimeout(() => {
      void saveWf(true);
    }, 2500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, wfId, wfName]);

  async function saveWf(quiet = false) {
    if (!quiet) setFlowBusy("save");
    saveAbort.current?.abort();
    const ac = new AbortController();
    saveAbort.current = ac;
    try {
      const payload = {
        id: wfId || undefined,
        name: wfName,
        nodes: nodes.map(({ id, type, position, data }) => ({ id, type, position, data })),
        edges: edges.map(({ id, source, target, sourceHandle, targetHandle, style }) => ({
          id,
          source,
          target,
          sourceHandle,
          targetHandle,
          style,
        })),
      };
      const res = await fetch("/api/studio/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ac.signal,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || `Save HTTP ${res.status}`);
      }
      const json = (await res.json()) as { id?: string };
      if (json.id && json.id !== wfId) setWfId(json.id);
      await refreshWf();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (quiet) return;
      setFlowBusy("");
      window.alert(err instanceof Error ? err.message : "Save failed");
    } finally {
      if (!quiet) setFlowBusy("");
    }
  }

  async function loadWf(id: string) {
    if (!id) return;
    skipAutoSave.current = true;
    try {
      const res = await fetch(`/api/studio/workflows?id=${encodeURIComponent(id)}`);
      if (!res.ok) return;
      const json = (await res.json()) as { id?: string; nodes?: StudioNode[]; edges?: Edge[]; name?: string; error?: string };
      if (!json.nodes) return;
      setNodes(spaceNodes(json.nodes));
      setEdges(json.edges || []);
      if (json.id) setWfId(json.id);
      if (json.name) setWfName(json.name);
    } catch {
      /* keep current graph */
    } finally {
      window.setTimeout(() => {
        skipAutoSave.current = false;
      }, 1500);
    }
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
      setWfId(null);
      setWfName("product-ugc");
      setNodes(g.nodes);
      setEdges(g.edges);
    },
    [setEdges, setNodes],
  );

  const types = useMemo(() => nodeTypes, []);
  const selectedCount = nodes.filter((n) => n.selected).length;
  const takeChars = [...new Set(nodes.map((n) => n.data.characterId).filter(Boolean))] as string[];
  const takeSkus = [...new Set(nodes.map((n) => n.data.productId).filter(Boolean))] as string[];
  const takeNames = [...new Set(nodes.map((n) => n.data.label).filter((s) => s && s !== "Product" && s !== "Character" && !s.startsWith("On-model") && !s.startsWith("UGC") && s !== "Talent A" && s !== "I2V"))] as string[];

  return (
    <div className="relative h-full min-h-0 w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={types}
        deleteKeyCode={["Backspace", "Delete"]}
        multiSelectionKeyCode="Shift"
        fitView
        fitViewOptions={{ padding: 0.22, maxZoom: 0.85 }}
        minZoom={0.25}
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
          className="!mb-28 !ml-14 !shadow-none [&>button]:!border-white/10 [&>button]:!bg-[#12151c] [&>button]:!text-white/80"
        />
        <Panel position="top-center" className="!m-3">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-[#12151c]/95 px-2 py-1.5 shadow-lg">
            <select
              defaultValue=""
              onChange={(e) => {
                const v = e.target.value as "keroyok" | "on-model" | "faceless" | "";
                if (v) loadPack(v);
                e.currentTarget.value = "";
              }}
              className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-white/80 outline-none"
            >
              <option value="">New graph…</option>
              <option value="keroyok">SKU × talent</option>
              <option value="on-model">On-model</option>
              <option value="faceless">Faceless</option>
            </select>
            <span className="h-4 w-px bg-white/10" />
            <input
              value={wfName}
              onChange={(e) => setWfName(e.target.value)}
              className="w-40 bg-transparent px-1.5 text-[12px] font-medium text-white/90 outline-none"
              placeholder="Canvas name"
            />
            <button
              type="button"
              disabled={Boolean(flowBusy)}
              onClick={() => void saveWf()}
              className="rounded-lg px-2 py-1 text-[11px] text-white/70 hover:bg-white/10"
              title="Save"
            >
              <Save size={13} />
            </button>
            <select
              value={wfId || ""}
              onChange={(e) => {
                const id = e.target.value;
                if (id) void loadWf(id);
              }}
              className="max-w-[12rem] rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[11px] text-white/80 outline-none"
            >
              <option value="" disabled>
                Open…
              </option>
              {wfList.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            {selectedCount ? (
              <button
                type="button"
                title="Delete selected nodes"
                onClick={() => {
                  const ids = new Set(nodes.filter((n) => n.selected).map((n) => n.id));
                  setNodes((ns) => ns.filter((n) => !ids.has(n.id)));
                  setEdges((es) => es.filter((e) => !ids.has(e.source) && !ids.has(e.target)));
                }}
                className="rounded-lg px-2 py-1 text-[11px] font-semibold text-[#FCA5A5] hover:bg-white/10"
              >
                Delete {selectedCount}
              </button>
            ) : null}
            <button
              type="button"
              disabled={Boolean(flowBusy)}
              onClick={() => void autoflow()}
              className="ml-1 flex items-center gap-1 rounded-lg bg-[#652DFF] px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-50"
              title="Run stills then I2V in order"
            >
              <Play size={12} />
              {flowBusy === "flow" ? "Running…" : "Autoflow"}
            </button>
          </div>
        </Panel>
      </ReactFlow>
      <StudioTakes
        characterIds={takeChars}
        productIds={takeSkus}
        names={takeNames}
        srcs={nodes.map((n) => n.data.src).filter(Boolean) as string[]}
        onDeleted={(_id, url) => {
          if (!url) return;
          setNodes((ns) =>
            ns.map((n) => (n.data.src === url ? { ...n, data: { ...n.data, src: undefined, status: undefined } } : n)),
          );
        }}
      />

      <div className="pointer-events-none absolute left-3 top-16 z-10">
        <div className="pointer-events-auto relative flex flex-col overflow-visible">
          <div data-char-add className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#12151c]/95 shadow-lg">
            <RailBtn
              icon={UserRound}
              label=""
              onClick={() => {
                setSkuAdd(false);
                setCharAdd((v) => (v ? null : "menu"));
              }}
              title="Character"
            />
            <RailBtn icon={Package} label="" onClick={() => addNode("product")} title="Product" />
            <RailBtn
              icon={Plus}
              label=""
              onClick={() => {
                setCharAdd(null);
                setSkuAdd((v) => !v);
              }}
              title="Compose still"
            />
            <RailBtn icon={Camera} label="" onClick={() => addNode("camera")} title="Camera" />
            <RailBtn icon={Video} label="" onClick={() => addNode("motion")} title="I2V" />
          </div>
          {charAdd === "menu" ? (
            <div
              data-char-add
              className="absolute left-12 top-0 z-20 w-[200px] overflow-hidden rounded-xl border border-white/15 bg-[#1c1f27] shadow-xl"
            >
              <button
                type="button"
                onClick={() => setCharAdd("one")}
                className="block w-full px-3 py-2 text-left hover:bg-white/5"
              >
                <span className="block text-[12px] font-semibold text-white">1 plate</span>
                <span className="block text-[10px] text-white/45">Headshot or full body</span>
              </button>
              <button
                type="button"
                onClick={() => setCharAdd("sheet")}
                className="block w-full border-t border-white/10 px-3 py-2 text-left hover:bg-white/5"
              >
                <span className="block text-[12px] font-semibold text-white">2 plates · 1 image</span>
                <span className="block text-[10px] text-white/45">Headshot + full body sheet</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
      {skuAdd ? (
        <ProductLockMenu
          onPick={addSkuCompose}
          onUpload={() => {
            setSkuAdd(false);
            skuFileRef.current?.click();
          }}
          onClose={() => setSkuAdd(false)}
        />
      ) : null}
      {charAdd === "one" || charAdd === "sheet" ? (
        <CharacterLockMenu
          mode={charAdd}
          onPick={addLockedCharacter}
          onUpload={() => {
            setCharAdd(null);
            charFileRef.current?.click();
          }}
          onClose={() => setCharAdd(null)}
        />
      ) : null}
      <input
        ref={charFileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          const form = new FormData();
          form.append("file", f);
          void fetch("/api/characters/lock", { method: "POST", body: form })
            .then((r) => r.json())
            .then((j) => {
              if (!j.mediaUrl) return;
              addLockedCharacter({
                url: j.mediaUrl,
                name: "Upload",
                characterId: "",
                lockMode: "one",
              });
            })
            .catch(() => undefined);
        }}
      />
      <input
        ref={skuFileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          const form = new FormData();
          form.append("file", f);
          form.append("kind", "product");
          const label = f.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "Upload";
          void fetch("/api/media/upload", { method: "POST", body: form })
            .then((r) => r.json())
            .then((j) => {
              if (!j.mediaUrl) return;
              addSkuCompose({ url: j.mediaUrl, name: label, productId: j.id || "" });
            })
            .catch(() => undefined);
        }}
      />
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
