"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Btn, EmptyState, inputClass, Page, Pill, Surface } from "@/components/ui";
import { inferCategory } from "@/lib/product-category";
import { thumbSrc } from "@/lib/media-url";
import { cn } from "@/lib/cn";

type ScorePart = { id: string; label: string; weight: number; value: number; note: string };
type Product = {
  id: string;
  provider: string;
  providerProductId: string;
  title: string;
  category?: string;
  images: string[];
  features: string[];
  sourceUrl: string;
  affiliateUrl: string;
  score: number;
  scoreParts: ScorePart[];
  disclosure?: string;
  createdAt: string;
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [url, setUrl] = useState("");
  const [tag, setTag] = useState("");
  const [tagSet, setTagSet] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [openScore, setOpenScore] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editFeatures, setEditFeatures] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [slide, setSlide] = useState<Record<string, number>>({});
  const [catFilter, setCatFilter] = useState("all");
  const [q, setQ] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    const res = await fetch("/api/commerce/products");
    const json = await res.json();
    setProducts(json.products || []);
    setTagSet(Boolean(json.amazonAssociateTag));
  }

  useEffect(() => {
    void load();
  }, []);

  async function importUrl(e: React.FormEvent) {
    e.preventDefault();
    setBusy("import");
    setError("");
    try {
      const res = await fetch("/api/commerce/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import", url }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "import failed");
      setUrl("");
      setProducts(json.products || []);
      setNotice(json.warning || `Imported ${(json.product?.title as string) || "SKU"}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function saveTag(e: React.FormEvent) {
    e.preventDefault();
    setBusy("tag");
    try {
      const res = await fetch("/api/commerce/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "tag", tag }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setTag("");
      setTagSet(Boolean(json.amazonAssociateTag));
    } finally {
      setBusy("");
    }
  }

  function startEdit(p: Product) {
    setEditId(p.id);
    setEditTitle(p.title);
    setEditFeatures((p.features || []).join("\n"));
    setEditPrice("");
    setEditCategory(inferCategory(p));
  }

  async function saveEdit(id: string) {
    setBusy(`edit-${id}`);
    setError("");
    try {
      const res = await fetch("/api/commerce/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "patch",
          id,
          title: editTitle,
          features: editFeatures.split(/\n+/).map((s) => s.trim()).filter(Boolean),
          price: editPrice,
          category: editCategory,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "save failed");
      setProducts(json.products || []);
      setEditId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function addPhotos(id: string, files: FileList | null) {
    if (!files?.length) return;
    setBusy(`img-${id}`);
    setError("");
    try {
      for (const f of [...files].slice(0, 6)) {
        const form = new FormData();
        form.append("file", f);
        form.append("kind", "product");
        const up = await fetch("/api/media/upload", { method: "POST", body: form });
        const uj = await up.json();
        if (!up.ok) throw new Error(uj.error || "upload failed");
        const res = await fetch("/api/commerce/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "add-image", id, mediaUrl: uj.mediaUrl }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "attach failed");
        setProducts(json.products || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function createManual(e: React.FormEvent) {
    e.preventDefault();
    setBusy("create");
    setError("");
    try {
      const res = await fetch("/api/commerce/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", title: manualTitle }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "create failed");
      setManualTitle("");
      setProducts(json.products || []);
      if (json.product?.id) startEdit(json.product as Product);
      setNotice("SKU created. Upload pack shots (3 angles helps on-model).");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function localize(id: string) {
    setBusy(`loc-${id}`);
    setError("");
    try {
      const res = await fetch("/api/commerce/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "localize", id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "download failed");
      setProducts(json.products || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function removeProduct(id: string) {
    if (!window.confirm("Delete this SKU from the catalog?")) return;
    setBusy(`del-${id}`);
    try {
      const res = await fetch("/api/commerce/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "delete failed");
      setProducts(json.products || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  const grouped = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const map = new Map<string, Product[]>();
    for (const p of products) {
      const cat = inferCategory(p);
      if (catFilter !== "all" && cat !== catFilter) continue;
      if (needle && !`${p.title} ${p.provider} ${p.providerProductId}`.toLowerCase().includes(needle)) continue;
      map.set(cat, [...(map.get(cat) || []), p]);
    }
    return [...map.entries()];
  }, [products, catFilter, q]);
  const cats = useMemo(() => {
    const s = new Set(products.map((p) => inferCategory(p)));
    return ["all", ...[...s].sort()];
  }, [products]);

  return (
    <Page
      kicker="COMMERCE · PRODUCTS"
      title="Product catalog"
      description="SKU hub for on-model stills and affiliate video. Import a listing or add pack shots by hand when the shop blocks scrape."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Surface>
          <p className="text-[11px] font-semibold tracking-[0.18em] text-[#9CA3AF]">IMPORT URL</p>
          <p className="mt-1 text-[12px] text-[#6B7280]">Amazon, Shopee, Tokopedia, Lazada, TikTok Shop. Photos are saved to disk so Comfy can use them.</p>
          <form onSubmit={(e) => void importUrl(e)} className="mt-3 space-y-3">
            <textarea
              required
              rows={3}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.amazon.com/dp/…  or shopee / tokopedia link"
              className={inputClass}
            />
            <Btn type="submit" disabled={Boolean(busy)}>
              {busy === "import" ? "Importing…" : "Import product"}
            </Btn>
          </form>
        </Surface>
        <Surface>
          <p className="text-[11px] font-semibold tracking-[0.18em] text-[#9CA3AF]">ADD SKU MANUALLY</p>
          <p className="mt-1 text-[12px] text-[#6B7280]">Scrape empty? Name it, then Upload photos. Same catalog the character Affiliate video reads.</p>
          <form onSubmit={(e) => void createManual(e)} className="mt-3 space-y-3">
            <input
              required
              value={manualTitle}
              onChange={(e) => setManualTitle(e.target.value)}
              placeholder="SKU name — e.g. Coral satin bikini"
              className={inputClass}
            />
            <Btn type="submit" variant="ghost" disabled={Boolean(busy)}>
              {busy === "create" ? "Saving…" : "Create SKU"}
            </Btn>
          </form>
          <form onSubmit={(e) => void saveTag(e)} className="mt-6 border-t border-[#E6E8EE] pt-4">
            <p className="text-[11px] font-semibold tracking-[0.18em] text-[#9CA3AF]">AMAZON ASSOCIATE TAG</p>
            <p className="mt-1 text-[12px] text-[#6B7280]">
              {tagSet ? "Tag is set. New Amazon imports append ?tag=." : "Optional. Also AMAZON_ASSOCIATE_TAG in env."}
            </p>
            <div className="mt-2 flex gap-2">
              <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="yourtag-20" className={inputClass} />
              <Btn type="submit" variant="ghost" disabled={Boolean(busy)}>
                Save
              </Btn>
            </div>
          </form>
        </Surface>
      </div>
      {error ? <p className="mt-3 text-[12px] text-red-600">{error}</p> : null}
      {notice ? <p className="mt-3 text-[12px] text-[#166534]">{notice}</p> : null}

      <div className="mt-10 flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-[11px] font-semibold tracking-[0.16em] text-[#9CA3AF]">CATALOG · {products.length}</h2>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search title / ASIN"
          className="w-full max-w-xs rounded-xl border border-[#E6E8EE] bg-white px-3 py-2 text-sm outline-none"
        />
      </div>
      {cats.length > 1 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {cats.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCatFilter(c)}
              className={cn(
                "rounded-full px-3 py-1 text-[12px] font-semibold capitalize",
                catFilter === c ? "bg-[#652DFF] text-white" : "border border-[#E6E8EE] bg-white text-[#4B5563]",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      ) : null}
      {products.length === 0 ? (
        <div className="mt-2">
          <EmptyState title="No products" body="Paste a Shopee / Amazon URL. Then open a character → Affiliate video." />
        </div>
      ) : (
        <div className="mt-4 space-y-8">
          {grouped.map(([cat, rows]) => (
            <section key={cat}>
              <h3 className="text-[12px] font-black tracking-[0.14em] text-[#111827]">{cat.toUpperCase()}</h3>
              <ul className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {rows.map((p) => {
                  const imgs = p.images.filter(Boolean);
                  const i = slide[p.id] || 0;
                  const img = imgs[i] || imgs[0];
                  return (
            <li key={p.id}>
              <Surface>
                <div className="flex gap-3">
                  <div className="relative h-28 w-24 shrink-0 overflow-hidden rounded-xl bg-[#F3F4F8]">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumbSrc(img, 320)} alt="" className="h-full w-full object-cover" />
                    ) : null}
                    {imgs.length > 1 ? (
                      <>
                        <button
                          type="button"
                          className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-1.5 text-[11px] text-white"
                          onClick={() => setSlide((s) => ({ ...s, [p.id]: (i - 1 + imgs.length) % imgs.length }))}
                        >
                          ‹
                        </button>
                        <button
                          type="button"
                          className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-black/50 px-1.5 text-[11px] text-white"
                          onClick={() => setSlide((s) => ({ ...s, [p.id]: (i + 1) % imgs.length }))}
                        >
                          ›
                        </button>
                        <p className="absolute bottom-1 left-0 right-0 text-center text-[10px] font-semibold text-white">
                          {i + 1}/{imgs.length}
                        </p>
                      </>
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Pill tone="muted">{p.provider}</Pill>
                      <button type="button" className="text-[12px] font-black text-[#652DFF]" onClick={() => setOpenScore(openScore === p.id ? null : p.id)}>
                        Score {p.score}
                      </button>
                    </div>
                    <p className="mt-1 text-sm font-semibold leading-snug">{p.title}</p>
                    <p className="mt-1 truncate font-mono text-[11px] text-[#9CA3AF]">{p.providerProductId}</p>
                    <p className="mt-1 text-[11px] text-[#6B7280]">
                      {p.price ? `${p.currency ? `${p.currency} ` : ""}${p.price} · ` : ""}
                      {imgs.length} photo{imgs.length === 1 ? "" : "s"}
                      {imgs.some((u) => /^https?:\/\//i.test(u)) ? " · some remote" : imgs.length ? " · local" : ""}
                    </p>
                    {!p.images[0] ? <p className="mt-1 text-[11px] text-[#B45309]">No photo — on-model still will fail. Upload pack shots.</p> : null}
                  </div>
                </div>
                {openScore === p.id ? (
                  <ul className="mt-3 space-y-1 rounded-xl bg-[#F3F4F8] p-3 text-[11px] text-[#4B5563]">
                    {p.scoreParts.map((s) => (
                      <li key={s.id} className="flex justify-between gap-2">
                        <span>
                          {s.label} · {s.weight}%
                          <span className="mt-0.5 block text-[#9CA3AF]">{s.note}</span>
                        </span>
                        <span className="font-semibold">{s.value}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {editId === p.id ? (
                  <div className="mt-3 space-y-2">
                    <input className={inputClass} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Title" />
                    <input className={inputClass} value={editCategory} onChange={(e) => setEditCategory(e.target.value)} placeholder="Category (Fashion, Beauty…)" />
                    <input className={inputClass} value={editPrice} onChange={(e) => setEditPrice(e.target.value)} placeholder="Price (optional)" />
                    <textarea className={inputClass} rows={4} value={editFeatures} onChange={(e) => setEditFeatures(e.target.value)} placeholder="Features, one per line" />
                    <div className="flex flex-wrap gap-2">
                      <Btn type="button" disabled={busy === `edit-${p.id}`} onClick={() => void saveEdit(p.id)}>
                        Save SKU
                      </Btn>
                      <Btn type="button" variant="ghost" onClick={() => setEditId(null)}>
                        Cancel
                      </Btn>
                    </div>
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Btn type="button" variant="ghost" onClick={() => startEdit(p)}>
                    Edit
                  </Btn>
                  <label className="inline-flex cursor-pointer items-center rounded-full border border-[#E6E8EE] px-3 py-1.5 text-[12px] font-semibold">
                    Upload photos
                    <input type="file" accept="image/png,image/jpeg,image/webp" multiple className="hidden" onChange={(e) => void addPhotos(p.id, e.target.files)} />
                  </label>
                  {p.images.some((u) => /^https?:\/\//i.test(u)) ? (
                    <Btn type="button" variant="ghost" disabled={busy === `loc-${p.id}`} onClick={() => void localize(p.id)}>
                      {busy === `loc-${p.id}` ? "Saving…" : "Save photos local"}
                    </Btn>
                  ) : null}
                  <Link
                    href={`/create/characters?product=${p.id}`}
                    className="rounded-full bg-[#652DFF] px-3 py-1.5 text-[12px] font-semibold text-white"
                  >
                    Affiliate video
                  </Link>
                  <a href={p.affiliateUrl || p.sourceUrl} target="_blank" rel="noreferrer" className="rounded-full border border-[#E6E8EE] px-3 py-1.5 text-[12px] font-semibold">
                    Open listing
                  </a>
                  <button type="button" className="text-[12px] font-semibold text-[#E11D48]" onClick={() => void removeProduct(p.id)}>
                    Delete
                  </button>
                </div>
              </Surface>
            </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Page>
  );
}
