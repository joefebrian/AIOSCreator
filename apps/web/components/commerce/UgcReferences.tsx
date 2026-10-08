"use client";

import { useEffect, useRef, useState } from "react";
import { Btn, inputClass } from "@/components/ui";
import { canAcquirePost, embedPreviewUrl, referenceIdentity } from "@/lib/ugc-reference-preview";

type ReferenceRelation = "SAME_PRODUCT" | "SAME_CATEGORY" | "STYLE_ONLY" | null;
type ReferenceStatus = "link_saved" | "media_saved" | "analyzing" | "analyzed" | "unavailable" | "failed";
type ImportStatus = "queued" | "resolving" | "downloading" | "processing" | "ready" | "failed";

type Analysis = {
  version: number | null;
  reviewed: boolean;
  unknown: string[];
  reason: string | null;
  audio: string;
  transcriptStatus?: string;
  transcript?: { startSec: number; endSec: number; text: string; observed: boolean }[];
  beats?: { startSec: number | null; endSec: number | null; purpose: string; productAction: string | null; observed: boolean }[];
  hook: { text: string; observed: boolean } | null;
  framing?: { text: string; observed: boolean } | null;
  cuts?: { text: string; observed: boolean } | null;
  cta?: { text: string; observed: boolean } | null;
  candidateFacts?: { statement: string; startSec: number | null; endSec: number | null; source: string; reviewStatus: string; factId?: string | null }[];
  pattern?: { hook: string | null; beats: string[]; demo: string | null; objections: string[]; proof: string | null; cta: string | null; pacing: string | null };
  coverage?: "full" | "partial";
  failures?: string[];
  providers?: { speech: string | null; shots: string | null; vision?: string | null };
};

type SavedScript = {
  id: string;
  referenceId: string;
  analysisVersion: number;
  transcriptStatus: string;
  transcript: { startSec: number; endSec: number; text: string }[];
  pattern: { hook: string | null; beats: string[]; demo: string | null; objections: string[]; proof: string | null; cta: string | null; pacing: string | null };
  creator: string | null;
};

export type UgcReferenceRow = {
  id: string;
  creator: string | null;
  publishedAt: string | null;
  url: string | null;
  postId: string | null;
  platform: string;
  dedupeKey?: string;
  relation: ReferenceRelation;
  relationBasis?: string | null;
  status: ReferenceStatus;
  failure: string | null;
  mediaUrl: string | null;
  posterUrl?: string | null;
  durationSec?: number | null;
  width?: number | null;
  height?: number | null;
  hasAudio?: boolean | null;
  assetId?: string | null;
  market?: string | null;
  locale?: string | null;
  source: string;
  analysis: Analysis | null;
};

type ImportJob = {
  id: string;
  dedupeKey: string;
  sourceUrl: string;
  platform: string;
  postId: string | null;
  creator: string | null;
  publishedAt: string | null;
  status: ImportStatus;
  progress: number | null;
  error: string | null;
  assetId: string | null;
};

type ImportAsset = {
  id: string;
  dedupeKey: string;
  mediaUrl: string;
  posterUrl: string | null;
  durationSec: number;
  width: number;
  height: number;
  hasAudio: boolean;
  provider: string;
  sourceUrl: string;
  platform: string;
  postId: string | null;
  creator: string | null;
  publishedAt: string | null;
};

type MatchPost = { creationDate?: string; type?: string; url?: string; creatorName?: string };
type Matches = { windowStart?: string; windowEnd?: string; suggestedTemplateId?: string; counts?: Record<string, number>; posts?: MatchPost[] };
type ProductionPin = { id: string; revision: number; market: string; locale: string; planApprovedAt?: string | null };
type BlueprintBeat = { id: string; role: string; startSec: number | null; endSec: number | null; evidence: string | null; uncertainty: string | null };
type BlueprintShot = { id: string; beatId: string | null; startSec: number; endSec: number; framing: string | null; action: string | null; onScreen: string | null; audio: string; uncertainty: string | null };
type BlueprintRow = { id: string; referenceId: string; analysisVersion: number; version: number; beats: BlueprintBeat[]; shots: BlueprintShot[] };
type RecreationShot = {
  id: string;
  shotId: string | null;
  beatRole: string | null;
  spoken: string | null;
  onScreen: string | null;
  action: string;
  stateIn: string;
  stateOut: string;
  sourceStartSec: number | null;
  sourceEndSec: number | null;
  estimatedSec: number | null;
  timing: string | null;
  framing: string | null;
  performance: string | null;
  audioMode: string | null;
  continuity: string | null;
  renderNote: string | null;
  uncertainty: string | null;
};
type RecreationRow = {
  productionId: string;
  revision: number;
  market: string;
  locale: string;
  model: string | null;
  approved: boolean;
  href: string;
  referenceId: string;
  analysisVersion: number;
  blueprintVersion: number | null;
  shots: RecreationShot[];
};
type Preview = { kind: "embed"; url: string; embedUrl: string } | { kind: "import"; jobId: string } | { kind: "saved"; referenceId: string };

const MARKETS = [
  { id: "ID", locales: ["id-ID"] },
  { id: "MY", locales: ["ms-MY", "en-MY"] },
  { id: "SG", locales: ["en-SG"] },
  { id: "TH", locales: ["th-TH"] },
  { id: "US", locales: ["en-US"] },
];

function stageLabel(row: UgcReferenceRow, importing: boolean) {
  if (importing) return "Importing";
  if (row.status === "analyzing") return "Analyzing";
  if (row.status === "failed") return "Failed";
  if (row.status === "link_saved" || !row.mediaUrl) return row.status === "link_saved" ? "Link saved" : "Not analyzed";
  if (!row.analysis || row.status === "media_saved") return "Not analyzed";
  if (row.analysis.coverage === "partial" || row.status === "unavailable") return "Partial";
  if (row.status === "analyzed") return "Analyzed";
  return "Not analyzed";
}

function relationLabel(relation: ReferenceRelation) {
  if (relation === "SAME_PRODUCT") return "Same product";
  if (relation === "SAME_CATEGORY") return "Same category";
  if (relation === "STYLE_ONLY") return "Style reference";
  return "Unreviewed";
}

function clock(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return "";
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function shownDate(value: string | null | undefined) {
  return value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : "";
}

function platformLabel(type: string | undefined, platform: string | undefined) {
  const value = `${type || ""} ${platform || ""}`.toLowerCase();
  if (value.includes("instagram") || value.includes("ig_")) return "Instagram";
  if (value.includes("facebook") || value.includes("fb.watch") || value.includes("fb_")) return "Facebook";
  if (value.includes("tiktok")) return "TikTok";
  if (platform && platform !== "link") return platform;
  return type || "Unknown platform";
}

function storedSrc(url: string | null | undefined) {
  return url && url.startsWith("/api/media/ugc-references/") ? url : "";
}

function importLabel(job: ImportJob | undefined) {
  if (!job) return "Download & Preview";
  if (job.status === "ready") return "Preview";
  if (job.status === "failed") return "Download & Preview";
  if (job.status === "downloading" && job.progress != null) return `Downloading ${job.progress}%`;
  if (job.status === "queued") return "Queued";
  if (job.status === "resolving") return "Resolving";
  if (job.status === "downloading") return "Downloading";
  return "Processing";
}

function Poster({ src }: { src: string }) {
  if (!src) return <span className="grid h-16 w-12 shrink-0 place-items-center rounded-md bg-[#E5E7EB] px-1 text-center text-[9px] leading-tight text-[#6B7280]">No poster</span>;
  return <img src={src} alt="" className="h-16 w-12 shrink-0 rounded-md object-cover" />;
}

function ShotReview({
  shot,
  drafts,
  edits,
  speech,
  onEdit,
}: {
  shot: BlueprintShot;
  drafts: RecreationRow[];
  edits: Record<string, string>;
  speech: { startSec: number; endSec: number; text: string }[];
  onEdit: (key: string, value: string) => void;
}) {
  return (
    <div className="mt-2 border-t border-[#E6E8EE] pt-2">
      <p className="font-semibold">{shot.id}</p>
      <p>Source {clock(shot.startSec)}–{clock(shot.endSec)}. These times stay the source times.</p>
      <p>Framing · {shot.framing || "Not observed."}</p>
      <p>Visible action · {shot.action || "Not observed in the source."}</p>
      <p>On-screen text · {shot.onScreen || "Not observed."}</p>
      {speech.length ? speech.map((line) => <p key={`${line.startSec}-${line.text}`}>Source speech {clock(line.startSec)}–{clock(line.endSec)} · {line.text}</p>) : <p>Source speech · none in this cut.</p>}
      <p>Source audio · {shot.audio}</p>
      {shot.uncertainty ? <p className="text-[#B45309]">{shot.uncertainty}</p> : null}
      <label className="mt-1 block text-[#6B7280]">Action correction
        <textarea className={inputClass + " mt-1"} aria-label={`${shot.id} action`} value={edits[`action:${shot.id}`] ?? shot.action ?? ""} onChange={(event) => onEdit(`action:${shot.id}`, event.target.value)} />
      </label>
      {drafts.map((draft) => {
        const line = draft.shots.find((item) => item.shotId === shot.id);
        if (!line) return <p key={draft.productionId} className="mt-1 text-[#6B7280]">{draft.market} · No localized line for this shot.</p>;
        return (
          <div key={draft.productionId} className="mt-2">
            <p className="font-semibold">{draft.market} {draft.locale} · {draft.model || "no model"}</p>
            <p>Localized spoken line · {line.spoken || "No localized line was kept."}</p>
            <p>Localized on-screen · {line.onScreen || "No localized on-screen line was kept."}</p>
            <p>Local duration · {line.estimatedSec == null ? "unknown" : `${line.estimatedSec}s`}, estimated until a voice recording exists.</p>
            <p>Camera · {line.framing || shot.framing || "Not observed."}</p>
            <p>Action · {line.action || "Not observed in the source."}</p>
            <p>State · {line.stateIn} → {line.stateOut}</p>
            <p>Continuity · {line.continuity || "Not observed."}</p>
            <p>Performance · {line.performance || "Not observed."}</p>
            <p>Audio mode · {line.audioMode || "Not set."}</p>
            <p>Render · {line.renderNote || "Do not render until Generate is clicked on the approved plan."}</p>
            <p>Recreation creator · not selected. Voice · not selected. Product SKU stays the draft SKU.</p>
            {line.uncertainty ? <p className="text-[#B45309]">{line.uncertainty}</p> : null}
          </div>
        );
      })}
    </div>
  );
}

export function UgcReferences({
  productId,
  skuId,
  mode,
  instagramUsername,
  matches,
  productions,
  suggestedMarket,
  suggestedLocale,
  compose,
  openReferences,
  onViewAll,
  onAdd,
  onChanged,
}: {
  productId: string;
  skuId: string;
  mode: "overview" | "manage";
  instagramUsername?: string;
  matches?: Matches | null;
  productions: ProductionPin[];
  suggestedMarket?: string;
  suggestedLocale?: string;
  compose?: boolean;
  openReferences?: boolean;
  onViewAll?: () => void;
  onAdd?: () => void;
  onChanged?: () => void;
}) {
  const [rows, setRows] = useState<UgcReferenceRow[] | null>(null);
  const [imports, setImports] = useState<{ jobs: ImportJob[]; assets: ImportAsset[] }>({ jobs: [], assets: [] });
  const [scripts, setScripts] = useState<SavedScript[]>([]);
  const [blueprints, setBlueprints] = useState<BlueprintRow[]>([]);
  const [recreations, setRecreations] = useState<RecreationRow[]>([]);
  const [blueprintEdits, setBlueprintEdits] = useState<Record<string, string>>({});
  const [factEdits, setFactEdits] = useState<Record<string, string>>({});
  const [factoryHref, setFactoryHref] = useState("");
  const [relationBasis, setRelationBasis] = useState("");
  const [marketLocales, setMarketLocales] = useState<Record<string, string>>({ ID: "id-ID" });
  const [workspaceTab, setWorkspaceTab] = useState<"overview" | "script" | "scenes" | "facts" | "review">("overview");
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const openerIdRef = useRef<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [url, setUrl] = useState("");
  const [creator, setCreator] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [market, setMarket] = useState("");
  const [locale, setLocale] = useState("");
  const [pendingSame, setPendingSame] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [playbackFailed, setPlaybackFailed] = useState(false);
  const [draftRelation, setDraftRelation] = useState("");
  const [draftConfirmed, setDraftConfirmed] = useState(false);
  const [addedId, setAddedId] = useState("");
  const [productionId, setProductionId] = useState(productions[0]?.id || "");
  const [armPreview, setArmPreview] = useState<{ dedupeKey: string; referenceId: string } | null>(null);
  const saved = rows || [];
  const locales = MARKETS.find((row) => row.id === market)?.locales || [];
  const pendingImport = imports.jobs.some((job) => job.status !== "ready" && job.status !== "failed");

  const discovered = (matches?.posts || []).map((post, index) => {
    const raw = post.url || "";
    const http = raw.startsWith("https://") || raw.startsWith("http://") ? raw : "";
    let identity: ReturnType<typeof referenceIdentity> | null = null;
    try {
      if (http) identity = referenceIdentity(http);
    } catch {
      identity = null;
    }
    const dedupeKey = identity?.dedupeKey || "";
    const job = dedupeKey ? imports.jobs.find((row) => row.dedupeKey === dedupeKey) : undefined;
    const asset = job?.assetId ? imports.assets.find((row) => row.id === job.assetId) : undefined;
    return {
      index,
      url: http,
      identity,
      downloadable: Boolean(http && canAcquirePost(http)),
      embedUrl: http ? embedPreviewUrl(http) : null,
      job,
      asset,
      creator: (post.creatorName || "").trim(),
      type: post.type || "",
      date: shownDate(post.creationDate),
    };
  });

  async function load() {
    const res = await fetch(`/api/commerce/ugc-references?productId=${encodeURIComponent(productId)}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Could not load references");
    setRows(json.references || []);
    setImports(json.imports || { jobs: [], assets: [] });
    setScripts(json.scripts || []);
    setBlueprints(json.blueprints || []);
    setRecreations(json.recreations || []);
  }

  useEffect(() => {
    let cancel = false;
    setRows(null);
    setError("");
    void load().catch((err) => {
      if (!cancel) setError(err instanceof Error ? err.message : String(err));
    });
    return () => {
      cancel = true;
    };
  }, [productId]);

  useEffect(() => {
    if (!pendingImport) return;
    const timer = setInterval(() => {
      void load().catch((err) => setError(err instanceof Error ? err.message : String(err)));
    }, 1200);
    return () => clearInterval(timer);
  }, [pendingImport, productId]);

  useEffect(() => {
    if (mode !== "manage" || !openReferences) return;
    document.querySelector("[data-ugc-references]")?.scrollIntoView({ block: "start" });
  }, [mode, openReferences, rows]);

  useEffect(() => {
    if (!productions.some((row) => row.id === productionId)) setProductionId(productions[0]?.id || "");
  }, [productions, productionId]);

  useEffect(() => {
    if (!suggestedMarket) return;
    setMarket((current) => current || suggestedMarket);
    setLocale((current) => current || suggestedLocale || "");
  }, [suggestedMarket, suggestedLocale]);

  useEffect(() => {
    if (!armPreview) return;
    const job = imports.jobs.find((row) => row.dedupeKey === armPreview.dedupeKey);
    if (!job || job.status === "failed") return;
    const asset = job.assetId ? imports.assets.find((row) => row.id === job.assetId) : undefined;
    const savedRow = saved.find((row) => row.id === armPreview.referenceId && storedSrc(row.mediaUrl))
      || saved.find((row) => row.dedupeKey === armPreview.dedupeKey && storedSrc(row.mediaUrl));
    if (job.status === "ready" && (savedRow || (asset && storedSrc(asset.mediaUrl)))) {
      setPlaybackFailed(false);
      setPreview(savedRow ? { kind: "saved", referenceId: savedRow.id } : { kind: "import", jobId: job.id });
      setArmPreview(null);
    }
  }, [armPreview, imports, saved]);

  function focusOpener() {
    const id = openerIdRef.current;
    const node = id
      ? document.querySelector<HTMLElement>(`[data-open-reference="${id}"]`)
      : document.querySelector<HTMLElement>("[data-open-reference]");
    if (node) node.focus({ preventScroll: true });
  }

  function closeWorkspace() {
    focusOpener();
    setPreview(null);
    window.requestAnimationFrame(() => {
      focusOpener();
      window.setTimeout(focusOpener, 50);
    });
  }

  useEffect(() => {
    if (!preview) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.dataset.openReference) {
      openerRef.current = active;
      openerIdRef.current = active.dataset.openReference;
    }
    const dialog = dialogRef.current;
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea") || []).filter((node) => !node.hasAttribute("disabled"));
    focusable()[0]?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeWorkspace();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey, true);
    };
  }, [preview]);

  async function post(body: Record<string, unknown>, key: string) {
    setBusy(key);
    setError("");
    try {
      const res = await fetch("/api/commerce/ugc-references", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, skuId, ...body }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Request failed");
      await load();
      return json;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setBusy("");
    }
  }

  async function upload(file: File, referenceId?: string) {
    setBusy(referenceId ? `upload-${referenceId}` : "upload");
    setError("");
    try {
      const form = new FormData();
      form.set("kind", "ugc-reference");
      form.set("file", file);
      const up = await fetch("/api/media/upload", { method: "POST", body: form });
      const uploaded = await up.json();
      if (!up.ok) throw new Error(uploaded.error || "Upload failed");
      return await post({ op: "attach-video", mediaUrl: uploaded.mediaUrl, referenceId }, referenceId ? `upload-${referenceId}` : "upload");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy("");
      return null;
    }
  }

  async function downloadOne(item: (typeof discovered)[number]) {
    if (!item.downloadable || !item.url) return;
    if (item.job?.status === "ready" && item.asset && storedSrc(item.asset.mediaUrl)) {
      const savedRow = saved.find((row) => row.dedupeKey === item.identity?.dedupeKey && storedSrc(row.mediaUrl));
      setPlaybackFailed(false);
      setPreview(savedRow ? { kind: "saved", referenceId: savedRow.id } : { kind: "import", jobId: item.job.id });
      return;
    }
    const json = await post({
      op: "import-video",
      url: item.url,
      creator: item.creator,
      publishedAt: item.date,
      source: "match",
    }, `import-${item.identity?.dedupeKey || item.index}`);
    if (json?.job?.status === "ready" && storedSrc(json.asset?.mediaUrl)) {
      setPlaybackFailed(false);
      setPreview({ kind: "import", jobId: json.job.id });
      return;
    }
    if (json?.job?.dedupeKey && json.job.status !== "failed") setArmPreview({ dedupeKey: json.job.dedupeKey, referenceId: "" });
  }

  async function importPreview(existing?: UgcReferenceRow) {
    const json = await post(existing ? {
      op: "import-preview",
      url: existing.url,
      creator: existing.creator || "",
      publishedAt: existing.publishedAt || "",
      market: existing.market || "",
      locale: existing.locale || "",
      source: "url",
    } : {
      op: "import-preview",
      url,
      creator,
      publishedAt,
      market,
      locale,
      source: "url",
    }, existing ? `import-preview-${existing.id}` : "import-preview");
    if (!existing && json?.reference?.id) {
      setUrl("");
      setCreator("");
      setPublishedAt("");
    }
    const dedupeKey = json?.job?.dedupeKey || json?.reference?.dedupeKey || existing?.dedupeKey || "";
    const referenceId = json?.reference?.id || existing?.id || "";
    if (json?.job?.status === "ready" && (storedSrc(json.asset?.mediaUrl) || storedSrc(json.reference?.mediaUrl))) {
      setPlaybackFailed(false);
      setPreview({ kind: "saved", referenceId });
      return;
    }
    if (dedupeKey && json?.job?.status !== "failed") setArmPreview({ dedupeKey, referenceId });
  }

  function focusSource() {
    const field = document.querySelector("[data-add-reference-form] input[aria-label='Source URL']");
    if (field instanceof HTMLInputElement) {
      field.scrollIntoView({ block: "center" });
      field.focus();
    }
  }

  const previewJob = preview?.kind === "import" ? imports.jobs.find((job) => job.id === preview.jobId) : undefined;
  const previewAsset = previewJob?.assetId ? imports.assets.find((asset) => asset.id === previewJob.assetId) : undefined;
  const previewSaved = preview?.kind === "saved" ? saved.find((row) => row.id === preview.referenceId) : undefined;
  const attached = previewAsset ? saved.find((row) => row.assetId === previewAsset.id || (row.mediaUrl && row.mediaUrl === previewAsset.mediaUrl)) : undefined;
  const visible = mode === "overview" ? saved.slice(0, 3) : saved;

  return (
    <section className="min-w-0" data-ugc-references={mode}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">UGC References</h2>
        {mode === "overview" ? (
          <button type="button" className="text-[12px] font-semibold text-[#652DFF]" data-view-references onClick={onViewAll}>View all</button>
        ) : null}
      </div>
      {instagramUsername ? <p className="mt-2 text-[12px] text-[#6B7280]">Brand handle @{instagramUsername.replace(/^@/, "")}. The handle stays separate from the product name and the brand.</p> : null}
      {matches ? (
        <p className="mt-2 text-[12px] text-[#6B7280]" data-reference-counts data-match-summary>
          <span data-discovered-count>{discovered.length}</span> discovered · <span data-saved-count>{saved.length}</span> saved. <span data-discovery-note>Brand discovery is not an exact product match.</span>
        </p>
      ) : mode === "manage" ? <p className="mt-2 text-[12px] text-[#6B7280]">Match on this product's card opens the brand result here.</p> : null}
      {rows === null && !error ? <p className="mt-2 text-[12px] text-[#6B7280]" data-references-loading>Loading references…</p> : null}
      {error ? <p className="mt-2 text-[12px] text-[#B91C1C]">{error}</p> : null}

      {mode === "manage" && matches ? (
        <div className="mt-3">
          <h3 className="text-[13px] font-semibold">Discovered</h3>
          {discovered.length ? (
            <ul className="mt-2 grid gap-2">
              {discovered.map((item) => (
                <li key={item.url || `missing-${item.index}`} className="flex min-w-0 gap-2 rounded-xl bg-[#F7F8FB] p-2" data-discovered-card>
                  <Poster src={storedSrc(item.asset?.posterUrl)} />
                  <div className="min-w-0">
                    <p className="truncate text-[12px] font-semibold">{item.creator || "Creator unknown"}</p>
                    <p className="mt-0.5 text-[11px] text-[#6B7280]">{platformLabel(item.type, item.identity?.platform)} · {item.date || "Date unknown"} · {clock(item.asset?.durationSec) || "Duration unknown"}</p>
                    <p className="text-[11px] text-[#6B7280]">{item.identity?.postId ? `Post ${item.identity.postId}` : "Post id unavailable"}</p>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12px]">
                      {item.downloadable ? (
                        <button type="button" className="font-semibold text-[#652DFF] disabled:opacity-40" data-download-preview disabled={Boolean(busy) || !skuId} onClick={() => void downloadOne(item)}>{busy === `import-${item.identity?.dedupeKey || item.index}` ? "Starting…" : importLabel(item.job)}</button>
                      ) : (
                        <button type="button" className="font-semibold text-[#652DFF]" data-add-post-url onClick={focusSource}>Add post URL</button>
                      )}
                      {item.embedUrl ? <button type="button" className="font-semibold text-[#111827]" data-preview-only onClick={() => { setPlaybackFailed(false); setPreview({ kind: "embed", url: item.url, embedUrl: item.embedUrl || "" }); }}>Preview only</button> : null}
                      {item.url ? <a className="font-semibold text-[#111827]" data-open-source href={item.url} target="_blank" rel="noreferrer">Open source</a> : null}
                    </div>
                    {item.job?.status === "failed" ? <p className="mt-1 text-[11px] text-[#B91C1C]">{item.job.error || "Download failed."}</p> : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-[12px] text-[#6B7280]">No discovered posts. Add a source URL or upload a video.</p>}
        </div>
      ) : null}

      <div className="mt-3">
        {mode === "manage" ? <h3 className="text-[13px] font-semibold">Saved references</h3> : null}
        {rows && !visible.length ? <p className="mt-2 text-[12px] text-[#6B7280]">No saved references.</p> : null}
        <ul className="mt-2 grid gap-2">
          {visible.map((row) => {
            const job = row.dedupeKey ? imports.jobs.find((item) => item.dedupeKey === row.dedupeKey) : undefined;
            const importing = Boolean(job && job.status !== "ready" && job.status !== "failed");
            const stage = stageLabel(row, importing);
            return (
            <li key={row.id} className="min-w-0 rounded-xl bg-[#F7F8FB] p-2 text-[12px]" data-reference-row={row.id} data-saved-card>
              <div className="flex min-w-0 gap-2">
                <Poster src={storedSrc(row.posterUrl)} />
                <div className="min-w-0">
                  <p className="truncate font-semibold">{row.creator || platformLabel("", row.platform)}</p>
                  <p className="mt-0.5 text-[11px] text-[#6B7280]">{platformLabel("", row.platform)} · {shownDate(row.publishedAt) || "Date unknown"} · {clock(row.durationSec) || "Duration unknown"}</p>
                  <p data-reference-status={importing ? "importing" : row.status}>{stage}{importing && job?.progress != null ? ` ${job.progress}%` : ""} · {relationLabel(row.relation)}</p>
                </div>
              </div>
              {row.status === "failed" || (job?.status === "failed" && !storedSrc(row.mediaUrl)) ? <p className="mt-1 text-[#B91C1C]">{row.failure || job?.error || "Import failed."}</p> : null}
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                <button type="button" data-open-reference={row.id} className="font-semibold text-[#652DFF]" onMouseDown={() => { openerIdRef.current = row.id; }} onClick={(event) => { openerIdRef.current = row.id; const button = event.currentTarget; openerRef.current = button instanceof HTMLElement ? button : null; setPlaybackFailed(false); setWorkspaceTab("overview"); setPreview({ kind: "saved", referenceId: row.id }); }}>Open</button>
                {mode === "manage" && row.url && !storedSrc(row.mediaUrl) && !importing ? <button type="button" className="font-semibold text-[#111827]" data-import-preview={row.id} disabled={Boolean(busy) || !skuId} onClick={() => void importPreview(row)}>Import</button> : null}
                {mode === "manage" && (row.status === "failed" || job?.status === "failed") && row.url ? <button type="button" className="font-semibold text-[#111827]" data-retry-import={row.id} disabled={Boolean(busy)} onClick={() => void post({ op: "retry-import", referenceId: row.id }, `retry-${row.id}`)}>Retry</button> : null}
              </div>
            </li>
            );
          })}
        </ul>
      </div>
      {mode === "overview" && saved.length > 3 ? <p className="mt-2 text-[12px] text-[#6B7280]">{saved.length - 3} more in Media & Facts.</p> : null}
      {mode === "overview" ? <button type="button" className="mt-2 text-[12px] font-semibold text-[#652DFF]" data-add-reference onClick={onAdd}>Add reference</button> : null}
      {mode === "manage" ? (
        <form className="mt-3 grid gap-2" data-add-reference-form={compose ? "open" : "closed"} onSubmit={(event) => {
          event.preventDefault();
          void post({ op: "add-url", url, creator, publishedAt, market, locale, source: "url" }, "add-url").then((json) => {
            if (json) {
              setUrl("");
              setCreator("");
              setPublishedAt("");
            }
          });
        }}>
          <p className="font-semibold">Add source URL</p>
          <input className={inputClass + " mt-0"} value={url} onChange={(event) => setUrl(event.target.value)} aria-label="Source URL" placeholder="https://" required />
          <div className="grid gap-2 sm:grid-cols-2">
            <input className={inputClass + " mt-0"} value={creator} onChange={(event) => setCreator(event.target.value)} aria-label="Creator" placeholder="Creator, optional" />
            <input className={inputClass + " mt-0"} value={publishedAt} onChange={(event) => setPublishedAt(event.target.value)} aria-label="Published date" placeholder="YYYY-MM-DD, optional" />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <select className={inputClass + " mt-0"} value={market} aria-label="Reference market" onChange={(event) => { setMarket(event.target.value); setLocale(""); }}>
              <option value="">Market, optional</option>
              {MARKETS.map((row) => <option key={row.id} value={row.id}>{row.id}</option>)}
            </select>
            <select className={inputClass + " mt-0"} value={locale} aria-label="Reference locale" onChange={(event) => setLocale(event.target.value)} disabled={!market}>
              <option value="">Locale, optional</option>
              {locales.map((row) => <option key={row} value={row}>{row}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Btn type="button" data-import-preview="new" disabled={Boolean(busy) || !skuId || !url.trim()} onClick={() => void importPreview()}>{busy === "import-preview" ? "Starting…" : "Import & Preview"}</Btn>
            <Btn type="submit" variant="ghost" data-save-link disabled={Boolean(busy) || !skuId}>{busy === "add-url" ? "Saving…" : "Save link only"}</Btn>
            <label className="inline-flex cursor-pointer items-center text-[12px] font-semibold text-[#652DFF]">
              {busy === "upload" ? "Uploading…" : "Upload video"}
              <input className="hidden" type="file" accept="video/mp4,video/webm,video/quicktime" onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void upload(file);
              }} />
            </label>
          </div>
        </form>
      ) : null}

      {preview ? (
        <div className="fixed inset-0 z-[80] flex justify-end overflow-hidden bg-black/40" data-preview-drawer onMouseDown={(event) => { if (event.target === event.currentTarget) closeWorkspace(); }}>
          <div ref={dialogRef} className="flex h-full w-full max-w-[600px] flex-col overflow-hidden bg-white shadow-xl" role="dialog" aria-modal="true" aria-label="Reference workspace">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#E6E8EE] px-4 py-3">
              <h3 className="font-semibold">{preview.kind === "embed" ? "Preview only" : previewSaved ? `${previewSaved.creator || platformLabel("", previewSaved.platform)} · ${stageLabel(previewSaved, false)}` : "Reference"}</h3>
              <button type="button" className="text-[12px] font-semibold text-[#652DFF]" data-close-preview onClick={closeWorkspace}>Close</button>
            </div>
            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-3" data-drawer-body>
            {preview.kind === "embed" ? (
              <>
                <p className="mt-2 text-[12px] text-[#6B7280]">Preview only. This embed is not a saved video and cannot be analyzed.</p>
                <iframe className="mx-auto mt-3 max-h-[min(56dvh,560px)] w-auto max-w-full rounded-xl bg-black" style={{ aspectRatio: "9 / 16" }} sandbox="allow-scripts allow-same-origin allow-presentation" referrerPolicy="no-referrer" src={preview.embedUrl} title="Preview only" />
                <a className="mt-2 inline-block text-[12px] font-semibold text-[#652DFF]" href={preview.url} target="_blank" rel="noreferrer">Open source</a>
              </>
            ) : null}
            {preview.kind === "import" ? (
              <>
                <p className="mt-2 text-[12px] text-[#6B7280]">{importLabel(previewJob)}{previewJob?.progress != null && previewJob.status === "downloading" ? ` · ${previewJob.progress}%` : ""}. This download is not on the SKU until you add it.</p>
                {previewJob?.status === "failed" ? <p className="mt-2 text-[12px] text-[#B91C1C]">{previewJob.error || "Download failed."}</p> : null}
                {previewAsset && storedSrc(previewAsset.mediaUrl) && !playbackFailed ? (
                  <video className="mx-auto mt-3 max-h-[min(56dvh,560px)] w-auto max-w-full bg-black object-contain" style={previewAsset.width && previewAsset.height ? { aspectRatio: `${previewAsset.width} / ${previewAsset.height}` } : undefined} controls playsInline preload="metadata" src={previewAsset.mediaUrl} onError={() => setPlaybackFailed(true)} />
                ) : null}
                {playbackFailed ? <p className="mt-2 text-[12px] text-[#B91C1C]">This video could not be played.</p> : null}
                {!previewAsset ? <p className="mt-3 text-[12px] text-[#6B7280]">Stored playback is not ready. The post page is not used as the video.</p> : null}
                <dl className="mt-3 grid gap-1 text-[12px] text-[#374151]">
                  <div>Creator · {previewAsset?.creator || previewJob?.creator || "Creator unknown"}</div>
                  <div>Platform · {platformLabel("", previewAsset?.platform || previewJob?.platform)}</div>
                  <div>Date · {shownDate(previewAsset?.publishedAt || previewJob?.publishedAt) || "Date unknown"}</div>
                  <div>Duration · {clock(previewAsset?.durationSec) || "Duration unknown"}</div>
                  <div>Picture · {previewAsset ? `${previewAsset.width}×${previewAsset.height}` : "Dimensions unknown"}</div>
                  <div>Audio · {previewAsset ? (previewAsset.hasAudio ? "Audio present" : "No audio track") : "Audio unknown"}</div>
                  <div>Post · {previewAsset?.postId || previewJob?.postId || "Post id unavailable"}</div>
                  <div>Asset · {previewAsset?.id || "Not stored"}</div>
                </dl>
                {previewJob?.sourceUrl ? <a className="mt-2 inline-block text-[12px] font-semibold text-[#652DFF]" href={previewJob.sourceUrl} target="_blank" rel="noreferrer">Open source</a> : null}
                {previewAsset && previewJob?.status === "ready" && !attached ? (
                  <div className="mt-4 grid gap-2">
                    <label className="text-[11px] font-semibold text-[#6B7280]">Add to reference
                      <select className={inputClass + " mt-1"} aria-label="Imported reference relation" value={draftRelation} onChange={(event) => { setDraftRelation(event.target.value); setDraftConfirmed(false); }}>
                        <option value="">Unreviewed</option>
                        <option value="SAME_CATEGORY">Same category</option>
                        <option value="STYLE_ONLY">Style reference</option>
                        <option value="SAME_PRODUCT">Same product</option>
                      </select>
                    </label>
                    {draftRelation === "SAME_PRODUCT" && !draftConfirmed ? <Btn type="button" onClick={() => setDraftConfirmed(true)}>Confirm same physical product</Btn> : null}
                    <Btn type="button" data-add-to-reference disabled={Boolean(busy) || !skuId || (draftRelation === "SAME_PRODUCT" && !draftConfirmed)} onClick={() => void post({
                      op: "add-from-import",
                      assetId: previewAsset.id,
                      relation: draftRelation,
                      confirmed: draftRelation === "SAME_PRODUCT" && draftConfirmed,
                      market,
                      locale,
                      source: "match",
                    }, "add-import").then((json) => {
                      if (json?.reference?.id) setAddedId(String(json.reference.id));
                    })}>{busy === "add-import" ? "Adding…" : "Add to reference"}</Btn>
                  </div>
                ) : null}
                {attached || (previewAsset && addedId && saved.some((row) => row.id === addedId && row.assetId === previewAsset.id)) ? <p className="mt-3 text-[12px] font-semibold" data-reference-added>Added</p> : null}
              </>
            ) : null}
            {preview.kind === "saved" && previewSaved ? (
              <>
                <p className="text-[12px] text-[#6B7280]">{platformLabel("", previewSaved.platform)} · {shownDate(previewSaved.publishedAt) || "Date unknown"} · {stageLabel(previewSaved, false)}</p>
                {storedSrc(previewSaved.mediaUrl) && !playbackFailed ? (
                  <video className="mx-auto mt-3 max-h-[min(56dvh,560px)] w-auto max-w-full bg-black object-contain" style={previewSaved.width && previewSaved.height ? { aspectRatio: `${previewSaved.width} / ${previewSaved.height}` } : undefined} controls playsInline preload="metadata" src={previewSaved.mediaUrl || undefined} onError={() => setPlaybackFailed(true)} />
                ) : <p className="mt-3 text-[12px] text-[#6B7280]">No stored video for this reference.</p>}
                {playbackFailed ? <p className="mt-2 text-[12px] text-[#B91C1C]">This video could not be played. The file may be missing or the browser cannot decode it.</p> : null}
                {previewSaved.relation === "SAME_PRODUCT" && !previewSaved.relationBasis ? <p className="mt-2 text-[12px] text-[#B45309]">Same-SKU confirmation has no saved review basis. Confirmation status alone is not evidence.</p> : null}
                <div className="mt-3 flex flex-wrap gap-2 text-[12px]" role="tablist">
                  {(["overview", "script", "scenes", "facts", "review"] as const).map((tab) => (
                    <button key={tab} type="button" role="tab" aria-selected={workspaceTab === tab} className={workspaceTab === tab ? "font-semibold text-[#652DFF]" : "font-semibold text-[#6B7280]"} onClick={() => setWorkspaceTab(tab)}>{tab[0].toUpperCase() + tab.slice(1)}</button>
                  ))}
                </div>
                {workspaceTab === "overview" ? (
                  <div className="mt-3 grid gap-2 text-[12px]">
                    <p>{relationLabel(previewSaved.relation)} · {previewSaved.analysis?.coverage === "partial" ? "Partial analysis" : previewSaved.analysis ? "Analysis on file" : "Not analyzed"}</p>
                    <label className="text-[11px] font-semibold text-[#6B7280]">Relation
                      <select className={inputClass + " mt-1"} aria-label="Reference relation" value={pendingSame === previewSaved.id ? "SAME_PRODUCT" : previewSaved.relation || ""} onChange={(event) => {
                        const value = event.target.value;
                        if (value === "SAME_PRODUCT") { setPendingSame(previewSaved.id); return; }
                        setPendingSame("");
                        void post({ op: "set-relation", referenceId: previewSaved.id, relation: value, confirmed: false }, `relation-${previewSaved.id}`);
                      }}>
                        <option value="">Unreviewed</option>
                        <option value="SAME_CATEGORY">Same category</option>
                        <option value="STYLE_ONLY">Style reference</option>
                        <option value="SAME_PRODUCT">Same product</option>
                      </select>
                    </label>
                    {pendingSame === previewSaved.id ? (
                      <>
                        <input className={inputClass + " mt-1"} aria-label="Review basis" placeholder="What did you compare on this physical SKU?" value={relationBasis} onChange={(event) => setRelationBasis(event.target.value)} />
                        <Btn type="button" disabled={Boolean(busy) || relationBasis.trim().length < 8} onClick={() => void post({ op: "set-relation", referenceId: previewSaved.id, relation: "SAME_PRODUCT", confirmed: true, basis: relationBasis }, `relation-${previewSaved.id}`).then(() => setPendingSame(""))}>Confirm same physical product</Btn>
                      </>
                    ) : null}
                    {previewSaved.relationBasis ? <p>Review basis · {previewSaved.relationBasis}</p> : null}
                    <p className="text-[#6B7280]">Brand discovery is not an exact product match. Category and style references can still save a creative pattern.</p>
                    <p className="text-[#6B7280]">Save script and Add to facts stay optional. Recreate for market opens the drafts.</p>
                    {previewSaved.url ? <a className="font-semibold text-[#652DFF]" href={previewSaved.url} target="_blank" rel="noreferrer">Open source</a> : null}
                    <details className="text-[#6B7280]">
                      <summary className="cursor-pointer font-semibold">Details</summary>
                      <p className="mt-1">Asset {previewSaved.assetId || "not stored"}</p>
                      <p>Playback {storedSrc(previewSaved.mediaUrl) || "not stored"}</p>
                      <p>Speech {previewSaved.analysis?.providers?.speech || "not run"} · Shots {previewSaved.analysis?.providers?.shots || "not run"} · Vision {previewSaved.analysis?.providers?.vision || "not run"}</p>
                      {previewSaved.analysis?.reason ? <p>{previewSaved.analysis.reason}</p> : null}
                      {(previewSaved.analysis?.failures || []).map((item) => <p key={item}>{item}</p>)}
                    </details>
                  </div>
                ) : null}
                {workspaceTab === "script" ? (
                  <div className="mt-3 grid gap-3 text-[12px]" data-script-tab>
                    <section>
                      <h4 className="font-semibold">Source transcript</h4>
                      {previewSaved.analysis?.transcriptStatus === "ok" ? (previewSaved.analysis.transcript || []).map((line) => <p key={`${line.startSec}-${line.text}`} className="mt-1 text-[#374151]">{clock(line.startSec)} {line.text}</p>) : <p className="mt-1 text-[#6B7280]">{previewSaved.analysis?.transcriptStatus === "no-audio" ? "No audio track." : previewSaved.analysis?.transcriptStatus === "no-speech" ? "No speech in the audio track." : "Speech is unavailable."} {previewSaved.creator ? `Personal experience stays attributed to ${previewSaved.creator}.` : ""}</p>}
                    </section>
                    <section>
                      <h4 className="font-semibold">Creative pattern</h4>
                      <p className="mt-1">Hook · {previewSaved.analysis?.pattern?.hook || "Unknown"}</p>
                      <p>Beats · {(previewSaved.analysis?.pattern?.beats || []).join(" · ") || "Unknown"}</p>
                      <p>Demo · {previewSaved.analysis?.pattern?.demo || "Unknown"}</p>
                      <p>Objections · {(previewSaved.analysis?.pattern?.objections || []).join(" · ") || "Unknown"}</p>
                      <p>Proof · {previewSaved.analysis?.pattern?.proof || "Unknown"}</p>
                      <p>CTA · {previewSaved.analysis?.pattern?.cta || "Unknown"}</p>
                      <p>Pacing · {previewSaved.analysis?.pattern?.pacing || "Unknown"}</p>
                    </section>
                    {scripts.find((item) => item.referenceId === previewSaved.id) ? <p data-saved-script>Saved · version {scripts.find((item) => item.referenceId === previewSaved.id)?.analysisVersion}</p> : null}
                  </div>
                ) : null}
                {workspaceTab === "scenes" ? (
                  <ul className="mt-3 grid gap-2 text-[12px]">
                    {(previewSaved.analysis?.beats || []).length ? (previewSaved.analysis?.beats || []).map((beat, index) => (
                      <li key={`${beat.startSec}-${index}`}>{clock(beat.startSec)}–{clock(beat.endSec)} · {beat.productAction || beat.purpose}</li>
                    )) : <li className="text-[#6B7280]">No measured shots.</li>}
                    {previewSaved.analysis?.cuts?.text ? <li className="text-[#6B7280]">{previewSaved.analysis.cuts.text}</li> : null}
                    {previewSaved.analysis?.framing?.text ? <li>Framing · {previewSaved.analysis.framing.text}</li> : null}
                  </ul>
                ) : null}
                {workspaceTab === "review" ? (
                  <div className="mt-3 grid gap-3 text-[12px]" data-review-tab>
                    {(() => {
                      const blueprint = blueprints
                        .filter((row) => row.referenceId === previewSaved.id && row.analysisVersion === previewSaved.analysis?.version)
                        .sort((a, b) => b.version - a.version)[0];
                      const drafts = recreations.filter((row) => row.referenceId === previewSaved.id);
                      if (!blueprint) return <p className="text-[#6B7280]">No blueprint is stored yet. Recreate for market builds one from the saved analysis. Save script is optional.</p>;
                      const planned = drafts.filter((row) => row.shots.length);
                      const empty = drafts.filter((row) => !row.shots.length);
                      const loose = blueprint.shots.filter((shot) => !blueprint.beats.some((beat) => beat.id === shot.beatId));
                      const speechFor = (shot: BlueprintShot) => (previewSaved.analysis?.transcript || []).filter((line) => line.startSec < shot.endSec && line.endSec > shot.startSec);
                      return (
                        <>
                          <p>Analysis version {blueprint.analysisVersion}. Blueprint version {blueprint.version}. A beat can hold several shots.</p>
                          <p className="text-[#6B7280]">Source video asset {previewSaved.assetId || "not stored"}. Product SKU {skuId || "not selected"}. Recreation creator is not selected. Voice is not selected, so local timing stays estimated.</p>
                          {empty.map((draft) => <p key={draft.productionId}>{draft.market} {draft.locale} · draft revision {draft.revision}. No localized script. Astra was not called. <a className="font-semibold text-[#652DFF]" href={draft.href}>Open draft</a></p>)}
                          {planned.map((draft) => (
                            <p key={draft.productionId}>{draft.market} {draft.locale} · {draft.model} · revision {draft.revision}{draft.blueprintVersion != null && draft.blueprintVersion < blueprint.version ? ` · draft still uses blueprint ${draft.blueprintVersion}` : ""}{draft.approved ? " · approved" : " · not approved"}. <a className="font-semibold text-[#652DFF]" href={draft.href}>Open draft</a></p>
                          ))}
                          {blueprint.beats.map((beat) => (
                            <article key={beat.id} className="rounded-lg bg-[#F7F8FB] p-2">
                              <h4 className="font-semibold">{beat.role}</h4>
                              <p className="mt-1 text-[#6B7280]">{beat.startSec == null ? "No source time range." : `Source ${clock(beat.startSec)}–${clock(beat.endSec)}`}</p>
                              <p className="mt-1">{beat.evidence || "Not observed in the source analysis."}</p>
                              {beat.uncertainty ? <p className="mt-1 text-[#B45309]">{beat.uncertainty}</p> : null}
                              <label className="mt-1 block text-[#6B7280]">Evidence correction
                                <textarea className={inputClass + " mt-1"} aria-label={`${beat.role} evidence`} value={blueprintEdits[`evidence:${beat.id}`] ?? beat.evidence ?? ""} onChange={(event) => setBlueprintEdits((current) => ({ ...current, [`evidence:${beat.id}`]: event.target.value }))} />
                              </label>
                              {blueprint.shots.filter((shot) => shot.beatId === beat.id).map((shot) => (
                                <ShotReview key={shot.id} shot={shot} drafts={planned} edits={blueprintEdits} speech={speechFor(shot)} onEdit={(key, value) => setBlueprintEdits((current) => ({ ...current, [key]: value }))} />
                              ))}
                              {blueprint.shots.some((shot) => shot.beatId === beat.id) ? null : <p className="mt-2 text-[#6B7280]">No measured shot falls inside this beat.</p>}
                            </article>
                          ))}
                          {loose.length ? (
                            <article className="rounded-lg bg-[#F7F8FB] p-2">
                              <h4 className="font-semibold">Shots outside a timed beat</h4>
                              {loose.map((shot) => <ShotReview key={shot.id} shot={shot} drafts={planned} edits={blueprintEdits} speech={speechFor(shot)} onEdit={(key, value) => setBlueprintEdits((current) => ({ ...current, [key]: value }))} />)}
                            </article>
                          ) : null}
                          <Btn type="button" variant="ghost" disabled={Boolean(busy)} onClick={() => void post({
                            op: "correct-blueprint",
                            blueprintId: blueprint.id,
                            beats: blueprint.beats.map((beat) => ({ id: beat.id, evidence: blueprintEdits[`evidence:${beat.id}`] ?? beat.evidence ?? "" })),
                            shots: blueprint.shots.map((shot) => ({ id: shot.id, action: blueprintEdits[`action:${shot.id}`] ?? shot.action ?? "", framing: shot.framing ?? "" })),
                          }, "blueprint").then(() => setWorkspaceTab("review"))}>Save correction</Btn>
                        </>
                      );
                    })()}
                  </div>
                ) : null}
                {workspaceTab === "facts" ? (
                  <ul className="mt-3 grid gap-3 text-[12px]" data-facts-tab>
                    {(previewSaved.analysis?.candidateFacts || []).length ? (previewSaved.analysis?.candidateFacts || []).map((fact, index) => {
                      const key = `${previewSaved.id}:${fact.source}:${fact.startSec}:${index}`;
                      const added = Boolean(fact.factId);
                      return (
                        <li key={key} className="rounded-lg bg-[#F7F8FB] p-2">
                          <p className="text-[#6B7280]">{fact.source === "speech" ? "Spoken claim" : "Visual observation"} · {clock(fact.startSec) || "Time unknown"}</p>
                          <p className="mt-1 text-[#6B7280]">{fact.source === "speech" ? "Spoken line" : "Visible evidence"} · {fact.statement}</p>
                          <textarea className={inputClass + " mt-1"} aria-label="Candidate fact" value={factEdits[key] ?? fact.statement} onChange={(event) => setFactEdits((current) => ({ ...current, [key]: event.target.value }))} />
                          {added ? (
                            <button type="button" className="mt-1 font-semibold text-[#652DFF]" data-open-fact={fact.factId} onClick={() => { closeWorkspace(); document.getElementById(`fact-${fact.factId}`)?.scrollIntoView({ block: "center" }); }}>Added · Open fact</button>
                          ) : (
                            <button type="button" className="mt-1 font-semibold text-[#652DFF] disabled:opacity-40" data-add-fact disabled={Boolean(busy) || previewSaved.relation !== "SAME_PRODUCT"} onClick={() => void post({
                              op: "add-reference-fact",
                              referenceId: previewSaved.id,
                              statement: factEdits[key] ?? fact.statement,
                              source: fact.source,
                              startSec: fact.startSec,
                              endSec: fact.endSec,
                            }, `fact-${key}`).then((json) => { if (json?.fact) onChanged?.(); })}>Add to facts</button>
                          )}
                        </li>
                      );
                    }) : <li className="text-[#6B7280]">No candidate facts yet.</li>}
                    {previewSaved.relation !== "SAME_PRODUCT" ? <li className="text-[#6B7280]">Confirm the same physical product before a candidate can become a product fact.</li> : null}
                  </ul>
                ) : null}
              </>
            ) : null}
            </div>
            <div className="shrink-0 border-t border-[#E6E8EE] px-4 py-3" data-drawer-footer>
              {preview.kind === "saved" && previewSaved ? (
                <>
                  <fieldset className="grid grid-cols-2 gap-2 text-[12px]">
                    <legend className="col-span-2 font-semibold">Recreate for market</legend>
                    {[{ id: "ID", locales: ["id-ID"] }, { id: "MY", locales: ["ms-MY", "en-MY"] }, { id: "TH", locales: ["th-TH"] }, { id: "SG", locales: ["en-SG"] }].map((item) => (
                      <label key={item.id} className="flex min-w-0 items-center gap-1">
                        <input type="checkbox" checked={item.id in marketLocales} onChange={(event) => setMarketLocales((current) => {
                          const next = { ...current };
                          if (event.target.checked) next[item.id] = item.locales[0];
                          else delete next[item.id];
                          return next;
                        })} />
                        <span className="shrink-0">{item.id}</span>
                        <select className={inputClass + " mt-0 min-w-0"} aria-label={`${item.id} locale`} value={marketLocales[item.id] || item.locales[0]} onChange={(event) => setMarketLocales((current) => ({ ...current, [item.id]: event.target.value }))}>
                          {item.locales.map((localeId) => <option key={localeId} value={localeId}>{localeId}</option>)}
                        </select>
                      </label>
                    ))}
                  </fieldset>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <Btn type="button" disabled={Boolean(busy) || !previewSaved.analysis?.version || !Object.keys(marketLocales).length} onClick={() => void post({
                      op: "recreate-markets",
                      referenceId: previewSaved.id,
                      markets: Object.entries(marketLocales).map(([marketId, localeId]) => ({ market: marketId, locale: localeId })),
                      localize: Object.keys(marketLocales),
                    }, `recreate-${previewSaved.id}`).then((json) => {
                      if (!json) return;
                      setWorkspaceTab("review");
                      onChanged?.();
                    })}>{busy === `recreate-${previewSaved.id}` ? "Recreating…" : "Recreate for market"}</Btn>
                    <Btn type="button" variant="ghost" disabled={Boolean(busy) || !storedSrc(previewSaved.mediaUrl)} onClick={() => void post({ op: "analyze", referenceId: previewSaved.id }, `analyze-${previewSaved.id}`)}>{busy === `analyze-${previewSaved.id}` ? "Analyzing…" : "Analyze"}</Btn>
                    <Btn type="button" variant="ghost" disabled={Boolean(busy) || !previewSaved.analysis?.version} onClick={() => void post({ op: "save-script", referenceId: previewSaved.id }, `script-${previewSaved.id}`).then((json) => { if (json?.script) setWorkspaceTab("script"); })}>{scripts.some((item) => item.referenceId === previewSaved.id && item.analysisVersion === previewSaved.analysis?.version) ? "Saved" : "Save script"}</Btn>
                    <Btn type="button" variant="ghost" disabled={Boolean(busy) || !previewSaved.analysis?.version || !Object.keys(marketLocales).length} onClick={() => void post({
                      op: "recreate-markets",
                      referenceId: previewSaved.id,
                      markets: Object.entries(marketLocales).map(([marketId, localeId]) => ({ market: marketId, locale: localeId })),
                      localize: [],
                    }, `factory-${previewSaved.id}`).then((json) => {
                      const href = json?.drafts?.[0]?.href;
                      if (href) { setFactoryHref(String(href)); setWorkspaceTab("review"); onChanged?.(); }
                    })}>Use in Factory</Btn>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-[12px]">
                    <label className="inline-flex cursor-pointer items-center font-semibold text-[#652DFF]">
                      Upload
                      <input className="hidden" type="file" accept="video/mp4,video/webm,video/quicktime" onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) void upload(file, previewSaved.id);
                      }} />
                    </label>
                    {factoryHref ? <a className="font-semibold text-[#652DFF]" href={factoryHref}>Open draft</a> : null}
                  </div>
                </>
              ) : <button type="button" className="text-[12px] font-semibold text-[#652DFF]" onClick={closeWorkspace}>Close</button>}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
