"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/cn";

export function DropSlot({
  kind,
  label,
  hint,
  value,
  onChange,
  frame = "portrait",
}: {
  kind: "image" | "video";
  label: string;
  hint: string;
  value: string;
  onChange: (url: string) => void;
  frame?: "portrait" | "wide";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);
  const accept = kind === "image" ? "image/png,image/jpeg,image/webp" : "video/mp4,video/webm,video/quicktime";

  async function send(file: File) {
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", kind === "image" ? "character" : "motion");
      const res = await fetch("/api/media/upload", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "upload failed");
      onChange(json.mediaUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
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
          if (f) void send(f);
        }}
        className={cn(
          "relative flex w-full flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition-colors disabled:opacity-60",
          frame === "wide" ? "aspect-video" : "aspect-[3/4]",
          over ? "border-[#652DFF] bg-[#652DFF]/5" : "border-[#E6E8EE] bg-[#F3F4F8]",
        )}
      >
        {value ? (
          kind === "video" ? (
            <video
              src={value}
              className="absolute inset-0 h-full w-full object-cover"
              muted
              playsInline
              autoPlay
              loop
              preload="metadata"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="absolute inset-0 h-full w-full object-cover" />
          )
        ) : (
          <>
            <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E6E8EE] text-xl text-[#6B7280]">
              +
            </span>
            <span className="mt-3 px-3 text-center text-[13px] font-semibold text-[#0B0F2B]">{label}</span>
            <span className="mt-1 px-3 text-center text-[11px] leading-snug text-[#9CA3AF]">{hint}</span>
          </>
        )}
        {busy ? (
          <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-[12px] font-semibold">
            Uploading…
          </span>
        ) : null}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void send(f);
          e.target.value = "";
        }}
      />
      {value ? (
        <button type="button" onClick={() => onChange("")} className="mt-1 text-[11px] text-[#6B7280]">
          Remove
        </button>
      ) : null}
      {error ? <p className="mt-1 text-[11px] text-red-600">{error}</p> : null}
    </div>
  );
}
