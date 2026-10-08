export const MARKETS = [
  { id: "ID", label: "Indonesia" },
  { id: "MY", label: "Malaysia" },
  { id: "SG", label: "Singapore" },
  { id: "TH", label: "Thailand" },
  { id: "JP", label: "Japan" },
  { id: "US", label: "United States" },
] as const;

export type MarketId = (typeof MARKETS)[number]["id"];

const REGION_NAME: Record<MarketId, string> = {
  ID: "Indonesia",
  MY: "Malaysia",
  SG: "Singapore",
  TH: "Thailand",
  JP: "Japan",
  US: "the United States",
};

/** Setting line for a person who is already allowed in this market. */
export function marketRegionLine(market?: string) {
  const label = REGION_NAME[(market || "").trim().toUpperCase() as MarketId];
  if (!label) return "";
  return `Market is ${label}. The person is an adult from ${label}, in an everyday room there. Keep that country. Do not swap in a person from somewhere else.`;
}

const SHOP_MARKET: Record<string, MarketId> = {
  "co.id": "ID",
  id: "ID",
  "com.my": "MY",
  my: "MY",
  sg: "SG",
  "com.sg": "SG",
  "co.th": "TH",
  th: "TH",
  "co.jp": "JP",
  jp: "JP",
  com: "US",
  us: "US",
};

export function marketIdFromShop(raw?: string): MarketId | "" {
  const key = (raw || "").trim().toLowerCase().replace(/^www\./, "");
  return SHOP_MARKET[key] || "";
}

export function cleanMarkets(value: unknown): MarketId[] {
  const ids = Array.isArray(value) ? value : [];
  const known = new Set<string>(MARKETS.map((market) => market.id));
  const out: MarketId[] = [];
  for (const id of ids) {
    const key = String(id || "").trim().toUpperCase();
    if (!known.has(key) || out.includes(key as MarketId)) continue;
    out.push(key as MarketId);
  }
  return out;
}

/** Shop country for a catalog SKU. Empty when the listing host is outside the six markets. */
export function productMarketId(product: { market?: string; sourceUrl?: string }): MarketId | "" {
  const direct = marketIdFromShop(product.market);
  if (direct) return direct;
  try {
    const host = new URL(product.sourceUrl || "").hostname.replace(/^www\./, "").toLowerCase();
    const amazon = host.match(/^amazon\.([a-z.]+)$/);
    if (amazon) return marketIdFromShop(amazon[1]);
    const shopee = host.match(/(?:^|\.)shopee\.([a-z.]+)$/);
    if (shopee) return marketIdFromShop(shopee[1]);
  } catch {
    /* manual SKU */
  }
  return "";
}
