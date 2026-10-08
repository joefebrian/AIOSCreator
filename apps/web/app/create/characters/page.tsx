"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { EmptyState, Page, Pill } from "@/components/ui";
import { MARKETS } from "@/lib/markets";
import { thumbSrc } from "@/lib/media-url";

type LiteCharacter = {
  id: string;
  name: string;
  identityUrl: string | null;
  thumbUrl?: string | null;
  identityUpscaled?: boolean;
  updatedAt: string;
  stills: number;
  edits: number;
  hasSheet?: boolean;
  followers?: number;
  markets?: string[];
};

export default function CharactersPage() {
  return (
    <Suspense>
      <CharactersInner />
    </Suspense>
  );
}

function CharactersInner() {
  const product = useSearchParams().get("product");
  const [rows, setRows] = useState<LiteCharacter[] | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  useEffect(() => {
    fetch("/api/characters?lite=1")
      .then((r) => r.json())
      .then((j) => setRows(j.characters as LiteCharacter[]))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  const list = useMemo(() => {
    const all = [...(rows ?? [])].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((c) => c.name.toLowerCase().includes(needle));
  }, [rows, q]);

  const ready = rows?.filter((c) => c.identityUrl).length ?? 0;

  return (
    <Page
      kicker="CREATE · CHARACTERS"
      title="Character library"
      description={
        product
          ? "Pick a talent for this SKU."
          : "Click a face to open the workspace."
      }
      actions={
        <Link
          href="/create/characters/new"
          className="inline-flex items-center gap-1.5 rounded-full border border-[#E6E8EE] bg-white px-3 py-1.5 text-[13px] font-semibold text-[#0B0F2B] hover:border-[#652DFF]/50"
        >
          <Plus size={14} />
          New
        </Link>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-[#6B7280]">
          {rows == null ? "Loading…" : `${ready} ready · ${rows.length} total`}
        </p>
        {rows && rows.length > 4 ? (
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name…"
            className="w-full max-w-xs rounded-xl border border-[#E6E8EE] bg-white px-3 py-2 text-sm outline-none focus:border-[#652DFF]"
          />
        ) : null}
      </div>

      {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
        {rows === null ? (
          [0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[22rem] animate-pulse rounded-2xl bg-white ring-1 ring-[#E6E8EE]" />
          ))
        ) : rows.length === 0 ? (
          <div className="sm:col-span-2 lg:col-span-4">
            <EmptyState
              title="No characters yet"
              body="Drop a face, tweak sliders, lock identity. That’s the default path."
              action={
                <Link
                  href="/create/characters/new"
                  className="inline-flex items-center rounded-xl bg-[#652DFF] px-3.5 py-2 text-[13px] font-semibold text-white"
                >
                  New character
                </Link>
              }
            />
          </div>
        ) : list.length === 0 ? (
          <p className="text-sm text-[#6B7280]">No match for “{q}”.</p>
        ) : (
          list.map((c) => {
            const locked = Boolean(c.identityUrl);
            const href = locked
              ? product
                ? `/create/characters/${c.id}/workspace?tool=affiliate&product=${product}`
                : `/create/characters/${c.id}/workspace?tool=generate-image`
              : `/create/characters/${c.id}`;
            const n = c.stills;
            const edits = c.edits;
            const sheet = c.hasSheet;
            const fol = c.followers || 0;
            return (
              <Link
                key={c.id}
                href={href}
                className="group overflow-hidden rounded-xl border border-[#E6E8EE] bg-white transition hover:-translate-y-0.5 hover:border-[#652DFF]/45 hover:shadow-sm"
              >
                <div className="relative aspect-[3/4] bg-[#F3F4F8]">
                  {c.thumbUrl || c.identityUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumbSrc(c.thumbUrl || c.identityUrl || "", 480, c.updatedAt)}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[11px] tracking-[0.16em] text-[#9CA3AF]">
                      NO IDENTITY
                    </div>
                  )}
                  <div className="absolute left-2 top-2 flex flex-wrap gap-1">
                    {locked ? (
                      <Pill tone="on">Workspace</Pill>
                    ) : (
                      <Pill tone="warn">Draft</Pill>
                    )}
                    {c.identityUpscaled ? <Pill tone="muted">4K</Pill> : null}
                    {sheet ? <Pill tone="ready">Sheet</Pill> : null}
                  </div>
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-3 pb-3 pt-10 opacity-0 transition group-hover:opacity-100">
                    <p className="text-[12px] font-semibold text-white">{locked ? "Open workspace" : "Finish identity"}</p>
                  </div>
                </div>
                <div className="px-2 py-2">
                  <p className="truncate text-[13px] font-semibold text-[#0B0F2B]">{c.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[10px] text-[#6B7280]">
                    <span>{n} stills</span>
                    {edits ? <span>· {edits} edits</span> : null}
                    {fol ? <span>· {fol.toLocaleString()} flw</span> : null}
                    <span>· {(c.markets || []).map((id) => MARKETS.find((market) => market.id === id)?.label || id).join(", ") || "Set country"}</span>
                  </p>
                </div>
              </Link>
            );
          })
        )}
        {rows && rows.length > 0 ? (
          <Link
            href="/create/characters/new"
            className="flex aspect-[3/4] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#D1D5DB] bg-[#FAFAFC] text-[#6B7280] transition hover:border-[#652DFF]/50 hover:text-[#652DFF]"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full border border-current">
              <Plus size={16} />
            </span>
            <span className="text-[12px] font-semibold">New character</span>
          </Link>
        ) : null}
      </div>
    </Page>
  );
}
