import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { shopeeTrackedAffiliateUrl, shopeeTrackedSuggestions } from "./shopee-affiliate-link";
import {
  addCatalogListing,
  addDestinationVersion,
  catalogDisplayName,
  ensureSharedCatalog,
  readSharedCatalog,
  resolveCommercialContext,
  setCatalogLocalName,
  setCatalogShortName,
  setMarketPreference,
  setSharedCatalogRootForTests,
  splitCatalogSku,
  type CatalogAccount,
  type CatalogProduct,
} from "./shared-catalog";

function check(name: string, ok: boolean) {
  if (!ok) throw new Error(name);
  console.log("ok", name);
}

const accounts: CatalogAccount[] = [
  { id: "amazon:US", program: "amazon", market: "US", label: "Amazon Associates", configured: true },
  { id: "shopee:MY", program: "shopee", market: "MY", label: "Shopee Affiliate MY", configured: true },
  { id: "shopee:ID", program: "shopee", market: "ID", label: "Shopee Affiliate ID", configured: false },
];

function product(partial: Partial<CatalogProduct> & Pick<CatalogProduct, "id" | "title" | "sourceUrl">): CatalogProduct {
  return {
    provider: "amazon",
    providerProductId: "B000",
    features: [],
    images: [],
    affiliateUrl: "",
    ...partial,
  };
}

function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shared-catalog-"));
  setSharedCatalogRootForTests(dir);
  const longTitle = "Shark SpeedStyle HD331 very long marketplace title that should stay on the listing and not become the short display name for every row";
  const tracked = "https://www.amazon.com/dp/B0C7YJ7WML?tag=aioscreators-20&linkCode=ll1";
  const rows = [
    product({
      id: "p-us",
      title: longTitle,
      providerProductId: "B0C7YJ7WML",
      market: "com",
      sourceUrl: "https://www.amazon.com/dp/B0C7YJ7WML",
      affiliateUrl: tracked,
      price: "99.99",
      currency: "USD",
      features: ["Concentrator included"],
      images: ["/api/media/products/speed.jpg"],
      imageRoles: ["identity"],
      defaultImageUrl: "/api/media/products/speed.jpg",
    }),
    product({
      id: "p-copy-title",
      title: longTitle,
      providerProductId: "B0OTHER",
      market: "com",
      sourceUrl: "https://www.amazon.com/dp/B0OTHER",
      affiliateUrl: "https://www.amazon.com/dp/B0OTHER",
    }),
    product({
      id: "p-jp",
      title: "Japan only",
      market: "co.jp",
      sourceUrl: "https://www.amazon.co.jp/dp/B0JP",
      affiliateUrl: "https://www.amazon.co.jp/dp/B0JP?tag=should-not-apply",
    }),
  ];
  const first = ensureSharedCatalog(rows);
  const again = ensureSharedCatalog(rows);
  check("legacy map stable", first.legacy.length === 3 && first.legacy.every((row) => again.legacy.some((next) => next.productId === row.productId && next.skuId === row.skuId)));
  check("no automatic merge", new Set(first.skus.map((row) => row.id)).size === 3);
  const us = first.legacy.find((row) => row.productId === "p-us");
  const usListings = first.listings.filter((row) => row.skuId === us?.skuId);
  check("one country not five clones", usListings.length === 1 && usListings[0]?.market === "US" && usListings[0]?.variantReview === "PROVISIONAL");
  check("short name is not the raw title", (first.skus.find((row) => row.id === us?.skuId)?.shortName.length || 0) < longTitle.length);
  check("raw title stays on the snapshot", first.listingSnapshots.some((row) => row.listingId === us?.listingId && row.title === longTitle));
  const destination = first.destinations.find((row) => row.listingId === us?.listingId);
  check("tracked url preserved", destination?.trackedUrl === tracked && destination.reviewState === "UNVERIFIED" && destination.accountId == null);
  check("shop url stays separate", usListings[0]?.sourceUrl === "https://www.amazon.com/dp/B0C7YJ7WML" && !usListings[0].sourceUrl.includes("tag="));
  const copy = first.legacy.find((row) => row.productId === "p-copy-title");
  check("identical shop url is not a destination", !first.destinations.some((row) => row.listingId === copy?.listingId));
  const japan = first.listings.find((row) => row.skuId === first.legacy.find((link) => link.productId === "p-jp")?.skuId);
  check("unknown market stays unassigned", japan?.market == null && japan?.marketProvisional === true);
  check("price not converted", first.offers.every((row) => !row.currency || row.currency === "USD"));
  check("facts stay extracted", first.facts.every((row) => row.state === "EXTRACTED"));

  const my = addCatalogListing({
    skuId: us!.skuId,
    market: "MY",
    marketplace: "shopee",
    seller: "Local shop",
    sourceUrl: "https://shopee.com.my/product/1/2?tracking=keep",
  });
  check("second market is not a new sku", readSharedCatalog().skus.length === 3 && my.listing.skuId === us?.skuId);
  check("query kept on shop url", my.listing.sourceUrl.includes("tracking=keep"));
  const seller = addCatalogListing({
    skuId: us!.skuId,
    market: "US",
    marketplace: "amazon",
    seller: "Other seller",
    sourceUrl: "https://www.amazon.com/dp/B0C7YJ7WML?smid=OTHER",
  });
  check("two sellers stay separate", readSharedCatalog().listings.filter((row) => row.skuId === us?.skuId && row.market === "US").length === 2 && seller.listing.id !== usListings[0]?.id);
  setMarketPreference(us!.skuId, "US", seller.listing.id);
  check("preference does not remove the first listing", readSharedCatalog().listings.some((row) => row.id === usListings[0]?.id));
  const split = splitCatalogSku(us!.skuId, "Travel case edition");
  check("different variant is a new sku", split.sku.id !== us?.skuId && split.sku.familyId === first.skus.find((row) => row.id === us?.skuId)?.familyId);
  check("split copies no listing", !readSharedCatalog().listings.some((row) => row.skuId === split.sku.id));

  let unsafe = false;
  try {
    addCatalogListing({ skuId: us!.skuId, market: "SG", marketplace: "other", sourceUrl: "javascript:alert(1)" });
  } catch {
    unsafe = true;
  }
  check("unsafe url rejected", unsafe);

  let wrongAccount = false;
  try {
    addDestinationVersion({
      listingId: my.listing.id,
      accountId: "amazon:US",
      destinationType: "URL_LINK",
      trackedUrl: "https://shopee.com.my/product/1/2?aff=1",
      accounts,
    });
  } catch {
    wrongAccount = true;
  }
  check("wrong account rejected", wrongAccount);

  let otherWorkspace = false;
  try {
    addCatalogListing({ workspaceId: "other", skuId: us!.skuId, market: "TH", marketplace: "shopee", sourceUrl: "https://shopee.co.th/product/1/2" });
  } catch {
    otherWorkspace = true;
  }
  check("other workspace rejected", otherWorkspace);

  const saved = addDestinationVersion({
    listingId: my.listing.id,
    accountId: "shopee:MY",
    destinationType: "URL_LINK",
    trackedUrl: "https://s.shopee.com.my/abc?sub_id=keep",
    accounts,
  });
  const next = addDestinationVersion({
    listingId: my.listing.id,
    accountId: "shopee:MY",
    destinationType: "URL_LINK",
    trackedUrl: "https://s.shopee.com.my/abc?sub_id=next",
    accounts,
  });
  const versions = readSharedCatalog().destinations.filter((row) => row.listingId === my.listing.id);
  check("destination versions stay immutable", versions.length === 2 && versions.some((row) => row.trackedUrl?.includes("sub_id=keep")) && next.destination.version === saved.destination.version + 1);

  const beforeIds = readSharedCatalog().skus.map((row) => `${row.id}:${row.legacyProductId}`).sort();
  const beforeLegacy = readSharedCatalog().legacy.length;
  const beforeListings = JSON.stringify(readSharedCatalog().listings);
  const beforeSnaps = JSON.stringify(readSharedCatalog().listingSnapshots);
  const beforeDest = JSON.stringify(readSharedCatalog().destinations);
  const beforePref = JSON.stringify(readSharedCatalog().preferences);
  const usSku = readSharedCatalog().skus.find((row) => row.id === us!.skuId)!;
  const copyName = readSharedCatalog().skus.find((row) => row.id === copy!.skuId)!.shortName;
  const renamed = setCatalogShortName(usSku.id, "SpeedStyle");
  const renamedAgain = setCatalogShortName(usSku.id, "SpeedStyle");
  check("repeat product name keeps the sku", renamed.changed && !renamedAgain.changed && renamedAgain.sku.id === usSku.id && renamedAgain.sku.revision === usSku.revision + 1);
  const local = setCatalogLocalName(usSku.id, "US", "en-US", "SpeedStyle HD331");
  const localAgain = setCatalogLocalName(usSku.id, "US", "en-US", "SpeedStyle HD331");
  setCatalogLocalName(usSku.id, "MY", "ms-MY", "Pengering laju");
  setCatalogLocalName(usSku.id, "MY", "en-MY", "SpeedStyle Malaysia");
  const named = readSharedCatalog();
  check("local name save keeps product and sku ids", named.skus.map((row) => `${row.id}:${row.legacyProductId}`).sort().join() === beforeIds.join() && named.legacy.length === beforeLegacy);
  check("repeat local save updates one row", local.changed && !localAgain.changed && named.localNames.filter((row) => row.skuId === usSku.id && row.market === "US" && row.locale === "en-US").length === 1 && named.localNames.find((row) => row.market === "US")?.id === local.db.localNames.find((row) => row.market === "US" && row.locale === "en-US")?.id);
  check("one market does not overwrite another", catalogDisplayName("p-us", "US", "en-US") === "SpeedStyle HD331" && catalogDisplayName("p-us", "MY", "ms-MY") === "Pengering laju" && catalogDisplayName("p-us", "MY", "en-MY") === "SpeedStyle Malaysia");
  const cleared = setCatalogLocalName(usSku.id, "US", "en-US", " ");
  check("blank local name falls back to the product name", cleared.changed && catalogDisplayName("p-us", "US", "en-US") === "SpeedStyle" && catalogDisplayName("p-us", "SG", "en-SG") === "SpeedStyle" && !readSharedCatalog().localNames.some((row) => row.skuId === usSku.id && row.market === "US"));
  check("another sku keeps its name", readSharedCatalog().skus.find((row) => row.id === copy!.skuId)?.shortName === copyName);
  const after = readSharedCatalog();
  check("names do not change listings or affiliate bindings", JSON.stringify(after.listings) === beforeListings && JSON.stringify(after.listingSnapshots) === beforeSnaps && after.listingSnapshots.some((row) => row.title === longTitle) && JSON.stringify(after.destinations) === beforeDest && JSON.stringify(after.preferences) === beforePref);
  let badLocale = false;
  try {
    setCatalogLocalName(usSku.id, "MY", "id-ID", "Nama salah");
  } catch {
    badLocale = true;
  }
  check("local name locale must match the market", badLocale && readSharedCatalog().skus.length === beforeIds.length);

  const missing = resolveCommercialContext({ skuId: us!.skuId, market: "SG", locale: "en-SG", placement: "TIKTOK" });
  check("missing country blocks an unbound draft", missing.gaps.some((gap) => gap.includes("Singapore")));
  const bound = resolveCommercialContext({ skuId: us!.skuId, market: "US", locale: "en-US", placement: "TIKTOK", listingId: usListings[0]?.id });
  check("existing listing can draft", bound.gaps.length === 0 && bound.listing?.id === usListings[0]?.id && bound.notes.some((note) => note.includes("provisional")));
  const sampleId = "14354840000";
  const indonesia = shopeeTrackedAffiliateUrl("https://shopee.co.id/-New-Medicube-i.1541883178.56453967880?extraParams=keep", "ID", sampleId);
  const malaysia = shopeeTrackedAffiliateUrl("https://shopee.com.my/product/458606128/42451005288?extraParams=keep", "MY", sampleId);
  const singapore = shopeeTrackedAffiliateUrl("https://shopee.sg/item-i.100.200", "SG", sampleId);
  const thailand = shopeeTrackedAffiliateUrl("https://shopee.co.th/item-i.300.400", "TH", sampleId);
  check("indonesia tracked link uses the affiliate id", indonesia === `https://s.shopee.co.id/an_redir?origin_link=${encodeURIComponent("https://shopee.co.id/product/1541883178/56453967880")}&affiliate_id=${sampleId}&sub_id=aioscreator` && !indonesia.includes("extraParams"));
  check("malaysia singapore and thailand use their own redirect", malaysia.startsWith("https://s.shopee.com.my/an_redir?") && singapore.startsWith("https://s.shopee.sg/an_redir?") && thailand.startsWith("https://s.shopee.co.th/an_redir?") && malaysia.includes("458606128") && !malaysia.includes("extraParams"));
  const variantOrigin = "https://shopee.com.my/product/1868563221/53114350074?extraParams=" + encodeURIComponent(JSON.stringify({ display_model_id: 421235103862, model_selection_logic: 3 }));
  const variantLink = shopeeTrackedAffiliateUrl(`https://shopee.com.my/Medicube-Best-Daily-Toner-Pad-Collection-i.1868563221.53114350074?extraParams=${encodeURIComponent(JSON.stringify({ display_model_id: 421235103862, model_selection_logic: 3 }))}`, "MY", sampleId);
  check("malaysia tracked link keeps the selected variant", variantLink.startsWith("https://s.shopee.com.my/an_redir?") && decodeURIComponent(variantLink).includes("display_model_id") && decodeURIComponent(variantLink).includes("421235103862") && decodeURIComponent(variantLink).includes(variantOrigin.slice(0, 40)));
  check("tracked link stays on the matching country", shopeeTrackedAffiliateUrl("https://shopee.co.id/product/1/2", "MY", sampleId) === "" && shopeeTrackedAffiliateUrl("https://s.shopee.com.my/abc", "MY", sampleId) === "" && shopeeTrackedAffiliateUrl("https://shopee.com.my/product/1/2", "MY", "nope") === "");
  const suggestions = shopeeTrackedSuggestions(
    [
      { id: "open", market: "ID", marketplace: "shopee", sourceUrl: "https://shopee.co.id/product/1/2" },
      { id: "saved", market: "MY", marketplace: "shopee", sourceUrl: "https://shopee.com.my/product/3/4" },
    ],
    [{ listingId: "saved", trackedUrl: "https://s.shopee.com.my/already" }],
    { id: sampleId, my: sampleId },
  );
  check("a saved tracked link is not replaced", suggestions.open.startsWith("https://s.shopee.co.id/an_redir?") && suggestions.saved == null);
  setSharedCatalogRootForTests(null);
  console.log("shared catalog checks passed");
}

main();
