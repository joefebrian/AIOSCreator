"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Btn, Page, Surface } from "@/components/ui";
import { isVideoMediaUrl } from "@/lib/media-kind";
import { thumbSrc } from "@/lib/media-url";
import { cn } from "@/lib/cn";
import { RESEARCH_EVENT, RESEARCH_URL_EXTS, RESEARCH_VIDEO, type ResearchExtractRow } from "@/lib/research-flow";

const STEPS = [
  {
    n: "1",
    title: "Drop a file or paste a URL",
    body: `Local file, CDN link with ${RESEARCH_URL_EXTS}, or a TikTok / YouTube / Instagram / X watch URL. Watch pages go through yt-dlp + cookies from Settings.`,
  },
  {
    n: "2",
    title: "Duration is checked",
    body: `Checklist follows the full clip up to ${RESEARCH_VIDEO.maxExtractSec}s. Under ${RESEARCH_VIDEO.minSec}s the motion line is thin. Longer than ${RESEARCH_VIDEO.maxExtractSec}s uses the first ${RESEARCH_VIDEO.maxExtractSec}s.`,
  },
  {
    n: "3",
    title: "Even frames, then Qwen VL",
    body: `3–8 frames across the clip (more if longer). One VL pass writes stills + motion + checklist. Spend cap applies.`,
  },
  {
    n: "4",
    title: "Copy into Create",
    body: "Stills prompt → Characters Chat. Motion line → Image to video. This page does not generate media.",
  },
];

export default function ResearchPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pasteUrl, setPasteUrl] = useState("");
  const [source, setSource] = useState("");
  const [phase, setPhase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [over, setOver] = useState(false);
  const [imagePrompt, setImagePrompt] = useState("");
  const [motionPrompt, setMotionPrompt] = useState("");
  const [firstFrameUrl, setFirstFrameUrl] = useState("");
  const [model, setModel] = useState("");
  const [note, setNote] = useState("");
  const [extractId, setExtractId] = useState("");
  const [durationSec, setDurationSec] = useState<number | undefined>(undefined);
  const [megaPrompt, setMegaPrompt] = useState("");
  const [megaBusy, setMegaBusy] = useState(false);
  const [promptMode, setPromptMode] = useState<"ask" | "mega" | "motion" | "still">("still");
  const [cookieStatus, setCookieStatus] = useState<{
    saved: boolean;
    hosts: string[];
    headerCount: number;
    netscapeCount: number;
  } | null>(null);

  const video = isVideoMediaUrl(source);

  useEffect(() => {
    void fetch("/api/research/cookies")
      .then((r) => r.json())
      .then((j) => setCookieStatus(j))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    function onEvt(e: Event) {
      const d = (e as CustomEvent<{ op?: string; row?: ResearchExtractRow }>).detail;
      if (d?.op === "open" && d.row) openRow(d.row);
    }
    window.addEventListener(RESEARCH_EVENT, onEvt);
    return () => window.removeEventListener(RESEARCH_EVENT, onEvt);
  }, []);

  function resetPrompts() {
    setImagePrompt("");
    setMotionPrompt("");
    setFirstFrameUrl("");
    setModel("");
    setNote("");
    setExtractId("");
    setDurationSec(undefined);
    setMegaPrompt("");
    setPromptMode("still");
  }

  async function extractFrom(url: string, prefix = "") {
    setBusy(true);
    setError("");
    setPhase("Checking duration → sampling frames → Qwen VL…");
    try {
      const res = await fetch("/api/jobs/to-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = (await res.json()) as ResearchExtractRow & { error?: string };
      if (!res.ok) throw new Error(json.error || "extract failed");
      setImagePrompt(json.imagePrompt || "");
      setMotionPrompt(json.motionPrompt || "");
      setFirstFrameUrl(json.firstFrameUrl || "");
      setModel(json.model || "");
      setNote([prefix, json.note].filter(Boolean).join(" "));
      setExtractId(json.id || "");
      setDurationSec(json.windowSec || json.durationSec);
      setMegaPrompt(json.megaPrompt || "");
      setPromptMode(json.kind === "video" ? "ask" : "still");
      window.dispatchEvent(new CustomEvent(RESEARCH_EVENT, { detail: { op: "refresh" } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      setPhase("");
    }
  }

  async function fetchFromUrl(raw: string) {
    const url = raw.trim();
    if (!url) return;
    setError("");
    setPhase("Fetching URL…");
    setBusy(true);
    resetPrompts();
    try {
      const res = await fetch("/api/research/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = (await res.json()) as { mediaUrl?: string; note?: string; error?: string };
      if (!res.ok || !json.mediaUrl) throw new Error(json.error || "import failed");
      setSource(json.mediaUrl);
      await extractFrom(json.mediaUrl, json.note || "");
    } catch (err) {
      setBusy(false);
      setPhase("");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function upload(file: File) {
    setError("");
    setPhase("Uploading…");
    setBusy(true);
    resetPrompts();
    try {
      const form = new FormData();
      form.append("file", file);
      const isVid = /^video\//.test(file.type) || /\.(mp4|webm|mov)$/i.test(file.name);
      form.append("kind", isVid ? "motion" : "character");
      const res = await fetch("/api/media/upload", { method: "POST", body: form });
      const json = (await res.json()) as { mediaUrl?: string; error?: string };
      if (!res.ok || !json.mediaUrl) throw new Error(json.error || "upload failed");
      setSource(json.mediaUrl);
      await extractFrom(json.mediaUrl);
    } catch (err) {
      setBusy(false);
      setPhase("");
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function copy(text: string, key: string) {
    if (!text) return;
    await navigator.clipboard.writeText(text);
    setCopied(key);
    window.setTimeout(() => setCopied(""), 1200);
  }

  function openRow(row: ResearchExtractRow) {
    setSource(row.url);
    setImagePrompt(row.imagePrompt);
    setMotionPrompt(row.motionPrompt);
    setFirstFrameUrl(row.firstFrameUrl || "");
    setModel(row.model);
    setNote(row.note || "");
    setExtractId(row.id);
    setDurationSec(row.windowSec || row.durationSec);
    setMegaPrompt(row.megaPrompt || "");
    setPromptMode(row.kind === "video" ? "ask" : "still");
    setError("");
  }

  async function megaRevamp() {
    if (!imagePrompt && !motionPrompt) return;
    setMegaBusy(true);
    setError("");
    setPhase("Building checklist (local, no extra LLM)…");
    try {
      const res = await fetch("/api/research/mega-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: extractId || undefined,
          imagePrompt,
          motionPrompt,
          durationSec,
          kind: video ? "video" : "image",
        }),
      });
      const json = (await res.json()) as { megaPrompt?: string; model?: string; error?: string };
      if (!res.ok || !json.megaPrompt) throw new Error(json.error || "mega prompt failed");
      setMegaPrompt(json.megaPrompt);
      window.dispatchEvent(new CustomEvent(RESEARCH_EVENT, { detail: { op: "refresh" } }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setMegaBusy(false);
      setPhase("");
    }
  }

  return (
    <Page
      kicker="INTELLIGENCE · RESEARCH"
      title="Research"
      description="Reverse-engineer a still or clip into prompts. Drop media — duration, trim, frames, and Qwen VL run in one pass."
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {[
          { href: "/intelligence/trends", k: "TRENDS", t: "What is moving", d: "Extract mix + YouTube mostPopular + your URLs." },
          { href: "/intelligence/opportunities", k: "OPPORTUNITIES", t: "What to make", d: "Ranked SKUs and topics. Pin / exclude." },
          { href: "/grow/analytics", k: "WINNER HOOKS", t: "What already worked", d: "Scripts and motion lines. Pin a winner." },
        ].map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="rounded-2xl border border-[#E6E8EE] bg-white p-4 shadow-[0_1px_0_rgba(15,23,42,0.03)] hover:border-[#652DFF]/40"
          >
            <p className="text-[10px] font-semibold tracking-[0.16em] text-[#9CA3AF]">{c.k}</p>
            <p className="mt-1 text-[14px] font-bold">{c.t}</p>
            <p className="mt-1 text-[12px] leading-relaxed text-[#6B7280]">{c.d}</p>
          </Link>
        ))}
      </div>
      <Surface className="mb-4">
        <p className="text-[11px] font-semibold tracking-[0.16em] text-[#9CA3AF]">PROCEDURE</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-xl border border-[#E6E8EE] bg-[#F8F8FB] p-3">
              <p className="text-[11px] font-semibold text-[#652DFF]">
                {s.n} · {s.title}
              </p>
              <p className="mt-1 text-[12px] leading-relaxed text-[#4B5563]">{s.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-[#6B7280]">
          Auto-flow: drop a file or paste a URL → fetch full clip (cap {RESEARCH_VIDEO.maxExtractSec}s) → even frames
          → Qwen VL checklist for that duration. Direct CDN links must keep their extension ({RESEARCH_URL_EXTS}).
          Watch pages: cookies live in{" "}
          <Link href="/system/settings" className="font-semibold text-[#652DFF]">
            Settings
          </Link>
          . Cap {RESEARCH_VIDEO.maxExtractSec}s. After extract, pick mega checklist or short Motion (I2V).
        </p>
      </Surface>

      <div className="grid gap-4 lg:grid-cols-2">
        <Surface>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-[#9CA3AF]">SOURCE</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void upload(f);
            }}
            className={cn(
              "relative mt-3 flex min-h-[240px] w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed transition disabled:opacity-60",
              over ? "border-[#652DFF] bg-[#652DFF]/5" : "border-[#E6E8EE] bg-[#F8F8FB]",
            )}
          >
            {source ? (
              video ? (
                <video src={source} className="max-h-[280px] w-full object-contain" controls playsInline preload="metadata" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumbSrc(source, 720)} alt="" className="max-h-[280px] object-contain" />
              )
            ) : (
              <span className="px-6 text-center text-[13px] text-[#6B7280]">
                Drop a photo or mp4, or paste a URL below. Extract starts automatically.
              </span>
            )}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
              e.target.value = "";
            }}
          />
          <form
            className="mt-3 flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void fetchFromUrl(pasteUrl);
            }}
          >
            <input
              value={pasteUrl}
              onChange={(e) => setPasteUrl(e.target.value)}
              disabled={busy}
              placeholder="https://…/clip.mp4  or  https://…/still.jpg"
              className="min-w-[12rem] flex-1 rounded-xl border border-[#E6E8EE] px-3 py-2 text-[13px] outline-none focus:border-[#652DFF] focus:ring-2 focus:ring-[#652DFF]/15 disabled:opacity-60"
            />
            <Btn type="submit" disabled={busy || !pasteUrl.trim()}>
              Fetch URL
            </Btn>
          </form>
          <p className="mt-2 text-[11px] leading-relaxed text-[#9CA3AF]">
            Direct file: path must end with {RESEARCH_URL_EXTS}. Watch page uses{" "}
            <Link href="/system/settings" className="font-semibold text-[#652DFF]">
              Settings → Browser cookies
            </Link>
            {cookieStatus?.saved
              ? ` · on (${cookieStatus.hosts.slice(0, 3).join(", ") || "header"})`
              : " · off"}
            .
          </p>
          {note ? (
            <p className={cn("mt-3 text-[12px] leading-relaxed", note.includes("under") ? "text-[#9A3412]" : "text-[#4B5563]")}>
              {note}
            </p>
          ) : null}
          {phase ? <p className="mt-2 text-[12px] font-semibold text-[#652DFF]">{phase}</p> : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Btn type="button" disabled={!source || busy} onClick={() => void extractFrom(source)}>
              {busy ? "Running…" : "Run again"}
            </Btn>
            {source ? (
              <Btn
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setSource("");
                  resetPrompts();
                  setError("");
                }}
              >
                Clear
              </Btn>
            ) : null}
            {model ? <span className="text-[11px] text-[#9CA3AF]">{model}</span> : null}
          </div>
          {error ? <p className="mt-2 text-[12px] text-red-600">{error}</p> : null}
        </Surface>

        <Surface>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-[#9CA3AF]">PROMPT</p>
          <label className="mt-3 block text-[12px] font-semibold">Stills</label>
          <textarea
            readOnly
            value={imagePrompt}
            rows={8}
            placeholder="Drop media — this fills after Qwen VL."
            className="mt-1 w-full resize-none rounded-xl border border-[#E6E8EE] p-3 text-[13px] outline-none"
          />
          {promptMode === "motion" ? (
            <>
              <label className="mt-3 block text-[12px] font-semibold">Motion (I2V)</label>
              <textarea
                readOnly
                value={motionPrompt}
                rows={4}
                placeholder="Camera + action from the sampled window…"
                className="mt-1 w-full resize-none rounded-xl border border-[#E6E8EE] p-3 text-[13px] outline-none"
              />
            </>
          ) : null}
          {promptMode === "mega" ? (
            <>
              <label className="mt-3 block text-[12px] font-semibold">Mega checklist</label>
              <p className="mt-1 text-[11px] leading-relaxed text-[#6B7280]">
                Lip sync, timed beats, camera, audio, negative. Same VL pass — not a second generate. Paste into Wan /
                Kling / Seedance as written.
              </p>
              <textarea
                value={megaPrompt}
                onChange={(e) => setMegaPrompt(e.target.value)}
                rows={12}
                placeholder="Checklist from the clip…"
                className="mt-1 w-full resize-none rounded-xl border border-[#E6E8EE] p-3 text-[13px] outline-none"
              />
            </>
          ) : null}
          {promptMode === "mega" || promptMode === "motion" ? (
            <button
              type="button"
              className="mt-2 text-[12px] font-semibold text-[#652DFF]"
              onClick={() => setPromptMode("ask")}
            >
              Change: mega checklist or Motion (I2V)?
            </button>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Btn type="button" variant="ghost" disabled={!imagePrompt} onClick={() => void copy(imagePrompt, "still")}>
              {copied === "still" ? "Copied" : "Copy stills"}
            </Btn>
            {promptMode === "motion" && motionPrompt ? (
              <Btn type="button" variant="ghost" onClick={() => void copy(motionPrompt, "motion")}>
                {copied === "motion" ? "Copied" : "Copy motion"}
              </Btn>
            ) : null}
            {promptMode === "mega" ? (
              <>
                <Btn type="button" variant="ghost" disabled={!megaPrompt} onClick={() => void copy(megaPrompt, "mega")}>
                  {copied === "mega" ? "Copied" : "Copy checklist"}
                </Btn>
                {!megaPrompt && (imagePrompt || motionPrompt) ? (
                  <Btn type="button" variant="ghost" disabled={megaBusy} onClick={() => void megaRevamp()}>
                    {megaBusy ? "Building…" : "Rebuild checklist (free)"}
                  </Btn>
                ) : null}
              </>
            ) : null}
            <Link href="/create/characters" className="inline-flex items-center rounded-xl border border-[#E6E8EE] px-3.5 py-2 text-[13px] font-semibold hover:border-[#652DFF]/40">
              Characters
            </Link>
            <Link
              href="/create/studio"
              className="inline-flex items-center rounded-xl border border-[#E6E8EE] px-3.5 py-2 text-[13px] font-semibold hover:border-[#652DFF]/40"
            >
              AI Studio
            </Link>
          </div>
          {firstFrameUrl && video ? (
            <p className="mt-2 text-[11px] text-[#9CA3AF]">First sampled frame saved if you need a still for I2V.</p>
          ) : null}
        </Surface>
      </div>

      {promptMode === "ask" ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-[#9CA3AF]">VIDEO EXTRACT</p>
            <h2 className="mt-1 text-lg font-black">Need a mega checklist?</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-[#4B5563]">
              Yes = timed sheet (lip sync, beats, camera, negatives) for paid I2V. No extra generate — already in this
              extract. No = short Motion (I2V) line only.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Btn
                type="button"
                onClick={() => {
                  setPromptMode("mega");
                  if (!megaPrompt) void megaRevamp();
                }}
              >
                Yes, mega checklist
              </Btn>
              <Btn type="button" variant="ghost" onClick={() => setPromptMode("motion")}>
                No, Motion (I2V) only
              </Btn>
            </div>
          </div>
        </div>
      ) : null}
    </Page>
  );
}
