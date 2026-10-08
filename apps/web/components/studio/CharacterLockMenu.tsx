"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { Character } from "@/lib/character-types";
import { thumbSrc } from "@/lib/media-url";

export type CharacterLockMode = "one" | "sheet";

type Pick = { url: string; name: string; characterId: string; lockMode?: CharacterLockMode };

export function ProductLockMenu({
  onPick,
  onUpload,
  onClose,
}: {
  onPick: (hit: { url: string; name: string; productId: string }) => void;
  onUpload?: () => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<{ id: string; title: string; images: string[] }[] | null>(null);
  const [q, setQ] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  useEffect(() => {
    fetch("/api/commerce/products")
      .then((r) => r.json())
      .then((j) => setRows((j.products as { id: string; title: string; images: string[] }[]) || []))
      .catch(() => setRows([]));
  }, []);
  const list = useMemo(() => {
    const all = rows ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((p) => `${p.title} ${p.id}`.toLowerCase().includes(needle));
  }, [rows, q]);
  if (!ready) return null;
  return createPortal(
    <div
      data-lock-menu
      className="nodrag nowheel fixed inset-0 z-[80]"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button type="button" className="absolute inset-0 bg-black/60" onClick={onClose} aria-label="Close" />
      <div className="absolute left-1/2 top-1/2 flex max-h-[86vh] w-[min(440px,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#1c1f27] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">Pick SKU</p>
          <button type="button" onClick={onClose} className="text-[12px] text-white/45">
            Esc
          </button>
        </div>
        {(rows?.length || 0) > 3 ? (
          <div className="border-b border-white/10 px-3 py-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search SKU"
              className="nodrag w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-[13px] text-white/85 outline-none"
            />
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {rows === null ? (
            <p className="px-1 py-3 text-[13px] text-white/40">Loading…</p>
          ) : !list.length ? (
            <p className="px-1 py-3 text-[13px] text-white/40">
              {rows.length ? "No match." : "No SKUs. Import in Commerce."}
            </p>
          ) : (
            <div className="grid gap-3">
              {list.map((p) => {
                const imgs = p.images.filter(Boolean);
                const hero = imgs[0];
                return (
                  <div key={p.id} className="overflow-hidden rounded-xl border border-white/10 bg-black/25">
                    <button
                      type="button"
                      disabled={!hero}
                      onClick={() => hero && onPick({ url: hero, name: p.title, productId: p.id })}
                      className="block w-full text-left disabled:opacity-40"
                    >
                      <div className="aspect-square bg-white">
                        {hero ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumbSrc(hero, 800)} alt="" className="h-full w-full object-contain" />
                        ) : (
                          <span className="grid h-full place-items-center text-[12px] text-black/30">No photo</span>
                        )}
                      </div>
                      <span className="block line-clamp-2 px-3 py-2 text-[13px] font-semibold leading-snug text-white/90">
                        {p.title}
                      </span>
                    </button>
                    {imgs.length > 1 ? (
                      <div className="flex gap-1.5 overflow-x-auto px-3 pb-3">
                        {imgs.map((url, i) => (
                          <button
                            key={`${p.id}-${i}`}
                            type="button"
                            title={`View ${i + 1}`}
                            onClick={() => onPick({ url, name: p.title, productId: p.id })}
                            className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={thumbSrc(url, 200)} alt="" className="h-full w-full object-contain" />
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex border-t border-white/10">
          {onUpload ? (
            <button
              type="button"
              onClick={onUpload}
              className="flex-1 px-2 py-2 text-[12px] font-semibold text-white/70 hover:bg-white/8"
            >
              Upload image
            </button>
          ) : null}
          <Link
            href="/commerce/products"
            className="flex-1 px-2 py-2 text-center text-[12px] font-semibold text-[#2ee59d] hover:bg-white/8"
          >
            Open catalog
          </Link>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function plates(c: Character) {
  const slot = (key: string) => c.slots.find((s) => s.key === key)?.url || null;
  return [
    { key: "headshot", label: "Headshot", url: slot("headshot") || c.identityUrl },
    { key: "full", label: "Full body", url: slot("front") || slot("body") },
  ] as { key: string; label: string; url: string | null }[];
}

export function CharacterLockMenu({
  mode: modeProp,
  onPick,
  onUpload,
  onClose,
}: {
  mode?: CharacterLockMode;
  onPick: (hit: Pick) => void;
  onUpload: () => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Character[] | null>(null);
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [hover, setHover] = useState<{ url: string; name: string; label: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<CharacterLockMode>(modeProp || "one");
  const [lockingId, setLockingId] = useState<string | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (modeProp) setMode(modeProp);
  }, [modeProp]);

  useEffect(() => setReady(true), []);
  useEffect(() => {
    fetch("/api/characters")
      .then((r) => r.json())
      .then((j) => {
        const list = ((j.characters as Character[]) || []).filter((c) => c.identityUrl || c.slots.some((s) => s.url));
        setRows(list);
        if (list[0]) setOpenId(list[0].id);
      })
      .catch(() => setRows([]));
  }, []);

  const list = useMemo(() => {
    const all = rows ?? [];
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((c) => c.name.toLowerCase().includes(needle));
  }, [rows, q]);

  async function lockSheet(c: Character) {
    const shots = plates(c);
    if (shots.some((s) => !s.url)) return;
    setErr("");
    setLockingId(c.id);
    try {
      const res = await fetch("/api/characters/lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: c.id, sheet: true }),
      });
      const json = (await res.json()) as { mediaUrl?: string; error?: string };
      if (!res.ok || !json.mediaUrl) throw new Error(json.error || "sheet failed");
      onPick({ url: json.mediaUrl, name: c.name, characterId: c.id, lockMode: "sheet" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLockingId(null);
    }
  }

  if (!ready) return null;
  return createPortal(
    <div
      data-lock-menu
      className="nodrag nowheel fixed inset-0 z-[80]"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <button type="button" className="absolute inset-0 bg-black/60" onClick={onClose} aria-label="Close" />
      <div className="absolute left-1/2 top-1/2 flex max-h-[86vh] w-[min(420px,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#1c1f27] shadow-2xl">
        <div className="border-b border-white/10 px-3 py-2">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
              {mode === "sheet" ? "2 plates · 1 image" : "1 plate"}
            </p>
            <button type="button" onClick={onClose} className="text-[12px] text-white/45">
              Esc
            </button>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-white/45">
            {mode === "sheet"
              ? "Headshot + full body stacked into one lock image."
              : "Pick headshot or full body."}
          </p>
          <div className="mt-2 flex gap-1">
            <button
              type="button"
              onClick={() => setMode("one")}
              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${mode === "one" ? "bg-white text-[#12151c]" : "bg-white/10 text-white/70"}`}
            >
              1 plate
            </button>
            <button
              type="button"
              onClick={() => setMode("sheet")}
              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${mode === "sheet" ? "bg-white text-[#12151c]" : "bg-white/10 text-white/70"}`}
            >
              2 plates · 1 image
            </button>
          </div>
        </div>
        {(rows?.length || 0) > 4 ? (
          <div className="border-b border-white/10 px-3 py-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name"
              className="nodrag w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-[13px] text-white/85 outline-none"
            />
          </div>
        ) : null}
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {err ? <p className="px-2 pb-2 text-[11px] text-[#FCA5A5]">{err}</p> : null}
          {rows === null ? (
            <p className="px-2 py-3 text-[13px] text-white/40">Loading…</p>
          ) : !list.length ? (
            <p className="px-2 py-3 text-[13px] leading-snug text-white/45">
              No locked identity yet.{" "}
              <Link href="/create/characters" className="font-semibold text-[#2ee59d]">
                Open Characters
              </Link>
            </p>
          ) : (
            <div className="space-y-1">
              {list.map((c) => {
                const shots = plates(c);
                const open = openId === c.id;
                const cover = shots.find((s) => s.url)?.url;
                return (
                  <div key={c.id} className="overflow-hidden rounded-xl border border-white/10 bg-black/25">
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : c.id)}
                      className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-white/5"
                    >
                      {cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumbSrc(cover, 80)} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
                      ) : (
                        <span className="h-9 w-9 shrink-0 rounded-md bg-white/10" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white/90">{c.name}</span>
                      <span className="text-[11px] text-white/35">{open ? "−" : "+"}</span>
                    </button>
                    {open ? (
                      <div className="space-y-1.5 px-2 pb-2">
                        <div className="grid grid-cols-2 gap-1.5">
                          {shots.map((s) => (
                            <button
                              key={s.key}
                              type="button"
                              disabled={!s.url || (mode === "sheet" && lockingId === c.id)}
                              onMouseEnter={() => s.url && setHover({ url: s.url, name: c.name, label: s.label })}
                              onMouseLeave={() => setHover(null)}
                              onClick={() => {
                                if (mode === "sheet") return;
                                if (s.url) onPick({ url: s.url, name: c.name, characterId: c.id, lockMode: "one" });
                              }}
                              className="overflow-hidden rounded-lg border border-white/10 bg-black/40 text-left disabled:opacity-30"
                            >
                              <div className="aspect-[3/4] bg-[#0c0e12]">
                                {s.url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={thumbSrc(s.url, 320)} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  <span className="grid h-full place-items-center px-1 text-center text-[9px] text-white/30">
                                    Missing
                                  </span>
                                )}
                              </div>
                              <span className="block px-1 py-1 text-center text-[10px] font-semibold text-white/70">{s.label}</span>
                            </button>
                          ))}
                        </div>
                        {mode === "sheet" ? (
                          <button
                            type="button"
                            disabled={shots.some((s) => !s.url) || lockingId === c.id}
                            onClick={() => void lockSheet(c)}
                            className="w-full rounded-lg bg-[#2ee59d] px-2 py-1.5 text-[11px] font-semibold text-[#12151c] disabled:opacity-40"
                          >
                            {lockingId === c.id
                              ? "Composing…"
                              : shots.some((s) => !s.url)
                                ? "Need headshot + full body"
                                : "Lock both as 1 image"}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex border-t border-white/10">
          {mode === "one" ? (
          <button
            type="button"
            onClick={onUpload}
            className="flex-1 px-2 py-2 text-[12px] font-semibold text-white/70 hover:bg-white/8"
          >
            Upload photo
          </button>
          ) : null}
          <Link
            href="/create/characters"
            className="flex-1 px-2 py-2 text-center text-[12px] font-semibold text-[#2ee59d] hover:bg-white/8"
          >
            Library
          </Link>
        </div>
      </div>
      {hover ? (
        <div className="pointer-events-none absolute left-[calc(50%+230px)] top-1/2 hidden w-[280px] -translate-y-1/2 overflow-hidden rounded-2xl border border-white/15 bg-[#12151c] shadow-2xl lg:block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thumbSrc(hover.url, 720)} alt="" className="aspect-[3/4] w-full object-cover" />
          <div className="px-3 py-2">
            <p className="text-[13px] font-semibold text-white">{hover.name}</p>
            <p className="text-[11px] text-white/50">{hover.label}</p>
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
