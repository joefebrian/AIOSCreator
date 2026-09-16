"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { CharacterPicker } from "@/components/create/CharacterPicker";
import { DropSlot } from "@/components/create/DropSlot";
import { EnginePicker } from "@/components/create/EnginePicker";
import { useGpu } from "@/components/GpuStatus";
import { Btn, Page, Surface } from "@/components/ui";
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
  const [orientation, setOrientation] = useState<"image" | "video">("image");
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
        const motionClips = all.filter((x) => x.status === "completed" && x.mediaUrl && x.kind === "motion");
        setJobs(stills);
        setClips(motionClips);
        setClip((cur) => cur || motionClips[0]?.mediaUrl || "");
      })
      .catch(() => undefined);
  }, []);

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
      const extras = [cameras.map((id) => CAMERAS.find((x) => x.id === id)?.prompt).filter(Boolean).join(", "), notes]
        .filter(Boolean)
        .join(". ");
      const res = await fetch("/api/jobs/motion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl,
          motionUrl,
          prompt: extras || undefined,
          orientation,
          sound: keepAudio,
          engineId: model || engineId,
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
    <Page
      kicker="CREATE · MOTIONCONTROL"
      title="MotionControl"
      description={
        <>
          Lock the person from the <strong>still</strong>. The <strong>drive clip</strong> is motion only — Kling
          copies body movement, not the face in the video. Still → video (Wan 3.0) lives in{" "}
          <Link href="/create/studio" className="font-semibold text-[#652DFF]">
            AI Studio
          </Link>
          . Lock identity in{" "}
          <Link href="/create/characters" className="font-semibold text-[#652DFF]">
            Characters
          </Link>{" "}
          first.
        </>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <Surface className="xl:sticky xl:top-16">
          <EnginePicker kind="motion" onChange={setEngineId} />
          {engineId === "dreamactor-v2" ? (
            <p className="mt-2 text-[12px] leading-snug text-[#B45309]">
              DreamActor is weaker on photoreal faces. For this catalog-model look, pick <strong>Kling 3.0</strong>.
            </p>
          ) : null}
          <div className="mt-5">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-[#9CA3AF]">1 · IDENTITY LOCK</p>
            <p className="mt-1 text-[12px] text-[#6B7280]">
              Who appears. Face + body + wardrobe from this still. Not the person in the drive clip.
            </p>
            <div className="mt-2">
              <DropSlot
                kind="image"
                label="Drop the locked still"
                hint="Front or 3/4, face + body visible"
                value={character}
                onChange={setCharacter}
              />
            </div>
            <CharacterPicker value={character} onChange={setCharacter} />
          </div>

          <div className="mt-6">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-[#9CA3AF]">2 · MOTION REFERENCE</p>
            <p className="mt-1 text-[12px] text-[#6B7280]">
              Body movement only. Face in this clip is ignored. 3–30s mp4/mov, one person, one take.
            </p>
            <div className="mt-2">
              <DropSlot
                kind="video"
                frame="wide"
                label="Drop the drive clip"
                hint="mp4 / mov · 3–30s · limbs + head visible"
                value={motion}
                onChange={setMotion}
              />
            </div>
            {clips.length ? (
              <div className="mt-3">
                <p className="text-[11px] font-semibold tracking-[0.16em] text-[#9CA3AF]">LIBRARY</p>
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                  {clips.slice(0, 12).map((c) => (
                    <button
                      key={`drive-${c.id}`}
                      type="button"
                      onClick={() => useAsDrive(c.mediaUrl)}
                      title="Use as motion reference"
                      className={cn(
                        "h-16 w-12 shrink-0 overflow-hidden rounded-lg border",
                        motion === c.mediaUrl ? "border-[#652DFF]" : "border-[#E6E8EE]",
                      )}
                    >
                      <video src={c.mediaUrl} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-5">
            <p className="text-[12px] font-semibold text-[#6B7280]">Lock mode</p>
              <div className="mt-2 grid gap-2">
                <button
                  type="button"
                  onClick={() => setOrientation("image")}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-left",
                    orientation === "image" ? "border-[#652DFF] bg-[#652DFF]/5" : "border-[#E6E8EE] bg-white",
                  )}
                >
                  <span className="block text-[12px] font-semibold text-[#111827]">Still orientation</span>
                  <span className="mt-0.5 block text-[11px] text-[#6B7280]">
                    Keep facing/framing from the photo. Stronger identity lock. Drive clip max 10s.
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
                  <span className="mt-0.5 block text-[11px] text-[#6B7280]">
                    Follow the clip’s body facing. Better motion copy. Drive clip max 30s.
                  </span>
                </button>
              </div>
              <label className="mt-3 flex items-center gap-2 text-[12px] font-semibold text-[#4B5563]">
                <input type="checkbox" checked={keepAudio} onChange={(e) => setKeepAudio(e.target.checked)} />
                Keep audio from the drive clip
              </label>
              <p className="mt-2 text-[11px] text-[#9CA3AF]">Output length follows the drive clip. 1080p.</p>
            </div>

          <div className="mt-4">
            <p className="text-[12px] font-semibold text-[#6B7280]">Camera extras</p>
            <p className="mt-0.5 text-[11px] text-[#9CA3AF]">Skip unless you want extra camera on top of the clip. Can fight the lock.</p>
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
          </div>

          <label className="mt-4 block text-[12px] font-semibold text-[#6B7280]">
            Notes
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={2}
              placeholder="Optional. Don’t describe a new person — identity is locked from the still."
              className="mt-1 w-full resize-none rounded-xl border border-[#E6E8EE] bg-white p-2 text-sm font-normal outline-none focus:border-[#652DFF]"
            />
          </label>

          <Btn
            type="button"
            disabled={busy || !character || !motion}
            aria-busy={busy}
            onClick={() => void generate()}
            className={cn("mt-4 w-full", busy && "pointer-events-none")}
          >
            {busy
              ? `Working${elapsed ? ` · ${elapsed}` : ""}${progress ? ` · ${progress}` : ""}`
              : !character
                ? "Lock a still first"
                : !motion
                  ? "Drop a drive clip"
                  : "Generate"}
          </Btn>
          {busy ? (
            <p className="mt-2 text-[12px] text-[#6B7280]">Job started. Don’t click again — wait for the clip.</p>
          ) : null}
          {error ? <p className="mt-2 text-[12px] text-red-600">{error}</p> : null}
        </Surface>

        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-[#9CA3AF]">PREVIEW</p>
          <div className="mt-2 overflow-hidden rounded-2xl border border-[#E6E8EE] bg-[#0e1014]">
            <div className="relative aspect-[3/4] max-h-[70vh]">
              {clip ? (
                <video
                  key={`${clip}-${bust}`}
                  src={bust ? `${clip.split("?")[0]}?t=${bust}` : clip}
                  className="h-full w-full bg-black object-contain"
                  controls
                  muted
                  loop
                  autoPlay
                  playsInline
                  preload="metadata"
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
                  <p className="text-[12px] font-semibold tracking-[0.16em] text-white/40">NO CLIP YET</p>
                  <p className="text-[12px] text-white/30">Lock a still, drop a drive clip, then Generate.</p>
                </div>
              )}
            </div>
          </div>
          {clip && active ? (
            <div className="mt-3 rounded-xl border border-[#E6E8EE] bg-white px-3 py-2 text-[12px] text-[#4B5563]">
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
            <div className="mt-3 flex flex-row-reverse justify-end gap-1">
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
              <a href={`${clip}?download=1`} download title="Save" className={iconClass()}>
                <DownloadGlyph />
              </a>
            </div>
          ) : null}

          {clips.length ? (
            <div className="mt-6">
              <p className="text-[11px] font-semibold tracking-[0.16em] text-[#9CA3AF]">LIBRARY</p>
              <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {clips.slice(0, 24).map((c) => (
                  <div
                    key={c.id}
                    className={cn(
                      "group relative overflow-hidden rounded-xl border",
                      clip === c.mediaUrl ? "border-[#652DFF] ring-1 ring-[#652DFF]/30" : "border-[#E6E8EE]",
                    )}
                  >
                    <button type="button" onClick={() => setClip(c.mediaUrl || "")} className="relative block w-full">
                      <video
                        src={c.mediaUrl}
                        muted
                        playsInline
                        preload="metadata"
                        className="aspect-[3/4] w-full object-cover"
                      />
                    </button>
                    <div className="absolute right-1.5 top-1.5 z-10 flex flex-row-reverse gap-1">
                      <IconBtn title="Delete" onClick={() => void deleteClip(c)}>
                        <TrashGlyph />
                      </IconBtn>
                      <IconBtn title="Regenerate" disabled={gpuBusy} onClick={() => void regenerate(c)}>
                        <RegenGlyph />
                      </IconBtn>
                      <IconBtn title="Use as motion reference" onClick={() => useAsDrive(c.mediaUrl)}>
                        <DriveGlyph />
                      </IconBtn>
                      <a
                        href={`${c.mediaUrl}?download=1`}
                        download
                        title="Save"
                        onClick={(e) => e.stopPropagation()}
                        className={iconClass()}
                      >
                        <DownloadGlyph />
                      </a>
                    </div>
                    {c.upscaled ? (
                      <span className="absolute left-1.5 top-1.5 rounded bg-black/75 px-1 py-0.5 text-[9px] font-bold text-white">
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
    </Page>
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
