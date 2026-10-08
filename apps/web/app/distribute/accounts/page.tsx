"use client";

import { useEffect, useState } from "react";
import { Btn, inputClass, Page, Pill, Surface, TextLink } from "@/components/ui";

type Account = {
  id: string;
  platform: PlatformId;
  accountName: string;
  handle?: string;
  connectionState: string;
  auditStatus: string;
  accountSubtype: string;
  hasToken: boolean;
  tokenExpiry?: string;
  lastError?: string;
  scopes?: string[];
};

type AppRow = { clientId: string; clientSecret: string; redirectUri: string; hasSecret: boolean };

type Apps = {
  publicBaseUrl: string;
  youtube: AppRow;
  tiktok: AppRow;
  instagram: AppRow;
  threads: AppRow;
  x: AppRow;
  pinterest: AppRow;
};

type PlatformId = "youtube" | "tiktok" | "instagram" | "threads" | "x" | "pinterest";

const PLATFORMS: { id: PlatformId; name: string; hint: string }[] = [
  { id: "pinterest", name: "Pinterest", hint: "Stills pin to a Sandbox board until the app has Standard access. Reconnect once so the token is a Sandbox token. Video stays an export pack." },
  { id: "youtube", name: "YouTube", hint: "Video only. Unverified apps stay private until Google audit." },
  { id: "tiktok", name: "TikTok", hint: "Upload to Inbox. Direct Post stays off until Content Posting audit." },
  { id: "instagram", name: "Instagram", hint: "Needs a public media URL. Until then, Calendar writes an export pack." },
  { id: "threads", name: "Threads", hint: "Same public-URL limit as Instagram." },
  { id: "x", name: "X", hint: "Text post from the caption." },
];

const EMPTY_ROW: AppRow = { clientId: "", clientSecret: "", redirectUri: "", hasSecret: false };

function emptyApps(): Apps {
  return {
    publicBaseUrl: "",
    youtube: { ...EMPTY_ROW },
    tiktok: { ...EMPTY_ROW },
    instagram: { ...EMPTY_ROW },
    threads: { ...EMPTY_ROW },
    x: { ...EMPTY_ROW },
    pinterest: { ...EMPTY_ROW },
  };
}

function suggestedRedirect(platform: string) {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/api/distribute/oauth/${platform}/callback`;
}

const linkBtn =
  "inline-flex items-center justify-center rounded-xl bg-[#652DFF] px-3.5 py-2 text-[13px] font-semibold text-white hover:bg-[#5725e0]";

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [apps, setApps] = useState<Apps>(emptyApps);
  const [platform, setPlatform] = useState<PlatformId>("pinterest");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [openApp, setOpenApp] = useState<PlatformId | null>(null);

  function applyApps(raw: Partial<Apps> & { publicBaseUrl?: string }) {
    const next = emptyApps();
    next.publicBaseUrl = raw.publicBaseUrl || "";
    for (const p of PLATFORMS) {
      const row = raw[p.id];
      next[p.id] = {
        clientId: row?.clientId || "",
        clientSecret: "",
        redirectUri: row?.redirectUri || "",
        hasSecret: Boolean(row?.hasSecret),
      };
    }
    setApps(next);
  }

  async function load() {
    const res = await fetch("/api/distribute/accounts");
    const json = await res.json();
    setAccounts(json.accounts || []);
    if (json.apps) applyApps(json.apps);
  }

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("error")) setError(q.get("error") || "");
    if (q.get("connected")) setNotice(`${q.get("connected")} connected.`);
    if (q.get("error") || q.get("connected")) {
      window.history.replaceState(null, "", "/distribute/accounts");
    }
    void load();
  }, []);

  async function saveApps(e: React.FormEvent) {
    e.preventDefault();
    setBusy("apps");
    setError("");
    try {
      const body: Record<string, unknown> = { publicBaseUrl: apps.publicBaseUrl };
      for (const p of PLATFORMS) {
        const row = apps[p.id];
        body[p.id] = {
          clientId: row.clientId,
          redirectUri: row.redirectUri,
          ...(row.clientSecret.trim() ? { clientSecret: row.clientSecret.trim() } : {}),
        };
      }
      const res = await fetch("/api/distribute/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "apps", apps: body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "save failed");
      if (json.apps) applyApps(json.apps);
      setNotice("App credentials saved on this PC.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function addAccount(e: React.FormEvent) {
    e.preventDefault();
    setBusy("add");
    setError("");
    try {
      const res = await fetch("/api/distribute/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, accountName: name || platform }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "add failed");
      setName("");
      setAccounts(json.accounts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  const readyCount = PLATFORMS.filter((p) => apps[p.id].clientId && apps[p.id].hasSecret).length;
  const sorted = [...accounts].sort((a, b) => Number(b.hasToken) - Number(a.hasToken));

  return (
    <Page
      kicker="DISTRIBUTE"
      title="Accounts"
      description="Save each platform’s app once, add the login, then Connect. Tokens stay in data/db on this PC."
      actions={<TextLink href="/distribute/calendar">Calendar</TextLink>}
    >
      {error ? <p className="mb-4 text-sm text-[#B91C1C]">{error}</p> : null}
      {notice ? <p className="mb-4 text-sm text-[#15803D]">{notice}</p> : null}

      <Surface>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Logins</p>
            <p className="mt-1 text-[13px] text-[#6B7280]">The Pinterest account needs at least one board. Connect uses that person’s own login.</p>
          </div>
          <form onSubmit={addAccount} className="flex flex-wrap items-center gap-2">
            <select className={inputClass + " mt-0 w-36"} value={platform} onChange={(e) => setPlatform(e.target.value as PlatformId)}>
              {PLATFORMS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input className={inputClass + " mt-0 w-44"} placeholder="Label" value={name} onChange={(e) => setName(e.target.value)} />
            <Btn type="submit" disabled={busy === "add"}>
              Add
            </Btn>
          </form>
        </div>

        {sorted.length === 0 ? (
          <p className="mt-4 text-[13px] text-[#6B7280]">No logins yet. Add a row, save the app credentials below, then Connect.</p>
        ) : (
          <div className="mt-4 divide-y divide-[#E6E8EE]">
            {sorted.map((a) => {
              const app = apps[a.platform];
              const canConnect = Boolean(app?.clientId && app?.hasSecret);
              return (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {a.handle ? `@${a.handle.replace(/^@/, "")}` : a.accountName}
                      <span className="ml-2 font-normal text-[#6B7280]">{a.platform}</span>
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-[#6B7280]">
                      <Pill tone={a.hasToken ? "ready" : a.connectionState === "error" ? "off" : "muted"}>
                        {a.hasToken ? "connected" : "not connected"}
                      </Pill>
                      {a.accountName && a.handle ? <span>{a.accountName}</span> : null}
                    </p>
                    {a.platform === "pinterest" && a.hasToken && !(a.scopes || []).includes("boards:write") ? (
                      <p className="mt-1 text-[12px] text-[#B91C1C]">Publish needs Boards write. Use Reconnect and allow that permission.</p>
                    ) : null}
                    {a.lastError ? <p className="mt-1 text-[12px] text-[#B91C1C]">{a.lastError}</p> : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canConnect ? (
                      <a className={linkBtn} href={`/api/distribute/oauth/${a.platform}?accountId=${a.id}`}>
                        {a.hasToken ? "Reconnect" : "Connect"}
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
                        if (!window.confirm("Remove this login? The token on this PC is deleted.")) return;
                        const res = await fetch("/api/distribute/accounts", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "delete", id: a.id }),
                        });
                        const json = await res.json();
                        if (!res.ok) {
                          setError(json.error || "delete failed");
                          return;
                        }
                        setAccounts(json.accounts || []);
                      }}
                    >
                      Remove
                    </Btn>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Surface>

      <Surface className="mt-4">
        <form onSubmit={saveApps}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">App credentials</p>
              <p className="mt-1 text-[13px] text-[#6B7280]">
                {readyCount ? `${readyCount} platform${readyCount === 1 ? "" : "s"} saved.` : "Nothing saved yet."} A blank secret keeps the one already stored.
              </p>
            </div>
            <Btn type="submit" disabled={busy === "apps"}>
              {busy === "apps" ? "Saving…" : "Save credentials"}
            </Btn>
          </div>
          <label className="mt-4 block max-w-xl text-[11px] font-semibold tracking-[0.16em] text-[#6B7280]">
            Public base URL
            <input
              className={inputClass}
              placeholder="https://your-host"
              value={apps.publicBaseUrl}
              onChange={(e) => setApps((a) => ({ ...a, publicBaseUrl: e.target.value }))}
            />
          </label>
          <div className="mt-4 grid gap-2">
            {PLATFORMS.map((p) => {
              const row = apps[p.id];
              const open = openApp === p.id;
              const ready = Boolean(row.clientId && row.hasSecret);
              return (
                <div key={p.id} className="rounded-xl border border-[#E6E8EE]">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                    onClick={() => setOpenApp(open ? null : p.id)}
                  >
                    <span className="text-sm font-semibold">{p.name}</span>
                    <Pill tone={ready ? "ready" : "muted"}>{ready ? "saved" : "not set"}</Pill>
                  </button>
                  {open ? (
                    <div className="border-t border-[#E6E8EE] px-3 py-3">
                      <p className="text-[12px] leading-relaxed text-[#6B7280]">{p.hint}</p>
                      <div className="mt-3 grid gap-3 md:grid-cols-3">
                        <label className="text-[11px] font-semibold tracking-[0.16em] text-[#6B7280]">
                          App ID
                          <input
                            className={inputClass}
                            value={row.clientId}
                            onChange={(e) => setApps((a) => ({ ...a, [p.id]: { ...row, clientId: e.target.value } }))}
                          />
                        </label>
                        <label className="text-[11px] font-semibold tracking-[0.16em] text-[#6B7280]">
                          App secret
                          <input
                            className={inputClass}
                            type="password"
                            autoComplete="new-password"
                            placeholder={row.hasSecret ? "Saved. Paste only to replace." : "App secret key"}
                            value={row.clientSecret}
                            onChange={(e) => setApps((a) => ({ ...a, [p.id]: { ...row, clientSecret: e.target.value } }))}
                          />
                        </label>
                        <label className="text-[11px] font-semibold tracking-[0.16em] text-[#6B7280]">
                          Redirect URI
                          <input
                            className={inputClass}
                            placeholder={suggestedRedirect(p.id)}
                            value={row.redirectUri}
                            onChange={(e) => setApps((a) => ({ ...a, [p.id]: { ...row, redirectUri: e.target.value } }))}
                          />
                        </label>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </form>
      </Surface>
    </Page>
  );
}
