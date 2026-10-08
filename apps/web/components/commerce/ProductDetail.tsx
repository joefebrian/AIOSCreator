"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Btn, inputClass } from "@/components/ui";
import { affiliateCopyTarget } from "@/lib/affiliate-copy";
import { listingMatchStatus, variantSelectionId } from "@/lib/shopee-affiliate-link";
import { thumbSrc } from "@/lib/media-url";
import { cn } from "@/lib/cn";
import { CommercialContextPicker, type CommercialSelection } from "./CommercialContextPicker";
import { FactReview } from "./FactReview";
import { presentFact } from "@/lib/fact-evidence";
import { UgcReferences } from "./UgcReferences";

type Sku = {
  id: string;
  legacyProductId: string | null;
  shortName: string;
  variantLabel: string;
  variantProvisional: boolean;
  revision: number;
  modelId: string | null;
  category: string;
};
type Listing = {
  id: string;
  skuId: string;
  market: string | null;
  marketplace: string;
  seller: string;
  sourceUrl: string;
  variantReview: string;
  reviewEvidence?: string;
  reviewedVariantKey?: string;
  marketProvisional: boolean;
};
type Destination = { listingId: string; trackedUrl: string | null; nativeProductRef: string | null; reviewState: string; version: number; accountId: string | null };
type Fact = {
  id: string;
  skuId: string;
  kind: string;
  statement: string;
  state: string;
  sourceLevel?: string;
  sourceType?: "listing" | "image" | "ugc" | "campaign" | "manual";
  category?: "contents" | "features" | "usage" | "care" | "age";
  reviewBasis?: string | null;
  provenance?: {
    referenceId?: string;
    assetId?: string | null;
    analysisVersion?: number | null;
    sourceUrl?: string | null;
    evidence?: string;
    sourceKind?: string;
    startSec?: number | null;
    endSec?: number | null;
    reviewBasis?: string | null;
    claimClass?: string | null;
  } | null;
};
type Media = { id: string; skuId: string; role: string; url: string };
type Account = { id: string; label: string; market: string; configured: boolean };
type Market = { id: string; label: string; currency: string; locales: string[] };
type LocalName = { id: string; skuId: string; market: string; locale: string; name: string };
type Snapshot = { id: string; listingId: string; title: string };
type Catalog = {
  skus: Sku[];
  listings: Listing[];
  destinations: Destination[];
  facts: Fact[];
  media: Media[];
  accounts: Account[];
  markets: Market[];
  localNames: LocalName[];
  listingSnapshots: Snapshot[];
  preferences: { skuId: string; market: string; listingId: string }[];
  trackedSuggestions?: Record<string, string>;
};
type Production = { id: string; skuId: string; market: string; locale: string; stage: string; issue: string; durationMs: number; revision: number; planApprovedAt?: string | null };
type BrandMatch = { windowStart?: string; windowEnd?: string; suggestedTemplateId?: string; counts?: Record<string, number>; posts?: { creationDate?: string; type?: string; url?: string; creatorName?: string }[] };
type FactorySku = { id: string; catalogProductId: string | null };

const TABS = [
  ["overview", "Overview"],
  ["markets", "Markets & Affiliate"],
  ["facts", "Media & Facts"],
  ["productions", "Productions"],
] as const;

function excerpt(text: string) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 90 ? `${clean.slice(0, 87)}…` : clean;
}

function latestDestination(destinations: Destination[], listingId: string) {
  return destinations.filter((row) => row.listingId === listingId).sort((a, b) => b.version - a.version)[0];
}

function marketLine(listings: Listing[], destinations: Destination[], marketId: string, suggestions: Record<string, string> = {}) {
  const rows = listings.filter((row) => row.market === marketId);
  if (!rows.length) return "Not added";
  const latest = rows.map((row) => latestDestination(destinations, row.id));
  const reviewed = latest.some((row) => row?.reviewState === "REVIEWED" && (row.trackedUrl || row.nativeProductRef));
  const linked = latest.some((row) => row?.trackedUrl || row?.nativeProductRef) || rows.some((row) => /^https?:\/\//i.test(suggestions[row.id] || ""));
  if (reviewed) return "Listing · Affiliate link reviewed";
  if (linked) return "Listing · Affiliate link";
  return "Listing · No affiliate link";
}

function materialStatus(mediaCount: number, specificationCount: number, rows: Production[]) {
  const files = mediaCount ? `${mediaCount} media file${mediaCount === 1 ? "" : "s"} on file.` : "No media stored.";
  const specs = specificationCount ? `${specificationCount} confirmed specification${specificationCount === 1 ? "" : "s"}.` : "No confirmed specifications.";
  const production = !rows.length
    ? ""
    : rows.some((row) => row.stage === "READY_TO_GENERATE")
      ? " An approved plan is on file."
      : rows.some((row) => row.stage === "READY_TO_PLAN")
        ? " A production can be planned."
        : " A production still needs facts.";
  return `${files} ${specs}${production}`;
}

function AffiliateActions({
  marketId,
  target,
  copied,
  manualUrl,
  onCopy,
  onEdit,
}: {
  marketId: string;
  target: ReturnType<typeof affiliateCopyTarget>;
  copied: boolean;
  manualUrl: string;
  onCopy: (marketId: string, url: string) => void;
  onEdit: (marketId: string) => void;
}) {
  if (target.action === "copy") {
    return (
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
        <button type="button" className="font-semibold text-[#652DFF]" data-copy-link={marketId} data-affiliate-url={target.url} onClick={() => onCopy(marketId, target.url)}>{copied ? "Copied" : "Copy"}</button>
        <button type="button" className="font-semibold text-[#652DFF]" data-edit-affiliate={marketId} onClick={() => onEdit(marketId)}>Edit</button>
        {manualUrl ? <input className={inputClass + " mt-0 basis-full"} data-manual-copy={marketId} readOnly value={manualUrl} aria-label="Copy this link manually" onFocus={(event) => event.currentTarget.select()} /> : null}
      </div>
    );
  }
  return (
    <button type="button" className="text-[12px] font-semibold text-[#652DFF]" data-add-affiliate={target.action === "add-affiliate" ? marketId : undefined} data-add-listing={target.action === "add-listing" ? marketId : undefined} onClick={() => onEdit(marketId)}>
      {target.action === "add-affiliate" ? "Add affiliate link" : "Add listing"}
    </button>
  );
}

export function ProductDetail({
  productId,
  title,
  image,
  brand,
  instagramUsername,
  brandedMatches,
  openReferences,
  onBrand,
  onBack,
}: {
  productId: string;
  title: string;
  image?: string;
  brand?: string;
  instagramUsername?: string;
  brandedMatches?: BrandMatch | null;
  openReferences?: boolean;
  onBrand?: (brand: string) => void;
  onBack: () => void;
}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("markets");
  const [rowEditor, setRowEditor] = useState<{ marketId: string; mode: "listing" | "affiliate" | "scroll" } | null>(null);
  const [expandedMarket, setExpandedMarket] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selection, setSelection] = useState<CommercialSelection | null>(null);
  const [duration, setDuration] = useState("30");

  const [name, setName] = useState("");
  const [nameBusy, setNameBusy] = useState(false);
  const [nameError, setNameError] = useState("");
  const [nameSaved, setNameSaved] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [brandValue, setBrandValue] = useState(brand || "");
  const [editingBrand, setEditingBrand] = useState(false);
  const [brandBusy, setBrandBusy] = useState(false);
  const [brandError, setBrandError] = useState("");
  const [copiedMarket, setCopiedMarket] = useState("");
  const [manualCopy, setManualCopy] = useState<{ market: string; url: string } | null>(null);
  const [composeReference, setComposeReference] = useState(false);
  const [factsPane, setFactsPane] = useState<"media" | "ugc" | "campaigns">("media");
  const [factsRequest, setFactsRequest] = useState(0);
  const [productions, setProductions] = useState<Production[]>([]);
  const referenceMarket = productions.find((row) => !row.planApprovedAt)?.market || productions[0]?.market || "";
  const referenceLocale = productions.find((row) => row.market === referenceMarket)?.locale || productions[0]?.locale || "";

  async function load() {
    const res = await fetch("/api/commerce/catalog");
    const json = (await res.json()) as Catalog;
    setCatalog(json);
    const sku = json.skus.find((row) => row.legacyProductId === productId);
    if (sku) setName(sku.shortName);
    const factory = await fetch("/api/ugc-factory/v2");
    const board = await factory.json();
    const factorySkus = ((board.skus || []) as FactorySku[]).filter((row) => row.catalogProductId === productId).map((row) => row.id);
    setProductions(((board.productions || []) as Production[]).filter((row) => factorySkus.includes(row.skuId)));
  }

  useEffect(() => {
    void load();
  }, [productId]);

  useEffect(() => {
    setBrandValue(brand || "");
    setEditingBrand(false);
    setBrandError("");
  }, [productId, brand]);

  useEffect(() => {
    if (!openReferences) return;
    setFactsPane("ugc");
    setFactsRequest((value) => value + 1);
    setTab("facts");
    setComposeReference(false);
  }, [productId, openReferences]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (document.querySelector("[data-preview-drawer]")) return;
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (creating) {
        setCreating(false);
        return;
      }
      onBack();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [creating, onBack]);

  const sku = catalog?.skus.find((row) => row.legacyProductId === productId);
  const listings = catalog?.listings.filter((row) => row.skuId === sku?.id) || [];
  const facts = catalog?.facts.filter((row) => row.skuId === sku?.id) || [];
  const media = catalog?.media.filter((row) => row.skuId === sku?.id) || [];

  async function post(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/commerce/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Request failed");
      setNotice(done);
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function createDraft() {
    if (!selection || selection.gaps.length || !selection.listingId) {
      setError(selection?.gaps[0] || "Choose one market and one listing.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/ugc-factory/v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "create",
          idempotencyKey: crypto.randomUUID(),
          catalogProductId: productId,
          listingId: selection.listingId,
          market: selection.market,
          locale: selection.locale,
          placement: selection.placement,
          durationSec: Number(duration),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save the draft");
      window.location.href = `/create/ugc-factory?production=${json.production.id}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  const savedName = sku?.shortName || "";
  const nameDirty = name.replace(/\s+/g, " ").trim() !== savedName;
  const presentedFacts = facts.map((fact) => ({ fact, view: presentFact(fact) }));
  const confirmedFacts = presentedFacts.filter((row) => row.view.eligible);
  const specifications = confirmedFacts.filter((row) => row.view.category === "contents");
  const pendingFacts = presentedFacts.filter((row) => row.view.status === "Needs review" || row.view.status === "Extracted");
  const markets = catalog?.markets || [];

  function copyTarget(marketId: string) {
    if (!sku) return { action: "add-listing" as const };
    return affiliateCopyTarget({
      skuId: sku.id,
      market: marketId,
      listings,
      destinations: catalog?.destinations || [],
      preferences: catalog?.preferences || [],
    });
  }

  async function copyAffiliate(marketId: string, url: string) {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(url);
      setCopiedMarket(marketId);
      setManualCopy(null);
      window.setTimeout(() => setCopiedMarket((current) => (current === marketId ? "" : current)), 1200);
    } catch {
      setCopiedMarket("");
      setManualCopy({ market: marketId, url });
    }
  }

  function openMarketEditor(marketId?: string, mode: "listing" | "affiliate" | "scroll" = "scroll") {
    setTab("markets");
    if (marketId) setRowEditor({ marketId, mode });
  }

  async function saveBrand(event: FormEvent) {
    event.preventDefault();
    if (brandBusy) return;
    setBrandBusy(true);
    setBrandError("");
    try {
      const res = await fetch("/api/commerce/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set-brand", id: productId, brand: brandValue }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save the brand");
      const saved = brandValue.replace(/\s+/g, " ").trim();
      setBrandValue(saved);
      setEditingBrand(false);
      onBrand?.(saved);
    } catch (err) {
      setBrandError(err instanceof Error ? err.message : String(err));
    } finally {
      setBrandBusy(false);
    }
  }

  async function saveName(event: FormEvent) {
    event.preventDefault();
    if (!sku || !nameDirty || nameBusy) return;
    setNameBusy(true);
    setNameError("");
    setNameSaved(false);
    try {
      const res = await fetch("/api/commerce/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "rename", skuId: sku.id, shortName: name }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save the product name");
      setNameSaved(true);
      setEditingName(false);
      await load();
    } catch (err) {
      setNameError(err instanceof Error ? err.message : String(err));
    } finally {
      setNameBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1760px] px-4 pb-6 md:px-8" data-product-detail>
      <header className="sticky top-0 z-20 -mx-4 border-b border-[#E6E8EE] bg-[#F3F4F8]/95 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-xl bg-white">
              {image ? <img src={thumbSrc(image, 160)} alt="" className="h-full w-full object-cover" /> : <span className="text-[10px] text-[#9CA3AF]">No photo</span>}
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-[#6B7280]">{sku ? sku.category || "Uncategorized" : ""}</p>
              <h1 className="truncate text-lg font-black tracking-tight">{sku ? savedName : title}</h1>
              <p className="truncate text-[12px] text-[#6B7280]">{sku ? `${sku.variantProvisional ? "Variant not reviewed" : "Variant reviewed"}${sku.modelId ? ` · ${sku.modelId}` : ""}` : ""}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <button type="button" className="text-[12px] font-semibold text-[#652DFF]" onClick={onBack} data-back-products>Products</button>
            <Btn type="button" onClick={() => { setCreating(true); setTab("overview"); }}>Create UGC</Btn>
          </div>
        </div>
        <div className="mt-3 flex gap-1 overflow-x-auto" role="tablist" aria-label="Product detail">
          {TABS.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={cn("shrink-0 rounded-full px-3 py-1 text-[12px] font-semibold", tab === id ? "bg-[#111827] text-white" : "text-[#6B7280]")} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
      </header>
      {notice ? <p className="mt-3 text-[12px] text-[#166534]">{notice}</p> : null}
      {error ? <p className="mt-3 text-[12px] text-[#B91C1C]">{error}</p> : null}

      {creating ? (
        <div className="mt-4 rounded-2xl border border-[#E6E8EE] bg-white p-4">
          <p className="font-semibold">Create one production</p>
          <p className="mt-1 text-[12px] text-[#6B7280]">One SKU, one market, one listing, one language. Other countries stay optional.</p>
          <div className="mt-3">
            <CommercialContextPicker legacyProductId={productId} onChange={setSelection} />
          </div>
          <label className="mt-3 block text-[11px] font-semibold text-[#6B7280]">
            Duration in seconds
            <input className={inputClass} type="number" min={10} max={30} value={duration} onChange={(event) => setDuration(event.target.value)} />
          </label>
          <div className="mt-3 flex gap-2">
            <Btn type="button" disabled={busy || !selection || selection.gaps.length > 0} onClick={() => void createDraft()}>{busy ? "Saving…" : "Save one draft"}</Btn>
            <Btn type="button" variant="ghost" onClick={() => setCreating(false)}>Close</Btn>
          </div>
        </div>
      ) : null}

      {tab === "overview" && sku ? (
        <div className="mt-4 grid gap-4">
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <section className="min-w-0 rounded-2xl border border-[#E6E8EE] bg-white p-4" data-product-summary>
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold">Product</h2>
                {editingName ? null : <button type="button" className="text-[12px] font-semibold text-[#652DFF]" data-edit-name onClick={() => { setName(savedName); setNameError(""); setNameSaved(false); setEditingName(true); }}>Edit</button>}
              </div>
              {editingName ? (
                <form className="mt-3" onSubmit={(event) => void saveName(event)}>
                  <input className={inputClass + " mt-0"} value={name} aria-label="Product name" onChange={(event) => { setName(event.target.value); setNameSaved(false); }} />
                  <div className="mt-2 flex flex-wrap items-center justify-end gap-3">
                    {nameError ? <p className="text-[12px] text-[#B91C1C]">{nameError}</p> : null}
                    <button type="button" className="text-[12px] font-semibold text-[#6B7280]" onClick={() => { setName(savedName); setNameError(""); setEditingName(false); }}>Cancel</button>
                    <Btn type="submit" className="px-3 py-1 text-[12px]" disabled={nameBusy || !nameDirty}>{nameBusy ? "Saving…" : "Save"}</Btn>
                  </div>
                </form>
              ) : (
                <div className="mt-3 grid gap-1 text-[13px]">
                  <p className="font-semibold">{savedName}</p>
                  {nameSaved ? <p className="text-[12px] text-[#166534]">Saved.</p> : null}
                  <p><span className="text-[#6B7280]">Category · </span>{sku.category || "Uncategorized"}</p>
                  <p><span className="text-[#6B7280]">SKU · </span>{sku.modelId || "Not saved"}</p>
                </div>
              )}
              <div className="mt-3 text-[13px]" data-brand>
                <div className="flex items-center justify-between gap-3">
                  <p><span className="text-[#6B7280]">Brand · </span>{editingBrand ? null : <span data-brand-value>{brandValue.trim() || "Not saved"}</span>}</p>
                  {editingBrand ? null : <button type="button" className="text-[12px] font-semibold text-[#652DFF]" data-edit-brand onClick={() => { setBrandValue(brand || ""); setBrandError(""); setEditingBrand(true); }}>Edit</button>}
                </div>
                {editingBrand ? (
                  <form className="mt-2" onSubmit={(event) => void saveBrand(event)}>
                    <input className={inputClass + " mt-0"} value={brandValue} aria-label="Brand" placeholder="Brand" onChange={(event) => setBrandValue(event.target.value)} />
                    <p className="mt-1 text-[12px] text-[#6B7280]">The brand stays separate from the product name and the Instagram handle.</p>
                    <div className="mt-2 flex flex-wrap items-center justify-end gap-3">
                      {brandError ? <p className="text-[12px] text-[#B91C1C]">{brandError}</p> : null}
                      <button type="button" className="text-[12px] font-semibold text-[#6B7280]" onClick={() => { setBrandValue(brand || ""); setBrandError(""); setEditingBrand(false); }}>Cancel</button>
                      <Btn type="submit" className="px-3 py-1 text-[12px]" disabled={brandBusy}>{brandBusy ? "Saving…" : "Save"}</Btn>
                    </div>
                  </form>
                ) : null}
              </div>
              <h3 className="mt-4 text-[13px] font-semibold">Specifications</h3>
              {specifications.length ? (
                <ul className="mt-2 grid gap-1 text-[12px]">
                  {specifications.slice(0, 4).map((row) => <li key={row.fact.id}>{excerpt(row.fact.statement)}</li>)}
                </ul>
              ) : <p className="mt-2 text-[12px] text-[#6B7280]">No confirmed specifications. <button type="button" className="font-semibold text-[#652DFF]" onClick={() => setTab("facts")}>Review facts</button></p>}
            </section>
            <section className="min-w-0 rounded-2xl border border-[#E6E8EE] bg-white p-4" data-market-summary>
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold">Markets</h2>
                <button type="button" className="text-[12px] font-semibold text-[#652DFF]" data-manage-markets onClick={() => setTab("markets")}>Manage markets</button>
              </div>
              <ul className="mt-2">
                {markets.map((market) => {
                  const base = copyTarget(market.id);
                  const suggestion = base.action === "add-affiliate" ? catalog?.trackedSuggestions?.[base.listingId] || "" : "";
                  const target = base.action === "copy" || !/^https?:\/\//i.test(suggestion) ? base : { action: "copy" as const, url: suggestion, listingId: base.listingId };
                  return (
                    <li key={market.id} className="border-t border-[#F3F4F8] py-2">
                      <div className="flex min-w-0 flex-col gap-1">
                        <button type="button" className="flex min-w-0 items-start justify-between gap-3 text-left text-[12px]" data-market-row={market.id} onClick={() => openMarketEditor(market.id)}>
                          <span className="font-semibold">{market.id}</span>
                          <span className={cn("text-right", marketLine(listings, catalog?.destinations || [], market.id, catalog?.trackedSuggestions || {}) === "Not added" && "text-[#9CA3AF]")}>{marketLine(listings, catalog?.destinations || [], market.id, catalog?.trackedSuggestions || {})}</span>
                        </button>
                        <AffiliateActions marketId={market.id} target={target} copied={copiedMarket === market.id} manualUrl={manualCopy?.market === market.id ? manualCopy.url : ""} onCopy={(id, url) => void copyAffiliate(id, url)} onEdit={(id) => openMarketEditor(id, target.action === "add-affiliate" ? "affiliate" : "listing")} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
          <section className="min-w-0 rounded-2xl border border-[#E6E8EE] bg-white p-4" data-material-summary>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-semibold">Facts</h2>
              <button type="button" className="text-[12px] font-semibold text-[#652DFF]" data-review-facts onClick={() => setTab("facts")}>Review facts</button>
            </div>
            {confirmedFacts.length ? (
              <ul className="mt-2 grid gap-1 text-[12px]">
                {confirmedFacts.slice(0, 3).map((row) => <li key={row.fact.id}>{excerpt(row.fact.statement)}</li>)}
              </ul>
            ) : <p className="mt-2 text-[12px] text-[#6B7280]">No confirmed facts.</p>}
            {pendingFacts.length ? (
              <ul className="mt-2 grid gap-1 text-[12px] text-[#6B7280]">
                {pendingFacts.slice(0, 2).map((row) => <li key={row.fact.id}>{row.view.status} · {excerpt(row.fact.statement)}</li>)}
              </ul>
            ) : null}
            <div className="mt-4 flex items-center justify-between gap-3">
              <h2 className="font-semibold">Media</h2>
              <button type="button" className="text-[12px] font-semibold text-[#652DFF]" data-view-media onClick={() => setTab("facts")}>View media</button>
            </div>
            {media.length ? (
              <div className="mt-2 flex gap-2 overflow-x-auto">
                {media.slice(0, 8).map((item) => item.url.startsWith("/api/media/") && !/\.(mp4|webm|mov)(\?|$)/i.test(item.url)
                  ? <img key={item.id} src={thumbSrc(item.url, 96)} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                  : <span key={item.id} className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-[#F3F4F8] text-[10px] text-[#6B7280]">{/\.(mp4|webm|mov)(\?|$)/i.test(item.url) ? "Video" : "Link"}</span>)}
              </div>
            ) : <p className="mt-2 text-[12px] text-[#6B7280]">No media stored.</p>}
            <div className="mt-4">
              <UgcReferences
                productId={productId}
                skuId={sku.id}
                mode="overview"
                instagramUsername={instagramUsername}
                matches={brandedMatches}
                productions={productions}
                suggestedMarket={referenceMarket}
                suggestedLocale={referenceLocale}
                onViewAll={() => { setFactsPane("ugc"); setComposeReference(false); setFactsRequest((value) => value + 1); setTab("facts"); }}
                onAdd={() => { setFactsPane("ugc"); setComposeReference(true); setFactsRequest((value) => value + 1); setTab("facts"); }}
                onChanged={() => void load()}
              />
            </div>
            <p className="mt-2 text-[12px] text-[#6B7280]">{materialStatus(media.length, specifications.length, productions)}</p>
          </section>
        </div>
      ) : null}

      {tab === "markets" && sku ? (
        <div className="mt-4 overflow-hidden rounded-2xl border border-[#E6E8EE] bg-white">
          <style>{`
            .market-table { width: 100%; table-layout: fixed; border-collapse: collapse; }
            .market-table th, .market-table td { text-align: left; padding: 14px 20px; vertical-align: top; font-size: 14px; line-height: 1.4; }
            .market-table th { font-weight: 600; color: #6B7280; }
            .market-table tr + tr td { border-top: 1px solid #E6E8EE; }
            @media (max-width: 767px) {
              .market-table, .market-table thead, .market-table tbody, .market-table tr, .market-table th, .market-table td { display: block; width: 100%; }
              .market-table { table-layout: auto; }
              .market-table thead { display: none; }
              .market-table td { padding: 12px 20px; }
            }
          `}</style>
          <table className="market-table" data-markets>
            <colgroup>
              <col style={{ width: "14%" }} />
              <col style={{ width: "48%" }} />
              <col style={{ width: "38%" }} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Market</th>
                <th scope="col">Product listing</th>
                <th scope="col">Affiliate link</th>
              </tr>
            </thead>
            <tbody>
          {(catalog?.markets || []).map((market) => (
            <MarketCard
              key={market.id}
              market={market}
              skuId={sku.id}
              listings={listings.filter((row) => row.market === market.id)}
              destinations={catalog?.destinations || []}
              snapshots={catalog?.listingSnapshots || []}
              localNames={(catalog?.localNames || []).filter((row) => row.skuId === sku.id && row.market === market.id)}
              productName={savedName || title}
              accounts={(catalog?.accounts || []).filter((row) => row.market === market.id && row.configured)}
              preferences={(catalog?.preferences || []).filter((row) => row.skuId === sku.id && row.market === market.id)}
              suggestions={catalog?.trackedSuggestions || {}}
              openMode={rowEditor?.marketId === market.id ? rowEditor.mode : ""}
              onOpenHandled={() => setRowEditor(null)}
              expanded={expandedMarket === market.id}
              onExpand={() => setExpandedMarket((current) => current === market.id ? current : market.id)}
              copyTarget={copyTarget(market.id)}
              copied={copiedMarket === market.id}
              manualUrl={manualCopy?.market === market.id ? manualCopy.url : ""}
              onCopy={(url) => void copyAffiliate(market.id, url)}
              onImport={async (sourceUrl) => {
                const res = await fetch("/api/commerce/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "import-listing", skuId: sku.id, market: market.id, sourceUrl }) });
                const json = await res.json();
                if (!res.ok) throw new Error(json.error || "Import failed");
                await load();
                return json as { extracted?: boolean; title?: string; image?: string; seller?: string; error?: string; variantQuery?: string };
              }}
              onDestination={async (listingId, trackedUrl) => {
                const account = (catalog?.accounts || []).find((row) => row.market === market.id && row.configured);
                if (!account) throw new Error(`No ${market.label} affiliate account is configured.`);
                const res = await fetch("/api/commerce/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "add-destination", listingId, accountId: account.id, destinationType: "URL_LINK", trackedUrl }) });
                const json = await res.json();
                if (!res.ok) throw new Error(json.error || "Could not save that affiliate link.");
                await load();
              }}
              onSaveLocal={async (locale, value) => post({ op: "set-local-name", skuId: sku.id, market: market.id, locale, name: value }, value.trim() ? "Local name saved." : "This market uses the product name.")}
              onPrefer={(listingId) => void post({ op: "set-preference", skuId: sku.id, market: market.id, listingId }, "Preferred listing saved.")}
              onReview={async (listingId, review, evidence) => {
                const res = await fetch("/api/commerce/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "review-listing", listingId, review, evidence }) });
                const json = await res.json();
                if (!res.ok) throw new Error(json.error || "Could not confirm this listing.");
                await load();
              }}
            />
          ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {tab === "facts" && sku ? (
        <>
          <FactReview productId={productId} skuId={sku.id} category={sku.category} facts={facts} media={media} matches={brandedMatches || null} productions={productions} requestedPane={factsPane} requestKey={factsRequest} openAdd={composeReference} onChanged={() => void load()} />
        </>
      ) : null}

      {tab === "productions" ? (
        <div className="mt-4 rounded-2xl border border-[#E6E8EE] bg-white p-4">
          {productions.length ? productions.map((row) => (
            <Link key={row.id} href={`/create/ugc-factory?production=${row.id}`} className="block border-b border-[#F3F4F8] py-2 text-[12px] last:border-0">
              <span className="font-semibold">{row.market} · {row.locale} · {Math.round(row.durationMs / 1000)}s</span>
              <span className="mt-1 block text-[#6B7280]">{row.stage} · {row.issue}</span>
            </Link>
          )) : <p className="text-[12px] text-[#6B7280]">No production uses this SKU yet.</p>}
        </div>
      ) : null}
    </div>
  );
}

function MarketCard({
  market,
  skuId,
  listings,
  destinations,
  snapshots,
  localNames,
  productName,
  accounts,
  preferences,
  suggestions,
  openMode,
  onOpenHandled,
  expanded,
  onExpand,
  copied,
  manualUrl,
  onCopy,
  onImport,
  onDestination,
  onSaveLocal,
  onPrefer,
  onReview,
}: {
  market: { id: string; label: string; currency: string; locales?: string[] };
  skuId: string;
  listings: Listing[];
  destinations: Destination[];
  snapshots: Snapshot[];
  localNames: LocalName[];
  productName: string;
  accounts: Account[];
  preferences: { skuId: string; market: string; listingId: string }[];
  suggestions: Record<string, string>;
  openMode: "" | "listing" | "affiliate" | "scroll";
  onOpenHandled: () => void;
  expanded: boolean;
  onExpand: () => void;
  copyTarget: ReturnType<typeof affiliateCopyTarget>;
  copied: boolean;
  manualUrl: string;
  onCopy: (url: string) => void;
  onImport: (sourceUrl: string) => Promise<{ extracted?: boolean; title?: string; image?: string; seller?: string; error?: string; variantQuery?: string }>;
  onDestination: (listingId: string, trackedUrl: string) => Promise<void>;
  onSaveLocal: (locale: string, name: string) => Promise<boolean>;
  onPrefer: (listingId: string) => void;
  onReview: (listingId: string, review: "REVIEWED" | "REJECTED", evidence: string) => Promise<void>;
}) {
  const preferredId = preferences[0]?.listingId || "";
  const current = listings.find((row) => row.id === preferredId) || listings[0];
  const dest = current ? destinations.filter((row) => row.listingId === current.id).sort((a, b) => b.version - a.version)[0] : null;
  const [mode, setMode] = useState<"" | "listing" | "affiliate" | "manage">("");
  const [productUrl, setProductUrl] = useState("");
  const [affiliateUrl, setAffiliateUrl] = useState("");
  const [listingId, setListingId] = useState(current?.id || "");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ extracted?: boolean; title?: string; image?: string; seller?: string; error?: string; variantQuery?: string } | null>(null);
  const [note, setNote] = useState(current?.reviewEvidence || "");
  const urlRef = useRef<HTMLInputElement | null>(null);
  const cardRef = useRef<HTMLTableRowElement | null>(null);
  const generation = useRef(0);
  const locales = market.locales?.length ? market.locales : [];
  const [locale, setLocale] = useState(locales[0] || "");
  const [localDraft, setLocalDraft] = useState("");
  useEffect(() => {
    generation.current += 1;
    setProductUrl("");
    setAffiliateUrl("");
    setMessage("");
    setError("");
    setResult(null);
    setMode("");
    setListingId(current?.id || "");
  }, [market.id, skuId]);
  useEffect(() => {
    if (!openMode) return;
    if (openMode === "listing" || openMode === "affiliate") {
      onExpand();
      setMode(openMode);
      setError("");
      setMessage("");
    }
    cardRef.current?.scrollIntoView({ block: "nearest" });
    onOpenHandled();
  }, [openMode]);
  useEffect(() => {
    if (!expanded && mode) setMode("");
  }, [expanded]);
  useEffect(() => {
    if (mode === "listing" || mode === "affiliate") {
      urlRef.current?.focus();
      cardRef.current?.scrollIntoView({ block: "nearest" });
    }
  }, [mode]);
  useEffect(() => {
    setListingId(current?.id || "");
  }, [current?.id]);
  useEffect(() => {
    setLocalDraft(localNames.find((row) => row.locale === locale)?.name || "");
  }, [locale, localNames]);
  useEffect(() => {
    setNote(current?.reviewEvidence || "");
  }, [current?.id, current?.reviewEvidence]);
  const suggestion = current ? suggestions[current.id] || "" : "";
  const savedUrl = dest?.trackedUrl && /^https?:\/\//i.test(dest.trackedUrl) ? dest.trackedUrl : "";
  const resolvedUrl = !savedUrl && /^https?:\/\//i.test(suggestion) ? suggestion : "";
  const effectiveUrl = savedUrl || resolvedUrl;
  function platformName(value: string) {
    if (value === "shopee") return "Shopee";
    if (value === "amazon") return "Amazon";
    return value ? value.slice(0, 1).toUpperCase() + value.slice(1) : "Listing";
  }
  function listingLabel(listing: Listing, index: number) {
    const snap = [...snapshots].reverse().find((row) => row.listingId === listing.id)?.title || "";
    const name = snap && !/^https?:\/\//i.test(snap) ? snap.replace(/\s+/g, " ").trim() : "";
    const model = variantSelectionId(listing.sourceUrl);
    const head = name ? name.slice(0, 64) : model ? `model ${model}` : platformName(listing.marketplace);
    return `Product Listing ${index + 1} · ${head}`;
  }
  function openAffiliate() {
    onExpand();
    setMode("affiliate");
    setAffiliateUrl(savedUrl || resolvedUrl);
    setError("");
    setMessage("");
  }
  return (
    <>
    <tr ref={cardRef} data-market-card={market.id}>
      <td>
        <span className="mb-1 block text-[12px] font-semibold text-[#6B7280] md:hidden">Market</span>
        <p className="font-semibold">{market.id}</p>
        <p className="text-[#6B7280]">{market.label}</p>
      </td>
      <td>
        <span className="mb-1 block text-[12px] font-semibold text-[#6B7280] md:hidden">Product listing</span>
        {current ? (
          <p className="flex flex-wrap items-center gap-3">
            <a className="inline-flex items-center gap-1 font-semibold text-[#652DFF]" href={current.sourceUrl} data-listing-href={market.id} target="_blank" rel="noreferrer">Product Listing 1 <span aria-hidden="true">↗</span></a>
            <span className="text-[#6B7280]">{platformName(current.marketplace)}</span>
          </p>
        ) : <p className="text-[#6B7280]">No listing yet</p>}
        <p className="mt-2 flex flex-wrap gap-4">
          <button type="button" className="font-semibold text-[#652DFF]" data-add-listing={market.id} onClick={() => { onExpand(); setMode("listing"); setProductUrl(""); setError(""); setMessage(""); }}>Add product URL</button>
          <button type="button" className="font-semibold text-[#652DFF]" data-manage-links={market.id} onClick={() => { onExpand(); setMode(mode === "manage" ? "" : "manage"); }}>Details</button>
        </p>
      </td>
      <td>
        <span className="mb-1 block text-[12px] font-semibold text-[#6B7280] md:hidden">Affiliate link</span>
        {effectiveUrl ? (
          <p className="flex flex-wrap gap-4">
            <button type="button" className="font-semibold text-[#652DFF]" data-copy-link={market.id} data-affiliate-url={effectiveUrl} onClick={() => onCopy(effectiveUrl)}>{copied ? "Copied" : "Copy"}</button>
            <button type="button" className="font-semibold text-[#652DFF]" data-edit-affiliate={market.id} onClick={openAffiliate}>Edit</button>
          </p>
        ) : (
          <button type="button" className="font-semibold text-[#652DFF]" data-add-affiliate={market.id} onClick={openAffiliate}>Add affiliate link</button>
        )}
        {manualUrl ? <input className={inputClass + " mt-2"} readOnly value={manualUrl} aria-label="Copy this link manually" onFocus={(event) => event.currentTarget.select()} /> : null}
      </td>
    </tr>
    {mode ? (
      <tr data-market-editor={market.id}>
        <td colSpan={3}>
          {mode === "listing" ? (
            <form className="grid max-w-xl gap-3" data-listing-editor={market.id} onSubmit={(event) => {
              event.preventDefault();
              const token = ++generation.current;
              const pasted = productUrl;
              setBusy("listing");
              setError("");
              setMessage("");
              void onImport(pasted).then((json) => {
                if (token !== generation.current) return;
                setResult(json);
                setMessage(json.extracted ? `Imported · ${json.title || "listing"}` : "Link saved. The page did not yield a title, so this stays provisional.");
                setProductUrl("");
              }).catch((err: Error) => {
                if (token !== generation.current) return;
                setError(err.message);
              }).finally(() => { if (token === generation.current) setBusy(""); });
            }}>
              <p className="font-semibold">{market.label} · Product URL</p>
              <input ref={urlRef} className={inputClass + " mt-0 text-sm"} value={productUrl} aria-label={`${market.id} product URL`} placeholder="https://" onChange={(event) => setProductUrl(event.target.value)} required />
              <div className="flex flex-wrap gap-3">
                <button type="submit" className="rounded-lg bg-[#652DFF] px-3 py-1.5 text-sm font-semibold text-white" disabled={busy === "listing"}>{busy === "listing" ? "Importing…" : "Import listing"}</button>
                <button type="button" className="rounded-lg border border-[#E6E8EE] px-3 py-1.5 text-sm font-semibold" onClick={() => setMode("")}>Cancel</button>
              </div>
              {message ? <p className="text-[#166534]" data-import-result={market.id}>{message}</p> : null}
              {result && !result.extracted && result.error ? <p className="text-[#B91C1C]">{result.error}</p> : null}
              {error ? <p className="text-[#B91C1C]" data-import-error={market.id}>{error}</p> : null}
            </form>
          ) : null}
          {mode === "affiliate" ? (
            <form className="grid max-w-xl gap-3" data-affiliate-editor={market.id} onSubmit={(event) => {
              event.preventDefault();
              if (!current) {
                setError("Add a product URL for this market before saving an affiliate link.");
                return;
              }
              const token = ++generation.current;
              const targetListing = current.id;
              const pasted = affiliateUrl;
              setBusy("affiliate");
              setError("");
              setMessage("");
              void onDestination(targetListing, pasted).then(() => {
                if (token !== generation.current) return;
                setMessage("Saved for this listing.");
                setMode("");
              }).catch((err: Error) => {
                if (token !== generation.current) return;
                setError(err.message);
              }).finally(() => { if (token === generation.current) setBusy(""); });
            }}>
              <p className="font-semibold">{market.label} · Affiliate URL</p>
              {!accounts.length ? <p className="text-[#B91C1C]">No affiliate account is configured for this market.</p> : null}
              <input ref={mode === "affiliate" ? urlRef : undefined} className={inputClass + " mt-0 text-sm"} value={affiliateUrl} aria-label={`${market.id} affiliate URL`} placeholder="https://" onChange={(event) => setAffiliateUrl(event.target.value)} required />
              <div className="flex flex-wrap gap-3">
                <button type="submit" className="rounded-lg bg-[#652DFF] px-3 py-1.5 text-sm font-semibold text-white" disabled={busy === "affiliate"}>{busy === "affiliate" ? "Saving…" : "Save"}</button>
                <button type="button" className="rounded-lg border border-[#E6E8EE] px-3 py-1.5 text-sm font-semibold" onClick={() => setMode("")}>Cancel</button>
              </div>
              {message ? <p className="text-[#166534]">{message}</p> : null}
              {error ? <p className="text-[#B91C1C]">{error}</p> : null}
            </form>
          ) : null}
          {mode === "manage" ? (
            <div className="grid items-start gap-6 text-sm md:grid-cols-2" data-manage-panel={market.id}>
              <div>
                <p className="font-semibold">{market.label} details</p>
                <form className="mt-3 grid max-w-md gap-2" onSubmit={(event) => { event.preventDefault(); void onSaveLocal(locale, localDraft); }}>
                  <label className="font-semibold">Local product name
                    <input className={inputClass + " mt-1 text-sm"} value={localDraft} aria-label={`${market.id} local name`} placeholder="Uses the product name when blank" onChange={(event) => setLocalDraft(event.target.value)} />
                  </label>
                  {locales.length > 1 ? (
                    <select className={inputClass + " mt-0 text-sm"} value={locale} aria-label={`${market.id} locale`} onChange={(event) => setLocale(event.target.value)}>
                      {locales.map((row) => <option key={row} value={row}>{row}</option>)}
                    </select>
                  ) : null}
                  <button type="submit" className="w-fit rounded-lg bg-[#652DFF] px-3 py-1.5 text-sm font-semibold text-white">Save name</button>
                </form>
                <p className="mt-3 text-[#6B7280]">Affiliate configuration: {accounts.length ? "universal" : "not configured"}</p>
                {listings.length > 1 ? (
                  <ul className="mt-3 grid gap-2">
                    {listings.map((listing, index) => (
                      <li key={listing.id}>
                        <span>{listingLabel(listing, index)}{listing.id === current?.id ? " · selected" : ""}</span>
                        {listing.id === current?.id ? null : <button type="button" className="ml-3 font-semibold text-[#652DFF]" onClick={() => onPrefer(listing.id)}>Use this listing</button>}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <button type="button" className="mt-3 font-semibold text-[#652DFF]" onClick={() => setMode("")}>Close details</button>
              </div>
              <div data-product-match={market.id} data-match-status={current ? listingMatchStatus(current) : "needs"}>
                <p className="font-semibold">Product match</p>
                <p className="mt-2 font-semibold" data-match-label>{current && listingMatchStatus(current) === "confirmed" ? "Confirmed" : current && listingMatchStatus(current) === "different" ? "Different product" : "Needs confirmation"}</p>
                <p className="mt-1 text-[#6B7280]">Check the product version, size and package.</p>
                {current && listingMatchStatus(current) === "needs" && current.reviewEvidence ? <p className="mt-2" data-review-note-saved={market.id}>{current.reviewEvidence}</p> : null}
                {current && listingMatchStatus(current) === "needs" ? (
                  <div className="mt-3 grid max-w-md gap-2">
                    <label className="font-semibold">Review note
                      <input className={inputClass + " mt-1 text-sm"} data-review-note-input={market.id} value={note} aria-label={`${market.id} review basis`} placeholder="Optional" onChange={(event) => setNote(event.target.value)} />
                    </label>
                    <button type="button" className="w-fit rounded-lg bg-[#652DFF] px-3 py-1.5 text-sm font-semibold text-white" data-review-variant={market.id} disabled={busy === "confirm"} onClick={() => {
                      const token = ++generation.current;
                      const kept = note;
                      setBusy("confirm");
                      setError("");
                      void onReview(current.id, "REVIEWED", kept).catch((err: Error) => {
                        if (token !== generation.current) return;
                        setNote(kept);
                        setError(err.message);
                      }).finally(() => { if (token === generation.current) setBusy(""); });
                    }}>{busy === "confirm" ? "Confirming…" : "Confirm same product"}</button>
                  </div>
                ) : null}
                {current && listingMatchStatus(current) !== "needs" && current.reviewEvidence ? <p className="mt-2" data-review-note-saved={market.id}>{current.reviewEvidence}</p> : null}
                {error ? <p className="mt-2 text-[#B91C1C]" data-match-error={market.id}>{error}</p> : null}
              </div>
            </div>
          ) : null}
        </td>
      </tr>
    ) : null}
    </>
  );
}
