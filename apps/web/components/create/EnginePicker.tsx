"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

export type EngineRow = {
  id: string;
  kind: "llm" | "image" | "motion" | "export";
  name: string;
  license: string;
  vram: string;
  status: "ready" | "coming";
  note: string;
  useFor: string;
  tip: string;
  group: string;
  badges: string[];
  cloud?: boolean;
  via?: { id: string; name: string; canGenerate: boolean; reason: string };
};

type Payload = {
  engines: EngineRow[];
  selected: { image: string; motion: string; imageVia?: string; motionVia?: string };
};

const EVENT = "creatoros:engines";

export function EnginePicker({
  kind,
  variant = "row",
  dark = false,
  onChange,
}: {
  kind: "image" | "motion";
  variant?: "row" | "chip";
  dark?: boolean;
  onChange?: (id: string) => void;
}) {
  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      const res = await fetch("/api/settings/engines");
      if (!res.ok) {
        setError(`engines HTTP ${res.status}`);
        return;
      }
      const json = (await res.json()) as Payload;
      setData(json);
      const id = json.selected?.[kind];
      if (id) onChange?.(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void load();
    const on = () => void load();
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);

  async function pick(id: string) {
    if (!id || busy) return;
    onChange?.(id);
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/settings/engines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
      const picked = (json as Payload).selected?.[kind];
      if (picked) onChange?.(picked);
      window.dispatchEvent(new Event(EVENT));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const list = (data?.engines ?? []).filter((e) => {
    if (e.kind !== kind) return false;
    if (kind === "motion")
      return e.id === "kling-2-6" || e.id === "kling-3-0" || e.id === "dreamactor-v2";
    return true;
  });
  const selectedId = data?.selected[kind] || "";
  const current = list.find((e) => e.id === selectedId);
  const selectCls = cn(
    "cursor-pointer appearance-auto",
    variant === "chip"
      ? "max-w-[14rem] rounded-lg border px-2 py-1 text-[11px] font-semibold"
      : "mt-1 block w-full cursor-pointer rounded-xl border px-3 py-2.5 text-sm font-semibold",
    dark ? "border-white/15 bg-[#1c1f27] text-white" : "border-[#E6E8EE] bg-white text-[#0B0F2B]",
    busy && "opacity-60",
  );

  const select = (
    <select
      value={selectedId}
      disabled={busy || list.length === 0}
      onChange={(e) => void pick(e.target.value)}
      title={current?.tip || ""}
      className={selectCls}
    >
      {list.length === 0 ? <option value="">{error ? "Failed to load" : "Loading…"}</option> : null}
      {list.map((e) => (
        <option key={e.id} value={e.id} disabled={e.status !== "ready"} title={e.tip}>
          {e.name}
          {e.useFor ? ` — ${e.useFor}` : ""}
          {e.status !== "ready" ? " (soon)" : ""}
        </option>
      ))}
    </select>
  );

  const genLine = current ? (
    <p
      className={cn(
        "leading-snug",
        variant === "chip" ? "text-[10px]" : "mt-2 text-[12px]",
        current.via?.canGenerate ? "text-[#15803D]" : "text-[#B45309]",
      )}
    >
      {current.via?.canGenerate ? "Ready to generate" : current.cloud ? "Need API key in Settings" : "Not installed"}
    </p>
  ) : null;

  if (variant === "chip") {
    return (
      <div title={current?.tip || ""} className="flex flex-wrap items-center gap-1">
        {select}
        {genLine}
        {error ? <p className="mt-1 w-full text-[10px] text-red-500">{error}</p> : null}
      </div>
    );
  }

  return (
    <div>
      <p className="text-[11px] font-semibold tracking-[0.18em] text-[#9CA3AF]">MODEL</p>
      {select}
      {genLine}
      {current ? (
        <p className="mt-2 text-[12px] leading-snug text-[#4B5563]">
          <span className="font-semibold text-[#652DFF]">Bagus buat</span>
          {current.useFor ? ` · ${current.useFor}` : ""}
          {" — "}
          {current.tip}
        </p>
      ) : null}
      {current ? (
        <p className="mt-0.5 text-[11px] text-[#9CA3AF]">
          {current.license} · {current.vram}
        </p>
      ) : null}
      {error ? <p className="mt-1 text-[12px] text-red-600">{error}</p> : null}
    </div>
  );
}
