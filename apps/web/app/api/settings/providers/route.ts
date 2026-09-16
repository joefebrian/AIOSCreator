import { NextResponse } from "next/server";
import {
  API_PROVIDER_DEFS,
  addApiAccount,
  deleteApiAccount,
  getApiAccount,
  listApiAccounts,
  listApiProviders,
  patchApiAccount,
  reviveAccount,
  type AccountTier,
  type ApiProviderId,
} from "@/lib/api-providers";
import { probeAccount, refreshCometQuota } from "@/lib/cloud-router";
import { summarizeCloudUsage } from "@/lib/cloud-usage";
import { listEngines } from "@/lib/engines";
import { listModelMap } from "@/lib/model-routes";

export const runtime = "nodejs";

const IDS = new Set(API_PROVIDER_DEFS.map((d) => d.id));

function payload() {
  return {
    providers: listApiProviders(),
    accounts: listApiAccounts(),
    map: listModelMap().filter((row) => row.routes.some((r) => r.id !== "comfy")),
    engines: listEngines(),
    usage: summarizeCloudUsage(7),
  };
}

export async function GET() {
  return NextResponse.json(payload());
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: "add" | "delete" | "revive" | "probe" | "patch" | "quota";
    id?: string;
    providerId?: string;
    apiKey?: string;
    baseURL?: string;
    label?: string;
    email?: string;
    note?: string;
    tier?: AccountTier;
  };
  try {
    if (body.action === "delete") {
      if (!body.id) throw new Error("id required");
      deleteApiAccount(body.id);
    } else if (body.action === "revive") {
      if (!body.id) throw new Error("id required");
      reviveAccount(body.id);
    } else if (body.action === "probe") {
      if (!body.id) throw new Error("id required");
      const probe = await probeAccount(body.id);
      return NextResponse.json({ ok: probe.ok, probe, ...payload() });
    } else if (body.action === "quota") {
      const ids = body.id
        ? [body.id]
        : listApiAccounts()
            .filter((a) => a.providerId === "comet")
            .map((a) => a.id);
      const results = [];
      for (const id of ids) {
        const acc = getApiAccount(id);
        if (!acc || acc.providerId !== "comet") continue;
        try {
          results.push({ id, ok: true, quota: await refreshCometQuota(id) });
        } catch (err) {
          results.push({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
        }
      }
      return NextResponse.json({ ok: true, results, ...payload() });
    } else if (body.action === "patch") {
      if (!body.id) throw new Error("id required");
      patchApiAccount(body.id, { label: body.label, email: body.email, note: body.note, tier: body.tier });
    } else {
      const providerId = body.providerId as ApiProviderId;
      if (!IDS.has(providerId)) throw new Error("unknown provider");
      const key = (body.apiKey || "").trim();
      if (!key) throw new Error("api key required");
      const tier = body.tier === "murah" || body.tier === "paid" || body.tier === "gratis" ? body.tier : "gratis";
      addApiAccount(providerId, key, {
        baseURL: body.baseURL,
        label: body.label,
        tier,
        email: body.email,
        note: body.note,
      });
    }
    return NextResponse.json({ ok: true, ...payload() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
