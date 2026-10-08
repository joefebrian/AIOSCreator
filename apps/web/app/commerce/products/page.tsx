"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Clapperboard, Copy, Download, ExternalLink, ImagePlus, Pencil, Play, Trash2, UserRound, X } from "lucide-react";
import { ProductDetail } from "@/components/commerce/ProductDetail";
import { Btn, EmptyState, inputClass } from "@/components/ui";
import { inferCategory, PRODUCT_CATEGORIES } from "@/lib/product-category";
import { thumbSrc } from "@/lib/media-url";
import { cn } from "@/lib/cn";

const iconBtn =
  "grid h-6 w-6 shrink-0 place-items-center rounded-md text-[#6B7280] transition hover:bg-[#F3F4F8] hover:text-[#111827] disabled:opacity-40";

const MARKET_COUNTRY: Record<string, string> = {
  com: "United States",
  us: "United States",
  "co.id": "Indonesia",
  id: "Indonesia",
  "com.my": "Malaysia",
  my: "Malaysia",
  sg: "Singapore",
  "com.sg": "Singapore",
  "co.th": "Thailand",
  th: "Thailand",
  "co.uk": "United Kingdom",
  uk: "United Kingdom",
  gb: "United Kingdom",
  de: "Germany",
  "co.jp": "Japan",
  jp: "Japan",
  "com.au": "Australia",
  au: "Australia",
  ca: "Canada",
  fr: "France",
  it: "Italy",
  es: "Spain",
  "com.br": "Brazil",
  br: "Brazil",
  in: "India",
  "com.mx": "Mexico",
  mx: "Mexico",
  "com.ph": "Philippines",
  ph: "Philippines",
  vn: "Vietnam",
  tw: "Taiwan",
  "co.kr": "South Korea",
  kr: "South Korea",
};

function productCountry(p: { market?: string; sourceUrl?: string }) {
  const market = (p.market || "").toLowerCase();
  if (MARKET_COUNTRY[market]) return MARKET_COUNTRY[market];
  try {
    const host = new URL(p.sourceUrl || "").hostname.replace(/^www\./, "").toLowerCase();
    const amazon = host.match(/^amazon\.([a-z.]+)$/);
    if (amazon && MARKET_COUNTRY[amazon[1]]) return MARKET_COUNTRY[amazon[1]];
    const shopee = host.match(/(?:^|\.)shopee\.([a-z.]+)$/);
    if (shopee && MARKET_COUNTRY[shopee[1]]) return MARKET_COUNTRY[shopee[1]];
  } catch {
    /* manual SKU */
  }
  return market || "Other";
}

type Product = {
  id: string;
  provider: string;
  providerProductId: string;
  title: string;
  brand?: string;
  category?: string;
  images: string[];
  imageRoles?: ("identity" | "detail" | "usage" | "packaging" | "other")[];
  defaultImageUrl?: string;
  features: string[];
  sourceUrl: string;
  affiliateUrl: string;
  market?: string;
  price?: string;
  currency?: string;
  createdAt: string;
  referenceAds?: { id: string; heroStatus: string; heroUrl?: string; videoUrl?: string }[];
  instagramUsername?: string;
  brandedMatches?: { suggestedTemplateId: string; windowStart?: string; windowEnd?: string; counts: Record<string, number>; posts: { creationDate?: string; type: string; url: string; creatorName?: string }[] };
};

const SHOP: Record<string, string> = {
  amazon: "Amazon",
  ebay: "eBay",
  shopee: "Shopee",
  aliexpress: "AliExpress",
  "tiktok-shop": "TikTok Shop",
  tokopedia: "Tokopedia",
  lazada: "Lazada",
  other: "SKU",
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [url, setUrl] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailFocus, setDetailFocus] = useState<"references" | "">("");
  const detailIdRef = useRef<string | null>(null);
  detailIdRef.current = detailId;
  const [tagSet, setTagSet] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBrand, setEditBrand] = useState("");
  const [editFeatures, setEditFeatures] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editAffiliate, setEditAffiliate] = useState("");
  const [linkOpen, setLinkOpen] = useState(false);
  const [copiedId, setCopiedId] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editNewCategory, setEditNewCategory] = useState("");
  const [catDraftId, setCatDraftId] = useState<string | null>(null);
  const [catDraft, setCatDraft] = useState("");
  const skipCat = useRef(false);
  const [slide, setSlide] = useState<Record<string, number>>({});
  const [catFilter, setCatFilter] = useState("all");
  const [countryFilter, setCountryFilter] = useState("All");
  const [q, setQ] = useState("");
  const [manualPhotos, setManualPhotos] = useState<File[]>([]);
  const photoRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState("");
  const [igDraft, setIgDraft] = useState<Record<string, string>>({});

  function note(text: string) {
    setNotice(text);
  }
  const [ads, setAds] = useState<{ id: string; source: string; note: string; heroStatus: string; videoUrl?: string; productId?: string }[]>([]);
  const [makeId, setMakeId] = useState<string | null>(null);
  const [photoId, setPhotoId] = useState<string | null>(null);
  const [photoNote, setPhotoNote] = useState<Record<string, string>>({});

  async function load() {
    try {
      const res = await fetch("/api/commerce/products");
      const json = await res.json();
      setProducts(json.products || []);
      setAds(json.referenceAds || []);
      setTagSet(Boolean(json.amazonAssociateTag));
    } finally {
      setLoaded(true);
    }
  }

  const leaveDetail = useCallback(() => {
    const wasOpen = detailIdRef.current != null;
    setDetailId(null);
    setDetailFocus("");
    const url = new URL(window.location.href);
    if (url.searchParams.has("product")) {
      url.searchParams.delete("product");
      window.history.replaceState(null, "", url.pathname + url.search);
    }
    if (wasOpen) document.querySelector("main")?.scrollTo(0, 0);
  }, []);

  function openDetail(id: string, focus?: "references") {
    setDetailFocus(focus || "");
    setDetailId(id);
    document.querySelector("main")?.scrollTo(0, 0);
  }

  useEffect(() => {
    void load();
    const id = new URLSearchParams(window.location.search).get("product");
    if (id) openDetail(id);
  }, []);

  useEffect(() => {
    function onNav(event: Event) {
      if ((event as CustomEvent<string>).detail !== "/commerce/products") return;
      leaveDetail();
    }
    window.addEventListener("creatoros:nav", onNav);
    return () => window.removeEventListener("creatoros:nav", onNav);
  }, [leaveDetail]);

  useEffect(() => {
    if (!makeId) return;
    const onDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("[data-make-video]")) return;
      setMakeId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMakeId(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [makeId]);

  useEffect(() => {
    if (!photoId) return;
    const onDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest("[data-photo]")) return;
      setPhotoId(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPhotoId(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [photoId]);

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
      setAds(json.referenceAds || ads);
      note(json.warning || `Imported ${(json.product?.title as string) || "SKU"}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  function startEdit(p: Product) {
    setEditId(p.id);
    setEditTitle(p.title);
    setEditBrand(p.brand || "");
    setEditFeatures((p.features || []).join("\n"));
    setEditPrice(p.price || "");
    setEditAffiliate(p.affiliateUrl || "");
    setLinkOpen(false);
    setEditCategory(inferCategory(p) === "Uncategorized" ? "" : inferCategory(p));
    setEditNewCategory("");
  }

  function categoryName(raw: string) {
    const name = raw.trim().replace(/\s+/g, " ").slice(0, 32);
    if (!name || /^uncategorized$/i.test(name)) return "";
    return name;
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
          brand: editBrand,
          features: editFeatures.split(/\n+/).map((s) => s.trim()).filter(Boolean),
          price: editPrice,
          affiliateUrl: editAffiliate,
          category: editCategory === "__new__" ? categoryName(editNewCategory) : editCategory,
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

  async function tidyCopy(id: string) {
    setBusy(`tidy-${id}`);
    setError("");
    try {
      const res = await fetch("/api/commerce/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "tidy-copy",
          id,
          title: editTitle,
          features: editFeatures.split(/\n+/).map((s) => s.trim()).filter(Boolean),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "tidy failed");
      setProducts(json.products || []);
      const row = (json.products as Product[] | undefined)?.find((item) => item.id === id) || (json.product as Product | undefined);
      if (row) setEditFeatures((row.features || []).join("\n"));
      note("Description ready for the script.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function addPhotos(id: string, files: FileList | File[] | null, busyKey = `img-${id}`) {
    const list = files ? [...files].slice(0, 6) : [];
    if (!list.length) return false;
    setBusy(busyKey);
    setError("");
    try {
      for (const f of list) {
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
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusy("");
    }
  }

  async function regenPhoto(id: string) {
    const instruction = (photoNote[id] || "").trim();
    if (!instruction) {
      setError("Type what to change on the photo.");
      return;
    }
    const product = products.find((item) => item.id === id);
    const imgs = (product?.images || []).filter((u) => u && !/^https?:\/\//i.test(u));
    const mediaUrl = imgs[slide[id] || 0] || imgs[0];
    if (!mediaUrl) {
      setError("Upload a product photo first.");
      return;
    }
    const slow = /\b(te(?:xt|ks)|tulisan|watermark|banner|overlay|caption|subtitle|harga|clean(?:\s*up)? text)\b/i.test(instruction)
      || !/\b(backgrounds?|backgrouds?|latar|transparan|transparant|transparent|cut ?outs?)\b/i.test(instruction);
    setBusy(`regen-${id}`);
    setError("");
    note(slow ? "Cleaning the photo. Text edits take a few minutes." : "Cutting the background out.");
    try {
      const res = await fetch("/api/commerce/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "regen-photo", id, mediaUrl, instruction }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "photo clean failed");
      setProducts(json.products || []);
      setSlide((prev) => ({ ...prev, [id]: 0 }));
      note(json.warning || (json.plan?.matte ? "Photo cleaned. Background is transparent. The old slide is still there." : "Photo cleaned. The old slide is still there."));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      note("");
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
        body: JSON.stringify({ action: "create", title: "" }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "create failed");
      const photos = manualPhotos;
      setManualPhotos([]);
      if (photoRef.current) photoRef.current.value = "";
      setProducts(json.products || []);
      const created = json.product as Product | undefined;
      if (created?.id && photos.length) {
        const uploaded = await addPhotos(created.id, photos, "create");
        note(
          uploaded
            ? photos.length === 1
              ? "SKU added with 1 photo. Name it on the card."
              : `SKU added with ${photos.length} photos. Name it on the card.`
            : "SKU added. Photo upload failed.",
        );
        startEdit(created);
      } else if (created?.id) {
        startEdit(created);
        note("SKU added. Name it on the card.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function setCategory(id: string, category: string) {
    setBusy(`cat-${id}`);
    setError("");
    try {
      const res = await fetch("/api/commerce/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "patch", id, category }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not set the category.");
      setProducts(json.products || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function removePhoto(id: string, mediaUrl: string) {
    if (!window.confirm("Remove this photo?")) return;
    const current = slide[id] || 0;
    setBusy(`rmimg-${id}`);
    setError("");
    try {
      const res = await fetch("/api/commerce/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove-image", id, mediaUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not remove the photo.");
      const next = (json.products || []) as Product[];
      setProducts(next);
      const row = next.find((item) => item.id === id);
      const count = (row?.images || []).filter((u) => u && !/^https?:\/\//i.test(u)).length;
      setSlide((s) => ({ ...s, [id]: count ? Math.min(current, count - 1) : 0 }));
      note("Photo removed.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      note("");
    } finally {
      setBusy("");
    }
  }

  async function setDefault(id: string, mediaUrl: string) {
    setBusy(`def-${id}`);
    setError("");
    try {
      const res = await fetch("/api/commerce/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set-default", id, mediaUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not set the default photo.");
      setProducts(json.products || []);
      setSlide((current) => ({ ...current, [id]: 0 }));
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
    if (!window.confirm("Delete this SKU?")) return;
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

  async function matchBrand(id: string) {
    const instagramUsername = (igDraft[id] ?? products.find((row) => row.id === id)?.instagramUsername ?? "").trim().replace(/^@/, "");
    setBusy(`ig-${id}`);
    setError("");
    try {
      const res = await fetch("/api/commerce/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "branded-search", id, instagramUsername }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "brand match failed");
      setProducts(json.products || []);
      openDetail(id, "references");
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
      if (countryFilter !== "All" && productCountry(p) !== countryFilter) continue;
      if (needle && !`${p.title} ${p.provider} ${p.providerProductId}`.toLowerCase().includes(needle)) continue;
      map.set(cat, [...(map.get(cat) || []), p]);
    }
    return [...map.entries()];
  }, [products, catFilter, countryFilter, q]);
  const cats = useMemo(() => {
    const s = new Set(products.map((p) => inferCategory(p)));
    return ["all", ...[...s].sort()];
  }, [products]);
  const countries = useMemo(() => {
    const names = new Set(products.map((p) => productCountry(p)));
    return ["All", ...[...names].sort((a, b) => a.localeCompare(b))];
  }, [products]);
  const visibleCount = grouped.reduce((sum, [, rows]) => sum + rows.length, 0);
  const setupCategories = useMemo(() => {
    const names = new Set<string>(PRODUCT_CATEGORIES);
    for (const p of products) {
      const cat = inferCategory(p);
      if (cat !== "Uncategorized") names.add(cat);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [products]);
  if (detailId) {
    const selected = products.find((row) => row.id === detailId);
    const image = selected?.defaultImageUrl || selected?.images.find((item) => item.startsWith("/api/media/"));
    return (
      <ProductDetail
        productId={detailId}
        title={selected?.title || ""}
        image={image}
        brand={selected?.brand}
        instagramUsername={selected?.instagramUsername}
        brandedMatches={selected?.brandedMatches}
        openReferences={detailFocus === "references"}
        onBrand={(brand) => setProducts((prev) => prev.map((row) => row.id === detailId ? { ...row, brand: brand || undefined } : row))}
        onBack={leaveDetail}
      />
    );
  }

  return (
    <div className="px-3 py-3 md:px-4">
      <div className="sticky top-0 z-10 -mx-3 mb-3 border-b border-[#E6E8EE] bg-[#F3F4F8]/95 px-3 py-2 backdrop-blur md:-mx-4 md:px-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-base font-bold tracking-tight">Products</h1>
          <Btn type="button" className="ml-1" onClick={() => setAddOpen(true)}>Add product</Btn>
          <span className="text-[12px] text-[#6B7280]">{loaded ? `${visibleCount} SKU` : "Loading…"}</span>
          <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-1">
            {countries.length > 2 ? (
              countries.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setCountryFilter(name)}
                    className={cn(
                      "shrink-0 rounded-full border px-2 py-1! text-[11px]! leading-none! font-medium!",
                      countryFilter === name ? "border-[#111827] bg-[#111827] text-white" : "border-[#E6E8EE] bg-white text-[#6B7280] hover:text-[#111827]",
                    )}
                  >
                    {name}
                  </button>
              ))
            ) : null}
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search"
              className="w-36 shrink-0 rounded-full border border-[#E6E8EE] bg-white px-3 py-1 text-[12px] outline-none"
            />
          </div>
        </div>
        {cats.length > 1 ? (
          <div className="mt-2 flex gap-1 overflow-x-auto">
            {cats.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCatFilter(c)}
                className={cn(
                  "shrink-0 rounded-full px-1.5 py-0.5! text-[10px]! leading-none! font-medium!",
                  catFilter === c ? "bg-[#111827] text-white" : "text-[#6B7280] hover:bg-white",
                )}
              >
                {c}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {addOpen ? (
      <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#E6E8EE] bg-white p-4">
      <div className="mb-3 flex items-center justify-between"><p className="font-black">Add product</p><button type="button" onClick={() => setAddOpen(false)}>Close</button></div>
      <div className="flex flex-col gap-2">
        <form onSubmit={(e) => void importUrl(e)} className="flex min-w-0 flex-1 gap-2">
          <input
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Shop link, Meta Ad Library, or TikTok Creative Center"
            className="w-0 min-w-0 max-w-full flex-1 rounded-xl border border-[#E6E8EE] bg-white px-3 py-2 text-sm outline-none focus:border-[#7C6CFF]"
          />
          <Btn type="submit" className="shrink-0" disabled={Boolean(busy)}>
            {busy === "import" ? "…" : "Import"}
          </Btn>
        </form>
        <form onSubmit={(e) => void createManual(e)} className="flex shrink-0 items-center gap-2">
          <label
            title={manualPhotos.length ? `${manualPhotos.length} photos selected` : "Add photos"}
            className="relative inline-flex h-[38px] shrink-0 cursor-pointer items-center gap-1 rounded-xl border border-[#E6E8EE] bg-white px-2.5 text-[13px] font-semibold text-[#374151] hover:border-[#111827]"
          >
            <ImagePlus size={15} />
            <span>Photos</span>
            {manualPhotos.length ? (
              <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-[#111827] px-1 text-[9px] font-semibold text-white">
                {manualPhotos.length}
              </span>
            ) : null}
            <input
              ref={photoRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              className="hidden"
              onChange={(e) => setManualPhotos(e.target.files ? [...e.target.files].slice(0, 6) : [])}
            />
          </label>
          <Btn type="submit" variant="ghost" className="shrink-0" disabled={Boolean(busy)}>
            {busy === "create" ? "…" : "Add"}
          </Btn>
        </form>
      </div>
      <p className="mt-2 text-[11px] text-[#6B7280]">A shop link uses the existing importer. An ad library link stays a reference and does not become a local listing.</p>
      </div>
      </div>
      ) : null}
      <p className="mt-2 text-[11px] text-[#6B7280]">
        Amazon tag {tagSet ? "set" : "not set"} ·{" "}
        <Link href="/commerce/programs" className="font-semibold text-[#652DFF]">
          Affiliate programs
        </Link>
      </p>
      {ads.length ? (
        <ul className="mt-3 grid gap-1 text-[12px]">
          {ads.slice(0, 4).map((ad) => (
            <li key={ad.id} className="rounded-lg bg-white px-3 py-2">
              {ad.source} · hero {ad.heroStatus} · {ad.videoUrl ? "reference video saved" : "no reference video"} · {ad.productId ? "linked to a SKU" : "waiting for a shop product"}
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p className="mt-3 text-[13px] text-red-600">{error}</p> : null}
      {notice ? <p className="mt-3 text-[13px] text-[#166534]">{notice}</p> : null}

      {!loaded ? (
        <p className="mt-8 text-[13px] text-[#6B7280]">Loading catalog…</p>
      ) : products.length === 0 ? (
        <div className="mt-4">
          <EmptyState title="No SKUs yet" body="Import a listing. If the shop blocks the scrape, add a name and upload pack shots." />
        </div>
      ) : visibleCount === 0 ? (
        <p className="mt-8 text-[13px] text-[#6B7280]">No SKUs in this view.</p>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(190px,1fr))]">
          {grouped.flatMap(([, rows]) => rows).map((p) => {
                  const imgs = p.images.filter((u) => u && !/^https?:\/\//i.test(u));
                  const i = slide[p.id] || 0;
                  const img = imgs[i] || imgs[0];
                  const roleIndex = img ? p.images.indexOf(img) : -1;
                  const role = roleIndex >= 0 ? p.imageRoles?.[roleIndex] : undefined;
                  const isDefault = Boolean(img && p.defaultImageUrl === img);
                  const remote = p.images.some((u) => /^https?:\/\//i.test(u));
                  return (
                    <li key={p.id} className={cn("relative rounded-xl border border-[#E6E8EE] bg-white", photoId === p.id && "z-20")}>
                      <div className="relative aspect-square overflow-hidden rounded-t-xl bg-[#F3F4F8]">
                        {img ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumbSrc(img, 320)}
                            alt=""
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="grid h-full place-items-center px-2 text-center text-[10px] text-[#9CA3AF]">
                            No photo
                          </div>
                        )}
                        {role ? (
                          <span className="absolute left-1 top-1 rounded-full bg-white/90 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-[#374151]">
                            {isDefault ? "Default" : role === "identity" ? "Suggested" : role}
                          </span>
                        ) : null}
                        {img && !isDefault ? (
                          <button
                            type="button"
                            title={p.provider === "shopee" ? "Skip banners and size charts. Use the photo that shows the whole product." : "Use this slide as the SKU photo."}
                            className="absolute right-1 top-1 rounded-full bg-white/90 px-1.5 py-0.5! text-[9px]! leading-none! font-semibold! text-[#111827] disabled:opacity-40"
                            disabled={busy === `def-${p.id}`}
                            onClick={() => void setDefault(p.id, img)}
                          >
                            {busy === `def-${p.id}` ? "Saving…" : "Set default"}
                          </button>
                        ) : null}
                        {imgs.length > 1 ? (
                          <>
                            <button
                              type="button"
                              className="absolute left-1 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-[11px] text-white"
                              onClick={() => setSlide((s) => ({ ...s, [p.id]: (i - 1 + imgs.length) % imgs.length }))}
                            >
                              ‹
                            </button>
                            <button
                              type="button"
                              className="absolute right-1 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-[11px] text-white"
                              onClick={() => setSlide((s) => ({ ...s, [p.id]: (i + 1) % imgs.length }))}
                            >
                              ›
                            </button>
                            <span className="absolute bottom-1 right-1 rounded-full bg-black/50 px-1.5 py-0.5 text-[9px] text-white">
                              {i + 1}/{imgs.length}
                            </span>
                          </>
                        ) : null}
                        {img ? (
                          <button
                            type="button"
                            title="Remove this photo"
                            aria-label="Remove this photo"
                            className="absolute bottom-1 left-1 grid h-5 w-5 place-items-center rounded-full bg-black/45 text-white disabled:opacity-40"
                            disabled={busy === `rmimg-${p.id}`}
                            onClick={() => void removePhoto(p.id, img)}
                          >
                            <X size={11} />
                          </button>
                        ) : null}
                      </div>
                      <div className="p-2">
                        <button type="button" className="block w-full truncate text-left text-[12px] font-semibold leading-tight" title={p.title} onClick={() => openDetail(p.id)}>{p.title}</button>
                        <div className="mt-1 flex min-w-0 items-center gap-1 text-[10px] leading-none text-[#9CA3AF]">
                          <span className="min-w-0 truncate">
                            {SHOP[p.provider] || p.provider}
                            {p.price ? ` · ${p.currency && !/^(Rp|RM|\$|S\$)/i.test(p.price) ? `${p.currency} ` : ""}${p.price}` : ""}
                          </span>
                          <span className="shrink-0 text-[#D1D5DB]" aria-hidden>·</span>
                          {catDraftId === p.id ? (
                            <input
                              autoFocus
                              aria-label="New category"
                              value={catDraft}
                              placeholder="New category"
                              className="w-24 shrink-0 border-0 bg-transparent p-0 text-[10px]! text-[#111827] outline-none placeholder:text-[#C4C8D0]"
                              onChange={(e) => setCatDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Escape") {
                                  skipCat.current = true;
                                  setCatDraft("");
                                  setCatDraftId(null);
                                }
                                if (e.key === "Enter") e.currentTarget.blur();
                              }}
                              onBlur={() => {
                                if (skipCat.current) {
                                  skipCat.current = false;
                                  return;
                                }
                                const name = categoryName(catDraft);
                                setCatDraftId(null);
                                setCatDraft("");
                                if (name) void setCategory(p.id, name);
                              }}
                            />
                          ) : (
                            <label className={cn("relative inline-flex shrink-0 items-center gap-0.5 text-[#6B7280]", busy === `cat-${p.id}` && "opacity-40")}>
                              <span className="max-w-[7.5rem] truncate" aria-hidden>
                                {busy === `cat-${p.id}` ? "Saving…" : inferCategory(p)}
                              </span>
                              <ChevronDown size={10} aria-hidden />
                              <select
                                aria-label="Category"
                                className="absolute inset-0 cursor-pointer opacity-0"
                                value={inferCategory(p) === "Uncategorized" ? "" : inferCategory(p)}
                                disabled={busy === `cat-${p.id}`}
                                onChange={(e) => {
                                  if (e.target.value === "__new__") {
                                    setCatDraft("");
                                    setCatDraftId(p.id);
                                    return;
                                  }
                                  void setCategory(p.id, e.target.value);
                                }}
                              >
                                <option value="">Uncategorized</option>
                                {setupCategories.map((cat) => (
                                  <option key={cat} value={cat}>{cat}</option>
                                ))}
                                <option value="__new__">Add category…</option>
                              </select>
                            </label>
                          )}
                        </div>
                        {p.referenceAds?.length ? (
                          <p className="mt-0.5 truncate text-[10px] text-[#6B7280]">
                            Ad reference · {p.referenceAds.some((ad) => ad.heroUrl) ? "hero kept separate" : "no product hero"} · {p.referenceAds.some((ad) => ad.videoUrl) ? "video saved" : "no video"}
                          </p>
                        ) : null}
                        <form className="mt-2 flex h-7 items-center rounded-lg bg-[#F4F5F8] pl-2" onSubmit={(e) => { e.preventDefault(); void matchBrand(p.id); }}>
                          <span className="shrink-0 text-[11px] leading-none text-[#9CA3AF]" aria-hidden>@</span>
                          <input
                            name="ig"
                            value={(igDraft[p.id] ?? p.instagramUsername ?? "").replace(/^@/, "")}
                            placeholder="official"
                            autoComplete="off"
                            spellCheck={false}
                            aria-label="Official Instagram username"
                            onChange={(e) => setIgDraft((draft) => ({ ...draft, [p.id]: e.target.value.replace(/^@/, "") }))}
                            className="min-w-0 flex-1 border-0 bg-transparent pl-0.5 text-[11px]! leading-none! text-[#111827] outline-none placeholder:text-[#C4C8D0]"
                          />
                          <button type="submit" disabled={busy === `ig-${p.id}`} className="h-full shrink-0 rounded-r-lg px-2 text-[10px]! font-semibold! leading-none! text-[#111827] hover:bg-white disabled:opacity-40">Match</button>
                        </form>
                        {editId === p.id ? (
                          <div className="mt-3 space-y-2">
                            <input className={inputClass} value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="Title" />
                            <input className={inputClass} value={editBrand} onChange={(e) => setEditBrand(e.target.value)} placeholder="Brand" aria-label="Brand" maxLength={80} />
                            <select className={inputClass} value={editCategory === "__new__" || setupCategories.includes(editCategory) ? editCategory : ""} onChange={(e) => setEditCategory(e.target.value)}>
                              <option value="">Uncategorized</option>
                              {setupCategories.map((cat) => (
                                <option key={cat} value={cat}>{cat}</option>
                              ))}
                              <option value="__new__">Add category…</option>
                            </select>
                            {editCategory === "__new__" ? (
                              <input className={inputClass} value={editNewCategory} onChange={(e) => setEditNewCategory(e.target.value)} placeholder="New category" />
                            ) : null}
                            <input className={inputClass} value={editPrice} onChange={(e) => setEditPrice(e.target.value)} placeholder="Price (Rp 89.000 / $24.99)" />
                            {editAffiliate.trim() && !linkOpen ? (
                              <div className="flex h-9 items-center rounded-xl border border-[#E6E8EE] bg-white">
                                <button
                                  type="button"
                                  className="flex min-w-0 flex-1 items-center justify-center gap-1.5 text-[12px]! leading-none! font-semibold! text-[#111827]"
                                  onClick={() => {
                                    const text = editAffiliate.trim();
                                    if (!text) return;
                                    void navigator.clipboard.writeText(text).then(() => {
                                      setCopiedId(p.id);
                                      window.setTimeout(() => setCopiedId((cur) => (cur === p.id ? "" : cur)), 1200);
                                    });
                                  }}
                                >
                                  <Copy size={13} />
                                  {copiedId === p.id ? "Copied" : "Copy link"}
                                </button>
                                <button
                                  type="button"
                                  className="h-full shrink-0 rounded-r-xl px-2 text-[10px]! leading-none! font-semibold! text-[#6B7280] hover:text-[#111827]"
                                  onClick={() => setLinkOpen(true)}
                                >
                                  Change
                                </button>
                              </div>
                            ) : (
                              <input
                                id={`affiliate-${p.id}`}
                                name="affiliateUrl"
                                className={inputClass}
                                value={editAffiliate}
                                onChange={(e) => setEditAffiliate(e.target.value)}
                                placeholder="Affiliate link (Amazon / Shopee / AliExpress)"
                              />
                            )}
                            <textarea className={inputClass} rows={4} value={editFeatures} onChange={(e) => setEditFeatures(e.target.value)} placeholder="Script facts, one line each" />
                            <div className="flex flex-nowrap gap-1">
                              <Btn type="button" className="min-w-0 flex-1 rounded-lg! px-1! py-1! text-[10px]! leading-none! font-semibold! whitespace-nowrap" disabled={busy === `edit-${p.id}` || busy === `tidy-${p.id}`} onClick={() => void saveEdit(p.id)}>
                                Save
                              </Btn>
                              <Btn type="button" variant="ghost" title="Rewrites the description into script lines. Price, category, and the link stay unsaved." className="min-w-0 flex-1 rounded-lg! px-1! py-1! text-[10px]! leading-none! font-semibold! whitespace-nowrap" disabled={busy === `tidy-${p.id}` || busy === `edit-${p.id}`} onClick={() => void tidyCopy(p.id)}>
                                {busy === `tidy-${p.id}` ? "Tidying…" : "Tidy"}
                              </Btn>
                              <Btn type="button" variant="ghost" className="min-w-0 flex-1 rounded-lg! px-1! py-1! text-[10px]! leading-none! font-semibold! whitespace-nowrap" onClick={() => setEditId(null)}>
                                Cancel
                              </Btn>
                            </div>
                          </div>
                        ) : (
                          <div className="relative mt-2" data-make-video>
                            <div className="flex items-center gap-0.5">
                              <button
                                type="button"
                                title="Make video"
                                className={cn(iconBtn, "bg-[#111827] text-white hover:bg-[#111827] hover:text-white")}
                                onClick={() => setMakeId(makeId === p.id ? null : p.id)}
                              >
                                <Play size={13} fill="currentColor" />
                              </button>
                              <button
                                type="button"
                                data-photo
                                title="Upload or clean this photo"
                                className={cn(iconBtn, photoId === p.id && "bg-[#F3F4F8] text-[#111827]")}
                                onClick={() => {
                                  setPhotoId(photoId === p.id ? null : p.id);
                                  setMakeId(null);
                                }}
                              >
                                <ImagePlus size={13} />
                              </button>
                              <button type="button" title="Manage product" className={iconBtn} onClick={() => openDetail(p.id)}>
                                <Pencil size={13} />
                              </button>
                              {remote ? (
                                <button
                                  type="button"
                                  title="Save photos local"
                                  className={iconBtn}
                                  disabled={busy === `loc-${p.id}`}
                                  onClick={() => void localize(p.id)}
                                >
                                  <Download size={13} />
                                </button>
                              ) : null}
                              {p.affiliateUrl || p.sourceUrl ? (
                                <a href={p.affiliateUrl || p.sourceUrl} target="_blank" rel="noreferrer" title={p.affiliateUrl || p.sourceUrl || "Open listing"} className={iconBtn}>
                                  <ExternalLink size={13} />
                                </a>
                              ) : (
                                <button type="button" title="Add shop link" className="h-6 shrink-0 rounded-md px-1.5 text-[10px]! leading-none! font-semibold! text-[#652DFF] hover:bg-[#F5F3FF]" onClick={() => startEdit(p)}>
                                  Add link
                                </button>
                              )}
                              {p.brandedMatches ? (
                                <button
                                  type="button"
                                  title="UGC references"
                                  className={iconBtn}
                                  onClick={() => openDetail(p.id, "references")}
                                >
                                  <Clapperboard size={13} />
                                </button>
                              ) : null}
                              <button type="button" title="Delete" className={cn(iconBtn, "ml-auto text-[#DC2626] hover:bg-[#FEF2F2] hover:text-[#B91C1C]")} onClick={() => void removeProduct(p.id)}>
                                <Trash2 size={13} />
                              </button>
                            </div>
                            {photoId === p.id ? (
                              <div data-photo className="absolute inset-x-0 top-full z-30 pt-1">
                                <div className="rounded-lg border border-[#E6E8EE] bg-white p-1.5 shadow-lg">
                                  <input
                                    value={photoNote[p.id] ?? ""}
                                    onChange={(e) => setPhotoNote((prev) => ({ ...prev, [p.id]: e.target.value }))}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") void regenPhoto(p.id);
                                    }}
                                    title="Shop overlay only. A brand name printed on the product stays."
                                    placeholder="Clean extra text, transparent background"
                                    className="w-full rounded-md border border-[#E6E8EE] bg-white px-1.5 py-1 text-[10px]! leading-none! outline-none"
                                  />
                                  <div className="mt-1 flex gap-1">
                                    <label className="min-w-0 flex-1 cursor-pointer rounded-md border border-[#E6E8EE] py-1 text-center text-[10px]! leading-none! font-semibold! text-[#111827]">
                                      Upload
                                      <input
                                        type="file"
                                        accept="image/png,image/jpeg,image/webp"
                                        multiple
                                        className="hidden"
                                        onChange={(e) => {
                                          const files = e.target.files;
                                          e.target.value = "";
                                          void addPhotos(p.id, files);
                                        }}
                                      />
                                    </label>
                                    <button
                                      type="button"
                                      disabled={busy === `regen-${p.id}` || busy === `img-${p.id}`}
                                      onClick={() => void regenPhoto(p.id)}
                                      className="min-w-0 flex-1 rounded-md bg-[#111827] py-1 text-[10px]! leading-none! font-semibold! text-white disabled:opacity-40"
                                    >
                                      {busy === `regen-${p.id}` ? "…" : "Regen"}
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ) : null}
                            {makeId === p.id ? (
                              <div className="mt-2 grid gap-1">
                                <Link
                                  href={`/create/characters?product=${p.id}`}
                                  className="flex items-start gap-2 rounded-lg border border-[#E6E8EE] px-2 py-1.5 hover:border-[#111827] hover:bg-[#F9FAFB]"
                                  onClick={() => setMakeId(null)}
                                >
                                  <UserRound size={14} className="mt-0.5 shrink-0" />
                                  <span>
                                    <span className="block text-[12px] font-semibold leading-tight">Character</span>
                                    <span className="text-[10px] text-[#6B7280]">On-model, identity lock</span>
                                  </span>
                                </Link>
                                <Link
                                  href={`/create/ugc-factory?product=${p.id}&mode=faceless`}
                                  className="flex items-start gap-2 rounded-lg border border-[#E6E8EE] px-2 py-1.5 hover:border-[#111827] hover:bg-[#F9FAFB]"
                                  onClick={() => setMakeId(null)}
                                >
                                  <Clapperboard size={14} className="mt-0.5 shrink-0" />
                                  <span>
                                    <span className="block text-[12px] font-semibold leading-tight">UGC Faceless</span>
                                    <span className="text-[10px] text-[#6B7280]">Product only, no face</span>
                                  </span>
                                </Link>
                              </div>
                            ) : null}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
        </ul>
      )}
    </div>
  );
}
