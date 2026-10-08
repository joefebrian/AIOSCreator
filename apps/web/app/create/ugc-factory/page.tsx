"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CommercialContextPicker, type CommercialSelection } from "@/components/commerce/CommercialContextPicker";
import { FactoryWizard } from "@/components/create/FactoryWizard";
import { FactoryCarouselWorkspace } from "@/components/commerce/FactoryCarouselWorkspace";
import { FactoryReferenceWorkspace } from "@/components/commerce/FactoryReferenceWorkspace";
import type { CarouselDoc } from "@/lib/factory-carousel-layout";
import { Btn, inputClass, Surface } from "@/components/ui";
import { cn } from "@/lib/cn";
import { thumbSrc } from "@/lib/media-url";

type Market = { id: string; label: string; locales: string[]; currency: string };
type Recipe = { id: string; label: string; category: string; creator: string; needs?: string; status?: string };
type Product = { id: string; title: string; image: string; identityImage?: string; currency: string; price: string; category: string; provider: string };
type Family = { id: string; label: string; category: string };
type Sku = { id: string; familyId: string; catalogProductId: string | null; variantLabel: string; componentCount: number | null; modelId?: string | null; assets?: Record<string, boolean>; media?: { id: string; role: string; url: string }[] };
type Listing = { id: string; skuId: string; market: string; marketplace: string; sourceUrl: string; equivalence: string };
type Snapshot = { id: string; listingId: string; title: string; price: string | null; currency: string | null; confirmation: string; observedAt: string };
type Fact = { id: string; skuId: string; statement: string; state: string; kind?: string };
type Decision = {
  status: string;
  eligibleRecipeIds: string[];
  rejected: { recipeId: string; missing: string[] }[];
  selectedRecipeId: string | null;
  decisionSource: string | null;
  modelId: string | null;
  confidence: number | null;
  evidenceLabel: string;
  summary: string;
};
type PlanBeat = { id: string; purpose: string; spoken: string | null; onScreen: string | null; action: string; stateIn: string; stateOut: string; factIds: string[]; sourceStartSec?: number | null; sourceEndSec?: number | null; estimatedSec?: number | null; timing?: string | null; uncertainty?: string | null; framing?: string | null; performance?: string | null; audioMode?: string | null; continuity?: string | null; renderNote?: string | null; shotId?: string | null; beatRole?: string | null };
type CreativeBeat = { id: string; role: string; sourceStartSec: number | null; sourceEndSec: number | null; evidence: string | null; spoken: string | null; uncertainty: string | null };
type Plan = { modelId: string; concept: string; spoken: string; delivery: string; beats: PlanBeat[]; creativeBeats?: CreativeBeat[]; audio: string; edit: string; references?: { referenceId: string; analysisVersion: number }[] };
type DrawerTab = "brief" | "script" | "storyboard" | "render";
type Assessment = {
  eligibleRecipeIds: string[];
  rejected: { recipeId: string; label: string; missing: string[] }[];
  planBlockers: string[];
  approvalBlockers?: string[];
  inputs?: { id: string; label: string; done: boolean; action: string }[];
  planningMode?: "TEMPLATE" | "REFERENCE_RECREATE" | "CAROUSEL";
  carousel?: CarouselDoc | null;
  next: { label: string; tab: DrawerTab };
};
type Production = {
  id: string;
  revision: number;
  skuId: string;
  listingId: string;
  market: string;
  locale: string;
  placement: string;
  durationMs: number;
  recipeId: string | null;
  planningMode?: "TEMPLATE" | "REFERENCE_RECREATE" | "CAROUSEL";
  carousel?: CarouselDoc | null;
  creatorMode?: string;
  stage: string;
  issue: string;
  destinationUrl: string;
  destinationVersionId?: string | null;
  impact?: { at: string; skuRevision: number; fields: string[] } | null;
  factReview?: { at: string; note: string } | null;
  parentId?: string | null;
  decision?: Decision | null;
  plan?: Plan | null;
  planApprovedAt?: string | null;
  pinnedReferences?: { referenceId: string; analysisVersion: number; blueprintVersion?: number }[];
  creatorAnchor?: { mediaId: string; url: string; label: string } | null;
  creatorLook?: { presentation: "woman" | "man"; age: "20s" | "30s"; hair: string; skin: string; wardrobe: string } | null;
  deliveryMode?: "creator-led" | "voiceover" | null;
  voiceId?: string | null;
  audioStrategy?: "NATIVE_AUDIO" | "EXTERNAL_TTS" | null;
  voiceDirection?: string | null;
  productImageId?: string | null;
  operatorNote?: string | null;
};
type Legacy = { id: string; name: string; family: string };
type Board = {
  productions: Production[];
  families: Family[];
  skus: Sku[];
  listings: Listing[];
  snapshots: Snapshot[];
  facts: Fact[];
  products: Product[];
  markets: Market[];
  placements: { id: string; label: string }[];
  recipes: Recipe[];
  legacyTemplates: Legacy[];
  benchmark: BenchmarkView;
  assessments?: Record<string, Assessment>;
  displayNames?: Record<string, string>;
  sources?: SourceView[];
};

type SourceView = {
  productionId: string;
  referenceId: string;
  creator: string | null;
  mediaUrl: string | null;
  posterUrl: string | null;
  width: number | null;
  height: number | null;
  sourceMarket: string | null;
  sourceLocale: string | null;
  assetId: string | null;
  transcriptStatus: string | null;
  analysisVersion: number;
  blueprintVersion: number | null;
  beats: { id: string; role: string; startSec: number | null; endSec: number | null; evidence: string | null; uncertainty: string | null }[];
  shots: { id: string; startSec: number; endSec: number; action: string | null; framing: string | null; onScreen: string | null }[];
};

type BenchmarkBeatView = {
  id: string;
  startSec: number;
  endSec: number;
  purpose: string;
  framing: string;
  productAction: string;
  onScreenText: string | null;
  uncertainty: string;
  adapt: string;
};
type BenchmarkView = {
  originalName: string;
  path: string;
  sha256: string;
  durationSec: number;
  width: number;
  height: number;
  performance: string;
  speech: string;
  asr?: string;
  review: string;
  sampleNote: string;
  categoryNote: string;
  pattern: string;
  doNotCopy: string[];
  beats: BenchmarkBeatView[];
  referenceScript: { note: string; lines: { beatId: string; structureOnly: string }[] };
  productionScript: { status: string; reason: string };
  notesEditedAt: string | null;
};

const FILTER_KEY = "creatoros.factoryV2.board";
const STAGES = [
  ["", "All"],
  ["NEEDS_FACTS", "Needs facts"],
  ["READY_TO_PLAN", "Ready to plan"],
  ["READY_TO_GENERATE", "Ready to generate"],
  ["DRAFT", "Draft"],
];

function stageLabel(stage: string) {
  return STAGES.find((row) => row[0] === stage)?.[1] || stage;
}

export default function UgcFactoryPage() {
  const [board, setBoard] = useState<Board | null>(null);
  const [q, setQ] = useState("");
  const [market, setMarket] = useState("");
  const [recipe, setRecipe] = useState("");
  const [stage, setStage] = useState("");
  const [openId, setOpenId] = useState("");
  const [drawerTab, setDrawerTab] = useState<DrawerTab>("brief");
  const [context, setContext] = useState<CommercialSelection | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const queryApplied = useRef(false);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [panel, setPanel] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [durationSec, setDurationSec] = useState("30");
  const [createMode, setCreateMode] = useState<"CAROUSEL" | "TEMPLATE" | "REFERENCE_RECREATE">("CAROUSEL");
  const [scriptMode, setScriptMode] = useState<"recreate" | "revamp">("recreate");
  const [createReference, setCreateReference] = useState("");
  const [home, setHome] = useState<"wizard" | "drafts">("wizard");
  const [referenceChoices, setReferenceChoices] = useState<{ id: string; creator: string | null; version: number | null }[]>([]);

  async function load() {
    const res = await fetch("/api/ugc-factory/v2");
    const json = await res.json();
    setBoard(json);
  }

  useEffect(() => {
    void load();
    try {
      const saved = JSON.parse(localStorage.getItem(FILTER_KEY) || "{}") as { q?: string; market?: string; recipe?: string; stage?: string };
      setQ(saved.q || "");
      setMarket(saved.market || "");
      setRecipe(saved.recipe || "");
      setStage(saved.stage || "");
    } catch {
      /* keep defaults */
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(FILTER_KEY, JSON.stringify({ q, market, recipe, stage }));
  }, [q, market, recipe, stage]);

  useEffect(() => {
    if (!board || queryApplied.current) return;
    queryApplied.current = true;
    const params = new URLSearchParams(window.location.search);
    const production = params.get("production");
    const product = params.get("product");
    if (production && board.productions.some((row) => row.id === production)) {
      setHome("drafts");
      setOpenId(production);
      const row = board.productions.find((item) => item.id === production);
      if (row?.plan?.beats.some((beat) => beat.sourceStartSec != null)) setDrawerTab("script");
    }
    if (product) setPanel(true);
  }, [board]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (document.querySelector("[data-factory-dialog]")) return;
      setReferenceOpen(false);
      setPanel(false);
      if (document.querySelector("[data-reference-workspace]")) return;
      setOpenId("");
      returnFocus.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const productions = board?.productions || [];
  const visible = useMemo(() => {
    return productions.filter((row) => {
      if (market && row.market !== market) return false;
      if (recipe && row.recipeId !== recipe) return false;
      if (stage && row.stage !== stage) return false;
      const sku = board?.skus.find((item) => item.id === row.skuId);
      const family = board?.families.find((item) => item.id === sku?.familyId);
      const blob = `${family?.label || ""} ${sku?.variantLabel || ""} ${row.market} ${row.locale} ${row.destinationUrl}`.toLowerCase();
      if (q && !blob.includes(q.toLowerCase())) return false;
      return true;
    });
  }, [productions, board, market, recipe, stage, q]);

  const detail = productions.find((row) => row.id === openId);
  const detailSku = board?.skus.find((row) => row.id === detail?.skuId);
  const detailFamily = board?.families.find((row) => row.id === detailSku?.familyId);
  const detailListing = board?.listings.find((row) => row.id === detail?.listingId);
  const detailSnap = board?.snapshots.filter((row) => row.listingId === detail?.listingId).slice(-1)[0];
  const detailFacts = board?.facts.filter((row) => row.skuId === detail?.skuId) || [];
  const report = detail ? board?.assessments?.[detail.id] : undefined;
  const [sourcePack, setSourcePack] = useState<{ assetId: string | null; creator: string | null; blueprintVersion: number; latestBlueprintVersion: number; beats: { id: string; role: string; startSec: number | null; endSec: number | null; evidence: string | null; uncertainty: string | null }[]; shots: { id: string; startSec: number; endSec: number; action: string | null; onScreen: string | null; framing: string | null; uncertainty: string | null }[]; transcript: { startSec: number; endSec: number; text: string }[] } | null>(null);

  useEffect(() => {
    const productId = detailSku?.catalogProductId;
    const pin = detail?.pinnedReferences?.[0];
    if (!productId || !pin?.referenceId) {
      setSourcePack(null);
      return;
    }
    let cancel = false;
    void fetch(`/api/commerce/ugc-references?productId=${encodeURIComponent(productId)}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancel) return;
        const reference = (json.references || []).find((row: { id: string; assetId?: string | null; creator?: string | null; analysis?: { transcript?: { startSec: number; endSec: number; text: string }[] } | null }) => row.id === pin.referenceId);
        const matches = ((json.blueprints || []) as { referenceId: string; analysisVersion: number; version: number; beats: { id: string; role: string; startSec: number | null; endSec: number | null; evidence: string | null; uncertainty: string | null }[]; shots: { id: string; startSec: number; endSec: number; action: string | null; onScreen: string | null; framing: string | null; uncertainty: string | null }[] }[])
          .filter((row) => row.referenceId === pin.referenceId && row.analysisVersion === pin.analysisVersion)
          .sort((a, b) => b.version - a.version);
        const pinned = matches.find((row) => row.version === pin.blueprintVersion) || matches[0];
        setSourcePack(pinned ? { assetId: reference?.assetId || null, creator: reference?.creator || null, blueprintVersion: pinned.version, latestBlueprintVersion: matches[0]?.version || pinned.version, beats: pinned.beats, shots: pinned.shots, transcript: reference?.analysis?.transcript || [] } : null);
      })
      .catch(() => { if (!cancel) setSourcePack(null); });
    return () => { cancel = true; };
  }, [detail?.id, detail?.revision, detailSku?.catalogProductId, detail?.pinnedReferences]);

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/ugc-factory/v2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Request failed");
    return json;
  }

  function openProduction(id: string, tab?: DrawerTab) {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const row = board?.productions.find((item) => item.id === id);
    const next = row?.planningMode === "REFERENCE_RECREATE" && (!tab || tab === "brief") ? "script" : (tab || board?.assessments?.[id]?.next.tab || "brief");
    setDrawerTab(next);
    setOpenId(id);
  }

  function closeProduction() {
    setOpenId("");
    returnFocus.current?.focus();
  }

  async function run(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setError("");
    try {
      await post(body);
      setNotice(done);
      await load();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (createMode !== "REFERENCE_RECREATE" || !context?.legacyProductId) {
      setReferenceChoices([]);
      return;
    }
    let cancel = false;
    void fetch(`/api/commerce/ugc-references?productId=${encodeURIComponent(context.legacyProductId)}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancel) return;
        const rows = ((json.references || []) as { id: string; creator: string | null; analysis?: { version?: number | null } | null }[])
          .filter((row) => row.analysis?.version != null)
          .map((row) => ({ id: row.id, creator: row.creator, version: row.analysis?.version ?? null }));
        setReferenceChoices(rows);
        setCreateReference((current) => current || rows[0]?.id || "");
      })
      .catch(() => { if (!cancel) setReferenceChoices([]); });
    return () => { cancel = true; };
  }, [createMode, context?.legacyProductId]);

  async function create() {
    setBusy(true);
    setError("");
    try {
      if (!context?.legacyProductId || context.gaps.length || !context.listingId) {
        throw new Error(context?.gaps[0] || "Choose one SKU, one market, and one listing.");
      }
      const json = await post({
        op: "create",
        idempotencyKey: crypto.randomUUID(),
        planningMode: createMode,
        referenceId: createMode === "REFERENCE_RECREATE" ? createReference : "",
        catalogProductId: context.legacyProductId,
        listingId: context.listingId,
        market: context.market,
        locale: context.locale,
        placement: context.placement,
        durationSec: Number(durationSec),
      });
      setNotice(json.created ? "One draft saved. No video was started." : "That draft was already saved.");
      setPanel(false);
      setDrawerTab("brief");
      setOpenId(json.production.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!openId && home === "wizard") {
    return (
      <div className="min-w-0 max-w-full overflow-x-clip px-4 py-5 md:px-6 md:py-6">
        <FactoryWizard onEarlier={() => setHome("drafts")} />
      </div>
    );
  }

  return (
    <div className="min-w-0 px-4 py-5 md:px-6 md:py-6">
      {detail?.planningMode === "REFERENCE_RECREATE" || detail?.planningMode === "CAROUSEL" ? null : <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.18em] text-[#652DFF]">UGC FACTORY</p>
          <h1 className="mt-0.5 text-[22px] font-black tracking-tight">My Productions</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn type="button" variant="ghost" onClick={() => { setOpenId(""); setHome("wizard"); }}>New ad</Btn>
          <Btn type="button" onClick={() => setPanel(true)}>Create production</Btn>
        </div>
      </div>}
      {detail?.planningMode === "REFERENCE_RECREATE" || detail?.planningMode === "CAROUSEL" ? null : <div className="mb-3 flex gap-1 overflow-x-auto" role="tablist" aria-label="Production status">
        {STAGES.map(([id, label]) => {
          const count = id ? productions.filter((row) => row.stage === id).length : productions.length;
          return (
            <button key={id || "all"} type="button" role="tab" aria-selected={stage === id} className={cn("shrink-0 rounded-full px-3 py-1 text-[12px] font-semibold", stage === id ? "bg-[#111827] text-white" : "text-[#6B7280]")} onClick={() => setStage(id)}>
              {label} <span className="tabular-nums">{count}</span>
            </button>
          );
        })}
      </div>}
      {detail?.planningMode === "REFERENCE_RECREATE" || detail?.planningMode === "CAROUSEL" ? null : <div className="mb-3 flex flex-wrap items-center gap-2">
        <input className={inputClass + " mt-0 w-full max-w-sm"} placeholder="Search product or production" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search productions" />
        <select className={inputClass + " mt-0 !w-44"} value={market} onChange={(e) => setMarket(e.target.value)} aria-label="Production market">
          <option value="">All markets</option>
          {(board?.markets || []).map((row) => <option key={row.id} value={row.id}>{row.label}</option>)}
        </select>
        <details className="text-[12px]">
          <summary className="cursor-pointer font-semibold text-[#6B7280]">More filters</summary>
          <div className="mt-2 flex flex-wrap gap-1">
            <Filter label="All recipes" active={!recipe} onClick={() => setRecipe("")} />
            {(board?.recipes || []).map((row) => (
              <Filter key={row.id} label={`${row.label} · Pilot`} active={recipe === row.id} onClick={() => setRecipe(recipe === row.id ? "" : row.id)} />
            ))}
          </div>
        </details>
      </div>}
      {notice ? <p className="mb-3 text-[12px] text-[#374151]">{notice}</p> : null}
      {error ? <p className="mb-3 text-[12px] text-[#B91C1C]">{error}</p> : null}

      {detail?.planningMode === "REFERENCE_RECREATE" || detail?.planningMode === "CAROUSEL" ? null : <div data-factory-list className="grid gap-2">
          {visible.map((row) => {
            const sku = board?.skus.find((item) => item.id === row.skuId);
            const family = board?.families.find((item) => item.id === sku?.familyId);
            const product = board?.products.find((item) => item.id === sku?.catalogProductId);
            const next = board?.assessments?.[row.id]?.next;
            const referenceMode = row.planningMode === "REFERENCE_RECREATE";
            const recipeName = referenceMode ? "Reference recreation" : board?.recipes.find((item) => item.id === row.recipeId)?.label || "Recipe not chosen";
            return (
              <Surface key={row.id} className={cn("flex items-center gap-3 p-3", openId === row.id && "ring-2 ring-[#111827]")}>
                <button type="button" data-production-open={row.id} className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-[#EEF1F6]" onClick={() => openProduction(row.id, next?.tab)}>
                  {product?.image ? <img src={thumbSrc(product.image, 120)} alt="" className="h-full w-full object-cover" /> : <span className="px-1 text-center text-[10px] font-semibold text-[#9CA3AF]">No photo</span>}
                </button>
                <div className="min-w-0 flex-1">
                  <button type="button" className="truncate text-left text-sm font-semibold" onClick={() => openProduction(row.id, next?.tab)}>{board?.displayNames?.[row.id] || family?.label || "SKU"}</button>
                  <p className="truncate text-[12px] text-[#6B7280]">{row.market} · {row.locale} · {Math.round(row.durationMs / 1000)}s · {recipeName}</p>
                  <p className="truncate text-[12px] text-[#C2410C]">{row.issue}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="rounded-full bg-[#F3F4F8] px-2 py-0.5 text-[11px] font-semibold">{stageLabel(row.stage)}</span>
                  <button type="button" className="rounded-lg border border-[#E6E8EE] px-2.5 py-1 text-[12px] font-semibold" onClick={() => openProduction(row.id, next?.tab)}>{next?.label || "Open"}</button>
                </div>
              </Surface>
            );
          })}
          {!visible.length ? (
            <div data-factory-empty className="col-span-full">
              <Surface className="px-6 py-8 text-center">
                <p className="text-sm font-semibold">{productions.length ? "No productions on this filter" : "No productions yet"}</p>
                <p className="mx-auto mt-1 max-w-md text-[12px] text-[#6B7280]">One draft is one vertical video for one physical SKU, one listing, and one market. Five market links do not make five videos.</p>
                <Btn className="mt-4" type="button" onClick={() => setPanel(true)}>Create Production</Btn>
              </Surface>
            </div>
          ) : null}
      </div>}

      {detail?.planningMode === "REFERENCE_RECREATE" || detail?.planningMode === "CAROUSEL" || !board?.benchmark ? null : (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E6E8EE] bg-white px-4 py-3">
          <p className="min-w-0 text-[12px] text-[#374151]"><span className="font-semibold">Quality reference. </span>{board.benchmark.durationSec.toFixed(1)}s visual benchmark for delivery, framing, handling, and editing. Speech was not transcribed. Campaign performance {board.benchmark.performance}.</p>
          <Btn type="button" variant="ghost" onClick={() => setReferenceOpen(true)}>View Reference</Btn>
        </div>
      )}

        {detail && detail.planningMode === "CAROUSEL" && detailSku ? (
          <FactoryCarouselWorkspace
            productionId={detail.id}
            productId={detailSku.catalogProductId || ""}
            title={board?.displayNames?.[detail.id] || detailFamily?.label || "SKU"}
            market={detail.market}
            locale={detail.locale}
            revision={detail.revision}
            carousel={detail.carousel || null}
            busy={busy}
            onBack={closeProduction}
            onGenerate={async (direction) => run({ op: "generate-carousel", productionId: detail.id, expectedRevision: detail.revision, direction }, "Carousel saved. No video was started.")}
            onSave={async (slideId, patch, expectedRevision) => run({ op: "save-carousel-slide", productionId: detail.id, expectedRevision, slideId, ...patch }, "Slide saved.")}
            onReload={load}
          />
        ) : null}
        {detail && detail.planningMode === "REFERENCE_RECREATE" && detailSku && detailListing ? (
          <FactoryReferenceWorkspace
            productionId={detail.id}
            title={board?.displayNames?.[detail.id] || detailFamily?.label || "SKU"}
            market={detail.market}
            locale={detail.locale}
            locales={board?.markets.find((row) => row.id === detail.market)?.locales || [detail.locale]}
            durationSec={Math.round(detail.durationMs / 1000)}
            creatorMode={detail.creatorMode || "GENERATED_ADULT"}
            creatorAnchor={detail.creatorAnchor || null}
            creatorLook={detail.creatorLook || null}
            creatorChoices={(detailSku.media || []).filter((item) => item.role === "adultIdentity").map((item) => ({ mediaId: item.id, url: item.url, label: "Stored adult plate" }))}
            voiceId={detail.voiceId || (detail.plan?.beats.find((beat) => beat.audioMode)?.audioMode || "").replace(/^(voiceover|creator-led)\s+/, "")}
            deliveryMode={detail.deliveryMode || ((detail.plan?.beats.find((beat) => beat.audioMode)?.audioMode || "").startsWith("creator-led") ? "creator-led" : "voiceover")}
            audioStrategy={detail.audioStrategy || "NATIVE_AUDIO"}
            voiceDirection={detail.voiceDirection || ""}
            productImage={(detailSku.media || []).find((item) => item.id === detail.productImageId)?.url || (detailSku.media || []).find((item) => item.role === "productAppearance")?.url || board?.products.find((item) => item.id === detailSku.catalogProductId)?.image || null}
            productImages={(detailSku.media || []).filter((item) => item.role === "productAppearance").map((item) => ({ id: item.id, url: item.url, label: "Catalog photo" }))}
            mediaUrl={board?.sources?.find((row) => row.productionId === detail.id)?.mediaUrl || null}
            analysisVersion={detail.pinnedReferences?.[0]?.analysisVersion ?? null}
            blueprintVersion={detail.pinnedReferences?.[0]?.blueprintVersion ?? sourcePack?.blueprintVersion ?? null}
            referenceId={detail.pinnedReferences?.[0]?.referenceId || null}
            beats={detail.plan?.beats || []}
            shots={sourcePack?.shots || []}
            transcript={sourcePack?.transcript || []}
            revision={detail.revision}
            busy={busy}
            approvalBlockers={report?.approvalBlockers || []}
            approved={Boolean(detail.planApprovedAt)}
            stageReady={detail.stage === "READY_TO_GENERATE"}
            listingNote={detailListing.marketplace === "amazon" && detail.market !== "US" ? `The factory record points at source Amazon ${detailListing.merchantProductId || ""}. The ${detail.market} shop row is separate.` : `Target listing · ${detail.market}`}
            catalogProductId={detailSku.catalogProductId}
            operatorNote={detail.operatorNote || ""}
            onBack={closeProduction}
            onSave={async (edits, note) => run({ op: "save-scene-edits", productionId: detail.id, expectedRevision: detail.revision, edits, operatorNote: note }, "Scenes saved. No video was started.")}
            onSetup={async (patch) => run({ op: "set-production-setup", productionId: detail.id, expectedRevision: detail.revision, ...patch }, "Setup saved. No video was started.")}
            onApprove={() => void run({ op: "approve-plan", productionId: detail.id, expectedRevision: detail.revision }, "Plan approved. No video job was submitted.")}
            onGenerate={() => void run({ op: "generate", productionId: detail.id, expectedRevision: detail.revision }, "Generate requested.")}
          />
        ) : null}
        {detail && detail.planningMode !== "REFERENCE_RECREATE" && detailSku && detailListing ? (
          <div className="fixed inset-0 z-40 flex justify-end bg-black/30" onClick={closeProduction}>
          <aside className="h-full w-full max-w-[1040px] overflow-y-auto bg-white p-4 shadow-xl md:p-6" onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 -mx-4 flex items-start justify-between gap-2 bg-white px-4 pb-3 md:-mx-6 md:px-6">
              <div className="min-w-0">
                <p className="truncate text-sm font-black">{board?.displayNames?.[detail.id] || detailFamily?.label || "SKU"}</p>
                <p className="text-[11px] text-[#6B7280]">{detail.market} · {detail.locale} · {detail.placement} · {Math.round(detail.durationMs / 1000)}s · {stageLabel(detail.stage)}</p>
              </div>
              <button type="button" className="rounded-lg border px-2 py-1 text-[12px] font-semibold" onClick={closeProduction}>Close</button>
            </div>
            <div className="flex flex-wrap gap-1" role="tablist" aria-label="Production workspace">
              {((detail.planningMode === "REFERENCE_RECREATE" ? [["script", "Script & Scenes"], ["storyboard", "Storyboard Preview"], ["render", "Generate"]] : [["brief", "Brief"], ["script", "Script & shots"], ["render", "Render & review"]]) as [DrawerTab, string][]).map(([tab, label]) => (
                <button key={tab} type="button" role="tab" aria-selected={drawerTab === tab} className={cn("rounded-full border px-3 py-1 text-[12px] font-semibold", drawerTab === tab ? "border-[#111827] bg-[#111827] text-white" : "border-[#E6E8EE]")} onClick={() => setDrawerTab(tab)}>{label}</button>
              ))}
            </div>
            <p className="mt-3 text-[12px] text-[#374151]">{detail.issue}</p>
            {drawerTab === "brief" ? (
            <div className="mt-4 grid gap-4 text-[12px] lg:grid-cols-[minmax(0,1fr)_300px]">
            <div>
            {detail.factReview ? (
              <div className="mb-3 rounded-xl bg-[#F8FAFC] p-3 text-[#374151]" data-fact-review={detail.id}>
                <p className="font-semibold">Catalog facts changed</p>
                <p className="mt-1">{detail.factReview.note} Revision {detail.revision} and the saved plan stay in place.</p>
                <Btn type="button" variant="ghost" className="mt-2" disabled={busy} onClick={() => void run({ op: "dismiss-fact-review", productionId: detail.id }, "Fact notice cleared. The plan stays.")}>Dismiss</Btn>
              </div>
            ) : null}
            {detail.impact ? (
              <div className="mb-3 rounded-xl bg-[#FFF7ED] p-3 text-[#9A3412]">
                <p className="font-semibold">{detail.impact.fields.every((field) => field === "product name" || field.startsWith("local name ")) ? "Product name changed — review this draft" : "Product updated — review changes"}</p>
                <p className="mt-1">{detail.impact.fields.every((field) => field === "product name" || field.startsWith("local name ")) ? "The name for this country is ready for a new plan. The approved plan, any finished video, and the history stay as they are." : detail.impact.fields.join(", ")}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Btn type="button" disabled={busy} onClick={() => void run({ op: "acknowledge-impact", productionId: detail.id, expectedRevision: detail.revision, apply: true }, detail.impact?.fields.every((field) => field === "product name" || field.startsWith("local name ")) ? "Name noted on this draft. No video was started." : "Update applied. Any approval was cleared. No video was started.")}>Apply update</Btn>
                  <Btn type="button" variant="ghost" disabled={busy} onClick={() => void run({ op: "acknowledge-impact", productionId: detail.id, expectedRevision: detail.revision, apply: false }, "Pinned facts kept. No video was started.")}>Keep pinned facts</Btn>
                </div>
              </div>
            ) : null}
            {(() => {
              const source = board?.sources?.find((row) => row.productionId === detail.id);
              if (detail.planningMode !== "REFERENCE_RECREATE" && !source) return null;
              return (
                <div className="mb-4 grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
                  {source?.mediaUrl ? <video className="max-h-[50vh] w-full max-w-[360px] bg-black object-contain" style={source.width && source.height ? { aspectRatio: `${source.width} / ${source.height}` } : undefined} controls playsInline preload="metadata" poster={source.posterUrl || undefined} src={source.mediaUrl} /> : <div className="grid h-40 place-items-center rounded-xl bg-[#F7F8FB] text-[#6B7280]">No stored reference video</div>}
                  <div className="text-[12px]">
                    <p className="font-semibold">{source?.creator || "Creator unknown"} · {source?.transcriptStatus === "ok" ? "Speech on file" : "Speech unavailable"}</p>
                    <p className="mt-1">Source market · {source?.sourceMarket || "Not stored"} · {source?.sourceLocale || "Not stored"}</p>
                    <p>Target market · {detail.market} · {detail.locale}</p>
                    <p className="mt-1 text-[#6B7280]">Analysis version {source?.analysisVersion ?? "missing"}. Blueprint version {source?.blueprintVersion ?? "missing"}. The reference file is the source analysis. It is not the product photo and it is not a generation anchor.</p>
                    {(() => {
                      const plate = (detailSku.media || []).find((item) => item.role === "productAppearance");
                      if (!plate) return <p className="mt-1 text-[#6B7280]">No product plate is selected.</p>;
                      return (
                        <div className="mt-2 flex items-center gap-2">
                          <img src={thumbSrc(plate.url, 160)} alt="" className="h-16 w-16 rounded-lg object-cover" />
                          <p>Product plate · {plate.role}. This photo is the generation anchor. The reference video stays separate.</p>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              );
            })()}
            <div className="rounded-xl bg-[#F7F8FB] p-3">
              <p className="font-semibold">Commercial context</p>
              <p className="mt-1"><span className="font-semibold">Product name. </span>{board?.displayNames?.[detail.id] || detailFamily?.label || "SKU"}</p>
              <p className="mt-1 text-[#6B7280]">Resolved for {detail.market} · {detail.locale}. A saved local name is used first. Otherwise the product name is used. The shop listing title is unchanged.</p>
              <p className="mt-1">{detail.market} · {detail.locale} · {detail.placement} · {Math.round(detail.durationMs / 1000)}s</p>
              <p className="mt-1">Source listing · {detailListing.marketplace === "amazon" ? `Amazon ${detailListing.merchantProductId || ""}`.trim() : detailListing.marketplace}{detail.market !== "US" && detailListing.marketplace === "amazon" ? ". This is not the target shop." : ""}</p>
              <p className="mt-1">Target listing · {detail.market} shop on the product. {detailListing.market === detail.market && detailListing.marketplace !== "amazon" ? "This draft is tied to that market listing." : `The draft record still points at the source ${detailListing.marketplace} row.`}</p>
              <p className="mt-1 break-all">Stored destination · {detail.destinationUrl || "Not saved"}</p>
              <p className="mt-1 text-[#6B7280]">{detailListing.equivalence === "VERIFIED" ? "Listing link verified for this production." : "The physical product match is still required before approval."}</p>
            </div>
            <p className="mt-3">{detail.issue}</p>
            {detailSku.catalogProductId ? <a className="mt-2 inline-block font-semibold text-[#652DFF]" href={`/commerce/products?product=${detailSku.catalogProductId}`}>Open product inputs</a> : null}
            {detail.planningMode === "REFERENCE_RECREATE" ? (
              <div className="mt-4 grid gap-2">
                <p className="font-semibold">Readiness</p>
                {(() => {
                  const missing = (report?.inputs || []).find((item) => !item.done);
                  return missing ? <p>Missing · {missing.label}. {detailSku.catalogProductId ? <a className="font-semibold text-[#652DFF]" href={`/commerce/products?product=${detailSku.catalogProductId}`}>{missing.action}</a> : null}</p> : <p>Inputs on file. Approval still needs the physical product match.</p>;
                })()}
              </div>
            ) : (
            <div className="mt-4">
              <p className="font-semibold">What this production still needs</p>
              {(report?.rejected || []).map((row) => (
                <p key={row.recipeId} className="mt-2"><span className="font-semibold">{row.label} · Pilot.</span> Missing {row.missing.join(", ")}.</p>
              ))}
              {(report?.eligibleRecipeIds || []).length ? <p className="mt-2 font-semibold">Feasible now: {report?.eligibleRecipeIds.join(", ")}</p> : <p className="mt-2">No feasible pilot yet. A title confirmation does not unlock a plan.</p>}
              {(detail.pinnedReferences || []).length && !detail.planApprovedAt ? <Btn className="mt-3" type="button" disabled={busy} onClick={() => void run({ op: "set-planning-mode", productionId: detail.id, expectedRevision: detail.revision, mode: "REFERENCE_RECREATE" }, "Reference recreation selected. No video was started.")}>Use reference recreation</Btn> : null}
            </div>
            )}
            <details className="mt-4">
              <summary className="cursor-pointer font-semibold">Details</summary>
              <div className="mt-2">
                {(detailSku.media || []).length ? (detailSku.media || []).map((item) => <p key={item.id} className="mt-1 break-all">{item.role} · {item.id}</p>) : <p className="mt-1 text-[#6B7280]">No product-image id is selected. Stored catalog photos are not the same as a generation plate, and the reference file is not one either.</p>}
              </div>
            </details>
            {(report?.planBlockers || []).length ? (
              <div className="mt-4 rounded-xl bg-[#FFF7ED] p-3 text-[#9A3412]">
                <p className="font-semibold">Blocks the next stage</p>
                <ul className="mt-1 list-disc pl-4">{report?.planBlockers.map((item) => <li key={item}>{item}</li>)}</ul>
              </div>
            ) : null}
            </div>
            <div>
              {detail.planningMode === "REFERENCE_RECREATE" ? <p>This reference is already selected. A pilot-recipe decision is not required.</p> : detail.decision ? (
                <div className="rounded-xl bg-[#F7F8FB] p-3">
                  <p className="font-semibold">{detail.decision.status === "BLOCKED" ? "Blocked" : detail.decision.decisionSource === "OPERATOR" ? "Operator override" : "Selected"} · {detail.decision.evidenceLabel}</p>
                  <p className="mt-1">{detail.decision.summary}</p>
                  <p className="mt-1 text-[#6B7280]">Model {detail.decision.modelId || "none"}. Confidence {detail.decision.confidence == null ? "not provided" : detail.decision.confidence}. This is not a virality or conversion probability.</p>
                </div>
              ) : <p>No decision has been run.</p>}
              {detail.planningMode === "REFERENCE_RECREATE" ? null : <label className="mt-3 block text-[11px] font-semibold text-[#6B7280]">Operator override
                <select className={inputClass} value={detail.recipeId || ""} onChange={(e) => void run({ op: "set-recipe", productionId: detail.id, expectedRevision: detail.revision, recipeId: e.target.value }, "Override saved. Jev was not asked. The recipe stays a pilot.")}>
                  <option value="" disabled>Choose a pilot recipe</option>
                  {(board?.recipes || []).map((row) => <option key={row.id} value={row.id}>{row.label} · Pilot</option>)}
                </select>
              </label>}
              {detail.planningMode === "REFERENCE_RECREATE" ? null : <Btn className="mt-3" type="button" disabled={busy} onClick={() => void run({ op: "decide", productionId: detail.id, expectedRevision: detail.revision }, "Decision saved.")}>Run decision</Btn>}
              <p className="mt-3 text-[#6B7280]">{detail.planningMode === "REFERENCE_RECREATE" ? "Jev is not asked to pick a pilot for a selected reference." : "Jev runs only when more than one pilot is feasible."}</p>
            </div>
            </div>
            ) : null}
            {drawerTab === "script" ? (
              <div className="mt-3 text-[12px]">
                {(report?.planBlockers || []).length ? (
                  <div className="rounded-xl bg-[#FFF7ED] p-3 text-[#9A3412]">
                    <p className="font-semibold">Write stays off until this input is ready.</p>
                    <ul className="mt-1 list-disc pl-4">{report?.planBlockers.map((item) => <li key={item}>{item}</li>)}</ul>
                  </div>
                ) : null}
                {detail.plan ? (
                  <div className="mt-3">
                    <p className="text-[#6B7280]">Model {detail.plan.modelId}. Reference notes are not this script.</p>
                    {(detail.pinnedReferences || []).length ? (
                      <details className="mt-2">
                        <summary className="cursor-pointer font-semibold">Details</summary>
                        {(detail.pinnedReferences || []).map((pin) => (
                          <p key={pin.referenceId} className="mt-1 break-all">{pin.referenceId} · analysis {pin.analysisVersion}{pin.blueprintVersion != null ? ` · blueprint ${pin.blueprintVersion}` : ""}</p>
                        ))}
                        <p className="mt-1 text-[#6B7280]">These are not verified claims and do not start a render.</p>
                      </details>
                    ) : null}
                    <p className="mt-2 font-semibold">{detail.plan.concept}</p>
                    <p className="mt-2 whitespace-pre-wrap">{detail.plan.spoken}</p>
                    <p className="mt-2"><span className="font-semibold">Delivery. </span>{detail.plan.delivery}</p>
                    <p className="mt-2"><span className="font-semibold">Audio. </span>{detail.plan.audio}</p>
                    <p className="mt-2"><span className="font-semibold">Edit. </span>{detail.plan.edit}</p>
                    {(detail.plan.creativeBeats || []).length ? (
                      <div className="mt-3">
                        <p className="font-semibold">Creative beats</p>
                        {detail.plan.creativeBeats?.map((beat) => (
                          <article key={beat.id} className="mt-2 rounded-xl border border-[#E6E8EE] p-3">
                            <p className="font-semibold">{beat.role}</p>
                            <p className="mt-1 text-[#6B7280]">Source {beat.sourceStartSec == null ? "time not observed" : `${beat.sourceStartSec}–${beat.sourceEndSec}s`} · {beat.evidence || "Not observed in the source analysis."}</p>
                            <p className="mt-1">Localized line · {beat.spoken || "No localized line was kept."}</p>
                            {beat.uncertainty ? <p className="mt-1 text-[#B45309]">{beat.uncertainty}</p> : null}
                          </article>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-4 grid items-start gap-4 md:grid-cols-[260px_minmax(0,1fr)]">
                      {(() => {
                        const source = board?.sources?.find((row) => row.productionId === detail.id);
                        return source?.mediaUrl ? <video className="aspect-[9/16] w-full max-w-[260px] bg-black object-contain" controls playsInline preload="metadata" poster={source.posterUrl || undefined} src={source.mediaUrl} /> : <p className="text-[#6B7280]">No stored reference video.</p>;
                      })()}
                      <div>
                    <p className="font-semibold">Scenes</p>
                    {sourcePack ? <p className="mt-2 text-[#6B7280]">Source speaker {sourcePack.creator || "unknown"} stays in the reference. Creator · {detail.creatorMode === "GENERATED_ADULT" ? "Generated adult, face not selected" : detail.creatorMode}. Voice · {detail.plan.beats.find((beat) => beat.audioMode)?.audioMode?.replace("voiceover ", "") || "not set on the plan"}.</p> : null}
                    {sourcePack && sourcePack.latestBlueprintVersion > sourcePack.blueprintVersion ? <p className="mt-2 text-[#B45309]">Blueprint is now version {sourcePack.latestBlueprintVersion}. This draft still uses version {sourcePack.blueprintVersion} and was not rewritten.</p> : null}
                    {detail.plan.beats.map((beat) => {
                      const sourceShot = sourcePack?.shots.find((item) => item.id === beat.shotId);
                      const speech = sourceShot ? (sourcePack?.transcript || []).filter((line) => line.startSec < sourceShot.endSec && line.endSec > sourceShot.startSec) : [];
                      return (
                        <article key={beat.id} className="mt-2 rounded-xl bg-[#F7F8FB] p-3">
                          <p className="font-semibold">{beat.beatRole || beat.purpose} · {beat.sourceStartSec != null ? `${Number(beat.sourceStartSec).toFixed(1)}–${Number(beat.sourceEndSec).toFixed(1)}s` : "Untimed"}{beat.estimatedSec != null ? ` · voice ${Number(beat.estimatedSec).toFixed(1)}s` : ""}</p>
                          <p className="mt-1">Source speech · {speech.map((line) => line.text).join(" ") || "None in this window."}</p>
                          <p className="mt-1">Adapted speech · {beat.spoken || "No spoken line was kept."}</p>
                          <p className="mt-1">Action · {beat.action}</p>
                          <p className="mt-1">On-screen · {beat.onScreen || "None"}</p>
                          {/glow|glowy|my skin|i have been|i am a fan/i.test(`${beat.onScreen || ""} ${speech.map((line) => line.text).join(" ")}`) && /glow|glowy|my skin/i.test(beat.onScreen || "") ? (
                            <div className="mt-2 rounded-lg bg-[#FFF7ED] p-2 text-[#9A3412]" data-onscreen-mismatch={beat.id}>
                              <p>On-screen text still uses a source skin-result line. Spoken text does not. Apply replaces only that caption. The saved plan stays until you apply it.</p>
                              <Btn className="mt-2" type="button" variant="ghost" disabled={busy} onClick={() => void run({ op: "apply-scene-caption", productionId: detail.id, expectedRevision: detail.revision, beatId: beat.id, onScreen: "Skin prep" }, "On-screen caption updated. No video was started.")}>Apply caption</Btn>
                            </div>
                          ) : null}
                          <details className="mt-2">
                            <summary className="cursor-pointer text-[#6B7280]">Framing and continuity</summary>
                            <p className="mt-1">Framing · {beat.framing || "Not observed."}</p>
                            <p className="mt-1">Continuity · {beat.continuity || "Not observed."}</p>
                            {beat.uncertainty ? <p className="mt-1 text-[#B45309]">{beat.uncertainty}</p> : null}
                          </details>
                        </article>
                      );
                    })}
                      </div>
                    </div>
                  </div>
                ) : (
                  <>
                    {(detail.pinnedReferences || []).length ? (
                      <details className="mt-3">
                        <summary className="cursor-pointer font-semibold">Details</summary>
                        {(detail.pinnedReferences || []).map((pin) => (
                          <p key={pin.referenceId} className="mt-1 break-all">{pin.referenceId} · analysis {pin.analysisVersion}</p>
                        ))}
                        <p className="mt-1 text-[#6B7280]">These are not verified claims and do not start a render.</p>
                      </details>
                    ) : null}
                    <p className="mt-3 text-[#6B7280]">No production script is stored. The quality reference is not a script for this SKU.</p>
                  </>
                )}
                <Btn className="mt-3" type="button" variant="ghost" disabled={busy || (report?.planBlockers.length || 0) > 0} onClick={() => void run({ op: detail.planningMode === "REFERENCE_RECREATE" ? "write-reference-plan" : "write-plan", productionId: detail.id, expectedRevision: detail.revision }, detail.planningMode === "REFERENCE_RECREATE" ? "Reference plan saved from Astra. No video was started." : "Plan saved from Astra.")}>{detail.planningMode === "REFERENCE_RECREATE" ? "Write reference plan" : "Write with Astra"}</Btn>
              </div>
            ) : null}
            {drawerTab === "storyboard" && detail.planningMode === "REFERENCE_RECREATE" ? (
              <div className="mt-4 grid gap-3 text-sm">
                <p className="font-semibold">Storyboard preview</p>
                <p className="text-[12px] text-[#6B7280]">This is the saved scene order. It does not start a render.</p>
                {(detail.plan?.beats || []).map((beat) => (
                  <article key={beat.id} className="border-b border-[#F3F4F8] py-3">
                    <p className="font-semibold">{beat.beatRole || beat.purpose} · {beat.sourceStartSec != null ? `${Number(beat.sourceStartSec).toFixed(1)}–${Number(beat.sourceEndSec).toFixed(1)}s` : "Untimed"}</p>
                    <p className="mt-1">{beat.spoken || "No spoken line."}</p>
                    <p className="mt-1 text-[12px] text-[#6B7280]">{beat.action}</p>
                  </article>
                ))}
              </div>
            ) : null}
            {drawerTab === "render" ? (
              <div className="mt-3 text-[12px]">
                <p>No generated video is stored for this production. The quality benchmark is a reference and is not this result.</p>
                <p className="mt-2 text-[#6B7280]">Shots are renderable camera and action shots. Creative beats stay separate. Approval does not submit a video job.</p>
                <p className="mt-3">{detail.plan ? "Review the anchors, the audio strategy, and the timing before Generate." : "There is no plan to review."}</p>
                {detail.stage !== "READY_TO_GENERATE" ? <p className="mt-2">Generate stays off until this plan is approved. Approval does not start a render. The cost is shown only when you choose Generate.</p> : null}
                {detail.plan ? <p className="mt-2"><span className="font-semibold">Audio. </span>{detail.plan.audio}</p> : null}
                {detail.planApprovedAt ? <p className="mt-2 font-semibold">Plan approved {detail.planApprovedAt}. No provider job was submitted by that approval.</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {(detail.planningMode === "REFERENCE_RECREATE" && (report?.approvalBlockers || []).length) ? <ul className="mb-2 list-disc pl-4 text-[#9A3412]">{report?.approvalBlockers?.map((item) => <li key={item}>{item}</li>)}</ul> : null}
                  <Btn type="button" disabled={busy || !detail.plan || Boolean(detail.planApprovedAt) || (detail.planningMode === "REFERENCE_RECREATE" && (report?.approvalBlockers.length || 0) > 0)} onClick={() => void run({ op: "approve-plan", productionId: detail.id, expectedRevision: detail.revision }, "Plan approved. No video job was submitted.")}>Approve plan</Btn>
                  <Btn type="button" variant="ghost" disabled={busy || detail.stage !== "READY_TO_GENERATE"} onClick={() => void run({ op: "generate", productionId: detail.id, expectedRevision: detail.revision }, "Generate requested.")}>Generate</Btn>
                </div>
              </div>
            ) : null}
          </aside>
          </div>
        ) : null}

      {detail?.planningMode === "REFERENCE_RECREATE" ? null : <><details className="mt-6">
        <summary className="cursor-pointer text-[12px] font-semibold text-[#6B7280]">Pilot recipe constraints</summary>
        <p className="mt-2 text-[12px] text-[#6B7280]">These five stay pilots. The quality reference does not validate them and does not add a hair-care recipe.</p>
        <div className="mt-2 grid gap-2">
          {(board?.recipes || []).map((row) => (
            <p key={row.id} className="text-[12px] text-[#374151]"><span className="font-semibold">{row.label}.</span> {row.needs}</p>
          ))}
        </div>
      </details>
      <details className="mt-3">
        <summary className="cursor-pointer text-[12px] font-semibold text-[#6B7280]">Legacy templates, not the default</summary>
        <p className="mt-2 text-[12px] text-[#6B7280]">The older 33 templates stay on file. A new production does not fan out across them.</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(board?.legacyTemplates || []).map((row) => <span key={row.id} className="rounded-full bg-[#F3F4F8] px-2 py-0.5 text-[11px] text-[#4B5563]">{row.id} {row.name}</span>)}
        </div>
      </details></>}
      {panel ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto" onClick={(event) => event.stopPropagation()}>
            <Surface>
              <div className="flex items-center justify-between"><p className="font-black">Create production</p><button type="button" onClick={() => setPanel(false)}>Close</button></div>
              <p className="mt-1 text-[12px] text-[#6B7280]">My Productions stays the list for resuming a draft. A new production starts as a carousel unless you choose a template or a video reference.</p>
              <div className="mt-3 grid gap-2 text-sm">
                <button type="button" className={cn("rounded-xl border px-3 py-2 text-left", createMode === "CAROUSEL" ? "border-[#111827]" : "border-[#E6E8EE]")} data-start-carousel onClick={() => setCreateMode("CAROUSEL")}>Carousel<span className="mt-1 block text-[12px] font-normal text-[#6B7280]">Five slides from the stored product photos.</span></button>
                <button type="button" className={cn("rounded-xl border px-3 py-2 text-left", createMode === "TEMPLATE" ? "border-[#111827]" : "border-[#E6E8EE]")} onClick={() => setCreateMode("TEMPLATE")}>From UGC template<span className="mt-1 block text-[12px] font-normal text-[#6B7280]">Use the existing templates and planning.</span></button>
                <button type="button" className={cn("rounded-xl border px-3 py-2 text-left", createMode === "REFERENCE_RECREATE" ? "border-[#111827]" : "border-[#E6E8EE]")} data-start-reference onClick={() => setCreateMode("REFERENCE_RECREATE")}>From video reference<span className="mt-1 block text-[12px] font-normal text-[#6B7280]">Select a stored reference for this SKU.</span></button>
              </div>
              <div className="mt-3">
                <CommercialContextPicker key={createMode} initialMarket={createMode === "REFERENCE_RECREATE" ? "MY" : undefined} onChange={setContext} />
              </div>
              {createMode === "TEMPLATE" && context?.legacyProductId ? (() => {
                const sku = board?.skus.find((item) => item.catalogProductId === context.legacyProductId);
                const family = board?.families.find((item) => item.id === sku?.familyId);
                const blocked = family && family.category !== "home_gadget" && family.category !== "preschool_toy";
                if (!blocked) return null;
                return (
                  <div className="mt-3 text-sm" data-template-blocked>
                    <p>No validated template fits this product. Home-gadget and toy pilots stay in those categories, and they are not marked as missing facts for this SKU.</p>
                    <button type="button" className="mt-2 font-semibold text-[#652DFF]" onClick={() => setCreateMode("REFERENCE_RECREATE")}>Use the reference path</button>
                  </div>
                );
              })() : null}
              {createMode === "REFERENCE_RECREATE" ? (
                <label className="mt-3 block text-[11px] font-semibold text-[#6B7280]">Reference
                  <select className={inputClass} value={createReference} onChange={(event) => setCreateReference(event.target.value)}>
                    <option value="">Choose an analyzed reference</option>
                    {referenceChoices.map((row) => <option key={row.id} value={row.id}>{(row.creator || "Creator")} · version {row.version}</option>)}
                  </select>
                </label>
              ) : null}
              {createMode === "CAROUSEL" ? null : (
                <label className="mt-3 block text-[11px] font-semibold text-[#6B7280]">Duration in seconds
                  <input className={inputClass} type="number" min={10} max={30} value={durationSec} onChange={(event) => setDurationSec(event.target.value)} />
                </label>
              )}
              {createMode === "CAROUSEL" ? null : <p className="mt-1 text-[11px] text-[#6B7280]">A whole number from 10 to 30 for this SKU.</p>}
              {(context?.notes || []).map((note) => <p key={note} className="mt-2 text-[12px] text-[#6B7280]">{note}</p>)}
              {(context?.gaps || []).map((gap) => <p key={gap} className="mt-2 text-[12px] text-[#9A3412]">{gap}</p>)}
              {createMode === "REFERENCE_RECREATE" ? (
                <div className="mt-3 grid gap-2 text-sm" data-reference-entry>
                  <label className="font-semibold">Script mode
                    <select className={inputClass + " mt-1 text-sm"} value={scriptMode} aria-label="Script mode" onChange={(event) => setScriptMode(event.target.value as "recreate" | "revamp")}>
                      <option value="recreate">Recreate reference</option>
                      <option value="revamp">Revamp script</option>
                    </select>
                  </label>
                  <p className="text-[12px] text-[#6B7280]">{scriptMode === "recreate" ? "Keep the hook, scene order, pacing and visual style. Adapt language, product wording and the CTA only where needed." : "Change the wording and angle. The scene structure and visual style stay. A larger change needs an explicit choice."}</p>
                </div>
              ) : null}
              <Btn className="mt-3" type="button" disabled={busy || !context?.listingId || (context.gaps.length > 0) || (createMode === "REFERENCE_RECREATE" && !createReference) || (createMode === "TEMPLATE" && Boolean(board?.families.find((item) => item.id === board?.skus.find((sku) => sku.catalogProductId === context?.legacyProductId)?.familyId && item.category !== "home_gadget" && item.category !== "preschool_toy")))} onClick={() => {
                if (createMode === "CAROUSEL" && context) {
                  const existing = productions.find((row) => {
                    const sku = board?.skus.find((item) => item.id === row.skuId);
                    return sku?.catalogProductId === context.legacyProductId && row.market === context.market && row.locale === context.locale && row.planningMode === "CAROUSEL" && !row.providerJobId;
                  });
                  if (existing) {
                    setPanel(false);
                    setNotice("Opened the saved carousel. No duplicate was created.");
                    openProduction(existing.id);
                    return;
                  }
                }
                if (createMode !== "REFERENCE_RECREATE" || !context) { void create(); return; }
                const existing = productions.find((row) => {
                  const sku = board?.skus.find((item) => item.id === row.skuId);
                  return sku?.catalogProductId === context.legacyProductId && row.market === context.market && row.locale === context.locale && row.planningMode === "REFERENCE_RECREATE" && (row.pinnedReferences || []).some((pin) => pin.referenceId === createReference) && !row.planApprovedAt && !row.providerJobId;
                });
                if (existing) {
                  setPanel(false);
                  setNotice("Opened the saved draft. No duplicate was created.");
                  openProduction(existing.id, "script");
                  return;
                }
                void create();
              }}>{busy ? "Saving…" : createMode === "REFERENCE_RECREATE" ? "Continue" : createMode === "CAROUSEL" ? "Create carousel" : "Create one draft"}</Btn>
            </Surface>
          </div>
        </div>
      ) : null}
      {referenceOpen && board?.benchmark ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={() => setReferenceOpen(false)}>
          <aside className="h-full w-full max-w-2xl overflow-y-auto bg-[#F3F4F8] p-4" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="font-black">Quality reference</p>
              <button type="button" className="rounded-lg border px-2 py-1 text-[12px] font-semibold" onClick={() => setReferenceOpen(false)}>Close</button>
            </div>
            <p className="mb-3 break-all text-[11px] text-[#6B7280]">SHA-256 {board.benchmark.sha256}. Speech {board.benchmark.speech}. ASR {board.benchmark.asr || "unavailable"}. Review {board.benchmark.review}. Performance {board.benchmark.performance}.</p>
            <BenchmarkPanel
              benchmark={board.benchmark}
              busy={busy}
              onSave={async (body) => {
                setBusy(true);
                setError("");
                try {
                  await post({ op: "save-benchmark-notes", ...body });
                  setNotice("Breakdown notes saved. No video was started.");
                  await load();
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err));
                } finally {
                  setBusy(false);
                }
              }}
            />
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function rangeLabel(start: number, end: number) {
  const text = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));
  return `${text(start)}–${text(end)}s`;
}

function BenchmarkPanel({
  benchmark,
  busy,
  onSave,
}: {
  benchmark: BenchmarkView;
  busy: boolean;
  onSave: (body: { beats: BenchmarkBeatView[]; lines: { beatId: string; structureOnly: string }[] }) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [beats, setBeats] = useState(benchmark.beats);
  const [lines, setLines] = useState(benchmark.referenceScript.lines);
  useEffect(() => {
    setBeats(benchmark.beats);
    setLines(benchmark.referenceScript.lines);
  }, [benchmark]);

  function lineFor(id: string) {
    return lines.find((row) => row.beatId === id)?.structureOnly || "";
  }

  return (
    <Surface className="mb-4">
      <div className="flex flex-col gap-4 sm:flex-row">
        <video
          className="mx-auto h-72 w-40 shrink-0 rounded-xl bg-black object-contain sm:mx-0"
          controls
          playsInline
          preload="metadata"
          src={`/api/media/${benchmark.path}`}
        />
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.16em] text-[#652DFF]">QUALITY BENCHMARK</p>
          <h2 className="mt-1 text-base font-black">Visual breakdown and structure</h2>
          <p className="mt-1 text-[12px] text-[#6B7280]">
            {benchmark.originalName} · {benchmark.width}×{benchmark.height} · {benchmark.durationSec.toFixed(1)}s · visual only. Speech was not transcribed. Campaign performance {benchmark.performance}. This is not an accepted quality score.
          </p>
          <p className="mt-2 text-[12px] text-[#374151]">{benchmark.pattern}</p>
          <p className="mt-2 text-[12px] text-[#6B7280]">{benchmark.categoryNote}</p>
          <p className="mt-2 text-[11px] text-[#6B7280]">{benchmark.sampleNote} Hash {benchmark.sha256.slice(0, 12)}.</p>
        </div>
      </div>
      <div className="mt-3">
        <p className="text-[11px] font-semibold text-[#6B7280]">Do not carry into another SKU</p>
        <ul className="mt-1 list-disc pl-4 text-[12px] text-[#374151]">
          {benchmark.doNotCopy.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[12px] text-[#374151]">{benchmark.referenceScript.note}</p>
        <Btn type="button" variant="ghost" onClick={() => setEditing((value) => !value)}>{editing ? "Close editing" : "Edit notes"}</Btn>
      </div>
      <div className="mt-3 grid gap-2">
        {beats.map((beat) => (
          <article key={beat.id} className="rounded-xl border border-[#E6E8EE] bg-[#F7F8FB] p-3">
            <p className="text-[12px] font-semibold">{rangeLabel(beat.startSec, beat.endSec)} · {beat.purpose}</p>
            <p className="mt-1 text-[12px] text-[#374151]">{beat.framing} {beat.productAction}</p>
            {editing ? (
              <label className="mt-2 block text-[11px] font-semibold text-[#6B7280]">On-screen line from the sample
                <textarea className={inputClass + " min-h-16"} value={beat.onScreenText || ""} onChange={(e) => setBeats((rows) => rows.map((row) => row.id === beat.id ? { ...row, onScreenText: e.target.value } : row))} />
              </label>
            ) : (
              <p className="mt-2 text-[12px]"><span className="font-semibold text-[#6B7280]">On screen. </span>{beat.onScreenText || "No caption in this sample."}</p>
            )}
            <p className="mt-1 text-[12px] text-[#6B7280]">Spoken: not transcribed.</p>
            {editing ? (
              <label className="mt-2 block text-[11px] font-semibold text-[#6B7280]">Mechanism from this sample. Not a required sequence
                <textarea className={inputClass + " min-h-16"} value={lineFor(beat.id)} onChange={(e) => setLines((rows) => rows.map((row) => row.beatId === beat.id ? { ...row, structureOnly: e.target.value } : row))} />
              </label>
            ) : (
              <p className="mt-2 text-[12px]"><span className="font-semibold">Structure. </span>{lineFor(beat.id)}</p>
            )}
            {editing ? (
              <>
                <label className="mt-2 block text-[11px] font-semibold text-[#6B7280]">What to borrow
                  <textarea className={inputClass + " min-h-14"} value={beat.adapt} onChange={(e) => setBeats((rows) => rows.map((row) => row.id === beat.id ? { ...row, adapt: e.target.value } : row))} />
                </label>
                <label className="mt-2 block text-[11px] font-semibold text-[#6B7280]">Uncertainty
                  <textarea className={inputClass + " min-h-14"} value={beat.uncertainty} onChange={(e) => setBeats((rows) => rows.map((row) => row.id === beat.id ? { ...row, uncertainty: e.target.value } : row))} />
                </label>
              </>
            ) : (
              <>
                <p className="mt-2 text-[12px] text-[#374151]">Borrow: {beat.adapt}</p>
                <p className="mt-1 text-[11px] text-[#6B7280]">{beat.uncertainty}</p>
              </>
            )}
          </article>
        ))}
      </div>
      {editing ? (
        <Btn className="mt-3" type="button" variant="ghost" disabled={busy} onClick={() => void onSave({ beats, lines })}>{busy ? "Saving…" : "Save breakdown notes"}</Btn>
      ) : null}
      <p className="mt-3 rounded-xl bg-[#F7F8FB] p-3 text-[12px] text-[#374151]">
        <span className="font-semibold">Production script. </span>{benchmark.productionScript.reason}
      </p>
    </Surface>
  );
}

function Filter({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn("shrink-0 rounded-full border px-3 py-1 text-[12px] font-semibold", active ? "border-[#111827] bg-[#111827] text-white" : "border-[#E6E8EE] bg-white text-[#4B5563]")}>
      {label}
    </button>
  );
}
