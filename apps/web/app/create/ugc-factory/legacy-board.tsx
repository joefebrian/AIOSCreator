"use client";
// Previous My Productions board. Not routed. Rollback is to move this file back to page.tsx.

import { useEffect, useRef, useState } from "react";
import { Btn, inputClass, Surface } from "@/components/ui";
import { cn } from "@/lib/cn";
import { thumbSrc } from "@/lib/media-url";
import { spokenLineFitError } from "@/lib/ugc-factory-pack";

type Recipe = { id: string; family: "faceless" | "slideshow" | "talent"; name: string; needs: string[]; beats: string[] };
type Market = { id: string; label: string; locale: string; currency: string };
type Variant = {
  id: string;
  name: string;
  revision: number;
  stage: string;
  attention?: string;
  templateId: string;
  market: string;
  locale: string;
  platform: string;
  placementStatus: string;
  productId?: string;
  productTitle: string;
  heroImage?: string;
  referenceVideoUrl?: string;
  destinationUrl: string;
  offerIncluded: boolean;
  price?: string;
  currency?: string;
  brief?: string;
  durationSec?: number;
  scriptModel?: string;
  concepts: { id: string; kind: string; hook: string; angle: string; hypothesis?: string; picked?: boolean }[];
  script?: { revision: number; source: string; model?: string; spoken: string; scenes: { id?: string; index: number; goal: string; spoken: string; overlay: string; targetMs?: number; shot?: string; voiceover?: string }[]; cta: string; findings: { severity: string; message: string }[]; approved: boolean };
  storyboardApproved: boolean;
  produceJobId?: string;
  outputUrl?: string;
  previewUrl?: string;
  produce?: { status: string; progress?: string; mediaUrl?: string; error?: string };
  fashionStillUrl?: string;
};
type Product = { id: string; title: string; image: string; currency: string; price: string; instagramUsername?: string; suggestedTemplateId?: string; brandedCounts?: Record<string, number>; brandedResearch?: string; brandedExamples?: { creatorName: string; typeLabel: string; url: string; creationDate: string }[] };
type Take = { id: string; url: string; kind?: string };

const STAGES = [
  ["", "All"],
  ["DRAFT", "Draft"],
  ["SCRIPT_REVIEW", "Script Review"],
  ["STORYBOARD_REVIEW", "Storyboard Review"],
  ["READY_TO_PRODUCE", "Ready to Produce"],
  ["IN_PRODUCTION", "In Production"],
  ["OUTPUT_REVIEW", "Output Review"],
  ["READY_FOR_EXPORT", "Ready for Export"],
  ["EXPORTED", "Exported"],
] as const;

const ACTION: Record<string, string> = {
  DRAFT: "Continue Brief",
  SCRIPT_REVIEW: "Review Script",
  STORYBOARD_REVIEW: "Review Storyboard",
  READY_TO_PRODUCE: "Choose model",
  IN_PRODUCTION: "View Progress",
  OUTPUT_REVIEW: "Review Output",
  READY_FOR_EXPORT: "Export",
  EXPORTED: "Download",
};

function stageText(stage: string) {
  return STAGES.find((row) => row[0] === stage)?.[1] || stage;
}

function sectionFor(stage: string) {
  if (stage === "SCRIPT_REVIEW") return "script";
  if (stage === "STORYBOARD_REVIEW" || stage === "READY_TO_PRODUCE" || stage === "IN_PRODUCTION" || stage === "OUTPUT_REVIEW") return "storyboard";
  return "brief";
}

function familyLabel(family?: string) {
  if (family === "slideshow") return "slideshow";
  if (family === "talent") return "throwaway talent";
  return "faceless";
}

const VIDEO_MODELS = [
  { id: "wan-3-0", label: "Wan 3.0" },
  { id: "wan-3-0-std", label: "Wan 3.0 std" },
  { id: "seedance-2-5", label: "Seedance 2.5" },
  { id: "grok-imagine-video", label: "Grok Video" },
] as const;

const SCRIPT_MODELS = [
  { id: "gpt-6-luna", label: "GPT-6 Luna" },
  { id: "gpt-6-sol", label: "GPT-6 Sol" },
  { id: "gpt-6.1-sol", label: "GPT-6.1 Sol" },
] as const;

function jevSeconds(detail: Variant) {
  const seconds = Math.round(Number(detail.durationSec));
  return seconds >= 10 && seconds <= 30 ? seconds : 0;
}

function Storyboard({ detail, recipe, busy, visualBusy, previewBusy, onApprove, onProduce, onVisualize, onPreview }: { detail: Variant; recipe?: Recipe; busy: boolean; visualBusy: boolean; previewBusy: boolean; onApprove: () => void; onProduce: (engineId: string) => void; onVisualize: () => void; onPreview: () => void }) {
  const [engineId, setEngineId] = useState("wan-3-0");
  const scenes = detail.script?.scenes.slice().sort((a, b) => a.index - b.index) || [];
  const plannedSec = Math.round(scenes.reduce((sum, scene) => sum + (scene.targetMs || 0), 0) / 1000);
  const length = plannedSec ? `${scenes.length} scenes, ${plannedSec} seconds altogether` : "each storyboard scene";
  const marketName = ({ ID: "Indonesia", MY: "Malaysia", SG: "Singapore", TH: "Thailand", JP: "Japan", US: "the United States" } as Record<string, string>)[detail.market] || detail.market;
  const who = recipe?.family === "talent" ? ` The person is an adult in ${marketName}. A named character only generates when that character's country is this market.` : "";
  const plan = recipe?.family === "slideshow"
    ? "Generate Production makes the slides from this approved script. It does not write a new script."
    : `Generate Production films ${length}. Each scene uses its own seconds. The short line stays at the top and the spoken line stays at the bottom, and that spoken line is the voiceover. The scenes are joined with the voice on. Wan 3.0, Wan 3.0 std, Seedance, and Grok Video all receive that same scene list. A scene longer than the model's max is refused before any clip starts. Grok Video stops at 15 seconds per scene.${who}`;
  const clip = detail.outputUrl || detail.produce?.mediaUrl || "";
  return (
    <div className="mt-4 grid gap-2 text-[13px]">
      <p className="text-[12px] text-[#6B7280]">{recipe ? `${recipe.id} ${recipe.name} · ${familyLabel(recipe.family)}. ` : ""}Shot plan from the approved script.</p>
      {scenes.length ? scenes.map((scene) => (
        <div key={scene.id || scene.index} className="rounded-xl border border-[#E6E8EE] p-2 text-[12px]">
          <p className="font-semibold">{scene.index}. {scene.goal}{scene.targetMs ? ` · ${Math.max(1, Math.round(scene.targetMs / 1000))}s` : ""}</p>
          {scene.shot ? <p className="mt-1 text-[#4B5563]">Camera: {scene.shot}</p> : null}
          {scene.voiceover ? <p className="mt-1 text-[#4B5563]">Voiceover: {scene.voiceover}</p> : null}
          {scene.spoken ? <p className="mt-1 text-[#4B5563]">{scene.voiceover ? `Script: ${scene.spoken}` : scene.spoken}</p> : null}
          {scene.overlay ? <p className="mt-1 text-[#6B7280]">On screen: {scene.overlay}</p> : null}
          {spokenLineFitError(scene.spoken || "", (scene.targetMs || 0) / 1000) ? (
            <p className="mt-1 text-[#92400E]">{spokenLineFitError(scene.spoken || "", (scene.targetMs || 0) / 1000)}</p>
          ) : null}
        </div>
      )) : <p className="text-[12px] text-[#6B7280]">Approve the script before this storyboard can list scenes.</p>}
      <p className="text-[12px] text-[#6B7280]">Astra writes the camera move and the voiceover for each scene. The short on-screen line stays at the top. The spoken line stays at the bottom and plays as the voice. An approved script stays as it is.</p>
      <p className="text-[12px] text-[#6B7280]">One listing photo stays one shot. Preview moves slowly closer on that photo, plays the spoken lines, and puts the short line on top. It does not call a video model. Generate Production is a separate camera move, not a new box or a hand.</p>
      {detail.script?.approved ? (
        <>
          <Btn type="button" variant="ghost" disabled={previewBusy || busy} onClick={onPreview}>{previewBusy ? "Previewing…" : "Preview on the photo"}</Btn>
          {detail.previewUrl ? (
            <>
              <p className="text-[12px] font-semibold text-[#111827]">Photo preview. One slow move on the listing photo. The voice is the script.</p>
              <video src={detail.previewUrl} controls className="w-full rounded-xl bg-black" />
            </>
          ) : null}
        </>
      ) : null}
      <Btn type="button" variant="ghost" disabled={!detail.script || detail.script.approved || visualBusy} onClick={onVisualize}>{detail.script?.approved ? "Script already approved" : visualBusy ? "Visualizing…" : "Visualize with Astra"}</Btn>
      {detail.script && !detail.script.approved ? <p className="text-[12px] text-[#6B7280]">The script is not approved yet.</p> : null}
      {!detail.storyboardApproved ? (
        <Btn type="button" disabled={!detail.script?.approved} onClick={onApprove}>Approve Storyboard</Btn>
      ) : (
        <>
          {clip ? (
            <>
              <p className="text-[12px] font-semibold text-[#111827]">Generated video. Camera move on the listing photo.</p>
              <video src={clip} controls className="w-full rounded-xl bg-black" />
            </>
          ) : null}
          <p className="text-[12px] text-[#6B7280]">{plan}</p>
          <label className="block text-[11px] font-semibold text-[#6B7280]">Video model
            <select className={inputClass} value={engineId} disabled={busy || detail.stage === "IN_PRODUCTION"} onChange={(event) => setEngineId(event.target.value)}>
              {VIDEO_MODELS.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
            </select>
          </label>
          <Btn type="button" disabled={busy || detail.stage === "IN_PRODUCTION" || !detail.script?.approved} onClick={() => onProduce(engineId)}>{busy || detail.stage === "IN_PRODUCTION" ? "Rendering…" : "Generate Production"}</Btn>
          {detail.stage === "IN_PRODUCTION" ? <p className="text-[12px] text-[#6B7280]">{detail.produce?.progress || "One clip is rendering from this script."}</p> : null}
          {detail.attention ? <p className="text-[12px] text-[#B91C1C]">{detail.attention}</p> : null}
        </>
      )}
    </div>
  );
}

function BriefPanel({ detail, busy, estimating, onEstimate, onWrite }: { detail: Variant; busy: boolean; estimating: boolean; onEstimate: () => void; onWrite: () => void }) {
  const seconds = jevSeconds(detail);
  const shortScene = (detail.script?.scenes || []).some((scene) => (scene.targetMs || 0) > 0 && (scene.targetMs || 0) < 4000);
  const approvedSec = detail.script?.approved ? Math.round((detail.script.scenes || []).reduce((sum, scene) => sum + (scene.targetMs || 0), 0) / 1000) : 0;
  const angles = detail.concepts.filter((concept) => typeof concept.picked === "boolean");
  return (
    <div className="mt-4 grid gap-2 text-[13px]">
      <p>{detail.productTitle}</p>
      <p className="text-[12px] text-[#6B7280]">Astra writes three angles in the market language. Jev picks one and estimates the seconds. When the script lines need more time, Jev raises that total, up to 30. Each scene gets enough time for its line. The voice is not sped up. Nothing here starts a video.</p>
      {seconds ? <p className="text-[12px] font-semibold text-[#111827]">Jev estimated {seconds}s.</p> : <p className="text-[12px] text-[#6B7280]">Jev has not estimated a length yet. Write brief asks him.</p>}
      {shortScene ? <p className="text-[12px] text-[#6B7280]">Seedance raises a scene under 4 seconds to 4.</p> : null}
      {approvedSec && seconds && approvedSec !== seconds ? <p className="text-[12px] text-[#6B7280]">The approved script is still {approvedSec}s. The next script write uses {seconds}s.</p> : null}
      {detail.brief ? <p className="rounded-xl bg-[#F7F8FB] p-2 text-[13px]">{detail.brief}</p> : <p className="text-[12px] text-[#6B7280]">No brief yet. Write brief fills this from the angle Jev picks.</p>}
      <Btn type="button" variant="ghost" disabled={estimating || busy || !detail.brief} onClick={onEstimate}>{estimating ? "Estimating…" : "Estimate seconds"}</Btn>
      <Btn type="button" disabled={busy} onClick={onWrite}>{busy ? "Writing brief…" : "Write brief"}</Btn>
      {angles.length ? (
        <ul className="grid gap-1 text-[12px]">
          {angles.map((concept) => (
            <li key={concept.id} className={cn("rounded-lg px-2 py-1", concept.picked ? "bg-[#EEF1F6] font-semibold" : "bg-[#F7F8FB]")}>
              {concept.picked ? "Picked. " : ""}{concept.hook} {concept.angle}
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-[12px] text-[#6B7280]">Destination stays separate from the source listing. Placement status: {detail.placementStatus}.</p>
      {detail.destinationUrl ? <a href={detail.destinationUrl} target="_blank" rel="noreferrer" className="truncate text-[12px] text-[#652DFF]">{detail.destinationUrl}</a> : null}
      {detail.referenceVideoUrl ? <p className="text-[12px] text-[#6B7280]">A reference video from the ad is saved on this variant. It does not start a render, and the ad model is not the talent.</p> : null}
      <p className="text-[12px]">{detail.offerIncluded ? `Offer kept: ${detail.price} ${detail.currency}` : "No offer in this market currency. Nothing was converted."}</p>
    </div>
  );
}

export default function UgcFactoryPage() {
  const [variants, setVariants] = useState<Variant[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [fashionLooks, setFashionLooks] = useState<{ id: string; name: string; stillUrl: string }[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [stage, setStage] = useState("");
  const [family, setFamily] = useState("");
  const [q, setQ] = useState("");
  const [openId, setOpenId] = useState("");
  const [section, setSection] = useState("brief");
  const [panel, setPanel] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [takes, setTakes] = useState<Take[]>([]);
  const openedFromUrl = useRef(false);
  const [form, setForm] = useState({
    productId: "",
    templateId: "F03",
    platform: "TIKTOK",
    markets: ["ID"] as string[],
    destinationUrl: "",
    talentSource: "NONE",
    fashionProjectId: "",
    reuseMode: "SAME_TALENT_AND_OUTFIT",
  });

  async function load() {
    const res = await fetch("/api/ugc-factory/board");
    const json = await res.json();
    setVariants(json.variants || []);
    setRecipes(json.recipes || []);
    setMarkets(json.markets || []);
    setProducts(json.products || []);
    setFashionLooks(json.fashionLooks || []);
    const next: Record<string, number> = {};
    for (const variant of json.variants || []) next[variant.stage] = (next[variant.stage] || 0) + 1;
    setCounts(next);
  }

  useEffect(() => {
    void load();
    void fetch("/api/factory/takes")
      .then((res) => res.json())
      .then((json) => setTakes([...(json.clips || []), ...(json.stills || [])].slice(0, 8)));
  }, []);

  useEffect(() => {
    if (openedFromUrl.current || !variants.length) return;
    openedFromUrl.current = true;
    const id = new URLSearchParams(window.location.search).get("variant") || "";
    if (!id || !variants.some((row) => row.id === id)) return;
    const variant = variants.find((row) => row.id === id);
    setOpenId(id);
    setSection(sectionFor(variant?.stage || ""));
    requestAnimationFrame(() => {
      document.getElementById("factory-variant")?.scrollIntoView({ block: "start" });
    });
  }, [variants]);

  const visible = variants.filter((variant) => {
    const recipe = recipes.find((row) => row.id === variant.templateId);
    if (stage && variant.stage !== stage) return false;
    if (family && recipe?.family !== family) return false;
    if (q && !`${variant.name} ${variant.productTitle} ${variant.market} ${variant.platform}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const detail = variants.find((variant) => variant.id === openId);
  const rendering = variants.some((row) => row.stage === "IN_PRODUCTION");

  useEffect(() => {
    if (!rendering) return;
    const timer = window.setInterval(() => { void load(); }, 5000);
    return () => window.clearInterval(timer);
  }, [rendering]);

  async function post(body: Record<string, unknown>) {
    const res = await fetch("/api/ugc-factory/board", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Request failed");
    return json;
  }

  async function produce(variant: Variant, engineId: string) {
    if (busy === "produce") return;
    setBusy("produce");
    setError("");
    setOpenId(variant.id);
    setSection("storyboard");
    try {
      const json = await post({ op: "produce", variantId: variant.id, expectedRevision: variant.revision, engineId });
      setNotice(json.duplicate ? "That storyboard is already rendering." : "Each storyboard scene is rendering, then the scenes are joined.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function create() {
    setError("");
    try {
      const json = await post({
        op: "create",
        ...form,
        idempotencyKey: crypto.randomUUID(),
        talentSource: recipes.find((row) => row.id === form.templateId)?.family === "talent" ? form.talentSource : "NONE",
      });
      setNotice(`${json.variants.length} variant${json.variants.length === 1 ? "" : "s"} drafted. No video job was sent.`);
      setPanel("");
      await load();
      if (json.variants?.[0]) {
        setOpenId(json.variants[0].id);
        setSection("brief");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="min-w-0 px-4 py-5 md:px-6 md:py-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.18em] text-[#652DFF]">UGC FACTORY</p>
          <h1 className="mt-0.5 text-[22px] font-black tracking-tight">My Productions</h1>
          <p className="text-[12px] text-[#6B7280]">{variants.length} variant{variants.length === 1 ? "" : "s"} · 33 recipes · placement profiles still need verification</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input className={inputClass + " mt-0 !w-52"} placeholder="Search variants" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search variants" />
          <Btn type="button" onClick={() => setPanel("create")}>Create Production</Btn>
          <Btn type="button" variant="ghost" onClick={() => setPanel("templates")}>Templates</Btn>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {(["", "faceless", "slideshow", "talent"] as const).map((id) => (
          <button key={id || "all-family"} type="button" onClick={() => setFamily(id)} className={cn("rounded-full border px-3 py-1 text-[12px] font-semibold", family === id ? "border-[#111827] bg-[#111827] text-white" : "border-[#E6E8EE] bg-white text-[#4B5563]")}>
            {id === "" ? "All output" : id === "faceless" ? "Faceless" : id === "slideshow" ? "Slideshow" : "Talent"}
          </button>
        ))}
      </div>
      <div className="mb-4 flex w-full min-w-0 gap-1.5 overflow-x-auto pb-1">
        {STAGES.map(([id, label]) => (
          <button key={id || "all"} type="button" onClick={() => setStage(id)} className={cn("shrink-0 rounded-full border px-3 py-1 text-[12px] font-semibold", stage === id ? "border-[#111827] bg-[#111827] text-white" : "border-[#E6E8EE] bg-white text-[#4B5563]")}>
            {label} <span className="text-[#9CA3AF]">{id ? counts[id] || 0 : variants.length}</span>
          </button>
        ))}
      </div>
      {notice ? <p className="mb-3 text-[12px] text-[#374151]">{notice}</p> : null}
      {error ? <p className="mb-3 text-[12px] text-[#B91C1C]">{error}</p> : null}

      <div className={detail ? "lg:grid lg:grid-cols-[minmax(0,1fr)_32rem] lg:items-start lg:gap-4" : ""}>
        <div className="grid gap-3 xl:grid-cols-2">
          {visible.map((variant) => {
            const recipe = recipes.find((row) => row.id === variant.templateId);
            const sku = products.find((row) => row.id === variant.productId)?.image || "";
            const thumb = sku || variant.heroImage || "";
            return (
              <div key={variant.id} id={`variant-${variant.id}`}>
                <Surface className={cn("flex items-center gap-3 p-3", openId === variant.id && "ring-2 ring-[#111827]")}>
                  <button type="button" className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-lg bg-[#EEF1F6]" onClick={() => { setOpenId(variant.id); setSection("brief"); }}>
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumbSrc(thumb, 120)} alt="" className="h-full w-full object-cover" />
                    ) : <span className="px-1 text-center text-[10px] font-semibold text-[#9CA3AF]">No pack shot</span>}
                  </button>
                  <div className="min-w-0 flex-1">
                    <button type="button" className="line-clamp-1 text-left text-sm font-semibold" onClick={() => { setOpenId(variant.id); setSection(sectionFor(variant.stage)); }}>{variant.name}</button>
                    <p className="truncate text-[12px] text-[#6B7280]">{recipe?.name || variant.templateId} · {variant.market} · {variant.platform}</p>
                    <p className="text-[11px] text-[#9CA3AF]">{variant.locale} · {variant.script?.scenes.length || 0} scenes · profile unverified</p>
                    {variant.attention ? <p className="truncate text-[11px] text-[#C2410C]" title={variant.attention}>{variant.attention}</p> : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="rounded-full bg-[#F3F4F8] px-2 py-0.5 text-[11px] font-semibold">{stageText(variant.stage)}</span>
                    <button type="button" className="rounded-lg border border-[#E6E8EE] px-2.5 py-1 text-center text-[12px] font-semibold" onClick={() => { setOpenId(variant.id); setSection(sectionFor(variant.stage)); }}>{ACTION[variant.stage] || "Open"}</button>
                  </div>
                </Surface>
              </div>
            );
          })}
          {!visible.length ? (
            <Surface className="col-span-full py-16 text-center">
              <p className="text-sm font-semibold">No productions on this filter</p>
              <p className="mt-1 text-[12px] text-[#6B7280]">Create a draft from a catalog product. Picking a template does not render a video.</p>
            </Surface>
          ) : null}
        </div>

        {detail ? (
          <aside id="factory-variant" className="mt-4 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-2xl border border-[#E6E8EE] bg-white p-4 lg:sticky lg:top-3 lg:mt-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-black">{detail.name}</p>
                <p className="text-[11px] text-[#6B7280]">Revision {detail.revision} · {detail.market} · {detail.locale} · {stageText(detail.stage)}</p>
              </div>
              <button type="button" className="rounded-lg border px-2 py-1 text-[12px] font-semibold" onClick={() => setOpenId("")}>Close</button>
            </div>
            <div className="mt-3 flex gap-1">
              {["brief", "script", "storyboard"].map((id) => (
                <button key={id} type="button" className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize", section === id ? "bg-[#111827] text-white" : "bg-[#F3F4F8]")} onClick={() => setSection(id)}>{id}</button>
              ))}
            </div>
            {section === "brief" ? (
              <BriefPanel detail={detail} busy={busy === "brief"} estimating={busy === "duration"} onEstimate={() => {
                setBusy("duration");
                setError("");
                void post({ op: "estimate-duration", variantId: detail.id })
                  .then((json) => { setNotice(`Jev estimated ${json.durationSec}s from this brief. The spoken lines stayed. No video was started.`); return load(); })
                  .catch((err) => setError(String(err.message || err)))
                  .finally(() => setBusy(""));
              }} onWrite={() => {
                setBusy("brief");
                setError("");
                void post({ op: "brief", variantId: detail.id })
                  .then((json) => { setNotice(`Astra wrote three angles. Jev picked one and estimated ${json.durationSec}s. No video was started.`); return load(); })
                  .catch((err) => setError(String(err.message || err)))
                  .finally(() => setBusy(""));
              }} />
            ) : null}
            {section === "script" ? (
              <div className="mt-4 grid gap-2 text-[13px]">
                <p className="text-[12px] text-[#6B7280]">Jev sets the total from these lines, between 10 and 30 seconds. Each scene gets enough time to say its line. The voice is not sped up. No video starts.</p>
                <label className="block text-[11px] font-semibold text-[#6B7280]">Script model
                  <select className={inputClass} value={SCRIPT_MODELS.some((model) => model.id === detail.scriptModel) ? detail.scriptModel : "gpt-6-luna"} onChange={(event) => {
                    void post({ op: "patch", variantId: detail.id, scriptModel: event.target.value, expectedRevision: detail.revision }).then(() => load()).catch((err) => setError(String(err.message || err)));
                  }}>
                    {SCRIPT_MODELS.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
                  </select>
                </label>
                <Btn type="button" disabled={busy === "script" || detail.script?.approved} onClick={() => {
                  setBusy("script");
                  setError("");
                  const model = SCRIPT_MODELS.some((row) => row.id === detail.scriptModel) ? detail.scriptModel : "gpt-6-luna";
                  void post({ op: "script", variantId: detail.id, instructions: "", model })
                    .then((json) => { setNotice(`Script saved at ${json.durationSec}s. The scene times follow the lines. No video was started.`); return load(); })
                    .catch((err) => setError(String(err.message || err)))
                    .finally(() => setBusy(""));
                }}>{detail.script?.approved ? "Script already approved" : busy === "script" ? "Writing…" : "Write script"}</Btn>
                <Btn type="button" variant="ghost" onClick={() => void post({ op: "recheck", variantId: detail.id }).then(() => load()).catch((err) => setError(String(err.message || err)))}>Check script</Btn>
                {detail.script ? (
                  <>
                    <p className="text-[11px] text-[#9CA3AF]">Revision {detail.script.revision} · {detail.script.source}{detail.script.model ? ` · ${detail.script.model}` : ""} · {detail.script.scenes.length} scenes</p>
                    {detail.script.scenes[0]?.spoken ? <p className="rounded-xl bg-[#F7F8FB] p-2 text-[13px] font-semibold">{detail.script.scenes[0].spoken}</p> : null}
                    {detail.script.scenes.map((scene) => (
                      <div key={scene.index} className="rounded-xl border border-[#E6E8EE] p-2 text-[12px]">
                        <p className="font-semibold">{scene.index}. {scene.goal}{scene.targetMs ? ` · ${Math.round(scene.targetMs / 1000)}s` : ""}</p>
                        {scene.spoken ? <p className="mt-1 text-[#4B5563]">{scene.spoken}</p> : <p className="mt-1 text-[#9CA3AF]">Slide text: {scene.overlay}</p>}
                        {spokenLineFitError(scene.spoken || "", (scene.targetMs || 0) / 1000) ? <p className="mt-1 text-[#92400E]">{spokenLineFitError(scene.spoken || "", (scene.targetMs || 0) / 1000)}</p> : null}
                      </div>
                    ))}
                    <p className="text-[12px]">{detail.script.cta}</p>
                    {detail.script.findings.map((finding) => <p key={finding.message} className={cn("text-[12px]", finding.severity === "BLOCK" ? "text-[#B91C1C]" : "text-[#6B7280]")}>{finding.severity}: {finding.message}</p>)}
                    <Btn type="button" variant="ghost" disabled={detail.script.findings.some((finding) => finding.severity === "BLOCK") || detail.script.approved} onClick={() => void post({ op: "approve-script", variantId: detail.id, expectedRevision: detail.revision }).then(() => { setSection("storyboard"); return load(); }).catch((err) => setError(String(err.message || err)))}>Approve Script</Btn>
                  </>
                ) : null}
              </div>
            ) : null}
            {section === "storyboard" ? (
              <Storyboard detail={detail} recipe={recipes.find((row) => row.id === detail.templateId)} busy={busy === "produce"} visualBusy={busy === "visualize"} previewBusy={busy === "preview"} onApprove={() => void post({ op: "approve-storyboard", variantId: detail.id, expectedRevision: detail.revision }).then(() => { setNotice("Storyboard approved. Preview the photo before a video model."); return load(); }).catch((err) => setError(String(err.message || err)))} onProduce={(engineId) => void produce(detail, engineId)} onPreview={() => {
                setBusy("preview");
                setError("");
                void post({ op: "preview", variantId: detail.id })
                  .then(() => { setNotice("Photo preview is ready. No video model was called."); return load(); })
                  .catch((err) => setError(String(err.message || err)))
                  .finally(() => setBusy(""));
              }} onVisualize={() => {
                setBusy("visualize");
                setError("");
                void post({ op: "visualize", variantId: detail.id })
                  .then(() => { setNotice("Astra saved the camera moves and voiceover. No video was started."); return load(); })
                  .catch((err) => setError(String(err.message || err)))
                  .finally(() => setBusy(""));
              }} />
            ) : null}
          </aside>
        ) : null}
      </div>

      <details className="mt-6">
        <summary className="cursor-pointer text-[12px] font-semibold text-[#6B7280]">Earlier Factory takes</summary>
        <div className="mt-2 flex gap-2 overflow-x-auto">
          {takes.map((take) => (
            <div key={take.id} className="h-24 w-16 shrink-0 overflow-hidden rounded-lg bg-[#111827]">
              {/\.mp4($|\?)/i.test(take.url) ? <video src={take.url} muted className="h-full w-full object-cover" /> : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={thumbSrc(take.url, 120)} alt="" className="h-full w-full object-cover" />
              )}
            </div>
          ))}
          {!takes.length ? <p className="text-[12px] text-[#9CA3AF]">No earlier takes.</p> : null}
        </div>
      </details>

      {panel === "create" ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/30 p-4">
          <Surface className="max-h-[90vh] w-full max-w-lg overflow-y-auto">
            <div className="flex items-center justify-between"><p className="font-black">Create Production</p><button type="button" onClick={() => setPanel("")}>Close</button></div>
            <label className="mt-3 block text-[11px] font-semibold text-[#6B7280]">Catalog product
              <select className={inputClass} value={form.productId} onChange={(e) => {
                const product = products.find((row) => row.id === e.target.value);
                const templateId = product?.suggestedTemplateId || form.templateId;
                const family = recipes.find((row) => row.id === templateId)?.family;
                setForm({
                  ...form,
                  productId: e.target.value,
                  templateId,
                  talentSource: family === "talent" ? (form.talentSource === "FASHION_LOOK" ? "FASHION_LOOK" : "NEW") : "NONE",
                });
              }}>
                <option value="">Choose a product</option>
                {products.map((product) => <option key={product.id} value={product.id}>{product.title}</option>)}
              </select>
            </label>
            <label className="mt-2 block text-[11px] font-semibold text-[#6B7280]">Template
              <select className={inputClass} value={form.templateId} onChange={(e) => {
                const templateId = e.target.value;
                const family = recipes.find((row) => row.id === templateId)?.family;
                setForm({ ...form, templateId, talentSource: family === "talent" ? (form.talentSource === "NONE" ? "NEW" : form.talentSource) : "NONE" });
              }}>
                {recipes.map((recipe) => <option key={recipe.id} value={recipe.id}>{recipe.id} {recipe.name}</option>)}
              </select>
            </label>
            {(() => {
              const selected = products.find((row) => row.id === form.productId);
              if (!selected?.brandedResearch) return null;
              return (
                <div className="mt-2 rounded-md bg-[#F3F4F8] p-2 text-[11px] leading-snug text-[#374151]">
                  <p>{selected.brandedResearch}</p>
                  {(selected.brandedExamples || []).map((example) => (
                    <a key={example.url} href={example.url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-[#652DFF]">{example.typeLabel} · {example.creatorName} · {example.creationDate}</a>
                  ))}
                </div>
              );
            })()}
            {recipes.find((row) => row.id === form.templateId) ? <p className="mt-1 text-[11px] text-[#6B7280]">Needs {recipes.find((row) => row.id === form.templateId)?.needs.join(", ")}. A missing photo or package keeps the draft blocked and the script is not allowed to pretend that asset is in frame.</p> : null}
            <label className="mt-2 block text-[11px] font-semibold text-[#6B7280]">Platform
              <select className={inputClass} value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>
                <option value="META">Meta</option>
                <option value="TIKTOK">TikTok</option>
                <option value="DEMAND_GEN">Google Ads Demand Gen</option>
                <option value="SHOPEE">Shopee</option>
              </select>
            </label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {markets.map((market) => (
                <button key={market.id} type="button" className={cn("rounded-full border px-2 py-1 text-[12px] font-semibold", form.markets.includes(market.id) ? "border-[#111827] bg-[#111827] text-white" : "border-[#E6E8EE]")} onClick={() => setForm({ ...form, markets: form.markets.includes(market.id) ? form.markets.filter((id) => id !== market.id) : [...form.markets, market.id] })}>{market.label}</button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-[#6B7280]">Each selected market becomes its own variant. Japan does not add Shopee Japan or Amazon Japan. Shopee placement stays unverified outside ID, MY, SG, and TH.</p>
            <label className="mt-2 block text-[11px] font-semibold text-[#6B7280]">Destination URL
              <input className={inputClass} value={form.destinationUrl} placeholder="Optional. Defaults to the product affiliate link." onChange={(e) => setForm({ ...form, destinationUrl: e.target.value })} />
            </label>
            {recipes.find((row) => row.id === form.templateId)?.family === "talent" ? (
              <label className="mt-2 block text-[11px] font-semibold text-[#6B7280]">Talent
                <select className={inputClass} value={form.talentSource} onChange={(e) => setForm({ ...form, talentSource: e.target.value })}>
                  <option value="NONE">Not chosen yet</option>
                  <option value="NEW">New adult talent</option>
                  <option value="FASHION_LOOK">Approved Fashion still</option>
                </select>
              </label>
            ) : null}
            {form.talentSource === "FASHION_LOOK" ? (
              <label className="mt-2 block text-[11px] font-semibold text-[#6B7280]">Fashion look
                <select className={inputClass} value={form.fashionProjectId} onChange={(e) => setForm({ ...form, fashionProjectId: e.target.value })}>
                  <option value="">Choose an approved still</option>
                  {fashionLooks.map((look) => <option key={look.id} value={look.id}>{look.name}</option>)}
                </select>
              </label>
            ) : null}
            <Btn className="mt-3" type="button" onClick={() => void create()}>Create drafts</Btn>
          </Surface>
        </div>
      ) : null}

      {panel === "templates" ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/30 p-4">
          <Surface className="max-h-[90vh] w-full max-w-2xl overflow-y-auto">
            <div className="flex items-center justify-between"><p className="font-black">33 templates</p><button type="button" onClick={() => setPanel("")}>Close</button></div>
            <div className="mt-3 grid gap-2">
              {recipes.map((recipe) => (
                <button key={recipe.id} type="button" className="rounded-xl border border-[#E6E8EE] px-3 py-2 text-left text-[12px] hover:border-[#652DFF]/40" onClick={() => { setForm({ ...form, templateId: recipe.id }); setPanel("create"); }}>
                  <span className="font-semibold">{recipe.id} {recipe.name}</span>
                  <span className="ml-2 capitalize text-[#6B7280]">{recipe.family}</span>
                  <span className="mt-0.5 block text-[#9CA3AF]">Needs {recipe.needs.join(", ")} · {recipe.family === "slideshow" ? "6 slides" : `${recipe.beats.length} beats`}</span>
                </button>
              ))}
            </div>
          </Surface>
        </div>
      ) : null}
    </div>
  );
}
