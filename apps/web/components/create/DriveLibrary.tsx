"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { Character } from "@/lib/character-types";
import { cn } from "@/lib/cn";

const MOTION_MODELS = new Set(["kling-2-6", "kling-3-0", "dreamactor-v2"]);

export type DriveClip = {
  id: string;
  mediaUrl?: string;
  input?: string;
  createdAt?: string;
  model?: string;
  characterId?: string;
};

type UploadClip = { id: string; mediaUrl: string; createdAt?: string };

function clipLabel(createdAt?: string) {
  if (!createdAt) return "Clip";
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return "Clip";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function coverUrl(c: Character) {
  return c.slots.find((s) => s.key === "headshot")?.url || c.identityUrl || "";
}

function ownerId(clip: DriveClip, people: Character[]) {
  if (clip.characterId && people.some((c) => c.id === clip.characterId)) return clip.characterId;
  const blob = `${clip.input || ""} ${clip.mediaUrl || ""}`;
  return people.find((c) => blob.includes(c.id))?.id || "";
}

function ClipButton({
  src,
  selected,
  onClick,
  label,
}: {
  src: string;
  selected: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={cn(
        "overflow-hidden rounded-xl border bg-[#0e1014] text-left",
        selected ? "border-[#652DFF] ring-1 ring-[#652DFF]/30" : "border-[#E6E8EE]",
      )}
    >
      <video src={src} muted playsInline preload="metadata" className="aspect-[9/16] w-full object-contain" />
      <span className="block truncate bg-white px-1.5 py-1 text-[10px] font-semibold text-[#111827]">{label}</span>
    </button>
  );
}

function TrashGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 7h16M9 7V5h6v2m-8 0 1 14h8l1-14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UploadCard({
  src,
  selected,
  label,
  busy,
  onPick,
  onDelete,
}: {
  src: string;
  selected: boolean;
  label: string;
  busy: boolean;
  onPick: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border bg-[#0e1014]",
        selected ? "border-[#652DFF] ring-1 ring-[#652DFF]/30" : "border-[#E6E8EE]",
      )}
    >
      <button type="button" onClick={onPick} title={label} className="block w-full text-left">
        <video src={src} muted playsInline preload="metadata" className="aspect-[9/16] w-full object-contain" />
        <span className="block truncate bg-white px-1.5 py-1 text-[10px] font-semibold text-[#111827]">{label}</span>
      </button>
      <button
        type="button"
        title="Delete"
        aria-label="Delete"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          if (!busy) onDelete();
        }}
        className="absolute right-1 top-1 z-10 flex h-7 w-7 items-center justify-center rounded-md bg-black/70 text-white hover:bg-black disabled:opacity-40"
      >
        <TrashGlyph />
      </button>
    </div>
  );
}

export function DriveLibrary({
  clips,
  value,
  onPick,
  onRemoved,
}: {
  clips: DriveClip[];
  value: string;
  onPick: (url: string) => void;
  onRemoved?: (url: string) => void;
}) {
  const [people, setPeople] = useState<Character[]>([]);
  const [uploads, setUploads] = useState<UploadClip[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    fetch("/api/characters")
      .then((r) => r.json())
      .then((j) => setPeople((j.characters as Character[]) || []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    fetch("/api/media/upload")
      .then((r) => r.json())
      .then((j) => setUploads((j.clips as UploadClip[]) || []))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!value || !/\/uploads\/.+\.(mp4|webm|mov)(\?|$)/i.test(value)) return;
    setUploads((cur) => (cur.some((u) => u.mediaUrl === value) ? cur : [{ id: value, mediaUrl: value }, ...cur]));
  }, [value]);

  useEffect(() => {
    if (!openId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openId]);

  const groups = useMemo(() => {
    const generated = clips.filter((c) => c.mediaUrl && MOTION_MODELS.has(c.model || ""));
    return people
      .map((person) => ({
        id: person.id,
        name: person.name,
        cover: coverUrl(person),
        clips: generated.filter((c) => ownerId(c, people) === person.id),
      }))
      .filter((g) => g.clips.length);
  }, [clips, people]);

  const library = useMemo(() => {
    const generated = new Set(
      clips.filter((c) => c.mediaUrl && c.model && c.model !== "upload").map((c) => c.mediaUrl as string),
    );
    return uploads.filter((u) => u.mediaUrl && !generated.has(u.mediaUrl) && !/\/api\/media\/motion\//.test(u.mediaUrl));
  }, [clips, uploads]);

  const open = openId === "uploads" ? { id: "uploads", name: "Reference library", clips: library } : groups.find((g) => g.id === openId) || null;

  if (!groups.length && !library.length) return null;

  function choose(url?: string) {
    if (!url) return;
    onPick(url);
    setOpenId(null);
  }

  async function removeUpload(clip: UploadClip) {
    const mediaUrl = clip.mediaUrl || "";
    const name = mediaUrl.split("?")[0]?.split("/").pop() || "";
    if (!name || busyId) return;
    if (!window.confirm("Delete this reference clip?")) return;
    setBusyId(clip.id);
    setDeleteError("");
    try {
      const res = await fetch("/api/media/upload", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || `delete HTTP ${res.status}`);
      setUploads((cur) => {
        const next = cur.filter((u) => u.id !== clip.id && u.mediaUrl !== mediaUrl);
        if (!next.length) setOpenId(null);
        return next;
      });
      if (mediaUrl) onRemoved?.(mediaUrl);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Couldn't delete this clip.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-3 min-w-0">
      <p className="text-[11px] font-semibold tracking-[0.16em] text-[#9CA3AF]">USE A CLIP</p>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        {groups.map((g) => {
          const on = g.clips.some((c) => c.mediaUrl === value);
          return (
            <div
              key={g.id}
              className={cn(
                "w-[4.5rem] shrink-0 overflow-hidden rounded-xl border",
                on ? "border-[#652DFF] ring-1 ring-[#652DFF]/30" : "border-[#E6E8EE]",
              )}
            >
              <button type="button" onClick={() => setOpenId(g.id)} className="block w-full text-left" title={g.name}>
                {g.cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={g.cover} alt="" className="aspect-[3/4] w-full object-cover" />
                ) : (
                  <span className="block aspect-[3/4] w-full bg-[#F3F4F8]" />
                )}
                <span className="block truncate px-1.5 py-1 text-[10px] font-semibold leading-tight text-[#111827]">{g.name}</span>
              </button>
            </div>
          );
        })}
        {library.length ? (
          <div
            className={cn(
              "w-[4.5rem] shrink-0 overflow-hidden rounded-xl border",
              library.some((u) => u.mediaUrl === value) ? "border-[#652DFF] ring-1 ring-[#652DFF]/30" : "border-[#E6E8EE]",
            )}
          >
            <button type="button" onClick={() => setOpenId("uploads")} className="block w-full text-left" title="Reference library">
              <video
                src={library[0].mediaUrl}
                muted
                playsInline
                preload="metadata"
                className="aspect-[3/4] w-full bg-[#0e1014] object-contain"
              />
              <span className="block px-1 py-1 text-[10px] font-semibold leading-tight text-[#111827]">Reference library</span>
            </button>
          </div>
        ) : null}
      </div>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-3 sm:items-center" onClick={() => setOpenId(null)}>
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
                <p className="mt-1 text-[12px] text-[#6B7280]">{open.clips.length} clips. Pick one.</p>
                {open.id === "uploads" && deleteError ? (
                  <p className="mt-1 text-[12px] text-[#B42318]">{deleteError}</p>
                ) : null}
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {open.id === "uploads"
                    ? library.map((c) => (
                        <UploadCard
                          key={c.id}
                          src={c.mediaUrl}
                          label={clipLabel(c.createdAt)}
                          selected={c.mediaUrl === value}
                          busy={busyId === c.id}
                          onPick={() => choose(c.mediaUrl)}
                          onDelete={() => void removeUpload(c)}
                        />
                      ))
                    : open.clips.map((c) => (
                        <ClipButton
                          key={c.id}
                          src={c.mediaUrl || ""}
                          label={clipLabel(c.createdAt)}
                          selected={c.mediaUrl === value}
                          onClick={() => choose(c.mediaUrl)}
                        />
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
