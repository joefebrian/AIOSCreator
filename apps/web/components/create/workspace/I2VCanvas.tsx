"use client";

import { useState } from "react";
import { CharacterSelectContent, type SelectAsset } from "@/components/create/CharacterSelectContent";
import { cn } from "@/lib/cn";
import { thumbSrc } from "@/lib/media-url";

export type I2VStill = { url: string; label: string };

export function I2VCanvas({
  name,
  refImage,
  setRefImage,
  identity,
  stills,
  inspiration,
  prompt,
  setPrompt,
}: {
  name: string;
  refImage: string;
  setRefImage: (v: string) => void;
  identity: string | null;
  stills: I2VStill[];
  inspiration: SelectAsset[];
  prompt: string;
  setPrompt: (v: string) => void;
}) {
  const [picker, setPicker] = useState(false);
  const library = stills.filter((s) => s.url);
  const generation: SelectAsset[] = library.map((s) => ({ url: s.url, kind: "image", label: s.label }));

  return (
    <div className="p-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
        <div className="rounded-xl border border-dashed border-[#FECACA] p-4">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-[#9CA3AF]">REFERENCE</p>
          <div className="mt-3 flex min-h-[200px] items-center justify-center">
            {refImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbSrc(refImage, 720)} alt="" className="max-h-[280px] rounded-lg object-contain" />
            ) : (
              <p className="text-center text-[13px] text-[#6B7280]">
                Select content from @{name}’s Generation, or upload.
              </p>
            )}
          </div>
          {library.length ? (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {library.map((s) => {
                const on = s.url === refImage;
                return (
                  <button
                    key={s.url}
                    type="button"
                    title={s.label}
                    onClick={() => setRefImage(s.url)}
                    className={cn(
                      "h-20 w-14 shrink-0 overflow-hidden rounded-lg border",
                      on ? "border-[#E11D48] ring-2 ring-[#E11D48]/30" : "border-[#E5E7EB]",
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={thumbSrc(s.url, 160)} alt={s.label} className="h-full w-full object-cover" loading="lazy" decoding="async" />
                  </button>
                );
              })}
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setPicker(true)}
              className="rounded-lg bg-[#E11D48] px-3 py-2 text-[12px] font-semibold text-white"
            >
              Select content
            </button>
            {identity && identity !== refImage ? (
              <button
                type="button"
                onClick={() => setRefImage(identity)}
                className="rounded-lg border border-[#E5E7EB] px-3 py-2 text-[12px] font-semibold"
              >
                Use identity
              </button>
            ) : null}
            <label className="cursor-pointer rounded-lg border border-[#E5E7EB] px-3 py-2 text-[12px] font-semibold text-[#6B7280]">
              Upload
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const form = new FormData();
                  form.append("file", f);
                  form.append("kind", "character");
                  const res = await fetch("/api/media/upload", { method: "POST", body: form });
                  const json = await res.json();
                  if (res.ok) setRefImage(json.mediaUrl);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </div>
        <div className="rounded-xl border border-dashed border-[#FECACA] p-3">
          <p className="text-[12px] font-semibold">Prompt</p>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={10}
            placeholder="Natural blink and breath, slight body sway…"
            className="mt-2 w-full resize-none text-[13px] outline-none"
          />
        </div>
      </div>
      <CharacterSelectContent
        open={picker}
        onClose={() => setPicker(false)}
        onPick={(url) => setRefImage(url)}
        name={name}
        kind="image"
        generation={generation}
        inspiration={inspiration}
        uploadKind="character"
      />
    </div>
  );
}
