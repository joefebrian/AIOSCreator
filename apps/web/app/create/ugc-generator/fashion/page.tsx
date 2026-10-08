"use client";

import Link from "next/link";
import { ArrowRight, MoreHorizontal, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Btn, inputClass, Surface } from "@/components/ui";
import { cn } from "@/lib/cn";
import { thumbSrc } from "@/lib/media-url";

type Item = { id: string; title: string; sourceUrl: string; imageUrl: string; slot: string; productId?: string };
type Candidate = { id: string; revision: number; status: string; url?: string; source?: string; decision?: string; blocked?: string; reviewNote?: string };
type Motion = { id: string; label: string; assetUrl: string; trimIn: number; trimOut: number };
type Render = { id: string; status: string; decision: string; url?: string; source?: string; primary?: boolean; stillId: string; motionId: string };
type Project = {
  id: string;
  name: string;
  stage: string;
  attention?: string;
  revision: number;
  items: Item[];
  gender: "woman" | "man" | "random";
  age: string;
  market: string;
  style: string;
  framing: string;
  lighting: string;
  candidateCount: number;
  instructions: string;
  prompt: string;
  promptModel?: string;
  characterSeed?: string;
  characterStrategy?: string;
  updatedAt: string;
  candidates: Candidate[];
  motions: Motion[];
  renders: Render[];
  approvedStillId?: string;
  approvedStillUrl?: string;
  stillUrl?: string;
  videoUrl?: string;
  conflicts?: string[];
};
type Quote = {
  id: string;
  plannedCandidates: number;
  plannedVideos: number;
  providerReady: number;
  skipped: { projectId: string; reason: string }[];
  expiresAt: string;
};
type Queue = { id: string; kind: "look" | "video"; cursor: number; subjects: { projectId: string; renderId?: string }[] };
type Preset = { id: string; name: string; market: string; style: string; framing: string; lighting: string; gender: string; candidateCount: number; instructions: string };
type BatchRow = { id: string; kind: string; state: string; plannedCandidates: number; plannedVideos: number; skipped: number; queued: number; stopped: number; note?: string };

const PROMPT_MODELS = [
  ["deepseek-ai/deepseek-v4.1-flash", "DeepSeek V4.1 Flash"],
  ["z-ai/glm-5.3", "GLM 5.3"],
  ["meta/muse-glimmer-30b", "Muse Glimmer 30B"],
] as const;

const STAGES = [
  ["", "All"],
  ["DRAFT", "Drafts"],
  ["GENERATING_LOOK", "Generating Look"],
  ["AWAITING_LOOK_APPROVAL", "Awaiting Look Approval"],
  ["READY_FOR_MOTION", "Ready for Motion"],
  ["IN_PRODUCTION", "In Production"],
  ["PENDING_REVIEW", "Pending Review"],
  ["COMPLETED", "Completed"],
] as const;

const CHECKS = ["One adult person", "Products match the source photos", "No extra products or text", "Framing keeps every product visible"];
const MARKETS = ["Indonesia", "Malaysia", "Singapore", "Thailand", "Japan", "United States", "Random"];
const STYLES = [
  ["bedroom", "Bedroom outfit check"],
  ["living-room", "Casual living room"],
  ["street", "Streetwear daylight"],
  ["home-fitting", "Clean home fitting"],
  ["fitting-room", "Fitting room"],
];
const SLOTS = ["tops", "bottoms", "set", "one-piece", "outerwear", "footwear", "headwear", "eyewear", "bag", "jewelry", "other"];

type Query = {
  q: string;
  stage: string;
  sort: string;
  attention: boolean;
  sel: string[];
  drawer: string;
  section: string;
  panel: string;
  review: string;
  sy: number;
};

const EMPTY_QUERY: Query = { q: "", stage: "", sort: "newest", attention: false, sel: [], drawer: "", section: "", panel: "", review: "", sy: 0 };

function readQuery(): Query {
  const url = new URL(window.location.href);
  return {
    q: url.searchParams.get("q") || "",
    stage: url.searchParams.get("stage") || "",
    sort: url.searchParams.get("sort") || "newest",
    attention: url.searchParams.get("attention") === "1",
    sel: (url.searchParams.get("sel") || "").split(",").filter(Boolean),
    drawer: url.searchParams.get("drawer") || "",
    section: url.searchParams.get("section") || "",
    panel: url.searchParams.get("panel") || "",
    review: url.searchParams.get("review") || "",
    sy: Number(url.searchParams.get("sy") || 0),
  };
}

function writeQuery(next: Query) {
  const url = new URL(window.location.href);
  const set = (key: string, value: string) => {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  };
  set("q", next.q);
  set("stage", next.stage);
  set("sort", next.sort === "newest" ? "" : next.sort);
  set("attention", next.attention ? "1" : "");
  set("sel", next.sel.join(","));
  set("drawer", next.drawer);
  set("section", next.section);
  set("panel", next.panel);
  set("review", next.review);
  set("sy", next.sy ? String(Math.round(next.sy)) : "");
  const href = `${url.pathname}${url.search}`;
  window.history.replaceState(null, "", href);
  window.sessionStorage.setItem("fashion-board-query", url.search);
}

function showable(url?: string) {
  return Boolean(url && (url.startsWith("/api/") || url.startsWith("http://") || url.startsWith("https://")));
}

function stageText(stage: string) {
  return STAGES.find((row) => row[0] === stage)?.[1] || stage.replaceAll("_", " ");
}

function pillClass(stage: string) {
  if (stage === "COMPLETED") return "bg-emerald-50 text-emerald-800";
  if (stage === "READY_FOR_MOTION") return "bg-orange-50 text-orange-800";
  if (stage === "AWAITING_LOOK_APPROVAL" || stage === "PENDING_REVIEW") return "bg-amber-50 text-amber-900";
  if (stage === "GENERATING_LOOK" || stage === "IN_PRODUCTION") return "bg-violet-50 text-violet-800";
  return "bg-[#F3F4F8] text-[#374151]";
}

function nextSection(project: Project) {
  if (project.stage === "AWAITING_LOOK_APPROVAL") return "images";
  if (project.stage === "PENDING_REVIEW") return "review";
  if (project.stage === "READY_FOR_MOTION" || project.stage === "IN_PRODUCTION") return "motion";
  if (project.stage === "GENERATING_LOOK") return "images";
  if (project.stage === "COMPLETED") return "review";
  return project.items.length ? "look" : "products";
}

function actionLabel(project: Project) {
  if (project.stage === "DRAFT") return project.items.length ? "Choose the scene" : "Add products";
  if (project.stage === "GENERATING_LOOK") return "See the queue";
  if (project.stage === "IN_PRODUCTION") return "View progress";
  if (project.stage === "AWAITING_LOOK_APPROVAL") return "Review Look";
  if (project.stage === "READY_FOR_MOTION") return project.motions.length ? "Generate Video" : "Add Motion";
  if (project.stage === "PENDING_REVIEW") return "Review Video";
  if (project.stage === "COMPLETED") return "Download";
  return "Open";
}

function stepHint(project: Project) {
  if (project.stage === "DRAFT" && !project.items.length) return "Draft. Add 1–4 product links.";
  if (project.stage === "DRAFT") return "Products are in. Next button: Choose the scene.";
  if (project.stage === "GENERATING_LOOK") return "Qwen Image 2.1 draws the stills. See the queue.";
  if (project.stage === "AWAITING_LOOK_APPROVAL") return "A still is ready. Review it and approve one.";
  if (project.stage === "READY_FOR_MOTION") return "Still approved. Add a motion reference, then queue video.";
  if (project.stage === "IN_PRODUCTION") return "Video is queued.";
  if (project.stage === "PENDING_REVIEW") return "A video is ready to review.";
  if (project.stage === "COMPLETED") return "Approved video can be downloaded.";
  return "";
}

function styleLabel(style?: string) {
  return STYLES.find((row) => row[0] === style)?.[1] || style || "Scene";
}

function whenLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function attentionLabel(text?: string) {
  if (!text) return "";
  const stopped = text.match(/Stopped (\d+)/);
  if (stopped) return `${stopped[1]} stopped before render`;
  return text.length > 88 ? `${text.slice(0, 86)}…` : text;
}

async function post(body: Record<string, unknown>) {
  const res = await fetch("/api/ugc-fashion/batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { ok: res.ok, status: res.status, json };
}

export default function FashionBoard() {
  const [query, setQuery] = useState<Query>(EMPTY_QUERY);
  const [ready, setReady] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);
  const [attentionCount, setAttentionCount] = useState(0);
  const [detail, setDetail] = useState<Project | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [rewriteBusy, setRewriteBusy] = useState(false);
  const [reviseNote, setReviseNote] = useState("");
  const [reviseBusy, setReviseBusy] = useState("");
  const [presets, setPresets] = useState<Preset[]>([]);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [quote, setQuote] = useState<{ kind: "image" | "motion"; quote: Quote; note?: string; pairs?: unknown[] } | null>(null);
  const [quoteKey, setQuoteKey] = useState("");
  const [review, setReview] = useState<{ queue: Queue; project: Project | null } | null>(null);
  const [candidateId, setCandidateId] = useState("");
  const [checks, setChecks] = useState<boolean[]>([false, false, false, false]);
  const [revisionNote, setRevisionNote] = useState("");
  const [boardWidth, setBoardWidth] = useState(1280);
  const [productUrl, setProductUrl] = useState("");
  const [slot, setSlot] = useState("tops");
  const [photoChoices, setPhotoChoices] = useState<{ title: string; sourceUrl: string; productId: string; choices: { url: string; set: boolean }[] } | null>(null);
  const [batchMode, setBatchMode] = useState<"one-url-per-look" | "one-look" | "csv" | "group">("one-url-per-look");
  const [batchText, setBatchText] = useState("");
  const [batchPreview, setBatchPreview] = useState("");
  const [presetId, setPresetId] = useState("bedroom-daylight");
  const [presetFields, setPresetFields] = useState<string[]>(["style", "lighting", "framing"]);
  const [replaceOverrides, setReplaceOverrides] = useState(false);
  const [presetPreview, setPresetPreview] = useState("");
  const [motionMode, setMotionMode] = useState<"same" | "multiple" | "map">("multiple");
  const [motionRows, setMotionRows] = useState([
    { label: "Motion 1", assetUrl: "", trimIn: 0, trimOut: 0 },
    { label: "Motion 2", assetUrl: "", trimIn: 0, trimOut: 0 },
    { label: "Motion 3", assetUrl: "", trimIn: 0, trimOut: 0 },
  ]);
  const [lookDraft, setLookDraft] = useState<Partial<Project>>({});
  const boardRef = useRef<HTMLDivElement>(null);
  const focusRef = useRef<HTMLElement | null>(null);
  const scrollRef = useRef(0);

  function update(patch: Partial<Query>) {
    setQuery((current) => ({ ...current, ...patch }));
  }

  useEffect(() => {
    const initial = readQuery();
    setQuery(initial);
    scrollRef.current = initial.sy;
    setReady(true);
    const main = document.querySelector("main");
    if (main && initial.sy) main.scrollTop = initial.sy;
  }, []);

  useEffect(() => {
    if (!ready) return;
    writeQuery(query);
  }, [query, ready]);

  useEffect(() => {
    const node = boardRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setBoardWidth(node.clientWidth));
    observer.observe(node);
    setBoardWidth(node.clientWidth);
    return () => observer.disconnect();
  }, [ready]);

  async function reload() {
    const params = new URLSearchParams();
    if (query.q) params.set("q", query.q);
    if (query.stage) params.set("stage", query.stage);
    if (query.sort && query.sort !== "newest") params.set("sort", query.sort);
    if (query.attention) params.set("attention", "1");
    const res = await fetch(`/api/ugc-fashion/projects?${params}`);
    const json = await res.json();
    setProjects(json.projects || []);
    setCounts(json.counts || {});
    setTotal(json.total || 0);
    setAttentionCount(json.attention || 0);
  }

  useEffect(() => {
    if (!ready) return;
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, query.q, query.stage, query.sort, query.attention]);

  useEffect(() => {
    if (!ready) return;
    void fetch("/api/ugc-fashion/batch")
      .then((res) => res.json())
      .then((json) => {
        setPresets(json.presets || []);
        setBatches(json.batches || []);
      });
  }, [ready, notice]);

  const drawing = Boolean(detail?.candidates?.some((row) => row.status === "queued" && !row.url));

  useEffect(() => {
    if (!query.drawer || !drawing) return;
    const timer = window.setInterval(() => {
      void fetch(`/api/ugc-fashion/projects/${query.drawer}`)
        .then((res) => res.json())
        .then((json) => {
          if (json?.id) setDetail(json);
        })
        .catch(() => {});
    }, 6000);
    return () => window.clearInterval(timer);
  }, [query.drawer, drawing]);

  useEffect(() => {
    if (!query.drawer) {
      setDetail(null);
      return;
    }
    void fetch(`/api/ugc-fashion/projects/${query.drawer}`)
      .then((res) => res.json())
      .then((json) => {
        if (!json.error) {
          setDetail(json);
          setLookDraft(json);
        }
      });
  }, [query.drawer, notice]);

  useEffect(() => {
    if (!query.review) {
      setReview(null);
      return;
    }
    void fetch(`/api/ugc-fashion/batch?queue=${query.review}`)
      .then((res) => res.json())
      .then((json) => {
        if (!json.queue) return;
        setReview(json);
        setChecks([false, false, false, false]);
        setRevisionNote("");
        const first = (json.project?.candidates || []).find((row: Candidate) => row.status === "ready" && row.revision === json.project.revision);
        setCandidateId(first?.id || "");
      });
  }, [query.review, notice]);

  function rememberScroll() {
    const main = document.querySelector("main");
    scrollRef.current = main?.scrollTop || 0;
  }

  function restoreBoard() {
    requestAnimationFrame(() => {
      const main = document.querySelector("main");
      if (main) main.scrollTop = scrollRef.current;
      focusRef.current?.focus();
    });
  }

  function openDrawer(id: string, section: string, el?: HTMLElement | null) {
    focusRef.current = el || (document.activeElement as HTMLElement);
    rememberScroll();
    update({ drawer: id, section, panel: "", review: "", sy: scrollRef.current });
  }

  function closeDrawer() {
    update({ drawer: "", section: "", sy: scrollRef.current });
    restoreBoard();
  }

  function toggleSelected(id: string) {
    const sel = query.sel.includes(id) ? query.sel.filter((row) => row !== id) : [...query.sel, id];
    update({ sel });
  }

  const hiddenSelected = query.sel.filter((id) => !projects.some((project) => project.id === id));
  const visibleIds = projects.map((project) => project.id);
  const allVisible = visibleIds.length > 0 && visibleIds.every((id) => query.sel.includes(id));

  async function createLook() {
    const res = await fetch("/api/ugc-fashion/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    const project = await res.json();
    await reload();
    openDrawer(project.id, "products");
  }

  async function openImageQuote(ids: string[]) {
    setError("");
    const count = detail?.candidateCount || 2;
    const result = await post({ op: "preview-image", projectIds: ids, candidateCount: count });
    if (!result.ok) {
      setError(result.json.error || "Quote failed");
      return;
    }
    setQuote({ kind: "image", quote: result.json.quote, note: result.json.note });
    setQuoteKey(crypto.randomUUID());
    rememberScroll();
    update({ panel: "quote", sy: scrollRef.current });
  }

  async function openMotionQuote(ids: string[]) {
    setError("");
    const result = await post({ op: "preview-motion", projectIds: ids });
    if (!result.ok) {
      setError(result.json.error || "Quote failed");
      return;
    }
    setQuote({ kind: "motion", quote: result.json.quote, note: result.json.note, pairs: result.json.pairs });
    setQuoteKey(crypto.randomUUID());
    rememberScroll();
    update({ panel: "quote", sy: scrollRef.current });
  }

  async function confirmQuote() {
    if (!quote) return;
    const op = quote.kind === "image" ? "image-batch" : "motion-batch";
    const result = await post({ op, quoteId: quote.quote.id, idempotencyKey: quoteKey });
    if (!result.ok) {
      setError(result.json.error || "Queue refused");
      return;
    }
    const batch = result.json.batch;
    setNotice(
      `${result.json.duplicate ? "Same queue returned. " : "Queued. "}Stills ${batch?.plannedCandidates ?? 0}. Qwen Image Edit 2.1 draws the pictures. Video is not started.`,
    );
    setQuote(null);
    update({ panel: "activity" });
    await reload();
  }

  async function runReview(kind: "look" | "video", ids = query.sel) {
    const result = await post({ op: "open-review", projectIds: ids, kind });
    if (!result.ok) {
      setError(result.json.error || "Review queue failed");
      return;
    }
    rememberScroll();
    update({ review: result.json.id, panel: "", sy: scrollRef.current });
    setNotice(result.json.subjects?.length ? `Review queue ${result.json.subjects.length}` : "Nothing is ready to review. Planned rows cannot be approved.");
  }

  async function decide(decision: "approve" | "revision" | "skip") {
    if (!review) return;
    const result = await post({
      op: "review-decision",
      queueId: review.queue.id,
      decision,
      candidateId: review.queue.kind === "look" ? candidateId : undefined,
      renderId: review.queue.kind === "video" ? review.queue.subjects[review.queue.cursor]?.renderId : undefined,
      checklist: checks.every(Boolean),
      expectedRevision: review.project?.revision,
      note: revisionNote,
    });
    if (!result.ok) {
      setError(result.json.error || "Review did not save. This look stayed put.");
      if (result.json.queue) setReview({ queue: result.json.queue, project: result.json.project || review.project });
      return;
    }
    setError("");
    setNotice(`${decision} saved. Queue moved forward.`);
    await reload();
    const again = await fetch(`/api/ugc-fashion/batch?queue=${review.queue.id}`).then((res) => res.json());
    setReview(again.queue ? again : null);
    setChecks([false, false, false, false]);
    setRevisionNote("");
  }

  async function removeLookItem(project: Project, itemId: string) {
    setError("");
    const res = await fetch(`/api/ugc-fashion/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: project.items.filter((row) => row.id !== itemId), expectedRevision: project.revision }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Could not remove that product.");
      return;
    }
    if (detail?.id === project.id) {
      setDetail(json);
      setLookDraft(json);
    }
    await reload();
  }

  async function rewritePrompt() {
    if (!detail || rewriteBusy) return;
    const before = detail.prompt;
    setRewriteBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await post({ op: "rewrite-prompt", projectId: detail.id, promptModel: detail.promptModel || PROMPT_MODELS[0][0] });
      if (!result.ok) {
        setError(result.json.error || "Rewrite failed");
        return;
      }
      setDetail(result.json);
      setLookDraft(result.json);
      setNotice(result.json.prompt === before ? "The writer returned the same prompt." : "Prompt updated in the box below.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rewrite failed");
    } finally {
      setRewriteBusy(false);
    }
  }

  async function saveDetail(patch: Partial<Project>) {
    if (!detail) return;
    const res = await fetch(`/api/ugc-fashion/projects/${detail.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...patch, expectedRevision: detail.revision }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Save failed. Local edits are still in the form.");
      return;
    }
    setDetail(json);
    setLookDraft(json);
    setError("");
    if (json.attention) setNotice(json.attention);
    await reload();
  }

  async function addLookItem(item: { title: string; sourceUrl: string; imageUrl: string; productId: string; set: boolean }) {
    if (!detail) return;
    const chosen = item.set ? "set" : slot;
    await saveDetail({
      items: [
        ...detail.items,
        { id: crypto.randomUUID(), title: item.title, sourceUrl: item.sourceUrl, imageUrl: item.imageUrl, slot: chosen, productId: item.productId },
      ],
    });
    if (item.set) setNotice("This photo shows the whole set, so the slot is Set.");
    setPhotoChoices(null);
    setProductUrl("");
  }

  async function importProduct() {
    if (!detail || !productUrl.trim()) return;
    setError("");
    setPhotoChoices(null);
    const res = await fetch("/api/commerce/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: productUrl }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Import failed");
      return;
    }
    const product = json.product;
    const pick = json.fashion as { imageUrl?: string; set?: boolean; choices?: { url: string; set: boolean }[] } | undefined;
    const imageUrl = pick?.imageUrl || "";
    if (!imageUrl) {
      const choices = (pick?.choices || []).filter((row) => row.url);
      if (!choices.length) {
        setError("No product photo yet. The link was not added.");
        return;
      }
      setPhotoChoices({ title: product.title, sourceUrl: product.sourceUrl || productUrl, productId: product.id, choices });
      return;
    }
    await addLookItem({ title: product.title, sourceUrl: product.sourceUrl || productUrl, imageUrl, productId: product.id, set: Boolean(pick?.set) });
  }

  async function submitBatch() {
    setError("");
    const key = crypto.randomUUID();
    if (batchMode === "csv") {
      const preview = await post({ op: "preview-csv", text: batchText });
      setBatchPreview(JSON.stringify(preview.json, null, 2));
      if (!preview.json.valid) {
        setError("Fix the CSV rows before creating drafts.");
        return;
      }
      const result = await post({ op: "import-csv", text: batchText, idempotencyKey: key });
      if (!result.ok) {
        setError(result.json.error || "Import failed");
        return;
      }
      setNotice(`Imported ${result.json.projects?.length || 0} drafts. Rejected rows stayed out.`);
    } else if (batchMode === "group") {
      const groups = batchText
        .split(/\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [name, ...urls] = line.split("|").map((part) => part.trim());
          return { name: name || "Look", urls: urls.join(" ").split(/\s+/).filter(Boolean) };
        });
      const result = await post({ op: "create-drafts", mode: "group", groups, idempotencyKey: key, lookName: "Batch" });
      if (!result.ok) {
        setError(result.json.error || "Batch refused");
        return;
      }
      setNotice(`Created ${result.json.projects?.length || 0} drafts. Skipped ${result.json.skipped?.length || 0}.`);
    } else {
      const urls = batchText.split(/\s+/).filter(Boolean);
      const result = await post({ op: "create-drafts", mode: batchMode, urls, idempotencyKey: key, lookName: "Batch" });
      if (!result.ok) {
        setError(result.json.error || "Batch refused");
        return;
      }
      setNotice(`${batchMode === "one-look" ? "One look" : "One URL per look"}: ${result.json.projects?.length || 0} drafts.`);
    }
    update({ panel: "" });
    await reload();
  }

  async function downloadApproved(ids?: string[]) {
    const result = await post({ op: "export-approved", projectIds: ids || query.sel });
    const blob = new Blob([JSON.stringify(result.json, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = "fashion-approved.json";
    link.click();
    URL.revokeObjectURL(href);
    setNotice(`Approved list: ${result.json.approved} renders, ${result.json.files} with a media file, ${result.json.fixtures} fixtures.`);
  }

  const wide = boardWidth >= 1280;
  const tight = boardWidth < 640;

  return (
    <div className="min-w-0 max-w-full overflow-x-clip px-4 py-5 md:px-6 md:py-6">
      <div className="mb-3 flex w-full max-w-full flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.18em] text-[#652DFF]">FASHION MOTION</p>
          <h1 className="mt-0.5 text-[22px] font-black tracking-tight">My Videos</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[#6B7280]">
            <span>{total} look{total === 1 ? "" : "s"}</span>
            <button type="button" className="font-semibold text-[#652DFF]" onClick={() => update({ panel: "activity" })}>Batch activity</button>
          </p>
        </div>
        <div className="flex w-full max-w-full flex-wrap items-center gap-2 sm:w-auto">
          <Btn type="button" onClick={() => void createLook()}>Create Look</Btn>
          <Btn type="button" variant="ghost" onClick={() => update({ panel: "batch", review: "" })}>Batch Create</Btn>
        </div>
      </div>
      <div className="mb-4 flex w-full min-w-0 max-w-full flex-col gap-2 sm:flex-row sm:items-center">
        <input className={inputClass + " mt-0 min-w-0 w-full flex-1"} placeholder="Search looks, products, domains" value={query.q} onChange={(e) => update({ q: e.target.value })} aria-label="Search looks" />
        <select className={inputClass + " mt-0 w-full sm:w-40"} value={query.sort} aria-label="Sort looks" onChange={(e) => update({ sort: e.target.value })}>
          <option value="newest">Newest</option>
          <option value="updated">Last updated</option>
          <option value="oldest">Oldest first</option>
        </select>
      </div>

      <div className="mb-4 flex w-full min-w-0 max-w-full items-center gap-1.5 overflow-x-auto [mask-image:linear-gradient(to_right,black_calc(100%_-_2rem),transparent)] sm:flex-wrap sm:overflow-visible sm:[mask-image:none]">
        <label className="mr-1 inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-[12px] font-semibold text-[#6B7280]">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[#652DFF]"
            checked={allVisible}
            aria-label="Select visible looks"
            onChange={() => update({ sel: allVisible ? query.sel.filter((id) => !visibleIds.includes(id)) : Array.from(new Set([...query.sel, ...visibleIds])) })}
          />
          Select
        </label>
        {[...STAGES.map(([id, label]) => ({ id, label, count: id ? counts[id] || 0 : total, on: query.stage === id })), { id: "attention", label: "Needs Attention", count: attentionCount, on: query.attention }].map((chip) => (
          <button
            key={chip.id || "all"}
            type="button"
            onClick={() => (chip.id === "attention" ? update({ attention: !query.attention }) : update({ stage: chip.id }))}
            className={cn("shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-left text-[12px] font-semibold", chip.on ? "border-[#111827] bg-[#111827] text-white" : "border-[#E6E8EE] bg-white text-[#4B5563]")}
          >
            {chip.label}
            <span className={cn("ml-1", chip.on ? "text-white/70" : "text-[#9CA3AF]")}>{chip.count}</span>
          </button>
        ))}
      </div>

      {query.sel.length ? (
        <div className="sticky top-0 z-20 mb-3 flex flex-wrap items-center gap-1.5 rounded-2xl border border-[#E6E8EE] bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
          <span className="mr-1 text-[12px] font-semibold">{query.sel.length} selected</span>
          <Btn type="button" variant="ghost" className="!px-2.5 !py-1 text-[12px]" onClick={() => update({ panel: "preset" })}>Apply Preset</Btn>
          <Btn type="button" variant="ghost" className="!px-2.5 !py-1 text-[12px]" onClick={() => void openImageQuote(query.sel)}>Generate Looks</Btn>
          <Btn type="button" variant="ghost" className="!px-2.5 !py-1 text-[12px]" onClick={() => void runReview("look")}>Review Looks</Btn>
          <Btn type="button" variant="ghost" className="!px-2.5 !py-1 text-[12px]" onClick={() => update({ panel: "assign" })}>Assign Motion</Btn>
          <Btn type="button" variant="ghost" className="!px-2.5 !py-1 text-[12px]" onClick={() => void openMotionQuote(query.sel)}>Generate Videos</Btn>
          <Btn type="button" variant="ghost" className="!px-2.5 !py-1 text-[12px]" onClick={() => void runReview("video")}>Review Videos</Btn>
          <Btn type="button" variant="ghost" className="!px-2.5 !py-1 text-[12px]" onClick={() => void downloadApproved()}>Download Approved</Btn>
          <button type="button" className="px-1 text-[12px] font-semibold text-[#6B7280]" onClick={() => update({ sel: [] })}>Clear</button>
        </div>
      ) : null}
      {hiddenSelected.length ? (
        <p className="mb-3 text-[12px] text-[#C2410C]">{hiddenSelected.length} selected look{hiddenSelected.length === 1 ? " is" : "s are"} hidden by this filter. <button type="button" className="font-semibold underline" onClick={() => update({ sel: [] })}>Clear selection</button></p>
      ) : null}
      {notice ? <p className="mb-3 text-[12px] text-[#374151]">{notice}</p> : null}
      {error ? <p className="mb-3 text-[12px] text-[#B91C1C]">{error}</p> : null}

      <div className={query.drawer ? "lg:grid lg:grid-cols-[minmax(0,1fr)_32rem] lg:items-start lg:gap-4" : ""}>
        <div ref={boardRef} className={cn("grid w-full min-w-0 max-w-full gap-3", wide ? "grid-cols-2" : "grid-cols-1")}>
          {projects.map((project) => {
            const preview = project.renders.find((row) => row.primary && showable(row.url))?.url || project.approvedStillUrl || project.stillUrl || project.videoUrl;
            const approved = project.renders.filter((row) => row.decision === "approved").length;
            const note = attentionLabel(project.attention);
            return (
              <Surface key={project.id} className={cn("flex min-w-0 max-w-full items-start gap-3 p-4 max-sm:flex-wrap max-sm:gap-2", tight && "flex-wrap")}>
                <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-[#652DFF]" checked={query.sel.includes(project.id)} aria-label={`Select ${project.name}`} onChange={() => toggleSelected(project.id)} />
                <div className="hidden h-0 basis-full max-sm:order-last max-sm:block" aria-hidden />
                <div className="relative grid w-max shrink-0 grid-cols-[2.5rem_2.5rem] gap-1 max-sm:order-last" aria-label={`Products in ${project.name}`}>
                  {Array.from({ length: 4 }).map((_, index) => {
                    const item = project.items[index];
                    return (
                      <div key={item?.id || `empty-${index}`} className="relative h-10 w-10">
                        {item && showable(item.imageUrl) ? (
                          <button type="button" className="h-10 w-10 overflow-hidden rounded-md" onClick={(e) => openDrawer(project.id, "products", e.currentTarget)}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={thumbSrc(item.imageUrl, 96)} alt="" className="h-10 w-10 object-cover" />
                          </button>
                        ) : (
                          <button type="button" className={cn("grid h-10 w-10 place-items-center rounded-md text-[10px] font-semibold uppercase", item ? "bg-[#EEF1F6] text-[#6B7280]" : "bg-[#F7F8FB] text-[#C5CAD3]")} onClick={(e) => openDrawer(project.id, "products", e.currentTarget)}>
                            {item ? item.slot.slice(0, 3) : "+"}
                          </button>
                        )}
                        {item ? (
                          <button type="button" aria-label={`Remove ${item.title}`} className="absolute -left-1 -top-1 grid h-3.5 w-3.5 place-items-center rounded-full bg-white text-[10px] font-bold leading-none text-[#B91C1C] ring-1 ring-[#E6E8EE]" onClick={() => void removeLookItem(project, item.id)}>×</button>
                        ) : null}
                      </div>
                    );
                  })}
                  <span className="absolute -bottom-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full bg-white px-1 text-[10px] font-semibold text-[#374151] ring-1 ring-[#E6E8EE]">{project.items.length}</span>
                </div>
                <ArrowRight size={14} className="mt-8 shrink-0 text-[#C5CAD3] max-sm:hidden" aria-hidden />
                <button type="button" className="grid h-[128px] w-[72px] shrink-0 place-items-center overflow-hidden rounded-xl bg-[#1B2130]" aria-label={`Images for ${project.name}`} onClick={(e) => openDrawer(project.id, "images", e.currentTarget)}>
                  {showable(preview) ? (
                    preview!.endsWith(".mp4") ? <video src={preview} muted className="h-full w-full object-cover" /> : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumbSrc(preview!, 240)} alt="" className="h-full w-full object-cover" />
                    )
                  ) : <UserRound size={18} className="text-white/55" />}
                </button>
                <div className="min-w-0 flex-1">
                  <button type="button" className="line-clamp-1 text-left text-[15px] font-semibold tracking-tight" onClick={(e) => openDrawer(project.id, nextSection(project), e.currentTarget)}>{project.name}</button>
                  <p className="mt-1 truncate text-[12px] text-[#6B7280]">{project.items.length} item{project.items.length === 1 ? "" : "s"} · {styleLabel(project.style)}</p>
                  <p className="mt-1 line-clamp-2 text-[12px] leading-snug text-[#374151]">{stepHint(project)}</p>
                  <p className="mt-1 truncate text-[11px] text-[#9CA3AF]">{project.market || "Indonesia"} · {whenLabel(project.updatedAt)}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <button type="button" className="rounded-full bg-[#F3F0FF] px-2 py-0.5 text-[11px] font-semibold text-[#652DFF]" onClick={(e) => openDrawer(project.id, "motion", e.currentTarget)}>
                      {project.motions.length} motion
                    </button>
                    <span className="text-[11px] text-[#9CA3AF]">{approved} approved</span>
                  </div>
                  {note ? <p className="mt-1 truncate text-[11px] text-[#C2410C]" title={project.attention}>{note}</p> : null}
                </div>
                <div className="flex w-full min-w-0 max-w-full basis-full flex-row flex-wrap items-center justify-between gap-2 sm:w-auto sm:max-w-none sm:basis-auto sm:shrink-0 sm:flex-nowrap sm:flex-col sm:items-end">
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", pillClass(project.stage))}>{stageText(project.stage)}</span>
                  <Btn type="button" className="!px-2.5 !py-1 text-[12px]" onClick={(e) => {
                    if (project.stage === "COMPLETED") void downloadApproved([project.id]);
                    else if (project.stage === "AWAITING_LOOK_APPROVAL") void runReview("look", [project.id]);
                    else if (project.stage === "PENDING_REVIEW") void runReview("video", [project.id]);
                    else if (project.stage === "READY_FOR_MOTION" && project.motions.length) void openMotionQuote([project.id]);
                    else openDrawer(project.id, nextSection(project), e.currentTarget);
                  }}>{actionLabel(project)}</Btn>
                  {project.stage === "GENERATING_LOOK" ? (
                    <button type="button" className="text-[12px] font-semibold text-[#652DFF]" onClick={(e) => openDrawer(project.id, "look", e.currentTarget)}>Change the scene</button>
                  ) : null}
                  <details className="relative">
                    <summary className="grid h-7 w-7 cursor-pointer list-none place-items-center rounded-lg text-[#6B7280] hover:bg-[#F3F4F8] [&::-webkit-details-marker]:hidden" aria-label={`More actions for ${project.name}`}>
                      <MoreHorizontal size={16} />
                    </summary>
                    <div className="absolute right-0 z-10 mt-1 grid w-40 gap-0.5 rounded-xl border border-[#E6E8EE] bg-white p-1 text-left text-[12px] shadow-lg">
                      <button type="button" className="rounded-lg px-2 py-1.5 text-left hover:bg-[#F3F4F8]" onClick={() => openDrawer(project.id, "history")}>History</button>
                      <button type="button" className="rounded-lg px-2 py-1.5 text-left hover:bg-[#F3F4F8]" onClick={() => void post({ op: "duplicate", projectId: project.id }).then(() => reload())}>Duplicate look</button>
                      <Link className="rounded-lg px-2 py-1.5 hover:bg-[#F3F4F8]" href={`/create/ugc-generator/fashion/${project.id}`}>Open full details</Link>
                      <button type="button" className="rounded-lg px-2 py-1.5 text-left text-[#B91C1C] hover:bg-red-50" onClick={() => void post({ op: "archive", projectId: project.id }).then(() => reload())}>Archive</button>
                    </div>
                  </details>
                </div>
              </Surface>
            );
          })}
          {!projects.length ? (
            <Surface className="col-span-full py-16 text-center">
              <p className="text-sm font-semibold">No looks on this filter</p>
              <p className="mt-1 text-[12px] text-[#6B7280]">Create a look or batch drafts. Generation stays on the board.</p>
            </Surface>
          ) : null}
        </div>

        {detail && query.drawer ? (
          <aside className="mt-4 max-h-[calc(100vh-7rem)] overflow-y-auto rounded-2xl border border-[#E6E8EE] bg-white p-4 lg:sticky lg:top-3 lg:mt-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <input
                  aria-label="Look name"
                  className={inputClass + " mt-0 text-sm font-black"}
                  value={detail.name}
                  onChange={(e) => setDetail({ ...detail, name: e.target.value })}
                  onBlur={(e) => {
                    const name = e.currentTarget.value.trim();
                    if (name) void saveDetail({ name });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                />
                <p className="mt-1 text-[11px] text-[#6B7280]">Revision {detail.revision} · {stageText(detail.stage)} · Saved</p>
                <p className="mt-1 text-[12px] leading-snug text-[#374151]">{stepHint(detail)}</p>
                {drawing ? (
                  <div className="mt-2 flex items-start gap-2 rounded-xl border border-[#DDD6FE] bg-[#F5F3FF] px-2 py-1.5 text-[12px] leading-snug text-[#5B21B6]">
                    <span className="mt-1 inline-block h-2 w-2 shrink-0 animate-pulse rounded-full bg-[#652DFF]" />
                    <span>Drawing revision {detail.revision} now. Qwen is working on this PC. The new photo shows up under Images. This takes a few minutes.</span>
                  </div>
                ) : null}
              </div>
              <button type="button" className="rounded-lg border border-[#E6E8EE] px-2 py-1 text-[12px] font-semibold" onClick={closeDrawer}>Close</button>
            </div>
            <div className="mt-3 flex gap-1 overflow-x-auto">
              {["products", "look", "images", "motion", "review", "history"].map((section) => (
                <button key={section} type="button" className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize", query.section === section ? "bg-[#111827] text-white" : "bg-[#F3F4F8]")} onClick={() => update({ section })}>{section}</button>
              ))}
            </div>
            <div className="mt-4 text-[13px]">
              {query.section === "products" ? (
                <div className="grid gap-2">
                  <p className="text-[12px] text-[#6B7280]">{detail.items.length}/4 products. Remove one, then paste the replacement link. A fifth product is refused.</p>
                  <div className="flex gap-2">
                    <input className={inputClass + " mt-0"} placeholder="Paste a product link" value={productUrl} onChange={(e) => setProductUrl(e.target.value)} />
                    <select className={inputClass + " mt-0 w-28"} value={slot} onChange={(e) => setSlot(e.target.value)}>{SLOTS.map((row) => <option key={row}>{row}</option>)}</select>
                  </div>
                  {photoChoices ? (
                    <div className="rounded-xl border border-[#FDE68A] bg-[#FFFBEB] p-2">
                      <p className="text-[12px] font-semibold">No pack shot stood out. Pick the photo that shows the whole product.</p>
                      <div className="mt-2 flex gap-2 overflow-x-auto">
                        {photoChoices.choices.map((choice) => (
                          <button key={choice.url} type="button" className="shrink-0" onClick={() => void addLookItem({ title: photoChoices.title, sourceUrl: photoChoices.sourceUrl, productId: photoChoices.productId, imageUrl: choice.url, set: choice.set })}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={thumbSrc(choice.url, 120)} alt="" className="h-16 w-12 rounded-md object-cover" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Btn type="button" disabled={detail.items.length >= 4} onClick={() => void importProduct()}>Add product</Btn>
                    {detail.stage === "DRAFT" && detail.items.length > 0 ? <Btn type="button" variant="ghost" onClick={() => update({ section: "look" })}>Choose the scene</Btn> : null}
                    {detail.stage === "GENERATING_LOOK" ? <Btn type="button" variant="ghost" onClick={() => update({ section: "look" })}>Change the scene</Btn> : null}
                  </div>
                  {detail.conflicts?.length ? <p className="text-[12px] text-[#C2410C]">{detail.conflicts.join(" ")}</p> : null}
                  <ul className="grid gap-2">
                    {detail.items.map((item) => (
                      <li key={item.id} className="flex items-center gap-2 rounded-xl border border-[#E6E8EE] p-2">
                        {showable(item.imageUrl) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumbSrc(item.imageUrl, 80)} alt="" className="h-10 w-10 rounded-md object-cover" />
                        ) : <span className="grid h-10 w-10 place-items-center rounded-md bg-[#F3F4F8] text-[10px]">URL</span>}
                        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold">{item.title}<span className="block font-normal text-[#9CA3AF]">{item.slot}</span>{item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="block truncate font-normal text-[#652DFF]">{item.sourceUrl}</a> : null}</span>
                        <button type="button" className="shrink-0 rounded-md border border-[#FECACA] px-2 py-1 text-[11px] font-semibold text-[#B91C1C]" onClick={() => void saveDetail({ items: detail.items.filter((row) => row.id !== item.id) })}>Remove</button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {query.section === "look" ? (
                <div className="grid gap-2">
                  <label className="text-[11px] font-semibold text-[#6B7280]">Scene
                    <select className={inputClass} value={String(lookDraft.style || detail.style)} onChange={(e) => setLookDraft({ ...lookDraft, style: e.target.value })}>{STYLES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-[11px] font-semibold text-[#6B7280]">Framing
                      <select className={inputClass} value={String(lookDraft.framing || detail.framing || "full-body")} onChange={(e) => setLookDraft({ ...lookDraft, framing: e.target.value })}>
                        <option value="full-body">Full body</option>
                        <option value="three-quarter">3/4</option>
                        <option value="waist-up">Waist up</option>
                      </select>
                    </label>
                    <label className="text-[11px] font-semibold text-[#6B7280]">Lighting
                      <select className={inputClass} value={String(lookDraft.lighting || detail.lighting || "natural-daylight")} onChange={(e) => setLookDraft({ ...lookDraft, lighting: e.target.value })}>
                        <option value="natural-daylight">Natural daylight</option>
                        <option value="soft-indoor">Soft indoor</option>
                        <option value="evening">Evening</option>
                      </select>
                    </label>
                  </div>
                  <label className="text-[11px] font-semibold text-[#6B7280]">Market
                    <select className={inputClass} value={String(lookDraft.market || detail.market)} onChange={(e) => setLookDraft({ ...lookDraft, market: e.target.value })}>{MARKETS.map((row) => <option key={row}>{row}</option>)}</select>
                  </label>
                  <label className="text-[11px] font-semibold text-[#6B7280]">Additional instructions
                    <textarea className={inputClass} rows={2} value={String(lookDraft.instructions ?? detail.instructions ?? "")} onChange={(e) => setLookDraft({ ...lookDraft, instructions: e.target.value })} />
                  </label>
                  <label className="text-[11px] font-semibold text-[#6B7280]">Candidates
                    <select className={inputClass} value={String(lookDraft.candidateCount || detail.candidateCount || 2)} onChange={(e) => setLookDraft({ ...lookDraft, candidateCount: Number(e.target.value) })}>
                      {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                  <label className="text-[11px] font-semibold text-[#6B7280]">Prompt writer
                    <select className={inputClass} value={detail.promptModel || PROMPT_MODELS[0][0]} onChange={(e) => void saveDetail({ promptModel: e.target.value })}>
                      {PROMPT_MODELS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
                    </select>
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Btn type="button" variant="ghost" disabled={rewriteBusy} onClick={() => void rewritePrompt()}>{rewriteBusy ? "Rewriting…" : "Rewrite prompt"}</Btn>
                    {rewriteBusy ? <p className="text-[12px] text-[#6B7280]">About a minute. The box below changes when it finishes.</p> : null}
                  </div>
                  {error ? <p className="text-[12px] text-[#B91C1C]">{error}</p> : null}
                  {notice ? <p className="text-[12px] text-[#047857]">{notice}</p> : null}
                  <label className="text-[11px] font-semibold text-[#6B7280]">Prompt sent to Qwen
                    <textarea readOnly rows={6} className={inputClass + " leading-relaxed"} value={detail.prompt} />
                  </label>
                  <div className="flex gap-2">
                    <Btn type="button" variant="ghost" onClick={() => void saveDetail({ style: lookDraft.style, framing: lookDraft.framing, lighting: lookDraft.lighting, market: lookDraft.market, instructions: lookDraft.instructions, candidateCount: lookDraft.candidateCount })}>Save look</Btn>
                    <Btn type="button" onClick={() => void openImageQuote([detail.id])}>Queue look</Btn>
                  </div>
                  <p className="text-[11px] text-[#6B7280]">Rewrite prompt uses the NVIDIA model you picked. Queue look draws the stills on local Qwen Image Edit 2.1. It does not make a video.</p>
                </div>
              ) : null}
              {query.section === "images" ? (
                <div className="grid gap-2">
                  {detail.stage === "GENERATING_LOOK" ? <Btn type="button" variant="ghost" onClick={() => update({ section: "look" })}>Change the scene</Btn> : null}
                  {error ? <p className="text-[12px] text-[#B91C1C]">{error}</p> : null}
                  {reviseBusy ? <p className="text-[12px] font-semibold text-[#5B21B6]">Saving the change…</p> : null}
                  {detail.attention ? (
                    <div className="rounded-xl border border-[#FDE68A] bg-[#FFFBEB] p-2 text-[12px]">
                      <p className="font-semibold">{detail.stage === "GENERATING_LOOK" ? `Revision ${detail.revision} is drawing.` : `Revision ${detail.revision} is a draft.`}</p>
                      <p className="mt-1">Change saved: {detail.attention}</p>
                      {detail.stage === "DRAFT" ? <Btn type="button" className="mt-2 !px-2.5 !py-1 text-[12px]" onClick={() => void openImageQuote([detail.id])}>Queue the new still</Btn> : <p className="mt-1 text-[#6B7280]">The new rows are the ones marked Queued still. Older photos stay underneath.</p>}
                    </div>
                  ) : null}
                  <p className="text-[12px] leading-snug text-[#6B7280]">{detail.stage === "GENERATING_LOOK" ? "Qwen Image Edit 2.1 draws these stills on this PC. Purple rows are the ones drawing now. Older photos stay underneath." : "Approve the photo you want to keep. Revise sends that photo back. Then queue the look to draw the next one."}</p>
                  {detail.candidates.some((row) => row.status === "ready" && row.url) ? (
                    <label className="text-[11px] font-semibold text-[#6B7280]">What should change
                      <textarea className={inputClass} rows={2} value={reviseNote} placeholder="Closer on the bag, keep the white chair" onChange={(e) => setReviseNote(e.target.value)} />
                    </label>
                  ) : null}
                  {[...detail.candidates].sort((a, b) => b.revision - a.revision).map((candidate, index) => (
                    <div key={candidate.id} className="rounded-xl border border-[#E6E8EE] p-2 text-[12px]">
                      {showable(candidate.url) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={candidate.url} alt="" className="mb-2 aspect-[9/16] w-full rounded-lg object-cover" />
                      ) : candidate.status === "queued" ? (
                        <div className="mb-2 grid aspect-[9/16] w-full place-items-center rounded-lg bg-[#F5F3FF] text-center text-[12px] font-semibold text-[#5B21B6]">
                          <span><span className="mx-auto mb-2 block h-2 w-2 animate-pulse rounded-full bg-[#652DFF]" />Drawing this still</span>
                        </div>
                      ) : null}
                      <p className="font-semibold">{candidate.status === "queued" && candidate.source === "planned" ? `Queued still ${index + 1}` : candidate.source === "nvidia" ? "NVIDIA still" : `${candidate.source} · ${candidate.status}`}</p>
                      <p className="text-[#6B7280]">{candidate.status === "queued" && candidate.source === "planned" ? `Revision ${candidate.revision}. Still drawing.` : candidate.decision === "revision" ? `Revision ${candidate.revision}. Sent back. ${candidate.reviewNote || ""}` : `Revision ${candidate.revision}. ${candidate.decision === "approved" ? "Approved" : "Not chosen yet"}`}</p>
                      {candidate.blocked ? <p className="text-[#C2410C]">{candidate.blocked}</p> : null}
                      {candidate.status === "ready" && candidate.url && candidate.decision !== "approved" && candidate.decision !== "revision" ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Btn type="button" className="!px-2.5 !py-1 text-[12px]" onClick={() => void post({ op: "approve-still", projectId: detail.id, candidateId: candidate.id, expectedRevision: detail.revision }).then(async (result) => {
                            if (!result.ok) { setError(result.json.error || "Could not approve this still."); return; }
                            if (result.json.project) { setDetail(result.json.project); setLookDraft(result.json.project); }
                            setNotice("Still approved. Next: add a motion reference.");
                            await reload();
                          })}>Approve</Btn>
                          <Btn type="button" variant="ghost" className="!px-2.5 !py-1 text-[12px]" disabled={reviseBusy === candidate.id} onClick={() => {
                            const note = reviseNote.trim();
                            if (!note) { setError("Write what should change, then click Revise."); return; }
                            setError("");
                            setReviseBusy(candidate.id);
                            void post({ op: "revise-still", projectId: detail.id, candidateId: candidate.id, note, expectedRevision: detail.revision }).then(async (result) => {
                              if (!result.ok) {
                                if (result.json.project) { setDetail(result.json.project); setLookDraft(result.json.project); }
                                setError(result.json.code === "REVISION" ? "This look already moved on. The photos above are the current ones." : (result.json.error || "Could not revise this still."));
                                return;
                              }
                              if (result.json.project) { setDetail(result.json.project); setLookDraft(result.json.project); }
                              setReviseNote("");
                              setNotice(`Change saved. Revision ${result.json.project?.revision || ""} is ready to queue.`);
                              await reload();
                            }).finally(() => setReviseBusy(""));
                          }}>{reviseBusy === candidate.id ? "Saving…" : "Revise"}</Btn>
                        </div>
                      ) : null}
                    </div>
                  ))}
                  <Btn type="button" variant="ghost" onClick={() => void runReview("look", [detail.id])}>Review this look</Btn>
                  <details className="text-[11px] text-[#6B7280]">
                    <summary className="cursor-pointer">Acceptance fixture</summary>
                    <button type="button" className="mt-1 underline" onClick={() => void post({ op: "seed-fixture", projectId: detail.id }).then(() => { setNotice("Fixture stills marked ready. These are not Qwen renders."); return reload(); })}>Mark fixture stills ready</button>
                  </details>
                </div>
              ) : null}
              {query.section === "motion" ? (
                <div className="grid gap-2">
                  <p className="text-[12px] text-[#6B7280]">Motion needs an approved still and a reference video. Empty references are refused.</p>
                  {(detail.motions || []).map((motion) => (
                    <p key={motion.id} className="truncate text-[12px]">{motion.label}: {motion.assetUrl} · {motion.trimIn}–{motion.trimOut || "end"}</p>
                  ))}
                  <Btn type="button" variant="ghost" onClick={() => update({ panel: "assign", sel: Array.from(new Set([...query.sel, detail.id])) })}>Assign Motion</Btn>
                  <Btn type="button" disabled={!detail.approvedStillId} onClick={() => void openMotionQuote([detail.id])}>Generate Video</Btn>
                </div>
              ) : null}
              {query.section === "review" || query.section === "history" ? (
                <div className="grid gap-2 text-[12px]">
                  <p>{detail.renders.length} video targets. Approved: {detail.renders.filter((row) => row.decision === "approved").length}.</p>
                  {detail.renders.map((render) => (
                    <div key={render.id} className="rounded-xl border border-[#E6E8EE] p-2">
                      <p className="font-semibold">{render.source} · {render.status} · {render.decision}{render.primary ? " · primary preview" : ""}</p>
                      {render.status === "ready" && render.decision === "pending" ? (
                        <button type="button" className="mt-1 font-semibold text-[#652DFF]" onClick={() => void post({ op: "decide-render", projectId: detail.id, renderId: render.id, decision: "approved" }).then(() => reload())}>Approve this render</button>
                      ) : null}
                    </div>
                  ))}
                  <p className="text-[#6B7280]">Older still revisions stay listed above under Images. Primary preview does not drop the other approved renders.</p>
                  <button type="button" className="text-left text-[11px] underline" onClick={() => void post({ op: "seed-fixture-renders", projectId: detail.id, failOne: true }).then(() => { setNotice("Fixture video rows updated. Failed row is not a provider failure."); return reload(); })}>Mark fixture videos, fail one</button>
                  <Link className="font-semibold text-[#652DFF]" href={`/create/ugc-generator/fashion/${detail.id}`}>Open full details</Link>
                </div>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>

      {query.panel === "batch" ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/30 p-4">
          <Surface className="max-h-[90vh] w-full max-w-xl overflow-y-auto">
            <div className="flex items-center justify-between"><p className="font-black">Batch Create</p><button type="button" onClick={() => update({ panel: "" })}>Close</button></div>
            <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
              {(["one-url-per-look", "one-look", "group", "csv"] as const).map((mode) => (
                <button key={mode} type="button" className={cn("rounded-full px-2 py-1 font-semibold", batchMode === mode ? "bg-[#111827] text-white" : "bg-[#F3F4F8]")} onClick={() => setBatchMode(mode)}>{mode}</button>
              ))}
            </div>
            <p className="mt-2 text-[12px] text-[#6B7280]">{batchMode === "one-url-per-look" ? "Each URL becomes its own look." : batchMode === "one-look" ? "These URLs become one look, maximum 4." : batchMode === "group" ? "One line per look: Name | url url" : "CSV: look_key, look_name, product_1_source."}</p>
            <textarea className={inputClass} rows={8} value={batchText} onChange={(e) => setBatchText(e.target.value)} />
            {batchMode === "csv" ? <a className="text-[12px] font-semibold text-[#652DFF]" href="/api/ugc-fashion/batch?template=csv">Download CSV template</a> : null}
            {batchPreview ? <pre className="mt-2 max-h-40 overflow-auto text-[11px]">{batchPreview}</pre> : null}
            <div className="mt-3 flex gap-2">
              {batchMode === "csv" ? <Btn type="button" variant="ghost" onClick={() => void post({ op: "preview-csv", text: batchText }).then((result) => setBatchPreview(JSON.stringify(result.json, null, 2)))}>Preview</Btn> : null}
              <Btn type="button" onClick={() => void submitBatch()}>Create drafts</Btn>
            </div>
          </Surface>
        </div>
      ) : null}

      {query.panel === "preset" ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/30 p-4">
          <Surface className="w-full max-w-lg">
            <div className="flex items-center justify-between"><p className="font-black">Apply Preset</p><button type="button" onClick={() => update({ panel: "" })}>Close</button></div>
            <select className={inputClass} value={presetId} onChange={(e) => setPresetId(e.target.value)}>{presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select>
            <div className="mt-2 grid gap-1 text-[12px]">
              {["market", "style", "framing", "lighting", "gender", "candidateCount", "instructions"].map((field) => (
                <label key={field} className="flex items-center gap-2"><input type="checkbox" checked={presetFields.includes(field)} onChange={() => setPresetFields((cur) => cur.includes(field) ? cur.filter((row) => row !== field) : [...cur, field])} />{field}</label>
              ))}
              <label className="flex items-center gap-2"><input type="checkbox" checked={replaceOverrides} onChange={(e) => setReplaceOverrides(e.target.checked)} />Replace per-look overrides</label>
            </div>
            {presetPreview ? <pre className="mt-2 max-h-40 overflow-auto text-[11px]">{presetPreview}</pre> : null}
            <div className="mt-3 flex gap-2">
              <Btn type="button" variant="ghost" onClick={() => void post({ op: "preview-preset", projectIds: query.sel, presetId, fields: presetFields, replaceOverrides }).then((result) => setPresetPreview(JSON.stringify(result.json, null, 2)))}>Preview</Btn>
              <Btn type="button" onClick={() => void post({ op: "apply-preset", projectIds: query.sel, presetId, fields: presetFields, replaceOverrides }).then((result) => { setNotice(`Preset applied. Approval cleared on ${result.json.approvalLoss || 0} looks.`); update({ panel: "" }); return reload(); })}>Apply</Btn>
            </div>
          </Surface>
        </div>
      ) : null}

      {query.panel === "assign" ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/30 p-4">
          <Surface className="max-h-[90vh] w-full max-w-lg overflow-y-auto">
            <div className="flex items-center justify-between"><p className="font-black">Assign Motion</p><button type="button" onClick={() => update({ panel: "" })}>Close</button></div>
            <div className="mt-2 flex gap-2 text-[12px]">
              {(["same", "multiple", "map"] as const).map((mode) => <button key={mode} type="button" className={cn("rounded-full px-2 py-1 font-semibold", motionMode === mode ? "bg-[#111827] text-white" : "bg-[#F3F4F8]")} onClick={() => setMotionMode(mode)}>{mode === "same" ? "Same motion" : mode === "multiple" ? "Multiple per look" : "Map per look"}</button>)}
            </div>
            <p className="mt-2 text-[12px] text-[#6B7280]">Paste a reference video URL. Assignment does not render video. Generate Videos still waits for one approved still.</p>
            {motionRows.map((row, index) => (
              <div key={row.label} className="mt-2 grid grid-cols-[1fr_4rem_4rem] gap-2">
                <input className={inputClass + " mt-0"} placeholder={`${row.label} URL`} value={row.assetUrl} onChange={(e) => setMotionRows((cur) => cur.map((item, i) => i === index ? { ...item, assetUrl: e.target.value } : item))} />
                <input className={inputClass + " mt-0"} type="number" aria-label="Trim in" value={row.trimIn} onChange={(e) => setMotionRows((cur) => cur.map((item, i) => i === index ? { ...item, trimIn: Number(e.target.value) } : item))} />
                <input className={inputClass + " mt-0"} type="number" aria-label="Trim out" value={row.trimOut} onChange={(e) => setMotionRows((cur) => cur.map((item, i) => i === index ? { ...item, trimOut: Number(e.target.value) } : item))} />
              </div>
            ))}
            <Btn className="mt-3" type="button" onClick={() => {
              const ids = query.sel.length ? query.sel : detail ? [detail.id] : [];
              const motions = motionRows.filter((row) => row.assetUrl.trim());
              const body = motionMode === "map"
                ? { op: "assign-motion-bulk", mode: "map", map: ids.map((projectId) => ({ projectId, motions })) }
                : { op: "assign-motion-bulk", projectIds: ids, mode: motionMode, motions };
              void post(body).then((result) => { setNotice(`Assigned ${result.json.pairs?.length || 0} references. Skipped ${result.json.skipped?.length || 0}.`); update({ panel: "" }); return reload(); });
            }}>Save assignment</Btn>
          </Surface>
        </div>
      ) : null}

      {query.panel === "quote" && quote ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/30 p-4">
          <Surface className="w-full max-w-lg">
            <p className="font-black">{quote.kind === "image" ? "Queue this look" : "Queue videos"}</p>
            <p className="mt-2 text-[13px]">{quote.note}</p>
            <p className="mt-2 text-[13px]">Planned stills {quote.quote.plannedCandidates}. Planned videos {quote.quote.plannedVideos}. Provider-ready photos {quote.quote.providerReady}. Skipped {quote.quote.skipped.length}.</p>
            <p className="mt-1 text-[12px] text-[#6B7280]">Queue sends each still to local Qwen Image Edit 2.1. Video stays off. The quote expires {new Date(quote.quote.expiresAt).toLocaleTimeString()}.</p>
            {quote.quote.skipped.length ? <ul className="mt-2 max-h-32 overflow-auto text-[12px] text-[#C2410C]">{quote.quote.skipped.slice(0, 8).map((row) => <li key={row.projectId}>{row.reason}</li>)}</ul> : null}
            <div className="mt-3 flex gap-2">
              <Btn type="button" disabled={(quote.kind === "image" ? quote.quote.plannedCandidates : quote.quote.plannedVideos) < 1} onClick={() => void confirmQuote()}>
                Queue {quote.kind === "image" ? quote.quote.plannedCandidates : quote.quote.plannedVideos}
              </Btn>
              <Btn type="button" variant="ghost" onClick={() => { setQuote(null); update({ panel: "" }); }}>Cancel</Btn>
            </div>
          </Surface>
        </div>
      ) : null}

      {query.panel === "activity" ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/30 p-4">
          <Surface className="max-h-[90vh] w-full max-w-lg overflow-y-auto">
            <div className="flex items-center justify-between"><p className="font-black">Batch activity</p><button type="button" onClick={() => update({ panel: "" })}>Close</button></div>
            <p className="mt-1 text-[12px] text-[#6B7280]">Image queues draw on local Qwen Image Edit 2.1. Video queues stay off.</p>
            <ul className="mt-3 grid gap-2">
              {batches.slice(0, 8).map((batch) => (
                <li key={batch.id} className="rounded-xl border border-[#E6E8EE] p-2 text-[12px]">
                  <p className="font-semibold">{batch.kind} · {batch.state}</p>
                  <p>Stills {batch.plannedCandidates} · videos {batch.plannedVideos} · queued {batch.queued} · stopped {batch.stopped} · skipped {batch.skipped}</p>
                  <p className="text-[#6B7280]">{batch.note}</p>
                  {batch.queued ? <button type="button" className="mt-1 font-semibold text-[#B91C1C]" onClick={() => void post({ op: "stop-remaining", batchId: batch.id }).then((result) => { setNotice(`Stopped ${result.json.stopped || 0} undispatched targets.`); return reload(); })}>Stop remaining</button> : null}
                </li>
              ))}
            </ul>
          </Surface>
        </div>
      ) : null}

      {review ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4">
          <Surface className="max-h-[92vh] w-full max-w-3xl overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">{review.queue.kind === "look" ? "Review look" : "Review video"}</p>
                <p className="text-lg font-black">{review.queue.cursor + 1 > review.queue.subjects.length ? "Queue complete" : `${review.queue.cursor + 1} of ${review.queue.subjects.length}`}</p>
              </div>
              <button type="button" className="rounded-lg border px-2 py-1 text-[12px] font-semibold" onClick={() => { update({ review: "", sy: scrollRef.current }); restoreBoard(); }}>Close</button>
            </div>
            {review.project ? (
              <div className="mt-3 grid gap-3 md:grid-cols-[16rem_minmax(0,1fr)]">
                <div className="rounded-xl bg-[#111827] p-3 text-white">
                  <p className="text-sm font-semibold">{review.project.name}</p>
                  <p className="mt-1 text-[11px] text-white/70">{review.project.items.map((item) => item.title).join(", ") || "No products"}</p>
                  {review.queue.kind === "video" ? <p className="mt-2 text-[11px]">Approved still required. Reference stays attached to the render. Fixture rows have no video file.</p> : null}
                </div>
                <div>
                  {review.queue.kind === "look" ? (
                    <div className="grid gap-2">
                      {review.project.candidates.filter((row) => row.revision === review.project!.revision).map((candidate) => (
                        <label key={candidate.id} className={cn("flex items-center gap-2 rounded-xl border p-2 text-[12px]", candidateId === candidate.id && "border-[#652DFF]")}>
                          <input type="radio" name="candidate" checked={candidateId === candidate.id} disabled={candidate.status !== "ready"} onChange={() => { setCandidateId(candidate.id); setChecks([false, false, false, false]); }} />
                          <span>{candidate.source} · {candidate.status}{candidate.blocked ? ` · ${candidate.blocked}` : ""}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[12px]">Render {review.queue.subjects[review.queue.cursor]?.renderId}</p>
                  )}
                  <div className="mt-3 grid gap-1 text-[12px]">
                    {CHECKS.map((label, index) => (
                      <label key={label} className="flex items-center gap-2"><input type="checkbox" checked={checks[index]} onChange={() => setChecks((cur) => cur.map((value, i) => i === index ? !value : value))} />{label}</label>
                    ))}
                  </div>
                  <textarea className={inputClass} rows={2} placeholder="Reason if this needs revision" value={revisionNote} onChange={(e) => setRevisionNote(e.target.value)} />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Btn type="button" disabled={!checks.every(Boolean) || (review.queue.kind === "look" && !candidateId)} onClick={() => void decide("approve")}>Approve & Next</Btn>
                    <Btn type="button" variant="ghost" onClick={() => void decide("revision")}>Needs Revision & Next</Btn>
                    <Btn type="button" variant="ghost" onClick={() => void decide("skip")}>Skip</Btn>
                    <Btn type="button" variant="ghost" onClick={() => void post({ op: "review-move", queueId: review.queue.id, delta: -1 }).then(() => fetch(`/api/ugc-fashion/batch?queue=${review.queue.id}`).then((res) => res.json()).then(setReview))}>Previous</Btn>
                  </div>
                </div>
              </div>
            ) : <p className="mt-4 text-[13px] text-[#6B7280]">This queue has no further ready results. Planned provider jobs are not approved from here.</p>}
          </Surface>
        </div>
      ) : null}
    </div>
  );
}
