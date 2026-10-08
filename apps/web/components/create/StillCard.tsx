"use client";

import { useRef, useState } from "react";

export function StillCard({
  title,
  src,
  prompt,
  onPrompt,
  onSrc,
  lock,
  referenceUrl,
}: {
  title: string;
  src?: string;
  prompt: string;
  onPrompt?: (v: string) => void;
  onSrc: (url: string) => void;
  lock?: boolean;
  referenceUrl?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [exportUrl, setExportUrl] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function generate() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/jobs/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          lock: Boolean(lock),
          referenceUrl: lock ? undefined : referenceUrl,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.status);
      onSrc(json.mediaUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function lockFile(file: File) {
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/characters/lock", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.status);
      onSrc(json.mediaUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[#E6E8EE] bg-white">
      <div className="relative aspect-[3/4] bg-[#F3F4F8]">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-[11px] tracking-[0.16em] text-[#9CA3AF]">
            {lock ? "LOCK PHOTO FIRST" : "STILL"}
          </div>
        )}
      </div>
      <div className="space-y-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B7280]">{title}</p>
          <div className="flex gap-1">
            {lock ? (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void lockFile(f);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                  className="rounded-md bg-[#652DFF] px-2 py-0.5 text-[11px] font-semibold text-white disabled:opacity-50"
                >
                  1 · LOCK photo
                </button>
              </>
            ) : null}
            <button
              type="button"
              disabled={busy || (!lock && !referenceUrl)}
              onClick={() => void generate()}
              className={
                lock
                  ? "rounded-md border border-[#E6E8EE] px-2 py-0.5 text-[11px] disabled:opacity-50"
                  : "rounded-md bg-[#652DFF] px-2 py-0.5 text-[11px] font-semibold text-white disabled:opacity-50"
              }
            >
              {busy ? "…" : lock ? "GEN fallback" : "GEN"}
            </button>
          </div>
        </div>
        {onPrompt ? (
          <textarea
            value={prompt}
            onChange={(e) => onPrompt(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-md bg-[#F8FAFC] p-2 text-[12px] leading-snug outline-none"
          />
        ) : null}
        {src ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              setError("");
              void fetch("/api/jobs/upscale", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ imageUrl: src }),
              })
                .then(async (res) => {
                  const json = await res.json();
                  if (!res.ok) throw new Error(json.error || json.status);
                  setExportUrl(json.mediaUrl);
                })
                .catch((err) => setError(err instanceof Error ? err.message : String(err)))
                .finally(() => setBusy(false));
            }}
            className="text-[11px] font-semibold text-[#652DFF] disabled:opacity-50"
          >
            {busy ? "…" : "Export 4K"}
          </button>
        ) : null}
        {exportUrl ? (
          <a href={exportUrl.includes("?") ? `${exportUrl}&download=1` : `${exportUrl}?download=1`} download className="block text-[11px] text-[#652DFF]">
            Download 2160×3840
          </a>
        ) : null}
        {error ? <p className="text-[11px] text-red-600">{error}</p> : null}
        {lock ? (
          <p className="text-[11px] text-[#6B7280]">Photo lock is #1 for pores/texture. GEN only if you have no photo.</p>
        ) : !referenceUrl ? (
          <p className="text-[11px] text-[#9CA3AF]">Lock a character first.</p>
        ) : null}
      </div>
    </div>
  );
}
