"use client";

import { useEffect, useRef, useState } from "react";
import { inputClass } from "@/components/ui";
import { isSourceTestimonial } from "@/lib/fact-evidence";
import { cn } from "@/lib/cn";

type Reference = {
  id: string;
  creator: string | null;
  platform: string;
  url: string | null;
  mediaUrl: string | null;
  posterUrl?: string | null;
  status: string;
  failure: string | null;
  durationSec?: number | null;
  dedupeKey?: string;
  analysis: {
    version: number | null;
    transcript?: { startSec: number; endSec: number; text: string }[];
    beats?: { startSec: number | null; endSec: number | null; purpose: string; productAction: string | null }[];
    candidateFacts?: { statement: string; startSec: number | null; endSec: number | null; source: string }[];
  } | null;
};
type Job = { id: string; dedupeKey: string; status: string; progress: number | null; error: string | null };
type Post = { url?: string; creatorName?: string; type?: string };
type Production = { id: string; market: string; locale: string; revision: number };

const LOCALES: Record<string, string[]> = {
  MY: ["en-MY", "ms-MY"],
  ID: ["id-ID"],
  SG: ["en-SG"],
  TH: ["th-TH"],
  US: ["en-US"],
};

function clock(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return "";
  const total = Math.round(value);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function statusLabel(row: Reference, job?: Job) {
  if (job && job.status !== "ready" && job.status !== "failed") return job.progress != null ? `${job.status} ${job.progress}%` : job.status;
  if (row.status === "failed" || job?.status === "failed") return "Failed";
  if (row.analysis?.version != null) return "Analyzed";
  if (row.mediaUrl?.startsWith("/api/media/")) return "Video ready";
  return "Link saved";
}

export function ReferenceWorkspace({
  productId,
  skuId,
  openAdd,
  matches,
  productions,
  selectedId,
  onSelect,
}: {
  productId: string;
  skuId: string;
  openAdd: boolean;
  matches: { posts?: Post[] } | null;
  productions: Production[];
  selectedId: string;
  onSelect: (id: string, startSec?: number) => void;
}) {
  const [rows, setRows] = useState<Reference[] | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [dialog, setDialog] = useState(openAdd);
  const [path, setPath] = useState<"campaigns" | "url" | "upload">("url");
  const [url, setUrl] = useState("");
  const [creator, setCreator] = useState("");
  const [publishedAt, setPublishedAt] = useState("");
  const [metaOpen, setMetaOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [tab, setTab] = useState<"script" | "scenes" | "claims">("script");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [factoryOpen, setFactoryOpen] = useState(false);
  const [factoryMarket, setFactoryMarket] = useState("MY");
  const [factoryLocale, setFactoryLocale] = useState("en-MY");
  const [versionsOpen, setVersionsOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const urlRef = useRef<HTMLInputElement | null>(null);

  async function load() {
    const res = await fetch(`/api/commerce/ugc-references?productId=${encodeURIComponent(productId)}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Could not load references");
    const next = (json.references || []) as Reference[];
    setRows(next);
    setJobs(json.imports?.jobs || []);
    return next;
  }

  useEffect(() => {
    if (openAdd) { setDialog(true); setPath("url"); }
  }, [openAdd]);

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [productId]);

  useEffect(() => {
    if (!rows?.length || selectedId) return;
    const soph = rows.find((row) => /soph/i.test(row.creator || ""));
    onSelect((soph || rows[0]).id, 0);
  }, [rows, selectedId]);

  useEffect(() => {
    if (!dialog) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    urlRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); setDialog(false); }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [dialog]);

  const selected = rows?.find((row) => row.id === selectedId) || null;
  const playable = Boolean(selected?.mediaUrl?.startsWith("/api/media/"));
  const attached = new Set((rows || []).map((row) => row.url).filter(Boolean));

  async function post(body: Record<string, unknown>, key: string) {
    setBusy(key);
    setError("");
    try {
      const res = await fetch("/api/commerce/ugc-references", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, skuId, ...body }) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Request failed");
      const next = await load();
      const added = json?.reference?.id || next.find((row) => row.url === body.url)?.id;
      if (added) onSelect(added, 0);
      if (key === "import-preview" || key === "import-video" || key === "upload") setDialog(false);
      return json;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    } finally {
      setBusy("");
    }
  }

  async function upload(file: File) {
    setFileName(file.name);
    setBusy("upload");
    setError("");
    try {
      const form = new FormData();
      form.set("kind", "ugc-reference");
      form.set("file", file);
      const up = await fetch("/api/media/upload", { method: "POST", body: form });
      const uploaded = await up.json();
      if (!up.ok) throw new Error(uploaded.error || "Upload failed");
      await post({ op: "attach-video", mediaUrl: uploaded.mediaUrl }, "upload");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy("");
    }
  }

  function continueDraft() {
    const match = productions.find((row) => row.market === factoryMarket && row.locale === factoryLocale);
    if (!match) {
      setError("No saved draft exists for that market and language.");
      return;
    }
    window.location.href = `/create/ugc-factory?production=${match.id}`;
  }

  return (
    <div data-ugc-workspace>
      <div className="mb-4 flex items-center justify-between gap-4">
        <p className="text-sm font-semibold">References <span className="font-normal text-[#6B7280]">{rows?.length || 0}</span></p>
        <button type="button" className="text-sm font-semibold text-[#652DFF]" data-add-reference onClick={() => { setDialog(true); setPath("url"); setError(""); }}>Add reference</button>
      </div>
      <div className="grid items-start gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
        <ul className="min-w-0">
          {(rows || []).map((row) => {
            const job = jobs.find((item) => item.dedupeKey && item.dedupeKey === row.dedupeKey);
            return (
              <li key={row.id} className="border-b border-[#F3F4F8]">
                <button type="button" className={cn("flex w-full items-center gap-3 py-3 text-left", row.id === selected?.id && "bg-[#F7F8FB]")} data-reference-row={row.id} onClick={() => onSelect(row.id, 0)}>
                  {row.posterUrl ? <img src={row.posterUrl} alt="" className="h-12 w-9 rounded object-cover" /> : <span className="grid h-12 w-9 place-items-center rounded bg-[#F3F4F8] text-[10px] text-[#6B7280]">Video</span>}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{row.creator || row.platform || "Reference"}</span>
                    <span className="block text-[12px] text-[#6B7280]">{row.platform}{clock(row.durationSec) ? ` · ${clock(row.durationSec)}` : ""}</span>
                    <span className="block text-[12px]">{statusLabel(row, job)}</span>
                  </span>
                </button>
              </li>
            );
          })}
          {rows && !rows.length ? <li className="py-3 text-sm text-[#6B7280]">No reference is attached.</li> : null}
        </ul>
        {selected ? (
          <div data-reference-detail={selected.id} className="min-w-0">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{selected.creator || selected.platform}</p>
                <p className="text-[12px] text-[#6B7280]">{selected.platform}{clock(selected.durationSec) ? ` · ${clock(selected.durationSec)}` : ""} · {statusLabel(selected)}</p>
              </div>
              <button type="button" className="rounded-lg bg-[#652DFF] px-3 py-1.5 text-sm font-semibold text-white" data-use-factory onClick={() => { setFactoryOpen(true); setError(""); }}>Use in Factory</button>
            </div>
            {factoryOpen ? (
              <div className="mb-4 grid max-w-sm gap-3" data-factory-dialog>
                <label className="text-sm font-semibold">Market
                  <select className={inputClass + " mt-1 text-sm"} value={factoryMarket} aria-label="Factory market" onChange={(event) => { const market = event.target.value; setFactoryMarket(market); setFactoryLocale(LOCALES[market]?.[0] || "en-MY"); }}>
                    {Object.keys(LOCALES).map((market) => <option key={market} value={market}>{market}</option>)}
                  </select>
                </label>
                <label className="text-sm font-semibold">Language
                  <select className={inputClass + " mt-1 text-sm"} value={factoryLocale} aria-label="Factory language" onChange={(event) => setFactoryLocale(event.target.value)}>
                    {(LOCALES[factoryMarket] || []).map((locale) => <option key={locale} value={locale}>{locale}</option>)}
                  </select>
                </label>
                <div className="flex gap-3">
                  <button type="button" className="rounded-lg bg-[#111827] px-3 py-1.5 text-sm font-semibold text-white" data-continue-draft onClick={continueDraft}>Continue to draft</button>
                  <button type="button" className="text-sm font-semibold text-[#6B7280]" onClick={() => setFactoryOpen(false)}>Cancel</button>
                </div>
              </div>
            ) : null}
            <div className="grid items-start gap-4 md:grid-cols-[220px_minmax(0,1fr)]">
              {playable ? (
                <video className="aspect-[9/16] w-full max-w-[220px] bg-black object-contain" controls playsInline preload="metadata" poster={selected.posterUrl || undefined} src={selected.mediaUrl || undefined} />
              ) : (
                <div className="grid aspect-[9/16] w-full max-w-[220px] place-items-center bg-[#111827] p-3 text-center text-[12px] text-white">
                  Link saved. The video is not stored yet.
                  {selected.url ? <button type="button" className="mt-2 font-semibold text-white" data-retry-import={selected.id} onClick={() => void post({ op: "retry-import", referenceId: selected.id }, "retry")}>Retry</button> : null}
                </div>
              )}
              <div>
                <div className="flex flex-wrap items-center gap-4 text-sm" role="tablist" aria-label="Reference analysis">
                  {(["script", "Script"], ["scenes", "Scenes"], ["claims", "Claims"] as const).map(([id, label]) => (
                    <button key={id} type="button" role="tab" aria-selected={tab === id} className={cn("font-semibold", tab === id ? "text-[#111827]" : "text-[#652DFF]")} onClick={() => setTab(id)}>{label}</button>
                  ))}
                  {selected.analysis?.version == null ? (
                    <button type="button" className="font-semibold text-[#652DFF] disabled:opacity-40" data-analyze-reference={selected.id} disabled={!playable || Boolean(busy)} onClick={() => void post({ op: "analyze", referenceId: selected.id }, "analyze")}>Analyze</button>
                  ) : (
                    <button type="button" className="text-[12px] font-semibold text-[#6B7280]" onClick={() => setVersionsOpen((value) => !value)}>Version</button>
                  )}
                </div>
                {versionsOpen && selected.analysis?.version != null ? <p className="mt-2 text-[12px] text-[#6B7280]">Analysis v{selected.analysis.version} is on file. Re-analyze is not started from this view.</p> : null}
                {tab === "script" ? (
                  <div className="mt-4" data-reference-script>
                    <ul className="grid gap-2">{(selected.analysis?.transcript || []).map((line) => <li key={`${line.startSec}-${line.text}`} className="border-b border-[#F3F4F8] py-2 text-sm">{clock(line.startSec)} · {line.text}</li>)}</ul>
                    <button type="button" className="mt-4 text-sm font-semibold text-[#652DFF] disabled:opacity-40" disabled={!selected.analysis?.version || Boolean(busy)} onClick={() => void post({ op: "save-script", referenceId: selected.id }, "save-script").then((json) => { if (json) setNotice("Script saved."); })}>Save script</button>
                  </div>
                ) : null}
                {tab === "scenes" ? (
                  <ul className="mt-4 grid gap-2">{(selected.analysis?.beats || []).map((beat, index) => <li key={index} className="border-b border-[#F3F4F8] py-2 text-sm">{clock(beat.startSec)}–{clock(beat.endSec)} · {beat.productAction || beat.purpose}</li>)}</ul>
                ) : null}
                {tab === "claims" ? (
                  <ul className="mt-4 grid gap-2" data-reference-candidates>
                    {(selected.analysis?.candidateFacts || []).map((line) => (
                      <li key={`${line.startSec}-${line.statement}`} className="border-b border-[#F3F4F8] py-2 text-sm">
                        <span className="text-[12px] text-[#6B7280]">{isSourceTestimonial({ statement: line.statement }) ? "Source testimonial" : "Source claim"} · {clock(line.startSec)}</span>
                        <span className="mt-1 block">{line.statement}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {notice ? <p className="mt-3 text-[12px] text-[#166534]">{notice}</p> : null}
              </div>
            </div>
          </div>
        ) : <p className="text-sm text-[#6B7280]">Select a reference.</p>}
      </div>
      {error ? <p className="mt-3 text-sm text-[#B91C1C]" data-reference-error>{error}</p> : null}
      {dialog ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/40 p-4" data-add-reference-dialog onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(false); }}>
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Add reference" className="max-h-[90dvh] w-full max-w-[600px] overflow-y-auto rounded-2xl bg-white p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Add reference</h2>
              <button type="button" className="text-sm font-semibold text-[#6B7280]" onClick={() => setDialog(false)}>Close</button>
            </div>
            <div className="mb-4 flex flex-wrap gap-4 text-sm">
              <button type="button" className={cn("font-semibold", path === "campaigns" ? "text-[#111827]" : "text-[#652DFF]")} data-add-path="campaigns" onClick={() => setPath("campaigns")}>From campaigns</button>
              <button type="button" className={cn("font-semibold", path === "url" ? "text-[#111827]" : "text-[#652DFF]")} data-add-path="url" onClick={() => setPath("url")}>Paste URL</button>
              <button type="button" className={cn("font-semibold", path === "upload" ? "text-[#111827]" : "text-[#652DFF]")} data-add-path="upload" onClick={() => setPath("upload")}>Upload video</button>
            </div>
            {path === "campaigns" ? (
              <div className="grid gap-3" data-campaign-add>
                <p className="text-[12px] text-[#6B7280]">Adding a post attaches it. Discovery alone does not.</p>
                {(matches?.posts || []).length ? (matches?.posts || []).map((post) => {
                  const taken = Boolean(post.url && attached.has(post.url));
                  return (
                    <div key={post.url || post.creatorName} className="flex items-center justify-between gap-3 border-b border-[#F3F4F8] py-2 text-sm">
                      <span className="min-w-0 truncate">{post.creatorName || "Creator"} · {post.type || "Post"}</span>
                      <button type="button" className="shrink-0 font-semibold text-[#652DFF] disabled:opacity-40" disabled={taken || !post.url || Boolean(busy)} onClick={() => void post({ op: "import-video", url: post.url, creator: post.creatorName || "", source: "match" }, "import-video")}>{taken ? "Attached" : "Add to reference"}</button>
                    </div>
                  );
                }) : <p className="text-sm text-[#6B7280]">No campaign posts are stored for this product.</p>}
              </div>
            ) : null}
            {path === "url" ? (
              <form className="grid gap-3" data-add-reference-form="open" onSubmit={(event) => { event.preventDefault(); void post({ op: "import-preview", url, creator, publishedAt, source: "url" }, "import-preview"); }}>
                <label className="text-sm font-semibold">URL
                  <input ref={urlRef} className={inputClass + " mt-1 text-sm"} value={url} aria-label="Source URL" placeholder="https://" onChange={(event) => setUrl(event.target.value)} required />
                </label>
                <button type="button" className="w-fit text-[12px] font-semibold text-[#652DFF]" onClick={() => setMetaOpen((value) => !value)}>Optional details</button>
                {metaOpen ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input className={inputClass + " mt-0 text-sm"} value={creator} aria-label="Creator" placeholder="Creator" onChange={(event) => setCreator(event.target.value)} />
                    <input className={inputClass + " mt-0 text-sm"} value={publishedAt} aria-label="Published date" placeholder="Date" onChange={(event) => setPublishedAt(event.target.value)} />
                  </div>
                ) : null}
                <div className="flex gap-3">
                  <button type="submit" className="rounded-lg bg-[#652DFF] px-3 py-1.5 text-sm font-semibold text-white" disabled={Boolean(busy)}>{busy === "import-preview" ? "Importing…" : "Import & Preview"}</button>
                  <button type="button" className="text-sm font-semibold text-[#6B7280]" onClick={() => setDialog(false)}>Cancel</button>
                </div>
              </form>
            ) : null}
            {path === "upload" ? (
              <div className="grid gap-3">
                <label className="text-sm font-semibold">Video file
                  <input className="mt-2 block w-full text-sm" type="file" accept="video/mp4,video/webm,video/quicktime" onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); }} />
                </label>
                {fileName ? <p className="text-[12px] text-[#6B7280]">{busy === "upload" ? "Uploading" : "Selected"} · {fileName}</p> : null}
                <button type="button" className="w-fit text-sm font-semibold text-[#6B7280]" onClick={() => setDialog(false)}>Cancel</button>
              </div>
            ) : null}
            {error ? <p className="mt-3 text-sm text-[#B91C1C]">{error}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
