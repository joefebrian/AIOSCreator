"use client";

import { useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

function bust(url: string, stamp?: string) {
  if (!stamp || url.startsWith("blob:") || url.startsWith("data:")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}t=${encodeURIComponent(stamp)}`;
}

function Frame({
  kicker,
  src,
  stamp,
  placeholder,
  hint,
  busy,
  drop,
  onPick,
}: {
  kicker: string;
  src?: string;
  stamp?: string;
  placeholder: string;
  hint?: string;
  busy?: boolean;
  drop?: boolean;
  onPick?: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const shown = src ? bust(src, stamp) : "";
  const boxClass = cn(
    "relative flex aspect-[3/4] w-full flex-col items-center justify-center overflow-hidden rounded-2xl border-2 bg-[#F3F4F8] transition-colors",
    drop ? "cursor-pointer border-dashed" : "border-solid",
    over ? "border-[#652DFF] bg-[#652DFF]/5" : "border-[#E6E8EE]",
  );

  const inner = (
    <>
      {shown ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={shown} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <>
          <span className="px-3 text-center text-[13px] font-semibold text-[#0B0F2B]">{placeholder}</span>
          {hint ? <span className="mt-1 px-4 text-center text-[11px] leading-snug text-[#9CA3AF]">{hint}</span> : null}
        </>
      )}
      {busy ? (
        <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-[12px] font-semibold">
          Generating…
        </span>
      ) : null}
    </>
  );

  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold tracking-[0.18em] text-[#9CA3AF]">{kicker}</p>
      {drop ? (
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
            if (f) onPick?.(f);
          }}
          className={boxClass}
        >
          {inner}
        </button>
      ) : (
        <div className={boxClass}>{inner}</div>
      )}
      {drop ? (
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick?.(f);
            e.target.value = "";
          }}
        />
      ) : null}
    </div>
  );
}

export function CharacterIdentityStage({
  sourceUrl,
  identityUrl,
  stamp,
  prompt,
  onPrompt,
  busy,
  error,
  onPick,
  onGenerate,
  onLock,
  extra,
}: {
  sourceUrl?: string;
  identityUrl?: string;
  stamp?: string;
  prompt: string;
  onPrompt: (v: string) => void;
  busy?: boolean;
  error?: string;
  onPick: (file: File) => void;
  onGenerate: () => void;
  onLock: () => void;
  extra?: ReactNode;
}) {
  return (
    <div>
      <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
        <Frame
          kicker="OPTIONAL · PHYSIQUE REF"
          src={sourceUrl}
          stamp={stamp}
          placeholder="Skip, or drop a photo"
          hint="Optional. Build / silhouette only — not a face lock"
          drop
          onPick={onPick}
        />
        <Frame
          kicker="FACE LOCK · HEADSHOT"
          src={identityUrl}
          stamp={stamp}
          placeholder="Headshot lands here"
          hint={sourceUrl ? "Same face, shoulders-up. Body lock fills in the background." : "Shoulders-up headshot. Body lock generates after."}
          busy={busy}
        />
      </div>

      <label className="mt-4 block max-w-3xl text-[12px] text-[#6B7280]">
        Prompt
        <textarea
          value={prompt}
          onChange={(e) => onPrompt(e.target.value)}
          rows={4}
          className="mt-1 w-full resize-none rounded-lg border border-[#E6E8EE] bg-white p-2 text-sm outline-none"
        />
      </label>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onGenerate}
          className="rounded-lg bg-[#652DFF] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Generating…" : sourceUrl ? "Generate from reference" : "Generate from prompt"}
        </button>
        <button
          type="button"
          disabled={busy || !sourceUrl}
          onClick={onLock}
          className="rounded-lg border border-[#E6E8EE] bg-white px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          Use photo as-is
        </button>
        {extra}
      </div>
      {error ? <p className="mt-2 text-[12px] text-red-600">{error}</p> : null}
      <p className="mt-2 max-w-3xl text-[12px] leading-snug text-[#9CA3AF]">
        Awal bisa prompt doang. Foto opsional: generate from reference = orang baru, perawakan sama. Use photo as-is =
        orang di foto. Set selalu dari plate kanan.
      </p>
    </div>
  );
}
