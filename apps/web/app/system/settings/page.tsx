"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Btn, inputClass, Page, Pill, Surface } from "@/components/ui";

type Preset = { id: string; name: string; baseURL: string; model: string; hint: string };
type Row = { id: string; name: string; baseURL: string; model: string; keyHint: string; createdAt: string };
type Payload = {
  presets: Preset[];
  activeId: string | null;
  providers: Row[];
  active: { source: string; name: string; baseURL: string; model: string; keyHint: string } | null;
  revamp?: {
    mode: "lmstudio" | "openrouter" | null;
    lmstudio: { name: string; model: string; baseURL: string; keyHint: string } | null;
    openrouter: { name: string; model: string; baseURL: string; keyHint: string } | null;
    active: { name: string; model: string; baseURL: string; keyHint: string } | null;
  } | null;
};

type Pipe = { id: string; name: string; baseURL: string; ready: boolean; keyHint: string; accounts?: number };
type AccountRow = {
  id: string;
  providerId: string;
  name: string;
  label: string;
  baseURL: string;
  ready: boolean;
  tier: string;
  status: string;
  keyHint: string;
  email?: string;
  okCount?: number;
  failCount?: number;
  lastUsedAt?: string;
  lastError?: string;
  lastBalanceUsd?: number;
  lastUsedUsd?: number;
  lastQuotaAt?: string;
  quotaUsername?: string;
  weekOk?: number;
  weekFail?: number;
};
type UsageLog = {
  at: string;
  ok: boolean;
  status?: number;
  ms: number;
  model: string;
  providerId: string;
  providerName: string;
  accountId: string;
  accountLabel: string;
  apiHost: string;
  error?: string;
};
type Usage = {
  days: number;
  total: number;
  ok: number;
  fail: number;
  spendUsd?: number;
  costPerOk?: number;
  byModel: { model: string; ok: number; fail: number; spendUsd?: number; costPerOk?: number }[];
  byProvider?: { providerId: string; name: string; ok: number; fail: number; spendUsd?: number; costPerOk?: number }[];
  log?: UsageLog[];
  accounts: AccountRow[];
};
type MapRow = { model: string; routes: { id: string; name: string; ready: boolean; wired?: boolean; keyed?: boolean }[] };

const MODEL_LABEL: Record<string, string> = {
  "gpt-image-2.5": "GPT Image 2.5",
  "gpt-image-2": "GPT Image 2",
  "seedream-5-pro": "Seedream 5 Pro",
  "seedream-4-5": "Seedream 4.5",
  "nano-banana": "Nano Banana",
  "seedance-2-5": "Seedance 2.5",
  "seedance-2-0": "Seedance 2.0",
  "kling-2-6": "Kling 2.6",
  "kling-3-0": "Kling 3.0",
  "dreamactor-v2": "DreamActor V2",
  "wan-3-0": "Wan 3.0 Prime",
  "wan-3-0-std": "Wan 3.0",
};

const PIPE_HINT: Record<string, string> = {
  comet: "GPT Image, Seedream, Nano Banana, Seedance. Dashboard key starts with sk-.",
  openai: "Official GPT Image 2.",
  byteplus: "Official Seedream 5 Pro. Seedance on this pipe is not wired.",
  kling: "Official Kling Motion Control 3.0.",
  wavespeed: "Listed, not wired yet.",
  hensun: "NewAPI. Seedream 4.5, Seedance 2.0, Seedance 2.5. URL hensunai.com.",
  dashscope: "Alibaba Singapore. Two accounts: Qwen LLM (compatible-mode) vs Wan 3.0 video (/api/v1). Don't mix keys.",
};

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-[11px] font-semibold tracking-[0.16em] text-[#6B7280]">
      {label}
      {children}
    </label>
  );
}

function statusTone(status: string, ready: boolean): "ready" | "warn" | "off" | "muted" {
  if (status === "limited") return "warn";
  if (status === "dead") return "off";
  if (ready) return "ready";
  return "muted";
}

export default function SettingsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [preset, setPreset] = useState("openrouter-free");
  const [name, setName] = useState("OpenRouter · free");
  const [baseURL, setBaseURL] = useState("https://openrouter.ai/api/v1");
  const [model, setModel] = useState("openrouter/free");
  const [apiKey, setApiKey] = useState("");
  const [revampKey, setRevampKey] = useState("");
  const [pipes, setPipes] = useState<Pipe[]>([]);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [modelMap, setModelMap] = useState<MapRow[]>([]);
  const [pipeId, setPipeId] = useState("comet");
  const [pipeBase, setPipeBase] = useState("https://api.cometapi.com");
  const [pipeKey, setPipeKey] = useState("");
  const [pipeLabel, setPipeLabel] = useState("");
  const [pipeTier, setPipeTier] = useState("gratis");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pipeError, setPipeError] = useState("");
  const [usage, setUsage] = useState<Usage | null>(null);
  const [pipeEmail, setPipeEmail] = useState("");
  const [vsBase, setVsBase] = useState("http://127.0.0.1:3900/v1");
  const [vsKey, setVsKey] = useState("");
  const [vsVoice, setVsVoice] = useState("default");
  const [vsProbe, setVsProbe] = useState<{ ok?: boolean; error?: string } | null>(null);
  const [cookieDraft, setCookieDraft] = useState("");
  const [cookieStatus, setCookieStatus] = useState<{
    saved: boolean;
    headerCount: number;
    netscapeCount: number;
    hosts: string[];
    updatedAt: string;
  } | null>(null);

  async function load() {
    const res = await fetch("/api/settings/llm");
    const json = (await res.json()) as Payload;
    setData(json);
    const pipesJson = await fetch("/api/settings/providers").then((r) => r.json());
    setPipes(pipesJson.providers || []);
    setAccounts(pipesJson.accounts || []);
    setModelMap(pipesJson.map || []);
    setUsage(pipesJson.usage || null);
    try {
      const cookies = await fetch("/api/research/cookies").then((r) => r.json());
      setCookieStatus(cookies);
      const vs = await fetch("/api/settings/voice").then((r) => r.json());
      if (vs.baseURL) setVsBase(vs.baseURL);
      if (vs.voice) setVsVoice(vs.voice);
      setVsProbe(vs.probe || null);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function applyPreset(id: string) {
    setPreset(id);
    const p = data?.presets.find((x) => x.id === id);
    if (!p) return;
    setName(p.name);
    setBaseURL(p.baseURL);
    setModel(p.model);
  }

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/settings/llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "failed");
      setApiKey("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const hint = data?.presets.find((p) => p.id === preset)?.hint;

  function applyPipe(id: string) {
    setPipeId(id);
    const p = pipes.find((x) => x.id === id);
    if (p) setPipeBase(p.baseURL);
  }

  async function postPipe(body: Record<string, unknown>) {
    setBusy(true);
    setPipeError("");
    try {
      const res = await fetch("/api/settings/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "failed");
      setPipeKey("");
      setPipeLabel("");
      setPipeEmail("");
      setPipes(json.providers || []);
      setAccounts(json.accounts || []);
      setModelMap(json.map || []);
      setUsage(json.usage || null);
      window.dispatchEvent(new Event("creatoros:engines"));
    } catch (err) {
      setPipeError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const grouped = useMemo(
    () =>
      pipes
        .map((p) => ({
          ...p,
          rows: accounts.filter((a) => a.providerId === p.id),
        }))
        .filter((p) => p.rows.length > 0),
    [pipes, accounts],
  );

  const liveCloud = accounts.filter((a) => a.ready).length;

  return (
    <Page
      kicker="SYSTEM · SETTINGS"
      title="Keys"
      description="Local-only in data/db (gitignored). LLM for scripts. Cloud accounts for stills and motion. Create never names the pipe."
    >
      <div className="grid gap-6 xl:grid-cols-2">
        <Surface>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.18em] text-[#9CA3AF]">LLM</p>
              <h2 className="mt-1 text-sm font-bold">Scripts / general LLM</h2>
            </div>
            {data?.active ? <Pill tone="on">Active</Pill> : <Pill tone="muted">Empty</Pill>}
          </div>
          <div className="mt-4 rounded-xl bg-[#F3F4F8] px-3 py-2.5 text-[13px] leading-relaxed text-[#4B5563]">
            {data?.active ? (
              <>
                <span className="font-semibold text-[#0B0F2B]">{data.active.name}</span>
                <span className="mt-0.5 block font-mono text-[11px] text-[#6B7280]">
                  {data.active.model} · {data.active.keyHint}
                </span>
              </>
            ) : (
              "No key yet. This is scripts / general chat. Character Revamp is the slot below."
            )}
          </div>

          <form
            className="mt-5 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void post({ action: "add", preset, name, baseURL, model, apiKey });
            }}
          >
            <Field label="Preset">
              <select value={preset} onChange={(e) => applyPreset(e.target.value)} className={inputClass}>
                {(data?.presets ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            {hint ? <p className="text-[12px] leading-relaxed text-[#9CA3AF]">{hint}</p> : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Label">
                <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
              </Field>
              <Field label="Model">
                <input value={model} onChange={(e) => setModel(e.target.value)} className={`${inputClass} font-mono text-[12px]`} />
              </Field>
            </div>
            <Field label="Base URL">
              <input value={baseURL} onChange={(e) => setBaseURL(e.target.value)} className={`${inputClass} font-mono text-[12px]`} />
            </Field>
            <Field label="API key">
              <input
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-or-v1-…"
                className={`${inputClass} font-mono text-[12px]`}
              />
            </Field>
            {error ? <p className="text-[12px] text-red-600">{error}</p> : null}
            <Btn type="submit" disabled={busy || !apiKey}>
              {busy ? "Saving…" : "Save & use"}
            </Btn>
          </form>

          <p className="mt-8 text-[11px] font-semibold tracking-[0.18em] text-[#9CA3AF]">Saved</p>
          {(data?.providers ?? []).length === 0 ? (
            <p className="mt-3 text-[13px] text-[#9CA3AF]">Nothing saved.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {(data?.providers ?? []).map((p) => {
                const on = data?.activeId === p.id;
                return (
                  <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#E6E8EE] px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                        {p.name}
                        {on ? <Pill tone="on">On</Pill> : null}
                      </p>
                      <p className="mt-0.5 truncate font-mono text-[11px] text-[#6B7280]">
                        {p.model} · {p.keyHint}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {on ? (
                        <Btn type="button" variant="ghost" disabled={busy} onClick={() => void post({ action: "deactivate" })}>
                          Off
                        </Btn>
                      ) : (
                        <Btn type="button" variant="ghost" disabled={busy} onClick={() => void post({ action: "activate", id: p.id })}>
                          On
                        </Btn>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Surface>

        <Surface>
          <p className="text-[11px] font-semibold tracking-[0.18em] text-[#9CA3AF]">CHARACTER</p>
          <h2 className="mt-1 text-sm font-bold">Prompt revamp</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-[#4B5563]">
            Switch only. OpenRouter key stays saved. LM Studio on = GPU stays with Comfy.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void post({ action: "revamp-mode", mode: "lmstudio" })}
              className={
                data?.revamp?.mode === "lmstudio"
                  ? "rounded-full border border-[#652DFF] bg-[#652DFF] px-3.5 py-1.5 text-[12px] font-semibold text-white"
                  : "rounded-full border border-[#E6E8EE] bg-white px-3.5 py-1.5 text-[12px] font-semibold text-[#4B5563]"
              }
            >
              LM Studio :1234 {data?.revamp?.mode === "lmstudio" ? "· On" : "· Off"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void post({ action: "revamp-mode", mode: "openrouter" })}
              className={
                data?.revamp?.mode === "openrouter"
                  ? "rounded-full border border-[#652DFF] bg-[#652DFF] px-3.5 py-1.5 text-[12px] font-semibold text-white"
                  : "rounded-full border border-[#E6E8EE] bg-white px-3.5 py-1.5 text-[12px] font-semibold text-[#4B5563]"
              }
            >
              OpenRouter {data?.revamp?.mode === "openrouter" ? "· On" : "· Off"}
            </button>
          </div>
          {data?.revamp?.active ? (
            <p className="mt-3 font-mono text-[11px] text-[#6B7280]">
              Active: {data.revamp.active.name} · {data.revamp.active.model} · {data.revamp.active.baseURL}
            </p>
          ) : (
            <p className="mt-3 text-[13px] text-[#9CA3AF]">Off — Revamp uses the general LLM, then a local heuristic.</p>
          )}
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void post({ action: "revamp", apiKey: revampKey });
              setRevampKey("");
            }}
          >
            <Field label="OpenRouter key (optional, stays saved)">
              <input
                type="password"
                autoComplete="off"
                value={revampKey}
                onChange={(e) => setRevampKey(e.target.value)}
                placeholder={data?.revamp?.openrouter ? "saved · sk-or-…" : "sk-or-v1-…"}
                className={`${inputClass} font-mono text-[12px]`}
              />
            </Field>
            <Btn type="submit" disabled={busy || !revampKey}>
              Save OpenRouter key
            </Btn>
          </form>
        </Surface>

        <Surface>
          <p className="text-[11px] font-semibold tracking-[0.18em] text-[#9CA3AF]">VOICE</p>
          <h2 className="mt-1 text-sm font-bold">VoiceStudio</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-[#4B5563]">
            Local sidecar. OpenAI <code className="text-[12px]">POST /v1/audio/speech</code>. VO jobs wait if the 3060 is busy.
          </p>
          <p className="mt-2 font-mono text-[11px] text-[#6B7280]">
            {vsProbe?.ok ? "Online" : vsProbe?.error || "Offline — start VoiceStudio on :3900"}
          </p>
          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void (async () => {
                setBusy(true);
                setError("");
                try {
                  const res = await fetch("/api/settings/voice", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ baseURL: vsBase, apiKey: vsKey || undefined, voice: vsVoice }),
                  });
                  const json = await res.json();
                  if (!res.ok) throw new Error(json.error || "failed");
                  setVsProbe(json.probe || null);
                  setVsKey("");
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err));
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            <Field label="Base URL">
              <input value={vsBase} onChange={(e) => setVsBase(e.target.value)} className={`${inputClass} font-mono text-[12px]`} />
            </Field>
            <Field label="Default voice id">
              <input value={vsVoice} onChange={(e) => setVsVoice(e.target.value)} className={`${inputClass} font-mono text-[12px]`} />
            </Field>
            <Field label="API key (loopback can be local)">
              <input
                type="password"
                value={vsKey}
                onChange={(e) => setVsKey(e.target.value)}
                placeholder="local"
                className={`${inputClass} font-mono text-[12px]`}
              />
            </Field>
            <Btn type="submit" disabled={busy}>
              Save VoiceStudio
            </Btn>
          </form>
        </Surface>

        <Surface>
          <p className="text-[11px] font-semibold tracking-[0.18em] text-[#9CA3AF]">RESEARCH</p>
          <h2 className="mt-1 text-sm font-bold">Browser cookies</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-[#4B5563]">
            Used by yt-dlp on Intelligence → Research for TikTok / YouTube / Instagram / X watch pages. Netscape
            cookies.txt is the format that works. Stays on this PC. Never shown again after save.
          </p>
          <p className="mt-2 text-[12px] text-[#652DFF]">
            {cookieStatus?.saved
              ? `Saved${cookieStatus.hosts.length ? ` · ${cookieStatus.hosts.slice(0, 6).join(", ")}` : cookieStatus.headerCount ? ` · ${cookieStatus.headerCount} header cookies` : cookieStatus.netscapeCount ? ` · ${cookieStatus.netscapeCount} netscape` : ""}`
              : "Off — Research URL fetch is public-only until you paste cookies."}
          </p>
          <ol className="mt-3 list-decimal space-y-1 pl-4 text-[12px] leading-relaxed text-[#4B5563]">
            <li>Chrome: open the site while logged in.</li>
            <li>
              F12 → Network → first document request → Request Headers → copy the Cookie value.
            </li>
            <li>
              Or paste a Netscape cookies.txt from <strong>Get cookies.txt LOCALLY</strong>.
            </li>
          </ol>
          <textarea
            value={cookieDraft}
            onChange={(e) => setCookieDraft(e.target.value)}
            rows={5}
            placeholder="sessionid=…; tt_chain_token=…   or paste cookies.txt"
            className={`${inputClass} min-h-[7rem] font-mono text-[12px]`}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Btn
              type="button"
              disabled={busy || !cookieDraft.trim()}
              onClick={() => {
                void (async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const t = cookieDraft.trim();
                    const netscape = /^#\s*Netscape/i.test(t) || /\tTRUE\t/.test(t) || /\tFALSE\t/.test(t);
                    const res = await fetch("/api/research/cookies", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(
                        netscape ? { netscape: t } : { header: t.replace(/^Cookie:\s*/i, "") },
                      ),
                    });
                    const json = await res.json();
                    if (!res.ok) throw new Error(json.error || "failed");
                    setCookieStatus(json);
                    setCookieDraft("");
                  } catch (err) {
                    setError(err instanceof Error ? err.message : String(err));
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              Save cookies
            </Btn>
            <Btn
              type="button"
              variant="ghost"
              disabled={busy || !cookieStatus?.saved}
              onClick={() => {
                void (async () => {
                  await fetch("/api/research/cookies", { method: "DELETE" });
                  setCookieDraft("");
                  const json = await fetch("/api/research/cookies").then((r) => r.json());
                  setCookieStatus(json);
                })();
              }}
            >
              Clear
            </Btn>
            <Link href="/intelligence/research" className="inline-flex items-center text-[13px] font-semibold text-[#652DFF]">
              Research →
            </Link>
          </div>
        </Surface>

        <Surface>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.18em] text-[#9CA3AF]">CLOUD</p>
              <h2 className="mt-1 text-sm font-bold">Stills & motion</h2>
            </div>
            <div className="flex gap-2">
              <Btn type="button" variant="ghost" disabled={busy} onClick={() => void postPipe({ action: "quota" })}>
                Refresh $
              </Btn>
              <Pill tone={liveCloud ? "ready" : "muted"}>{liveCloud ? `${liveCloud} live` : "No keys"}</Pill>
            </div>
          </div>
          <p className="mt-2 text-[13px] leading-relaxed text-[#6B7280]">
            Many keys per pipe. Router tries gratis → murah → paid. 401 marks dead. 429 skips 15 min.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {modelMap.map((row) => {
              const ready = row.routes.some((r) => r.ready);
              return (
                <span
                  key={row.model}
                  className="inline-flex items-center gap-2 rounded-full border border-[#E6E8EE] bg-[#FAFAFB] px-2.5 py-1 text-[12px]"
                >
                  <span className="font-semibold text-[#0B0F2B]">{MODEL_LABEL[row.model] || row.model}</span>
                  <Pill tone={ready ? "ready" : "muted"}>{ready ? "Ready" : "Need key"}</Pill>
                </span>
              );
            })}
          </div>

          <form
            className="mt-6 space-y-3 border-t border-[#E6E8EE] pt-5"
            onSubmit={(e) => {
              e.preventDefault();
              void postPipe({
                action: "add",
                providerId: pipeId,
                baseURL: pipeBase,
                apiKey: pipeKey,
                label: pipeLabel,
                email: pipeEmail,
                tier: pipeTier,
              });
            }}
          >
            <p className="text-[11px] font-semibold tracking-[0.18em] text-[#9CA3AF]">Add account</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Provider">
                <select value={pipeId} onChange={(e) => applyPipe(e.target.value)} className={inputClass}>
                  {pipes.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.accounts ? ` · ${p.accounts} live` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Tier">
                <select value={pipeTier} onChange={(e) => setPipeTier(e.target.value)} className={inputClass}>
                  <option value="gratis">gratis — try first</option>
                  <option value="murah">murah</option>
                  <option value="paid">paid — last</option>
                </select>
              </Field>
            </div>
            <p className="text-[12px] leading-relaxed text-[#9CA3AF]">{PIPE_HINT[pipeId] || ""}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Label">
                <input
                  value={pipeLabel}
                  onChange={(e) => setPipeLabel(e.target.value)}
                  placeholder="gratis-1"
                  className={inputClass}
                />
              </Field>
              <Field label="Email (which inbox)">
                <input
                  value={pipeEmail}
                  onChange={(e) => setPipeEmail(e.target.value)}
                  placeholder="you+comet3@gmail.com"
                  className={inputClass}
                />
              </Field>
              <Field label="Base URL" >
                <input
                  value={pipeBase}
                  onChange={(e) => setPipeBase(e.target.value)}
                  className={`${inputClass} font-mono text-[12px]`}
                />
              </Field>
            </div>
            <Field label="API key">
              <input
                type="password"
                autoComplete="off"
                value={pipeKey}
                onChange={(e) => setPipeKey(e.target.value)}
                placeholder="adds another account — does not replace"
                className={`${inputClass} font-mono text-[12px]`}
              />
            </Field>
            {pipeError ? <p className="text-[12px] text-red-600">{pipeError}</p> : null}
            <Btn type="submit" disabled={busy || !pipeKey}>
              {busy ? "Saving…" : "Add account"}
            </Btn>
          </form>

          <p className="mt-8 text-[11px] font-semibold tracking-[0.18em] text-[#9CA3AF]">Accounts</p>
          {accounts.length === 0 ? (
            <p className="mt-3 text-[13px] text-[#9CA3AF]">Paste a key above. Gratis keys go in first.</p>
          ) : (
            <div className="mt-3 space-y-5">
              {grouped.map((g) => (
                <div key={g.id}>
                  <p className="mb-2 text-[12px] font-semibold text-[#6B7280]">
                    {g.name}
                    <span className="ml-2 font-normal text-[#9CA3AF]">{g.rows.length}</span>
                  </p>
                  <ul className="space-y-2">
                    {g.rows.map((a) => (
                      <li
                        key={a.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-[#E6E8EE] px-3 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                            {a.label}
                            <Pill tone={statusTone(a.status, a.ready)}>{a.status}</Pill>
                            <Pill tone="muted">{a.tier}</Pill>
                            {typeof a.lastBalanceUsd === "number" ? (
                              <Pill tone={a.lastBalanceUsd > 0.05 ? "ready" : "warn"}>${a.lastBalanceUsd.toFixed(2)}</Pill>
                            ) : null}
                          </p>
                          <p className="mt-0.5 truncate font-mono text-[11px] text-[#6B7280]">
                            {a.quotaUsername || a.email || "no email"}
                            {" · "}
                            {a.keyHint}
                            {typeof a.lastUsedUsd === "number" ? ` · used $${a.lastUsedUsd.toFixed(2)}` : ""}
                            {" · "}
                            {(a.okCount || 0) + (a.failCount || 0)} hits
                            {a.lastUsedAt ? ` · last ${a.lastUsedAt.slice(0, 16).replace("T", " ")}` : ""}
                          </p>
                          <input
                            defaultValue={a.email || ""}
                            placeholder="email for this key"
                            onBlur={(e) => {
                              if (e.target.value !== (a.email || "")) {
                                void postPipe({ action: "patch", id: a.id, email: e.target.value });
                              }
                            }}
                            className="mt-1.5 w-full rounded-lg border border-transparent bg-[#F8F8FA] px-2 py-1 text-[12px] text-[#4B5563] outline-none focus:border-[#652DFF]/40"
                          />
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Btn type="button" variant="ghost" disabled={busy} onClick={() => void postPipe({ action: "probe", id: a.id })}>
                            Check
                          </Btn>
                          {a.status !== "live" ? (
                            <Btn type="button" variant="ghost" disabled={busy} onClick={() => void postPipe({ action: "revive", id: a.id })}>
                              Revive
                            </Btn>
                          ) : null}
                          <Btn type="button" variant="danger" disabled={busy} onClick={() => void postPipe({ action: "delete", id: a.id })}>
                            Delete
                          </Btn>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Surface>
      </div>

      <Surface className="mt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.18em] text-[#9CA3AF]">USAGE</p>
            <h2 className="mt-1 text-sm font-bold">Last 7 days · this PC</h2>
          </div>
          <p className="text-[12px] text-[#6B7280]">
            Snapshot. Full spend + $ / result di{" "}
            <Link href="/system/usage" className="font-semibold text-[#652DFF]">
              System → Usage
            </Link>
            .
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <div className="rounded-xl bg-[#F3F4F8] px-3 py-2">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-[#9CA3AF]">Calls</p>
            <p className="text-lg font-black">{usage?.total ?? 0}</p>
          </div>
          <div className="rounded-xl bg-[#ECFDF3] px-3 py-2">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-[#15803D]">OK</p>
            <p className="text-lg font-black text-[#15803D]">{usage?.ok ?? 0}</p>
          </div>
          <div className="rounded-xl bg-[#FEF2F2] px-3 py-2">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-[#B91C1C]">Fail</p>
            <p className="text-lg font-black text-[#B91C1C]">{usage?.fail ?? 0}</p>
          </div>
          <div className="rounded-xl bg-[#F5F3FF] px-3 py-2">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-[#652DFF]">Spend</p>
            <p className="text-lg font-black text-[#652DFF]">
              {typeof usage?.spendUsd === "number" ? `$${usage.spendUsd.toFixed(2)}` : "$0"}
            </p>
          </div>
          <div className="rounded-xl bg-[#F3F4F8] px-3 py-2">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-[#9CA3AF]">$ / result</p>
            <p className="text-lg font-black">{typeof usage?.costPerOk === "number" ? `$${usage.costPerOk.toFixed(2)}` : "—"}</p>
          </div>
        </div>
        {usage?.byModel?.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {usage.byModel.map((m) => (
              <span key={m.model} className="rounded-full border border-[#E6E8EE] px-2.5 py-1 text-[12px]">
                <span className="font-semibold">{MODEL_LABEL[m.model] || m.model}</span>
                <span className="ml-2 text-[#6B7280]">
                  {m.ok} ok / {m.fail} fail
                  {typeof m.costPerOk === "number" && m.ok ? ` · $${m.costPerOk.toFixed(2)}/ok` : ""}
                </span>
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-[13px] text-[#9CA3AF]">No cloud generates yet this week. Hits appear after a still or Wan/Kling job.</p>
        )}
        {usage?.byProvider?.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {usage.byProvider.map((p) => (
              <span key={p.providerId} className="rounded-full bg-[#F3F4F8] px-2.5 py-1 text-[12px]">
                <span className="font-semibold">{p.name}</span>
                <span className="ml-2 text-[#6B7280]">
                  {p.ok} ok / {p.fail} fail
                </span>
              </span>
            ))}
          </div>
        ) : null}
        {usage?.log?.length ? (
          <div className="mt-4 overflow-x-auto rounded-xl border border-[#E6E8EE]">
            <table className="w-full min-w-[40rem] text-left text-[12px]">
              <thead className="bg-[#F3F4F8] text-[11px] font-semibold tracking-[0.08em] text-[#6B7280]">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Provider</th>
                  <th className="px-3 py-2">Account</th>
                  <th className="px-3 py-2">API</th>
                  <th className="px-3 py-2">Model</th>
                  <th className="px-3 py-2">Result</th>
                  <th className="px-3 py-2">ms</th>
                </tr>
              </thead>
              <tbody>
                {usage.log.map((row, i) => (
                  <tr key={`${row.at}-${i}`} className="border-t border-[#E6E8EE] align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-[#6B7280]">
                      {new Date(row.at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 font-semibold">{row.providerName}</td>
                    <td className="px-3 py-2">{row.accountLabel}</td>
                    <td className="px-3 py-2 font-mono text-[11px] text-[#6B7280]">{row.apiHost || "—"}</td>
                    <td className="px-3 py-2">{MODEL_LABEL[row.model] || row.model}</td>
                    <td className="px-3 py-2">
                      <span className={row.ok ? "font-semibold text-[#15803D]" : "font-semibold text-[#B91C1C]"}>
                        {row.ok ? "OK" : "Fail"}
                        {row.status != null ? ` ${row.status}` : ""}
                      </span>
                      {row.error ? <p className="mt-0.5 max-w-xs text-[11px] text-[#9CA3AF]">{row.error}</p> : null}
                    </td>
                    <td className="px-3 py-2 text-[#6B7280]">{row.ms}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Surface>
    </Page>
  );
}
