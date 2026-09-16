"use client";

import { useEffect, useState } from "react";
import { thumbSrc } from "@/lib/media-url";
import { inferCategory } from "@/lib/product-category";
import { cn } from "@/lib/cn";

type Product = {
  id: string;
  title: string;
  images: string[];
  category?: string;
  affiliateUrl?: string;
  sourceUrl?: string;
};
type ScriptPack = { title?: string; hook?: string; voiceover?: string; scenes?: string[]; cta?: string };

const ANGLES = ["review", "unboxing", "hold", "talking", "lifestyle"] as const;

export function AffiliateCanvas({
  name,
  characterId,
  identity,
  stills,
  onMotion,
}: {
  name: string;
  characterId: string;
  identity: string | null;
  stills: { url: string; label: string }[];
  onMotion: (opts: { imageUrl: string; prompt: string; durationSec: number; engineId?: string; sound?: boolean }) => void;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState("");
  const [angle, setAngle] = useState<(typeof ANGLES)[number]>("hold");
  const [script, setScript] = useState<ScriptPack | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [still, setStill] = useState(identity || stills[0]?.url || "");

  useEffect(() => {
    fetch("/api/commerce/products")
      .then((r) => r.json())
      .then((j) => {
        const list = (j.products || []) as Product[];
        setProducts(list);
        const q = new URLSearchParams(window.location.search).get("product");
        if (q && list.some((p) => p.id === q)) setProductId(q);
        else if (list[0]) setProductId(list[0].id);
      })
      .catch(() => undefined);
  }, []);

  const product = products.find((p) => p.id === productId);
  const groups = new Map<string, Product[]>();
  for (const p of products) {
    const cat = inferCategory(p);
    groups.set(cat, [...(groups.get(cat) || []), p]);
  }

  async function writeScript() {
    if (!productId) return;
    setBusy("script");
    setError("");
    try {
      const res = await fetch("/api/jobs/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, characterId, angle }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "script failed");
      setScript(json.script || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="p-4">
      <p className="text-[11px] font-semibold tracking-[0.16em] text-[#9CA3AF]">AFFILIATE VIDEO</p>
      <h2 className="mt-1 text-lg font-black">@{name} · SKU → script → clip</h2>
      <p className="mt-1 max-w-xl text-[13px] text-[#6B7280]">
        Script pakai Qwen 3.7 Plus. Clip dari still on-model (Image to video). Factory faceless tetap terpisah.
      </p>
      {error ? <p className="mt-2 text-[12px] text-red-600">{error}</p> : null}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div>
          <p className="text-[12px] font-semibold">Product</p>
          {[...groups.entries()].map(([cat, rows]) => (
            <div key={cat} className="mt-2">
              <p className="text-[11px] font-semibold tracking-[0.14em] text-[#9CA3AF]">{cat.toUpperCase()}</p>
              <div className="mt-1 flex flex-wrap gap-2">
                {rows.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setProductId(p.id)}
                    className={cn(
                      "flex max-w-[14rem] items-center gap-2 rounded-xl border px-2 py-1.5 text-left",
                      productId === p.id ? "border-[#E11D48] bg-[#FFF1F2]" : "border-[#E5E7EB] bg-white",
                    )}
                  >
                    {p.images[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumbSrc(p.images[0], 64)} alt="" className="h-10 w-10 rounded-md object-cover" />
                    ) : (
                      <span className="h-10 w-10 rounded-md bg-[#F3F4F8]" />
                    )}
                    <span className="line-clamp-2 text-[11px] font-semibold">{p.title}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          {!products.length ? (
            <p className="mt-2 text-[12px] text-[#9CA3AF]">
              No SKU. Import in{" "}
              <a href="/commerce/products" className="font-semibold text-[#E11D48]">
                Products
              </a>
              .
            </p>
          ) : null}

          <p className="mt-4 text-[12px] font-semibold">Angle</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {ANGLES.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAngle(a)}
                className={cn(
                  "rounded-full px-3 py-1 text-[12px] font-semibold capitalize",
                  angle === a ? "bg-[#E11D48] text-white" : "border border-[#E5E7EB]",
                )}
              >
                {a}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={!productId || Boolean(busy)}
            onClick={() => void writeScript()}
            className="mt-3 rounded-full bg-[#E11D48] px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-40"
          >
            {busy === "script" ? "Writing…" : "Write UGC script"}
          </button>
        </div>

        <div className="rounded-xl border border-[#FECACA] p-3">
          <p className="text-[12px] font-semibold">Still for clip</p>
          {still ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbSrc(still, 480)} alt="" className="mt-2 aspect-[3/4] w-full rounded-lg object-cover" />
          ) : (
            <p className="mt-2 text-[12px] text-[#9CA3AF]">Generate an on-model still first (Edit product).</p>
          )}
          <div className="mt-2 grid max-h-40 grid-cols-4 gap-1 overflow-auto">
            {stills.map((s) => (
              <button
                key={s.url}
                type="button"
                onClick={() => setStill(s.url)}
                className={cn("overflow-hidden rounded-md border", still === s.url ? "border-[#E11D48]" : "border-[#E5E7EB]")}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={thumbSrc(s.url, 160)} alt="" className="aspect-square w-full object-cover" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {script ? (
        <div className="mt-4 rounded-xl border border-[#E5E7EB] bg-white p-3 text-[13px]">
          <p className="font-semibold">{script.title}</p>
          <p className="mt-1 text-[#6B7280]">Hook: {script.hook}</p>
          <p className="mt-2 whitespace-pre-wrap">{script.voiceover}</p>
          <p className="mt-2 text-[12px] font-semibold">CTA: {script.cta}</p>
          <button
            type="button"
            disabled={!still}
            onClick={() =>
              onMotion({
                imageUrl: still,
                prompt: [script.hook, script.scenes?.join(". "), "Natural motion, keep identity, product readable."]
                  .filter(Boolean)
                  .join(" "),
                durationSec: 8,
                sound: true,
              })
            }
            className="mt-3 rounded-full bg-[#111827] px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-40"
          >
            Generate clip from still
          </button>
        </div>
      ) : null}
    </div>
  );
}
