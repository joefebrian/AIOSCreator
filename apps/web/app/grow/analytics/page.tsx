"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Btn, Page, Pill, Surface } from "@/components/ui";

type Hook = {
  id: string;
  text: string;
  source: string;
  platform: string;
  saved: boolean;
  createdAt: string;
};

type Board = {
  stats: { extracts: number; products: number; scripts: number; savedHooks: number };
  hooks: Hook[];
};

export default function AnalyticsPage() {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");

  async function load() {
    const res = await fetch("/api/intelligence");
    const json = (await res.json()) as Board & { error?: string };
    if (!res.ok) throw new Error(json.error || "load failed");
    setBoard(json);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  async function save(h: Hook) {
    await fetch("/api/intelligence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save-hook", text: h.text, source: h.source, platform: h.platform }),
    });
    await load();
  }

  async function remove(id: string) {
    await fetch("/api/intelligence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete-hook", id }),
    });
    await load();
  }

  async function copy(text: string, id: string) {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    window.setTimeout(() => setCopied(""), 1200);
  }

  const stats = board?.stats;
  const hooks = board?.hooks || [];

  return (
    <Page
      kicker="GROW · ANALYTICS"
      title="Winner hooks"
      description="Hooks from completed scripts, Research motion lines, and ones you pin. No invented views or GMV. Winning lines go back to Research / Characters."
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <Pill tone="ready">scripts {stats?.scripts ?? 0}</Pill>
        <Pill>extracts {stats?.extracts ?? 0}</Pill>
        <Pill>saved {stats?.savedHooks ?? 0}</Pill>
        <Link href="/intelligence/research" className="text-[13px] font-semibold text-[#652DFF]">
          Research →
        </Link>
      </div>
      {error ? <p className="mb-3 text-[12px] text-red-600">{error}</p> : null}

      <div className="grid gap-3">
        {hooks.map((h) => (
          <Surface key={h.id} className="p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={h.saved ? "on" : "muted"}>{h.saved ? "pinned winner" : h.source}</Pill>
              <span className="text-[11px] text-[#9CA3AF]">{h.platform}</span>
            </div>
            <p className="mt-2 text-[15px] font-semibold leading-snug">{h.text}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Btn type="button" variant="ghost" onClick={() => void copy(h.text, h.id)}>
                {copied === h.id ? "Copied" : "Copy"}
              </Btn>
              {h.saved ? (
                <Btn type="button" variant="ghost" onClick={() => void remove(h.id)}>
                  Unpin
                </Btn>
              ) : (
                <Btn type="button" onClick={() => void save(h)}>
                  Pin as winner
                </Btn>
              )}
              <Link href="/create/characters" className="inline-flex items-center text-[13px] font-semibold text-[#652DFF]">
                Use in Characters →
              </Link>
            </div>
          </Surface>
        ))}
      </div>
      {!hooks.length ? (
        <p className="mt-6 text-sm text-[#6B7280]">
          No hooks yet. Generate an affiliate script on a character, or extract a clip in Research — motion lines land here.
        </p>
      ) : null}
    </Page>
  );
}
