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
    body: "SKU → Write → still → clip.",
  },
  "/commerce/products": {
    title: "Products",
    body: "Amazon is the first provider (COM-01). Paste a URL to seed a Product + script. Full normalize/score is later.",
  },
  "/commerce/campaigns": {
    title: "Campaigns",
    body: "Product lists, tags, assignment. Not a generator folder.",
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
    body: "Talent roster. Identity lock first, then workspace (stills → stage → clip). Click a face.",
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

function CharacterRoster() {
  const [rows, setRows] = useState<
    { id: string; name: string; identityUrl: string | null; thumbUrl?: string | null; stills: number; edits: number }[]
  >([]);

  useEffect(() => {
    fetch("/api/characters?lite=1")
      .then((r) => r.json())
      .then((j) => setRows((j.characters || []) as typeof rows))
      .catch(() => undefined);
  }, []);

  const ready = rows.filter((c) => c.identityUrl).length;

  return (
    <div className="mt-5 border-t border-[#E6E8EE] pt-4">
      <p className="text-[10px] font-semibold tracking-[0.16em] text-[#9CA3AF]">ROSTER</p>
      <p className="mt-1 text-[12px] text-[#6B7280]">
        {rows.length ? `${ready} locked · ${rows.length} total` : "Loading…"}
      </p>
      <div className="mt-3 space-y-1.5">
        {rows.map((c) => (
          <Link
            key={c.id}
            href={
              c.identityUrl
                ? `/create/characters/${c.id}/workspace?tool=generate-image`
                : `/create/characters/${c.id}`
            }
            className="flex items-center gap-2 rounded-lg border border-[#E6E8EE] px-2 py-1.5 hover:border-[#652DFF]/40"
          >
            {c.thumbUrl || c.identityUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumbSrc(c.thumbUrl || c.identityUrl || "", 80)}
                alt=""
                className="h-9 w-9 shrink-0 rounded-md object-cover"
              />
            ) : (
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-[#F3F4F8] text-[9px] text-[#9CA3AF]">
                —
              </span>
            )}
            <span className="min-w-0">
              <span className="block truncate text-[12px] font-semibold">{c.name}</span>
              <span className="text-[10px] text-[#9CA3AF]">
                {c.stills} stills{c.edits ? ` · ${c.edits} edits` : ""}
              </span>
            </span>
          </Link>
        ))}
      </div>
      <p className="mt-5 text-[10px] font-semibold tracking-[0.16em] text-[#9CA3AF]">NEXT</p>
      <ul className="mt-2 space-y-2">
        <li>
          <Link href="/create/characters/new" className="block rounded-lg border border-[#E6E8EE] px-2.5 py-2 hover:border-[#652DFF]/40">
            <p className="text-[12px] font-semibold">New character</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-[#6B7280]">Drop a face, lock identity, then workspace.</p>
          </Link>
        </li>
        <li>
          <Link href="/create/studio" className="block rounded-lg border border-[#E6E8EE] px-2.5 py-2 hover:border-[#652DFF]/40">
            <p className="text-[12px] font-semibold">AI Studio</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-[#6B7280]">On-model stills: lock talent + SKU, then GEN.</p>
          </Link>
        </li>
        <li>
          <Link href="/commerce/products" className="block rounded-lg border border-[#E6E8EE] px-2.5 py-2 hover:border-[#652DFF]/40">
            <p className="text-[12px] font-semibold">Products</p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-[#6B7280]">Import a SKU, then pick a character for affiliate.</p>
          </Link>
        </li>
      </ul>
    </div>
  );
}

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

function DistributePane({ path }: { path: string }) {
  const [accounts, setAccounts] = useState<
    { id: string; platform: string; accountName: string; handle?: string; hasToken: boolean }[]
  >([]);
  const [posts, setPosts] = useState<
    { id: string; accountId: string; platform: string; caption: string; status: string; approval: string; scheduledAt?: string }[]
  >([]);

  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const res = await fetch("/api/distribute/posts");
        const json = await res.json();
        if (stop) return;
        setAccounts(json.accounts || []);
        setPosts(json.posts || []);
      } catch {
        /* the page surfaces its own error */
      }
    }
    void load();
    const timer = setInterval(() => void load(), 20000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [path]);

  const needs = posts.filter((p) => p.approval !== "approved" && p.status !== "published" && p.status !== "exported").length;
  const scheduled = posts.filter((p) => p.status === "scheduled" || p.status === "draft").length;
  const failed = posts.filter((p) => p.status === "failed").length;
  const upcoming = posts.filter((p) => p.status === "scheduled" || p.status === "draft" || p.status === "failed").slice(0, 8);
  const links = [
    { href: "/distribute/calendar", label: "Calendar" },
    { href: "/distribute/queue", label: "Publish" },
    { href: "/distribute/accounts", label: "Accounts" },
  ];

  return (
    <div className="mt-5 flex flex-1 flex-col border-t border-[#E6E8EE] pt-4">
      <p className="text-[10px] font-semibold tracking-[0.16em] text-[#9CA3AF]">LOGINS</p>
      {accounts.length === 0 ? (
        <p className="mt-2 text-[12px] leading-relaxed text-[#9CA3AF]">No logins yet.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {accounts.map((a) => (
            <li key={a.id}>
              <Link href="/distribute/accounts" className="flex items-center justify-between gap-2 rounded-lg border border-[#E6E8EE] px-2.5 py-2 hover:border-[#652DFF]/40">
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-semibold">{a.handle ? `@${a.handle}` : a.accountName}</span>
                  <span className="text-[10px] text-[#9CA3AF]">{a.platform}</span>
                </span>
                <span className={a.hasToken ? "text-[10px] font-semibold text-[#15803D]" : "text-[10px] font-semibold text-[#9CA3AF]"}>
                  {a.hasToken ? "on" : "off"}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-5 text-[10px] font-semibold tracking-[0.16em] text-[#9CA3AF]">QUEUE</p>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {[
          { href: "/distribute/queue?filter=needs", n: needs, label: "Approve" },
          { href: "/distribute/queue?filter=scheduled", n: scheduled, label: "Due" },
          { href: "/distribute/queue?filter=failed", n: failed, label: "Failed" },
        ].map((item) => (
          <Link key={item.label} href={item.href} className="rounded-lg border border-[#E6E8EE] px-2 py-2 text-center hover:border-[#652DFF]/40">
            <span className="block text-[15px] font-bold">{item.n}</span>
            <span className="text-[10px] text-[#6B7280]">{item.label}</span>
          </Link>
        ))}
      </div>

      <p className="mt-5 text-[10px] font-semibold tracking-[0.16em] text-[#9CA3AF]">UP NEXT</p>
      {upcoming.length === 0 ? (
        <p className="mt-2 text-[12px] leading-relaxed text-[#9CA3AF]">Nothing scheduled.</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {upcoming.map((p) => {
            const who = accounts.find((a) => a.id === p.accountId);
            return (
              <li key={p.id}>
                <Link href={`/distribute/queue?post=${p.id}`} className="block rounded-lg border border-[#E6E8EE] px-2.5 py-2 hover:border-[#652DFF]/40">
                  <span className="block truncate text-[12px] font-semibold">
                    {who?.handle ? `@${who.handle}` : p.platform}
                    <span className="font-normal text-[#9CA3AF]"> · {p.status}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-[#6B7280]">
                    {p.scheduledAt ? `${new Date(p.scheduledAt).toLocaleString()} · ` : ""}
                    {p.caption || "No caption"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-5 text-[10px] font-semibold tracking-[0.16em] text-[#9CA3AF]">PAGES</p>
      <ul className="mt-2 space-y-1.5">
        {links.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className={`block rounded-lg border px-2.5 py-2 text-[12px] font-semibold hover:border-[#652DFF]/40 ${path === item.href ? "border-[#652DFF] bg-[#F6F3FF] text-[#3B1D9A]" : "border-[#E6E8EE]"}`}
            >
              {item.label}
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
            body: "Connected logins publish. Pinterest direct is a still. Export pack if the API cannot post.",
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
    <aside className="sticky top-0 flex h-full w-[288px] shrink-0 flex-col overflow-y-auto border-l border-[#E6E8EE] bg-white">
      <div className="flex shrink-0 items-center justify-between border-b border-[#E6E8EE] px-4 py-2.5">
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
      <div className="flex min-h-0 flex-1 flex-col px-5 py-5">
        <p className="text-[10px] font-semibold tracking-[0.16em] text-[#9CA3AF]">THIS PAGE</p>
        <h2 className="mt-2 text-[15px] font-bold tracking-tight">{hit.title}</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-[#4B5563]">{hit.body}</p>
        {path.startsWith("/distribute") ? <DistributePane path={path} /> : null}
        {path.startsWith("/intelligence/research") ? <ResearchLibrary /> : null}
        {path === "/create/characters" || path.startsWith("/create/characters/") ? <CharacterRoster /> : null}
      </div>
    </aside>
  );
}
