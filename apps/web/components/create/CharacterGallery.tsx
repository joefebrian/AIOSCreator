"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { Character } from "@/lib/character-types";
import { isProductMediaUrl } from "@/lib/media-kind";
import { originalSrc, thumbSrc } from "@/lib/media-url";

export type GalleryJob = {
  id: string;
  kind?: string;
  status?: string;
  mediaUrl?: string;
  model?: string;
  provider?: string;
  input?: string;
  createdAt?: string;
  upscaled?: boolean;
  characterId?: string;
};

export type GalleryItem = {
  id: string;
  kind: "image" | "video";
  url: string;
  url4k?: string;
  label: string;
  prompt: string;
  model?: string;
  modelName?: string;
  provider?: string;
  createdAt?: string;
  slot?: string;
  upscaled: boolean;
};

type Board = "generation" | "inspiration";
type Tab = "image" | "video" | "4k-image" | "4k-video";

const TABS: { id: Tab; label: string }[] = [
  { id: "image", label: "Image" },
  { id: "video", label: "Video" },
  { id: "4k-image", label: "4K Image" },
  { id: "4k-video", label: "4K Video" },
];

function jobPrompt(input?: string) {
  if (!input) return "";
  return input.split(" | ")[0]?.trim() || input;
}

function engineKey(model?: string) {
  return (model || "").replace(/-(ref|body)$/i, "");
}

function displayModel(model: string | undefined, engineNames: Record<string, string>) {
  const id = engineKey(model);
  return (id && engineNames[id]) || model;
}

export function CharacterGallery({
  character,
  jobs,
  engineNames,
  busy,
  gpuBusy,
  onUpscale,
  onUpscaleVideo,
  onDeleteMedia,
  onToggleInspiration,
  onUseAsReference,
  referenceLabel = "Use as ref",
  referenceAlways = false,
  focusKind,
  sharedInspiration,
}: {
  character: Character;
  jobs: GalleryJob[];
  engineNames: Record<string, string>;
  busy: string;
  gpuBusy: boolean;
  onUpscale: (slot: string) => void;
  onUpscaleVideo?: (mediaUrl: string) => void;
  onDeleteMedia?: (url: string, item: GalleryItem) => void;
  onToggleInspiration?: (item: GalleryItem) => void;
  onUseAsReference?: (item: GalleryItem) => void;
  referenceLabel?: string;
  referenceAlways?: boolean;
  focusKind?: "image" | "video";
  sharedInspiration?: Character["inspiration"];
}) {
  const [board, setBoard] = useState<Board>("generation");
  const [tab, setTab] = useState<Tab>(focusKind === "video" ? "video" : "image");
  useEffect(() => {
    if (focusKind === "video") setTab("video");
    if (focusKind === "image") setTab("image");
  }, [focusKind]);
  const [preview, setPreview] = useState<GalleryItem | null>(null);
  const [copied, setCopied] = useState(false);

  const pins = sharedInspiration ?? character.inspiration ?? [];
  const pinnedUrls = useMemo(() => new Set(pins.map((p) => p.url)), [pins]);
  const generated = useMemo(() => buildItems(character, jobs, engineNames), [character, jobs, engineNames]);
  const inspired = useMemo(
    () =>
      pins.map((p) => ({
        id: `insp-${p.url}`,
        kind: p.kind,
        url: p.url,
        label: p.label || "Inspiration",
        prompt: "",
        createdAt: p.addedAt,
        upscaled: false,
      })) satisfies GalleryItem[],
    [pins],
  );
  const items = board === "inspiration" ? inspired : generated;
  const visible = board === "inspiration" ? items : items.filter((item) => inTab(item, tab));
  const counts = {
    image: items.filter((i) => inTab(i, "image")).length,
    video: items.filter((i) => inTab(i, "video")).length,
    "4k-image": items.filter((i) => inTab(i, "4k-image")).length,
    "4k-video": items.filter((i) => inTab(i, "4k-video")).length,
  };

  useEffect(() => {
    if (!preview) return;
    setCopied(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [preview]);

  async function copyPrompt() {
    const text = preview?.prompt?.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  const empty = visible.length === 0;

  return (
    <div className="border-t border-[#E5E7EB] px-4 py-5">
      <div className="flex items-end justify-center gap-4 text-[13px] font-semibold">
        <button
          type="button"
          onClick={() => setBoard("generation")}
          className={board === "generation" ? "border-b-2 border-[#111827] pb-1" : "pb-1 text-[#9CA3AF]"}
        >
          Generation
        </button>
        <button
          type="button"
          onClick={() => setBoard("inspiration")}
          className={board === "inspiration" ? "border-b-2 border-[#111827] pb-1" : "pb-1 text-[#9CA3AF]"}
        >
          Inspiration {pins.length ? pins.length : ""}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-1.5 text-[11px]">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-full px-2.5 py-0.5 font-semibold",
              tab === t.id ? "bg-[#111827] text-white" : "bg-[#F3F4F8] text-[#6B7280]",
            )}
          >
            {t.label} {counts[t.id]}
          </button>
        ))}
      </div>

      {empty ? (
        <p className="mt-6 text-center text-[13px] text-[#9CA3AF]">
          {board === "inspiration"
            ? "Pin a generation to this board. Pose and lighting only — not a second identity."
            : items.length === 0
              ? "It looks like this model is new for you. Let’s try it out!"
              : tab.startsWith("4k")
                ? "No 4K file for this character yet."
                : "Nothing in this tab yet."}
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {visible.map((item) => {
            const show4k = tab.startsWith("4k");
            const file = show4k ? item.url4k || item.url : item.url;
            const src = item.kind === "video" ? file : thumbSrc(file, 400);
            const neverUpscaled = !has4k(item);
            const upscaling = busy === `upscale-${item.slot}` || busy === `upscale-${item.id}`;
            return (
              <div
                key={`${item.id}-${tab}`}
                className="group relative cursor-pointer overflow-hidden rounded-xl bg-[#F3F4F8] text-left"
                onClick={() => setPreview(item)}
              >
                {item.kind === "video" ? (
                  <video src={src} className="aspect-[3/4] w-full object-cover" muted playsInline preload="metadata" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={src} alt={item.label} loading="lazy" decoding="async" className="aspect-[3/4] w-full object-cover" />
                )}
                <div className="absolute right-1.5 top-1.5 z-10 flex flex-row-reverse gap-1">
                  {onToggleInspiration ? (
                    <IconBtn
                      title={pinnedUrls.has(item.url) ? "Remove from Inspiration" : "Add to Inspiration"}
                      onClick={() => onToggleInspiration(item)}
                    >
                      <PinGlyph filled={pinnedUrls.has(item.url)} />
                    </IconBtn>
                  ) : null}
                  {onDeleteMedia && board === "generation" ? (
                    <IconBtn
                      title="Delete"
                      onClick={() => onDeleteMedia(item.url, item)}
                    >
                      <TrashGlyph />
                    </IconBtn>
                  ) : null}
                  {neverUpscaled ? (
                    <IconBtn
                      title="Upscale to 4K"
                      disabled={gpuBusy || upscaling}
                      onClick={() => {
                        if (item.kind === "video") onUpscaleVideo?.(item.url);
                        else if (item.slot) onUpscale(item.slot);
                      }}
                    >
                      {upscaling ? "…" : <FourKGlyph />}
                    </IconBtn>
                  ) : null}
                  <a
                    href={originalSrc(file, true)}
                    download
                    title="Download original"
                    onClick={(e) => e.stopPropagation()}
                    className={iconClass()}
                  >
                    <DownloadGlyph />
                  </a>
                </div>
                {onUseAsReference && item.kind === "image" ? (
                  <button
                    type="button"
                    title={referenceAlways ? "Use this still as the video first frame" : "Pose and lighting only. Face stays this character."}
                    className={cn(
                      "absolute bottom-1.5 left-1.5 z-10 rounded-md bg-black/75 px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-black",
                      referenceAlways || board === "inspiration" ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      onUseAsReference(item);
                    }}
                  >
                    {referenceLabel}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {preview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onClick={() => setPreview(null)}>
          <div
            className="max-h-[92vh] w-full max-w-[min(1400px,96vw)] overflow-auto rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="grid gap-0 md:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)]">
              <div className="bg-[#111827]">
                {preview.kind === "video" ? (
                  <video src={originalSrc(tabFile(preview, tab))} className="max-h-[80vh] w-full object-contain" controls autoPlay />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={originalSrc(tabFile(preview, tab))} alt={preview.label} className="max-h-[80vh] w-full object-contain" />
                )}
              </div>
              <div className="p-4 text-[13px]">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-[15px] font-semibold text-[#111827]">{preview.label}</h3>
                  <button type="button" className="text-[12px] text-[#6B7280]" onClick={() => setPreview(null)}>
                    Close
                  </button>
                </div>
                <dl className="mt-3 space-y-2 text-[12px]">
                  <Row k="Type" v={preview.kind === "video" ? "Video" : "Image"} />
                  <Row k="Character" v={character.name} />
                  <Row k="Model" v={preview.modelName || preview.model || "—"} />
                  {preview.model && preview.modelName ? <Row k="Engine id" v={preview.model} /> : null}
                  <Row k="Provider" v={preview.provider || "—"} />
                  <Row k="Created" v={preview.createdAt ? new Date(preview.createdAt).toLocaleString() : "—"} />
                  <Row k="File" v={tabFile(preview, tab)} />
                  <Row k="4K" v={has4k(preview) ? "Yes" : "No"} />
                </dl>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6B7280]">Prompt</p>
                  <button
                    type="button"
                    disabled={!preview.prompt?.trim()}
                    onClick={() => void copyPrompt()}
                    className="text-[11px] font-semibold text-[#E11D48] disabled:text-[#D1D5DB]"
                  >
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <p className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-[#F3F4F8] p-2 text-[12px] leading-5 text-[#111827]">
                  {preview.prompt || "—"}
                </p>
                <div className="mt-4 flex flex-row-reverse justify-end gap-1">
                  {onUseAsReference && preview.kind === "image" ? (
                    <IconBtn
                      title={referenceAlways ? "Use this still as the video first frame" : "Pose and lighting only. Face stays this character."}
                      onClick={() => onUseAsReference(preview)}
                    >
                      <span className="px-0.5 text-[9px] font-bold">{referenceAlways ? "ADD" : "REF"}</span>
                    </IconBtn>
                  ) : null}
                  {onToggleInspiration ? (
                    <IconBtn
                      title={pinnedUrls.has(preview.url) ? "Remove from Inspiration" : "Add to Inspiration"}
                      onClick={() => onToggleInspiration(preview)}
                    >
                      <PinGlyph filled={pinnedUrls.has(preview.url)} />
                    </IconBtn>
                  ) : null}
                  {onDeleteMedia && board === "generation" ? (
                    <IconBtn
                      title="Delete"
                      onClick={() => {
                        onDeleteMedia(preview.url, preview);
                        setPreview(null);
                      }}
                    >
                      <TrashGlyph />
                    </IconBtn>
                  ) : null}
                  {!has4k(preview) ? (
                    <IconBtn
                      title="Upscale to 4K"
                      disabled={gpuBusy}
                      onClick={() => {
                        if (preview.kind === "video") onUpscaleVideo?.(preview.url);
                        else if (preview.slot) onUpscale(preview.slot);
                      }}
                    >
                      <FourKGlyph />
                    </IconBtn>
                  ) : null}
                  <a href={originalSrc(tabFile(preview, tab), true)} download title="Download original" className={iconClass()}>
                    <DownloadGlyph />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function has4k(item: GalleryItem) {
  if (item.kind === "image") return Boolean(item.url4k);
  return Boolean(item.upscaled);
}

function inTab(item: GalleryItem, tab: Tab) {
  if (tab === "image") return item.kind === "image" && !item.url4k;
  if (tab === "video") return item.kind === "video" && !item.upscaled;
  if (tab === "4k-image") return item.kind === "image" && Boolean(item.url4k);
  return item.kind === "video" && Boolean(item.upscaled);
}

function tabFile(item: GalleryItem, tab: Tab) {
  if (tab === "4k-image" && item.url4k) return item.url4k;
  return item.url;
}

function iconClass() {
  return "flex h-7 w-7 items-center justify-center rounded-md bg-black/70 text-white hover:bg-black";
}

function IconBtn({
  title,
  disabled,
  onClick,
  children,
}: {
  title: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onClick();
      }}
      className={cn(iconClass(), disabled ? "cursor-default opacity-40" : "")}
    >
      {children}
    </button>
  );
}

function TrashGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 7h16M9 7V5h6v2m-8 0 1 14h8l1-14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DownloadGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PinGlyph({ filled }: { filled: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M7 3h10v18l-5-3.2L7 21V3z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FourKGlyph() {
  return (
    <svg width="16" height="10" viewBox="0 0 32 20" aria-hidden>
      <text x="0" y="16" fill="currentColor" fontSize="16" fontWeight="800" fontFamily="ui-sans-serif, system-ui">
        4K
      </text>
    </svg>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9CA3AF]">{k}</dt>
      <dd className="break-all text-[#111827]">{v}</dd>
    </div>
  );
}

function buildItems(character: Character, jobs: GalleryJob[], engineNames: Record<string, string>): GalleryItem[] {
  const byId = new Map(jobs.map((j) => [j.id, j]));
  const byUrl = new Map(jobs.filter((j) => j.mediaUrl).map((j) => [j.mediaUrl as string, j]));
  const out: GalleryItem[] = [];

  const pushImage = (opts: {
    id: string;
    url: string;
    url4k?: string | null;
    label: string;
    prompt?: string;
    jobId?: string;
    slot?: string;
    upscaled?: boolean;
    createdAt?: string;
    model?: string;
    provider?: string;
  }) => {
    if (!opts.url || isProductMediaUrl(opts.url)) return;
    const job = (opts.jobId && byId.get(opts.jobId)) || byUrl.get(opts.url);
    const model = opts.model || job?.model;
    out.push({
      id: opts.id,
      kind: "image",
      url: opts.url,
      url4k: opts.url4k || undefined,
      label: opts.label,
      prompt: opts.prompt || jobPrompt(job?.input) || "",
      model,
      modelName: displayModel(model, engineNames),
      provider: opts.provider || job?.provider,
      createdAt: job?.createdAt || opts.createdAt || character.updatedAt,
      slot: opts.slot,
      upscaled: Boolean(opts.url4k),
    });
  };

  if (character.identityUrl) {
    pushImage({
      id: "identity",
      url: character.identityUrl,
      url4k: character.identityUrl4k,
      label: "Identity",
      prompt: character.sourcePrompt,
      jobId: character.identityJobId,
      slot: "identity",
      upscaled: character.identityUpscaled,
      createdAt: character.createdAt,
    });
  }
  for (const s of character.slots) {
    if (!s.url) continue;
    pushImage({
      id: `slot-${s.key}`,
      url: s.url,
      url4k: s.url4k,
      label: s.key === "sheet" ? "Sheet" : s.label,
      prompt: s.prompt,
      jobId: s.jobId,
      slot: s.key,
      upscaled: s.upscaled,
    });
  }
  for (const e of character.edits ?? []) {
    if (!e.url) continue;
    pushImage({
      id: `edit-${e.id}`,
      url: e.url,
      url4k: e.url4k,
      label: e.mode === "product" ? "On-model" : e.mode === "face-swap" ? "Pose lock" : e.mode === "chat" ? "Generate" : e.mode,
      prompt: e.prompt,
      jobId: e.jobId,
      slot: e.id,
      upscaled: e.upscaled,
      model: e.model,
      provider: e.provider,
      createdAt: e.createdAt,
    });
  }

  const used = new Set(out.map((i) => i.url));
  for (const job of jobs) {
    if (job.status && job.status !== "completed") continue;
    if (!job.mediaUrl) continue;
    if (isProductMediaUrl(job.mediaUrl)) continue;
    if (used.has(job.mediaUrl)) continue;
    const isVideo = job.kind === "motion" || /\.mp4($|\?)/i.test(job.mediaUrl);
    if (!isVideo && job.kind !== "motion") continue;
    out.push({
      id: job.id,
      kind: "video",
      url: job.mediaUrl,
      label: "Video",
      prompt: jobPrompt(job.input),
      model: job.model,
      modelName: displayModel(job.model, engineNames),
      provider: job.provider,
      createdAt: job.createdAt,
      upscaled: Boolean(job.upscaled),
    });
    used.add(job.mediaUrl);
  }

  out.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return out;
}
