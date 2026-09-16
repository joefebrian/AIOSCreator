"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

export type ProductThumb = { url: string; title: string; productId?: string };

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

  useEffect(() => {
    fetch("/api/commerce/products")
      .then((r) => r.json())
      .then((j) => setThumbs((j.thumbs || []) as ProductThumb[]))
      .catch(() => undefined);
  }, [reloadKey]);

  const selected = new Set(values?.length ? values : value ? [value] : []);
  const [busy, setBusy] = useState("");

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
    <div className="mt-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-[#9CA3AF]">PRODUCT CATALOG</p>
        <Link href="/commerce/products" className="text-[10px] font-semibold text-[#652DFF]">
          Open catalog
        </Link>
      </div>
      <p className="mt-0.5 text-[11px] text-[#6B7280]">SKU pack shots. Not a person. {max > 1 ? `Up to ${max}.` : ""}</p>
      {thumbs.length ? (
        <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {thumbs.map((t) => {
            const on = selected.has(t.url);
            return (
              <button
                key={t.url}
                type="button"
                disabled={busy === t.url}
                onClick={() => void choose(t)}
                title={t.title}
                className={cn(
                  "w-[4.5rem] shrink-0 overflow-hidden rounded-xl border text-left",
                  on ? "border-[#E11D48] ring-1 ring-[#E11D48]/30" : "border-[#E6E8EE]",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={t.url} alt="" className="aspect-square w-full bg-white object-contain" />
                <span className="block truncate px-1.5 py-1 text-[10px] font-semibold">{t.title}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="mt-2 text-[11px] text-[#9CA3AF]">
          No SKUs yet. Import on{" "}
          <Link href="/commerce/products" className="font-semibold text-[#652DFF]">
            Products
          </Link>{" "}
          or upload below.
        </p>
      )}
    </div>
  );
}
