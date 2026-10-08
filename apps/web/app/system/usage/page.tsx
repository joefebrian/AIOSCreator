"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Page, Pill, Surface } from "@/components/ui";
import { GROK_IMAGINE_QUOTE, grokImagineStillUsd, grokImagineVideoUsd, money } from "@/lib/cloud-rates";

type ModelRow = {
  model: string;
  label: string;
  providerName: string;
  ok: number;
  fail: number;
  spendUsd: number;
  costPerOk: number;
  units: number;
  unit?: string;
  rateUsd?: number;
  rateNote?: string;
  avgMs: number;
};

type ProviderRow = {
  providerId: string;
  name: string;
  ok: number;
  fail: number;
  spendUsd: number;
  costPerOk: number;
};

type LogRow = {
  at: string;
  ok: boolean;
  status?: number;
  ms: number;
  model: string;
  kind?: string;
  durationSec?: number;
  units?: number;
  unit?: string;
  estimatedUsd?: number;
  source?: string;
  providerName: string;
  accountLabel: string;
  apiHost: string;
  error?: string;
};

type AccountRow = {
  id: string;
  name: string;
  label: string;
  ready: boolean;
  lastBalanceUsd?: number;
  weekOk: number;
  weekFail: number;
  spendUsd: number;
  costPerOk: number;
};

type RateRow = { model: string; label: string; provider: string; unit: string; usd: number; note: string };

type Cap = {
  enabled: boolean;
  period: "month" | "30d" | "7d" | "all";
  capUsd: number;
  spentUsd: number;
  remainingUsd: number;
  pct: number;
  warn: boolean;
  blocked: boolean;
  message: string;
};

type Dash = {
  days: number;
  total: number;
  ok: number;
  fail: number;
  spendUsd: number;
  costPerOk: number;
  scriptUgc?: { label: string; calls: number; ok: number; fail: number; tokens: number; spendUsd: number };
  byModel: ModelRow[];
  byProvider: ProviderRow[];
  log: LogRow[];
  accounts: AccountRow[];
  rates: RateRow[];
  cap?: Cap;
};

const RANGES = [
  { days: 1, label: "24h" },
  { days: 7, label: "7d" },
  { days: 30, label: "30d" },
  { days: 0, label: "All" },
];

function unitLabel(unit?: string, n?: number) {
  if (!unit) return "—";
  const count = n ?? 0;
  if (unit === "sec") return `${count}s`;
  if (unit === "image") return `${count} img`;
  if (unit === "token") return `${count.toLocaleString()} tok`;
  return `${count} clip`;
}

export default function UsagePage() {
  const [days, setDays] = useState(7);
  const [data, setData] = useState<Dash | null>(null);
  const [error, setError] = useState("");
  const [capDraft, setCapDraft] = useState("10");
  const [capNote, setCapNote] = useState("");

  useEffect(() => {
    setError("");
    fetch(`/api/settings/usage?days=${days}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`usage HTTP ${r.status}`);
        const j = (await r.json()) as Dash;
        setData(j);
        if (j.cap) setCapDraft(String(j.cap.capUsd));
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [days]);

  return (
    <Page
      kicker="SYSTEM · USAGE"
      title="Spend"
      description={
        <>
          Yang CreatorOS beneran kirim dari PC ini — bukan dashboard vendor. $ = list rate (Wan Prime 720P $0.14/s).
          Fail Wan tidak ditagih. Invoice Alibaba/Kling/fal bisa beda. Keys di{" "}
          <Link href="/system/settings" className="font-semibold text-[#652DFF]">
            Settings
          </Link>
          .
        </>
      }
    >
      {error ? <p className="text-[12px] text-red-600">{error}</p> : null}

      <Surface className="mb-6">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-[#9CA3AF]">GROK IMAGINE · WHAT WE SEND</p>
        <p className="mt-1 text-[13px] text-[#4B5563]">
          Stills: <span className="font-semibold">{GROK_IMAGINE_QUOTE.imageModel}</span> — auto 1K medium
          (face/SKU) or 2K low (poster), both $0.06. Video:{" "}
          <span className="font-semibold">{GROK_IMAGINE_QUOTE.videoModel}</span> · 720p 9:16. Not V1.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[32rem] text-left text-[13px]">
            <thead>
              <tr className="text-[11px] font-semibold tracking-[0.12em] text-[#9CA3AF]">
                <th className="pb-2 font-semibold">Job</th>
                <th className="pb-2 font-semibold">Bill</th>
                <th className="pb-2 font-semibold">On $10 cap</th>
              </tr>
            </thead>
            <tbody className="text-[#111827]">
              <tr className="border-t border-[#E6E8EE]">
                <td className="py-2">Still generate · auto 2K low</td>
                <td>{money(grokImagineStillUsd(0))}</td>
                <td>~{Math.floor(10 / grokImagineStillUsd(0))} stills</td>
              </tr>
              <tr className="border-t border-[#E6E8EE]">
                <td className="py-2">Still edit · auto 1K medium · 1 ref</td>
                <td>{money(grokImagineStillUsd(1))}</td>
                <td>~{Math.floor(10 / grokImagineStillUsd(1))} edits</td>
              </tr>
              <tr className="border-t border-[#E6E8EE]">
                <td className="py-2">Still edit · auto 1K medium · 2 refs</td>
                <td>{money(grokImagineStillUsd(2))}</td>
                <td>~{Math.floor(10 / grokImagineStillUsd(2))} edits</td>
              </tr>
              <tr className="border-t border-[#E6E8EE]">
                <td className="py-2">I2V 6s 720p + still input</td>
                <td>{money(grokImagineVideoUsd(6, 1).usd)}</td>
                <td>~{Math.floor(10 / grokImagineVideoUsd(6, 1).usd)} clips</td>
              </tr>
              <tr className="border-t border-[#E6E8EE]">
                <td className="py-2">I2V 15s 720p + still input</td>
                <td>{money(grokImagineVideoUsd(15, 1).usd)}</td>
                <td>~{Math.floor(10 / grokImagineVideoUsd(15, 1).usd)} clips</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[12px] text-[#6B7280]">
          2.0 output: 1K low $0.04 · 1K medium $0.06 · 2K low $0.06 · 2K medium $0.08. Image input $0.01. Text free. Video 1.5:
          480p $0.08/s · 720p $0.14/s · 1080p $0.25/s.
        </p>
      </Surface>

      {data?.cap ? (
        <div
          className={`rounded-2xl border px-4 py-3 ${
            data.cap.blocked
              ? "border-red-200 bg-[#FEF2F2]"
              : data.cap.warn
                ? "border-amber-200 bg-[#FFFBEB]"
                : "border-[#E6E8EE] bg-white"
          }`}
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.16em] text-[#9CA3AF]">SPEND CAP · PAID CLOUD</p>
              <p className="mt-1 text-sm font-semibold">{data.cap.message}</p>
              <div className="mt-2 h-2 w-64 max-w-full overflow-hidden rounded-full bg-[#F3F4F8]">
                <div
                  className={`h-full ${data.cap.blocked ? "bg-red-500" : data.cap.warn ? "bg-amber-500" : "bg-[#652DFF]"}`}
                  style={{ width: `${Math.min(100, Math.round(data.cap.pct * 100))}%` }}
                />
              </div>
            </div>
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const totalUsd = Number(capDraft);
                if (!Number.isFinite(totalUsd) || totalUsd < 0) return;
                setCapNote("Saving…");
                void fetch("/api/settings/usage", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    enabled: data.cap!.enabled,
                    totalUsd,
                    period: data.cap!.period,
                  }),
                })
                  .then(async (r) => {
                    const j = await r.json();
                    if (!r.ok) throw new Error(j.error || "save failed");
                    setData((d) => (d ? { ...d, cap: j.cap } : d));
                    setCapNote("Saved.");
                  })
                  .catch((err) => setCapNote(err instanceof Error ? err.message : String(err)));
              }}
            >
              <label className="text-[12px] font-semibold text-[#4B5563]">
                Cap $
                <input
                  className="ml-1 w-20 rounded-md border border-[#E6E8EE] px-2 py-1"
                  value={capDraft}
                  onChange={(e) => setCapDraft(e.target.value)}
                />
              </label>
              <select
                className="rounded-md border border-[#E6E8EE] px-2 py-1 text-[12px]"
                value={data.cap.period}
                onChange={(e) => {
                  const period = e.target.value as Cap["period"];
                  void fetch("/api/settings/usage", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ period, enabled: data.cap!.enabled, totalUsd: data.cap!.capUsd }),
                  })
                    .then((r) => r.json())
                    .then((j) => setData((d) => (d ? { ...d, cap: j.cap } : d)))
                    .catch(() => undefined);
                }}
              >
                <option value="month">This month</option>
                <option value="7d">7 days</option>
                <option value="30d">30 days</option>
                <option value="all">All time</option>
              </select>
              <button
                type="button"
                className="rounded-full border border-[#E6E8EE] px-3 py-1 text-[12px] font-semibold"
                onClick={() => {
                  void fetch("/api/settings/usage", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      enabled: !data.cap!.enabled,
                      totalUsd: data.cap!.capUsd,
                      period: data.cap!.period,
                    }),
                  })
                    .then((r) => r.json())
                    .then((j) => setData((d) => (d ? { ...d, cap: j.cap } : d)))
                    .catch(() => undefined);
                }}
              >
                {data.cap.enabled ? "On" : "Off"}
              </button>
              <button type="submit" className="rounded-full bg-[#652DFF] px-3 py-1 text-[12px] font-semibold text-white">
                Save
              </button>
            </form>
          </div>
          {capNote ? <p className="mt-2 text-[11px] text-[#6B7280]">{capNote}</p> : null}
          <p className="mt-2 text-[11px] text-[#9CA3AF]">
            Blocks Wan / GPT Image / Kling / fal / Seedance / Qwen script when the next job would pass the cap. Local 3060
            is free. Warns at 80%.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {RANGES.map((r) => (
          <button
            key={r.label}
            type="button"
            onClick={() => setDays(r.days)}
            className={
              days === r.days
                ? "rounded-full bg-[#652DFF] px-3 py-1 text-[12px] font-semibold text-white"
                : "rounded-full border border-[#E6E8EE] bg-white px-3 py-1 text-[12px] font-semibold text-[#4B5563]"
            }
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Script_UGC"
          value={money(data?.scriptUgc?.spendUsd || 0)}
          hint={`${data?.scriptUgc?.ok ?? 0} ok · ${(data?.scriptUgc?.tokens ?? 0).toLocaleString()} tok · Astra`}
        />
        <Stat label="Spend" value={money(data?.spendUsd || 0)} hint="ok jobs × list rate" />
        <Stat label="$ / result" value={money(data?.costPerOk || 0)} hint="spend ÷ ok" />
        <Stat label="OK" value={String(data?.ok ?? 0)} hint={`${data?.fail ?? 0} fail`} tone="ready" />
        <Stat label="Calls" value={String(data?.total ?? 0)} hint={`${data?.days || days}d this PC`} />
      </div>

      <section className="mt-8">
        <h2 className="text-[11px] font-semibold tracking-[0.18em] text-[#9CA3AF]">COST PER RESULT · MODEL</h2>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-[#E6E8EE] bg-white">
          <table className="w-full min-w-[860px] text-left text-[12px]">
            <thead className="border-b border-[#E6E8EE] text-[10px] font-semibold tracking-[0.14em] text-[#9CA3AF]">
              <tr>
                <th className="px-3 py-2">Model</th>
                <th className="px-3 py-2">Provider</th>
                <th className="px-3 py-2">Rate</th>
                <th className="px-3 py-2">OK / fail</th>
                <th className="px-3 py-2">Units</th>
                <th className="px-3 py-2">Spend</th>
                <th className="px-3 py-2">$ / result</th>
              </tr>
            </thead>
            <tbody>
              {(data?.byModel || []).length ? (
                data!.byModel.map((m) => (
                  <tr key={m.model} className="border-b border-[#F3F4F8] last:border-0 align-top">
                    <td className="px-3 py-2.5">
                      <p className="font-semibold text-[#111827]">{m.label}</p>
                      <p className="text-[11px] text-[#9CA3AF]">{m.model}</p>
                    </td>
                    <td className="px-3 py-2.5 text-[#374151]">{m.providerName}</td>
                    <td className="px-3 py-2.5 text-[#4B5563]">
                      {m.rateUsd != null ? `${money(m.rateUsd)} / ${m.unit || "unit"}` : "—"}
                      {m.rateNote ? <p className="mt-0.5 max-w-xs text-[10px] leading-snug text-[#9CA3AF]">{m.rateNote}</p> : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-semibold text-[#15803D]">{m.ok}</span>
                      <span className="text-[#9CA3AF]"> / </span>
                      <span className={m.fail ? "font-semibold text-[#B91C1C]" : "text-[#9CA3AF]"}>{m.fail}</span>
                    </td>
                    <td className="px-3 py-2.5 text-[#4B5563]">{unitLabel(m.unit, m.units)}</td>
                    <td className="px-3 py-2.5 font-semibold">{money(m.spendUsd)}</td>
                    <td className="px-3 py-2.5 font-semibold">{m.ok ? money(m.costPerOk) : "—"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-[#9CA3AF]">
                    Belum ada cloud generate di range ini. Generate di Studio / MotionControl dulu.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-[11px] font-semibold tracking-[0.18em] text-[#9CA3AF]">PROVIDER</h2>
        <ul className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(data?.byProvider || []).map((p) => (
            <li key={p.providerId} className="rounded-2xl border border-[#E6E8EE] bg-white px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold">{p.name}</p>
                <Pill tone={p.fail && !p.ok ? "off" : "ready"}>{p.ok} ok</Pill>
              </div>
              <p className="mt-2 text-lg font-black">{money(p.spendUsd)}</p>
              <p className="text-[12px] text-[#6B7280]">
                {p.ok} result · {money(p.costPerOk)} / ok · {p.fail} fail
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-[11px] font-semibold tracking-[0.18em] text-[#9CA3AF]">WALLETS</h2>
        <ul className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {(data?.accounts || [])
            .filter((a) => a.ready || a.weekOk || a.weekFail)
            .map((a) => (
              <li key={a.id} className="rounded-2xl border border-[#E6E8EE] bg-white px-4 py-3">
                <p className="text-sm font-semibold">
                  {a.name} · {a.label}
                </p>
                {typeof a.lastBalanceUsd === "number" ? (
                  <p className="mt-1 text-[13px] font-semibold">Balance {money(a.lastBalanceUsd)}</p>
                ) : null}
                <p className="mt-1 text-[12px] text-[#6B7280]">
                  {a.weekOk} ok / {a.weekFail} fail · spend {money(a.spendUsd)} · {money(a.costPerOk)} / result
                </p>
              </li>
            ))}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="text-[11px] font-semibold tracking-[0.18em] text-[#9CA3AF]">RATE CARD · LIST</h2>
        <p className="mt-1 text-[12px] text-[#6B7280]">Pakai ini buat $ / result. Bukan invoice. Wan Prime 720P = $0.14/s Singapore.</p>
        <div className="mt-3 overflow-x-auto rounded-2xl border border-[#E6E8EE] bg-white">
          <table className="w-full min-w-[640px] text-left text-[12px]">
            <thead className="border-b border-[#E6E8EE] text-[10px] font-semibold tracking-[0.14em] text-[#9CA3AF]">
              <tr>
                <th className="px-3 py-2">Model</th>
                <th className="px-3 py-2">Provider</th>
                <th className="px-3 py-2">Unit</th>
                <th className="px-3 py-2">List $</th>
                <th className="px-3 py-2">Note</th>
              </tr>
            </thead>
            <tbody>
              {(data?.rates || []).map((r) => (
                <tr key={r.model} className="border-b border-[#F3F4F8] last:border-0 align-top">
                  <td className="px-3 py-2 font-semibold">{r.label}</td>
                  <td className="px-3 py-2">{r.provider}</td>
                  <td className="px-3 py-2 text-[#6B7280]">{r.unit}</td>
                  <td className="px-3 py-2 font-semibold">{money(r.usd)}</td>
                  <td className="px-3 py-2 text-[11px] text-[#9CA3AF]">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Surface className="mt-8 overflow-x-auto">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-[#9CA3AF]">LOG</p>
        <table className="mt-3 w-full min-w-[52rem] text-left text-[12px]">
          <thead className="border-b border-[#E6E8EE] text-[10px] font-semibold tracking-[0.12em] text-[#9CA3AF]">
            <tr>
              <th className="px-2 py-2">When</th>
              <th className="px-2 py-2">Provider</th>
              <th className="px-2 py-2">Account</th>
              <th className="px-2 py-2">Model</th>
              <th className="px-2 py-2">Result</th>
              <th className="px-2 py-2">Size</th>
              <th className="px-2 py-2">$</th>
            </tr>
          </thead>
          <tbody>
            {(data?.log || []).map((row, i) => (
              <tr key={`${row.at}-${i}`} className="border-b border-[#F3F4F8] last:border-0 align-top">
                <td className="whitespace-nowrap px-2 py-2 text-[#6B7280]">{new Date(row.at).toLocaleString()}</td>
                <td className="px-2 py-2 font-semibold">
                  {row.providerName}
                  <p className="text-[10px] font-normal text-[#9CA3AF]">{row.apiHost}</p>
                </td>
                <td className="px-2 py-2">{row.accountLabel}</td>
                <td className="px-2 py-2">{row.model}</td>
                <td className="px-2 py-2">
                  <span className={row.ok ? "font-semibold text-[#15803D]" : "font-semibold text-[#B91C1C]"}>
                    {row.ok ? "OK" : "Fail"}
                    {row.status != null ? ` ${row.status}` : ""}
                  </span>
                  {row.error ? <p className="mt-0.5 max-w-xs text-[11px] text-[#9CA3AF]">{row.error}</p> : null}
                </td>
                <td className="px-2 py-2 text-[#6B7280]">
                  {row.durationSec ? `${row.durationSec}s` : unitLabel(row.unit, row.units)}
                  <p className="text-[10px]">{row.ms}ms</p>
                </td>
                <td className="px-2 py-2 font-semibold">
                  {row.ok ? money(row.estimatedUsd || 0) : "$0"}
                  {row.source === "estimate" ? <p className="text-[10px] font-normal text-[#9CA3AF]">est.</p> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Surface>
    </Page>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "ready" }) {
  return (
    <div className="rounded-2xl border border-[#E6E8EE] bg-white px-4 py-3">
      <p className="text-[11px] font-semibold tracking-[0.16em] text-[#9CA3AF]">{label}</p>
      <p className={`mt-1 text-2xl font-black ${tone === "ready" ? "text-[#15803D]" : "text-[#111827]"}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-[#9CA3AF]">{hint}</p> : null}
    </div>
  );
}
