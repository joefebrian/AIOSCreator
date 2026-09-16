import fs from "node:fs";
import path from "node:path";
import { estimateUsd, money } from "./cloud-rates";
import { spendSince } from "./cloud-usage";
import { dataRoot, ensureDataDirs } from "./paths";

export type SpendPeriod = "month" | "30d" | "7d" | "all";

export type SpendCap = {
  enabled: boolean;
  totalUsd: number;
  warnAt: number;
  period: SpendPeriod;
};

const DEFAULT: SpendCap = {
  enabled: true,
  totalUsd: 10,
  warnAt: 0.8,
  period: "month",
};

function filePath() {
  ensureDataDirs();
  return path.join(dataRoot(), "db", "spend-cap.json");
}

export function readSpendCap(): SpendCap {
  const file = filePath();
  if (!fs.existsSync(file)) return { ...DEFAULT };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<SpendCap>;
    return {
      enabled: parsed.enabled !== false,
      totalUsd: Math.max(0, Number(parsed.totalUsd) || DEFAULT.totalUsd),
      warnAt: Math.min(0.99, Math.max(0.5, Number(parsed.warnAt) || DEFAULT.warnAt)),
      period: parsed.period === "30d" || parsed.period === "7d" || parsed.period === "all" ? parsed.period : "month",
    };
  } catch {
    return { ...DEFAULT };
  }
}

export function writeSpendCap(patch: Partial<SpendCap>): SpendCap {
  const next = { ...readSpendCap(), ...patch };
  next.totalUsd = Math.max(0, Number(next.totalUsd) || 0);
  next.warnAt = Math.min(0.99, Math.max(0.5, Number(next.warnAt) || 0.8));
  if (next.period !== "30d" && next.period !== "7d" && next.period !== "all") next.period = "month";
  fs.writeFileSync(filePath(), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function periodSince(period: SpendPeriod) {
  const now = Date.now();
  if (period === "all") return 0;
  if (period === "7d") return now - 7 * 24 * 60 * 60 * 1000;
  if (period === "30d") return now - 30 * 24 * 60 * 60 * 1000;
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

export type SpendStatus = {
  enabled: boolean;
  period: SpendPeriod;
  capUsd: number;
  spentUsd: number;
  remainingUsd: number;
  pct: number;
  warn: boolean;
  blocked: boolean;
  message: string;
};

export function spendStatus(extraUsd = 0): SpendStatus {
  const cap = readSpendCap();
  const spentUsd = spendSince(periodSince(cap.period));
  const remainingUsd = Math.max(0, cap.totalUsd - spentUsd);
  const pct = cap.totalUsd > 0 ? (spentUsd + extraUsd) / cap.totalUsd : 0;
  const blocked = cap.enabled && spentUsd + extraUsd > cap.totalUsd + 0.0001;
  const warn = cap.enabled && !blocked && pct >= cap.warnAt;
  const label = cap.period === "month" ? "this month" : cap.period === "all" ? "all time" : cap.period;
  let message = "";
  if (!cap.enabled) message = "Spend cap off.";
  else if (blocked) {
    message = `Spend cap ${money(cap.totalUsd)} hit (${label}). Spent ${money(spentUsd)}. This job ~${money(extraUsd)}. Raise the cap in System → Usage.`;
  } else if (warn) {
    message = `Spend warning: ${money(spentUsd)} / ${money(cap.totalUsd)} ${label} (${Math.round(pct * 100)}%).`;
  } else {
    message = `${money(spentUsd)} / ${money(cap.totalUsd)} ${label}.`;
  }
  return {
    enabled: cap.enabled,
    period: cap.period,
    capUsd: cap.totalUsd,
    spentUsd: Math.round(spentUsd * 10_000) / 10_000,
    remainingUsd: Math.round(remainingUsd * 10_000) / 10_000,
    pct,
    warn,
    blocked,
    message,
  };
}

export class SpendCapError extends Error {
  status = 402;
  constructor(message: string) {
    super(message);
    this.name = "SpendCapError";
  }
}

/** Block paid cloud jobs when the operator cap would be exceeded. Local Comfy is free. */
export function assertSpendAllowed(opts: { model: string; durationSec?: number; units?: number; tokens?: number }) {
  const est = estimateUsd({ model: opts.model, ok: true, durationSec: opts.durationSec, units: opts.units, tokens: opts.tokens });
  const extra = est?.usd ?? 0;
  const st = spendStatus(extra);
  if (st.blocked) throw new SpendCapError(st.message);
  return st;
}
