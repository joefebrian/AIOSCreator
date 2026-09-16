import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataRoot, ensureDataDirs } from "./paths";

export type ApiProviderId = "comet" | "openai" | "byteplus" | "kling" | "wavespeed" | "hensun" | "fal" | "dashscope";
export type AccountTier = "gratis" | "murah" | "paid";
export type AccountStatus = "live" | "dead" | "limited";

export type ApiAccount = {
  id: string;
  providerId: ApiProviderId;
  name: string;
  label: string;
  baseURL: string;
  apiKey: string;
  tier: AccountTier;
  status: AccountStatus;
  deadUntil?: string;
  lastError?: string;
  email?: string;
  note?: string;
  okCount?: number;
  failCount?: number;
  lastUsedAt?: string;
  lastBalanceUsd?: number;
  lastUsedUsd?: number;
  lastQuotaAt?: string;
  quotaUsername?: string;
  createdAt: string;
};

/** @deprecated shape — migrated into accounts */
export type ApiProvider = ApiAccount;

type Store = { accounts: ApiAccount[] };

export const API_PROVIDER_DEFS: {
  id: ApiProviderId;
  name: string;
  baseURL: string;
}[] = [
  { id: "comet", name: "CometAPI", baseURL: "https://api.cometapi.com" },
  { id: "openai", name: "OpenAI", baseURL: "https://api.openai.com/v1" },
  { id: "byteplus", name: "BytePlus Ark", baseURL: "https://ark.ap-southeast.bytepluses.com/api/v3" },
  { id: "kling", name: "Kling", baseURL: "https://api-singapore.klingai.com" },
  { id: "wavespeed", name: "Wavespeed", baseURL: "https://api.wavespeed.ai" },
  { id: "hensun", name: "HensunAI", baseURL: "https://hensunai.com" },
  { id: "fal", name: "fal.ai", baseURL: "https://queue.fal.run" },
  { id: "dashscope", name: "Alibaba Model Studio", baseURL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1" },
];

const TIER_RANK: Record<AccountTier, number> = { gratis: 0, murah: 1, paid: 2 };

function filePath() {
  ensureDataDirs();
  return path.join(dataRoot(), "db", "api-providers.json");
}

function nowIso() {
  return new Date().toISOString();
}

function asTier(v: unknown): AccountTier {
  return v === "gratis" || v === "murah" || v === "paid" ? v : "paid";
}

function reviveIfDue(row: ApiAccount): ApiAccount {
  if (row.status === "limited" && row.deadUntil && Date.parse(row.deadUntil) <= Date.now()) {
    return { ...row, status: "live", deadUntil: undefined };
  }
  return row;
}

function isUsable(row: ApiAccount) {
  if (!row.apiKey) return false;
  const live = reviveIfDue(row);
  if (live.status === "dead") return false;
  if (live.status === "limited" && live.deadUntil && Date.parse(live.deadUntil) > Date.now()) return false;
  return true;
}

function fromLegacyProvider(p: Record<string, unknown>, fallbackName: string): ApiAccount | null {
  const providerId = p.providerId as ApiProviderId;
  const apiKey = typeof p.apiKey === "string" ? p.apiKey.trim() : "";
  if (!API_PROVIDER_DEFS.some((d) => d.id === providerId) || !apiKey) return null;
  const def = API_PROVIDER_DEFS.find((d) => d.id === providerId)!;
  return {
    id: typeof p.id === "string" && p.id ? p.id : randomUUID(),
    providerId,
    name: typeof p.name === "string" && p.name ? p.name : def.name,
    label: typeof p.label === "string" && p.label ? p.label : fallbackName,
    baseURL: (typeof p.baseURL === "string" && p.baseURL ? p.baseURL : def.baseURL).replace(/\/$/, ""),
    apiKey,
    tier: asTier(p.tier),
    status: p.status === "dead" || p.status === "limited" ? p.status : "live",
    deadUntil: typeof p.deadUntil === "string" ? p.deadUntil : undefined,
    lastError: typeof p.lastError === "string" ? p.lastError : undefined,
    email: typeof p.email === "string" ? p.email : undefined,
    note: typeof p.note === "string" ? p.note : undefined,
    okCount: typeof p.okCount === "number" ? p.okCount : 0,
    failCount: typeof p.failCount === "number" ? p.failCount : 0,
    lastUsedAt: typeof p.lastUsedAt === "string" ? p.lastUsedAt : undefined,
    lastBalanceUsd: typeof p.lastBalanceUsd === "number" ? p.lastBalanceUsd : undefined,
    lastUsedUsd: typeof p.lastUsedUsd === "number" ? p.lastUsedUsd : undefined,
    lastQuotaAt: typeof p.lastQuotaAt === "string" ? p.lastQuotaAt : undefined,
    quotaUsername: typeof p.quotaUsername === "string" ? p.quotaUsername : undefined,
    createdAt: typeof p.createdAt === "string" ? p.createdAt : nowIso(),
  };
}

function parseStore(raw: unknown): Store {
  if (!raw || typeof raw !== "object") return { accounts: [] };
  const row = raw as { accounts?: unknown; providers?: unknown };
  const out: ApiAccount[] = [];
  const seenKeys = new Set<string>();
  const push = (acc: ApiAccount | null) => {
    if (!acc) return;
    const k = `${acc.providerId}:${acc.apiKey}`;
    if (seenKeys.has(k)) return;
    seenKeys.add(k);
    out.push(reviveIfDue(acc));
  };
  if (Array.isArray(row.accounts)) {
    for (const item of row.accounts) {
      if (item && typeof item === "object") push(fromLegacyProvider(item as Record<string, unknown>, "default"));
    }
  }
  if (Array.isArray(row.providers)) {
    for (const item of row.providers) {
      if (item && typeof item === "object") push(fromLegacyProvider(item as Record<string, unknown>, "default"));
    }
  }
  return { accounts: out };
}

function readStore(): Store {
  migrateLegacy();
  const file = filePath();
  if (!fs.existsSync(file)) return { accounts: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as { accounts?: unknown; providers?: unknown };
    const parsed = parseStore(raw);
    if (!Array.isArray(raw.accounts) && Array.isArray(raw.providers) && parsed.accounts.length) {
      writeStore(parsed);
    }
    return parsed;
  } catch {
    return { accounts: [] };
  }
}

function writeStore(store: Store) {
  fs.writeFileSync(filePath(), JSON.stringify({ accounts: store.accounts }, null, 2), "utf8");
}

function addAccount(
  providerId: ApiProviderId,
  apiKey: string,
  opts?: { baseURL?: string; label?: string; tier?: AccountTier; email?: string; note?: string },
) {
  const def = API_PROVIDER_DEFS.find((d) => d.id === providerId);
  const key = apiKey.trim();
  if (!def || !key) return;
  const store = readStore();
  if (store.accounts.some((a) => a.providerId === providerId && a.apiKey === key)) return;
  store.accounts.push({
    id: randomUUID(),
    providerId,
    name: def.name,
    label: (opts?.label || "").trim() || `${def.name} ${store.accounts.filter((a) => a.providerId === providerId).length + 1}`,
    baseURL: (opts?.baseURL || def.baseURL).replace(/\/$/, ""),
    apiKey: key,
    tier: opts?.tier || "gratis",
    status: "live",
    email: (opts?.email || "").trim() || undefined,
    note: (opts?.note || "").trim() || undefined,
    okCount: 0,
    failCount: 0,
    createdAt: nowIso(),
  });
  writeStore(store);
}

let migrated = false;
function migrateLegacy() {
  if (migrated) return;
  migrated = true;
  try {
    const motionFile = path.join(dataRoot(), "db", "motion-providers.json");
    if (fs.existsSync(motionFile)) {
      const m = JSON.parse(fs.readFileSync(motionFile, "utf8")) as {
        providers?: { engineId?: string; apiKey?: string; baseURL?: string }[];
      };
      const comet = m.providers?.find((p) => p.engineId === "seedance-2-5" && p.apiKey);
      if (comet?.apiKey) addAccount("comet", comet.apiKey, { baseURL: comet.baseURL || "https://api.cometapi.com", tier: "paid", label: "default" });
      const kling = m.providers?.find((p) => (p.engineId === "kling-3-0" || p.engineId === "kling-2-6") && p.apiKey);
      if (kling?.apiKey) addAccount("kling", kling.apiKey, { baseURL: kling.baseURL, tier: "paid", label: "default" });
    }
    const imgFile = path.join(dataRoot(), "db", "image-providers.json");
    if (fs.existsSync(imgFile)) {
      const img = JSON.parse(fs.readFileSync(imgFile, "utf8")) as {
        providers?: { engineId?: string; apiKey?: string; baseURL?: string }[];
      };
      const oai = img.providers?.find((p) => p.engineId === "gpt-image-2" && p.apiKey && (p.baseURL || "").includes("openai.com"));
      if (oai?.apiKey) addAccount("openai", oai.apiKey, { baseURL: oai.baseURL, tier: "paid", label: "default" });
      const bp = img.providers?.find((p) => p.engineId === "seedream-5-pro" && p.apiKey && (p.baseURL || "").includes("byteplus"));
      if (bp?.apiKey) addAccount("byteplus", bp.apiKey, { baseURL: bp.baseURL, tier: "paid", label: "default" });
    }
    const envComet = process.env.COMETAPI_KEY?.trim();
    if (envComet) addAccount("comet", envComet, { tier: "paid", label: "env" });
    const envKling = process.env.KLING_API_KEY?.trim();
    if (envKling) addAccount("kling", envKling, { tier: "paid", label: "env" });
    const envFal = (process.env.FAL_KEY || process.env.FAL_API_KEY || "").trim();
    if (envFal) addAccount("fal", envFal, { tier: "paid", label: "env" });
    const envDash = (process.env.DASHSCOPE_API_KEY || process.env.ALIBABA_API_KEY || "").trim();
    if (envDash) addAccount("dashscope", envDash, { tier: "gratis", label: "qwen" });
    const envOai = (process.env.OPENAI_API_KEY || "").trim();
    if (envOai) {
      addAccount("openai", envOai, {
        baseURL: "https://api.openai.com/v1",
        tier: "paid",
        label: "Character_Generation",
        note: "GPT Image 2.5 Sunburst. Character complete set. Not LLM.",
      });
    }
    const envWan = (process.env.DASHSCOPE_WAN_API_KEY || "").trim();
    if (envWan) {
      addAccount("dashscope", envWan, {
        baseURL: "https://dashscope-intl.aliyuncs.com/api/v1",
        tier: "paid",
        label: "wan-3.0",
        note: "Wan 3.0 video only. Singapore. Separate from Qwen LLM.",
      });
    }
  } catch {
    /* ignore */
  }
}

export function maskProviderKey(key: string) {
  if (!key) return "";
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

function sortUsable(rows: ApiAccount[]) {
  return [...rows].filter(isUsable).sort((a, b) => TIER_RANK[a.tier] - TIER_RANK[b.tier] || a.createdAt.localeCompare(b.createdAt));
}

export function listUsableAccounts(providerId: ApiProviderId): ApiAccount[] {
  return sortUsable(readStore().accounts.filter((a) => a.providerId === providerId));
}

function isWanDashscope(row: ApiAccount) {
  return /wan/i.test(row.label) || /wan/i.test(row.note || "");
}

/** Wan 3.0 video key only. Never the Qwen LLM DashScope account. */
export function getWanAccount(): ApiAccount | undefined {
  const accs = listUsableAccounts("dashscope");
  const labeled = accs.find(isWanDashscope);
  if (labeled) return labeled;
  const envWan = (process.env.DASHSCOPE_WAN_API_KEY || "").trim();
  if (!envWan) return undefined;
  return accs.find((a) => a.apiKey === envWan);
}

export function hasWanProvider() {
  return Boolean(getWanAccount() || (process.env.DASHSCOPE_WAN_API_KEY || "").trim());
}

function isOpenaiCharacter(row: ApiAccount) {
  return /character/i.test(row.label) || /character/i.test(row.note || "");
}

export function getOpenaiAccount(): ApiAccount | undefined {
  const accs = listUsableAccounts("openai");
  return accs.find(isOpenaiCharacter) || accs[0];
}

export function getApiProvider(providerId: ApiProviderId): ApiAccount | undefined {
  return listUsableAccounts(providerId)[0];
}

export function hasApiProvider(providerId: ApiProviderId) {
  return listUsableAccounts(providerId).length > 0;
}

export function listApiProviders() {
  return API_PROVIDER_DEFS.map((d) => {
    const live = listUsableAccounts(d.id);
    const any = readStore().accounts.find((a) => a.providerId === d.id && a.apiKey);
    return {
      id: d.id,
      name: d.name,
      baseURL: live[0]?.baseURL || any?.baseURL || d.baseURL,
      ready: live.length > 0,
      keyHint: live[0] ? maskProviderKey(live[0].apiKey) : "",
      accounts: live.length,
    };
  });
}

export function listApiAccounts() {
  return readStore().accounts.map((a) => ({
    id: a.id,
    providerId: a.providerId,
    name: a.name,
    label: a.label,
    baseURL: a.baseURL,
    ready: isUsable(a),
    tier: a.tier,
    status: reviveIfDue(a).status,
    deadUntil: a.deadUntil,
    keyHint: maskProviderKey(a.apiKey),
    lastError: a.lastError,
    email: a.email,
    note: a.note,
    okCount: a.okCount || 0,
    failCount: a.failCount || 0,
    lastUsedAt: a.lastUsedAt,
    lastBalanceUsd: a.lastBalanceUsd,
    lastUsedUsd: a.lastUsedUsd,
    lastQuotaAt: a.lastQuotaAt,
    quotaUsername: a.quotaUsername,
    createdAt: a.createdAt,
  }));
}

export function addApiAccount(
  providerId: ApiProviderId,
  apiKey: string,
  opts?: { baseURL?: string; label?: string; tier?: AccountTier; email?: string; note?: string },
) {
  addAccount(providerId, apiKey, opts);
}

export function getApiAccount(id: string) {
  return readStore().accounts.find((a) => a.id === id);
}

export function patchApiAccount(id: string, patch: { label?: string; email?: string; note?: string; tier?: AccountTier }) {
  const store = readStore();
  const row = store.accounts.find((a) => a.id === id);
  if (!row) return;
  if (patch.label !== undefined) row.label = patch.label.trim() || row.label;
  if (patch.email !== undefined) row.email = patch.email.trim() || undefined;
  if (patch.note !== undefined) row.note = patch.note.trim() || undefined;
  if (patch.tier) row.tier = patch.tier;
  writeStore(store);
}

export function setAccountQuota(
  id: string,
  quota: { lastBalanceUsd: number; lastUsedUsd: number; quotaUsername?: string },
) {
  const store = readStore();
  const row = store.accounts.find((a) => a.id === id);
  if (!row) return;
  row.lastBalanceUsd = quota.lastBalanceUsd;
  row.lastUsedUsd = quota.lastUsedUsd;
  row.quotaUsername = quota.quotaUsername;
  row.lastQuotaAt = nowIso();
  writeStore(store);
}

export function bumpAccountUsage(id: string, ok: boolean) {
  const store = readStore();
  const row = store.accounts.find((a) => a.id === id);
  if (!row) return;
  if (ok) row.okCount = (row.okCount || 0) + 1;
  else row.failCount = (row.failCount || 0) + 1;
  row.lastUsedAt = nowIso();
  writeStore(store);
}

/** Compat: add another account instead of replacing the pipe. */
export function upsertApiProvider(providerId: ApiProviderId, apiKey: string, baseURL?: string) {
  addAccount(providerId, apiKey, { baseURL, tier: "paid", label: "default" });
}

export function deleteApiAccount(id: string) {
  const store = readStore();
  store.accounts = store.accounts.filter((a) => a.id !== id);
  writeStore(store);
}

export function deleteApiProvider(providerId: ApiProviderId) {
  const store = readStore();
  store.accounts = store.accounts.filter((a) => a.providerId !== providerId);
  writeStore(store);
}

export function markAccount(id: string, status: AccountStatus, deadUntilMs?: number, lastError?: string) {
  const store = readStore();
  const row = store.accounts.find((a) => a.id === id);
  if (!row) return;
  row.status = status;
  row.deadUntil = deadUntilMs ? new Date(deadUntilMs).toISOString() : undefined;
  row.lastError = lastError?.slice(0, 240);
  writeStore(store);
}

export function reviveAccount(id: string) {
  const store = readStore();
  const row = store.accounts.find((a) => a.id === id);
  if (!row) return;
  row.status = "live";
  row.deadUntil = undefined;
  row.lastError = undefined;
  writeStore(store);
}
