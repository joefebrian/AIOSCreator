"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { BindFaceButton, BindFacePanel } from "@/components/create/BindFacePanel";
import { CharacterPicker } from "@/components/create/CharacterPicker";
import { DriveLibrary } from "@/components/create/DriveLibrary";
import { DropSlot } from "@/components/create/DropSlot";
import { EnginePicker } from "@/components/create/EnginePicker";
import { useGpu } from "@/components/GpuStatus";
import { Btn } from "@/components/ui";
import { cn } from "@/lib/cn";
import { formatElapsed, pollJob } from "@/lib/http";
import { isProductMediaUrl } from "@/lib/media-kind";

type Job = {
  id: string;
  kind: string;
  status: string;
  mediaUrl?: string;
  model?: string;
  provider?: string;
  input?: string;
  createdAt: string;
  upscaled?: boolean;
  characterId?: string;
  source?: string;
};

function motionEngineLabel(id?: string) {
  if (id === "kling-3-0") return "Kling Motion Control 3.0";
  if (id === "kling-2-6") return "Kling Motion Control 2.6";
  if (id === "dreamactor-v2") return "DreamActor V2";
  if (id === "wan-3-0") return "Wan 3.0";
  return id || "—";
}

function providerLabel(id?: string) {
  if (id === "kling") return "Kling API";
  if (id === "fal") return "fal.ai";
  if (id === "dashscope") return "Alibaba Wan 3.0";
  if (id === "comfy") return "Local Comfy";
  return id || "—";
}

function parseMotionInput(input?: string) {
  const parts = (input || "").split(" | ").map((s) => s.trim()).filter(Boolean);
  const urls = parts.filter((p) => p.startsWith("/api/media/"));
  const imageUrl = urls.find((u) => !/\.(mp4|webm|mov)(\?|$)/i.test(u) && !/\/motion\//.test(u));
  const motionUrl = urls.find((u) => /\.(mp4|webm|mov)(\?|$)/i.test(u) || /\/motion\//.test(u));
  const notes = parts.filter((p) => !p.startsWith("/api/media/")).join(". ");
  return { notes, imageUrl, motionUrl };
}

const CAMERAS = [
  { id: "pan-left", label: "Pan left", prompt: "camera pan left" },
  { id: "pan-right", label: "Pan right", prompt: "camera pan right" },
  { id: "tilt-up", label: "Tilt up", prompt: "camera tilt up" },
  { id: "tilt-down", label: "Tilt down", prompt: "camera tilt down" },
  { id: "zoom-in", label: "Zoom in", prompt: "slow zoom in" },
  { id: "zoom-out", label: "Zoom out", prompt: "slow zoom out" },
  { id: "dolly-in", label: "Dolly in", prompt: "dolly push-in" },
  { id: "orbit", label: "Orbit", prompt: "orbit around subject" },
  { id: "handheld", label: "Handheld", prompt: "handheld camera, slight shake" },
];

export default function MotionControlPage() {
  const gpu = useGpu();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [clips, setClips] = useState<Job[]>([]);
  const [character, setCharacter] = useState("");
  const [motion, setMotion] = useState("");
  const [prompt, setPrompt] = useState("");
  const [clip, setClip] = useState("");
  const [bust, setBust] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState("");
  const [progress, setProgress] = useState("");
  const [cameras, setCameras] = useState<string[]>([]);
  const [orientation, setOrientation] = useState<"image" | "video">("video");
  const [quality, setQuality] = useState<"720p" | "1080p">("1080p");
  const [bindFace, setBindFace] = useState(false);
  const [bindOpen, setBindOpen] = useState(false);
  const [faceRefs, setFaceRefs] = useState<string[]>([]);
  const [keepAudio, setKeepAudio] = useState(true);
  const [engineId, setEngineId] = useState("kling-3-0");
  const submitLock = useRef(false);

  useEffect(() => {
    fetch("/api/jobs")
      .then((r) => r.json())
      .then((j) => {
        const all = j.jobs as Job[];
        const stills = all.filter((x) => {
          if (x.status !== "completed" || !x.mediaUrl) return false;
          if (x.kind !== "image" && x.kind !== "character") return false;
          if (isProductMediaUrl(x.mediaUrl)) return false;
          if (x.model === "upload" && !x.characterId) return /\/characters\//.test(x.mediaUrl);
          return Boolean(x.characterId) || /\/characters\//.test(x.mediaUrl);
        });
        const motionClips = all.filter((x) => {
          if (x.status !== "completed" || !x.mediaUrl || x.kind !== "motion") return false;
          if (x.source === "studio" || x.source === "ugc-factory" || x.source === "ugc-fashion") return false;
          if (/\/UGC_Factory\//i.test(x.mediaUrl) || /\/UGC_Fashion\//i.test(x.mediaUrl)) return false;
          if (x.model === "upload" || /\/uploads\//.test(x.mediaUrl)) return true;
          return x.model === "kling-2-6" || x.model === "kling-3-0" || x.model === "dreamactor-v2";
        });
        setJobs(stills);
        setClips(motionClips);
        const preview = motionClips.find(
          (x) => x.model === "kling-2-6" || x.model === "kling-3-0" || x.model === "dreamactor-v2",
        );
        setClip((cur) => cur || preview?.mediaUrl || "");
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    setFaceRefs((cur) => cur.filter((url) => url && url !== character));
  }, [character]);

  useEffect(() => {
    if (!busy) {
      setElapsed("");
      setProgress("");
      return;
    }
    const t0 = Date.now();
    setElapsed("0s");
    const t = setInterval(() => setElapsed(formatElapsed(Date.now() - t0)), 1000);
    return () => clearInterval(t);
  }, [busy]);

  async function generate() {
    await generateWith(character, motion, prompt, engineId);
  }

  const pageClips = clips.filter(
    (c) => c.model === "kling-2-6" || c.model === "kling-3-0" || c.model === "dreamactor-v2",
  );
  const faceCount = faceRefs.filter((url) => url && url !== character).length;
  const faceNeeded = engineId === "kling-3-0" && bindFace && faceCount < 1;
  const gpuBusy = busy || gpu.busy;
  const active = clips.find((c) => c.mediaUrl === clip);

  function useAsDrive(url?: string) {
    if (!url) return;
    setMotion(url);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deleteClip(c: Job) {
    const id = c.id || clips.find((x) => x.mediaUrl && x.mediaUrl === c.mediaUrl)?.id;
    if (!id) {
      setError("Can't delete this clip — refresh and try again.");
      return;
    }
    setError("");
    try {
      const res = await fetch(`/api/jobs/${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error || `delete HTTP ${res.status}`);
      setClips((prev) => prev.filter((x) => x.id !== id && x.mediaUrl !== c.mediaUrl));
      setJobs((prev) => prev.filter((x) => x.id !== id && x.mediaUrl !== c.mediaUrl));
      if (clip === c.mediaUrl) setClip("");
      if (motion === c.mediaUrl) setMotion("");
      if (character === c.mediaUrl) setCharacter("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function regenerate(c: Job) {
    if (submitLock.current || busy) return;
    const parsed = parseMotionInput(c.input);
    const imageUrl = parsed.imageUrl || character;
    const motionUrl = parsed.motionUrl || c.mediaUrl || motion;
    if (!imageUrl || !motionUrl) {
      setError("This clip has no still + drive saved. Set identity and motion reference first.");
      return;
    }
    setCharacter(imageUrl);
    setMotion(motionUrl);
    if (parsed.notes && parsed.notes !== "motion") setPrompt(parsed.notes);
    if (c.model === "kling-2-6" || c.model === "kling-3-0" || c.model === "dreamactor-v2") {
      setEngineId(c.model);
    }
    await generateWith(imageUrl, motionUrl, parsed.notes === "motion" ? prompt : parsed.notes, c.model);
  }

  async function generateWith(imageUrl: string, motionUrl: string, notes: string, model?: string) {
    if (!imageUrl || !motionUrl) return;
    if (submitLock.current) return;
    submitLock.current = true;
    setBusy(true);
    setProgress("Starting…");
    setError("");
    try {
      const chosen = model || engineId;
      const kling = chosen === "kling-2-6" || chosen === "kling-3-0";
      const faces = chosen === "kling-3-0" && bindFace ? faceRefs.filter((url) => url && url !== imageUrl) : [];
      const cameraLine = orientation === "image"
        ? cameras.map((id) => CAMERAS.find((x) => x.id === id)?.prompt).filter(Boolean).join(", ")
        : "";
      const extras = [cameraLine, notes].filter(Boolean).join(". ");
      const res = await fetch("/api/jobs/motion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl,
          motionUrl,
          prompt: extras || undefined,
          orientation,
          sound: keepAudio,
          engineId: chosen,
          ...(kling ? { resolution: quality } : {}),
          ...(faces.length ? { faceUrls: faces } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.status);
      if (json.status === "running" || res.status === 202) {
        const job = await pollJob(json.id, (j) => setProgress(j.progress || ""));
        if (job.status === "failed") throw new Error(job.error || "failed");
        setClip(job.mediaUrl || "");
        setClips((prev) => [job as Job, ...prev.filter((x) => x.id !== job.id)]);
        return;
      }
      setClip(json.mediaUrl);
      setClips((prev) => [json as Job, ...prev.filter((x) => x.id !== json.id)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      submitLock.current = false;
      setBusy(false);
    }
  }

  async function upscaleClip(url: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/jobs/upscale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl: url }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "upscale failed");
      setClips((prev) =>
        prev.map((c) => (c.mediaUrl === url || c.id === json.replaced ? { ...c, upscaled: true } : c)),
      );
      setClip(url);
      setBust(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col xl:h-[calc(100vh-4rem)] xl:overflow-hidden">
      <div className="shrink-0 border-b border-[#E6E8EE] bg-white px-4 py-3 md:px-6">
        <p className="text-[10px] font-semibold tracking-[0.16em] text-[#652DFF]">CREATE · MOTIONCONTROL</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
          <h1 className="text-xl font-black tracking-tight">MotionControl</h1>
          <p className="max-w-xl text-[12px] leading-snug text-[#6B7280]">
            Lock the person from the <strong className="font-semibold text-[#374151]">still</strong>. The drive clip is
            motion only. Still → video lives in{" "}
            <Link href="/create/studio" className="font-semibold text-[#652DFF]">
              AI Studio
            </Link>
            . Lock identity in{" "}
            <Link href="/create/characters" className="font-semibold text-[#652DFF]">
              Characters
            </Link>{" "}
            first.
          </p>
        </div>
      </div>

      <div className="grid min-h-0 min-w-0 flex-1 xl:grid-cols-[minmax(22rem,26rem)_minmax(0,1fr)] xl:grid-rows-[minmax(0,1fr)]">
        <div className="flex min-h-0 min-w-0 flex-col border-[#E6E8EE] bg-white xl:h-full xl:border-r">
          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-4 md:px-5">
            <EnginePicker kind="motion" onChange={setEngineId} />
            {engineId === "dreamactor-v2" ? (
              <p className="mt-2 text-[12px] leading-snug text-[#B45309]">
                DreamActor is weaker on photoreal faces. For this catalog-model look, pick <strong>Kling 3.0</strong>.
              </p>
            ) : null}
            {engineId === "kling-2-6" || engineId === "kling-3-0" ? (
              <div className="mt-3">
                <p className="text-[12px] font-semibold text-[#6B7280]">Quality</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setQuality("720p")}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-left",
                      quality === "720p" ? "border-[#652DFF] bg-[#652DFF]/5" : "border-[#E6E8EE] bg-white",
                    )}
                  >
                    <span className="block text-[12px] font-semibold text-[#111827]">Standard</span>
                    <span className="mt-0.5 block text-[11px] text-[#6B7280]">720p</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setQuality("1080p")}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-left",
                      quality === "1080p" ? "border-[#652DFF] bg-[#652DFF]/5" : "border-[#E6E8EE] bg-white",
                    )}
                  >
                    <span className="block text-[12px] font-semibold text-[#111827]">Professional</span>
                    <span className="mt-0.5 block text-[11px] text-[#6B7280]">1080p</span>
                  </button>
                </div>
              </div>
            ) : null}

            <div className="mt-4">
              <p className="text-[11px] font-semibold tracking-[0.16em] text-[#9CA3AF]">1 · CHARACTER LOCK</p>
              <p className="mt-1 text-[12px] text-[#6B7280]">
                Who appears. Face, body, and wardrobe come from this still.
              </p>
              <div className="mt-2">
                <DropSlot
                  kind="image"
                  frame="band"
                  label="Drop the locked still"
                  hint="Front or 3/4, face + body visible"
                  value={character}
                  onChange={setCharacter}
                />
              </div>
              {engineId === "kling-3-0" ? (
                <BindFaceButton
                  bound={bindFace && faceCount > 0}
                  count={faceCount}
                  onOpen={() => setBindOpen(true)}
                  onClear={() => {
                    setBindFace(false);
                    setFaceRefs([]);
                  }}
                />
              ) : null}
              <CharacterPicker value={character} onChange={setCharacter} imageJobs={jobs} />
            </div>

            <div className="mt-4">
              <p className="text-[11px] font-semibold tracking-[0.16em] text-[#9CA3AF]">2 · MOTION REFERENCE</p>
              <p className="mt-1 text-[12px] text-[#6B7280]">
                Body movement only. The face in this clip is ignored. 3–30s, one person, one take.
              </p>
              <div className="mt-2">
                <DropSlot
                  kind="video"
                  frame="band"
                  label="Drop the drive clip"
                  hint="mp4 / mov · limbs + head visible"
                  value={motion}
                  onChange={setMotion}
                />
              </div>
              <DriveLibrary
                clips={clips}
                value={motion}
                onPick={useAsDrive}
                onRemoved={(url) => {
                  if (motion === url) setMotion("");
                }}
              />
            </div>

            <div className="mt-4">
              <p className="text-[12px] font-semibold text-[#6B7280]">Lock mode</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => {
                    setOrientation("image");
                    setBindFace(false);
                  }}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-left",
                    orientation === "image" ? "border-[#652DFF] bg-[#652DFF]/5" : "border-[#E6E8EE] bg-white",
                  )}
                >
                  <span className="block text-[12px] font-semibold text-[#111827]">Still orientation</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-[#6B7280]">
                    Keep the photo’s facing. Camera moves are allowed. Drive clip max 10s.
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setOrientation("video")}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-left",
                    orientation === "video" ? "border-[#652DFF] bg-[#652DFF]/5" : "border-[#E6E8EE] bg-white",
                  )}
                >
                  <span className="block text-[12px] font-semibold text-[#111827]">Drive orientation</span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-[#6B7280]">
                    Facing, motion, and camera follow the clip. Drive clip max 30s.
                  </span>
                </button>
              </div>
              <label className="mt-3 flex items-center gap-2 text-[12px] font-semibold text-[#4B5563]">
                <input type="checkbox" checked={keepAudio} onChange={(e) => setKeepAudio(e.target.checked)} />
                Keep audio from the drive clip
              </label>
              <p className="mt-2 text-[11px] text-[#9CA3AF]">
                Output length follows the drive clip.
                {engineId === "kling-2-6" || engineId === "kling-3-0"
                  ? quality === "720p"
                    ? " Standard 720p."
                    : " Professional 1080p."
                  : null}
              </p>
            </div>

            <div className="mt-4">
              <p className="text-[12px] font-semibold text-[#6B7280]">Camera extras</p>
              {orientation === "video" ? (
                <p className="mt-0.5 text-[11px] text-[#9CA3AF]">Camera follows the drive clip.</p>
              ) : (
                <>
                  <p className="mt-0.5 text-[11px] text-[#9CA3AF]">Added on top of the clip. Still orientation only.</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {CAMERAS.map((c) => {
                      const on = cameras.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() =>
                            setCameras((cur) => (cur.includes(c.id) ? cur.filter((x) => x !== c.id) : [...cur, c.id]))
                          }
                          className={cn(
                            "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                            on ? "border-[#652DFF] bg-[#652DFF] text-white" : "border-[#E6E8EE] bg-white text-[#4B5563]",
                          )}
                        >
                          {c.label}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            <label className="mt-4 block text-[12px] font-semibold text-[#6B7280]">
              Notes
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={2}
                placeholder="Background and scene details. Do not describe a new person."
                className="mt-1 w-full resize-none rounded-xl border border-[#E6E8EE] bg-white p-2 text-sm font-normal outline-none focus:border-[#652DFF]"
              />
            </label>
          </div>

          <div className="shrink-0 border-t border-[#E6E8EE] bg-white px-4 py-3 md:px-5">
            <Btn
              type="button"
              disabled={busy || !character || !motion || faceNeeded}
              aria-busy={busy}
              onClick={() => void generate()}
              className={cn("w-full", busy && "pointer-events-none")}
            >
              {busy
                ? `Working${elapsed ? ` · ${elapsed}` : ""}${progress ? ` · ${progress}` : ""}`
                : !character
                  ? "Lock a character first"
                  : faceNeeded
                    ? "Add 1 face photo"
                    : !motion
                      ? "Drop a drive clip"
                      : "Generate"}
            </Btn>
            {busy ? (
              <p className="mt-2 text-[12px] text-[#6B7280]">Job started. Don’t click again — wait for the clip.</p>
            ) : null}
            {error ? <p className="mt-2 text-[12px] text-red-600">{error}</p> : null}
            <BindFacePanel
              open={bindOpen && engineId === "kling-3-0"}
              locked={character}
              selected={faceRefs}
              onClose={() => setBindOpen(false)}
              onBind={(urls) => {
                setFaceRefs(urls);
                setBindFace(urls.length > 0);
                if (urls.length > 0) setOrientation("video");
                setBindOpen(false);
              }}
            />
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-col gap-3 overflow-y-auto p-4 md:p-5">
          <div className="relative min-h-[280px] flex-1 overflow-hidden rounded-2xl border border-[#E6E8EE] bg-[#0e1014]">
            {clip ? (
              <video
                key={`${clip}-${bust}`}
                src={bust ? `${clip.split("?")[0]}?t=${bust}` : clip}
                className="absolute inset-0 h-full w-full bg-black object-contain"
                controls
                muted
                loop
                autoPlay
                playsInline
                preload="metadata"
              />
            ) : (
              <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-1 px-6 text-center">
                <p className="text-[12px] font-semibold tracking-[0.16em] text-white/40">NO CLIP YET</p>
                <p className="text-[12px] text-white/30">Lock a still, drop a drive clip, then Generate.</p>
              </div>
            )}
          </div>

          {clip && active ? (
            <div className="rounded-xl border border-[#E6E8EE] bg-white px-3 py-2 text-[12px] text-[#4B5563]">
              <p className="font-semibold text-[#111827]">{motionEngineLabel(active.model)}</p>
              <p className="mt-0.5">
                {providerLabel(active.provider)} · {active.model}
                {active.createdAt ? ` · ${new Date(active.createdAt).toLocaleString()}` : ""}
              </p>
              {active.input ? (
                <p className="mt-1 truncate text-[11px] text-[#9CA3AF]" title={active.input}>
                  {active.input}
                </p>
              ) : null}
            </div>
          ) : null}

          {clip ? (
            <div className="flex flex-row-reverse justify-end gap-1">
              {active ? (
                <IconBtn title="Delete" onClick={() => void deleteClip(active)}>
                  <TrashGlyph />
                </IconBtn>
              ) : null}
              {active ? (
                <IconBtn title="Regenerate" disabled={gpuBusy} onClick={() => void regenerate(active)}>
                  <RegenGlyph />
                </IconBtn>
              ) : null}
              <IconBtn title="Use as motion reference" onClick={() => useAsDrive(clip)}>
                <DriveGlyph />
              </IconBtn>
              {!active?.upscaled ? (
                <IconBtn title="Upscale to 4K" disabled={gpuBusy} onClick={() => void upscaleClip(clip)}>
                  <FourKGlyph />
                </IconBtn>
              ) : (
                <span className="flex h-7 items-center rounded-md bg-black px-1.5 text-[10px] font-bold text-white">4K</span>
              )}
              <a href={`${clip}?download=1`} download title="Save" className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-[#111827] ring-1 ring-[#E6E8EE] hover:bg-[#F3F4F8]">
                <DownloadGlyph />
              </a>
            </div>
          ) : null}

          {pageClips.length ? (
            <div className="min-w-0">
              <p className="text-[11px] font-semibold tracking-[0.16em] text-[#9CA3AF]">CLIPS</p>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {pageClips.slice(0, 24).map((c) => (
                  <div
                    key={c.id}
                    className={cn(
                      "group relative h-28 w-20 shrink-0 overflow-hidden rounded-xl border",
                      clip === c.mediaUrl ? "border-[#652DFF] ring-1 ring-[#652DFF]/30" : "border-[#E6E8EE]",
                    )}
                  >
                    <button type="button" onClick={() => setClip(c.mediaUrl || "")} className="relative block h-full w-full">
                      <video
                        src={c.mediaUrl}
                        muted
                        playsInline
                        preload="metadata"
                        className="h-full w-full object-cover"
                      />
                    </button>
                    <div className="absolute inset-x-1 bottom-1 z-10 hidden justify-end gap-1 group-hover:flex">
                      <IconBtn title="Use as motion reference" onClick={() => useAsDrive(c.mediaUrl)}>
                        <DriveGlyph />
                      </IconBtn>
                      <IconBtn title="Delete" onClick={() => void deleteClip(c)}>
                        <TrashGlyph />
                      </IconBtn>
                    </div>
                    {c.upscaled ? (
                      <span className="absolute left-1 top-1 z-10 rounded bg-black/75 px-1 py-0.5 text-[9px] font-bold text-white">
                        4K
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function iconClass() {
  return "flex h-7 w-7 items-center justify-center rounded-md bg-black/70 text-white hover:bg-black";
}

function IconBtn({
  title,
  disabled,
  onClick,
  children,
}: {
  title: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onClick();
      }}
      className={cn(iconClass(), disabled ? "cursor-default opacity-40" : "")}
    >
      {children}
    </button>
  );
}

function TrashGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 7h16M9 7V5h6v2m-8 0 1 14h8l1-14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DownloadGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RegenGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 4v6h6M20 20v-6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20.49 9A9 9 0 0 0 5.64 5.64L4 10M3.51 15a9 9 0 0 0 14.85 3.36L20 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DriveGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FourKGlyph() {
  return (
    <svg width="16" height="10" viewBox="0 0 32 20" aria-hidden>
      <text x="0" y="16" fill="currentColor" fontSize="16" fontWeight="800" fontFamily="ui-sans-serif, system-ui">
        4K
      </text>
    </svg>
  );
}
