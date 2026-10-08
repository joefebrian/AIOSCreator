"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";

export type ProductThumb = { url: string; title: string; productId?: string; category?: string };

type ProductGroup = {
  key: string;
  title: string;
  category: string;
  productId?: string;
  images: ProductThumb[];
};

function cleanTitle(title: string) {
  const t = title
    .replace(/^Deal:\s*/i, "")
    .replace(/^Amazon\.com[:|]\s*/i, "")
    .replace(/\s*\|\s*Amazon\.com\s*$/i, "")
    .replace(/^Jual\s+/i, "")
    .replace(/\.(jpe?g|png|webp)$/i, "")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/[_|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/^[0-9a-f-]{16,}$/i.test(t)) return "Uploaded SKU";
  return t || "SKU";
}

export function ProductPicker({
  value,
  values,
  onPick,
  max = 1,
  reloadKey,
}: {
  value?: string;
  values?: string[];
  onPick: (url: string) => void;
  max?: number;
  reloadKey?: string | number;
}) {
  const [thumbs, setThumbs] = useState<ProductThumb[]>([]);
  const [cat, setCat] = useState("All");
  const [query, setQuery] = useState("");
  const [openKey, setOpenKey] = useState("");

  useEffect(() => {
    fetch("/api/commerce/products")
      .then((r) => r.json())
      .then((j) => setThumbs((j.thumbs || []) as ProductThumb[]))
      .catch(() => undefined);
  }, [reloadKey]);

  const selected = new Set(values?.length ? values : value ? [value] : []);
  const [busy, setBusy] = useState("");

  const groups = useMemo(() => {
    const map = new Map<string, ProductGroup>();
    for (const t of thumbs) {
      const category = t.category || "Uncategorized";
      const key = t.productId || t.title;
      const hit = map.get(key);
      if (hit) {
        hit.images.push(t);
        continue;
      }
      map.set(key, { key, title: t.title, category, productId: t.productId, images: [t] });
    }
    return [...map.values()];
  }, [thumbs]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const g of groups) counts.set(g.category, (counts.get(g.category) || 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [groups]);

  const q = query.trim().toLowerCase();
  const visible = groups.filter((g) => {
    if (cat !== "All" && g.category !== cat) return false;
    if (!q) return true;
    return cleanTitle(g.title).toLowerCase().includes(q) || g.category.toLowerCase().includes(q);
  });

  async function choose(t: ProductThumb) {
    let url = t.url;
    if (/^https?:\/\//i.test(url) && t.productId) {
      setBusy(t.url);
      try {
        const res = await fetch("/api/commerce/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "local-image", id: t.productId }),
        });
        const j = await res.json();
        if (res.ok && j.imageUrl) url = j.imageUrl as string;
      } finally {
        setBusy("");
      }
    }
    onPick(url);
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-semibold text-[#111827]">Catalog</p>
        <Link href="/commerce/products" className="text-[11px] font-semibold text-[#652DFF]">
          Open
        </Link>
      </div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search"
        className="mt-2 h-8 w-full rounded-full bg-[#F3F4F8] px-3 text-[12px] text-[#111827] outline-none placeholder:text-[#9CA3AF]"
      />
      {categories.length > 1 ? (
        <div className="mt-2 flex gap-1 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setCat("All")}
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold",
              cat === "All" ? "bg-[#111827] text-white" : "bg-[#F3F4F8] text-[#6B7280]",
            )}
          >
            All
          </button>
          {categories.map(([name, n]) => (
            <button
              key={name}
              type="button"
              onClick={() => setCat(name)}
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                cat === name ? "bg-[#111827] text-white" : "bg-[#F3F4F8] text-[#6B7280]",
              )}
            >
              {name}
              <span className="ml-1 text-[10px] opacity-60">{n}</span>
            </button>
          ))}
        </div>
      ) : null}
      {visible.length ? (
        <div className="mt-3 grid max-h-72 grid-cols-6 gap-x-1.5 gap-y-2 overflow-y-auto pr-0.5">
          {visible.map((g) => {
            const picked = g.images.find((t) => selected.has(t.url));
            const cover = picked || g.images[0];
            const on = Boolean(picked);
            const open = openKey === g.key;
            const name = cleanTitle(g.title);
            return (
              <div key={g.key} className="contents">
                <div className="relative">
                  <button
                    type="button"
                    disabled={!cover || busy === cover.url}
                    onClick={() => cover && void choose(cover)}
                    title={g.title}
                    className="block w-full text-left"
                  >
                    <span
                      className={cn(
                        "block aspect-square overflow-hidden rounded-2xl bg-[#F3F4F8]",
                        on ? "ring-2 ring-[#111827] ring-offset-2" : "",
                      )}
                    >
                      {cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={cover.url}
                          alt=""
                          className="h-full w-full object-contain"
                          onError={(e) => {
                            (e.currentTarget.parentElement as HTMLElement | null)?.classList.add("hidden");
                          }}
                        />
                      ) : null}
                    </span>
                    <span className="mt-1 block truncate text-[10px] text-[#6B7280]">{name}</span>
                  </button>
                  {g.images.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => setOpenKey(open ? "" : g.key)}
                      className="absolute right-1.5 top-1.5 rounded-full bg-white/95 px-1.5 py-0.5 text-[10px] font-semibold text-[#111827] shadow-sm"
                    >
                      {open ? "Hide" : g.images.length}
                    </button>
                  ) : null}
                </div>
                {open ? (
                  <div className="col-span-6 flex gap-1 overflow-x-auto pb-0.5">
                    {g.images.map((t) => {
                      const shot = selected.has(t.url);
                      return (
                        <button
                          key={t.url}
                          type="button"
                          disabled={busy === t.url}
                          onClick={() => void choose(t)}
                          className={cn(
                            "h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-[#F3F4F8]",
                            shot ? "ring-2 ring-[#111827]" : "",
                          )}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={t.url} alt="" className="h-full w-full object-contain" />
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 text-[12px] text-[#9CA3AF]">
          {groups.length ? "No match." : "No SKUs yet. Import on "}
          {groups.length ? null : (
            <Link href="/commerce/products" className="font-semibold text-[#652DFF]">
              Products
            </Link>
          )}
          {groups.length ? null : " or upload above."}
        </p>
      )}
    </div>
  );
}
