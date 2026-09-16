import { NextResponse } from "next/server";
import { buildUsageDashboard } from "@/lib/cloud-usage";
import { spendStatus, writeSpendCap, type SpendPeriod } from "@/lib/spend-cap";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const days = Number(new URL(req.url).searchParams.get("days") || 7);
  const n = days === 0 || days > 365 ? 0 : Math.max(1, Math.min(90, days || 7));
  return NextResponse.json({ ...buildUsageDashboard(n), cap: spendStatus() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    enabled?: boolean;
    totalUsd?: number;
    warnAt?: number;
    period?: SpendPeriod;
  };
  const next = writeSpendCap({
    enabled: body.enabled,
    totalUsd: body.totalUsd,
    warnAt: body.warnAt,
    period: body.period,
  });
  return NextResponse.json({ ok: true, cap: spendStatus(), saved: next });
}
