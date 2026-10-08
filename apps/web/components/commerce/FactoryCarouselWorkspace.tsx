"use client";

import { useEffect, useMemo, useState } from "react";
import { Btn } from "@/components/ui";
import { SLIDE_LAYOUTS, type CarouselDoc, type CarouselSlide, type SlideLayout } from "@/lib/factory-carousel-layout";

type Media = { id: string; url: string };

const LAYOUTS: SlideLayout[] = ["split-left", "split-right", "top-copy", "detail", "cta"];

export function FactoryCarouselWorkspace({
  productionId,
  productId,
  title,
  market,
  locale,
  revision,
  carousel,
  busy,
  onBack,
  onGenerate,
  onSave,
  onReload,
}: {
  productionId: string;
  productId: string;
  title: string;
  market: string;
  locale: string;
  revision: number;
  carousel: CarouselDoc | null;
  busy: boolean;
  onBack: () => void;
  onGenerate: (direction: string) => Promise<boolean>;
  onSave: (slideId: string, patch: Partial<CarouselSlide>, expectedRevision: number) => Promise<boolean>;
  onReload: () => Promise<void>;
}) {
  const [direction, setDirection] = useState(carousel?.direction || "");
  const [selected, setSelected] = useState(carousel?.slides[0]?.id || "");
  const [drafts, setDrafts] = useState<Record<string, { headline: string; body: string }>>({});
  const [saveState, setSaveState] = useState("");
  const [error, setError] = useState("");
  const [media, setMedia] = useState<Media[]>([]);
  const [affiliate, setAffiliate] = useState("");
  const slide = carousel?.slides.find((row) => row.id === selected) || carousel?.slides[0];

  useEffect(() => {
    setSelected(carousel?.slides[0]?.id || "");
    setDrafts({});
  }, [carousel?.slides.map((row) => row.id).join("|")]);

  useEffect(() => {
    let cancel = false;
    void fetch("/api/commerce/catalog").then((res) => res.json()).then((json) => {
      if (cancel) return;
      const match = (json.skus || []).find((row: { legacyProductId?: string }) => row.legacyProductId === productId);
      const id = match?.id;
      setMedia((json.media || []).filter((row: { skuId: string }) => row.skuId === id).map((row: { id: string; url: string }) => ({ id: row.id, url: row.url })));
      const listing = (json.listings || []).find((row: { skuId: string; market: string }) => row.skuId === id && row.market === market);
      const dest = (json.destinations || []).find((row: { listingId: string; trackedUrl?: string | null }) => row.listingId === listing?.id && row.trackedUrl);
      setAffiliate(dest?.trackedUrl || "");
    }).catch(() => undefined);
    return () => { cancel = true; };
  }, [productId, market]);

  useEffect(() => {
    if (!slide) return;
    const draft = drafts[slide.id];
    if (!draft) return;
    if (draft.headline === slide.headline && draft.body === slide.body) return;
    const timer = window.setTimeout(() => {
      setSaveState("Saving…");
      void onSave(slide.id, draft, revision).then((ok) => {
        setSaveState(ok ? "Saved" : "Not saved");
        if (ok) {
          setDrafts((current) => {
            const next = { ...current };
            delete next[slide.id];
            return next;
          });
          void onReload();
        }
      });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [drafts, slide?.id, slide?.headline, slide?.body, revision]);

  const view = useMemo(() => {
    if (!slide) return null;
    const draft = drafts[slide.id];
    return { ...slide, headline: draft?.headline ?? slide.headline, body: draft?.body ?? slide.body };
  }, [slide, drafts]);

  async function download(kind: "zip" | number) {
    setError("");
    const pending = view && drafts[view.id];
    if (pending && slide && (pending.headline !== slide.headline || pending.body !== slide.body)) {
      const ok = await onSave(slide.id, pending, revision);
      if (!ok) { setError("Save the slide before exporting."); return; }
      await onReload();
    }
    const query = kind === "zip" ? `production=${productionId}` : `production=${productionId}&slide=${kind}`;
    const res = await fetch(`/api/ugc-factory/v2/export?${query}`);
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json.error || "The export did not finish.");
      return;
    }
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = kind === "zip" ? "carousel.zip" : `slide-0${kind}.png`;
    link.click();
    URL.revokeObjectURL(href);
  }

  async function copyText(value: string) {
    try { await navigator.clipboard.writeText(value); setSaveState("Copied"); }
    catch { setSaveState(value); }
  }

  return (
    <div className="@container/carousel" data-carousel-workspace>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Btn type="button" variant="ghost" onClick={onBack}>Back to productions</Btn>
        <p className="text-sm font-semibold">Carousel</p>
      </div>
      <h1 className="mt-3 text-[22px] font-black tracking-tight">{title}</h1>
      <p className="text-xs text-[#6B7280]">{market} · {locale}</p>
      <div className="mt-4 grid gap-4 @min-[960px]/carousel:grid-cols-[280px_minmax(0,1fr)]">
        <div className="grid content-start gap-3">
          <label className="text-sm">Additional direction, optional
            <textarea className="mt-1 min-h-20 w-full rounded-lg border border-[#E6E8EE] p-2 text-sm" value={direction} placeholder="Keep the tone casual and focus on the product details." onChange={(event) => setDirection(event.target.value)} />
          </label>
          {carousel?.fixture ? <p className="text-sm text-[#9A3412]" data-carousel-fixture>Fixture copy. The script model was not called.</p> : null}
          {view?.warnings.map((warning) => <p key={warning} className="text-sm text-[#9A3412]">{warning}</p>)}
          {error ? <p className="text-sm text-[#9A3412]">{error}</p> : null}
          <p className="text-xs text-[#6B7280]">{saveState}</p>
          {!carousel ? <Btn type="button" data-generate-carousel disabled={busy} onClick={() => void onGenerate(direction)}>Generate carousel</Btn> : <Btn type="button" data-export-carousel disabled={busy} onClick={() => void download("zip")}>Export carousel</Btn>}
          {carousel ? <button type="button" className="min-h-10 text-left text-sm font-semibold" disabled={busy} onClick={() => void onGenerate(direction)}>Regenerate all five</button> : null}
          <details>
            <summary className="cursor-pointer text-sm text-[#6B7280]">Advanced</summary>
            <p className="mt-2 text-xs text-[#6B7280]">Copy uses the configured script model once, when you generate. Photos stay the stored product files. Export is 1080 × 1350.</p>
          </details>
        </div>
        <div>
          {view ? (
            <>
              <div className="flex gap-2 overflow-x-auto pb-2" data-slide-strip>
                {carousel?.slides.map((row, index) => (
                  <button key={row.id} type="button" className={`w-16 shrink-0 rounded-lg border p-1 text-xs ${row.id === view.id ? "border-[#111827]" : "border-[#E6E8EE]"}`} onClick={() => setSelected(row.id)}>{index + 1}</button>
                ))}
              </div>
              <SlidePreview slide={view} media={media} />
              <div className="mt-3 grid gap-2">
                <label className="text-sm">Headline
                  <input className="mt-1 min-h-10 w-full rounded-lg border border-[#E6E8EE] p-2 text-sm" value={view.headline} onChange={(event) => setDrafts((current) => ({ ...current, [view.id]: { headline: event.target.value, body: view.body } }))} />
                </label>
                <label className="text-sm">Body
                  <textarea className="mt-1 min-h-16 w-full rounded-lg border border-[#E6E8EE] p-2 text-sm" value={view.body} onChange={(event) => setDrafts((current) => ({ ...current, [view.id]: { headline: view.headline, body: event.target.value } }))} />
                </label>
                <label className="text-sm">Photo
                  <select className="mt-1 min-h-10 w-full rounded-lg border border-[#E6E8EE] p-2 text-sm" value={view.mediaId} onChange={(event) => void onSave(view.id, { mediaId: event.target.value }, revision).then((ok) => { if (ok) void onReload(); })}>
                    {media.map((row) => <option key={row.id} value={row.id}>Product photo</option>)}
                  </select>
                </label>
                <label className="text-sm">Layout
                  <select className="mt-1 min-h-10 w-full rounded-lg border border-[#E6E8EE] p-2 text-sm" value={view.layout} onChange={(event) => void onSave(view.id, { layout: event.target.value as SlideLayout }, revision).then((ok) => { if (ok) void onReload(); })}>
                    {LAYOUTS.map((id) => <option key={id} value={id}>{SLIDE_LAYOUTS[id].label}</option>)}
                  </select>
                </label>
                <label className="text-sm">Product scale {view.scale.toFixed(1)}
                  <input className="mt-1 w-full" type="range" min={0.7} max={1.3} step={0.1} value={view.scale} onChange={(event) => void onSave(view.id, { scale: Number(event.target.value) }, revision).then((ok) => { if (ok) void onReload(); })} />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="min-h-10 rounded-lg border px-3 text-sm font-semibold" onClick={() => void download(carousel ? carousel.slides.findIndex((row) => row.id === view.id) + 1 : 1)}>Download this slide</button>
                  <button type="button" className="min-h-10 rounded-lg border px-3 text-sm font-semibold" onClick={() => void copyText(carousel?.caption || "")}>Copy caption</button>
                  {affiliate ? <button type="button" className="min-h-10 rounded-lg border px-3 text-sm font-semibold" data-copy-affiliate={affiliate} onClick={() => void copyText(affiliate)}>Copy affiliate link</button> : <p className="text-sm text-[#6B7280]">No affiliate link is saved for this market.</p>}
                </div>
                {carousel?.caption ? <p className="text-sm">{carousel.caption}</p> : null}
              </div>
            </>
          ) : <p className="text-sm text-[#6B7280]">Generate one five-slide carousel from the stored product photos.</p>}
        </div>
      </div>
    </div>
  );
}

function SlidePreview({ slide, media }: { slide: CarouselSlide; media: Media[] }) {
  const layout = SLIDE_LAYOUTS[slide.layout];
  const photo = media.find((row) => row.id === slide.mediaId);
  const boxW = layout.product.w * slide.scale;
  const boxH = layout.product.h * slide.scale;
  const x = layout.product.x + slide.offsetX + (layout.product.w - boxW) / 2;
  const y = layout.product.y + slide.offsetY;
  return (
    <div className="relative mx-auto aspect-[1080/1350] w-full max-w-[420px] overflow-hidden rounded-2xl bg-[#F7F4EF]" data-slide-preview={slide.role}>
      {photo ? <img src={photo.url} alt="" className="absolute object-contain" style={{ left: `${(x / 1080) * 100}%`, top: `${(y / 1350) * 100}%`, width: `${(boxW / 1080) * 100}%`, height: `${(boxH / 1350) * 100}%` }} /> : null}
      <div className="absolute" style={{ left: `${(layout.text.x / 1080) * 100}%`, top: `${(layout.text.y / 1350) * 100}%`, width: `${(layout.text.w / 1080) * 100}%` }}>
        <p className="text-[15px] font-black leading-tight text-[#111827]">{slide.headline}</p>
        {slide.body ? <p className="mt-1 text-[12px] leading-snug text-[#374151]">{slide.body}</p> : null}
      </div>
    </div>
  );
}
