"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Btn, inputClass, Surface } from "@/components/ui";
import { cn } from "@/lib/cn";
import { thumbSrc } from "@/lib/media-url";

type Item = { id: string; title: string; sourceUrl: string; imageUrl: string; slot: string; productId?: string };
type Project = {
  id: string;
  name: string;
  stage: string;
  attention?: string;
  items: Item[];
  gender: "woman" | "man" | "random";
  age: string;
  market: string;
  style: string;
  instructions: string;
  prompt: string;
  stillUrl?: string;
  approvedStillUrl?: string;
  motionUrl?: string;
  videoUrl?: string;
  motionEngine?: string;
  conflicts?: string[];
};

const SLOTS = ["tops", "bottoms", "set", "one-piece", "outerwear", "footwear", "headwear", "eyewear", "bag", "jewelry", "other"];
const STYLES = [
  ["bedroom", "Bedroom outfit check"],
  ["living-room", "Casual living room"],
  ["street", "Streetwear daylight"],
  ["home-fitting", "Clean home fitting"],
  ["fitting-room", "Fitting room"],
];

export default function FashionWorkspace() {
  const params = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [url, setUrl] = useState("");
  const [slot, setSlot] = useState("tops");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [photoChoices, setPhotoChoices] = useState<{ title: string; sourceUrl: string; productId: string; choices: { url: string; set: boolean }[] } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/ugc-fashion/projects/${params.id}`);
    if (!res.ok) return;
    setProject(await res.json());
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!project || (project.stage !== "GENERATING_LOOK" && project.stage !== "IN_PRODUCTION")) return;
    const t = setInterval(() => void load(), 4000);
    return () => clearInterval(t);
  }, [project, load]);

  async function save(patch: Partial<Project>) {
    const res = await fetch(`/api/ugc-fashion/projects/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "save failed");
    setProject(json);
  }

  async function addItem(item: { title: string; sourceUrl: string; imageUrl: string; productId: string; set: boolean }) {
    if (!project) return;
    await save({
      items: [...project.items, { id: crypto.randomUUID(), title: item.title, sourceUrl: item.sourceUrl, imageUrl: item.imageUrl, slot: item.set ? "set" : slot, productId: item.productId }].slice(0, 4),
    });
    setNote(item.set ? "This photo shows the whole set, so the slot is Set." : "");
    setPhotoChoices(null);
    setUrl("");
  }

  async function addUrl() {
    if (!url.trim() || !project) return;
    setBusy("import");
    setError("");
    setPhotoChoices(null);
    try {
      const res = await fetch("/api/commerce/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "import failed");
      const p = json.product;
      const pick = json.fashion as { imageUrl?: string; set?: boolean; choices?: { url: string; set: boolean }[] } | undefined;
      if (!pick?.imageUrl) {
        const choices = (pick?.choices || []).filter((row) => row.url);
        if (!choices.length) throw new Error("No product photo. Re-import after images finish copying.");
        setPhotoChoices({ title: p.title, sourceUrl: p.sourceUrl || url, productId: p.id, choices });
        return;
      }
      await addItem({ title: p.title, sourceUrl: p.sourceUrl || url, imageUrl: pick.imageUrl, productId: p.id, set: Boolean(pick.set) });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function generate(action: "look" | "motion") {
    setBusy(action);
    setError("");
    try {
      const res = await fetch(`/api/ugc-fashion/projects/${params.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "generate failed");
      setProject(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  if (!project) return <div className="p-6 text-sm text-[#6B7280]">Loading look…</div>;

  return (
    <div className="px-4 py-5 md:px-6 md:py-6">
      <Link href="/create/ugc-generator/fashion" className="text-[12px] font-semibold text-[#652DFF]" onClick={(e) => {
        const q = window.sessionStorage.getItem("fashion-board-query");
        if (q) {
          e.preventDefault();
          window.location.href = `/create/ugc-generator/fashion${q}`;
        }
      }}>
        Back to Board
      </Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <input
          className={inputClass + " mt-0 max-w-md text-lg font-black"}
          value={project.name}
          onChange={(e) => setProject({ ...project, name: e.target.value })}
          onBlur={() => void save({ name: project.name })}
        />
        <p className={cn("text-[12px] font-semibold", project.attention ? "text-[#C2410C]" : "text-[#6B7280]")}>
          {project.stage.replaceAll("_", " ")}
          {project.attention ? ` · ${project.attention}` : ""}
        </p>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid gap-3">
          <Surface>
            <p className="text-sm font-semibold">Products · {project.items.length}/4</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <input className={inputClass + " mt-0 min-w-[16rem] flex-1"} placeholder="Amazon or Shopee URL" value={url} onChange={(e) => setUrl(e.target.value)} />
              <select className={inputClass + " mt-0 w-36"} value={slot} onChange={(e) => setSlot(e.target.value)}>
                {SLOTS.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <Btn type="button" disabled={busy === "import" || project.items.length >= 4} onClick={() => void addUrl()}>
                {busy === "import" ? "Importing…" : "Add"}
              </Btn>
            </div>
            {note ? <p className="mt-2 text-[12px] text-[#047857]">{note}</p> : null}
            {photoChoices ? (
              <div className="mt-2 rounded-xl border border-[#FDE68A] bg-[#FFFBEB] p-2">
                <p className="text-[12px] font-semibold">No pack shot stood out. Pick the photo that shows the whole product.</p>
                <div className="mt-2 flex gap-2 overflow-x-auto">
                  {photoChoices.choices.map((choice) => (
                    <button key={choice.url} type="button" className="shrink-0" onClick={() => void addItem({ title: photoChoices.title, sourceUrl: photoChoices.sourceUrl, productId: photoChoices.productId, imageUrl: choice.url, set: choice.set })}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={thumbSrc(choice.url, 120)} alt="" className="h-16 w-12 rounded-md object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <ul className="mt-3 grid gap-2">
              {project.items.map((item) => (
                <li key={item.id} className="flex items-center gap-2 rounded-xl border border-[#E6E8EE] p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumbSrc(item.imageUrl, 80)} alt="" className="h-12 w-12 rounded-md object-cover" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold">{item.title}</p>
                    <p className="text-[11px] text-[#9CA3AF]">{item.slot}</p>
                    {item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="block truncate text-[11px] text-[#652DFF]">{item.sourceUrl}</a> : null}
                  </div>
                  <button
                    type="button"
                    className="text-[12px] font-semibold text-[#B91C1C]"
                    onClick={() => void save({ items: project.items.filter((x) => x.id !== item.id) })}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
            {project.conflicts?.length ? <p className="mt-2 text-[12px] text-[#C2410C]">{project.conflicts.join(" ")}</p> : null}
          </Surface>

          <Surface>
            <p className="text-sm font-semibold">Look</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="text-[11px] font-semibold text-[#6B7280]">
                Gender
                <select className={inputClass} value={project.gender} onChange={(e) => setProject({ ...project, gender: e.target.value as Project["gender"] })} onBlur={() => void save({ gender: project.gender })}>
                  <option value="woman">Woman</option>
                  <option value="man">Man</option>
                  <option value="random">Random</option>
                </select>
              </label>
              <label className="text-[11px] font-semibold text-[#6B7280]">
                Market
                <select className={inputClass} value={project.market} onChange={(e) => setProject({ ...project, market: e.target.value })} onBlur={() => void save({ market: project.market })}>
                  {["Indonesia", "Malaysia", "Singapore", "Thailand", "Japan", "United States"].map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </label>
              <label className="text-[11px] font-semibold text-[#6B7280] sm:col-span-2">
                UGC style
                <select className={inputClass} value={project.style} onChange={(e) => setProject({ ...project, style: e.target.value })} onBlur={() => void save({ style: project.style })}>
                  {STYLES.map(([id, label]) => (
                    <option key={id} value={id}>{label}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="mt-2 block text-[11px] font-semibold text-[#6B7280]">
              Additional instructions
              <textarea className={inputClass} rows={2} value={project.instructions} onChange={(e) => setProject({ ...project, instructions: e.target.value })} onBlur={() => void save({ instructions: project.instructions })} />
            </label>
            <p className="mt-2 text-[11px] leading-relaxed text-[#6B7280]">{project.prompt}</p>
            <div className="mt-3">
              <Btn type="button" disabled={Boolean(busy) || !project.items.length || Boolean(project.conflicts?.length)} onClick={() => void generate("look")}>
                {busy === "look" || project.stage === "GENERATING_LOOK" ? "Generating look…" : "Generate Look"}
              </Btn>
            </div>
            {error ? <p className="mt-2 text-sm text-[#B91C1C]">{error}</p> : null}
          </Surface>

          <Surface>
            <p className="text-sm font-semibold">Motion</p>
            <label className="mt-3 block text-[11px] font-semibold text-[#6B7280]">
              Reference clip URL
              <input className={inputClass} placeholder="https://… reference video" value={project.motionUrl || ""} onChange={(e) => setProject({ ...project, motionUrl: e.target.value })} onBlur={() => void save({ motionUrl: project.motionUrl })} />
            </label>
            <p className="mt-1 text-[11px] text-[#6B7280]">A reference clip is required. This page does not fall back to image-to-video.</p>
            <label className="mt-2 block text-[11px] font-semibold text-[#6B7280]">
              Motion model
              <select className={inputClass} value={project.motionEngine === "kling-2-6" ? "kling-2-6" : "kling-3-0"} onChange={(e) => setProject({ ...project, motionEngine: e.target.value })} onBlur={() => void save({ motionEngine: project.motionEngine })}>
                <option value="kling-3-0">Kling 3.0 motion</option>
                <option value="kling-2-6">Kling 2.6 motion</option>
              </select>
            </label>
            <div className="mt-3">
              <Btn type="button" disabled={Boolean(busy) || !project.approvedStillUrl || !project.motionUrl} onClick={() => void generate("motion")}>
                {busy === "motion" || project.stage === "IN_PRODUCTION" ? "Generating video…" : "Generate Video"}
              </Btn>
            </div>
          </Surface>
        </div>

        <aside className="space-y-3">
          <Surface className="p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">Look</p>
            <div className="mt-2 overflow-hidden rounded-xl bg-[#111827]">
              {project.approvedStillUrl || project.stillUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={project.approvedStillUrl || project.stillUrl} alt="" className="aspect-[9/16] w-full object-cover" />
              ) : (
                <div className="grid aspect-[9/16] place-items-center px-4 text-center text-[12px] text-white/50">Generate a look to review it.</div>
              )}
            </div>
            {project.stillUrl && !project.approvedStillUrl ? (
              <div className="mt-2">
                <Btn type="button" onClick={() => void save({ approvedStillUrl: project.stillUrl, stage: "READY_FOR_MOTION" })}>
                  Approve Look
                </Btn>
              </div>
            ) : null}
          </Surface>
          <Surface className="p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#9CA3AF]">Video</p>
            {project.videoUrl ? (
              <>
                <video src={project.videoUrl} controls playsInline className="mt-2 aspect-[9/16] w-full rounded-xl object-cover" />
                {project.stage !== "COMPLETED" ? (
                  <div className="mt-2">
                    <Btn type="button" onClick={() => void save({ stage: "COMPLETED" })}>Approve Video</Btn>
                  </div>
                ) : (
                  <a href={project.videoUrl} className="mt-2 inline-block text-[12px] font-semibold text-[#652DFF]">Download</a>
                )}
              </>
            ) : (
              <p className="mt-2 text-[12px] text-[#9CA3AF]">No render yet.</p>
            )}
          </Surface>
        </aside>
      </div>
    </div>
  );
}
