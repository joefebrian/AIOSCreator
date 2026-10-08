"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Btn, inputClass } from "@/components/ui";

type Market = { id: string; label: string; locales: string[]; currency: string };
type Sku = { id: string; legacyProductId: string | null; shortName: string; variantLabel: string; variantProvisional: boolean; modelId: string | null };
type Listing = {
  id: string;
  skuId: string;
  market: string | null;
  marketplace: string;
  seller: string;
  sourceUrl: string;
  variantReview: string;
};
type Destination = { id: string; listingId: string; trackedUrl: string | null; nativeProductRef: string | null; reviewState: string; version: number; accountId: string | null };
type Account = { id: string; label: string; market: string; configured: boolean; program: string };
type Preference = { skuId: string; market: string; listingId: string };
type Catalog = { skus: Sku[]; listings: Listing[]; destinations: Destination[]; accounts: Account[]; markets: Market[]; preferences: Preference[] };

export type CommercialSelection = {
  skuId: string;
  legacyProductId: string;
  market: string;
  listingId: string | null;
  locale: string;
  placement: string;
  gaps: string[];
  notes: string[];
  destinationVersionId: string | null;
  trackedUrl: string | null;
  sourceUrl: string;
};

const PLACEMENTS = [
  { id: "TIKTOK", label: "TikTok" },
  { id: "REELS", label: "Reels" },
  { id: "SHORTS", label: "Shorts" },
  { id: "SHOPEE_VIDEO", label: "Shopee Video" },
  { id: "DEMAND_GEN", label: "Demand Gen" },
];

export function CommercialContextPicker({
  legacyProductId,
  initialMarket,
  showPlacement = true,
  onChange,
}: {
  legacyProductId?: string;
  initialMarket?: string;
  showPlacement?: boolean;
  onChange?: (selection: CommercialSelection) => void;
}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [skuId, setSkuId] = useState("");
  const [market, setMarket] = useState(initialMarket || "US");
  const [listingId, setListingId] = useState("");
  const [locale, setLocale] = useState("en-US");
  const [placement, setPlacement] = useState("TIKTOK");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ marketplace: "amazon", seller: "", sourceUrl: "", accountId: "", trackedUrl: "", nativeRef: "", destinationType: "URL_LINK" });

  async function load(preferListing?: string) {
    const res = await fetch("/api/commerce/catalog");
    const json = (await res.json()) as Catalog;
    setCatalog(json);
    const match = json.skus.find((row) => row.legacyProductId === legacyProductId) || json.skus.find((row) => row.id === skuId) || json.skus[0];
    if (match) setSkuId(match.id);
    if (preferListing) setListingId(preferListing);
  }

  useEffect(() => {
    void load();
    // The catalog is the shared source. Reload when the preselected product changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legacyProductId]);

  useEffect(() => {
    if (initialMarket) setMarket(initialMarket);
  }, [initialMarket]);

  const sku = catalog?.skus.find((row) => row.id === skuId);
  const marketRow = catalog?.markets.find((row) => row.id === market);
  const listings = useMemo(() => (catalog?.listings || []).filter((row) => row.skuId === skuId && row.market === market && row.variantReview !== "REJECTED"), [catalog, skuId, market]);
  const preferred = catalog?.preferences.find((row) => row.skuId === skuId && row.market === market)?.listingId;
  const selected = listings.find((row) => row.id === listingId) || listings.find((row) => row.id === preferred) || listings[0] || null;
  const destination = (catalog?.destinations || []).filter((row) => row.listingId === selected?.id).sort((a, b) => b.version - a.version)[0] || null;
  const accounts = (catalog?.accounts || []).filter((row) => row.market === market && row.configured);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const nextLocale = market === "MY" && marketRow?.locales.includes("en-MY") ? "en-MY" : (marketRow?.locales[0] || locale);
    if (!marketRow?.locales.includes(locale)) setLocale(nextLocale);
  }, [marketRow, locale]);

  useEffect(() => {
    if (!sku?.legacyProductId) return;
    const gaps = selected ? [] : [`No ${marketRow?.label || market} listing is saved for this SKU.`];
    const notes = [
      selected && selected.variantReview !== "REVIEWED" ? "The exact variant is still provisional." : "",
      selected && !destination ? "No tracked affiliate destination is saved for this listing." : "",
      destination && destination.reviewState !== "REVIEWED" ? "The affiliate destination is not reviewed." : "",
    ].filter(Boolean);
    onChangeRef.current?.({
      skuId: sku.id,
      legacyProductId: sku.legacyProductId,
      market,
      listingId: selected?.id || null,
      locale,
      placement,
      gaps,
      notes,
      destinationVersionId: destination?.id || null,
      trackedUrl: destination?.trackedUrl || null,
      sourceUrl: selected?.sourceUrl || "",
    });
  }, [sku, selected, destination, market, locale, placement, marketRow]);

  async function saveListing() {
    if (!sku) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/commerce/catalog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "add-listing", skuId: sku.id, market, marketplace: draft.marketplace, seller: draft.seller, sourceUrl: draft.sourceUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save the listing");
      const listing = json.listing as Listing;
      if (draft.trackedUrl || draft.nativeRef) {
        const dest = await fetch("/api/commerce/catalog", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            op: "add-destination",
            listingId: listing.id,
            accountId: draft.accountId,
            destinationType: draft.destinationType,
            trackedUrl: draft.trackedUrl,
            nativeProductRef: draft.nativeRef,
          }),
        });
        const destJson = await dest.json();
        if (!dest.ok) throw new Error(destJson.error || "Could not save the destination");
      }
      setAdding(false);
      setDraft({ marketplace: draft.marketplace, seller: "", sourceUrl: "", accountId: "", trackedUrl: "", nativeRef: "", destinationType: "URL_LINK" });
      await load(listing.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!catalog) return <p className="text-[12px] text-[#6B7280]">Loading the shared catalog…</p>;
  if (!catalog.skus.length) return <p className="text-[12px] text-[#6B7280]">No products in the catalog yet.</p>;

  return (
    <div className="grid gap-3">
      <label className="block text-[11px] font-semibold text-[#6B7280]">
        Product / exact SKU
        <select className={inputClass} value={skuId} onChange={(event) => { setSkuId(event.target.value); setListingId(""); }} aria-label="Product">
          {catalog.skus.map((row) => (
            <option key={row.id} value={row.id}>{row.shortName} · {row.variantLabel}{row.modelId ? ` · ${row.modelId}` : ""}</option>
          ))}
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-[11px] font-semibold text-[#6B7280]">
          Market
          <select className={inputClass} value={market} onChange={(event) => { setMarket(event.target.value); setListingId(""); }} aria-label="Market">
            {catalog.markets.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
          </select>
        </label>
        <label className="block text-[11px] font-semibold text-[#6B7280]">
          Language
          <select className={inputClass} value={locale} onChange={(event) => setLocale(event.target.value)} aria-label="Language">
            {(marketRow?.locales || [locale]).map((row) => <option key={row} value={row}>{row}</option>)}
          </select>
        </label>
      </div>
      {showPlacement ? (
        <label className="block text-[11px] font-semibold text-[#6B7280]">
          Placement
          <select className={inputClass} value={placement} onChange={(event) => setPlacement(event.target.value)} aria-label="Placement">
            {PLACEMENTS.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
          </select>
        </label>
      ) : null}
      {selected ? (
        <div className="rounded-xl bg-[#F7F8FB] p-3 text-[12px]">
          <p className="font-semibold">{selected.marketplace}{selected.seller ? ` · ${selected.seller}` : ""} · {selected.variantReview === "REVIEWED" ? "Variant reviewed" : "Variant provisional"}</p>
          <p className="mt-1 break-all text-[#4B5563]">Shop URL · {selected.sourceUrl || "Not saved"}</p>
          <p className="mt-1 break-all text-[#4B5563]">Affiliate destination · {destination?.trackedUrl || destination?.nativeProductRef || "Not saved"}</p>
          {listings.length > 1 ? (
            <label className="mt-2 block text-[11px] font-semibold text-[#6B7280]">
              Listing
              <select className={inputClass} value={selected.id} onChange={(event) => setListingId(event.target.value)} aria-label="Listing">
                {listings.map((row) => <option key={row.id} value={row.id}>{row.seller || row.marketplace} · {row.sourceUrl}</option>)}
              </select>
            </label>
          ) : null}
        </div>
      ) : (
        <p className="rounded-xl bg-[#FFF7ED] p-3 text-[12px] text-[#9A3412]">No {marketRow?.label || market} listing is saved for this SKU. Add that listing here. This does not import the product again and does not start a video.</p>
      )}
      {error ? <p className="text-[12px] text-[#B91C1C]">{error}</p> : null}
      {adding ? (
        <div className="grid gap-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <input className={inputClass + " mt-0"} value={draft.marketplace} onChange={(event) => setDraft({ ...draft, marketplace: event.target.value })} aria-label="Marketplace" placeholder="Marketplace" required />
            <input className={inputClass + " mt-0"} value={draft.seller} onChange={(event) => setDraft({ ...draft, seller: event.target.value })} aria-label="Seller" placeholder="Seller" />
          </div>
          <input className={inputClass + " mt-0"} value={draft.sourceUrl} onChange={(event) => setDraft({ ...draft, sourceUrl: event.target.value })} aria-label="Shop listing URL" placeholder="Shop listing URL" required />
          <select className={inputClass + " mt-0"} value={draft.accountId} onChange={(event) => setDraft({ ...draft, accountId: event.target.value })} aria-label="Affiliate account">
            <option value="">Affiliate account, if you have a tracked link</option>
            {accounts.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
          </select>
          <input className={inputClass + " mt-0"} value={draft.trackedUrl} onChange={(event) => setDraft({ ...draft, trackedUrl: event.target.value })} aria-label="Tracked affiliate URL" placeholder="Tracked affiliate URL, optional" />
          <div className="flex gap-2">
            <Btn type="button" disabled={busy} onClick={() => void saveListing()}>{busy ? "Saving…" : "Save listing"}</Btn>
            <Btn type="button" variant="ghost" onClick={() => setAdding(false)}>Cancel</Btn>
          </div>
        </div>
      ) : (
        <Btn type="button" variant="ghost" onClick={() => setAdding(true)}>{selected ? "Add another listing" : "Add listing"}</Btn>
      )}
    </div>
  );
}
