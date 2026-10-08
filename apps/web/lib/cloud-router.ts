import {
  bumpAccountUsage,
  getApiAccount,
  isWanDashscope,
  listUsableAccounts,
  markAccount,
  setAccountQuota,
  type ApiProviderId,
} from "./api-providers";
import { logCloudUsage } from "./cloud-usage";
import { assertSpendAllowed } from "./spend-cap";
import { isWired, MODEL_SLUG, routesFor } from "./model-routes";

export type CloudCreds = {
  accountId: string;
  provider: ApiProviderId;
  baseURL: string;
  apiKey: string;
  model: string;
};

export class CloudHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "CloudHttpError";
  }
}

const LIMITED_MS = 15 * 60 * 1000;

function cometBase(modelId: string, raw: string, provider: ApiProviderId) {
  const base = raw.replace(/\/$/, "").replace(/\/v1$/, "");
  if (modelId === "gpt-image-2" || modelId.startsWith("seedream-")) return `${base}/v1`;
  return base;
}

export function listCloudCandidates(modelId: string): CloudCreds[] {
  const out: CloudCreds[] = [];
  for (const provider of routesFor(modelId)) {
    if (provider === "comfy") continue;
    if (!isWired(modelId, provider)) continue;
    let accs = listUsableAccounts(provider);
    if (modelId === "grok-imagine-video" && provider === "xai") {
      accs = [...accs].sort((a, b) => Number(/video/i.test(b.label)) - Number(/video/i.test(a.label)));
    }
    for (const acc of accs) {
      if (modelId === "qwen-image-3.0" && provider === "dashscope" && isWanDashscope(acc)) continue;
      const base =
        modelId === "qwen-image-3.0" && provider === "dashscope"
          ? "https://dashscope-intl.aliyuncs.com/api/v1"
          : provider === "comet"
          ? cometBase(modelId, acc.baseURL, provider)
          : acc.baseURL.replace(/\/$/, "");
      out.push({
        accountId: acc.id,
        provider,
        baseURL: base,
        apiKey: acc.apiKey,
        model: MODEL_SLUG[modelId]?.[provider] || modelId,
      });
    }
  }
  return out;
}

function isAbort(err: unknown) {
  return err instanceof Error && (err.name === "AbortError" || /timeout|aborted/i.test(err.message));
}

export function isCloudSafetyReject(message: string) {
  const m = message.toLowerCase();
  return (
    m.includes("safety system") ||
    m.includes("safety_violations") ||
    m.includes("content policy") ||
    (m.includes("rejected") && m.includes("sexual"))
  );
}

export class CloudSafetyError extends Error {
  constructor(
    message = "This cloud model blocked the prompt (safety). For stills pick Grok Imagine or Qwen Image Edit. For video pick Grok Imagine Video, and drop words like nudity/undressing even in NEGATIVE.",
  ) {
    super(message);
    this.name = "CloudSafetyError";
  }
}

export type CloudUsageMeta = {
  jobId?: string;
  kind?: string;
  durationSec?: number;
  resolution?: string;
  units?: number;
};

export async function withCloudFailover<T>(
  modelId: string,
  run: (hit: CloudCreds) => Promise<T>,
  meta?: CloudUsageMeta,
): Promise<T> {
  const list = listCloudCandidates(modelId);
  if (!list.length) throw new Error("Cloud key missing — add one in Settings");
  assertSpendAllowed({ model: modelId, durationSec: meta?.durationSec, units: meta?.units });
  let last: Error | undefined;
  for (const hit of list) {
    const t0 = Date.now();
    try {
      const out = await run(hit);
      bumpAccountUsage(hit.accountId, true);
      logCloudUsage({
        at: new Date().toISOString(),
        accountId: hit.accountId,
        providerId: hit.provider,
        model: modelId,
        ok: true,
        ms: Date.now() - t0,
        baseURL: hit.baseURL,
        ...meta,
      });
      return out;
    } catch (err) {
      last = err instanceof Error ? err : new Error(String(err));
      if (last instanceof CloudSafetyError) throw last;
      if (isCloudSafetyReject(last.message)) throw new CloudSafetyError(last.message);
      const status = err instanceof CloudHttpError ? err.status : isAbort(err) ? 0 : -1;
      bumpAccountUsage(hit.accountId, false);
      logCloudUsage({
        at: new Date().toISOString(),
        accountId: hit.accountId,
        providerId: hit.provider,
        model: modelId,
        ok: false,
        status: status < 0 ? undefined : status,
        ms: Date.now() - t0,
        baseURL: hit.baseURL,
        error: last.message,
        ...meta,
      });
      if (status === 401 || status === 403) {
        markAccount(hit.accountId, "dead", undefined, last.message);
        continue;
      }
      if (status === 429) {
        markAccount(hit.accountId, "limited", Date.now() + LIMITED_MS, last.message);
        continue;
      }
      if (status >= 500 || status === 0) continue;
      throw last;
    }
  }
  throw last || new Error("Cloud key habis / belum ada di Settings");
}

export async function refreshCometQuota(id: string) {
  const acc = getApiAccount(id);
  if (!acc || acc.providerId !== "comet") return null;
  const url = new URL("https://query.cometapi.com/user/quota");
  url.searchParams.set("key", acc.apiKey);
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  const json = (await res.json().catch(() => ({}))) as {
    username?: string;
    total_quota?: number;
    total_used_quota?: number;
    request_count?: number;
    error?: string;
    message?: string;
  };
  if (!res.ok) throw cloudHttpError(res.status, json.error || json.message || `quota HTTP ${res.status}`);
  const balance = Number(json.total_quota);
  const used = Number(json.total_used_quota);
  if (!Number.isFinite(balance)) throw new Error("quota response missing balance");
  setAccountQuota(id, {
    lastBalanceUsd: balance,
    lastUsedUsd: Number.isFinite(used) ? used : 0,
    quotaUsername: json.username,
  });
  return { username: json.username, total_quota: balance, total_used_quota: used, request_count: json.request_count };
}

export async function probeAccount(id: string) {
  const acc = getApiAccount(id);
  if (!acc) throw new Error("account not found");
  if (acc.providerId === "comet") {
    const t0 = Date.now();
    try {
      const quota = await refreshCometQuota(id);
      bumpAccountUsage(id, true);
      if (acc.status !== "live") markAccount(id, "live");
      return { ok: true, status: 200, ms: Date.now() - t0, quota };
    } catch (err) {
      const status = err instanceof CloudHttpError ? err.status : 0;
      if (status === 401 || status === 403) {
        markAccount(id, "dead", undefined, err instanceof Error ? err.message : "quota 401");
        bumpAccountUsage(id, false);
        return { ok: false, status, ms: Date.now() - t0 };
      }
    }
  }
  if (acc.providerId === "kling" || acc.providerId === "wavespeed" || acc.providerId === "fal") {
    throw new Error("No cheap health check for this pipe — wait for a generate");
  }
  if (acc.providerId === "dashscope") {
    if (/wan/i.test(acc.label) || /wan/i.test(acc.note || "")) {
      throw new Error("No cheap health check for Wan 3.0 — wait for a generate");
    }
    const t0 = Date.now();
    const res = await fetch(`${acc.baseURL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${acc.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "qwen3.7-plus", messages: [{ role: "user", content: "ping" }], max_tokens: 4 }),
      signal: AbortSignal.timeout(20_000),
    });
    const ms = Date.now() - t0;
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) markAccount(id, "dead", undefined, `probe HTTP ${res.status}`);
      bumpAccountUsage(id, false);
      return { ok: false, status: res.status, ms };
    }
    bumpAccountUsage(id, true);
    if (acc.status !== "live") markAccount(id, "live");
    return { ok: true, status: res.status, ms };
  }
  const base = acc.baseURL.replace(/\/$/, "").replace(/\/v1$/, "");
  const t0 = Date.now();
  const res = await fetch(`${base}/v1/models`, {
    headers: { Authorization: `Bearer ${acc.apiKey}` },
    signal: AbortSignal.timeout(20_000),
  });
  const ms = Date.now() - t0;
  if (res.status === 401 || res.status === 403) {
    markAccount(id, "dead", undefined, `probe HTTP ${res.status}`);
    bumpAccountUsage(id, false);
    return { ok: false, status: res.status, ms };
  }
  if (res.status === 429) {
    markAccount(id, "limited", Date.now() + LIMITED_MS, "probe 429");
    bumpAccountUsage(id, false);
    return { ok: false, status: 429, ms };
  }
  if (!res.ok) {
    bumpAccountUsage(id, false);
    return { ok: false, status: res.status, ms };
  }
  bumpAccountUsage(id, true);
  if (acc.status !== "live") markAccount(id, "live");
  let quota = null;
  if (acc.providerId === "comet") {
    try {
      quota = await refreshCometQuota(id);
    } catch {
      quota = null;
    }
  }
  return { ok: true, status: res.status, ms, quota };
}

export function cloudHttpError(status: number, message: string) {
  return new CloudHttpError(status, message || `Cloud HTTP ${status}`);
}
