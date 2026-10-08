import fs from "node:fs";
import path from "node:path";
import { dataRoot, ensureDataDirs } from "./paths";

export type InvolveMarket = "shopee-my" | "shopee-th";

type InvolveConfig = {
  key?: string;
  secret?: string;
  offers?: Partial<Record<InvolveMarket, number>>;
};

type LinkCache = Record<string, { trackingLink: string; offerId: number; at: string }>;

const AUTH = "https://api.involve.asia/api/authenticate";
const OFFERS = "https://api.involve.asia/api/offers/all";
const DEEPLINK = "https://api.involve.asia/api/deeplink/generate";

let tokenCache: { token: string; exp: number } | null = null;

function configPath() {
  ensureDataDirs();
  return path.join(dataRoot(), "db", "involve.json");
}

function cachePath() {
  ensureDataDirs();
  return path.join(dataRoot(), "db", "involve-links.json");
}

function readConfig(): InvolveConfig {
  const file = configPath();
  if (!fs.existsSync(file)) return { offers: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as InvolveConfig;
    return { key: parsed.key || "", secret: parsed.secret || "", offers: parsed.offers || {} };
  } catch {
    return { offers: {} };
  }
}

function writeConfig(config: InvolveConfig) {
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2), "utf8");
}

function readCache(): LinkCache {
  const file = cachePath();
  if (!fs.existsSync(file)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as LinkCache;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function scrub(message: string) {
  const cfg = readConfig();
  let text = String(message || "Involve request failed");
  if (cfg.secret) text = text.split(cfg.secret).join("");
  if (cfg.key) text = text.split(cfg.key).join("");
  return text.slice(0, 240);
}

export function shopeeInvolveMarket(sourceUrl: string): InvolveMarket | null {
  try {
    const host = new URL(sourceUrl).hostname.replace(/^www\./, "").toLowerCase();
    if (host === "shopee.com.my" || host.endsWith(".shopee.com.my")) return "shopee-my";
    if (host === "shopee.co.th" || host.endsWith(".shopee.co.th")) return "shopee-th";
    return null;
  } catch {
    return null;
  }
}

export function involveStatus() {
  const cfg = readConfig();
  return {
    hasKey: Boolean(cfg.key?.trim()),
    hasSecret: Boolean(cfg.secret?.trim()),
    offerMy: cfg.offers?.["shopee-my"] || 0,
    offerTh: cfg.offers?.["shopee-th"] || 0,
  };
}

export function saveInvolve(input: { key?: string; secret?: string; offerMy?: string; offerTh?: string }) {
  const cfg = readConfig();
  if (input.key?.trim()) cfg.key = input.key.trim();
  if (input.secret?.trim()) cfg.secret = input.secret.trim();
  const offers = { ...(cfg.offers || {}) };
  if (input.offerMy !== undefined) offers["shopee-my"] = positiveId(input.offerMy);
  if (input.offerTh !== undefined) offers["shopee-th"] = positiveId(input.offerTh);
  cfg.offers = offers;
  writeConfig(cfg);
  tokenCache = null;
  return involveStatus();
}

function positiveId(raw: string) {
  const value = Number(String(raw).trim());
  return Number.isInteger(value) && value > 0 ? value : 0;
}

async function login() {
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.token;
  const cfg = readConfig();
  if (!cfg.key?.trim() || !cfg.secret?.trim()) throw new Error("Involve API key is missing.");
  const res = await fetch(AUTH, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ key: cfg.key.trim(), secret: cfg.secret.trim() }),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as { message?: string; data?: { token?: string } };
  const token = json.data?.token?.trim();
  if (!token) throw new Error(scrub(json.message || "Involve login failed."));
  tokenCache = { token, exp: Date.now() + 110 * 60_000 };
  return token;
}

export function isInvolveLink(raw: string) {
  try {
    const url = new URL(raw);
    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    return url.protocol === "https:" && (host === "invol.co" || host.endsWith(".invol.co") || host === "invl.me" || host.endsWith(".invl.me") || host === "involve.asia" || host.endsWith(".involve.asia"));
  } catch {
    return false;
  }
}

function safeLink(raw: string) {
  const url = new URL(raw);
  if (!isInvolveLink(url.toString())) throw new Error("Involve returned an unexpected link.");
  return url.toString();
}

/** Dashboard links look like invl.me/code?url=<product>. The API often returns only the short code. */
function withDestination(trackingLink: string, sourceUrl: string) {
  const url = new URL(safeLink(trackingLink));
  if (url.searchParams.get("url")) return url.toString();
  const destination = new URL(sourceUrl);
  const clean = `${destination.origin}${destination.pathname}${destination.search}`;
  const joiner = url.search ? "&" : "?";
  return `${url.origin}${url.pathname}${url.search}${joiner}url=${encodeURIComponent(clean)}`;
}

function matchesMarket(market: InvolveMarket, row: { offer_name?: string; countries?: string }) {
  const text = `${row.offer_name || ""} ${row.countries || ""}`;
  if (!/shopee/i.test(text)) return false;
  return market === "shopee-my" ? /malaysia|\bMY\b/i.test(text) : /thailand|\bTH\b/i.test(text);
}

async function lookupApprovedOffer(market: InvolveMarket, token: string) {
  const res = await fetch(OFFERS, {
    method: "POST",
    headers: { Accept: "application/json", Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      page: "1",
      limit: "100",
      "filters[offer_name]": "Shopee",
      "filters[application_status]": "Approved",
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as { data?: { data?: { offer_id?: number; offer_name?: string; countries?: string }[] } };
  const ids = [...new Set((json.data?.data || []).filter((row) => matchesMarket(market, row)).map((row) => Number(row.offer_id)).filter((id) => Number.isInteger(id) && id > 0))];
  return ids.length === 1 ? ids[0] : 0;
}

export async function involveAffiliateFor(sourceUrl: string): Promise<{ url: string; note: string }> {
  const market = shopeeInvolveMarket(sourceUrl);
  if (!market) return { url: "", note: "" };
  const cfg = readConfig();
  if (!cfg.key?.trim() || !cfg.secret?.trim()) {
    return { url: "", note: "Shopee Malaysia and Thailand stay as shop links until the Involve key is saved." };
  }
  let offerId = Number(cfg.offers?.[market] || 0);
  const token = await login();
  if (!offerId) {
    offerId = await lookupApprovedOffer(market, token);
    if (offerId) {
      const next = readConfig();
      next.offers = { ...(next.offers || {}), [market]: offerId };
      writeConfig(next);
    }
  }
  if (!offerId) {
    return { url: "", note: "No approved Involve offer for this Shopee country. Save the offer id in Affiliate programs." };
  }
  const cached = readCache()[sourceUrl];
  if (cached?.offerId === offerId && cached.trackingLink) return { url: withDestination(cached.trackingLink, sourceUrl), note: "" };
  const res = await fetch(DEEPLINK, {
    method: "POST",
    headers: { Accept: "application/json", Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ offer_id: String(offerId), url: sourceUrl }),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => ({}))) as { message?: string; data?: { tracking_link?: string } };
  const link = json.data?.tracking_link?.trim();
  if (!link) throw new Error(scrub(json.message || "Involve deeplink failed."));
  const trackingLink = withDestination(link, sourceUrl);
  const cache = readCache();
  cache[sourceUrl] = { trackingLink, offerId, at: new Date().toISOString() };
  fs.writeFileSync(cachePath(), JSON.stringify(cache, null, 2), "utf8");
  return { url: trackingLink, note: "" };
}
