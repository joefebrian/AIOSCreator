"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { EmptyState, Page, Pill } from "@/components/ui";
import { thumbSrc } from "@/lib/media-url";

type LiteCharacter = {
  id: string;
  name: string;
  identityUrl: string | null;
  identityUpscaled?: boolean;
  updatedAt: string;
  stills: number;
  edits: number;
  hasSheet?: boolean;
  followers?: number;
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
          ? "Pick a character for this SKU. Affiliate video = script (Qwen 3.7 Plus) → still → clip."
          : "Talent objects. Affiliate video is on the character, not UGC Factory."
      }
      actions={
        <Link
          href="/create/characters/new"
          className="inline-flex items-center rounded-xl bg-[#652DFF] px-3.5 py-2 text-[13px] font-semibold text-white"
        >
          New character
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

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
                className="group overflow-hidden rounded-2xl border border-[#E6E8EE] bg-white shadow-[0_1px_0_rgba(15,23,42,0.03)] transition hover:-translate-y-0.5 hover:border-[#652DFF]/45 hover:shadow-md"
              >
                <div className="relative aspect-[3/4] bg-[#F3F4F8]">
                  {c.identityUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumbSrc(c.identityUrl, 480, c.updatedAt)}
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
                <div className="p-3">
                  <p className="truncate font-semibold text-[#0B0F2B]">{c.name}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[#6B7280]">
                    <span>{n} stills</span>
                    {edits ? <span>· {edits} edits</span> : null}
                    {fol ? <span>· {fol.toLocaleString()} flw</span> : null}
                  </p>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </Page>
  );
}
