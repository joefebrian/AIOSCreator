"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Btn, Page, Pill, Surface } from "@/components/ui";

type TrendRow = {
  id: string;
  platform: string;
  title: string;
  url?: string;
  views?: number;
  source: string;
  count?: number;
};

type Board = {
  stats: { extracts: number; observations: number };
  trends: { youtubeNote: string; rows: TrendRow[]; byPlatform: Record<string, number> };
};

export default function TrendsPage() {
  const [board, setBoard] = useState<Board | null>(null);
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [market, setMarket] = useState("ID");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch(`/api/intelligence?region=${encodeURIComponent(market || "ID")}`);
    const json = (await res.json()) as Board & { error?: string };
    if (!res.ok) throw new Error(json.error || "load failed");
    setBoard(json);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  async function observe(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "observe", url, note, market }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "failed");
      setUrl("");
      setNote("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const rows = board?.trends.rows || [];
  const mix = Object.entries(board?.trends.byPlatform || {});

  return (
    <Page
      kicker="INTELLIGENCE · TRENDS"
      title="Trends"
      description="Legal inputs only: your Research extracts, operator URLs, and YouTube Data API mostPopular if an account is connected. No TikTok Research API. No Creative Center scrape."
    >
      <div className="mb-4 flex flex-wrap gap-2 text-[12px]">
        {mix.length ? (
          mix.map(([p, n]) => (
            <Pill key={p} tone="muted">
              {p} · {n}
            </Pill>
          ))
        ) : (
          <Pill>No extract mix yet</Pill>
        )}
      </div>

      <Surface className="mb-4">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-[#9CA3AF]">ADD OBSERVATION</p>
        <p className="mt-1 text-[12px] text-[#6B7280]">Paste a public URL you already opened. We store source + note — we do not scrape blocked dashboards.</p>
        <form className="mt-3 grid gap-2 md:grid-cols-[1fr_8rem_auto]" onSubmit={(e) => void observe(e)}>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=…  or  x.com/…/status/…"
            className="rounded-xl border border-[#E6E8EE] px-3 py-2 text-[13px] outline-none focus:border-[#652DFF]"
          />
          <input
            value={market}
            onChange={(e) => setMarket(e.target.value.toUpperCase())}
            placeholder="ID"
            className="rounded-xl border border-[#E6E8EE] px-3 py-2 text-[13px] outline-none focus:border-[#652DFF]"
          />
          <Btn type="submit" disabled={busy || !url.trim()}>
            Save
          </Btn>
        </form>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Why this matters (optional)"
          className="mt-2 w-full rounded-xl border border-[#E6E8EE] px-3 py-2 text-[13px] outline-none focus:border-[#652DFF]"
        />
        {error ? <p className="mt-2 text-[12px] text-red-600">{error}</p> : null}
      </Surface>

      <p className="text-[12px] text-[#6B7280]">{board?.trends.youtubeNote}</p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {rows.map((row) => (
          <Surface key={row.id} className="p-4">
            <div className="flex items-center justify-between gap-2">
              <Pill tone={row.source === "youtube" ? "ready" : row.source === "observation" ? "on" : "muted"}>
                {row.platform} · {row.source}
              </Pill>
              {row.count ? <span className="text-[11px] text-[#9CA3AF]">{row.count}×</span> : null}
            </div>
            <p className="mt-2 text-[14px] font-semibold leading-snug">{row.title}</p>
            {row.views ? <p className="mt-1 text-[12px] text-[#6B7280]">{row.views.toLocaleString()} views</p> : null}
            {row.url ? (
              <a href={row.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[12px] font-semibold text-[#652DFF]">
                Open source
              </a>
            ) : (
              <Link href="/intelligence/research" className="mt-2 inline-block text-[12px] font-semibold text-[#652DFF]">
                Research library
              </Link>
            )}
            {row.source === "observation" ? (
              <button
                type="button"
                className="ml-3 text-[12px] text-red-500"
                onClick={() => {
                  void fetch("/api/intelligence", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "delete-observation", id: row.id }),
                  }).then(() => load());
                }}
              >
                Delete
              </button>
            ) : null}
          </Surface>
        ))}
      </div>
      {!rows.length ? (
        <p className="mt-6 text-sm text-[#6B7280]">No trends yet. Fetch a clip in Research or add an observation URL.</p>
      ) : null}
    </Page>
  );
}
