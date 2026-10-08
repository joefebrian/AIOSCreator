const SHOPEE_LINK_MARKETS = {
  id: { shopHost: "shopee.co.id", redirectHost: "s.shopee.co.id" },
  my: { shopHost: "shopee.com.my", redirectHost: "s.shopee.com.my" },
  sg: { shopHost: "shopee.sg", redirectHost: "s.shopee.sg" },
  th: { shopHost: "shopee.co.th", redirectHost: "s.shopee.co.th" },
} as const;

export type ShopeeLinkMarket = keyof typeof SHOPEE_LINK_MARKETS;

/** Official Shopee an_redir link. The shop URL stays unchanged. A blank result means the URL or ID cannot be used. */
export function shopeeTrackedAffiliateUrl(sourceUrl: string, market: string, affiliateId: string) {
  const hosts = SHOPEE_LINK_MARKETS[market.toLowerCase() as ShopeeLinkMarket];
  const id = affiliateId.replace(/\s+/g, "");
  if (!hosts || !/^\d{8,16}$/.test(id)) return "";
  let url: URL;
  try {
    url = new URL(sourceUrl.trim());
  } catch {
    return "";
  }
  const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
  if (hostname.startsWith("s.shopee.")) return "";
  if (hostname !== hosts.shopHost) return "";
  const item = url.toString().match(/i\.(\d+)\.(\d+)/) || url.toString().match(/\/product\/(\d+)\/(\d+)/);
  if (!item) return "";
  const originUrl = new URL(`https://${hosts.shopHost}/product/${item[1]}/${item[2]}`);
  const variant = variantSelectionId(url.toString());
  if (variant) {
    const extra = url.searchParams.get("extraParams");
    if (extra && variantSelectionId(`https://${hosts.shopHost}/product/${item[1]}/${item[2]}?extraParams=${encodeURIComponent(extra)}`) === variant) {
      originUrl.searchParams.set("extraParams", extra);
    } else originUrl.searchParams.set("display_model_id", variant);
  }
  return `https://${hosts.redirectHost}/an_redir?origin_link=${encodeURIComponent(originUrl.toString())}&affiliate_id=${id}&sub_id=aioscreator`;
}

/** Needs confirmation, confirmed for the current variant, or a recorded mismatch. A changed variant is not still confirmed. */
export function listingMatchStatus(listing: { variantReview: string; sourceUrl: string; reviewedVariantKey?: string | null; reviewEvidence?: string | null }) {
  const current = variantSelectionId(listing.sourceUrl);
  const bound = listing.reviewedVariantKey;
  if (typeof bound === "string" && bound !== current && listing.variantReview !== "PROVISIONAL") return "needs" as const;
  if (listing.variantReview === "REJECTED") return "different" as const;
  if (listing.variantReview === "REVIEWED") return "confirmed" as const;
  return "needs" as const;
}

/** Why a reference draft still cannot treat this market listing as the same physical SKU. */
export function targetListingBlocker(input: {
  market: string;
  factoryMarketplace?: string | null;
  shop: { variantReview: string; sourceUrl: string; reviewedVariantKey?: string | null; reviewEvidence?: string | null } | null;
}) {
  const shop = input.shop;
  if (!shop) {
    if (input.factoryMarketplace === "amazon" && input.market !== "US") {
      return `The draft still points at the source Amazon listing. Confirm the ${input.market} shop row is this same product. A short-link host is not that match.`;
    }
    return `Confirm the ${input.market} listing is the same physical SKU. A short-link host is not that match.`;
  }
  const status = listingMatchStatus(shop);
  if (status === "confirmed") return "";
  if (status === "different") return `The ${input.market} listing was marked as a different product.`;
  if (input.factoryMarketplace === "amazon" && input.market !== "US") {
    return `The draft still points at the source Amazon listing. Confirm the ${input.market} shop row is this same product. A short-link host is not that match.`;
  }
  return `Confirm the ${input.market} shop listing is the same physical SKU. A short-link host is not that match.`;
}

/** The selected Shopee variant, from display_model_id or extraParams. A hostname is not a variant. */
export function variantSelectionId(sourceUrl: string) {
  try {
    const url = new URL(sourceUrl);
    const direct = url.searchParams.get("display_model_id");
    if (direct) return direct;
    const extra = url.searchParams.get("extraParams");
    if (!extra) return "";
    const parsed = JSON.parse(extra) as { display_model_id?: unknown };
    return parsed?.display_model_id == null ? "" : String(parsed.display_model_id);
  } catch {
    return "";
  }
}

export function shopeeTrackedSuggestions(
  listings: { id: string; market: string | null; marketplace: string; sourceUrl: string }[],
  destinations: { listingId: string; trackedUrl: string | null }[],
  affiliateIds: Partial<Record<ShopeeLinkMarket, string>>,
) {
  const saved = new Set(destinations.filter((row) => row.trackedUrl).map((row) => row.listingId));
  const out: Record<string, string> = {};
  for (const listing of listings) {
    if (saved.has(listing.id) || listing.marketplace !== "shopee") continue;
    const market = (listing.market || "").toLowerCase() as ShopeeLinkMarket;
    const affiliateId = affiliateIds[market];
    if (!affiliateId) continue;
    const url = shopeeTrackedAffiliateUrl(listing.sourceUrl, market, affiliateId);
    if (url) out[listing.id] = url;
  }
  return out;
}
