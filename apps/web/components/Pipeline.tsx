"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

export const MODULES = [
  {
    id: "research",
    href: "/intelligence/research",
    name: "RESEARCH",
    sub: "INTELLIGENCE",
    badge: "DECODED",
    live: true,
  },
  {
    id: "content",
    href: "/content",
    name: "CONTENT ENGINE",
    sub: "WRITE · NARRATE",
    badge: "SCRIPTED",
    live: true,
    chips: ["SCRIPT", "VOICEOVER"],
  },
  {
    id: "production",
    href: "/production",
    name: "PRODUCTION STUDIO",
    sub: "ANIMATION · B-ROLL",
    badge: "RENDERED",
    live: false,
  },
  {
    id: "distribution",
    href: "/distribute",
    name: "DISTRIBUTION",
    sub: "AUTO CROSS-POST",
    badge: "LIVE",
    live: false,
    chips: ["IG", "FB", "TT", "YT"],
  },
  {
    id: "engagement",
    href: "/grow",
    name: "ENGAGEMENT",
    sub: "REPLY · CAPTURE",
    badge: "CAPTURED",
    live: false,
  },
  {
    id: "analytics",
    href: "/grow/analytics",
    name: "ANALYTICS",
    sub: "Every post scored. Winning hooks feed Research.",
    badge: "LOGGED",
    live: false,
    tone: "amber",
  },
  {
    id: "monetization",
    href: "/grow",
    name: "MONETIZATION",
    sub: "No invented GMV. Shop / affiliate / booked calls.",
    badge: "BOOKED",
    live: false,
    tone: "mint",
  },
] as const;

export function Pipeline({ live }: { live: string[] }) {
  const liveSet = new Set(live);
  const liveCount = MODULES.filter((m) => liveSet.has(m.id) || (m.live && liveSet.has("content") && m.id === "content")).length
    || live.length;

  return (
    <div className="mx-auto w-full max-w-3xl">
      <p className="mb-3 text-center text-[10px] font-semibold tracking-[0.28em] text-[#9CA3AF]">
        ONE ENGINE, SEVEN MODULES
      </p>
      <div className="rounded-[28px] border border-[#E6E8EE] bg-white p-4 shadow-[0_16px_48px_rgba(11,15,43,0.08)]">
        <div className="grid grid-cols-2 gap-3">
          {MODULES.slice(0, 4).map((mod) => (
            <ModuleCard key={mod.id} mod={mod} on={liveSet.has(mod.id)} />
          ))}
        </div>
        <ModuleCard
          className="mt-3"
          mod={MODULES[4]}
          on={liveSet.has("engagement")}
        />
        <div className="mt-3 grid grid-cols-2 gap-3">
          <ModuleCard mod={MODULES[5]} on={liveSet.has("analytics")} />
          <ModuleCard mod={MODULES[6]} on={liveSet.has("monetization")} />
        </div>
        <div
          className={cn(
            "mt-3 flex items-center justify-between rounded-2xl border px-4 py-3",
            liveCount > 0
              ? "border-[#1EC98A] bg-[#F0FDF6]"
              : "border-[#E6E8EE] bg-[#F8FAFC]",
          )}
        >
          <div>
            <p className="text-[11px] font-bold tracking-[0.16em]">
              GROWTH ENGINE · {liveCount > 0 ? "PARTIAL" : "IDLE"}
            </p>
            <p className="text-[11px] text-[#6B7280]">
              Every cycle compounds — zero fake LIVE states.
            </p>
          </div>
          <p className="text-[12px] font-semibold text-[#6B7280]">—</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px]">
        <Stat k="MODULES LIVE" v={`${liveCount}/7`} />
        <Stat k="PIPELINE" v={liveCount > 0 ? "SCRIPTED" : "IDLE"} accent />
        <Stat k="REVENUE" v="—" mint />
      </div>
    </div>
  );
}

function ModuleCard({
  mod,
  on,
  className,
}: {
  mod: (typeof MODULES)[number];
  on: boolean;
  className?: string;
}) {
  const tone =
    "tone" in mod && mod.tone === "mint"
      ? "border-[#1EC98A]"
      : "tone" in mod && mod.tone === "amber"
        ? "border-[#E2B93B]"
        : "border-[#FF7A1A]";
  return (
    <Link
      href={mod.href}
      className={cn(
        "block rounded-2xl border bg-white px-4 py-3 transition hover:-translate-y-px",
        tone,
        className,
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[10px] font-bold tracking-[0.14em]">
          <span
            className={cn(
              "inline-flex h-4 w-4 items-center justify-center rounded-full",
              on ? "bg-[#1EC98A] text-white" : "bg-[#E6E8EE] text-[#9CA3AF]",
            )}
          >
            <Check size={10} strokeWidth={3} />
          </span>
          {mod.name}
        </span>
        <span className="rounded-full bg-[#F3F4F8] px-2 py-0.5 text-[9px] font-semibold tracking-wider text-[#6B7280]">
          {on ? mod.badge : "OFF"}
        </span>
      </div>
      <p className="text-[11px] leading-snug text-[#6B7280]">{mod.sub}</p>
      {"chips" in mod && mod.chips ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {mod.chips.map((c) => (
            <span
              key={c}
              className="rounded-full border border-[#E6E8EE] px-2 py-0.5 text-[9px] font-semibold tracking-wider text-[#4B5563]"
            >
              {c}
            </span>
          ))}
        </div>
      ) : null}
    </Link>
  );
}

function Stat({
  k,
  v,
  accent,
  mint,
}: {
  k: string;
  v: string;
  accent?: boolean;
  mint?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl px-3 py-2",
        mint ? "bg-[#F0FDF6]" : accent ? "bg-[#FFF7ED]" : "bg-[#F3F4F8]",
      )}
    >
      <p className="text-[9px] font-semibold tracking-[0.18em] text-[#9CA3AF]">{k}</p>
      <p className="mt-0.5 text-[15px] font-bold">{v}</p>
    </div>
  );
}
