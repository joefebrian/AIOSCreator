"use client";

import { useEffect, useState } from "react";
import { Btn, EmptyState, inputClass, Page, Pill, Surface } from "@/components/ui";

type Account = {
  id: string;
  platform: "youtube" | "tiktok" | "instagram" | "threads" | "x" | "pinterest";
  accountName: string;
  handle?: string;
  connectionState: string;
  auditStatus: string;
  accountSubtype: string;
  hasToken: boolean;
  tokenExpiry?: string;
  lastError?: string;
  defaultCharacterId?: string;
};

type Apps = {
  publicBaseUrl?: string;
  youtube?: { clientId: string; clientSecret: string; redirectUri: string };
  tiktok?: { clientId: string; clientSecret: string; redirectUri: string };
  instagram?: { clientId: string; clientSecret: string; redirectUri: string };
  threads?: { clientId: string; clientSecret: string; redirectUri: string };
  x?: { clientId: string; clientSecret: string; redirectUri: string };
  pinterest?: { clientId: string; clientSecret: string; redirectUri: string };
};

const PLATFORMS = [
  { id: "youtube" as const, name: "YouTube", hint: "Official Data API v3. Shorts = vertical ≤180s. Unverified projects stay private until Google audit." },
  { id: "tiktok" as const, name: "TikTok", hint: "Official Login Kit. MVP = Upload to Inbox. Direct Post stays flagged until Content Posting audit." },
  { id: "instagram" as const, name: "Instagram", hint: "Official Graph. Video needs a public URL — until then we write an Export pack." },
  { id: "threads" as const, name: "Threads", hint: "Official Threads API. Same Meta family as Instagram. Testers on the app. Direct post needs a public media URL — Export until then." },
  { id: "x" as const, name: "X", hint: "Official X API v2 OAuth. One app; testers Connect. Direct = caption tweet. Media attach is paid-tier — stills go as text or Export." },
  { id: "pinterest" as const, name: "Pinterest", hint: "Official API v5. Tester must have at least one board. Direct = still pin. Video = Export." },
];

function defaultRedirect(base: string | undefined, platform: string) {
  const origin = (base || "").replace(/\/$/, "") || "https://YOUR-HOST";
  return `${origin}/api/distribute/oauth/${platform}/callback`;
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [apps, setApps] = useState<Apps>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState<(typeof PLATFORMS)[number]["id"]>("youtube");

  async function load() {
    const res = await fetch("/api/distribute/accounts");
    const json = await res.json();
    setAccounts(json.accounts || []);
    setApps(json.apps || {});
  }

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("error")) setError(q.get("error") || "");
    if (q.get("connected")) setError("");
    void load();
  }, []);

  async function saveApps(e: React.FormEvent) {
    e.preventDefault();
    setBusy("apps");
    setError("");
    try {
      const filled: Apps = { ...apps };
      for (const p of PLATFORMS) {
        const row = filled[p.id];
        if (!row?.clientId) continue;
        if (!row.redirectUri) {
          filled[p.id] = { ...row, redirectUri: defaultRedirect(filled.publicBaseUrl, p.id) };
        }
      }
      const res = await fetch("/api/distribute/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apps", apps: filled }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "save failed");
      setApps(json.apps);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function addAccount(e: React.FormEvent) {
    e.preventDefault();
    setBusy("add");
    try {
      const res = await fetch("/api/distribute/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, accountName: name || platform }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setName("");
      setAccounts(json.accounts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  return (
    <Page
      kicker="DISTRIBUTE · LIVE"
      title="Accounts"
      description="One app per platform. Tester accounts only Connect. Official OAuth. Tokens in data/db, not the vault."
    >
      {error ? <p className="mb-4 text-sm text-[#B91C1C]">{error}</p> : null}

      <Surface className="mb-6">
        <p className="text-sm font-semibold">How to activate</p>
        <p className="mt-1 text-[13px] text-[#6B7280]">
          App credentials are <strong className="font-semibold text-[#111827]">once per platform</strong>, not per tester.
          Google Cloud / TikTok for Developers / Meta app = 1. Tester YouTube/TikTok/IG logins = many. They all reuse this app.
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-[13px] leading-6 text-[#374151]">
          <li>
            Set <strong>Public base URL</strong> to the HTTPS host testers open (Tailscale Serve:{" "}
            <code className="text-[12px]">https://aioscreator.tailc20c39.ts.net</code>
            ). HTTP LAN will fail OAuth redirects.
          </li>
          <li>
            Create <strong>one</strong> app in each console. Redirect URI must match exactly (copy from the field below):
            <ul className="mt-1 list-disc pl-5 text-[#6B7280]">
              <li>YouTube — Google Cloud → APIs &amp; Services → Credentials → OAuth client (Web). Enable YouTube Data API v3. Consent screen in Testing → add tester Gmail under Test users.</li>
              <li>TikTok — TikTok for Developers → Login Kit. Redirect URI + testers in the app’s sandbox / allowlist.</li>
              <li>Instagram — Meta Developer app → Instagram API. Add testers as Instagram Testers on the app.</li>
              <li>Threads — Meta Developer app → Threads API. Testers on the app. Redirect must be HTTPS.</li>
              <li>X — developer.x.com → OAuth 2.0 app (Web). Callback URI exact. User auth + tweet.write. Posting needs a paid X API plan.</li>
              <li>Pinterest — developers.pinterest.com → app + OAuth. Testers + at least one board on the Pinterest account.</li>
            </ul>
          </li>
          <li>Paste Client ID + secret here. Redirect can stay blank — we fill it from Public base URL. Save once.</li>
          <li>
            Add tester rows below (label like <code className="text-[12px]">YT tester 1</code>). Click{" "}
            <strong>Connect official OAuth</strong>. That person logs in with <em>their</em> Google / TikTok / Instagram — no new Cloud project.
          </li>
          <li>Until Connect succeeds, Calendar still writes Export packs. YouTube unverified = private videos. TikTok MVP = Inbox, not Direct Post.</li>
        </ol>
      </Surface>

      <Surface className="mb-6">
        <p className="text-sm font-semibold">App credentials · once</p>
        <p className="mt-1 text-[13px] text-[#6B7280]">
          Not per tester. Same YouTube client id is used by every tester Connect. Secrets stay on this PC.
        </p>
        <form onSubmit={saveApps} className="mt-4 space-y-4">
          <label className="block text-[11px] font-semibold tracking-[0.16em] text-[#6B7280]">
            Public base URL (Tailscale HTTPS, optional — Instagram video)
            <input
              className={inputClass}
              value={apps.publicBaseUrl || ""}
              onChange={(e) => setApps((a) => ({ ...a, publicBaseUrl: e.target.value }))}
              placeholder="https://aioscreator.tailc20c39.ts.net"
            />
          </label>
          {PLATFORMS.map((p) => {
            const row = apps[p.id] || { clientId: "", clientSecret: "", redirectUri: "" };
            const ready = Boolean(row.clientId && row.clientSecret);
            const suggested = defaultRedirect(apps.publicBaseUrl, p.id);
            return (
              <div key={p.id} className="grid gap-2 rounded-xl border border-[#E6E8EE] p-3 md:grid-cols-3">
                <p className="md:col-span-3 text-[13px] font-semibold">
                  {p.name}{" "}
                  <span className={ready ? "font-normal text-[#15803D]" : "font-normal text-[#9CA3AF]"}>
                    · {ready ? "app ready — testers can Connect" : "app not saved yet"}
                  </span>
                  <span className="mt-0.5 block font-normal text-[#6B7280]">{p.hint}</span>
                </p>
                <input
                  className={inputClass}
                  placeholder="Client ID / key"
                  value={row.clientId}
                  onChange={(e) => setApps((a) => ({ ...a, [p.id]: { ...row, clientId: e.target.value } }))}
                />
                <input
                  className={inputClass}
                  placeholder="Client secret"
                  type="password"
                  value={row.clientSecret}
                  onChange={(e) => setApps((a) => ({ ...a, [p.id]: { ...row, clientSecret: e.target.value } }))}
                />
                <input
                  className={inputClass}
                  placeholder={suggested}
                  value={row.redirectUri}
                  onChange={(e) => setApps((a) => ({ ...a, [p.id]: { ...row, redirectUri: e.target.value } }))}
                />
                <p className="md:col-span-3 text-[11px] text-[#6B7280]">
                  Paste this URI in the developer console:{" "}
                  <code className="break-all text-[11px] text-[#111827]">{row.redirectUri || suggested}</code>
                </p>
              </div>
            );
          })}
          <Btn type="submit" disabled={busy === "apps"}>
            {busy === "apps" ? "Saving…" : "Save app credentials"}
          </Btn>
        </form>
      </Surface>

      <Surface className="mb-6">
        <p className="text-sm font-semibold">Tester accounts</p>
        <p className="mt-1 text-[13px] text-[#6B7280]">
          Each row is a tester login. They share the app above. No extra Client ID.
        </p>
        <form onSubmit={addAccount} className="mt-3 flex flex-wrap gap-2">
          <select className={inputClass + " mt-0 max-w-[10rem]"} value={platform} onChange={(e) => setPlatform(e.target.value as typeof platform)}>
            {PLATFORMS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <input className={inputClass + " mt-0 max-w-xs"} placeholder="Label (e.g. YT tester 1)" value={name} onChange={(e) => setName(e.target.value)} />
          <Btn type="submit" disabled={busy === "add"}>
            Add
          </Btn>
        </form>
      </Surface>

      {accounts.length === 0 ? (
        <EmptyState
          title="No testers yet"
          body="Save app credentials once, then Add a tester and Connect. Until OAuth completes, Calendar still writes Export packs."
        />
      ) : (
        <div className="grid gap-3">
          {accounts.map((a) => (
            <Surface key={a.id} className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">
                  {a.accountName} <span className="font-normal text-[#6B7280]">· {a.platform}</span>
                </p>
                <p className="mt-1 flex flex-wrap gap-1 text-[12px] text-[#6B7280]">
                  <Pill tone={a.connectionState === "connected" ? "ready" : a.connectionState === "error" ? "off" : "muted"}>
                    {a.connectionState}
                  </Pill>
                  <Pill tone="muted">{a.auditStatus}</Pill>
                  <Pill tone="muted">{a.accountSubtype}</Pill>
                  {a.handle ? <span>{a.handle}</span> : null}
                </p>
                {a.lastError ? <p className="mt-1 text-[12px] text-[#B91C1C]">{a.lastError}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {apps[a.platform]?.clientId && apps[a.platform]?.clientSecret ? (
                  <a href={`/api/distribute/oauth/${a.platform}?accountId=${a.id}`}>
                    <Btn type="button">{a.hasToken ? "Reconnect" : "Connect official OAuth"}</Btn>
                  </a>
                ) : (
                  <Btn type="button" disabled>
                    Save {a.platform} app first
                  </Btn>
                )}
                <Btn
                  type="button"
                  variant="danger"
                  onClick={async () => {
                    if (!window.confirm("Disconnect and delete this account?")) return;
                    const res = await fetch("/api/distribute/accounts", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ action: "delete", id: a.id }),
                    });
                    const json = await res.json();
                    setAccounts(json.accounts || []);
                  }}
                >
                  Delete
                </Btn>
              </div>
            </Surface>
          ))}
        </div>
      )}
    </Page>
  );
}
