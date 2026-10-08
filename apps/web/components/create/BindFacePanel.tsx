"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { Character } from "@/lib/character-types";
import { BIND_FACE_STILL_PROMPT } from "@/lib/kling-lock";
import { cn } from "@/lib/cn";
import { thumbSrc } from "@/lib/media-url";

/** Kling face element wants angles, not emotion stills. */
const FACE_ANGLE_KEYS = new Set(["headshot", "close", "three_quarter_left", "three_quarter_right", "profile"]);

type FaceStill = { url: string; tag: string };

function faceStills(c: Character, locked: string): FaceStill[] {
  const out: FaceStill[] = [];
  const seen = new Set<string>();
  const push = (url: string | null | undefined, tag: string) => {
    if (!url || url === locked || seen.has(url)) return;
    seen.add(url);
    out.push({ url, tag });
  };
  for (const s of c.slots) {
    if (!s.url || !FACE_ANGLE_KEYS.has(s.key)) continue;
    push(s.url, s.label);
  }
  return out;
}

function ownerOf(rows: Character[], locked: string) {
  return rows.find(
    (c) =>
      c.identityUrl === locked ||
      c.slots.some((s) => s.url === locked) ||
      (c.edits ?? []).some((e) => e.url === locked),
  );
}

export function BindFaceButton({
  bound,
  count,
  onOpen,
  onClear,
}: {
  bound: boolean;
  count: number;
  onOpen: () => void;
  onClear: () => void;
}) {
  return (
    <div className="mt-3 flex items-stretch gap-2">
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-3 rounded-xl border px-3 py-2 text-left",
          bound ? "border-[#652DFF] bg-[#652DFF]/5" : "border-[#E6E8EE] bg-white",
        )}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-[#C4C8D4] text-[#652DFF]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="8" r="3" stroke="currentColor" strokeWidth="1.8" />
            <path d="M6 19c.8-2.6 3-4 6-4s5.2 1.4 6 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[12px] font-semibold text-[#111827]">Bind facial element</span>
          <span className="block truncate text-[11px] text-[#6B7280]">
            {bound ? `${count} face photo${count === 1 ? "" : "s"} · Drive orientation` : "To enhance consistency"}
          </span>
        </span>
      </button>
      {bound ? (
        <button
          type="button"
          onClick={onClear}
          className="rounded-xl border border-[#E6E8EE] px-3 text-[11px] font-semibold text-[#6B7280]"
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}

export function BindFacePanel({
  open,
  locked,
  selected,
  onClose,
  onBind,
}: {
  open: boolean;
  locked: string;
  selected: string[];
  onClose: () => void;
  onBind: (urls: string[]) => void;
}) {
  const [rows, setRows] = useState<Character[]>([]);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>(selected);

  useEffect(() => {
    if (!open) return;
    setPicked(selected.filter((url) => url && url !== locked));
    setQuery("");
    fetch("/api/characters")
      .then((r) => r.json())
      .then((j) => setRows((j.characters as Character[]).filter((c) => c.identityUrl)))
      .catch(() => undefined);
  }, [open, locked, selected]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const owner = useMemo(() => (locked ? ownerOf(rows, locked) : undefined), [rows, locked]);
  const faces = owner ? faceStills(owner, locked) : [];

  useEffect(() => {
    if (!open || !owner) return;
    const allowed = new Set(faceStills(owner, locked).map((f) => f.url));
    setPicked((cur) => {
      const next = cur.filter((url) => allowed.has(url));
      return next.length === cur.length ? cur : next;
    });
  }, [open, owner, locked]);
  const q = query.trim().toLowerCase();
  const shown = q ? faces.filter((f) => f.tag.toLowerCase().includes(q) || owner?.name.toLowerCase().includes(q)) : faces;

  if (!open || typeof document === "undefined") return null;

  function toggle(url: string) {
    setPicked((cur) => {
      if (cur.includes(url)) return cur.filter((item) => item !== url);
      if (cur.length >= 3) return cur;
      return [...cur, url];
    });
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-3 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Bind facial element"
        className="max-h-[min(82vh,40rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[#111827]">Bind facial element</p>
            <p className="mt-0.5 text-[12px] text-[#6B7280]">To enhance consistency. Face only.</p>
          </div>
          <button type="button" onClick={onClose} className="text-[12px] font-semibold text-[#652DFF]">
            Close
          </button>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search face photos"
          className="mt-3 w-full rounded-xl border border-[#E6E8EE] px-3 py-2 text-[13px] outline-none"
        />
        {!locked ? (
          <p className="mt-4 text-[13px] text-[#6B7280]">Lock a character first.</p>
        ) : !owner ? (
          <p className="mt-4 text-[13px] text-[#6B7280]">Loading this character’s face photos.</p>
        ) : (
          <>
            <p className="mt-3 text-[12px] text-[#6B7280]">
              {owner.name}. The locked still is the front photo. Pick 1–3 other face photos.
            </p>
            <p className="mt-2 rounded-xl bg-[#F3F4F8] px-3 py-2 text-[11px] leading-snug text-[#4B5563]">
              Face plates for this bind use Muse Image 1.0. Prompt is locked: {BIND_FACE_STILL_PROMPT}
            </p>
            {shown.length ? (
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {shown.map((f) => {
                  const on = picked.includes(f.url);
                  return (
                    <button
                      key={f.url}
                      type="button"
                      onClick={() => toggle(f.url)}
                      className={cn(
                        "overflow-hidden rounded-xl border text-left",
                        on ? "border-[#652DFF] ring-1 ring-[#652DFF]/30" : "border-[#E6E8EE]",
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={thumbSrc(f.url, 240)} alt="" className="aspect-[3/4] w-full object-cover" />
                      <span className="block truncate px-1.5 py-1 text-[10px] font-semibold">{f.tag}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="mt-4 text-[13px] text-[#6B7280]">
                No other face photos on this character. Add a face angle in Characters.
              </p>
            )}
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-[12px] text-[#6B7280]">{picked.length}/3 face photos</p>
              <button
                type="button"
                disabled={picked.length < 1}
                onClick={() => onBind(picked.filter((url) => faces.some((f) => f.url === url)))}
                className="rounded-xl bg-[#652DFF] px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-40"
              >
                Bind
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
