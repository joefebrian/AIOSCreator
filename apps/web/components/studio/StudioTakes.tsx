"use client";

import { Download, Minus, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { thumbSrc } from "@/lib/media-url";

const HIDE_KEY = "creatoros.studio.takesHidden";

type Take = {
  id: string;
  kind?: string;
  status?: string;
  mediaUrl?: string;
  model?: string;
  characterId?: string;
  productId?: string;
  source?: string;
  nodeId?: string;
  input?: string;
  createdAt?: string;
};

function isStudioTake(j: Take, srcs: string[]) {
  if (j.kind !== "image" && j.kind !== "motion") return false;
  if (j.source === "studio" || j.nodeId) return true;
  const blob = `${j.input || ""} ${j.mediaUrl || ""}`;
  if (/\/api\/media\/characters\//i.test(blob)) return false;
  if (j.source && j.source !== "studio") return false;
  if (srcs.includes(j.mediaUrl || "")) return /\/api\/media\/(images|products)\//i.test(blob) || j.kind === "image";
  return /\/api\/media\/images\//i.test(blob) || Boolean(j.productId);
}

async function downloadFile(url: string, id: string) {
  const href = url.startsWith("/api/media/") ? (url.includes("?") ? `${url}&download=1` : `${url}?download=1`) : url;
  const res = await fetch(href);
  const blob = await res.blob();
  const name = url.split("/").pop()?.split("?")[0] || `${id}.bin`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function StudioTakes({
  srcs,
  onDeleted,
}: {
  characterIds: string[];
  productIds: string[];
  names: string[];
  srcs: string[];
  onDeleted?: (id: string, url?: string) => void;
}) {
  const [jobs, setJobs] = useState<Take[]>([]);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    try {
      setHidden(window.localStorage.getItem(HIDE_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = () => {
      fetch("/api/jobs")
        .then((r) => r.json())
        .then((j) => {
          if (!alive) return;
          setJobs(((j.jobs || []) as Take[]).filter((x) => x.status === "completed" && x.mediaUrl));
        })
        .catch(() => undefined);
    };
    tick();
    const id = window.setInterval(tick, 8000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const takes = useMemo(() => jobs.filter((j) => isStudioTake(j, srcs)).slice(0, 24), [jobs, srcs]);

  function toggle() {
    setHidden((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(HIDE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  if (hidden) {
    return (
      <button
        type="button"
        onClick={toggle}
        className="pointer-events-auto absolute bottom-2 left-16 z-10 flex items-center gap-1.5 rounded-full border border-white/10 bg-[#12151c]/95 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55 hover:text-white"
        title="Show takes"
      >
        <Plus size={12} />
        Takes{takes.length ? ` · ${takes.length}` : ""}
      </button>
    );
  }

  return (
    <div className="pointer-events-auto absolute bottom-2 left-16 right-4 z-10 overflow-hidden rounded-xl border border-white/10 bg-[#12151c]/95">
      <div className="flex items-center justify-between px-3 py-1.5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
          Takes{takes.length ? ` · ${takes.length}` : ""} · AI Studio
        </p>
        <button
          type="button"
          onClick={toggle}
          title="Hide takes"
          className="grid h-6 w-6 place-items-center rounded-md text-white/50 hover:bg-white/10 hover:text-white"
        >
          <Minus size={14} />
        </button>
      </div>
      {takes.length ? (
        <div className="flex gap-2 overflow-x-auto px-3 pb-2">
          {takes.map((t) => {
            const video = t.kind === "motion" || /\.mp4($|\?)/i.test(t.mediaUrl || "");
            return (
              <div key={t.id} className="relative h-20 w-14 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black">
                <a href={t.mediaUrl} target="_blank" rel="noreferrer" title={t.model || t.kind} className="block h-full w-full">
                  {video ? (
                    <video src={t.mediaUrl} className="h-full w-full object-cover" muted playsInline />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbSrc(t.mediaUrl || "", 160)} alt="" className="h-full w-full object-cover" />
                  )}
                </a>
                <div className="absolute bottom-0.5 right-0.5 flex gap-0.5">
                  <button
                    type="button"
                    title="Download"
                    className="grid h-5 w-5 place-items-center rounded bg-white text-[#111827] ring-1 ring-[#E6E8EE] hover:bg-[#F3F4F8]"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (t.mediaUrl) void downloadFile(t.mediaUrl, t.id);
                    }}
                  >
                    <Download size={11} />
                  </button>
                  <button
                    type="button"
                    title="Delete"
                    className="grid h-5 w-5 place-items-center rounded bg-black/70 text-[#FCA5A5] hover:bg-[#7F1D1D] hover:text-white"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void (async () => {
                        const res = await fetch(`/api/jobs/${t.id}`, { method: "DELETE" });
                        if (!res.ok) return;
                        setJobs((prev) => prev.filter((j) => j.id !== t.id));
                        onDeleted?.(t.id, t.mediaUrl);
                      })();
                    }}
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="px-3 pb-2 text-[11px] text-white/40">Only clips and stills generated on this canvas.</p>
      )}
    </div>
  );
}
