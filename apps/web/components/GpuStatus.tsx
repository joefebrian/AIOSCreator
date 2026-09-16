"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatElapsed } from "@/lib/http";
import { jobOccupiesGpu } from "@/lib/job-gpu";

type Gpu = {
  online: boolean | null;
  busy: boolean;
  label: string;
  elapsed: string;
};

const GpuCtx = createContext<Gpu>({ online: null, busy: false, label: "", elapsed: "" });

export function useGpu() {
  return useContext(GpuCtx);
}

function prettyModel(model?: string, kind?: string) {
  const m = (model || "").toLowerCase();
  if (m.includes("qwen")) return "Qwen Edit";
  if (m.includes("realesrgan") || m.includes("4k")) return "4K upscale";
  if (m.includes("h3") && m.includes("r2v")) return "H3 R2V";
  if (m.includes("h3")) return "H3 I2V";
  if (m.includes("klein")) return "Klein";
  if (m.includes("z-image") || m.includes("z_image")) return "Z-Image";
  if (kind === "motion") return "Motion";
  if (kind === "character") return "Character job";
  if (kind === "voice" || m.includes("voicestudio")) return "VoiceStudio VO";
  return model || kind || "job";
}

export function GpuProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [label, setLabel] = useState("");
  const [started, setStarted] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const c = await fetch("/api/comfy/status").then((r) => r.json());
        if (alive) setOnline(Boolean(c.ok));
      } catch {
        if (alive) setOnline(false);
      }
      try {
        const j = await fetch("/api/jobs?live=1").then((r) => r.json());
        const run = (j.jobs || []).find((x: { status?: string; provider?: string; model?: string; kind?: string }) =>
          jobOccupiesGpu(x),
        ) as { model?: string; kind?: string; createdAt?: string; status?: string; provider?: string } | undefined;
        if (!alive) return;
        if (run) {
          setBusy(true);
          setLabel(prettyModel(run.model, run.kind));
          const t = Date.parse(run.createdAt || "");
          setStarted(Number.isFinite(t) ? t : Date.now());
        } else {
          setBusy(false);
          setLabel("");
          setStarted(null);
        }
      } catch {
        /* ignore */
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 2500);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!started) {
      setElapsed("");
      return;
    }
    const id = window.setInterval(() => setElapsed(formatElapsed(Date.now() - started)), 1000);
    setElapsed(formatElapsed(Date.now() - started));
    return () => window.clearInterval(id);
  }, [started]);

  return <GpuCtx.Provider value={{ online, busy, label, elapsed }}>{children}</GpuCtx.Provider>;
}

export function GpuHeader() {
  const gpu = useGpu();
  const on = gpu.online === true;
  const off = gpu.online === false;
  return (
    <div className="flex max-w-[min(100%,28rem)] items-center justify-end gap-2">
      {gpu.busy ? (
        <span
          className="hidden truncate rounded-full bg-[#FFF1F2] px-2.5 py-1 text-[11px] font-semibold text-[#9F1239] sm:inline"
          title="Job stays on this PC. Switching menus does not cancel."
        >
          Running {gpu.label}
          {gpu.elapsed ? ` · ${gpu.elapsed}` : ""}
        </span>
      ) : null}
      <Link
        href="/system/comfyui"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
          on && "bg-[#ECFDF3] text-[#166534]",
          off && "bg-[#FEF2F2] text-[#B91C1C]",
          gpu.online === null && "bg-[#F3F4F8] text-[#374151]",
        )}
      >
        <span className={cn("h-1.5 w-1.5 rounded-full", on ? "bg-[#16A34A]" : off ? "bg-[#DC2626]" : "bg-[#9CA3AF]")} />
        {gpu.online === null ? "GPU" : on ? "GPU on" : "GPU off"}
      </Link>
    </div>
  );
}
