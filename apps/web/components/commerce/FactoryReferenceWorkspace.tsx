"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Btn } from "@/components/ui";
import { CREATOR_HAIR, CREATOR_SKIN, CREATOR_WARDROBE, creatorLookSentence, deliveryLabel, estimateSpeechSec, FACTORY_RENDER_MODELS, legacyDelivery, type CreatorLook, type SceneDelivery } from "@/lib/factory-native-audio";
import { captionNeedsReview, FACTORY_VOICE_IDS, referenceFrameUrl } from "@/lib/factory-scene-review";
import { listingMatchStatus, variantSelectionId } from "@/lib/shopee-affiliate-link";
import { RATE_CARDS } from "@/lib/cloud-rates";
import { cn } from "@/lib/cn";

type Beat = {
  id: string;
  purpose: string;
  spoken: string | null;
  onScreen: string | null;
  action: string;
  sourceStartSec?: number | null;
  sourceEndSec?: number | null;
  targetStartSec?: number | null;
  targetEndSec?: number | null;
  estimatedSec?: number | null;
  timing?: string | null;
  shotId?: string | null;
  beatRole?: string | null;
  voiceUrl?: string | null;
  framing?: string | null;
  performance?: string | null;
  speechDelivery?: SceneDelivery | null;
  continuity?: string | null;
  renderNote?: string | null;
  uncertainty?: string | null;
};
type Shot = { id: string; startSec: number; endSec: number; action: string | null; onScreen: string | null; framing: string | null; uncertainty: string | null };
type Line = { startSec: number; endSec: number; text: string };
type Draft = { spoken: string; action: string; onScreen: string; delivery: SceneDelivery; performance: string; heldSpeech: string };
type Proposal = { mocked?: boolean; modelId: string; mode: "recreate" | "revamp"; scenes: { beatId: string; spoken: string | null; onScreen: string | null; action: string }[] };
type DialogName = "creator" | "voice" | "image" | "listing" | "language" | "duration" | "market" | "audio" | null;
type Anchor = { mediaId: string; url: string; label: string };
type SetupPatch = {
  locale?: string;
  durationSec?: number;
  creatorMode?: "HANDS" | "GENERATED_ADULT" | "SUPPLIED_ADULT";
  creatorAnchor?: Anchor | null;
  creatorLook?: CreatorLook | null;
  deliveryMode?: "creator-led" | "voiceover";
  voiceId?: string;
  productImage?: { id: string; url: string } | null;
  audioStrategy?: "NATIVE_AUDIO" | "EXTERNAL_TTS";
  voiceDirection?: string | null;
};

function tenth(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 10) / 10;
}

function range(start?: number | null, end?: number | null) {
  const a = tenth(start);
  const b = tenth(end);
  if (a == null || b == null) return "Untimed";
  return `${a.toFixed(1)}–${b.toFixed(1)}s`;
}

function targetOf(beat: Beat) {
  return { start: beat.targetStartSec ?? beat.sourceStartSec ?? 0, end: beat.targetEndSec ?? beat.sourceEndSec ?? 0 };
}

function stripClock(action: string, start: number, end: number) {
  return action.replace(/from\s+[\d.–-]+\s+seconds?,?/i, `During ${range(start, end)},`).replace(/\s+/g, " ").trim();
}

function titleOf(beat: Beat, index: number) {
  return beat.beatRole || beat.purpose || `Scene ${index + 1}`;
}

function shownPerformance(value?: string | null) {
  const text = (value || "").trim();
  if (/no face is selected|not the source creator|generated adult is reserved/i.test(text)) return "";
  return text;
}

export function FactoryReferenceWorkspace({
  productionId,
  title,
  market,
  locale,
  locales,
  durationSec,
  creatorMode,
  creatorAnchor,
  creatorLook,
  creatorChoices,
  voiceId,
  deliveryMode,
  audioStrategy,
  voiceDirection,
  productImage,
  productImages,
  mediaUrl,
  analysisVersion,
  blueprintVersion,
  referenceId,
  beats,
  shots,
  transcript,
  revision,
  busy,
  approvalBlockers,
  approved,
  stageReady,
  listingNote,
  catalogProductId,
  operatorNote,
  onBack,
  onSave,
  onSetup,
  onApprove,
  onGenerate,
}: {
  productionId: string;
  title: string;
  market: string;
  locale: string;
  locales: string[];
  durationSec: number;
  creatorMode: string;
  creatorAnchor: Anchor | null;
  creatorLook: CreatorLook | null;
  creatorChoices: Anchor[];
  voiceId: string;
  deliveryMode: "creator-led" | "voiceover";
  audioStrategy: "NATIVE_AUDIO" | "EXTERNAL_TTS";
  voiceDirection: string;
  productImage: string | null;
  productImages: { id: string; url: string; label: string }[];
  mediaUrl: string | null;
  analysisVersion: number | null;
  blueprintVersion: number | null;
  referenceId: string | null;
  beats: Beat[];
  shots: Shot[];
  transcript: Line[];
  revision: number;
  busy: boolean;
  approvalBlockers: string[];
  approved: boolean;
  stageReady: boolean;
  listingNote: string;
  catalogProductId?: string | null;
  operatorNote: string;
  onBack: () => void;
  onSave: (edits: { beatId: string; spoken: string | null; action: string; onScreen: string | null; targetStartSec: number; targetEndSec: number; speechDelivery: SceneDelivery; performance: string }[], note: string) => Promise<boolean>;
  onSetup: (patch: SetupPatch) => Promise<boolean>;
  onApprove: () => void;
  onGenerate: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const playBound = useRef<number | null>(null);
  const chromeRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [stickTop, setStickTop] = useState(0);
  const [stage, setStage] = useState<"script" | "storyboard" | "generate">("script");
  const [mode, setMode] = useState<"recreate" | "revamp">("recreate");
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [merge, setMerge] = useState(false);
  const [proposalError, setProposalError] = useState("");
  const [proposalBusy, setProposalBusy] = useState(false);
  const [active, setActive] = useState(beats[0]?.id || "");
  const [notice, setNotice] = useState("");
  const [direction, setDirection] = useState(operatorNote);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [take, setTake] = useState<{ beatId: string; spoken: string; url: string; seconds: number; temporary: boolean } | null>(null);
  const [failedFrames, setFailedFrames] = useState<Record<string, boolean>>({});
  const [frameBust, setFrameBust] = useState(0);
  const [modelId, setModelId] = useState("wan-3-0");
  const [listingReady, setListingReady] = useState(false);
  const dirty = Object.keys(drafts).length > 0 || direction.trim() !== operatorNote.trim();

  useEffect(() => {
    if (!catalogProductId) return;
    let cancel = false;
    void fetch("/api/commerce/catalog").then((res) => res.json()).then((json) => {
      if (cancel) return;
      const sku = (json.skus || []).find((row: { legacyProductId?: string | null }) => row.legacyProductId === catalogProductId);
      const listings = (json.listings || []).filter((row: { skuId: string; market: string | null }) => row.skuId === sku?.id && row.market === market);
      setListingReady(listings.length > 0 && listings.every((row: { variantReview: string; sourceUrl: string; reviewedVariantKey?: string | null }) => listingMatchStatus(row) === "confirmed"));
    }).catch(() => { if (!cancel) setListingReady(false); });
    return () => { cancel = true; };
  }, [catalogProductId, market]);

  useEffect(() => {
    const scene = new URLSearchParams(window.location.search).get("scene");
    if (scene && beats.some((beat) => beat.id === scene)) setActive(scene);
  }, [beats]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (!active || url.searchParams.get("scene") === active) return;
    url.searchParams.set("scene", active);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, [active]);

  useEffect(() => {
    function onLeave(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  useEffect(() => {
    const node = chromeRef.current;
    if (!node) return;
    const measure = () => setStickTop(node.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [stage]);

  useEffect(() => {
    if (!dialog) return;
    dialogRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setDialog(null);
      openerRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog]);

  const scenes = useMemo(() => beats.map((beat, index) => {
    const target = targetOf(beat);
    const shot = shots.find((item) => item.id === beat.shotId) || null;
    const speech = (shot ? transcript.filter((line) => line.startSec < shot.endSec && line.endSec > shot.startSec) : []).map((line) => line.text).join(" ");
    const draft = drafts[beat.id];
    const delivery = draft?.delivery ?? legacyDelivery(beat);
    const spoken = delivery === "SILENT" ? "" : (draft?.spoken ?? beat.spoken ?? "");
    const onScreen = draft?.onScreen ?? beat.onScreen ?? "";
    const action = draft?.action ?? stripClock(beat.action, target.start, target.end);
    const performance = draft?.performance ?? shownPerformance(beat.performance);
    const estimate = estimateSpeechSec(spoken, delivery);
    return { beat, index, target, shot, speech, spoken, action, onScreen, delivery, performance, estimate, review: captionNeedsReview(spoken, onScreen, speech) };
  }), [beats, shots, transcript, drafts]);

  const activeScene = scenes.find((scene) => scene.beat.id === active) || scenes[0];

  function leave() {
    if (dirty && !window.confirm("Leave without saving scene edits?")) return;
    onBack();
  }

  function seek(beat: Beat) {
    setActive(beat.id);
    const shot = shots.find((item) => item.id === beat.shotId);
    playBound.current = null;
    if (shot && videoRef.current) videoRef.current.currentTime = shot.startSec;
  }

  function edit(id: string, patch: Partial<Draft>) {
    const scene = scenes.find((item) => item.beat.id === id);
    if (!scene) return;
    setDrafts((current) => ({ ...current, [id]: { spoken: scene.spoken, action: scene.action, onScreen: scene.onScreen, delivery: scene.delivery, performance: scene.performance, heldSpeech: current[id]?.heldSpeech || scene.beat.spoken || "", ...current[id], ...patch } }));
    if (patch.spoken != null && take?.beatId === id && take.spoken !== patch.spoken) setTake(null);
  }

  function openDialog(name: DialogName, opener: HTMLElement | null) {
    openerRef.current = opener;
    setDialog(name);
  }

  function closeDialog() {
    setDialog(null);
    openerRef.current?.focus();
  }

  function conflicts() {
    if (!proposal) return [];
    return proposal.scenes.flatMap((row) => {
      const pending = drafts[row.beatId];
      if (!pending) return [];
      return (["spoken", "onScreen", "action"] as const).filter((field) => pending[field] !== (row[field] || "")).map((field) => ({ beatId: row.beatId, field }));
    });
  }

  function applyProposal(keepConflicts: boolean) {
    if (!proposal) return;
    const pendingConflicts = new Set(conflicts().map((row) => `${row.beatId}:${row.field}`));
    if (!keepConflicts && pendingConflicts.size && !merge) {
      setMerge(true);
      return;
    }
    for (const row of proposal.scenes) {
      const scene = scenes.find((item) => item.beat.id === row.beatId);
      if (!scene) continue;
      const patch: Partial<Draft> = {};
      for (const field of ["spoken", "onScreen", "action"] as const) {
        const next = row[field] || "";
        if (keepConflicts && pendingConflicts.has(`${row.beatId}:${field}`)) continue;
        if (next !== scene[field]) patch[field] = next;
      }
      if (Object.keys(patch).length) edit(row.beatId, patch);
    }
    setProposal(null);
    setMerge(false);
    setNotice("Applied to the draft. Save changes stores it.");
  }

  async function propose(beatId?: string) {
    setProposalBusy(true);
    setProposalError("");
    setMerge(false);
    try {
      const res = await fetch("/api/ugc-factory/v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          op: "propose-rewrite",
          productionId,
          expectedRevision: revision,
          mode,
          beatId: beatId || "",
          delivery: deliveryMode,
          direction,
          productName: title,
          scenes: scenes.map((scene) => ({ beatId: scene.beat.id, spoken: scene.spoken || null, onScreen: scene.onScreen || null, action: scene.action, sourceSpeech: scene.speech, targetLabel: range(scene.target.start, scene.target.end) })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "The script service did not return a proposal.");
      setProposal(json.proposal);
    } catch (err) {
      setProposal(null);
      setProposalError(err instanceof Error ? err.message : "The script service did not return a proposal.");
    } finally {
      setProposalBusy(false);
    }
  }

  async function previewVoice(scene: (typeof scenes)[number]) {
    if (!scene.spoken.trim()) {
      setNotice("This scene stays silent.");
      setTake(null);
      return;
    }
    setVoiceBusy(true);
    setNotice("");
    try {
      const res = await fetch("/api/ugc-factory/v2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "preview-voice", productionId, expectedRevision: revision, beatId: scene.beat.id, spoken: scene.spoken, voice: voiceId, delivery: deliveryMode }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "The voice service did not return audio.");
      if (json.silent) {
        setNotice("This scene stays silent.");
        return;
      }
      setTake({ beatId: scene.beat.id, spoken: scene.spoken, url: json.url, seconds: json.seconds, temporary: Boolean(json.temporary) });
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = json.url;
      try {
        await audioRef.current.play();
        setNotice(json.temporary ? "Playing a temporary take for this unsaved line." : "Playing the saved voice for this exact line.");
      } catch {
        setNotice(json.temporary ? "Temporary take is ready. Press play." : "Saved voice is ready. Press play.");
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "The voice service did not return audio.");
    } finally {
      setVoiceBusy(false);
    }
  }

  async function playPlan() {
    for (const scene of scenes) {
      if (!scene.spoken.trim()) continue;
      const stale = scene.beat.timing === "stale" || scene.spoken !== (scene.beat.spoken || "");
      if (stale || !scene.beat.voiceUrl || scene.beat.estimatedSec == null) {
        setActive(scene.beat.id);
        setStage("script");
        setNotice(`Scene ${scene.index + 1} needs a new voice preview before the plan can play through.`);
        return;
      }
      if (!audioRef.current) audioRef.current = new Audio();
      audioRef.current.src = scene.beat.voiceUrl;
      await new Promise<void>((resolve) => {
        const audio = audioRef.current;
        if (!audio) return resolve();
        const done = () => resolve();
        audio.addEventListener("ended", done, { once: true });
        audio.addEventListener("error", done, { once: true });
        void audio.play().catch(done);
      });
    }
  }

  async function retryFrame(scene: (typeof scenes)[number]) {
    if (!scene.shot || !mediaUrl || analysisVersion == null) return;
    const res = await fetch("/api/ugc-factory/v2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "extract-reference-frame", mediaUrl, analysisVersion, startSec: scene.shot.startSec, endSec: scene.shot.endSec }),
    });
    const json = await res.json();
    if (!res.ok) {
      setFailedFrames((current) => ({ ...current, [scene.beat.id]: true }));
      setNotice(json.error || "Frame unavailable for this source window.");
      return;
    }
    setFailedFrames((current) => ({ ...current, [scene.beat.id]: false }));
    setFrameBust((value) => value + 1);
  }

  async function saveAll() {
    const edits = scenes.filter((scene) => drafts[scene.beat.id]).map((scene) => ({
      beatId: scene.beat.id,
      spoken: scene.delivery === "SILENT" ? null : scene.spoken.trim() || null,
      action: scene.action,
      onScreen: scene.onScreen.trim() || null,
      targetStartSec: tenth(scene.target.start) || 0,
      targetEndSec: tenth(scene.target.end) || 0,
      speechDelivery: scene.delivery,
      performance: scene.performance,
    }));
    const ok = await onSave(edits, direction);
    if (ok) {
      setDrafts({});
      setProposal(null);
      setNotice("Saved. No video was started.");
    }
  }

  const creatorReady = creatorMode === "HANDS" || Boolean(creatorAnchor);
  const creatorText = creatorMode === "HANDS"
    ? "Hands only"
    : creatorAnchor
      ? creatorAnchor.label
      : creatorLook
        ? `${creatorLook.presentation === "woman" ? "Woman" : "Man"}, ${creatorLook.age}, no face plate`
        : creatorMode === "SUPPLIED_ADULT" ? "Supplied adult, no face" : "Generated adult, no face";
  const native = audioStrategy !== "EXTERNAL_TTS";
  const voiceReady = !native && Boolean(voiceId);
  const imageReady = Boolean(productImage);
  const reviewScenes = scenes.filter((scene) => scene.review);
  const tightScenes = native ? scenes.filter((scene) => scene.delivery !== "SILENT" && scene.estimate > Math.max(0, scene.target.end - scene.target.start) + 0.4) : [];
  const staleScenes = native ? [] : scenes.filter((scene) => scene.spoken.trim() && (scene.beat.timing === "stale" || (drafts[scene.beat.id] && drafts[scene.beat.id].spoken !== (scene.beat.spoken || ""))));
  const offerCreatorSpeech = native && scenes.some((scene) => scene.delivery === "VOICEOVER" && (scene.beat.spoken || "").trim() && scene.speech.trim());
  const chosenModel = FACTORY_RENDER_MODELS.find((row) => row.id === modelId) || FACTORY_RENDER_MODELS[0];
  const renderIssue = native && chosenModel.nativeAudio !== "verified" ? chosenModel.issue : "";
  const prime = RATE_CARDS.find((row) => row.model === "wan-3-0");
  const estimate = prime ? prime.usd * durationSec : null;

  function frameFor(scene: (typeof scenes)[number]) {
    if (!scene.shot || failedFrames[scene.beat.id]) return "";
    return referenceFrameUrl(mediaUrl, analysisVersion, scene.shot.startSec, scene.shot.endSec);
  }

  const readiness = [
    { id: "creator", done: creatorReady, label: creatorText, action: creatorReady ? "Change creator" : "Choose creator", open: "creator" as const },
    ...(native ? [] : [{ id: "voice", done: voiceReady, label: voiceReady ? voiceId : "Voice is not set", action: voiceReady ? "Change voice" : "Choose voice", open: "voice" as const }]),
    { id: "image", done: imageReady, label: imageReady ? "Product image selected" : "Product image is not selected", action: imageReady ? "Change image" : "Choose image", open: "image" as const },
    { id: "listing", done: listingReady, label: listingReady ? `${market} listing confirmed` : `${market} product listing needs confirmation`, action: listingReady ? "Review listing" : "Review listing", open: "listing" as const },
    ...reviewScenes.map((scene) => ({ id: `review-${scene.beat.id}`, done: false, label: `Caption does not follow scene ${scene.index + 1}`, action: `Review scene ${scene.index + 1}`, open: null, sceneId: scene.beat.id })),
    ...tightScenes.map((scene) => ({ id: `fit-${scene.beat.id}`, done: false, label: `Scene ${scene.index + 1} estimate is longer than its window`, action: `Review scene ${scene.index + 1}`, open: null, sceneId: scene.beat.id })),
    ...staleScenes.map((scene) => ({ id: `audio-${scene.beat.id}`, done: false, label: `External voice for scene ${scene.index + 1} needs a new take`, action: "Preview voice", open: null, sceneId: scene.beat.id })),
  ];

  return (
    <div className="@container/factory min-w-0 pb-36" data-reference-workspace>
      <div ref={chromeRef} className="sticky top-0 z-20 -mx-4 bg-[#F3F4F8] px-4 pb-3 md:-mx-6 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <Btn type="button" variant="ghost" onClick={leave}>Back to productions</Btn>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Production stages">
            {([["script", "Script & Scenes"], ["storyboard", "Storyboard Preview"], ["generate", "Generate"]] as const).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={stage === id} className={cn("min-h-10 rounded-full px-3 text-sm font-semibold", stage === id ? "bg-[#111827] text-white" : "text-[#374151]")} onClick={() => setStage(id)}>{label}</button>
            ))}
          </div>
        </div>
        <h1 className="mt-3 text-[22px] font-black tracking-tight">{title}</h1>
        <p className="text-xs text-[#6B7280]">{market} · {locale} · revision {revision}</p>
        <div className="mt-3 flex flex-wrap gap-2" data-video-setup>
          <button type="button" className="min-h-10 rounded-full bg-white px-3 text-sm" onClick={(event) => openDialog("market", event.currentTarget)}>Market · {market}</button>
          <button type="button" className="min-h-10 rounded-full bg-white px-3 text-sm" onClick={(event) => openDialog("language", event.currentTarget)}>Language · {locale}</button>
          <button type="button" className="min-h-10 rounded-full bg-white px-3 text-sm" onClick={(event) => openDialog("duration", event.currentTarget)}>Duration · {durationSec}s</button>
          <button type="button" className="min-h-10 rounded-full bg-white px-3 text-sm" onClick={(event) => openDialog("creator", event.currentTarget)}>Creator · {creatorText}</button>
          <button type="button" className="min-h-10 rounded-full bg-white px-3 text-sm" onClick={(event) => openDialog(native ? "audio" : "voice", event.currentTarget)}>{native ? "Native audio" : `External voice · ${voiceId || "Choose voice"}`}</button>
          <button type="button" className="inline-flex min-h-10 items-center gap-2 rounded-full bg-white px-3 text-sm" onClick={(event) => openDialog("image", event.currentTarget)}>
            {productImage ? <img src={productImage} alt="" className="h-6 w-6 rounded object-cover" /> : null}
            Product image
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2" data-readiness>
        {readiness.filter((row) => !row.done).map((row) => (
          <button key={row.id} type="button" className="min-h-10 rounded-full bg-white px-3 text-sm font-semibold" data-review-scene={"sceneId" in row ? row.sceneId : undefined} onClick={(event) => {
              if ("sceneId" in row && row.sceneId) {
                const scene = scenes.find((item) => item.beat.id === row.sceneId);
                if (scene) {
                  setStage("script");
                  seek(scene.beat);
                  if (row.action === "Preview voice") void previewVoice(scene);
                }
                return;
              }
              openDialog(row.open, event.currentTarget);
            }}>{row.action}</button>
        ))}
      </div>

      {stage === "script" ? (
        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2" data-script-mode>
              <button type="button" aria-pressed={mode === "recreate"} className={cn("min-h-10 rounded-full px-3 text-sm font-semibold", mode === "recreate" ? "bg-[#111827] text-white" : "bg-white")} onClick={() => setMode("recreate")}>Recreate reference</button>
              <button type="button" aria-pressed={mode === "revamp"} className={cn("min-h-10 rounded-full px-3 text-sm font-semibold", mode === "revamp" ? "bg-[#111827] text-white" : "bg-white")} onClick={() => setMode("revamp")}>Revamp script</button>
            </div>
            <Btn type="button" data-plan-rewrite disabled={proposalBusy || busy} onClick={() => void propose()}>{proposalBusy ? "Writing…" : mode === "recreate" ? "Recreate script" : "Revamp script"}</Btn>
          </div>
          <p className="mt-2 text-sm text-[#4B5563]" data-rewrite-contract>This asks for a proposal. Apply updates the draft on this page. Save changes stores it. Cancel keeps the current draft. Opening the page does not rewrite it.</p>
          {offerCreatorSpeech ? (
            <div className="mt-3 rounded-xl bg-white p-3 text-sm" data-delivery-offer>
              <p>This draft was saved as off-screen voiceover. The reference shows someone speaking on camera. Apply delivery update marks speaking scenes as Creator speaks. Save changes stores that choice.</p>
              <Btn className="mt-2" type="button" onClick={() => {
                for (const scene of scenes) {
                  if ((scene.beat.spoken || "").trim()) edit(scene.beat.id, { delivery: "CREATOR_SPEAKS" });
                  else edit(scene.beat.id, { delivery: "SILENT", spoken: "" });
                }
              }}>Apply delivery update</Btn>
            </div>
          ) : null}
          <label className="mt-3 block text-sm">Additional direction, optional
            <textarea className="mt-1 w-full rounded-lg border border-[#E6E8EE] p-2 text-sm" value={direction} onChange={(event) => setDirection(event.target.value)} />
          </label>
          {proposalError ? <p className="mt-3 text-sm text-[#9A3412]">{proposalError}</p> : null}
          {proposal ? (
            <div className="mt-3 rounded-xl border border-[#E6E8EE] bg-white p-3" data-rewrite-diff>
              <p className="text-sm font-semibold">Proposal · {proposal.mode === "recreate" ? "Recreate reference" : "Revamp script"}</p>
              {proposal.mocked ? <p className="mt-1 text-sm text-[#9A3412]" data-proposal-mock>Verification proposal. The script model was not called.</p> : <p className="mt-1 text-xs text-[#6B7280]">From {proposal.modelId}. Nothing is saved until you apply it and then save.</p>}
              <div className="mt-3 grid gap-3">
                {proposal.scenes.map((row) => {
                  const scene = scenes.find((item) => item.beat.id === row.beatId);
                  if (!scene) return null;
                  return (
                    <div key={row.beatId} className="border-t border-[#F3F4F8] pt-2 text-sm">
                      <p className="font-semibold">Scene {scene.index + 1}</p>
                      <p className="mt-1">Speech · {scene.spoken || "Silent"} → {row.spoken || "Silent"}</p>
                      <p>Caption · {scene.onScreen || "None"} → {row.onScreen || "None"}</p>
                      <p>Action · {scene.action} → {row.action}</p>
                    </div>
                  );
                })}
              </div>
              {merge ? (
                <div className="mt-3 rounded-lg bg-[#F7F8FB] p-3" data-rewrite-merge>
                  <p className="text-sm">Some of these scenes have unsaved edits. Replace those fields with the proposal, or keep your edits and apply only the other fields.</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Btn type="button" data-merge-replace onClick={() => applyProposal(false)}>Replace with proposal</Btn>
                    <Btn type="button" variant="ghost" data-merge-keep onClick={() => applyProposal(true)}>Keep my edits</Btn>
                  </div>
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {merge ? null : <Btn type="button" data-apply-rewrite onClick={() => applyProposal(false)}>Apply</Btn>}
                <Btn type="button" variant="ghost" data-cancel-rewrite onClick={() => { setProposal(null); setMerge(false); }}>Cancel</Btn>
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex flex-col gap-4 @min-[960px]/factory:grid @min-[960px]/factory:grid-cols-[190px_250px_minmax(0,1fr)] @min-[960px]/factory:items-start">
            <nav className="flex flex-wrap gap-2 @min-[960px]/factory:sticky @min-[960px]/factory:max-h-[calc(100vh-8rem)] @min-[960px]/factory:flex-col @min-[960px]/factory:flex-nowrap @min-[960px]/factory:overflow-y-auto" style={{ top: stickTop }} aria-label="Scenes" data-scene-nav onKeyDown={(event) => {
              if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
              event.preventDefault();
              const index = scenes.findIndex((scene) => scene.beat.id === active);
              const next = scenes[index + (event.key === "ArrowDown" ? 1 : -1)];
              if (next) seek(next.beat);
            }}>
              {scenes.map((scene) => {
                const frame = frameFor(scene);
                const selected = active === scene.beat.id;
                const audioStale = Boolean(scene.spoken.trim()) && (scene.beat.timing === "stale" || (drafts[scene.beat.id] && drafts[scene.beat.id].spoken !== (scene.beat.spoken || "")));
                return (
                  <button key={scene.beat.id} type="button" data-scene-nav-item={scene.beat.id} aria-current={selected ? "true" : undefined} className={cn("flex w-[calc(50%-4px)] gap-2 rounded-lg p-2 text-left @min-[960px]/factory:w-full", selected ? "bg-[#111827] text-white ring-2 ring-[#111827]" : "bg-white")} onClick={() => seek(scene.beat)}>
                    {frame ? <img src={`${frame}?v=${frameBust}`} alt="" className="h-20 w-12 rounded bg-black object-contain" data-frame={scene.beat.shotId || scene.beat.id} onError={() => setFailedFrames((current) => ({ ...current, [scene.beat.id]: true }))} /> : <span className="grid h-20 w-12 place-items-center rounded bg-[#E6E8EE] text-xs">No frame</span>}
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">{scene.index + 1}. {titleOf(scene.beat, scene.index)}</span>
                      <span className="block text-xs opacity-80">{range(scene.target.start, scene.target.end)}</span>
                      <span className="block truncate text-xs opacity-80">{scene.spoken.trim() || "Silent"}</span>
                      {selected ? <span className="text-xs">Selected</span> : null}
                      {drafts[scene.beat.id] ? <span className="block text-xs">Unsaved</span> : null}
                      {!native && audioStale ? <span className="block text-xs">Audio needs refresh</span> : null}
                      <span className="block text-xs">{deliveryLabel(scene.delivery)}</span>
                      {scene.review ? <span className="block text-xs">Review</span> : null}
                    </span>
                  </button>
                );
              })}
            </nav>
            <div className="@min-[960px]/factory:sticky" style={{ top: stickTop }}>
              <p className="text-xs font-semibold text-[#6B7280]">Source video</p>
              {mediaUrl ? <video ref={videoRef} className="mt-1 aspect-[9/16] max-h-[42vh] w-full max-w-[250px] bg-black object-contain @min-[960px]/factory:max-h-[70vh]" controls playsInline preload="metadata" poster={activeScene && frameFor(activeScene) ? frameFor(activeScene) : undefined} src={mediaUrl} onTimeUpdate={() => { if (playBound.current != null && videoRef.current && videoRef.current.currentTime >= playBound.current) { videoRef.current.pause(); playBound.current = null; } }} onLoadedMetadata={() => { if (activeScene?.shot && videoRef.current && videoRef.current.currentTime < 0.05) videoRef.current.currentTime = activeScene.shot.startSec; }} /> : <p className="text-sm text-[#6B7280]">The cached reference video is not available.</p>}
              <p className="mt-1 text-xs text-[#6B7280]">Reference frame. This is the source creator, not the selected actor.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" className="min-h-10 rounded-lg border border-[#E6E8EE] bg-white px-3 text-sm font-semibold" onClick={() => { if (!activeScene?.shot || !videoRef.current) return; videoRef.current.currentTime = activeScene.shot.startSec; playBound.current = activeScene.shot.endSec; void videoRef.current.play(); }}>Play this scene</button>
                <button type="button" className="min-h-10 rounded-lg border border-[#E6E8EE] bg-white px-3 text-sm font-semibold" onClick={() => { if (!videoRef.current) return; playBound.current = null; videoRef.current.currentTime = 0; void videoRef.current.play(); }}>Play full source</button>
              </div>
            </div>
            {activeScene ? (
              <article className="min-w-0 rounded-xl bg-white p-3" data-scene={activeScene.beat.id}>
                <h2 className="text-base font-semibold">Scene {activeScene.index + 1} · {titleOf(activeScene.beat, activeScene.index)}</h2>
                <p className="mt-1 text-sm" data-target-window>Target window · {range(activeScene.target.start, activeScene.target.end)}</p>
                <p className="text-sm" data-source-window>Source window · {activeScene.shot ? range(activeScene.shot.startSec, activeScene.shot.endSec) : "Not on this blueprint"}</p>
                {frameFor(activeScene) ? <img src={`${frameFor(activeScene)}?v=${frameBust}`} alt="" className="mt-2 h-24 w-16 rounded object-cover" onError={() => setFailedFrames((current) => ({ ...current, [activeScene.beat.id]: true }))} /> : (
                  <div className="mt-2">
                    <p className="text-sm text-[#6B7280]">Frame unavailable for this source window.</p>
                    <button type="button" className="mt-1 min-h-10 text-sm font-semibold text-[#652DFF]" onClick={() => void retryFrame(activeScene)}>Retry</button>
                  </div>
                )}
                <label className="mt-3 block text-sm">Delivery
                  <select className="mt-1 min-h-10 w-full rounded-lg border border-[#E6E8EE] p-2 text-sm" value={activeScene.delivery} data-delivery={activeScene.beat.id} onChange={(event) => {
                    const next = event.target.value as SceneDelivery;
                    if (next === "SILENT") edit(activeScene.beat.id, { delivery: "SILENT", heldSpeech: activeScene.spoken || drafts[activeScene.beat.id]?.heldSpeech || activeScene.beat.spoken || "", spoken: "" });
                    else edit(activeScene.beat.id, { delivery: next, spoken: activeScene.spoken || drafts[activeScene.beat.id]?.heldSpeech || activeScene.beat.spoken || "" });
                  }}>
                    <option value="CREATOR_SPEAKS">Creator speaks</option>
                    <option value="VOICEOVER">Voiceover</option>
                    <option value="SILENT">Silent</option>
                  </select>
                </label>
                {activeScene.delivery === "SILENT" ? <p className="mt-3 rounded-lg bg-[#F7F8FB] px-3 py-2 text-sm">Silent. This scene has no spoken words. That is not a missing voice.</p> : null}
                <label className="mt-3 block text-sm">Spoken script
                  <textarea className="mt-1 min-h-20 w-full rounded-lg border border-[#E6E8EE] p-2 text-sm disabled:bg-[#F3F4F8]" value={activeScene.spoken} disabled={activeScene.delivery === "SILENT"} onChange={(event) => edit(activeScene.beat.id, { spoken: event.target.value })} />
                </label>
                {activeScene.delivery !== "SILENT" ? <p className="mt-1 text-xs text-[#6B7280]">Estimate {activeScene.estimate.toFixed(1)}s in a {(Math.max(0, activeScene.target.end - activeScene.target.start)).toFixed(1)}s window. This is not a measured take.</p> : null}
                <label className="mt-3 block text-sm">Performance, optional
                  <input className="mt-1 min-h-10 w-full rounded-lg border border-[#E6E8EE] p-2 text-sm" value={activeScene.performance} placeholder="Casual pace, short pause, emphasis on the reveal" onChange={(event) => edit(activeScene.beat.id, { performance: event.target.value })} />
                </label>
                <label className="mt-3 block text-sm">Visual action
                  <textarea className="mt-1 min-h-20 w-full rounded-lg border border-[#E6E8EE] p-2 text-sm" value={activeScene.action} onChange={(event) => edit(activeScene.beat.id, { action: event.target.value })} />
                </label>
                <label className="mt-3 block text-sm">On-screen text
                  <input className="mt-1 min-h-10 w-full rounded-lg border border-[#E6E8EE] p-2 text-sm" value={activeScene.onScreen} onChange={(event) => edit(activeScene.beat.id, { onScreen: event.target.value })} />
                </label>
                {native ? null : <VoiceLine scene={activeScene} take={take} />}
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className="min-h-10 rounded-lg border border-[#E6E8EE] px-3 text-sm font-semibold" onClick={() => edit(activeScene.beat.id, { spoken: activeScene.speech, onScreen: activeScene.shot?.onScreen || "" })}>Keep source wording</button>
                  <button type="button" className="min-h-10 rounded-lg border border-[#E6E8EE] px-3 text-sm font-semibold" data-rewrite-scene={activeScene.beat.id} disabled={proposalBusy} onClick={() => void propose(activeScene.beat.id)}>Rewrite scene</button>
                  {native ? null : <button type="button" className="min-h-10 rounded-lg border border-[#E6E8EE] px-3 text-sm font-semibold" data-voice-preview={activeScene.beat.id} disabled={voiceBusy} onClick={() => void previewVoice(activeScene)}>Preview voice</button>}
                </div>
                {notice ? <p className="mt-2 text-sm text-[#374151]">{notice}</p> : null}
                <details className="mt-4 text-sm">
                  <summary className="cursor-pointer font-semibold">Source transcript</summary>
                  <p className="mt-2 text-[#4B5563]">{activeScene.speech || "No speech was stored in this source window."}</p>
                  <p className="mt-1 text-[#4B5563]">Source caption · {activeScene.shot?.onScreen || "None"}</p>
                </details>
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer font-semibold">Director details</summary>
                  <p className="mt-2">Framing · {activeScene.shot?.framing || "Framing was not analyzed."}</p>
                  <p>Performance · {activeScene.beat.performance || "Not recorded."}</p>
                  <p>Continuity · {activeScene.beat.continuity || "Not recorded."}</p>
                  <p>Generation note · {activeScene.beat.renderNote || activeScene.beat.performance || activeScene.beat.uncertainty || "Not recorded."}</p>
                </details>
              </article>
            ) : null}
          </div>
        </div>
      ) : null}

      {stage === "storyboard" ? (
        <div className="mt-4" data-storyboard>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {scenes.map((scene) => (
              <button key={scene.beat.id} type="button" className="rounded-xl bg-white p-3 text-left" onClick={() => { setStage("script"); seek(scene.beat); }}>
                {frameFor(scene) ? <img src={`${frameFor(scene)}?v=${frameBust}`} alt="" className="h-40 w-24 rounded bg-black object-contain" data-frame={scene.beat.shotId || scene.beat.id} /> : <p className="text-sm text-[#6B7280]">Frame unavailable</p>}
                <p className="mt-2 text-xs text-[#6B7280]">Reference frame · target {range(scene.target.start, scene.target.end)} · {deliveryLabel(scene.delivery)}</p>
                <p className="mt-1 text-sm">{scene.delivery === "SILENT" ? "Silent" : scene.spoken.trim() || "Silent"}</p>
                <p className="mt-1 text-xs text-[#6B7280]">{scene.onScreen || "No caption"}</p>
                <p className="mt-1 text-sm">{scene.action}</p>
              </button>
            ))}
          </div>
          <p className="mt-3 text-sm text-[#6B7280]">This is the audiovisual plan. Reference frames are not generated pictures, and this view is not proof that a model has spoken the lines.</p>
        </div>
      ) : null}

      {stage === "generate" ? (
        <div className="mt-4 max-w-xl rounded-xl bg-white p-4 text-sm" data-generate-stage>
          <p className="font-semibold">{title}</p>
          <p className="mt-2">Creator · {creatorText}</p>
          <p>{native ? `Native audio${voiceDirection ? ` · ${voiceDirection}` : ""}` : `External voice · ${voiceId || "Not set"}`}</p>
          <p>Duration · {durationSec}s</p>
          <label className="mt-3 block">Video model
            <select className="mt-1 min-h-10 w-full rounded-lg border border-[#E6E8EE] p-2 text-sm" value={modelId} onChange={(event) => setModelId(event.target.value)}>
              {FACTORY_RENDER_MODELS.map((row) => <option key={row.id} value={row.id}>{row.label} · {row.nativeAudio === "verified" ? "native audio" : "audio not verified"}</option>)}
            </select>
          </label>
          {renderIssue ? <p className="mt-2 text-[#9A3412]">{renderIssue}</p> : <p className="mt-2">Wan sends parameters.audio with the scene prompt. A TTS voice id is not sent.</p>}
          <p className="mt-2">{productImage ? "Product image selected." : "Product image is not selected."}</p>
          <p className="mt-2">{estimate == null ? "No list rate is stored for the default video model." : `List estimate for one ${durationSec}s Wan 3.0 Prime clip: $${estimate.toFixed(2)}. This is not a submitted job.`}</p>
          <p className="mt-2">Approval does not start a render. Generate is a separate action.</p>
          {approvalBlockers.length ? <ul className="mt-3 list-disc pl-4 text-[#9A3412]">{approvalBlockers.map((item) => <li key={item}>{item}</li>)}</ul> : null}
          {dirty ? <p className="mt-2">Save changes before approval.</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">
            {!creatorReady || reviewScenes.length || !imageReady ? <Btn type="button" onClick={(event) => {
              const first = readiness.find((row) => !row.done);
              if (first && "sceneId" in first && first.sceneId) {
                const scene = scenes.find((item) => item.beat.id === first.sceneId);
                if (scene) { setStage("script"); seek(scene.beat); }
                return;
              }
              if (first?.open) openDialog(first.open, event.currentTarget);
            }}>{readiness.find((row) => !row.done)?.action || "Review inputs"}</Btn> : null}
            <Btn type="button" disabled={busy || approved || approvalBlockers.length > 0 || dirty} onClick={onApprove}>Approve plan</Btn>
            <Btn type="button" variant="ghost" disabled={busy || !approved || !stageReady || dirty || Boolean(renderIssue)} onClick={onGenerate}>Generate</Btn>
          </div>
        </div>
      ) : null}

      <div className="sticky bottom-0 z-20 -mx-4 mt-4 flex flex-wrap items-center gap-2 border-t border-[#E6E8EE] bg-[#F3F4F8] px-4 py-3 md:-mx-6 md:px-6">
        <p className="text-sm">{dirty ? "Unsaved changes" : "Saved"}</p>
        <Btn type="button" data-save-changes disabled={!dirty || busy} onClick={() => void saveAll()}>Save changes</Btn>
        {stage === "script" ? <Btn type="button" variant="ghost" onClick={() => setStage("storyboard")}>Continue to storyboard</Btn> : null}
        {stage === "storyboard" ? <Btn type="button" variant="ghost" onClick={() => setStage("script")}>Back to script</Btn> : null}
        {stage === "storyboard" ? <Btn type="button" variant="ghost" onClick={() => setStage("generate")}>Continue to generation review</Btn> : null}
        {stage === "generate" ? <Btn type="button" variant="ghost" onClick={() => setStage("storyboard")}>Back to storyboard</Btn> : null}
        {!native && stage === "script" ? <button type="button" className="min-h-10 text-sm font-semibold" onClick={() => void playPlan()}>Play voice preview</button> : null}
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer text-[#6B7280]">Source details</summary>
        <p className="mt-2">Analysis version {analysisVersion ?? "missing"}. Blueprint version {blueprintVersion ?? "missing"}.</p>
        <p className="break-all text-[#6B7280]">Reference {referenceId || "missing"}.</p>
        <p className="mt-1">{listingNote}</p>
      </details>

      {dialog ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/40 p-4" onClick={closeDialog}>
          <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" data-factory-dialog={dialog} className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4 outline-none" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-base font-semibold">{dialog === "creator" ? "Creator" : dialog === "voice" ? "External voice" : dialog === "audio" ? "Native audio" : dialog === "image" ? "Product image" : dialog === "listing" ? `${market} listing` : dialog === "language" ? "Language" : dialog === "duration" ? "Duration" : "Market"}</p>
              <button type="button" className="min-h-10 rounded-lg border border-[#E6E8EE] px-3 text-sm font-semibold" onClick={closeDialog}>Close</button>
            </div>
            {dialog === "creator" ? <CreatorDialog mode={creatorMode} anchor={creatorAnchor} look={creatorLook} market={market} choices={creatorChoices} busy={busy} onClose={closeDialog} onSetup={onSetup} /> : null}
            {dialog === "audio" ? <AudioDialog direction={voiceDirection} busy={busy} onClose={closeDialog} onSetup={onSetup} /> : null}
            {dialog === "voice" ? <VoiceDialog voiceId={voiceId} delivery={deliveryMode} busy={busy} onClose={closeDialog} onSetup={onSetup} /> : null}
            {dialog === "image" ? <ImageDialog images={productImages} current={productImage} busy={busy} onClose={closeDialog} onSetup={onSetup} /> : null}
            {dialog === "listing" ? <ListingDialog market={market} productId={catalogProductId || ""} note={listingNote} onClose={closeDialog} /> : null}
            {dialog === "language" ? <LanguageDialog locale={locale} locales={locales} busy={busy} onClose={closeDialog} onSetup={onSetup} /> : null}
            {dialog === "duration" ? <DurationDialog durationSec={durationSec} busy={busy} onClose={closeDialog} onSetup={onSetup} /> : null}
            {dialog === "market" ? <div className="mt-3 text-sm"><p>This production stays on {market}. Another country is a separate production and does not change this draft.</p><Btn type="button" variant="ghost" className="mt-3" onClick={leave}>Back to productions</Btn></div> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function VoiceLine({ scene, take }: { scene: { beat: Beat; spoken: string }; take: { beatId: string; spoken: string; url: string; seconds: number; temporary: boolean } | null }) {
  const pending = scene.spoken !== (scene.beat.spoken || "");
  const stale = scene.beat.timing === "stale" || pending;
  const preview = take && take.beatId === scene.beat.id && take.spoken === scene.spoken ? take : null;
  const saved = !stale && scene.beat.timing === "measured" && scene.beat.voiceUrl && scene.beat.estimatedSec != null;
  const url = preview?.url || (saved ? scene.beat.voiceUrl || "" : "");
  const seconds = preview ? preview.seconds : saved ? scene.beat.estimatedSec : null;
  if (!scene.spoken.trim()) return null;
  return (
    <div className="mt-3">
      {seconds == null ? <p className="text-sm text-[#9A3412]">Measured voice is out of date for this line.</p> : <p className="text-sm text-[#4B5563]">{preview?.temporary ? "Temporary take" : "Saved voice"} · {seconds.toFixed(1)}s</p>}
      {url ? <audio className="mt-2 w-full" controls src={url} /> : null}
    </div>
  );
}

function CreatorDialog({ mode, anchor, look, market, choices, busy, onClose, onSetup }: { mode: string; anchor: Anchor | null; look: CreatorLook | null; market: string; choices: Anchor[]; busy: boolean; onClose: () => void; onSetup: (patch: SetupPatch) => Promise<boolean> }) {
  const [nextMode, setNextMode] = useState(mode === "HANDS" || mode === "SUPPLIED_ADULT" ? mode : "GENERATED_ADULT");
  const [face, setFace] = useState(anchor?.mediaId || "");
  const [presentation, setPresentation] = useState<CreatorLook["presentation"] | "">(look?.presentation || "");
  const [age, setAge] = useState<CreatorLook["age"] | "">(look?.age || "");
  const [hair, setHair] = useState(look?.hair || "");
  const [skin, setSkin] = useState(look?.skin || "");
  const [wardrobe, setWardrobe] = useState(look?.wardrobe || "");
  const draftLook = presentation && age && hair && skin && wardrobe ? { presentation, age, hair, skin, wardrobe } : null;
  return (
    <form className="mt-3 grid gap-3 text-sm" onSubmit={async (event) => {
      event.preventDefault();
      const picked = choices.find((row) => row.mediaId === face) || null;
      if (nextMode === "GENERATED_ADULT" && !draftLook) return;
      const ok = await onSetup({
        creatorMode: nextMode,
        creatorAnchor: nextMode === "HANDS" ? null : picked,
        creatorLook: nextMode === "GENERATED_ADULT" ? draftLook : null,
      });
      if (ok) onClose();
    }}>
      {(["GENERATED_ADULT", "HANDS", "SUPPLIED_ADULT"] as const).map((id) => (
        <label key={id} className="flex items-center gap-2"><input type="radio" name="creator-mode" checked={nextMode === id} onChange={() => setNextMode(id)} />{id === "HANDS" ? "Hands only" : id === "SUPPLIED_ADULT" ? "Supplied adult" : "Generated adult"}</label>
      ))}
      {nextMode === "GENERATED_ADULT" ? (
        <div className="grid gap-2" data-creator-look>
          <label>Presentation
            <select className="mt-1 min-h-10 w-full rounded-lg border border-[#E6E8EE] p-2" value={presentation} onChange={(event) => setPresentation(event.target.value as CreatorLook["presentation"])}>
              <option value="">Choose</option>
              <option value="woman">Woman</option>
              <option value="man">Man</option>
            </select>
          </label>
          <label>Age
            <select className="mt-1 min-h-10 w-full rounded-lg border border-[#E6E8EE] p-2" value={age} onChange={(event) => setAge(event.target.value as CreatorLook["age"])}>
              <option value="">Choose</option>
              <option value="20s">20s</option>
              <option value="30s">30s</option>
            </select>
          </label>
          <label>Hair
            <select className="mt-1 min-h-10 w-full rounded-lg border border-[#E6E8EE] p-2" value={hair} onChange={(event) => setHair(event.target.value)}>
              <option value="">Choose</option>
              {CREATOR_HAIR.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>Skin
            <select className="mt-1 min-h-10 w-full rounded-lg border border-[#E6E8EE] p-2" value={skin} onChange={(event) => setSkin(event.target.value)}>
              <option value="">Choose</option>
              {CREATOR_SKIN.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label>Wardrobe
            <select className="mt-1 min-h-10 w-full rounded-lg border border-[#E6E8EE] p-2" value={wardrobe} onChange={(event) => setWardrobe(event.target.value)}>
              <option value="">Choose</option>
              {CREATOR_WARDROBE.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <p>{draftLook ? creatorLookSentence(draftLook, market) : "Choose every field. Save stores this description. It does not create a face photo."}</p>
          <p className="text-xs text-[#6B7280]">No face plate. Wan can still generate. The face follows this description and the market, and it may differ between scenes.</p>
        </div>
      ) : null}
      {nextMode === "HANDS" ? <p>Hands-only does not use a face plate.</p> : choices.length ? (
        <div className="grid gap-2">
          {choices.map((row) => (
            <label key={row.mediaId} className="flex items-center gap-2"><input type="radio" name="creator-face" checked={face === row.mediaId} onChange={() => setFace(row.mediaId)} /><img src={row.url} alt="" className="h-12 w-12 rounded object-cover" />{row.label}</label>
          ))}
        </div>
      ) : nextMode === "SUPPLIED_ADULT" ? <p>No face plate is stored. A source frame is not a face, and this dialog will not invent one.</p> : null}
      <Btn type="submit" disabled={busy || (nextMode === "GENERATED_ADULT" && !draftLook)}>Save creator</Btn>
    </form>
  );
}

function AudioDialog({ direction, busy, onClose, onSetup }: { direction: string; busy: boolean; onClose: () => void; onSetup: (patch: SetupPatch) => Promise<boolean> }) {
  const [next, setNext] = useState(direction);
  return (
    <form className="mt-3 grid gap-3 text-sm" onSubmit={async (event) => {
      event.preventDefault();
      const ok = await onSetup({ audioStrategy: "NATIVE_AUDIO", voiceDirection: next });
      if (ok) onClose();
    }}>
      <p>Wan 3.0 Prime generates the picture and the speech together. A separate voice preview is not required.</p>
      <label>Voice direction, optional
        <textarea className="mt-1 w-full rounded-lg border border-[#E6E8EE] p-2 text-sm" value={next} placeholder="Casual English, unhurried, not the source creator" onChange={(event) => setNext(event.target.value)} />
      </label>
      <Btn type="submit" disabled={busy}>Save native audio</Btn>
      <details>
        <summary className="cursor-pointer font-semibold">Advanced</summary>
        <p className="mt-2">External voiceover keeps the older TTS path. It is not the default, and native audio does not fall back to it.</p>
        <Btn className="mt-2" type="button" variant="ghost" disabled={busy} onClick={async () => { const ok = await onSetup({ audioStrategy: "EXTERNAL_TTS" }); if (ok) onClose(); }}>Use external voiceover</Btn>
      </details>
    </form>
  );
}

function VoiceDialog({ voiceId, delivery, busy, onClose, onSetup }: { voiceId: string; delivery: "creator-led" | "voiceover"; busy: boolean; onClose: () => void; onSetup: (patch: SetupPatch) => Promise<boolean> }) {
  const [voice, setVoice] = useState(voiceId || "en-US-AriaNeural");
  const [nextDelivery, setNextDelivery] = useState(delivery);
  return (
    <form className="mt-3 grid gap-3 text-sm" onSubmit={async (event) => {
      event.preventDefault();
      const ok = await onSetup({ voiceId: voice, deliveryMode: nextDelivery });
      if (ok) onClose();
    }}>
      <label className="flex items-center gap-2"><input type="radio" name="delivery" checked={nextDelivery === "voiceover"} onChange={() => setNextDelivery("voiceover")} />Off-screen voiceover</label>
      <label className="flex items-center gap-2"><input type="radio" name="delivery" checked={nextDelivery === "creator-led"} onChange={() => setNextDelivery("creator-led")} />Creator-led delivery</label>
      <label>Voice
        <select className="mt-1 min-h-10 w-full rounded-lg border border-[#E6E8EE] p-2 text-sm" value={voice} onChange={(event) => setVoice(event.target.value)}>
          {FACTORY_VOICE_IDS.map((id) => <option key={id} value={id}>{id}</option>)}
        </select>
      </label>
      <Btn type="submit" disabled={busy}>Save voice</Btn>
    </form>
  );
}

function ImageDialog({ images, current, busy, onClose, onSetup }: { images: { id: string; url: string; label: string }[]; current: string | null; busy: boolean; onClose: () => void; onSetup: (patch: SetupPatch) => Promise<boolean> }) {
  const [picked, setPicked] = useState(images.find((row) => row.url === current)?.id || images[0]?.id || "");
  return (
    <form className="mt-3 grid gap-3 text-sm" onSubmit={async (event) => {
      event.preventDefault();
      const image = images.find((row) => row.id === picked);
      if (!image) return;
      const ok = await onSetup({ productImage: { id: image.id, url: image.url } });
      if (ok) onClose();
    }}>
      {images.length ? images.map((row) => (
        <label key={row.id} className="flex items-center gap-2"><input type="radio" name="product-image" checked={picked === row.id} onChange={() => setPicked(row.id)} /><img src={row.url} alt="" className="h-14 w-14 rounded object-cover" />{row.label}</label>
      )) : <p>No catalog photo is stored for this SKU.</p>}
      <Btn type="submit" disabled={busy || !picked}>Save image</Btn>
    </form>
  );
}

function LanguageDialog({ locale, locales, busy, onClose, onSetup }: { locale: string; locales: string[]; busy: boolean; onClose: () => void; onSetup: (patch: SetupPatch) => Promise<boolean> }) {
  const [next, setNext] = useState(locale);
  return (
    <form className="mt-3 grid gap-3 text-sm" onSubmit={async (event) => {
      event.preventDefault();
      const ok = await onSetup({ locale: next });
      if (ok) onClose();
    }}>
      {locales.map((id) => <label key={id} className="flex items-center gap-2"><input type="radio" name="locale" checked={next === id} onChange={() => setNext(id)} />{id}</label>)}
      <Btn type="submit" disabled={busy}>Save language</Btn>
    </form>
  );
}

function DurationDialog({ durationSec, busy, onClose, onSetup }: { durationSec: number; busy: boolean; onClose: () => void; onSetup: (patch: SetupPatch) => Promise<boolean> }) {
  const [next, setNext] = useState(String(durationSec));
  return (
    <form className="mt-3 grid gap-3 text-sm" onSubmit={async (event) => {
      event.preventDefault();
      const ok = await onSetup({ durationSec: Number(next) });
      if (ok) onClose();
    }}>
      <label>Seconds from 10 to 30
        <input className="mt-1 min-h-10 w-full rounded-lg border border-[#E6E8EE] p-2 text-sm" type="number" min={10} max={30} value={next} onChange={(event) => setNext(event.target.value)} />
      </label>
      <Btn type="submit" disabled={busy}>Save duration</Btn>
    </form>
  );
}

function ListingDialog({ market, productId, note, onClose }: { market: string; productId: string; note: string; onClose: () => void }) {
  const [rows, setRows] = useState<{ id: string; marketplace: string; sourceUrl: string; seller: string; merchantProductId: string | null; variantReview: string; reviewedVariantKey?: string | null; reviewEvidence?: string | null; title: string; tracked: string; status: string }[]>([]);
  const [skuId, setSkuId] = useState("");
  const [error, setError] = useState("");
  const [noteText, setNoteText] = useState("");
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await fetch("/api/commerce/catalog");
    const json = await res.json();
    const sku = (json.skus || []).find((row: { legacyProductId?: string | null }) => row.legacyProductId === productId);
    setSkuId(sku?.id || "");
    const listings = (json.listings || []).filter((row: { skuId: string; market: string | null }) => row.skuId === sku?.id && row.market === market);
    setRows(listings.map((row: { id: string; marketplace: string; sourceUrl: string; seller: string; merchantProductId: string | null; variantReview: string; reviewedVariantKey?: string | null }) => {
      const snaps = (json.listingSnapshots || []).filter((snap: { listingId: string }) => snap.listingId === row.id);
      const title = snaps[snaps.length - 1]?.title || "";
      const tracked = (json.destinations || []).find((item: { listingId: string; trackedUrl?: string | null }) => item.listingId === row.id && item.trackedUrl)?.trackedUrl || "";
      return { ...row, title: /^https?:/i.test(title) ? "" : title, tracked, status: listingMatchStatus(row) };
    }));
  }

  useEffect(() => { void load(); }, [productId, market]);

  return (
    <div className="mt-3 grid gap-3 text-sm">
      <p>{note}</p>
      <p>Check the product version, size and package. A review note alone does not confirm the listing.</p>
      {rows.map((row) => (
        <div key={row.id} className="rounded-xl bg-[#F7F8FB] p-3">
          <p className="font-semibold">{row.title || `${market} listing`}</p>
          <p className="text-xs text-[#6B7280]">{row.marketplace} · {row.status === "confirmed" ? "Confirmed" : row.status === "different" ? "Different product" : "Needs confirmation"}</p>
          {row.reviewEvidence ? <p className="mt-1">{row.reviewEvidence}</p> : null}
          <a className="mt-1 inline-block font-semibold text-[#652DFF]" href={row.sourceUrl}>Product listing</a>
          {row.tracked ? <a className="mt-1 block font-semibold text-[#652DFF]" href={row.tracked}>Affiliate link</a> : <p className="mt-1">No affiliate link is saved on this row.</p>}
          <details className="mt-2">
            <summary className="cursor-pointer text-xs">Match details</summary>
            <p className="mt-1 text-xs">Seller · {row.seller || "Not stored"}</p>
            <p className="text-xs">Model · {row.merchantProductId || "Not stored"}</p>
            <p className="text-xs">Variant · {variantSelectionId(row.sourceUrl) || "Not stored"}</p>
          </details>
          {row.status !== "confirmed" && row.status !== "different" ? (
            <form className="mt-2" onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError("");
              const res = await fetch("/api/commerce/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "review-listing", listingId: row.id, review: "REVIEWED", evidence: noteText }) });
              const json = await res.json();
              setBusy(false);
              if (!res.ok) { setError(json.error || "The confirmation was not saved."); return; }
              setNoteText("");
              await load();
            }}>
              <label className="block">Review note, optional
                <textarea className="mt-1 w-full rounded-lg border border-[#E6E8EE] p-2 text-sm" value={noteText} onChange={(event) => setNoteText(event.target.value)} />
              </label>
              <Btn className="mt-2" type="submit" disabled={busy}>Confirm same product</Btn>
            </form>
          ) : null}
        </div>
      ))}
      {!rows.length ? <p>No {market} listing is stored on this product yet.</p> : null}
      <form onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        const res = await fetch("/api/commerce/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "import-listing", skuId, market, sourceUrl: paste }) });
        const json = await res.json();
        setBusy(false);
        if (!res.ok) { setError(json.error || "The listing was not added."); return; }
        setPaste("");
        await load();
      }}>
        <label className="block">Correct the listing on this same product
          <input className="mt-1 min-h-10 w-full rounded-lg border border-[#E6E8EE] p-2 text-sm" value={paste} onChange={(event) => setPaste(event.target.value)} placeholder="Shop URL for this market" />
        </label>
        <Btn className="mt-2" type="submit" variant="ghost" disabled={busy || !skuId || !paste.trim()}>Add listing</Btn>
      </form>
      {error ? <p className="text-[#9A3412]">{error}</p> : null}
      <button type="button" className="text-sm font-semibold" onClick={onClose}>Back to this draft</button>
    </div>
  );
}
