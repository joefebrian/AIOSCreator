"use client";

import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { isProductMediaUrl } from "@/lib/media-kind";
import { thumbSrc } from "@/lib/media-url";

export type SelectKind = "image" | "video" | "any";

export type SelectAsset = {
  url: string;
  kind: "image" | "video";
  label?: string;
};

export function CharacterSelectContent({
  open,
  onClose,
  onPick,
  name,
  kind = "image",
  generation,
  inspiration,
  uploadKind = "character",
}: {
  open: boolean;
  onClose: () => void;
  onPick: (url: string, kind: "image" | "video") => void;
  name: string;
  kind?: SelectKind;
  generation: SelectAsset[];
  inspiration: SelectAsset[];
  uploadKind?: "character" | "motion";
}) {
  const [board, setBoard] = useState<"generation" | "inspiration">("generation");
  const [filter, setFilter] = useState<"image" | "video">(kind === "video" ? "video" : "image");

  useEffect(() => {
    if (!open) return;
    setBoard("generation");
    setFilter(kind === "video" ? "video" : "image");
  }, [open, kind]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const source = board === "inspiration" ? inspiration : generation;
  const items = useMemo(() => {
    const want = kind === "any" ? filter : kind;
    return source.filter((a) => {
      if (!a.url) return false;
      if (isProductMediaUrl(a.url)) return false;
      if (want === "image") return a.kind === "image";
      if (want === "video") return a.kind === "video";
      return true;
    });
  }, [source, kind, filter]);

  if (!open) return null;

  const accept =
    kind === "any"
      ? "image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime"
      : uploadKind === "motion"
        ? "video/mp4,video/webm,video/quicktime"
        : "image/png,image/jpeg,image/webp";

  async function upload(file: File) {
    const isVid = /^video\//.test(file.type) || /\.(mp4|webm|mov)$/i.test(file.name);
    const upKind = kind === "any" ? (isVid ? "motion" : "character") : uploadKind;
    const form = new FormData();
    form.append("file", file);
    form.append("kind", upKind);
    const res = await fetch("/api/media/upload", { method: "POST", body: form });
    const json = await res.json();
    if (!res.ok) return;
    const url = json.mediaUrl as string;
    onPick(url, upKind === "motion" ? "video" : "image");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-16" onClick={onClose}>
      <div
        className="flex max-h-[min(80vh,720px)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#E5E7EB] px-4 py-3">
          <div className="flex gap-1 rounded-full bg-[#F3F4F8] p-0.5">
            {(["generation", "inspiration"] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setBoard(id)}
                className={cn(
                  "rounded-full px-3 py-1 text-[12px] font-semibold capitalize",
                  board === id ? "bg-white text-[#111827] shadow-sm" : "text-[#6B7280]",
                )}
              >
                {id}
              </button>
            ))}
          </div>
          <button type="button" onClick={onClose} className="text-[13px] font-semibold text-[#6B7280]">
            Close
          </button>
        </div>

        {kind === "any" ? (
          <div className="flex gap-2 border-b border-[#E5E7EB] px-4 py-2">
            {(["image", "video"] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize",
                  filter === id ? "bg-[#E11D48] text-white" : "border border-[#E5E7EB] text-[#6B7280]",
                )}
              >
                {id}
              </button>
            ))}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-auto p-4">
          {items.length ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
              {items.map((a) => (
                <button
                  key={`${a.kind}-${a.url}`}
                  type="button"
                  title={a.label || a.url}
                  onClick={() => {
                    onPick(a.url, a.kind);
                    onClose();
                  }}
                  className="group overflow-hidden rounded-xl border border-[#E5E7EB] text-left hover:border-[#E11D48]"
                >
                  {a.kind === "video" ? (
                    <video src={a.url} muted playsInline preload="metadata" className="aspect-[3/4] w-full object-cover" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbSrc(a.url, 360)} alt="" className="aspect-[3/4] w-full object-cover" />
                  )}
                  {a.label ? (
                    <p className="truncate px-1.5 py-1 text-[10px] font-semibold text-[#6B7280]">{a.label}</p>
                  ) : null}
                </button>
              ))}
            </div>
          ) : (
            <div className="grid min-h-[220px] place-items-center px-6 text-center">
              <div>
                <p className="text-sm font-semibold">
                  {board === "inspiration"
                    ? "Pin a generation to Inspiration first."
                    : "It looks like this model is new for you. Let’s try it out!"}
                </p>
                <p className="mt-1 text-[13px] text-[#6B7280]">
                  {board === "generation" ? `Generate a still of @${name}, then pick it here.` : "Generation board → pin."}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[#E5E7EB] px-4 py-3">
          <p className="text-[11px] text-[#9CA3AF]">This character only. No Community.</p>
          <label className="cursor-pointer rounded-lg border border-[#E5E7EB] px-3 py-1.5 text-[12px] font-semibold">
            Upload
            <input
              type="file"
              accept={accept}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
