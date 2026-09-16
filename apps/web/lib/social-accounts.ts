import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataRoot, ensureDataDirs } from "./paths";

export const SOCIAL_PLATFORMS = ["youtube", "tiktok", "instagram", "threads", "x", "pinterest"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];
export type AccountSubtype = "personal_rewards" | "business_shop" | "creator_hybrid_manual";
export type ConnectionState = "disconnected" | "connected" | "expired" | "error";
export type PublishMode = "direct" | "inbox" | "export";

export type SocialAppConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type SocialApps = {
  publicBaseUrl?: string;
  youtube?: SocialAppConfig;
  tiktok?: SocialAppConfig;
  instagram?: SocialAppConfig;
  threads?: SocialAppConfig;
  x?: SocialAppConfig;
  pinterest?: SocialAppConfig;
};

export type SocialAccount = {
  id: string;
  platform: SocialPlatform;
  accountName: string;
  handle?: string;
  platformUserId?: string;
  niche?: string;
  country?: string;
  language?: string;
  defaultCharacterId?: string;
  accountSubtype: AccountSubtype;
  status: "active" | "paused";
  connectionState: ConnectionState;
  auditStatus: "unaudited" | "inbox_only" | "direct_ok";
  dailyQuotaRemaining?: number;
  tokenExpiry?: string;
  accessToken?: string;
  refreshToken?: string;
  scopes?: string[];
  extra?: Record<string, string>;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
};

type Store = { accounts: SocialAccount[]; apps: SocialApps };

function filePath() {
  ensureDataDirs();
  return path.join(dataRoot(), "db", "social-accounts.json");
}

function nowIso() {
  return new Date().toISOString();
}

function readStore(): Store {
  const file = filePath();
  if (!fs.existsSync(file)) return { accounts: [], apps: {} };
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<Store>;
    return { accounts: raw.accounts || [], apps: raw.apps || {} };
  } catch {
    return { accounts: [], apps: {} };
  }
}

function writeStore(store: Store) {
  fs.writeFileSync(filePath(), JSON.stringify(store, null, 2), "utf8");
}

export function socialApps(): SocialApps {
  return readStore().apps;
}

export function saveSocialApps(patch: SocialApps): SocialApps {
  const store = readStore();
  store.apps = { ...store.apps, ...patch };
  writeStore(store);
  return store.apps;
}

export function listSocialAccounts(): SocialAccount[] {
  return readStore().accounts;
}

export function getSocialAccount(id: string): SocialAccount | undefined {
  return readStore().accounts.find((a) => a.id === id);
}

export function publicAccount(row: SocialAccount) {
  const { accessToken, refreshToken, ...rest } = row;
  return {
    ...rest,
    hasToken: Boolean(accessToken),
    tokenHint: accessToken ? `${accessToken.slice(0, 6)}…` : "",
  };
}

export function upsertSocialAccount(input: Partial<SocialAccount> & { platform: SocialPlatform }): SocialAccount {
  const store = readStore();
  const now = nowIso();
  const existing = input.id ? store.accounts.find((a) => a.id === input.id) : undefined;
  const row: SocialAccount = {
    id: existing?.id || randomUUID(),
    platform: input.platform,
    accountName: input.accountName || existing?.accountName || input.platform,
    handle: input.handle ?? existing?.handle,
    platformUserId: input.platformUserId ?? existing?.platformUserId,
    niche: input.niche ?? existing?.niche,
    country: input.country ?? existing?.country,
    language: input.language ?? existing?.language,
    defaultCharacterId: input.defaultCharacterId ?? existing?.defaultCharacterId,
    accountSubtype: input.accountSubtype || existing?.accountSubtype || "creator_hybrid_manual",
    status: input.status || existing?.status || "active",
    connectionState: input.connectionState || existing?.connectionState || "disconnected",
    auditStatus: input.auditStatus || existing?.auditStatus || (input.platform === "tiktok" ? "inbox_only" : "unaudited"),
    dailyQuotaRemaining: input.dailyQuotaRemaining ?? existing?.dailyQuotaRemaining,
    tokenExpiry: input.tokenExpiry ?? existing?.tokenExpiry,
    accessToken: input.accessToken ?? existing?.accessToken,
    refreshToken: input.refreshToken ?? existing?.refreshToken,
    scopes: input.scopes ?? existing?.scopes,
    extra: input.extra ?? existing?.extra,
    lastError: input.lastError,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };
  store.accounts = existing
    ? store.accounts.map((a) => (a.id === existing.id ? row : a))
    : [row, ...store.accounts];
  writeStore(store);
  return row;
}

export function deleteSocialAccount(id: string): boolean {
  const store = readStore();
  const n = store.accounts.length;
  store.accounts = store.accounts.filter((a) => a.id !== id);
  if (store.accounts.length === n) return false;
  writeStore(store);
  return true;
}

export function oauthStateFile() {
  ensureDataDirs();
  return path.join(dataRoot(), "db", "oauth-state.json");
}

export type OauthState = { platform: SocialPlatform; accountId?: string; codeVerifier?: string };

export function putOauthState(state: string, payload: OauthState) {
  const file = oauthStateFile();
  const cur = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>) : {};
  cur[state] = { ...payload, createdAt: nowIso() };
  fs.writeFileSync(file, JSON.stringify(cur, null, 2), "utf8");
}

export function takeOauthState(state: string): OauthState | undefined {
  const file = oauthStateFile();
  if (!fs.existsSync(file)) return undefined;
  const cur = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, OauthState>;
  const hit = cur[state];
  if (!hit) return undefined;
  delete cur[state];
  fs.writeFileSync(file, JSON.stringify(cur, null, 2), "utf8");
  return hit;
}
