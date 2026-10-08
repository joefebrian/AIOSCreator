import { NextResponse } from "next/server";
import { previewListingImport } from "@/lib/product-import";
import { flagDraftFactReview, noteFactoryNameImpact } from "@/lib/ugc-factory-v2";
import { getShopeeMarkets } from "@/lib/affiliate-programs";
import { shopeeTrackedSuggestions } from "@/lib/shopee-affiliate-link";
import {
  accountsFromPrograms,
  addCatalogFact,
  addCatalogListing,
  addDestinationVersion,
  confirmCatalogFact,
  editCatalogFact,
  rejectCatalogFact,
  catalogDisplayName,
  readSharedCatalog,
  resolveCommercialContext,
  noteListingReviewBasis,
  reviewCatalogListing,
  setCatalogLocalName,
  setCatalogShortName,
  setMarketPreference,
  splitCatalogSku,
  type FactKind,
} from "@/lib/shared-catalog";

function listingHostMarket(value: string) {
  let host = "";
  try { host = new URL(value.trim()).hostname.replace(/^www\./, "").replace(/^s\./, "").toLowerCase(); } catch { return ""; }
  if (host.endsWith("shopee.com.my") || host.endsWith(".com.my")) return "MY";
  if (host.endsWith("shopee.sg") || host.endsWith("shopee.com.sg")) return "SG";
  if (host.endsWith("shopee.co.th")) return "TH";
  if (host.endsWith("shopee.co.id")) return "ID";
  if (host === "amazon.com" || host.endsWith(".amazon.com")) return "US";
  return "";
}

function marketplaceFromUrl(value: string) {
  let host = "";
  try { host = new URL(value.trim()).hostname.replace(/^www\./, "").toLowerCase(); } catch { return "other"; }
  if (host.includes("shopee.")) return "shopee";
  if (host.includes("amazon.") || host === "amzn.to" || host === "a.co") return "amazon";
  return "other";
}

export const runtime = "nodejs";

export async function GET() {
  const db = readSharedCatalog();
  return NextResponse.json({
    ...db,
    accounts: accountsFromPrograms(),
    trackedSuggestions: shopeeTrackedSuggestions(db.listings, db.destinations, getShopeeMarkets()),
    markets: [
      { id: "ID", label: "Indonesia", locales: ["id-ID"], currency: "IDR" },
      { id: "MY", label: "Malaysia", locales: ["ms-MY", "en-MY"], currency: "MYR" },
      { id: "SG", label: "Singapore", locales: ["en-SG"], currency: "SGD" },
      { id: "TH", label: "Thailand", locales: ["th-TH"], currency: "THB" },
      { id: "US", label: "United States", locales: ["en-US"], currency: "USD" },
    ],
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const op = String(body.op || "");
  try {
    if (op === "resolve") {
      const resolution = resolveCommercialContext({
        workspaceId: body.workspaceId ? String(body.workspaceId) : undefined,
        skuId: String(body.skuId || ""),
        market: String(body.market || ""),
        listingId: body.listingId ? String(body.listingId) : undefined,
        locale: String(body.locale || ""),
        placement: String(body.placement || "TIKTOK"),
      });
      return NextResponse.json(resolution);
    }
    if (op === "import-listing") {
      const market = String(body.market || "");
      const sourceUrl = String(body.sourceUrl || "");
      const hostMarket = listingHostMarket(sourceUrl);
      if (hostMarket && hostMarket !== market) {
        throw new Error(`This link is a ${hostMarket} listing. This row is ${market}.`);
      }
      const preview = await previewListingImport(sourceUrl);
      const result = addCatalogListing({
        skuId: String(body.skuId || ""),
        market,
        marketplace: marketplaceFromUrl(sourceUrl),
        seller: preview.seller,
        sourceUrl: preview.sourceUrl || sourceUrl,
        title: preview.title,
      });
      return NextResponse.json({
        listing: result.listing,
        extracted: preview.extracted,
        title: preview.title,
        image: preview.image,
        seller: preview.seller,
        variantQuery: preview.variantQuery,
        error: preview.extracted ? "" : preview.error,
      });
    }
    if (op === "add-listing") {
      const result = addCatalogListing({
        workspaceId: body.workspaceId ? String(body.workspaceId) : undefined,
        skuId: String(body.skuId || ""),
        market: String(body.market || ""),
        marketplace: String(body.marketplace || "other"),
        seller: String(body.seller || ""),
        sourceUrl: String(body.sourceUrl || ""),
        merchantProductId: String(body.merchantProductId || ""),
        price: String(body.price || ""),
        currency: String(body.currency || ""),
      });
      return NextResponse.json({ listing: result.listing });
    }
    if (op === "note-review-basis") {
      const result = noteListingReviewBasis(String(body.listingId || ""), String(body.evidence || ""));
      return NextResponse.json({ listing: result.listing });
    }
    if (op === "review-listing") {
      const result = reviewCatalogListing(String(body.listingId || ""), String(body.review || "") as "REVIEWED" | "REJECTED", String(body.evidence || ""));
      return NextResponse.json({ listing: result.listing });
    }
    if (op === "add-destination") {
      const result = addDestinationVersion({
        workspaceId: body.workspaceId ? String(body.workspaceId) : undefined,
        listingId: String(body.listingId || ""),
        accountId: String(body.accountId || ""),
        destinationType: String(body.destinationType || "URL_LINK") as "URL_LINK" | "NATIVE_PRODUCT_TAG",
        trackedUrl: String(body.trackedUrl || ""),
        nativeProductRef: String(body.nativeProductRef || ""),
        accounts: accountsFromPrograms(),
      });
      return NextResponse.json({ destination: result.destination });
    }
    if (op === "set-preference") {
      setMarketPreference(String(body.skuId || ""), String(body.market || ""), String(body.listingId || ""));
      return NextResponse.json({ ok: true });
    }
    if (op === "add-fact") {
      const result = addCatalogFact({
        skuId: String(body.skuId || ""),
        kind: String(body.kind || "USE") as FactKind,
        statement: String(body.statement || ""),
        sourceType: body.sourceType ? String(body.sourceType) as "listing" | "image" | "ugc" | "campaign" | "manual" : "manual",
        category: body.category ? String(body.category) as "contents" | "features" | "usage" | "care" | "age" : undefined,
      });
      if (result.sku.legacyProductId) flagDraftFactReview(result.sku.legacyProductId, "A catalog fact was added. The saved plan stays until it is reviewed.");
      return NextResponse.json({ sku: result.sku });
    }
    if (op === "confirm-fact") {
      const result = confirmCatalogFact(String(body.factId || ""), String(body.basis || ""));
      if (result.sku.legacyProductId) flagDraftFactReview(result.sku.legacyProductId, "A catalog fact was confirmed. The saved plan stays until it is reviewed.");
      return NextResponse.json({ fact: result.fact, sku: result.sku });
    }
    if (op === "reject-fact") {
      const result = rejectCatalogFact(String(body.factId || ""), String(body.basis || ""));
      if (result.sku.legacyProductId) flagDraftFactReview(result.sku.legacyProductId, "A catalog fact was rejected. The saved plan stays until it is reviewed.");
      return NextResponse.json({ fact: result.fact, sku: result.sku });
    }
    if (op === "edit-fact") {
      const result = editCatalogFact(String(body.factId || ""), String(body.statement || ""));
      if (result.changed && result.sku.legacyProductId) flagDraftFactReview(result.sku.legacyProductId, "A catalog fact was edited. The saved plan stays until it is reviewed.");
      return NextResponse.json({ fact: result.fact, sku: result.sku });
    }
    if (op === "rename") {
      const result = setCatalogShortName(String(body.skuId || ""), String(body.shortName || ""));
      if (result.changed && result.sku.legacyProductId) {
        const skip = result.db.localNames
          .filter((row) => row.skuId === result.sku.id)
          .map((row) => ({ market: row.market, locale: row.locale }));
        noteFactoryNameImpact({
          catalogProductId: result.sku.legacyProductId,
          skuRevision: result.sku.revision,
          field: "product name",
          skip,
        });
      }
      return NextResponse.json({ sku: result.sku });
    }
    if (op === "set-local-name") {
      const result = setCatalogLocalName(String(body.skuId || ""), String(body.market || ""), String(body.locale || ""), String(body.name ?? ""));
      if (result.changed && result.sku.legacyProductId) {
        noteFactoryNameImpact({
          catalogProductId: result.sku.legacyProductId,
          skuRevision: result.sku.revision,
          field: `local name ${result.market} ${result.locale}`,
          market: result.market,
          locale: result.locale,
        });
      }
      return NextResponse.json({
        sku: result.sku,
        localNames: result.db.localNames.filter((row) => row.skuId === result.sku.id),
        displayName: result.sku.legacyProductId ? catalogDisplayName(result.sku.legacyProductId, result.market, result.locale) : result.sku.shortName,
      });
    }
    if (op === "split-sku") {
      const result = splitCatalogSku(String(body.skuId || ""), String(body.variantLabel || ""));
      return NextResponse.json({ sku: result.sku });
    }
    return NextResponse.json({ error: "Unknown operation" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
