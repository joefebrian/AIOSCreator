"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useGpu } from "@/components/GpuStatus";
import { thumbSrc } from "@/lib/media-url";
import { RESEARCH_EVENT, type ResearchExtractRow } from "@/lib/research-flow";

const COPY: Record<string, { title: string; body: string }> = {
  "/": {
    title: "Loop",
    body: "Research → Create → Animate → Publish → Engage → Measure → Monetize → Learn. Analytics must feed the next cycle or this is only a generator.",
  },
  "/create/ugc-factory": {
    title: "UGC Factory",
    body: "Factory: product → script → still → clip → VoiceStudio VO (queues behind GPU jobs) → Calendar. Faceless VO is OpenAI /v1/audio/speech on :3900.",
  },
  "/commerce/products": {
    title: "Products",
    body: "Amazon is the first provider (COM-01). Paste a URL to seed a Product + script. Full normalize/score is later.",
  },
  "/create/studio": {
    title: "AI Studio",
    body: "SKU is the hub. Lock Product, then either lock talent (on-model) or leave faceless (pack/hands). GEN still → I2V. Empty prompt auto-writes.",
  },
  "/create/motion": {
    title: "MotionControl",
    body: "Pick the motion engine first. H3 R2V or Wan Animate 2 copy a reference clip. H3 / LTX-2 / Wan 5B / Hunyuan generate from the still. Seedance 2.5 is paid CometAPI I2V.",
  },
  "/create/characters": {
    title: "Characters",
    body: "Lock identity, then open the character workspace: stills, stage, and motion in one board. Z-Image / Qwen local, or GPT Image / Seedream if keyed.",
  },
  "/create/short-drama": {
    title: "ShortDrama",
    body: "Rail: Script → Board (framing/camera/wardrobe) → Generate still/I2V → Stitch. Cast lock from Characters. One shot at a time.",
  },
  "/intelligence/research": {
    title: "Research",
    body: "Live: image/video → prompt. Library in this pane. Trends / Opportunities / winner hooks are the rest of the loop.",
  },
  "/intelligence/trends": {
    title: "Trends",
    body: "Extract mix + operator URLs + YouTube mostPopular if an account is connected. No TikTok Research API.",
  },
  "/intelligence/opportunities": {
    title: "Opportunities",
    body: "Ranked SKUs and extract topics. Pin / exclude stay operator-owned.",
  },
  "/grow/analytics": {
    title: "Winner hooks",
    body: "Scripts + Research motion lines. Pin a winner to send it back into the loop. No invented GMV.",
  },
};

const RESEARCH_NEXT = [
  { href: "/intelligence/trends", label: "Trends", note: "Extract mix, your URLs, YouTube Data API mostPopular." },
  { href: "/intelligence/opportunities", label: "Opportunities", note: "Scored SKUs + topics. Pin and exclude." },
  { href: "/grow/analytics", label: "Winner hooks", note: "Scripts and motion lines. Pin a winner." },
];

function ResearchLibrary() {
  const [rows, setRows] = useState<ResearchExtractRow[]>([]);

  async function load() {
    const res = await fetch("/api/research");
    const json = (await res.json()) as { extracts?: ResearchExtractRow[] };
    setRows(json.extracts || []);
  }

  useEffect(() => {
    void load();
    function onEvt(e: Event) {
      const op = (e as CustomEvent<{ op?: string }>).detail?.op;
      if (op === "refresh" || !op) void load();
    }
    window.addEventListener(RESEARCH_EVENT, onEvt);
    return () => window.removeEventListener(RESEARCH_EVENT, onEvt);
  }, []);

  async function remove(id: string) {
    await fetch("/api/research", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    await load();
  }

  return (
    <div className="mt-5 border-t border-[#E6E8EE] pt-4">
      <p className="text-[10px] font-semibold tracking-[0.16em] text-[#9CA3AF]">PROMPT LIBRARY</p>
      {rows.length === 0 ? (
        <p className="mt-2 text-[12px] leading-relaxed text-[#9CA3AF]">Empty. Drop a still or Fetch URL on the canvas.</p>
      ) : (
        <div className="mt-2 space-y-2">
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() =>
                window.dispatchEvent(new CustomEvent(RESEARCH_EVENT, { detail: { op: "open", row } }))
              }
              className="w-full overflow-hidden rounded-lg border border-[#E6E8EE] bg-[#F8F8FB] text-left hover:border-[#652DFF]/40"
            >
              <div className="aspect-[16/9] bg-[#EEF0F4]">
                {row.kind === "video" ? (
                  <video src={row.url} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbSrc(row.url, 320)} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="p-2">
                <p className="line-clamp-3 text-[11px] leading-relaxed text-[#4B5563]">{row.megaPrompt || row.imagePrompt || row.note || "—"}</p>
                <div className="mt-1 flex items-center justify-between text-[10px] text-[#9CA3AF]">
                  <span>
                    {row.kind}
                    {row.windowSec ? ` · ${Math.round(row.windowSec)}s` : row.trimmed ? " · trim" : ""}
                  </span>
                  <span
                    role="button"
                    tabIndex={0}
                    className="font-semibold text-red-500 hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      void remove(row.id);
                    }}
                  >
                    Delete
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <p className="mt-5 text-[10px] font-semibold tracking-[0.16em] text-[#9CA3AF]">NEXT IN RESEARCH</p>
      <ul className="mt-2 space-y-2">
        {RESEARCH_NEXT.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="block rounded-lg border border-[#E6E8EE] px-2.5 py-2 hover:border-[#652DFF]/40">
              <p className="text-[12px] font-semibold">{item.label}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-[#6B7280]">{item.note}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Inspector() {
  const path = usePathname();
  const gpu = useGpu();
  const hit =
    COPY[path] ??
    (path.startsWith("/intelligence")
      ? {
          title: "Intelligence",
          body: "What should we create now? Ranked opportunities. Winning hooks feed back here.",
        }
      : path.startsWith("/distribute")
        ? {
            title: "Distribute",
            body: "Official connectors only. YouTube first. Export pack if APIs block.",
          }
        : path.startsWith("/grow")
          ? {
              title: "Grow",
              body: "Measure then mutate one variable. No invented revenue.",
            }
          : path.startsWith("/system")
            ? {
                title: "System",
                body: "Settings = LLM keys. Models = which image/motion engine GEN uses. ComfyUI is the GPU runtime, not a chat key.",
              }
            : {
                title: "Context",
                body: "Research → Create → Publish. This pane is live context, not chrome.",
              });

  return (
    <aside className="sticky top-[49px] flex h-[calc(100vh-49px)] w-[288px] shrink-0 flex-col overflow-y-auto border-l border-[#E6E8EE] bg-white">
      <div className="flex items-center justify-between border-b border-[#E6E8EE] px-4 py-2.5">
        <span className="text-[10px] font-semibold tracking-[0.16em] text-[#9CA3AF]">STATUS</span>
        <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#6B7280]">
          <span
            className={
              gpu.online === null ? "h-1.5 w-1.5 rounded-full bg-[#D1D5DB]" : gpu.online ? "h-1.5 w-1.5 rounded-full bg-[#1EC98A]" : "h-1.5 w-1.5 rounded-full bg-[#EF4444]"
            }
          />
          {gpu.busy ? `Busy · ${gpu.label}` : gpu.online ? "GPU ready" : gpu.online === false ? "GPU off" : "GPU"}
        </span>
      </div>
      <div className="px-5 py-5">
        <p className="text-[10px] font-semibold tracking-[0.16em] text-[#9CA3AF]">THIS PAGE</p>
        <h2 className="mt-2 text-[15px] font-bold tracking-tight">{hit.title}</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-[#4B5563]">{hit.body}</p>
        {path.startsWith("/intelligence/research") ? <ResearchLibrary /> : null}
      </div>
    </aside>
  );
}
