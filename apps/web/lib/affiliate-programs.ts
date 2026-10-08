import fs from "node:fs";
import path from "node:path";
import { dataRoot, ensureDataDirs } from "./paths";
import { getAmazonAssociateTag, setAmazonAssociateTag } from "./products";

export type ProgramId = "amazon" | "shopee" | "aliexpress" | "tiktok-shop";

export type ProgramDef = {
  id: ProgramId;
  name: string;
  field: string;
  placeholder: string;
  hint: string;
};

export const PROGRAM_DEFS: ProgramDef[] = [
  {
    id: "amazon",
    name: "Amazon Associates",
    field: "Associate tag",
    placeholder: "yourtag-20",
    hint: "Added as ?tag= on amazon.com imports. A link already pasted on the SKU stays. Japan and Singapore stay untagged.",
  },
  {
    id: "shopee",
    name: "Shopee Affiliate",
    field: "Affiliate ID",
    placeholder: "Shopee affiliate ID",
    hint: "Affiliate ID for each country. A short link already pasted on the SKU stays.",
  },
  {
    id: "aliexpress",
    name: "AliExpress",
    field: "Tracking ID / PID",
    placeholder: "PID or tracking id",
    hint: "Paste the affiliate URL on the SKU. This ID is stored for scripts.",
  },
  {
    id: "tiktok-shop",
    name: "TikTok Shop",
    field: "Creator / shop ID",
    placeholder: "Creator ID",
    hint: "Later. Keep the shop URL on the SKU.",
  },
];

export type ShopeeMarket = "id" | "my" | "th" | "sg";

export const SHOPEE_MARKETS: { id: ShopeeMarket; label: string }[] = [
  { id: "id", label: "Indonesia" },
  { id: "my", label: "Malaysia" },
  { id: "th", label: "Thailand" },
  { id: "sg", label: "Singapore" },
];

type Store = {
  tags: Partial<Record<ProgramId, string>>;
  shopee?: Partial<Record<ShopeeMarket, string>>;
};

function filePath() {
  ensureDataDirs();
  return path.join(dataRoot(), "db", "affiliate-programs.json");
}

function readStore(): Store {
  const file = filePath();
  if (!fs.existsSync(file)) return { tags: {} };
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Store;
    const tags = raw.tags && typeof raw.tags === "object" ? raw.tags : {};
    const shopee = raw.shopee && typeof raw.shopee === "object" ? raw.shopee : undefined;
    return shopee ? { tags, shopee } : { tags };
  } catch {
    return { tags: {} };
  }
}

function writeStore(store: Store) {
  fs.writeFileSync(filePath(), JSON.stringify(store, null, 2), "utf8");
}

export function getShopeeMarkets() {
  const saved = readStore().shopee || {};
  const out: Partial<Record<ShopeeMarket, string>> = {};
  for (const market of SHOPEE_MARKETS) {
    const value = String(saved[market.id] || "").trim();
    if (value) out[market.id] = value;
  }
  return out;
}

export function setShopeeMarkets(input: Partial<Record<ShopeeMarket, string>>) {
  const next: Partial<Record<ShopeeMarket, string>> = {};
  for (const market of SHOPEE_MARKETS) {
    const value = String(input[market.id] ?? "").replace(/\s+/g, "");
    if (!value) continue;
    if (!/^\d{8,16}$/.test(value)) throw new Error(`${market.label} Affiliate ID must be digits.`);
    next[market.id] = value;
  }
  const store = readStore();
  store.shopee = next;
  delete store.tags.shopee;
  writeStore(store);
  return next;
}

export function getProgramTag(id: ProgramId) {
  if (id === "amazon") return getAmazonAssociateTag();
  if (id === "shopee") return "";
  return (readStore().tags[id] || "").trim();
}

export function setProgramTag(id: ProgramId, tag: string) {
  const next = tag.trim();
  if (id === "amazon") {
    setAmazonAssociateTag(next);
    return getProgramTag(id);
  }
  const store = readStore();
  store.tags[id] = next;
  writeStore(store);
  return next;
}

export function listPrograms() {
  return PROGRAM_DEFS.map((d) => {
    if (d.id === "shopee") {
      const markets = getShopeeMarkets();
      return { ...d, tag: "", markets, live: SHOPEE_MARKETS.some((market) => Boolean(markets[market.id])) };
    }
    const tag = getProgramTag(d.id);
    return { ...d, tag, live: Boolean(tag) };
  });
}
