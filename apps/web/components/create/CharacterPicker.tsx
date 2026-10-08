"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Character } from "@/lib/character-types";
import { cn } from "@/lib/cn";
import { thumbSrc } from "@/lib/media-url";

export type ExtraStill = { id: string; url: string; name?: string };

export type PickerImageJob = {
  id: string;
  mediaUrl?: string;
  characterId?: string;
  model?: string;
  input?: string;
  createdAt?: string;
};

type Still = { id: string; url: string; tag: string; createdAt?: string; extra?: ExtraStill };

function editTag(mode: string) {
  if (mode === "product") return "On-model";
  if (mode === "face-swap") return "Face swap";
  if (mode === "chat") return "Generate";
  if (mode === "pose-real") return "Clone";
  return mode || "Edit";
}

function characterStills(c: Character, jobs: PickerImageJob[]): Still[] {
  const stills: Still[] = [];
  const seen = new Set<string>();
  const push = (id: string, url: string | null | undefined, tag: string, createdAt = "") => {
    if (!url || seen.has(url) || isVideo(url) || isProduct(url)) return;
    seen.add(url);
    stills.push({ id, url, tag, createdAt });
  };
  for (const s of c.slots) {
    if (!s.url) continue;
    push(`${c.id}-${s.key}`, s.url, s.key === "sheet" ? "Sheet" : s.label);
  }
  if (c.identityUrl) push(`${c.id}-identity`, c.identityUrl, "Identity", c.createdAt);
  for (const e of c.edits ?? []) {
    if (!e.url) continue;
    push(`edit-${e.id}`, e.url, editTag(e.mode), e.createdAt || "");
  }
  for (const j of jobs) {
    if (!j.mediaUrl) continue;
    const blob = `${j.input || ""} ${j.mediaUrl}`;
    if (j.characterId !== c.id && !blob.includes(c.id)) continue;
    push(`job-${j.id}`, j.mediaUrl, j.model || "Generate", j.createdAt || "");
  }
  stills.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return stills;
}

function isVideo(url: string) {
  return /\.(mp4|webm|mov)(\?|$)/i.test(url);
}

function isProduct(url: string) {
  return /\/api\/media\/products\//i.test(url) || /\/uploads\/product-/i.test(url);
}

function coverUrl(c: Character) {
  return c.slots.find((s) => s.key === "headshot")?.url || c.identityUrl4k || c.identityUrl || "";
}

export function CharacterPicker({
  value,
  onChange,
  extras = [],
  onDeleteExtra,
  selected,
  label = "LIBRARY",
  imageJobs = [],
}: {
  value: string;
  onChange: (url: string) => void;
  extras?: ExtraStill[];
  onDeleteExtra?: (item: ExtraStill) => void;
  selected?: string[];
  label?: string;
  imageJobs?: PickerImageJob[];
}) {
  const [rows, setRows] = useState<Character[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/characters")
      .then((r) => r.json())
      .then((j) => setRows((j.characters as Character[]).filter((c) => c.identityUrl)))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!openId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId]);

  const people = rows
    .map((c) => ({ id: c.id, name: c.name, cover: coverUrl(c), stills: characterStills(c, imageJobs) }))
    .filter((c) => c.cover || c.stills.length);
  const open = people.find((c) => c.id === openId) || null;
  const picked = (url: string) => (selected ? selected.includes(url) : value === url);
  const ownsPick = (stills: Still[]) => stills.some((s) => picked(s.url));

  if (!people.length && !extras.length) return null;

  function choose(url: string) {
    onChange(url);
    if (!selected) setOpenId(null);
  }

  return (
    <div className="mt-3 min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-[#9CA3AF]">{label}</p>
        {people.length > 6 ? (
          <button type="button" onClick={() => setExpanded((v) => !v)} className="text-[11px] font-semibold text-[#652DFF]">
            {expanded ? "Scroll" : "Expand"}
          </button>
        ) : null}
      </div>
      <div className={cn("mt-2 pb-1", expanded ? "grid grid-cols-4 gap-2" : "flex gap-2 overflow-x-auto")}>
        {people.map((c) => (
          <div
            key={c.id}
            className={cn(
              "overflow-hidden rounded-xl border",
              expanded ? "w-full" : "w-[4.5rem] shrink-0",
              ownsPick(c.stills) ? "border-[#652DFF] ring-1 ring-[#652DFF]/30" : "border-[#E6E8EE]",
            )}
          >
            <button
              type="button"
              onClick={() => setOpenId(c.id)}
              className="block w-full text-left"
              title={c.name}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumbSrc(c.cover, 240)} alt="" loading="lazy" decoding="async" className="aspect-[3/4] w-full object-cover" />
              <span className="block truncate px-1.5 py-1 text-[10px] font-semibold leading-tight">{c.name}</span>
            </button>
          </div>
        ))}
      </div>
      {extras.length ? (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {extras.map((e) => (
            <div
              key={e.id}
              className={cn(
                "group relative w-[4.5rem] shrink-0 overflow-hidden rounded-xl border",
                picked(e.url) ? "border-[#652DFF] ring-1 ring-[#652DFF]/30" : "border-[#E6E8EE]",
              )}
            >
              <button type="button" onClick={() => onChange(e.url)} className="block w-full text-left" title={e.name || "Still"}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={thumbSrc(e.url, 240)} alt="" loading="lazy" decoding="async" className="aspect-[3/4] w-full object-cover" />
                <span className="block truncate px-1.5 py-1 text-[10px] font-semibold leading-tight">{e.name || "Still"}</span>
              </button>
              {onDeleteExtra ? (
                <button
                  type="button"
                  title="Delete"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onDeleteExtra(e);
                  }}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-md bg-black/70 text-white hover:bg-black"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M4 7h16M9 7V5h6v2m-8 0 1 14h8l1-14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-3 sm:items-center"
              onClick={() => setOpenId(null)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-label={open.name}
                className="max-h-[min(82vh,42rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate text-sm font-semibold text-[#111827]">{open.name}</p>
                  <button type="button" onClick={() => setOpenId(null)} className="text-[12px] font-semibold text-[#652DFF]">
                    Close
                  </button>
                </div>
                <p className="mt-1 text-[12px] text-[#6B7280]">{open.stills.length} stills. Pick one.</p>
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {open.stills.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => choose(s.url)}
                      title={`${open.name} · ${s.tag}`}
                      className={cn(
                        "overflow-hidden rounded-xl border text-left",
                        picked(s.url) ? "border-[#652DFF] ring-1 ring-[#652DFF]/30" : "border-[#E6E8EE]",
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={thumbSrc(s.url, 240)} alt="" loading="lazy" decoding="async" className="aspect-[3/4] w-full object-cover" />
                      <span className="block truncate px-1.5 py-1 text-[10px] font-semibold leading-tight">{s.tag}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
