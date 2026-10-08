import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getProgramTag, getShopeeMarkets, type ShopeeMarket } from "./affiliate-programs";
import { dataRoot, ensureDataDirs } from "./paths";
import { skuIdentityUrl } from "./product-import";
import { listProducts, type Product } from "./products";
import { listingMatchStatus, variantSelectionId } from "./shopee-affiliate-link";

/** Pilot markets. A domain is only a hint until someone confirms it. */
export const CATALOG_MARKETS = [
  { id: "ID", label: "Indonesia", locales: ["id-ID"], currency: "IDR" },
  { id: "MY", label: "Malaysia", locales: ["ms-MY", "en-MY"], currency: "MYR" },
  { id: "SG", label: "Singapore", locales: ["en-SG"], currency: "SGD" },
  { id: "TH", label: "Thailand", locales: ["th-TH"], currency: "THB" },
  { id: "US", label: "United States", locales: ["en-US"], currency: "USD" },
] as const;

export type CatalogMarketId = (typeof CATALOG_MARKETS)[number]["id"];
export type FactKind = "LISTING" | "CONTENTS" | "USE" | "REFERENCE" | "AGE";
export type FactState = "EXTRACTED" | "CONFIRMED" | "CONFLICTED" | "REJECTED";

const MARKET_HINT: Record<string, CatalogMarketId> = {
  com: "US",
  us: "US",
  "co.id": "ID",
  id: "ID",
  "com.my": "MY",
  my: "MY",
  sg: "SG",
  "com.sg": "SG",
  "co.th": "TH",
  th: "TH",
};

const PLACEMENTS = ["TIKTOK", "REELS", "SHORTS", "SHOPEE_VIDEO", "DEMAND_GEN"] as const;
const WORKSPACE = "local";

export type CatalogAccount = {
  id: string;
  program: "amazon" | "shopee";
  market: CatalogMarketId;
  label: string;
  configured: boolean;
};

export type CatalogFamily = {
  id: string;
  label: string;
  category: string;
  createdAt: string;
};

export type CatalogSku = {
  id: string;
  familyId: string;
  legacyProductId: string | null;
  revision: number;
  shortName: string;
  shortNameEdited: boolean;
  variantLabel: string;
  variantProvisional: boolean;
  modelId: string | null;
  category: string;
  createdAt: string;
};

export type CatalogListing = {
  id: string;
  skuId: string;
  market: CatalogMarketId | null;
  marketProvisional: boolean;
  marketplace: string;
  seller: string;
  sourceUrl: string;
  merchantProductId: string | null;
  variantReview: "PROVISIONAL" | "REVIEWED" | "REJECTED";
  reviewEvidence: string;
  /** Variant id that the review applied to. A different physical variant needs a new check. */
  reviewedVariantKey?: string;
  availability: "UNKNOWN" | "AVAILABLE" | "UNAVAILABLE";
  createdAt: string;
};

export type ListingSnapshot = {
  id: string;
  listingId: string;
  observedAt: string;
  title: string;
  source: "import" | "manual";
};

export type OfferSnapshot = {
  id: string;
  listingId: string;
  observedAt: string;
  price: string | null;
  currency: string | null;
  confirmation: "EXTRACTED" | "CONFIRMED";
  source: "import" | "manual";
};

export type DestinationVersion = {
  id: string;
  listingId: string;
  market: CatalogMarketId;
  accountId: string | null;
  destinationType: "URL_LINK" | "NATIVE_PRODUCT_TAG";
  trackedUrl: string | null;
  nativeProductRef: string | null;
  version: number;
  reviewState: "UNVERIFIED" | "REVIEWED" | "EXPIRED" | "UNAVAILABLE";
  createdAt: string;
};

export type MarketPreference = {
  skuId: string;
  market: CatalogMarketId;
  listingId: string;
};

/** Optional customer-facing name for one existing SKU in one market and locale. */
export type CatalogLocalName = {
  id: string;
  skuId: string;
  market: CatalogMarketId;
  locale: string;
  name: string;
  updatedAt: string;
};

export type FactProvenance = {
  referenceId: string;
  assetId: string | null;
  analysisVersion: number;
  sourceUrl: string | null;
  evidence: string;
  sourceKind: "visual" | "spoken";
  startSec: number | null;
  endSec: number | null;
  reviewBasis?: string | null;
  /** source_appearance is the creator's own look or experience, not a SKU property. */
  claimClass?: "source_appearance" | "sku_property";
};

export type CatalogFact = {
  id: string;
  skuId: string;
  kind: FactKind;
  statement: string;
  state: FactState;
  sourceLevel: "LISTING" | "OPERATOR_OBSERVATION";
  createdAt: string;
  provenance?: FactProvenance;
  sourceType?: "listing" | "image" | "ugc" | "campaign" | "manual";
  category?: "contents" | "features" | "usage" | "care" | "age";
  reviewBasis?: string;
  /** Prior states. The current statement and provenance stay. */
  audit?: { at: string; from: FactState; to: FactState; note: string }[];
};

export type CatalogMedia = {
  id: string;
  skuId: string;
  role: string;
  url: string;
  source: "catalog" | "operator";
};

export type LegacyLink = {
  productId: string;
  familyId: string;
  skuId: string;
  listingId: string | null;
};

type Db = {
  schema: "shared-catalog-v1";
  migratedAt: string | null;
  families: CatalogFamily[];
  skus: CatalogSku[];
  listings: CatalogListing[];
  listingSnapshots: ListingSnapshot[];
  offers: OfferSnapshot[];
  destinations: DestinationVersion[];
  preferences: MarketPreference[];
  localNames: CatalogLocalName[];
  facts: CatalogFact[];
  media: CatalogMedia[];
  legacy: LegacyLink[];
};

export type CatalogProduct = Pick<
  Product,
  "id" | "provider" | "providerProductId" | "title" | "category" | "price" | "currency" | "features" | "images" | "imageRoles" | "defaultImageUrl" | "market" | "sourceUrl" | "affiliateUrl"
>;

let testRoot: string | null = null;

export function setSharedCatalogRootForTests(dir: string | null) {
  testRoot = dir;
}

function catalogFile() {
  const root = testRoot || dataRoot();
  if (!testRoot) ensureDataDirs();
  else fs.mkdirSync(path.join(root, "db"), { recursive: true });
  return path.join(root, "db", "shared-catalog.json");
}

function now() {
  return new Date().toISOString();
}

function emptyDb(): Db {
  return {
    schema: "shared-catalog-v1",
    migratedAt: null,
    families: [],
    skus: [],
    listings: [],
    listingSnapshots: [],
    offers: [],
    destinations: [],
    preferences: [],
    localNames: [],
    facts: [],
    media: [],
    legacy: [],
  };
}

function readFile(): Db {
  const file = catalogFile();
  if (!fs.existsSync(file)) return emptyDb();
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Db;
    if (raw.schema !== "shared-catalog-v1") return emptyDb();
    const db = { ...emptyDb(), ...raw, schema: "shared-catalog-v1" as const };
    if (!Array.isArray(db.localNames)) db.localNames = [];
    return db;
  } catch {
    return emptyDb();
  }
}

function writeFile(db: Db) {
  const file = catalogFile();
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

export function catalogRollbackPaths() {
  return {
    products: path.join(dataRoot(), "db", "products.json"),
    productsBackup: path.join(dataRoot(), "db", "products.pre-shared-catalog.json"),
    catalog: path.join(dataRoot(), "db", "shared-catalog.json"),
  };
}

function backupProductsOnce() {
  if (testRoot) return;
  const { products, productsBackup } = catalogRollbackPaths();
  if (!fs.existsSync(products) || fs.existsSync(productsBackup)) return;
  fs.copyFileSync(products, productsBackup);
}

export function shortDisplayName(title: string) {
  const clean = title.replace(/\s+/g, " ").trim();
  if (clean.length <= 72) return clean || "Untitled product";
  const cut = clean.slice(0, 72);
  const space = cut.lastIndexOf(" ");
  return (space > 40 ? cut.slice(0, space) : cut).trim();
}

export function hintMarket(product: { market?: string; sourceUrl?: string }): CatalogMarketId | null {
  const direct = MARKET_HINT[(product.market || "").toLowerCase()];
  if (direct) return direct;
  try {
    const host = new URL(product.sourceUrl || "").hostname.replace(/^www\./, "").toLowerCase();
    const amazon = host.match(/^amazon\.([a-z.]+)$/);
    if (amazon && MARKET_HINT[amazon[1]]) return MARKET_HINT[amazon[1]];
    const shopee = host.match(/(?:^|\.)shopee\.([a-z.]+)$/);
    if (shopee && MARKET_HINT[shopee[1]]) return MARKET_HINT[shopee[1]];
  } catch {
    /* manual row */
  }
  return null;
}

export function marketOf(id: string) {
  return CATALOG_MARKETS.find((market) => market.id === id);
}

export function assertHttpUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Enter a full listing URL.");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error("Enter a full listing URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error("Only http and https links can be saved.");
  return trimmed;
}

export function accountsFromPrograms(): CatalogAccount[] {
  const amazon = Boolean(getProgramTag("amazon"));
  const shopee = getShopeeMarkets();
  const rows: CatalogAccount[] = [{ id: "amazon:US", program: "amazon", market: "US", label: "Amazon Associates", configured: amazon }];
  (["ID", "MY", "SG", "TH"] as const).forEach((market) => {
    const key = market.toLowerCase() as ShopeeMarket;
    rows.push({
      id: `shopee:${market}`,
      program: "shopee",
      market,
      label: `Shopee Affiliate ${market}`,
      configured: Boolean(shopee[key]),
    });
  });
  return rows;
}

export function accountFits(account: CatalogAccount, market: CatalogMarketId, marketplace: string) {
  if (!account.configured || account.market !== market) return false;
  if (account.program === "amazon") return market === "US" && marketplace === "amazon";
  return account.program === "shopee" && marketplace === "shopee";
}

function pushFact(db: Db, fact: Omit<CatalogFact, "id" | "createdAt">) {
  const statement = fact.statement.replace(/\s+/g, " ").trim().slice(0, 400);
  if (!statement) return;
  if (db.facts.some((row) => row.skuId === fact.skuId && row.statement === statement)) return;
  db.facts.push({ ...fact, statement, id: randomUUID(), createdAt: now() });
}

function migrateProduct(db: Db, product: CatalogProduct) {
  if (db.legacy.some((row) => row.productId === product.id)) {
    syncExisting(db, product);
    return;
  }
  const family: CatalogFamily = {
    id: randomUUID(),
    label: shortDisplayName(product.title || "Untitled product"),
    category: product.category || "Uncategorized",
    createdAt: now(),
  };
  const sku: CatalogSku = {
    id: randomUUID(),
    familyId: family.id,
    legacyProductId: product.id,
    revision: 1,
    shortName: family.label,
    shortNameEdited: false,
    variantLabel: "Not reviewed",
    variantProvisional: true,
    modelId: product.providerProductId && product.providerProductId !== "unknown" ? product.providerProductId : null,
    category: product.category || "Uncategorized",
    createdAt: now(),
  };
  db.families.push(family);
  db.skus.push(sku);
  const hinted = hintMarket(product);
  let listingId: string | null = null;
  if (product.sourceUrl || product.providerProductId) {
    const listing: CatalogListing = {
      id: randomUUID(),
      skuId: sku.id,
      market: hinted,
      marketProvisional: true,
      marketplace: product.provider || "other",
      seller: "",
      sourceUrl: product.sourceUrl || "",
      merchantProductId: sku.modelId,
      variantReview: "PROVISIONAL",
      reviewEvidence: "",
      availability: "UNKNOWN",
      createdAt: now(),
    };
    db.listings.push(listing);
    listingId = listing.id;
    db.listingSnapshots.push({
      id: randomUUID(),
      listingId: listing.id,
      observedAt: now(),
      title: product.title || "",
      source: "import",
    });
    if (product.price) {
      db.offers.push({
        id: randomUUID(),
        listingId: listing.id,
        observedAt: now(),
        price: product.price,
        currency: product.currency ? product.currency.toUpperCase() : null,
        confirmation: "EXTRACTED",
        source: "import",
      });
    }
    const affiliate = (product.affiliateUrl || "").trim();
    const source = (product.sourceUrl || "").trim();
    if (affiliate && affiliate !== source && hinted) {
      db.destinations.push({
        id: randomUUID(),
        listingId: listing.id,
        market: hinted,
        accountId: null,
        destinationType: "URL_LINK",
        trackedUrl: affiliate,
        nativeProductRef: null,
        version: 1,
        reviewState: "UNVERIFIED",
        createdAt: now(),
      });
    }
  }
  pushFact(db, { skuId: sku.id, kind: "LISTING", statement: product.title || "", state: "EXTRACTED", sourceLevel: "LISTING" });
  for (const feature of product.features || []) {
    pushFact(db, { skuId: sku.id, kind: "LISTING", statement: feature, state: "EXTRACTED", sourceLevel: "LISTING" });
  }
  syncMedia(db, sku.id, product);
  db.legacy.push({ productId: product.id, familyId: family.id, skuId: sku.id, listingId });
}

function syncExisting(db: Db, product: CatalogProduct) {
  const link = db.legacy.find((row) => row.productId === product.id);
  if (!link) return;
  const sku = db.skus.find((row) => row.id === link.skuId);
  if (!sku) return;
  if (!sku.shortNameEdited) {
    const next = shortDisplayName(product.title || sku.shortName);
    sku.shortName = next;
    const family = db.families.find((row) => row.id === sku.familyId);
    if (family) family.label = next;
  }
  if (product.category && sku.category === "Uncategorized") sku.category = product.category;
  for (const feature of product.features || []) {
    pushFact(db, { skuId: sku.id, kind: "LISTING", statement: feature, state: "EXTRACTED", sourceLevel: "LISTING" });
  }
  syncMedia(db, sku.id, product);
}

function syncMedia(db: Db, skuId: string, product: CatalogProduct) {
  const identity = skuIdentityUrl(product);
  product.images?.forEach((url, index) => {
    if (!url) return;
    if (db.media.some((row) => row.skuId === skuId && row.url === url)) return;
    const role = url === identity ? "identity" : product.imageRoles?.[index] || "other";
    db.media.push({ id: randomUUID(), skuId, role, url, source: "catalog" });
  });
}

export function ensureSharedCatalog(products?: CatalogProduct[]) {
  backupProductsOnce();
  const db = readFile();
  const before = JSON.stringify(db);
  const rows = products ?? (testRoot ? [] : listProducts());
  for (const product of rows) migrateProduct(db, product);
  if (!db.migratedAt) db.migratedAt = now();
  if (JSON.stringify(db) !== before) writeFile(db);
  return db;
}

export function readSharedCatalog(products?: CatalogProduct[]) {
  return ensureSharedCatalog(products);
}

export function skuByLegacyProduct(productId: string) {
  const db = readSharedCatalog();
  const link = db.legacy.find((row) => row.productId === productId);
  return link ? db.skus.find((row) => row.id === link.skuId) || null : null;
}

function requireSku(db: Db, skuId: string) {
  const sku = db.skus.find((row) => row.id === skuId);
  if (!sku) throw new Error("SKU not found");
  return sku;
}

export function addCatalogListing(input: {
  workspaceId?: string;
  skuId: string;
  market: string;
  marketplace: string;
  seller?: string;
  sourceUrl: string;
  merchantProductId?: string;
  price?: string;
  currency?: string;
  title?: string;
}) {
  if (input.workspaceId && input.workspaceId !== WORKSPACE) throw new Error("This workspace cannot use that catalog id.");
  const market = marketOf(input.market);
  if (!market) throw new Error("Market must be Indonesia, Malaysia, Singapore, Thailand, or the United States.");
  const sourceUrl = assertHttpUrl(input.sourceUrl);
  const db = readSharedCatalog();
  const sku = requireSku(db, input.skuId);
  const listing: CatalogListing = {
    id: randomUUID(),
    skuId: sku.id,
    market: market.id,
    marketProvisional: false,
    marketplace: (input.marketplace || "other").trim() || "other",
    seller: (input.seller || "").trim(),
    sourceUrl,
    merchantProductId: (input.merchantProductId || "").trim() || null,
    variantReview: "PROVISIONAL",
    reviewEvidence: "",
    availability: "UNKNOWN",
    createdAt: now(),
  };
  db.listings.push(listing);
  const extractedTitle = (input.title || "").replace(/\s+/g, " ").trim();
  const titleIsUrl = /^https?:\/\//i.test(extractedTitle);
  db.listingSnapshots.push({
    id: randomUUID(),
    listingId: listing.id,
    observedAt: now(),
    title: extractedTitle && !titleIsUrl ? extractedTitle : "",
    source: extractedTitle && !titleIsUrl ? "import" : "manual",
  });
  if (input.price?.trim()) {
    db.offers.push({
      id: randomUUID(),
      listingId: listing.id,
      observedAt: now(),
      price: input.price.trim(),
      currency: input.currency?.trim() ? input.currency.trim().toUpperCase() : null,
      confirmation: "EXTRACTED",
      source: "manual",
    });
  }
  writeFile(db);
  return { listing, db };
}

/** Records why a listing is or is not the physical SKU. Does not change the review state or other countries. */
export function noteListingReviewBasis(listingId: string, evidence: string) {
  const note = evidence.replace(/\s+/g, " ").trim();
  if (note.length < 8) throw new Error("Record what was compared before saving this note.");
  const db = readSharedCatalog();
  const listing = db.listings.find((row) => row.id === listingId);
  if (!listing) throw new Error("Listing not found");
  listing.reviewEvidence = note;
  writeFile(db);
  return { listing, db };
}

export function reviewCatalogListing(listingId: string, review: "REVIEWED" | "REJECTED", evidence: string) {
  const note = evidence.replace(/\s+/g, " ").trim();
  if (note && note.length < 8) throw new Error("The review note is too short to save.");
  const db = readSharedCatalog();
  const listing = db.listings.find((row) => row.id === listingId);
  if (!listing) throw new Error("Listing not found");
  if (listing.variantReview === "REJECTED" && review === "REVIEWED") {
    throw new Error("This listing is a different product. The confirmation was not saved.");
  }
  const sku = db.skus.find((row) => row.id === listing.skuId);
  listing.variantReview = review;
  if (note) listing.reviewEvidence = note;
  else if (review === "REVIEWED" && /not confirmed/i.test(listing.reviewEvidence || "")) listing.reviewEvidence = "";
  listing.reviewedVariantKey = variantSelectionId(listing.sourceUrl);
  listing.marketProvisional = false;
  writeFile(db);
  return { listing, sku, db };
}

export function addDestinationVersion(input: {
  workspaceId?: string;
  listingId: string;
  accountId: string;
  destinationType: "URL_LINK" | "NATIVE_PRODUCT_TAG";
  trackedUrl?: string;
  nativeProductRef?: string;
  accounts: CatalogAccount[];
}) {
  if (input.workspaceId && input.workspaceId !== WORKSPACE) throw new Error("This workspace cannot use that catalog id.");
  const db = readSharedCatalog();
  const listing = db.listings.find((row) => row.id === input.listingId);
  if (!listing || !listing.market) throw new Error("Confirm the listing market before saving a destination.");
  const account = input.accounts.find((row) => row.id === input.accountId);
  if (!account || !accountFits(account, listing.market, listing.marketplace)) {
    throw new Error("That account is not configured for this listing's market.");
  }
  const destinationType = input.destinationType === "NATIVE_PRODUCT_TAG" ? "NATIVE_PRODUCT_TAG" : "URL_LINK";
  let trackedUrl: string | null = null;
  let nativeProductRef: string | null = null;
  if (destinationType === "URL_LINK") {
    trackedUrl = assertHttpUrl(input.trackedUrl || "");
  } else {
    nativeProductRef = (input.nativeProductRef || "").trim();
    if (!nativeProductRef) throw new Error("Enter the native product reference.");
  }
  const previous = db.destinations.filter((row) => row.listingId === listing.id);
  const version = previous.reduce((max, row) => Math.max(max, row.version), 0) + 1;
  const destination: DestinationVersion = {
    id: randomUUID(),
    listingId: listing.id,
    market: listing.market,
    accountId: account.id,
    destinationType,
    trackedUrl,
    nativeProductRef,
    version,
    reviewState: "UNVERIFIED",
    createdAt: now(),
  };
  db.destinations.push(destination);
  writeFile(db);
  return { destination, db };
}

export function setMarketPreference(skuId: string, market: string, listingId: string) {
  const parsed = marketOf(market);
  if (!parsed) throw new Error("Unknown market");
  const db = readSharedCatalog();
  const listing = db.listings.find((row) => row.id === listingId);
  if (!listing || listing.skuId !== skuId || listing.market !== parsed.id) throw new Error("That listing is not in this market.");
  db.preferences = db.preferences.filter((row) => !(row.skuId === skuId && row.market === parsed.id));
  db.preferences.push({ skuId, market: parsed.id, listingId });
  writeFile(db);
  return db;
}

export function addCatalogFact(input: { skuId: string; kind: FactKind; statement: string; sourceType?: CatalogFact["sourceType"]; category?: CatalogFact["category"] }) {
  const db = readSharedCatalog();
  const sku = requireSku(db, input.skuId);
  const kinds: FactKind[] = ["LISTING", "CONTENTS", "USE", "REFERENCE", "AGE"];
  if (!kinds.includes(input.kind)) throw new Error("Unknown fact kind");
  pushFact(db, {
    skuId: sku.id,
    kind: input.kind,
    statement: input.statement,
    state: "EXTRACTED",
    sourceLevel: input.sourceType === "listing" ? "LISTING" : "OPERATOR_OBSERVATION",
    sourceType: input.sourceType,
    category: input.category,
  });
  sku.revision += 1;
  writeFile(db);
  return { sku, db };
}

/** Pending reference observation. Does not confirm it and does not change an existing confirmed fact. */
export function addExtractedReferenceFact(input: { skuId: string; statement: string; provenance: FactProvenance }) {
  const db = readSharedCatalog();
  const sku = requireSku(db, input.skuId);
  const statement = input.statement.replace(/\s+/g, " ").trim().slice(0, 400);
  if (!statement) throw new Error("The fact needs a statement.");
  const same = db.facts.find((row) => row.skuId === sku.id && row.statement === statement);
  if (same) return { fact: same, created: false, db };
  const fact: CatalogFact = {
    id: randomUUID(),
    skuId: sku.id,
    kind: "REFERENCE",
    statement,
    state: "EXTRACTED",
    sourceLevel: "OPERATOR_OBSERVATION",
    createdAt: now(),
    provenance: input.provenance,
  };
  db.facts.push(fact);
  writeFile(db);
  return { fact, created: true, db };
}

/** Removes verified-SKU eligibility when a spoken confirmation has no review basis. The quote and provenance stay. */
export function withdrawSourceAppearanceClaim(factId: string) {
  const db = readSharedCatalog();
  const fact = db.facts.find((row) => row.id === factId);
  if (!fact) throw new Error("Fact not found");
  if (fact.provenance?.reviewBasis) throw new Error("This confirmation has a review basis. It was not changed.");
  if (fact.state !== "CONFIRMED") return { fact, sku: requireSku(db, fact.skuId), changed: false };
  fact.audit = [...(fact.audit || []), {
    at: now(),
    from: "CONFIRMED",
    to: "EXTRACTED",
    note: "Eligibility as a verified SKU fact was removed. The line describes the source creator. No review basis was recorded.",
  }];
  fact.state = "EXTRACTED";
  fact.provenance = { ...(fact.provenance as FactProvenance), claimClass: "source_appearance" };
  const sku = requireSku(db, fact.skuId);
  sku.revision += 1;
  writeFile(db);
  return { fact, sku, changed: true };
}

export function confirmCatalogFact(factId: string, basis?: string) {
  const db = readSharedCatalog();
  const fact = db.facts.find((row) => row.id === factId);
  if (!fact) throw new Error("Fact not found");
  const note = (basis || "").replace(/\s+/g, " ").trim();
  if (fact.provenance?.claimClass === "source_appearance" || /\b(my skin|glowing|glowy|hasilnya|kulit saya)\b/i.test(fact.statement)) {
    throw new Error("This is a source testimonial. Confirming the words does not make it this SKU's result.");
  }
  if (note.length < 8) throw new Error("Record what you compared before confirming this for the SKU.");
  if (/\d+(?:\.\d+)?\s*%/.test(fact.statement) && !/\b(measured|study|lab)\b/i.test(note)) {
    throw new Error("A numeric result needs the measurement evidence before it can be confirmed for this SKU.");
  }
  fact.audit = [...(fact.audit || []), { at: now(), from: fact.state, to: "CONFIRMED", note }];
  fact.state = "CONFIRMED";
  fact.reviewBasis = note;
  const sku = requireSku(db, fact.skuId);
  sku.revision += 1;
  writeFile(db);
  return { fact, sku, db };
}

export function rejectCatalogFact(factId: string, basis?: string) {
  const db = readSharedCatalog();
  const fact = db.facts.find((row) => row.id === factId);
  if (!fact) throw new Error("Fact not found");
  const note = (basis || "Rejected for this SKU.").replace(/\s+/g, " ").trim();
  fact.audit = [...(fact.audit || []), { at: now(), from: fact.state, to: "REJECTED", note }];
  fact.state = "REJECTED";
  if (note.length >= 8) fact.reviewBasis = note;
  const sku = requireSku(db, fact.skuId);
  sku.revision += 1;
  writeFile(db);
  return { fact, sku, db };
}

export function editCatalogFact(factId: string, statement: string) {
  const db = readSharedCatalog();
  const fact = db.facts.find((row) => row.id === factId);
  if (!fact) throw new Error("Fact not found");
  const next = statement.replace(/\s+/g, " ").trim().slice(0, 400);
  if (next.length < 8) throw new Error("Keep the fact long enough to review.");
  if (next === fact.statement) return { fact, sku: requireSku(db, fact.skuId), db, changed: false };
  fact.audit = [...(fact.audit || []), { at: now(), from: fact.state, to: fact.state, note: `Edited from: ${fact.statement}` }];
  fact.statement = next;
  if (fact.state === "CONFIRMED") fact.state = "EXTRACTED";
  const sku = requireSku(db, fact.skuId);
  sku.revision += 1;
  writeFile(db);
  return { fact, sku, db, changed: true };
}

export function setCatalogShortName(skuId: string, shortName: string) {
  const name = shortName.replace(/\s+/g, " ").trim();
  if (!name || name.length > 80) throw new Error("Keep the product name under 80 characters.");
  const db = readSharedCatalog();
  const sku = requireSku(db, skuId);
  if (sku.shortName === name && sku.shortNameEdited) return { sku, db, changed: false };
  sku.shortName = name;
  sku.shortNameEdited = true;
  sku.revision += 1;
  const family = db.families.find((row) => row.id === sku.familyId);
  const siblings = db.skus.filter((row) => row.familyId === sku.familyId);
  if (family && siblings.length === 1) family.label = name;
  writeFile(db);
  return { sku, db, changed: true };
}

function sameLocalName(row: CatalogLocalName, skuId: string, market: CatalogMarketId, locale: string) {
  return row.skuId === skuId && row.market === market && row.locale === locale;
}

/** Upsert one local name on the existing SKU. A blank name removes the override. */
export function setCatalogLocalName(skuId: string, market: string, locale: string, name: string) {
  const parsed = marketOf(market);
  if (!parsed) throw new Error("Market must be Indonesia, Malaysia, Singapore, Thailand, or the United States.");
  if (!parsed.locales.includes(locale as (typeof parsed.locales)[number])) throw new Error(`${parsed.label} does not use ${locale}.`);
  const cleaned = name.replace(/\s+/g, " ").trim();
  if (cleaned.length > 80) throw new Error("Keep the local name under 80 characters.");
  const db = readSharedCatalog();
  const sku = requireSku(db, skuId);
  const current = db.localNames.filter((row) => sameLocalName(row, sku.id, parsed.id, locale));
  const rest = db.localNames.filter((row) => !sameLocalName(row, sku.id, parsed.id, locale));
  if (!cleaned) {
    if (!current.length) return { sku, db, changed: false, market: parsed.id, locale };
    db.localNames = rest;
    writeFile(db);
    return { sku, db, changed: true, market: parsed.id, locale };
  }
  if (current.length === 1 && current[0].name === cleaned) return { sku, db, changed: false, market: parsed.id, locale };
  db.localNames = [
    ...rest,
    {
      id: current[0]?.id || randomUUID(),
      skuId: sku.id,
      market: parsed.id,
      locale,
      name: cleaned,
      updatedAt: now(),
    },
  ];
  writeFile(db);
  return { sku, db, changed: true, market: parsed.id, locale };
}

/** Local override for this SKU, market, and locale, otherwise the canonical product name. */
export function catalogDisplayName(catalogProductId: string | null, market: string, locale: string) {
  if (!catalogProductId) return "";
  const db = readSharedCatalog();
  const sku = db.skus.find((row) => row.legacyProductId === catalogProductId);
  if (!sku) return "";
  const local = db.localNames.find((row) => row.skuId === sku.id && row.market === market && row.locale === locale);
  const override = local?.name.replace(/\s+/g, " ").trim();
  return override || sku.shortName;
}

export function splitCatalogSku(fromSkuId: string, variantLabel: string) {
  const label = variantLabel.replace(/\s+/g, " ").trim();
  if (!label) throw new Error("Name the different physical variant.");
  const db = readSharedCatalog();
  const from = requireSku(db, fromSkuId);
  if (label === from.variantLabel) throw new Error("A different physical product needs a different variant label.");
  const sku: CatalogSku = {
    id: randomUUID(),
    familyId: from.familyId,
    legacyProductId: null,
    revision: 1,
    shortName: from.shortName,
    shortNameEdited: true,
    variantLabel: label,
    variantProvisional: true,
    modelId: null,
    category: from.category,
    createdAt: now(),
  };
  db.skus.push(sku);
  writeFile(db);
  return { sku, db };
}

export type CommercialResolution = {
  sku: CatalogSku;
  market: CatalogMarketId;
  listing: CatalogListing | null;
  destination: DestinationVersion | null;
  locale: string;
  placement: string;
  gaps: string[];
  notes: string[];
};

export function resolveCommercialContext(input: {
  workspaceId?: string;
  skuId: string;
  market: string;
  listingId?: string;
  locale: string;
  placement: string;
}): CommercialResolution {
  if (input.workspaceId && input.workspaceId !== WORKSPACE) throw new Error("This workspace cannot use that catalog id.");
  const db = readSharedCatalog();
  const sku = db.skus.find((row) => row.id === input.skuId);
  if (!sku) throw new Error("SKU not found");
  const market = marketOf(input.market);
  if (!market) throw new Error("Market must be Indonesia, Malaysia, Singapore, Thailand, or the United States.");
  if (!market.locales.includes(input.locale as (typeof market.locales)[number])) throw new Error(`${market.label} does not use ${input.locale}.`);
  if (!PLACEMENTS.includes(input.placement as (typeof PLACEMENTS)[number])) throw new Error("Unknown placement.");
  const listings = db.listings.filter((row) => row.skuId === sku.id && row.market === market.id && row.variantReview !== "REJECTED");
  const listing = input.listingId ? listings.find((row) => row.id === input.listingId) || null : preferredListing(db, sku.id, market.id);
  const gaps: string[] = [];
  const notes: string[] = [];
  if (!listing) gaps.push(`No ${market.label} listing is saved for this SKU.`);
  else if (listingMatchStatus(listing) !== "confirmed") notes.push("The exact variant is still provisional.");
  const destination = listing
    ? db.destinations.filter((row) => row.listingId === listing.id && row.reviewState !== "EXPIRED").sort((a, b) => b.version - a.version)[0] || null
    : null;
  if (!destination) notes.push("No tracked affiliate destination is saved for this listing.");
  else if (destination.reviewState !== "REVIEWED") notes.push("The affiliate destination is not reviewed.");
  return { sku, market: market.id, listing, destination, locale: input.locale, placement: input.placement, gaps, notes };
}

function preferredListing(db: Db, skuId: string, market: CatalogMarketId) {
  const pref = db.preferences.find((row) => row.skuId === skuId && row.market === market);
  const listings = db.listings.filter((row) => row.skuId === skuId && row.market === market && row.variantReview !== "REJECTED");
  if (pref) return listings.find((row) => row.id === pref.listingId) || listings[0] || null;
  return listings[0] || null;
}

export function latestDestination(listingId: string) {
  const db = readSharedCatalog();
  return db.destinations.filter((row) => row.listingId === listingId).sort((a, b) => b.version - a.version)[0] || null;
}
