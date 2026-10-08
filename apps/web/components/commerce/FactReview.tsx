"use client";

import { useEffect, useRef, useState } from "react";
import { Btn, inputClass } from "@/components/ui";
import { ageSuitabilityApplies, factCategory, isSourceTestimonial, legacyKindForCategory, presentFact, type EvidenceFact, type FactCategory } from "@/lib/fact-evidence";
import { thumbSrc } from "@/lib/media-url";
import { cn } from "@/lib/cn";
import { ReferenceWorkspace } from "./ReferenceWorkspace";

type Media = { id: string; url: string; role: string };
type Reference = {
  id: string;
  creator: string | null;
  platform: string;
  mediaUrl: string | null;
  posterUrl?: string | null;
  analysis: { version: number | null; transcript?: { startSec: number; endSec: number; text: string }[]; candidateFacts?: { statement: string; startSec: number | null; endSec: number | null; source: string }[] } | null;
};
type Campaign = { id: string; name: string; angle: string; productIds: string[] };

export function FactReview({
  productId,
  skuId,
  category,
  facts,
  media,
  matches,
  productions,
  requestedPane,
  requestKey,
  openAdd,
  onChanged,
}: {
  productId: string;
  skuId: string;
  category: string;
  facts: EvidenceFact[];
  media: Media[];
  matches: { posts?: { url?: string; creatorName?: string; type?: string; creationDate?: string }[] } | null;
  productions: { id: string; market: string; locale: string; revision: number }[];
  requestedPane: "media" | "ugc" | "facts" | "campaigns";
  requestKey: number;
  openAdd: boolean;
  onChanged: () => void;
}) {
  const [pane, setPane] = useState<"media" | "ugc" | "facts" | "campaigns">("ugc");
  const [selectedFact, setSelectedFact] = useState("");
  const [selectedMedia, setSelectedMedia] = useState(0);
  const [references, setReferences] = useState<Reference[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [referenceId, setReferenceId] = useState("");
  const [startSec, setStartSec] = useState(0);
  const [basis, setBasis] = useState("");
  const [editing, setEditing] = useState("");
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [addCategory, setAddCategory] = useState<FactCategory>("usage");
  const [addText, setAddText] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const showAge = ageSuitabilityApplies(category, facts);
  const images = media.filter((item) => item.url.startsWith("/api/media/") && !/\.(mp4|webm|mov)(\?|$)/i.test(item.url));
  const active = facts.find((fact) => fact.id === selectedFact);
  const activeView = active ? presentFact(active) : null;

  useEffect(() => {
    if (!requestKey) return;
    setPane(requestedPane);
  }, [requestKey, requestedPane]);

  useEffect(() => {
    void fetch(`/api/commerce/ugc-references?productId=${encodeURIComponent(productId)}`).then((res) => res.json()).then((json) => {
      const rows = (json.references || []) as Reference[];
      setReferences(rows);
      if (!referenceId && rows[0]) setReferenceId(rows[0].id);
    }).catch(() => setReferences([]));
    void fetch("/api/commerce/campaigns").then((res) => res.json()).then((json) => {
      const rows = ((json.campaigns || []) as Campaign[]).filter((row) => row.productIds?.includes(productId));
      setCampaigns(rows);
    }).catch(() => setCampaigns([]));
  }, [productId]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const reference = references.find((row) => row.id === referenceId) || references[0];
  const known = new Set(facts.map((fact) => fact.statement.replace(/\s+/g, " ").trim()));
  const transcript = (reference?.analysis?.transcript || []).filter((line) => line.text && !known.has(line.text.replace(/\s+/g, " ").trim()));
  const spokenTestimonials = transcript.filter((line) => isSourceTestimonial({ statement: line.text }));
  const inspirations = transcript.filter((line) => !isSourceTestimonial({ statement: line.text }));
  const hasAgeFact = facts.some((fact) => factCategory(fact) === "age");
  useEffect(() => {
    const node = videoRef.current;
    if (!node || pane !== "ugc") return;
    const seek = () => { node.currentTime = startSec; };
    if (node.readyState >= 1) seek();
    else node.addEventListener("loadedmetadata", seek, { once: true });
  }, [pane, startSec, reference?.id]);

  function viewEvidence(fact: EvidenceFact) {
    setSelectedFact(fact.id || "");
    const view = presentFact(fact);
    if (view.source === "ugc" && fact.provenance?.referenceId) {
      setPane("ugc");
      setReferenceId(fact.provenance.referenceId);
      setStartSec(fact.provenance.startSec || 0);
      return;
    }
    if (view.source === "campaign") {
      setPane("campaigns");
      return;
    }
    setPane("media");
  }

  async function post(body: Record<string, unknown>) {
    setBusy("save");
    setError("");
    try {
      const res = await fetch("/api/commerce/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Could not save the fact.");
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="mt-6" data-fact-workspace>
      <div className="flex gap-4 overflow-x-auto border-b border-[#E6E8EE] pb-3" role="tablist" aria-label="Media and facts" data-evidence-pane data-evidence-tab={pane}>
        {([["media", "Product media"], ["ugc", "UGC references"], ["facts", "Product facts"], ["campaigns", "Campaigns"]] as const).map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={pane === id} className={cn("shrink-0 text-sm font-semibold", pane === id ? "text-[#111827]" : "text-[#6B7280]")} onClick={() => setPane(id)}>{label}</button>
        ))}
      </div>
      <div className="mt-6">
        {pane === "media" ? (
          <div className="mt-3">
            {images.length ? (
              <>
                <img src={thumbSrc(images[selectedMedia]?.url || images[0].url, 640)} alt="" className="max-h-72 w-full rounded-xl bg-[#F7F8FB] object-contain" />
                <p className="mt-2 text-[12px] text-[#6B7280]">No saved text was read from this image.</p>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {images.map((item, index) => (
                    <button key={item.url} type="button" className={cn("rounded-lg border p-1 text-left", selectedMedia === index && "border-[#111827]")} data-image-index={index + 1} onClick={() => { setSelectedMedia(index); setSelectedFact(""); }}>
                      <img src={thumbSrc(item.url, 160)} alt="" className="h-16 w-full rounded-md object-cover" />
                      <span className="mt-1 block text-[11px] font-semibold">Image {index + 1}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : <p className="mt-3 text-[12px] text-[#6B7280]">No product image is stored.</p>}
          </div>
        ) : null}
        {pane === "ugc" ? (
          <div className="mt-3" data-ugc-evidence>
            <ReferenceWorkspace productId={productId} skuId={skuId} openAdd={openAdd} matches={matches} productions={productions} selectedId={referenceId} onSelect={(id, start) => { setReferenceId(id); setStartSec(start || 0); setSelectedFact(""); }} />
          </div>
        ) : null}
        {pane === "campaigns" ? (
          <div data-campaign-evidence>
            {campaigns.length ? campaigns.map((row) => (
              <article key={row.id} className="border-b border-[#F3F4F8] py-3 text-sm">
                <p className="font-semibold">{row.name}</p>
                <p className="mt-1 text-[12px] text-[#6B7280]">{row.angle || "No angle saved"}</p>
              </article>
            )) : <p className="text-sm text-[#6B7280]">No campaign is assigned to this SKU.</p>}
          </div>
        ) : null}
        {pane === "facts" ? (
        <div data-fact-review>
        {showAge ? <p className="mb-4 text-[12px] text-[#6B7280]" data-age-suitability>Age suitability is the recommended user age from a source. It is separate from creator or audience age.{hasAgeFact ? "" : " No sourced age limit is stored."}</p> : null}
        <ul>
          {facts.map((fact) => {
            const view = presentFact(fact);
            const open = selectedFact === fact.id;
            return (
              <li key={fact.id} id={`fact-${fact.id}`} data-fact-id={fact.id} data-fact-status={view.status} className="border-b border-[#F3F4F8] py-3 text-sm">
                <button type="button" className="flex w-full flex-wrap items-baseline gap-x-4 gap-y-1 text-left" onClick={() => setSelectedFact(open ? "" : fact.id || "")}>
                  <span className="line-clamp-2 min-w-0 basis-full md:flex-1">{fact.statement}</span>
                  <span className="text-[12px] text-[#6B7280]">{view.sourceLabel}</span>
                  <span className="text-[12px]">{view.status}</span>
                  <span className="text-sm font-semibold text-[#652DFF]">Review</span>
                </button>
                {open ? (
                  <div className="mt-2 grid gap-2">
                    {view.testimonial ? <p data-source-testimonial>Source testimonial. The transcript can stay on file. It is not this SKU's result and it is not the new creator's experience.</p> : null}
                    {view.outcome ? <p>Numeric outcome. It stays unconfirmed until a measurement source is recorded.</p> : null}
                    {view.excerpt ? <p className="text-[#6B7280]">Excerpt · {view.excerpt}</p> : null}
                    {fact.provenance?.startSec != null ? <p className="text-[#6B7280]">Timecode · {fact.provenance.startSec}s{fact.provenance.endSec != null ? `–${fact.provenance.endSec}s` : ""}</p> : null}
                    <button type="button" className="w-fit font-semibold text-[#652DFF]" onClick={() => viewEvidence(fact)}>View evidence</button>
                    {editing === fact.id ? (
                      <form className="grid gap-2" onSubmit={(event) => { event.preventDefault(); void post({ op: "edit-fact", factId: fact.id, statement: draft }).then(() => setEditing("")); }}>
                        <input className={inputClass + " mt-0"} value={draft} aria-label="Edit fact" onChange={(event) => setDraft(event.target.value)} />
                        <button type="submit" className="w-fit font-semibold text-[#652DFF]">Save edit</button>
                      </form>
                    ) : (
                      <div className="flex flex-wrap gap-3">
                        {view.testimonial ? <span className="text-[#6B7280]">Confirm for this SKU is unavailable</span> : (
                          <form className="flex flex-wrap items-center gap-2" data-confirm-fact={fact.id} onSubmit={(event) => { event.preventDefault(); void post({ op: "confirm-fact", factId: fact.id, basis }); }}>
                            <input className={inputClass + " mt-0 max-w-xs"} value={basis} aria-label="Review basis" placeholder="What was compared" onChange={(event) => setBasis(event.target.value)} />
                            <button type="submit" className="font-semibold text-[#652DFF]" disabled={busy === "save"}>Confirm for this SKU</button>
                          </form>
                        )}
                        <button type="button" className="font-semibold text-[#652DFF]" onClick={() => { setEditing(fact.id || ""); setDraft(fact.statement); }}>Edit</button>
                        <button type="button" className="font-semibold text-[#B91C1C]" onClick={() => void post({ op: "reject-fact", factId: fact.id, basis: basis || "Not this SKU's property." })}>Reject</button>
                      </div>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        {error ? <p className="mt-3 text-sm text-[#B91C1C]" data-fact-error>{error}</p> : null}
        <button type="button" className="mt-4 text-sm font-semibold text-[#652DFF]" onClick={() => setAdding((value) => !value)}>Add fact</button>
        {adding ? (
          <form className="mt-2 grid gap-2" data-add-fact onSubmit={(event) => {
            event.preventDefault();
            void post({ op: "add-fact", skuId, kind: legacyKindForCategory(addCategory), category: addCategory, sourceType: "manual", statement: addText }).then(() => setAddText(""));
          }}>
            <select className={inputClass + " mt-0"} aria-label="Fact category" value={addCategory} onChange={(event) => setAddCategory(event.target.value as FactCategory)}>
              <option value="contents">Contents / specs</option>
              <option value="features">Features</option>
              <option value="usage">Usage</option>
              <option value="care">Care</option>
              {showAge ? <option value="age">Age suitability</option> : null}
            </select>
            <input className={inputClass + " mt-0"} value={addText} aria-label="Fact" placeholder="Optional note from a source you checked" onChange={(event) => setAddText(event.target.value)} />
            <Btn type="submit" variant="ghost" disabled={busy === "save" || addText.trim().length < 8}>Save extracted fact</Btn>
          </form>
        ) : null}
        </div>
        ) : null}
      </div>
    </div>
  );
}
