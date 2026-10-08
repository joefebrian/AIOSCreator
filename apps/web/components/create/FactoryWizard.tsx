"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CREATOR_HAIR, CREATOR_SKIN, CREATOR_WARDROBE, type CreatorLook } from "@/lib/factory-native-audio";
import {
  WIZARD_HOOKS,
  asRatio,
  wizardBlockers,
  wizardCostUsd,
  type WizardDraft,
  type WizardDuration,
  type WizardHook,
  type WizardRatio,
} from "@/lib/factory-wizard";
import { Btn, inputClass } from "@/components/ui";
import { cn } from "@/lib/cn";
import { thumbSrc } from "@/lib/media-url";

type Product = { id: string; title: string; image: string };
type Market = { id: string; label: string; locales: string[]; currency: string };
type Sheet = {
  name: string;
  spokenName: string;
  locale: string;
  locales: string[];
  images: { url: string; role: string }[];
  facts: { id: string; statement: string; source: string }[];
  withheld: number;
  description: string;
  listings: { id: string; marketplace: string; variantReview: string; sourceUrl: string }[];
};
type JobRow = { id: string; status?: string; mediaUrl?: string; error?: string; progress?: string };

const STEPS = ["Preview & script", "Creator", "Volume", "Generate"];

export function FactoryWizard({ onEarlier }: { onEarlier: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [draft, setDraft] = useState<WizardDraft | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [query, setQuery] = useState("");
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [customVolume, setCustomVolume] = useState(false);
  const idRef = useRef("");
  const pulledStill = useRef("");
  const dialogRef = useRef("");

  async function load() {
    const res = await fetch("/api/ugc-factory/wizard");
    const json = await res.json();
    setProducts(json.products || []);
    setMarkets(json.markets || []);
    if (json.draft?.id) {
      idRef.current = json.draft.id;
      dialogRef.current = json.draft.dialog || "";
      setDraft(json.draft);
      if (json.draft.catalogProductId) {
        const sheetRes = await fetch("/api/ugc-factory/wizard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ op: "sheet", catalogProductId: json.draft.catalogProductId, market: json.draft.market, locale: json.draft.locale }),
        });
        const sheetJson = await sheetRes.json();
        if (sheetRes.ok) setSheet(sheetJson);
      }
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const jobKey = `${draft?.stillJobId || ""}:${(draft?.clipJobIds || []).join(",")}`;
  useEffect(() => {
    const ids = [draft?.stillJobId, ...(draft?.clipJobIds || [])].filter((id): id is string => Boolean(id));
    if (!ids.length) return;
    let stop = false;
    let timer = 0;
    async function tick() {
      const rows = await Promise.all(ids.map(async (id) => {
        const res = await fetch(`/api/jobs/${id}`);
        const json = await res.json();
        return { id, status: json.status, mediaUrl: json.mediaUrl, error: json.error, progress: json.progress } as JobRow;
      }));
      if (stop) return;
      setJobs(rows);
      const still = rows.find((row) => row.id === draft?.stillJobId);
      if (still?.status === "completed" && still.mediaUrl && still.mediaUrl !== draft?.stillUrl && pulledStill.current !== still.mediaUrl) {
        pulledStill.current = still.mediaUrl;
        const res = await fetch("/api/ugc-factory/wizard");
        const json = await res.json();
        if (!stop && json.draft) setDraft(json.draft);
      }
      if (rows.some((row) => row.status === "running" || row.status === "queued")) timer = window.setTimeout(() => void tick(), 3000);
    }
    void tick();
    return () => {
      stop = true;
      window.clearTimeout(timer);
    };
  }, [jobKey, draft?.stillJobId, draft?.stillUrl, draft?.clipJobIds]);

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/ugc-factory/wizard", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Request failed");
    return json;
  }

  function ensureId() {
    if (!idRef.current) idRef.current = crypto.randomUUID();
    return idRef.current;
  }

  async function save(patch: Record<string, unknown>) {
    setError("");
    const json = await post({ op: "save", id: ensureId(), ...patch });
    setDraft(json.draft);
    if (json.sheet) setSheet(json.sheet);
    if (json.sheetError) setError(json.sheetError);
    return json.draft as WizardDraft;
  }

  const listing = sheet?.listings.find((row) => row.id === draft?.listingId) || sheet?.listings[0];
  const blockers = useMemo(() => {
    if (!draft?.catalogProductId) return ["Choose a SKU."];
    if (!sheet) return ["Loading the SKU."];
    return wizardBlockers({
      productImageUrl: draft.productImageUrl,
      listingReview: listing?.variantReview || "",
      eligibleFactCount: sheet.facts.length,
      dialog: draft.dialog,
      durationSec: draft.durationSec,
      stillUrl: draft.stillUrl,
      stillAspect: draft.stillAspect,
      ratio: draft.ratio,
      stillSource: draft.stillSource,
      volume: draft.volume,
    });
  }, [draft, sheet, listing?.variantReview]);

  const matches = products.filter((row) => row.title.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8);
  const stillJob = jobs.find((row) => row.id === draft?.stillJobId);
  const clipJobs = (draft?.clipJobIds || []).map((id) => jobs.find((row) => row.id === id) || { id });
  const previewVideo = clipJobs.find((row) => row.mediaUrl)?.mediaUrl || "";
  const previewImage = draft?.stillUrl || draft?.productImageUrl || "";
  const cost = wizardCostUsd(draft?.durationSec || 10, draft?.volume || 1);

  async function pickProduct(product: Product) {
    setBusy("sku");
    setNotice("");
    try {
      await save({
        catalogProductId: product.id,
        market: draft?.market || "MY",
        locale: draft?.locale || "en-MY",
        dialog: "",
        productImageUrl: "",
      });
      setQuery("");
      setStep(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function writeDialog() {
    setBusy("dialog");
    setError("");
    try {
      const json = await post({ op: "write-dialog", id: ensureId() });
      dialogRef.current = json.draft?.dialog || "";
      setDraft(json.draft);
      setNotice("Dialog saved. No video was started.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function generatePerson() {
    setBusy("still");
    setError("");
    try {
      const look = draft?.look;
      if (!look) throw new Error("Choose the look first.");
      await save({ look });
      const json = await post({ op: "creator-still", id: ensureId() });
      setDraft(json.draft);
      setNotice("Generating the person. No video was started.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function uploadPerson(file: File) {
    setBusy("upload");
    setError("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("kind", "character");
      const res = await fetch("/api/media/upload", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed");
      const saved = await post({ op: "attach-still", id: ensureId(), url: json.mediaUrl });
      setDraft(saved.draft);
      setNotice("Uploaded photo is the person plate.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function generateAds() {
    setBusy("generate");
    setError("");
    try {
      await save({ dialog: dialogRef.current });
      const json = await post({ op: "generate", id: ensureId() });
      setDraft(json.draft);
      setNotice(`Queued ${json.jobs?.length || 1} clip${json.jobs?.length === 1 ? "" : "s"}. About $${json.estimateUsd}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  function setLook(patch: Partial<CreatorLook>) {
    const next = { ...(draft?.look || {}), ...patch } as CreatorLook;
    setDraft((current) => current ? { ...current, look: next } : current);
    const ready = next.presentation && next.age && next.hair && next.skin && next.wardrobe;
    if (ready) void save({ look: next }).catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }

  const canStep = (index: number) => {
    if (index <= step) return true;
    if (index >= 1 && !draft?.productImageUrl) return false;
    if (index >= 2 && !draft?.stillUrl) return false;
    if (index >= 3 && !draft?.dialog.trim()) return false;
    return true;
  };

  return (
    <div data-factory-wizard className="min-w-0 max-w-full">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-[#652DFF]">UGC FACTORY</p>
          <h1 className="mt-0.5 text-[22px] font-black tracking-tight">New ad</h1>
          <p className="mt-1 max-w-xl text-[12px] text-[#6B7280]">Pick the SKU, write the spoken line from confirmed facts, generate one adult, then Seedance makes the clip.</p>
        </div>
        <Btn type="button" variant="ghost" onClick={onEarlier}>Earlier drafts</Btn>
      </div>
      {notice ? <p className="mb-3 text-[12px] text-[#374151]">{notice}</p> : null}
      {error ? <p className="mb-3 text-[12px] text-[#B91C1C]">{error}</p> : null}
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        <div className="min-w-0 lg:sticky lg:top-4 lg:self-start">
          <div className="overflow-hidden rounded-2xl border border-[#E6E8EE] bg-[#111827]">
            {previewVideo ? (
              <video className="aspect-[9/16] max-h-[70vh] w-full bg-black object-contain" controls playsInline src={previewVideo} />
            ) : previewImage ? (
              <img src={thumbSrc(previewImage, 640)} alt="" className="aspect-[9/16] max-h-[70vh] w-full object-contain" />
            ) : (
              <div className="grid aspect-[9/16] max-h-[70vh] place-items-center px-4 text-center text-[12px] text-white/70">Catalog photo shows here.</div>
            )}
          </div>
          <p className="mt-2 text-[11px] text-[#6B7280]">{previewVideo ? "Generated clip" : draft?.stillUrl ? "Person plate" : "Product image"}</p>
        </div>
        <div className="min-w-0">
          <div className="mb-3 flex gap-1 overflow-x-auto" role="tablist" aria-label="Wizard steps">
            {STEPS.map((label, index) => (
              <button
                key={label}
                type="button"
                role="tab"
                aria-selected={step === index}
                disabled={!canStep(index)}
                className={cn("shrink-0 rounded-full px-3 py-1 text-[12px] font-semibold disabled:opacity-40", step === index ? "bg-[#111827] text-white" : "text-[#6B7280]")}
                onClick={() => canStep(index) && setStep(index)}
              >
                {index + 1}. {label}
              </button>
            ))}
          </div>

          {step === 0 ? (
            <section className="grid gap-4 rounded-2xl border border-[#E6E8EE] bg-white p-4">
              <div>
                <p className="text-sm font-semibold">Product image</p>
                <p className="mt-1 text-[12px] text-[#6B7280]">Catalog pack shot for this SKU.</p>
                <input className={inputClass} placeholder="Search the catalog" value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search SKU" />
                {query ? (
                  <div className="mt-2 grid gap-1">
                    {matches.map((row) => (
                      <button key={row.id} type="button" className="flex items-center gap-2 rounded-xl border border-[#E6E8EE] px-2 py-1.5 text-left text-[13px]" onClick={() => void pickProduct(row)} disabled={busy === "sku"}>
                        {row.image ? <img src={thumbSrc(row.image, 80)} alt="" className="h-10 w-10 rounded-lg object-cover" /> : <span className="grid h-10 w-10 place-items-center rounded-lg bg-[#F3F4F8] text-[10px] text-[#9CA3AF]">No photo</span>}
                        <span className="min-w-0 truncate">{row.title}</span>
                      </button>
                    ))}
                    {!matches.length ? <p className="text-[12px] text-[#6B7280]">No SKU matches.</p> : null}
                  </div>
                ) : null}
                {sheet ? <p className="mt-2 text-[12px] font-semibold">{sheet.spokenName}</p> : null}
                {sheet?.images.length ? (
                  <div className="mt-2 flex gap-2 overflow-x-auto">
                    {sheet.images.map((image) => (
                      <button key={image.url} type="button" className={cn("shrink-0 overflow-hidden rounded-xl border", draft?.productImageUrl === image.url ? "border-[#111827]" : "border-[#E6E8EE]")} onClick={() => void save({ productImageUrl: image.url }).catch((err) => setError(err instanceof Error ? err.message : String(err)))}>
                        <img src={thumbSrc(image.url, 160)} alt="" className="h-20 w-20 object-cover" />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <label className="block text-[12px]">
                <span className="font-semibold">Market</span>
                <select
                  className={inputClass}
                  aria-label="Market"
                  value={draft?.market || "MY"}
                  onChange={(event) => {
                    const market = event.target.value;
                    const locale = markets.find((row) => row.id === market)?.locales[0] || "";
                    void save({ market, locale, dialog: "" }).catch((err) => setError(err instanceof Error ? err.message : String(err)));
                  }}
                >
                  {markets.map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
                </select>
              </label>
              {sheet && sheet.listings.length > 1 ? (
                <label className="block text-[12px]">
                  <span className="font-semibold">Shop</span>
                  <select className={inputClass} aria-label="Shop listing" value={draft?.listingId || ""} onChange={(event) => void save({ listingId: event.target.value }).catch((err) => setError(err instanceof Error ? err.message : String(err)))}>
                    {sheet.listings.map((row) => <option key={row.id} value={row.id}>{row.marketplace} · {row.variantReview}</option>)}
                  </select>
                </label>
              ) : listing ? <p className="text-[12px] text-[#6B7280]">Shop · {listing.marketplace} · {listing.variantReview}</p> : null}
              <div>
                <p className="text-sm font-semibold">Product description</p>
                <p className="mt-1 text-[12px] text-[#6B7280]">Confirmed facts from the store listing and from reviewed reference lines. Other statements stay out.</p>
                <textarea className={inputClass + " min-h-28"} readOnly value={sheet?.description || ""} placeholder="No confirmed facts for this SKU yet." aria-label="Product description" />
                {sheet && sheet.withheld > 0 ? <p className="mt-1 text-[12px] text-[#6B7280]">{sheet.withheld} other statements stay out until they are confirmed for this SKU.</p> : null}
                {draft?.catalogProductId ? <a className="mt-1 inline-block text-[12px] font-semibold text-[#652DFF]" href={`/commerce/products?product=${draft.catalogProductId}`}>Open product facts</a> : null}
              </div>
              <div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Dialog</p>
                  <span className="text-[11px] text-[#6B7280]">{draft?.dialog.length || 0}/400</span>
                </div>
                <p className="mt-1 text-[12px] text-[#6B7280]">Astra writes this from the facts above. The hook only changes the opening.</p>
                <div className="mt-2 flex gap-1 overflow-x-auto">
                  {WIZARD_HOOKS.map((hook) => (
                    <button key={hook.id} type="button" className={cn("shrink-0 rounded-full border px-3 py-1 text-[12px] font-semibold", draft?.hook === hook.id ? "border-[#111827] bg-[#111827] text-white" : "border-[#E6E8EE]")} onClick={() => void save({ hook: hook.id satisfies WizardHook }).catch((err) => setError(err instanceof Error ? err.message : String(err)))}>{hook.label}</button>
                  ))}
                </div>
                <textarea
                  className={inputClass + " min-h-24"}
                  maxLength={400}
                  value={draft?.dialog || ""}
                  aria-label="Dialog"
                  placeholder="Write dialog from the confirmed facts."
                  onChange={(event) => {
                    dialogRef.current = event.target.value;
                    setDraft((current) => current ? { ...current, dialog: event.target.value } : current);
                  }}
                  onBlur={(event) => { void save({ dialog: event.target.value }).catch((err) => setError(err instanceof Error ? err.message : String(err))); }}
                />
                <Btn className="mt-2" type="button" variant="ghost" disabled={busy === "dialog" || !sheet?.facts.length} onClick={() => void writeDialog()}>{busy === "dialog" ? "Writing…" : "Write dialog"}</Btn>
              </div>
              <div className="flex justify-end">
                <Btn type="button" disabled={!draft?.productImageUrl} onClick={() => setStep(1)}>Next</Btn>
              </div>
            </section>
          ) : null}

          {step === 1 ? (
            <section className="grid gap-3 rounded-2xl border border-[#E6E8EE] bg-white p-4">
              <div>
                <p className="text-sm font-semibold">Creator</p>
                <p className="mt-1 text-[12px] text-[#6B7280]">One generated adult for this market. Seedance needs this photo. The same photo is reused for every ad in the batch.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-[12px] font-semibold">Presentation
                  <select className={inputClass} aria-label="Presentation" value={draft?.look?.presentation || ""} onChange={(event) => setLook({ presentation: event.target.value as CreatorLook["presentation"] })}>
                    <option value="">Choose</option>
                    <option value="woman">Woman</option>
                    <option value="man">Man</option>
                  </select>
                </label>
                <label className="text-[12px] font-semibold">Age
                  <select className={inputClass} aria-label="Age" value={draft?.look?.age || ""} onChange={(event) => setLook({ age: event.target.value as CreatorLook["age"] })}>
                    <option value="">Choose</option>
                    <option value="20s">20s</option>
                    <option value="30s">30s</option>
                  </select>
                </label>
                <label className="text-[12px] font-semibold">Hair
                  <select className={inputClass} aria-label="Hair" value={draft?.look?.hair || ""} onChange={(event) => setLook({ hair: event.target.value })}>
                    <option value="">Choose</option>
                    {CREATOR_HAIR.map((row) => <option key={row} value={row}>{row}</option>)}
                  </select>
                </label>
                <label className="text-[12px] font-semibold">Skin
                  <select className={inputClass} aria-label="Skin" value={draft?.look?.skin || ""} onChange={(event) => setLook({ skin: event.target.value })}>
                    <option value="">Choose</option>
                    {CREATOR_SKIN.map((row) => <option key={row} value={row}>{row}</option>)}
                  </select>
                </label>
                <label className="text-[12px] font-semibold sm:col-span-2">Wardrobe
                  <select className={inputClass} aria-label="Wardrobe" value={draft?.look?.wardrobe || ""} onChange={(event) => setLook({ wardrobe: event.target.value })}>
                    <option value="">Choose</option>
                    {CREATOR_WARDROBE.map((row) => <option key={row} value={row}>{row}</option>)}
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <Btn type="button" disabled={!draft?.look || busy === "still" || stillJob?.status === "running"} onClick={() => void generatePerson()}>{stillJob?.status === "running" ? (stillJob.progress || "Generating…") : "Generate person"}</Btn>
                <label className="inline-flex cursor-pointer items-center rounded-xl border border-[#E6E8EE] px-3.5 py-2 text-[13px] font-semibold">
                  Upload photo
                  <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void uploadPerson(file);
                  }} />
                </label>
              </div>
              {draft?.stillError ? <p className="text-[12px] text-[#B91C1C]">{draft.stillError}</p> : null}
              <div className="flex justify-between">
                <Btn type="button" variant="ghost" onClick={() => setStep(0)}>Back</Btn>
                <Btn type="button" disabled={!draft?.stillUrl} onClick={() => setStep(2)}>Next</Btn>
              </div>
            </section>
          ) : null}

          {step === 2 ? (
            <section className="grid gap-4 rounded-2xl border border-[#E6E8EE] bg-white p-4">
              <div>
                <p className="text-sm font-semibold">How many ads</p>
                <p className="mt-1 text-[12px] text-[#6B7280]">Variants share the person, the product, and the facts. Each extra ad changes the opening.</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {[1, 5, 10].map((count) => (
                    <button key={count} type="button" className={cn("rounded-full border px-3 py-1 text-[12px] font-semibold", !customVolume && draft?.volume === count ? "border-[#111827] bg-[#111827] text-white" : "border-[#E6E8EE]")} onClick={() => { setCustomVolume(false); void save({ volume: count }).catch((err) => setError(err instanceof Error ? err.message : String(err))); }}>x{count}</button>
                  ))}
                  <button type="button" className={cn("rounded-full border px-3 py-1 text-[12px] font-semibold", customVolume ? "border-[#111827] bg-[#111827] text-white" : "border-[#E6E8EE]")} onClick={() => setCustomVolume(true)}>Custom</button>
                </div>
                {customVolume ? <input className={inputClass + " max-w-[8rem]"} type="number" min={1} max={10} aria-label="Custom volume" value={draft?.volume || 1} onChange={(event) => void save({ volume: Number(event.target.value) }).catch((err) => setError(err instanceof Error ? err.message : String(err)))} /> : null}
              </div>
              <div>
                <p className="text-sm font-semibold">Video model</p>
                <div className="mt-2 rounded-xl border border-[#111827] px-3 py-2">
                  <p className="text-[13px] font-semibold">Seedance 2.5</p>
                  <p className="mt-1 text-[12px] text-[#6B7280]">Person photo plus the SKU photo. Speech is in the clip. About ${wizardCostUsd(1, 1).toFixed(2)} per second at 720p.</p>
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold">Duration</p>
                <div className="mt-2 flex gap-1">
                  {([10, 15] as WizardDuration[]).map((seconds) => (
                    <button key={seconds} type="button" className={cn("rounded-full border px-3 py-1 text-[12px] font-semibold", draft?.durationSec === seconds ? "border-[#111827] bg-[#111827] text-white" : "border-[#E6E8EE]")} onClick={() => void save({ durationSec: seconds }).catch((err) => setError(err instanceof Error ? err.message : String(err)))}>{seconds}s</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold">Ratio</p>
                <div className="mt-2 flex gap-1">
                  {(["9:16", "16:9", "1:1"] as WizardRatio[]).map((ratio) => (
                    <button key={ratio} type="button" className={cn("rounded-full border px-3 py-1 text-[12px] font-semibold", draft?.ratio === ratio ? "border-[#111827] bg-[#111827] text-white" : "border-[#E6E8EE]")} onClick={() => void save({ ratio: asRatio(ratio) }).catch((err) => setError(err instanceof Error ? err.message : String(err)))}>{ratio}</button>
                  ))}
                </div>
              </div>
              <div className="flex justify-between">
                <Btn type="button" variant="ghost" onClick={() => setStep(1)}>Back</Btn>
                <Btn type="button" disabled={!draft?.dialog.trim()} onClick={() => setStep(3)}>Next</Btn>
              </div>
            </section>
          ) : null}

          {step === 3 ? (
            <section className="grid gap-3 rounded-2xl border border-[#E6E8EE] bg-white p-4">
              <p className="text-sm font-semibold">Ready to generate</p>
              <ul className="grid gap-1 text-[12px]">
                <Check done={Boolean(draft?.productImageUrl)} label="Product image" />
                <Check done={Boolean(sheet?.facts.length)} label="Confirmed facts" />
                <Check done={Boolean(draft?.dialog.trim())} label="Dialog" />
                <Check done={Boolean(draft?.stillUrl)} label="Creator" />
                <Check done={listing?.variantReview === "REVIEWED"} label="Shop confirmed" />
                <li className="text-[#374151]">Seedance 2.5 · {draft?.durationSec || 10}s · {draft?.ratio || "9:16"} · hook {draft?.hook || "auto"} · {draft?.volume || 1} ad{(draft?.volume || 1) === 1 ? "" : "s"}</li>
              </ul>
              <p className="text-sm font-semibold">{draft?.volume || 1} ad{(draft?.volume || 1) === 1 ? "" : "s"} · ${cost.toFixed(2)}</p>
              {blockers.length ? <p className="text-[12px] text-[#B91C1C]">{blockers[0]}</p> : null}
              {draft?.clipError ? <p className="text-[12px] text-[#B91C1C]">{draft.clipError}</p> : null}
              {clipJobs.some((row) => row.status) ? (
                <ul className="grid gap-1 text-[12px]">
                  {clipJobs.map((row, index) => <li key={row.id}>Ad {index + 1} · {row.status || "queued"}{row.error ? ` · ${row.error}` : ""}</li>)}
                </ul>
              ) : null}
              <div className="flex justify-between">
                <Btn type="button" variant="ghost" onClick={() => setStep(2)}>Back</Btn>
                <Btn type="button" disabled={Boolean(blockers.length) || busy === "generate"} onClick={() => void generateAds()}>{busy === "generate" ? "Queuing…" : `Generate ${draft?.volume || 1} ad${(draft?.volume || 1) === 1 ? "" : "s"}`}</Btn>
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Check({ done, label }: { done: boolean; label: string }) {
  return <li className={done ? "text-[#166534]" : "text-[#6B7280]"}>{done ? "Ready" : "Missing"} · {label}</li>;
}
