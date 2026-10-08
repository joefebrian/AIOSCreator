export type CopyListing = {
  id: string;
  market: string | null;
  sourceUrl: string;
  variantReview?: string;
};

export type CopyDestination = {
  listingId: string;
  trackedUrl: string | null;
  nativeProductRef: string | null;
  reviewState: string;
  version: number;
};

export type CopyPreference = {
  skuId: string;
  market: string;
  listingId: string;
};

export type AffiliateCopy =
  | { action: "copy"; url: string; listingId: string }
  | { action: "add-affiliate"; listingId: string }
  | { action: "add-listing" };

/** The tracked URL on the preferred listing. The shop URL is never a stand-in. */
export function affiliateCopyTarget(input: {
  skuId: string;
  market: string;
  listings: CopyListing[];
  destinations: CopyDestination[];
  preferences: CopyPreference[];
}): AffiliateCopy {
  const rows = input.listings.filter((row) => row.market === input.market && row.variantReview !== "REJECTED");
  if (!rows.length) return { action: "add-listing" };
  const preferred = input.preferences.find((row) => row.skuId === input.skuId && row.market === input.market);
  const listing = (preferred && rows.find((row) => row.id === preferred.listingId)) || rows[0];
  const destination = input.destinations
    .filter((row) => row.listingId === listing.id && row.reviewState !== "EXPIRED")
    .sort((a, b) => b.version - a.version)[0];
  const url = destination?.trackedUrl?.trim() || "";
  if (/^https?:\/\//i.test(url)) return { action: "copy", url, listingId: listing.id };
  return { action: "add-affiliate", listingId: listing.id };
}
