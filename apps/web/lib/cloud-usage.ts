import fs from "node:fs";
import path from "node:path";
import { API_PROVIDER_DEFS, getApiAccount, listApiAccounts, type ApiProviderId } from "./api-providers";
import { estimateUsd, money, RATE_CARDS, rateFor, type RateUnit } from "./cloud-rates";
import { dataRoot, ensureDataDirs } from "./paths";

export type UsageEvent = {
  at: string;
  accountId: string;
  providerId: string;
  model: string;
  ok: boolean;
  status?: number;
  ms: number;
  baseURL?: string;
  error?: string;
  jobId?: string;
  kind?: string;
  durationSec?: number;
  resolution?: string;
  units?: number;
  unit?: RateUnit;
  tokens?: number;
  estimatedUsd?: number;
  actualUsd?: number;
  source?: "estimate" | "provider";
};

const MAX = 4000;

function filePath() {
  ensureDataDirs();
  return path.join(dataRoot(), "db", "cloud-usage.json");
}

function readEvents(): UsageEvent[] {
  const file = filePath();
  if (!fs.existsSync(file)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { events?: UsageEvent[] };
    return Array.isArray(parsed.events) ? parsed.events : [];
  } catch {
    return [];
  }
}

function writeEvents(events: UsageEvent[]) {
  fs.writeFileSync(filePath(), JSON.stringify({ events: events.slice(-MAX) }, null, 2), "utf8");
}

function hostOf(url?: string) {
  if (!url) return "";
  try {
    const u = url.includes("://") ? url : `https://${url}`;
    return new URL(u).host;
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0] || "";
  }
}

function enrich(row: UsageEvent): UsageEvent {
  const priced = estimateUsd({
    model: row.model,
    ok: row.ok,
    durationSec: row.durationSec,
    units: row.units,
    tokens: row.tokens,
  });
  const estimatedUsd = row.actualUsd != null ? row.actualUsd : row.estimatedUsd != null ? row.estimatedUsd : priced?.usd;
  return {
    ...row,
    units: row.units ?? priced?.units,
    unit: row.unit ?? priced?.unit,
    estimatedUsd,
    source: row.actualUsd != null ? "provider" : row.source || (priced ? "estimate" : undefined),
  };
}

export function spendSince(sinceMs: number) {
  return readEvents()
    .filter((e) => e.ok && Date.parse(e.at) >= sinceMs)
    .map(enrich)
    .reduce((s, e) => s + (e.estimatedUsd || 0), 0);
}

export function logCloudUsage(row: UsageEvent) {
  const events = readEvents();
  const error = row.error ? row.error.replace(/sk-[a-zA-Z0-9_-]+/g, "sk-…").slice(0, 160) : undefined;
  events.push(enrich({ ...row, error }));
  writeEvents(events);
}

function providerName(id: string) {
  return API_PROVIDER_DEFS.find((d) => d.id === id)?.name || (id === "openrouter" ? "OpenRouter" : id === "lmstudio" ? "LM Studio" : id);
}

export function summarizeCloudUsage(days = 7) {
  const dash = buildUsageDashboard(days);
  return {
    days: dash.days,
    total: dash.total,
    ok: dash.ok,
    fail: dash.fail,
    spendUsd: dash.spendUsd,
    costPerOk: dash.costPerOk,
    byModel: dash.byModel.map((m) => ({ model: m.model, ok: m.ok, fail: m.fail, spendUsd: m.spendUsd, costPerOk: m.costPerOk })),
    byProvider: dash.byProvider.map((p) => ({
      providerId: p.providerId,
      name: p.name,
      ok: p.ok,
      fail: p.fail,
      spendUsd: p.spendUsd,
      costPerOk: p.costPerOk,
    })),
    log: dash.log,
    accounts: dash.accounts,
  };
}

export function buildUsageDashboard(days = 7) {
  const since = days <= 0 ? 0 : Date.now() - days * 24 * 60 * 60 * 1000;
  const events = readEvents()
    .filter((e) => Date.parse(e.at) >= since)
    .map(enrich);
  const ok = events.filter((e) => e.ok).length;
  const fail = events.length - ok;
  const spendUsd = events.reduce((s, e) => s + (e.ok ? e.estimatedUsd || 0 : 0), 0);
  const costPerOk = ok ? spendUsd / ok : 0;

  type Agg = {
    ok: number;
    fail: number;
    spendUsd: number;
    units: number;
    unit?: RateUnit;
    ms: number;
  };
  const byModel: Record<string, Agg & { providerId: string }> = {};
  const byProvider: Record<string, Agg> = {};
  const byAccount: Record<string, Agg> = {};

  function bump(row: Agg, e: UsageEvent) {
    if (e.ok) {
      row.ok++;
      row.spendUsd += e.estimatedUsd || 0;
      row.units += e.units || 0;
    } else {
      row.fail++;
    }
    row.ms += e.ms || 0;
  }

  for (const e of events) {
    const m = byModel[e.model] || (byModel[e.model] = { ok: 0, fail: 0, spendUsd: 0, units: 0, unit: e.unit, providerId: e.providerId, ms: 0 });
    m.unit = m.unit || e.unit;
    bump(m, e);
    const p = byProvider[e.providerId] || (byProvider[e.providerId] = { ok: 0, fail: 0, spendUsd: 0, units: 0, unit: e.unit, ms: 0 });
    bump(p, e);
    const a = byAccount[e.accountId] || (byAccount[e.accountId] = { ok: 0, fail: 0, spendUsd: 0, units: 0, unit: e.unit, ms: 0 });
    bump(a, e);
  }

  const accounts = listApiAccounts().map((acc) => ({
    ...acc,
    weekOk: byAccount[acc.id]?.ok || 0,
    weekFail: byAccount[acc.id]?.fail || 0,
    spendUsd: byAccount[acc.id]?.spendUsd || 0,
    costPerOk: byAccount[acc.id]?.ok ? (byAccount[acc.id]!.spendUsd || 0) / byAccount[acc.id]!.ok : 0,
  }));

  const log = [...events].reverse().slice(0, 200).map((e) => {
    const acc = getApiAccount(e.accountId);
    const def = API_PROVIDER_DEFS.find((d) => d.id === (e.providerId as ApiProviderId));
    const base = e.baseURL || acc?.baseURL || def?.baseURL || "";
    const card = rateFor(e.model);
    return {
      at: e.at,
      ok: e.ok,
      status: e.status,
      ms: e.ms,
      model: e.model,
      kind: e.kind,
      durationSec: e.durationSec,
      resolution: e.resolution,
      units: e.units,
      unit: e.unit,
      estimatedUsd: e.estimatedUsd,
      source: e.source,
      rateUsd: card?.usd,
      rateNote: card?.note,
      providerId: e.providerId,
      providerName: providerName(e.providerId),
      accountId: e.accountId,
      accountLabel: acc?.label || acc?.name || e.accountId.slice(0, 8),
      apiHost: hostOf(base),
      error: e.error,
      jobId: e.jobId,
    };
  });

  return {
    days,
    total: events.length,
    ok,
    fail,
    spendUsd: Math.round(spendUsd * 10_000) / 10_000,
    costPerOk: Math.round(costPerOk * 10_000) / 10_000,
    money: {
      spend: money(spendUsd),
      perOk: money(costPerOk),
    },
    byModel: Object.entries(byModel)
      .map(([model, n]) => {
        const card = rateFor(model);
        return {
          model,
          label: card?.label || model,
          providerId: n.providerId,
          providerName: providerName(n.providerId),
          ok: n.ok,
          fail: n.fail,
          spendUsd: Math.round(n.spendUsd * 10_000) / 10_000,
          costPerOk: n.ok ? Math.round((n.spendUsd / n.ok) * 10_000) / 10_000 : 0,
          units: n.units,
          unit: n.unit || card?.unit,
          rateUsd: card?.usd,
          rateNote: card?.note,
          avgMs: n.ok + n.fail ? Math.round(n.ms / (n.ok + n.fail)) : 0,
        };
      })
      .sort((a, b) => b.spendUsd - a.spendUsd || b.ok - a.ok),
    byProvider: Object.entries(byProvider)
      .map(([providerId, n]) => ({
        providerId,
        name: providerName(providerId),
        ok: n.ok,
        fail: n.fail,
        spendUsd: Math.round(n.spendUsd * 10_000) / 10_000,
        costPerOk: n.ok ? Math.round((n.spendUsd / n.ok) * 10_000) / 10_000 : 0,
      }))
      .sort((a, b) => b.spendUsd - a.spendUsd || b.ok - a.ok),
    log,
    accounts,
    rates: RATE_CARDS,
  };
}
