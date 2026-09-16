"use client";

import { useEffect, useState } from "react";
import type { Character } from "@/lib/character-types";
import { cn } from "@/lib/cn";
import { thumbSrc } from "@/lib/media-url";

export type ExtraStill = { id: string; url: string; name?: string };

export function CharacterPicker({
  value,
  onChange,
  extras = [],
  onDeleteExtra,
}: {
  value: string;
  onChange: (url: string) => void;
  extras?: ExtraStill[];
  onDeleteExtra?: (item: ExtraStill) => void;
}) {
  const [rows, setRows] = useState<Character[]>([]);

  useEffect(() => {
    fetch("/api/characters")
      .then((r) => r.json())
      .then((j) => setRows((j.characters as Character[]).filter((c) => c.identityUrl)))
      .catch(() => undefined);
  }, []);

  const [expanded, setExpanded] = useState(false);
  const thumbs: { id: string; url: string; name: string; tag: string; extra?: ExtraStill }[] = [];
  const seen = new Set<string>();
  const push = (id: string, url: string | null | undefined, name: string, tag: string, extra?: ExtraStill) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    thumbs.push({ id, url, name, tag, extra });
  };
  for (const c of rows) {
    push(
      `id-${c.id}`,
      c.slots.find((s) => s.key === "headshot")?.url || c.identityUrl4k || c.identityUrl,
      c.name,
      "Headshot",
    );
    for (const s of c.slots) {
      if (!s.url) continue;
      if (s.group === "commerce" || s.key === "sheet") continue;
      const tag = s.key === "front" || s.key === "body" ? "Body" : s.label;
      push(`${c.id}-${s.key}`, s.url4k || s.url, c.name, tag);
    }
  }
  for (const e of extras) {
    push(e.id, e.url, e.name || "Still", "Still", e);
  }

  if (!thumbs.length) return null;

  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-[#9CA3AF]">LIBRARY</p>
        {thumbs.length > 6 ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[11px] font-semibold text-[#652DFF]"
          >
            {expanded ? "Scroll" : "Expand"}
          </button>
        ) : null}
      </div>
      <div className={cn("mt-2 pb-1", expanded ? "grid grid-cols-4 gap-2" : "flex gap-2 overflow-x-auto")}>
        {thumbs.map((t) => (
          <div
            key={t.id}
            className={cn(
              "group relative overflow-hidden rounded-xl border",
              expanded ? "w-full" : "w-[4.5rem] shrink-0",
              value === t.url ? "border-[#652DFF] ring-1 ring-[#652DFF]/30" : "border-[#E6E8EE]",
            )}
          >
            <button type="button" onClick={() => onChange(t.url)} className="block w-full text-left" title={`${t.name} · ${t.tag}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={thumbSrc(t.url, 240)} alt="" loading="lazy" decoding="async" className="aspect-[3/4] w-full object-cover" />
              <span className="block truncate px-1.5 pt-1 text-[10px] font-semibold leading-tight">{t.name}</span>
              <span className="block truncate px-1.5 pb-1 text-[9px] text-[#9CA3AF]">{t.tag}</span>
            </button>
            {t.extra && onDeleteExtra ? (
              <button
                type="button"
                title="Delete"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteExtra(t.extra!);
                }}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-md bg-black/70 text-white hover:bg-black"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M4 7h16M9 7V5h6v2m-8 0 1 14h8l1-14"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
