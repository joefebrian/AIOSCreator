"use client";

import { PAID_I2V_ENGINES } from "@/lib/paid-i2v";

export function ReplicateCanvas({
  url,
  setUrl,
  variation,
  setVariation,
  draftOnly,
  setDraftOnly,
  engineId,
  setEngineId,
  engines,
}: {
  url: string;
  setUrl: (v: string) => void;
  variation: string;
  setVariation: (v: string) => void;
  draftOnly: boolean;
  setDraftOnly: (v: boolean) => void;
  engineId: string;
  setEngineId: (v: string) => void;
  engines: { id: string; name: string; status: string }[];
}) {
  const paid = engines.filter((e) => (PAID_I2V_ENGINES as readonly string[]).includes(e.id));
  return (
    <div className="mx-auto max-w-xl p-6">
      <p className="text-[11px] font-semibold tracking-[0.16em] text-[#9CA3AF]">REPLICATE</p>
      <h2 className="mt-1 text-lg font-black">TikTok → this character</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-[#4B5563]">
        Paste a TikTok URL. We judge if it is a single-person 9:16 clip, lock your identity on stills first (GPU or Grok
        Imagine), then paid I2V and stitch. No phone posting.
      </p>
      <label className="mt-5 block text-[12px] font-semibold text-[#6B7280]">Reference URL</label>
      <input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://www.tiktok.com/@…/video/…"
        className="mt-1 w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm outline-none"
      />
      <label className="mt-4 block text-[12px] font-semibold text-[#6B7280]">Change vs original (optional)</label>
      <textarea
        value={variation}
        onChange={(e) => setVariation(e.target.value)}
        rows={3}
        placeholder="Same beat, hold the SKU / beach / different outfit…"
        className="mt-1 w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm outline-none"
      />
      <label className="mt-4 block text-[12px] font-semibold text-[#6B7280]">Paid I2V</label>
      <select
        value={engineId}
        onChange={(e) => setEngineId(e.target.value)}
        className="mt-1 w-full rounded-xl border border-[#E5E7EB] px-3 py-2 text-sm"
      >
        {paid.map((e) => (
          <option key={e.id} value={e.id} disabled={e.status !== "ready"}>
            {e.name}
            {e.status !== "ready" ? " · need key" : ""}
          </option>
        ))}
      </select>
      <label className="mt-4 flex items-center gap-2 text-[13px] text-[#4B5563]">
        <input type="checkbox" checked={draftOnly} onChange={(e) => setDraftOnly(e.target.checked)} />
        Stills only — review frames, skip paid video
      </label>
    </div>
  );
}
