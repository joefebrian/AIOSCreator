"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Btn, Page, Pill, Surface } from "@/components/ui";
import { thumbSrc } from "@/lib/media-url";

type Opp = {
  id: string;
  kind: "product" | "topic";
  title: string;
  score: number;
  why: string;
  href?: string;
  image?: string;
  pinned: boolean;
  excluded: boolean;
};

export default function OpportunitiesPage() {
  const [rows, setRows] = useState<Opp[]>([]);
  const [error, setError] = useState("");
  const [showExcluded, setShowExcluded] = useState(false);

  async function load() {
    const res = await fetch("/api/intelligence");
    const json = (await res.json()) as { opportunities?: Opp[]; error?: string };
    if (!res.ok) throw new Error(json.error || "load failed");
    setRows(json.opportunities || []);
  }

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  async function act(action: "pin" | "exclude", id: string, on: boolean) {
    await fetch("/api/intelligence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, id, on }),
    });
    await load();
  }

  const visible = rows.filter((r) => showExcluded || !r.excluded);

  return (
    <Page
      kicker="INTELLIGENCE · OPPORTUNITIES"
      title="Opportunities"
      description="Ranked SKUs from Commerce plus topics from Research extracts. Pin and exclude are yours — the score does not invent GMV."
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Btn type="button" variant="ghost" onClick={() => setShowExcluded((v) => !v)}>
          {showExcluded ? "Hide excluded" : "Show excluded"}
        </Btn>
        <Link href="/commerce/products" className="text-[13px] font-semibold text-[#652DFF]">
          Products →
        </Link>
        <Link href="/intelligence/research" className="text-[13px] font-semibold text-[#652DFF]">
          Research →
        </Link>
      </div>
      {error ? <p className="mb-3 text-[12px] text-red-600">{error}</p> : null}

      <div className="grid gap-3">
        {visible.map((row) => (
          <Surface key={row.id} className="flex gap-3 p-4">
            {row.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbSrc(row.image, 160)} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
            ) : (
              <div className="grid h-16 w-16 shrink-0 place-items-center rounded-lg bg-[#F3F4F8] text-[10px] font-semibold text-[#9CA3AF]">
                {row.kind}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[15px] font-bold">{row.score}</p>
                <Pill tone={row.pinned ? "on" : row.kind === "product" ? "ready" : "muted"}>{row.kind}</Pill>
                {row.excluded ? <Pill tone="off">excluded</Pill> : null}
              </div>
              <p className="mt-0.5 text-[14px] font-semibold leading-snug">{row.title}</p>
              <p className="mt-1 text-[12px] text-[#6B7280]">{row.why}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Btn type="button" variant="ghost" onClick={() => void act("pin", row.id, !row.pinned)}>
                  {row.pinned ? "Unpin" : "Pin"}
                </Btn>
                <Btn type="button" variant="ghost" onClick={() => void act("exclude", row.id, !row.excluded)}>
                  {row.excluded ? "Include" : "Exclude"}
                </Btn>
                {row.kind === "product" ? (
                  <Link href="/create/characters" className="inline-flex items-center text-[13px] font-semibold text-[#652DFF]">
                    Create UGC →
                  </Link>
                ) : (
                  <Link href="/intelligence/research" className="inline-flex items-center text-[13px] font-semibold text-[#652DFF]">
                    Open Research →
                  </Link>
                )}
              </div>
            </div>
          </Surface>
        ))}
      </div>
      {!visible.length ? (
        <p className="mt-6 text-sm text-[#6B7280]">No opportunities yet. Import Amazon SKUs or extract a few clips in Research.</p>
      ) : null}
    </Page>
  );
}
