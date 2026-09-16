"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Character } from "@/lib/character-types";

type Pick = { url: string; name: string; characterId: string };

export function ProductLockMenu({
  onPick,
  onClose,
}: {
  onPick: (hit: { url: string; name: string; productId: string }) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<{ id: string; title: string; images: string[] }[] | null>(null);
  useEffect(() => {
    fetch("/api/commerce/products")
      .then((r) => r.json())
      .then((j) => setRows((j.products as { id: string; title: string; images: string[] }[]) || []))
      .catch(() => setRows([]));
  }, []);
  return (
    <div
      data-lock-menu
      className="nodrag nowheel absolute bottom-full right-0 z-50 mb-1 w-[220px] overflow-hidden rounded-xl border border-white/15 bg-[#1c1f27] shadow-xl"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-2.5 py-1.5">
        <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/45">Products</p>
        <button type="button" onClick={onClose} className="text-[10px] text-white/40">
          Esc
        </button>
      </div>
      <div className="max-h-[220px] overflow-y-auto">
        {rows === null ? (
          <p className="px-2.5 py-3 text-[11px] text-white/40">Loading…</p>
        ) : !rows.length ? (
          <p className="px-2.5 py-3 text-[11px] text-white/40">No SKUs. Import in Commerce.</p>
        ) : (
          rows.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={!p.images[0]}
              onClick={() => p.images[0] && onPick({ url: p.images[0], name: p.title, productId: p.id })}
              className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-white/5 disabled:opacity-40"
            >
              {p.images[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.images[0]} alt="" className="h-8 w-8 rounded object-cover" />
              ) : (
                <span className="h-8 w-8 rounded bg-white/10" />
              )}
              <span className="truncate text-[11px] text-white/80">{p.title}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export function CharacterLockMenu({
  onPick,
  onUpload,
  onClose,
}: {
  onPick: (hit: Pick) => void;
  onUpload: () => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Character[] | null>(null);

  useEffect(() => {
    fetch("/api/characters")
      .then((r) => r.json())
      .then((j) => setRows((j.characters as Character[]).filter((c) => c.identityUrl)))
      .catch(() => setRows([]));
  }, []);

  const options: (Pick & { label: string })[] = [];
  for (const c of rows ?? []) {
    if (c.identityUrl) {
      options.push({ url: c.identityUrl, name: c.name, characterId: c.id, label: "identity" });
    }
    for (const s of c.slots) {
      if (s.url) options.push({ url: s.url, name: c.name, characterId: c.id, label: s.label });
    }
  }

  return (
    <div
      data-lock-menu
      className="nodrag nowheel absolute bottom-full right-0 z-50 mb-1 w-[220px] overflow-hidden rounded-xl border border-white/15 bg-[#1c1f27] shadow-xl"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between border-b border-white/10 px-2.5 py-1.5">
        <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white/45">Library</p>
        <button type="button" onClick={onClose} className="text-[10px] text-white/40">
          Esc
        </button>
      </div>
      <div className="max-h-[220px] overflow-y-auto">
        {rows === null ? (
          <p className="px-2.5 py-3 text-[11px] text-white/40">Loading…</p>
        ) : !options.length ? (
          <p className="px-2.5 py-3 text-[11px] leading-snug text-white/45">
            No locked identity yet.{" "}
            <Link href="/create/characters" className="font-semibold text-[#2ee59d]">
              Open Characters
            </Link>
          </p>
        ) : (
          options.map((o) => (
            <button
              key={o.url}
              type="button"
              onClick={() => onPick(o)}
              className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-white/8"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={o.url} alt="" className="h-8 w-8 shrink-0 rounded-md object-cover" />
              <span className="min-w-0">
                <span className="block truncate text-[11px] font-semibold text-white/85">{o.name}</span>
                <span className="block truncate text-[9px] uppercase tracking-wide text-white/35">{o.label}</span>
              </span>
            </button>
          ))
        )}
      </div>
      <div className="flex border-t border-white/10">
        <button
          type="button"
          onClick={onUpload}
          className="flex-1 px-2 py-1.5 text-[10px] font-semibold text-white/70 hover:bg-white/8"
        >
          Upload photo
        </button>
        <Link
          href="/create/characters"
          className="flex-1 px-2 py-1.5 text-center text-[10px] font-semibold text-[#2ee59d] hover:bg-white/8"
        >
          Library
        </Link>
      </div>
    </div>
  );
}
