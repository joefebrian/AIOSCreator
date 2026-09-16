"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { EnginePicker } from "@/components/create/EnginePicker";
import { Btn, Pill } from "@/components/ui";
import type { Character, CharacterSlot } from "@/lib/character-types";
import { cn } from "@/lib/cn";

type Clip = { id: string; mediaUrl?: string; model?: string; createdAt: string; characterId?: string };

type Asset = {
  id: string;
  kind: "image" | "video";
  url: string;
  label: string;
  slot?: CharacterSlot;
};

export function CharacterWorkspace({
  character,
  busy,
  error,
  elapsed,
  progress,
  clips,
  onGenSlot,
  onGenRemaining,
  onMotion,
}: {
  character: Character;
  busy: string;
  error: string;
  elapsed: string;
  progress: string;
  clips: Clip[];
  onGenSlot: (slot: CharacterSlot) => void;
  onGenRemaining: () => void;
  onMotion: (opts: { imageUrl: string; prompt: string; durationSec: number; motionUrl?: string }) => void;
}) {
  const stills: Asset[] = useMemo(() => {
    const out: Asset[] = [];
    if (character.identityUrl) {
      out.push({ id: "identity", kind: "image", url: character.identityUrl, label: "Identity" });
    }
    for (const s of character.slots) {
      if (s.url) out.push({ id: s.key, kind: "image", url: s.url, label: s.label, slot: s });
    }
    return out;
  }, [character]);

  const videos: Asset[] = useMemo(
    () =>
      clips
        .filter((c) => c.mediaUrl)
        .map((c) => ({
          id: c.id,
          kind: "video" as const,
          url: c.mediaUrl!,
          label: c.model || "clip",
        })),
    [clips],
  );

  const assets = [...stills, ...videos];
  const [selectedId, setSelectedId] = useState(stills[0]?.id || videos[0]?.id || "");
  const selected = assets.find((a) => a.id === selectedId) || assets[0];
  const [tab, setTab] = useState<"still" | "motion">("still");
  const [prompt, setPrompt] = useState("");
  const [durationSec, setDurationSec] = useState(2);
  const [drive, setDrive] = useState("");

  const frameUrl = selected?.kind === "image" ? selected.url : character.identityUrl || "";
  const emptySlot = character.slots.find((s) => !s.url && s.key !== "sheet");
  const targetSlot = selected?.slot || emptySlot || character.slots.find((s) => s.key === "front");

  function genStill() {
    if (!targetSlot) return;
    onGenSlot(targetSlot);
  }

  function genMotion() {
    if (!frameUrl) return;
    onMotion({
      imageUrl: frameUrl,
      prompt,
      durationSec,
      motionUrl: drive || undefined,
    });
  }

  return (
    <div className="flex min-h-[calc(100vh-49px)] flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E6E8EE] bg-white px-4 py-3 md:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/create/characters" className="text-[13px] font-semibold text-[#652DFF]">
            Library
          </Link>
          <span className="text-[#D1D5DB]">/</span>
          <h1 className="truncate text-[15px] font-bold">{character.name}</h1>
          <Pill tone="on">Workspace</Pill>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <EnginePicker kind="image" variant="chip" />
          <EnginePicker kind="motion" variant="chip" />
        </div>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[220px_minmax(0,1fr)_300px]">
        <aside className="border-b border-[#E6E8EE] bg-white lg:border-b-0 lg:border-r">
          <div className="p-3">
            <p className="text-[10px] font-semibold tracking-[0.16em] text-[#9CA3AF]">CHARACTER</p>
            <button
              type="button"
              onClick={() => character.identityUrl && setSelectedId("identity")}
              className={cn(
                "mt-2 overflow-hidden rounded-xl border",
                selectedId === "identity" ? "border-[#652DFF] ring-1 ring-[#652DFF]/20" : "border-[#E6E8EE]",
              )}
            >
              {character.identityUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={character.identityUrl} alt="" className="aspect-[3/4] w-full object-cover" />
              ) : null}
            </button>
          </div>
          <div className="px-3 pb-2">
            <p className="text-[10px] font-semibold tracking-[0.16em] text-[#9CA3AF]">STILLS</p>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {character.slots
                .filter((s) => s.key !== "sheet")
                .map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => s.url && setSelectedId(s.key)}
                    className={cn(
                      "relative aspect-square overflow-hidden rounded-lg border bg-[#F3F4F8]",
                      selectedId === s.key ? "border-[#652DFF]" : "border-[#E6E8EE]",
                    )}
                    title={s.label}
                  >
                    {s.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="absolute inset-0 grid place-items-center px-1 text-center text-[8px] text-[#9CA3AF]">
                        {s.label}
                      </span>
                    )}
                  </button>
                ))}
            </div>
          </div>
          <div className="px-3 pb-4">
            <p className="text-[10px] font-semibold tracking-[0.16em] text-[#9CA3AF]">CLIPS</p>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {videos.length === 0 ? (
                <p className="col-span-3 text-[11px] text-[#9CA3AF]">No clips yet.</p>
              ) : (
                videos.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedId(v.id)}
                    className={cn(
                      "relative aspect-square overflow-hidden rounded-lg border bg-black",
                      selectedId === v.id ? "border-[#652DFF]" : "border-[#E6E8EE]",
                    )}
                  >
                    <video src={v.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                  </button>
                ))
              )}
            </div>
          </div>
        </aside>

        <section className="flex min-h-[420px] flex-col bg-[#0e1014]">
          <div className="relative min-h-0 flex-1">
            {selected?.kind === "video" ? (
              <video
                key={selected.url}
                src={selected.url}
                className="absolute inset-0 h-full w-full object-contain"
                controls
                autoPlay
                loop
                muted
                playsInline
              />
            ) : selected?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={selected.url} alt="" className="absolute inset-0 h-full w-full object-contain" />
            ) : (
              <div className="grid h-full place-items-center text-[12px] tracking-[0.16em] text-white/30">STAGE</div>
            )}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-white/10 px-4 py-2 text-[11px] text-white/50">
            <span>{selected?.label || "—"}</span>
            {busy ? (
              <span className="text-[#A6FF1A]">
                {elapsed || "0s"}
                {progress ? ` · ${progress}` : ""}
              </span>
            ) : (
              <span>Local GPU</span>
            )}
          </div>
        </section>

        <aside className="border-t border-[#E6E8EE] bg-white p-4 lg:border-t-0 lg:border-l">
          <div className="flex rounded-xl bg-[#F3F4F8] p-1 text-[12px] font-semibold">
            <button
              type="button"
              onClick={() => setTab("still")}
              className={cn("flex-1 rounded-lg py-1.5", tab === "still" ? "bg-white text-[#652DFF] shadow-sm" : "text-[#6B7280]")}
            >
              Still
            </button>
            <button
              type="button"
              onClick={() => setTab("motion")}
              className={cn("flex-1 rounded-lg py-1.5", tab === "motion" ? "bg-white text-[#652DFF] shadow-sm" : "text-[#6B7280]")}
            >
              Motion
            </button>
          </div>

          <label className="mt-4 block text-[11px] font-semibold tracking-wide text-[#6B7280]">
            Prompt
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={4}
              placeholder={tab === "still" ? "Pose, wardrobe, camera…" : "Motion notes. Drive clip if copy."}
              className="mt-1 w-full resize-none rounded-xl border border-[#E6E8EE] px-3 py-2 text-sm outline-none focus:border-[#652DFF]"
            />
          </label>

          {tab === "motion" ? (
            <>
              <label className="mt-3 flex cursor-pointer flex-col items-center rounded-xl border border-dashed border-[#E6E8EE] px-3 py-3 text-center text-[12px] text-[#6B7280]">
                {drive ? "Drive clip attached" : "Drive clip · optional (Kling / H3 R2V)"}
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const form = new FormData();
                    form.append("file", f);
                    form.append("kind", "motion");
                    const res = await fetch("/api/media/upload", { method: "POST", body: form });
                    const json = await res.json();
                    if (res.ok) setDrive(json.mediaUrl);
                  }}
                />
              </label>
              <label className="mt-3 block text-[11px] font-semibold tracking-wide text-[#6B7280]">
                Duration
                <div className="mt-1 flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-[#E6E8EE] px-2 py-1"
                    onClick={() => setDurationSec((d) => Math.max(2, d - 1))}
                  >
                    −
                  </button>
                  <span className="min-w-[2.5rem] text-center text-sm font-semibold">{durationSec}s</span>
                  <button
                    type="button"
                    className="rounded-lg border border-[#E6E8EE] px-2 py-1"
                    onClick={() => setDurationSec((d) => Math.min(60, d + 1))}
                  >
                    +
                  </button>
                </div>
              </label>
            </>
          ) : (
            <p className="mt-3 text-[12px] text-[#6B7280]">
              Target: <span className="font-semibold text-[#0B0F2B]">{targetSlot?.label || "—"}</span>
            </p>
          )}

          {error ? <p className="mt-3 text-[12px] text-red-600">{error}</p> : null}

          <Btn
            type="button"
            className="mt-4 w-full"
            disabled={Boolean(busy) || (tab === "still" ? !targetSlot : !frameUrl)}
            onClick={() => (tab === "still" ? genStill() : genMotion())}
          >
            {busy ? `Running ${elapsed || "…"}` : tab === "still" ? "Generate still" : "Generate clip"}
          </Btn>
          {tab === "still" ? (
            <button
              type="button"
              disabled={Boolean(busy)}
              onClick={onGenRemaining}
              className="mt-2 w-full text-[12px] font-semibold text-[#652DFF]"
            >
              GEN remaining set
            </button>
          ) : null}
          <p className="mt-3 text-[11px] leading-snug text-[#9CA3AF]">
            Job jalan di PC GPU. Tab boleh ditutup. H3 R2V lokal 2s · Seedance cloud 4–30s.
          </p>
        </aside>
      </div>
    </div>
  );
}
