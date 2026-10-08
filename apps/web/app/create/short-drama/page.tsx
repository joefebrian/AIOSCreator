"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Btn, Page, Pill, Surface, inputClass } from "@/components/ui";
import { cn } from "@/lib/cn";
import { pollJob } from "@/lib/http";
import { thumbSrc } from "@/lib/media-url";

type Shot = {
  id: string;
  index: number;
  title: string;
  summary: string;
  dialogue: string;
  durationSec: number;
  imagePrompt: string;
  videoPrompt: string;
  framing: string;
  camera: string;
  emotion: string;
  location: string;
  wardrobe: string;
  cast: string[];
  stillUrl?: string;
  videoUrl?: string;
};

type Drama = {
  id: string;
  title: string;
  logline: string;
  script: string;
  characterId?: string;
  characterName?: string;
  stage: "script" | "board" | "generate" | "export";
  entities: { characters: string[]; scenes: string[]; props: string[]; costumes: string[] };
  shots: Shot[];
  episodeUrl?: string;
};

type Character = { id: string; name: string; identityUrl: string | null };

const STAGES = [
  { id: "script", label: "1 Script" },
  { id: "board", label: "2 Board" },
  { id: "generate", label: "3 Generate" },
  { id: "export", label: "4 Export" },
] as const;

function statusOf(s: Shot) {
  if (s.videoUrl) return "video";
  if (s.stillUrl) return "still";
  if (s.imagePrompt) return "prepared";
  return "draft";
}

export default function ShortDramaPage() {
  const [dramas, setDramas] = useState<Drama[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [openId, setOpenId] = useState("");
  const [title, setTitle] = useState("");
  const [script, setScript] = useState("");
  const [characterId, setCharacterId] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [selId, setSelId] = useState("");
  const [draft, setDraft] = useState<Shot | null>(null);

  const open = dramas.find((d) => d.id === openId);
  const stage = open?.stage || "script";
  const sel = open?.shots.find((s) => s.id === selId) || open?.shots[0];

  const stats = useMemo(() => {
    if (!open) return { prepared: 0, stills: 0, videos: 0, total: 0, totalSec: 0 };
    return {
      prepared: open.shots.filter((s) => statusOf(s) !== "draft").length,
      stills: open.shots.filter((s) => s.stillUrl).length,
      videos: open.shots.filter((s) => s.videoUrl).length,
      total: open.shots.length,
      totalSec: open.shots.reduce((n, s) => n + s.durationSec, 0),
    };
  }, [open]);

  async function load() {
    const res = await fetch("/api/drama");
    const json = (await res.json()) as { dramas?: Drama[]; characters?: Character[] };
    setDramas(json.dramas || []);
    setCharacters(json.characters || []);
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (sel) setDraft(sel);
  }, [sel?.id, openId]);

  async function api(body: Record<string, unknown>) {
    const res = await fetch("/api/drama", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "failed");
    return json as Drama;
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy("break");
    setError("");
    try {
      const json = await api({ action: "create", title, script, characterId: characterId || undefined });
      setTitle("");
      setScript("");
      setOpenId(json.id);
      setSelId(json.shots[0]?.id || "");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function setStage(next: Drama["stage"]) {
    if (!open) return;
    await api({ action: "stage", id: open.id, stage: next });
    await load();
  }

  async function saveShot() {
    if (!open || !draft) return;
    setBusy("save");
    try {
      await api({ action: "save-shot", id: open.id, shotId: draft.id, shot: draft });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function still(shot: Shot) {
    if (!open) return;
    setBusy(`still-${shot.id}`);
    setError("");
    try {
      await api({ action: "still", id: open.id, shotId: shot.id });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function video(shot: Shot) {
    if (!open) return;
    if (!shot.stillUrl) {
      setError("Prepare the still first.");
      return;
    }
    setBusy(`video-${shot.id}`);
    setError("");
    try {
      const prevVideo = open.shots.filter((s) => s.index < shot.index && s.videoUrl).sort((a, b) => b.index - a.index)[0]?.videoUrl;
      const res = await fetch("/api/jobs/motion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl: shot.stillUrl,
          prompt: shot.videoPrompt,
          durationSec: shot.durationSec,
          engineId: prevVideo ? "seedance-2-5-extend" : "seedance-2-5",
          motionUrl: prevVideo || undefined,
          characterId: open.characterId,
        }),
      });
      const json = (await res.json()) as { id?: string; status?: string; mediaUrl?: string; error?: string };
      if (!res.ok) throw new Error(json.error || "video failed");
      const done =
        json.status === "completed" && json.mediaUrl ? json : json.id ? await pollJob(json.id) : json;
      if (done.status === "failed") throw new Error(done.error || "video failed");
      if (!done.mediaUrl) throw new Error("video job returned no file");
      await api({ action: "link", id: open.id, shotId: shot.id, videoUrl: done.mediaUrl, videoJobId: done.id });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function stitch() {
    if (!open) return;
    setBusy("stitch");
    setError("");
    try {
      await api({ action: "stitch", id: open.id });
      await setStage("export");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  function field<K extends keyof Shot>(key: K, value: Shot[K]) {
    setDraft((cur) => (cur ? { ...cur, [key]: value } : cur));
  }

  return (
    <Page
      kicker="CREATE · SHORT DRAMA"
      title="ShortDrama"
      description="Production board: script → extract → prepare shots → generate → stitch. Character lock from the library. One shot at a time."
    >
      <div className="mb-4 flex flex-wrap gap-1">
        {STAGES.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={!open}
            onClick={() => open && void setStage(s.id)}
            className={cn(
              "rounded-full px-3 py-1 text-[12px] font-semibold",
              stage === s.id ? "bg-[#111827] text-white" : "bg-[#F3F4F8] text-[#6B7280]",
            )}
          >
            {s.label}
          </button>
        ))}
        {open ? (
          <span className="ml-auto text-[12px] text-[#6B7280]">
            {stats.stills}/{stats.total} stills · {stats.videos}/{stats.total} clips · {stats.totalSec}s
          </span>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_17rem]">
        <div>
          {(!open || stage === "script") && (
            <Surface>
              <p className="text-[11px] font-semibold tracking-[0.16em] text-[#9CA3AF]">SCRIPT</p>
              <form className="mt-3 space-y-2" onSubmit={(e) => void create(e)}>
                <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Episode title (optional)" />
                <select className={inputClass} value={characterId} onChange={(e) => setCharacterId(e.target.value)}>
                  <option value="">Lock a character…</option>
                  {characters.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
                <textarea
                  className={`${inputClass} min-h-[10rem]`}
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  placeholder="Paste logline or shooting script. Qwen extracts cast/scenes/props and a 9:16 storyboard."
                />
                <Btn type="submit" disabled={busy === "break" || !script.trim()}>
                  {busy === "break" ? "Breaking down…" : "Extract + storyboard"}
                </Btn>
              </form>
              {open?.logline ? <p className="mt-3 text-[13px] text-[#4B5563]">{open.logline}</p> : null}
            </Surface>
          )}

          {open && (stage === "board" || stage === "generate" || stage === "export") ? (
            <>
              <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                {open.shots.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSelId(s.id)}
                    className={cn(
                      "w-28 shrink-0 overflow-hidden rounded-xl border text-left",
                      selId === s.id ? "border-[#652DFF]" : "border-[#E6E8EE]",
                    )}
                  >
                    <div className="aspect-[9/16] bg-[#F3F4F8]">
                      {s.stillUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumbSrc(s.stillUrl, 240)} alt="" className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <div className="p-1.5">
                      <p className="text-[10px] font-semibold text-[#652DFF]">
                        {s.index + 1} · {s.framing} · {s.durationSec}s
                      </p>
                      <p className="truncate text-[11px] font-semibold">{s.title}</p>
                      <p className="text-[10px] text-[#9CA3AF]">{statusOf(s)}</p>
                    </div>
                  </button>
                ))}
              </div>

              {open.entities && (
                <div className="mb-3 flex flex-wrap gap-1">
                  {open.entities.characters.map((x) => (
                    <Pill key={`c-${x}`}>{x}</Pill>
                  ))}
                  {open.entities.scenes.map((x) => (
                    <Pill key={`s-${x}`} tone="muted">
                      {x}
                    </Pill>
                  ))}
                  {open.entities.costumes.map((x) => (
                    <Pill key={`w-${x}`} tone="ready">
                      {x}
                    </Pill>
                  ))}
                </div>
              )}

              {stage === "board" && draft ? (
                <Surface>
                  <p className="text-[11px] font-semibold tracking-[0.16em] text-[#9CA3AF]">SHOT {draft.index + 1} PREP</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <input className={inputClass} value={draft.title} onChange={(e) => field("title", e.target.value)} />
                    <input
                      className={inputClass}
                      type="number"
                      min={4}
                      max={8}
                      value={draft.durationSec}
                      onChange={(e) => field("durationSec", Number(e.target.value))}
                    />
                    <select className={inputClass} value={draft.framing} onChange={(e) => field("framing", e.target.value)}>
                      {["ECU", "CU", "MCU", "MS", "WS"].map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                    <input className={inputClass} value={draft.camera} onChange={(e) => field("camera", e.target.value)} placeholder="Camera" />
                    <input className={inputClass} value={draft.emotion} onChange={(e) => field("emotion", e.target.value)} placeholder="Emotion" />
                    <input className={inputClass} value={draft.location} onChange={(e) => field("location", e.target.value)} placeholder="Location" />
                    <input className={inputClass} value={draft.wardrobe} onChange={(e) => field("wardrobe", e.target.value)} placeholder="Wardrobe" />
                    <input className={inputClass} value={draft.dialogue} onChange={(e) => field("dialogue", e.target.value)} placeholder="Dialogue" />
                  </div>
                  <textarea className={`${inputClass} mt-2 min-h-[4rem]`} value={draft.summary} onChange={(e) => field("summary", e.target.value)} />
                  <label className="mt-2 block text-[11px] font-semibold">Still prompt</label>
                  <textarea className={`${inputClass} min-h-[5rem]`} value={draft.imagePrompt} onChange={(e) => field("imagePrompt", e.target.value)} />
                  <label className="mt-2 block text-[11px] font-semibold">I2V prompt</label>
                  <textarea className={`${inputClass} min-h-[5rem]`} value={draft.videoPrompt} onChange={(e) => field("videoPrompt", e.target.value)} />
                  <div className="mt-3 flex gap-2">
                    <Btn type="button" disabled={busy === "save"} onClick={() => void saveShot()}>
                      Save shot
                    </Btn>
                    <Btn type="button" variant="ghost" onClick={() => void setStage("generate")}>
                      Generate workspace →
                    </Btn>
                  </div>
                </Surface>
              ) : null}

              {stage === "generate" && sel ? (
                <Surface>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-semibold text-[#652DFF]">
                        SHOT {sel.index + 1} · {sel.framing} · {sel.durationSec}s
                      </p>
                      <p className="text-[16px] font-black">{sel.title}</p>
                      <p className="mt-1 text-[13px] text-[#4B5563]">{sel.summary}</p>
                    </div>
                    <div className="flex gap-2">
                      <Btn type="button" variant="ghost" disabled={Boolean(busy)} onClick={() => void still(sel)}>
                        {busy === `still-${sel.id}` ? "Still…" : "Still"}
                      </Btn>
                      <Btn type="button" disabled={Boolean(busy) || !sel.stillUrl} onClick={() => void video(sel)}>
                        {busy === `video-${sel.id}` ? "I2V…" : "I2V"}
                      </Btn>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {sel.stillUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumbSrc(sel.stillUrl, 640)} alt="" className="aspect-[9/16] w-full rounded-lg object-cover" />
                    ) : (
                      <p className="text-[12px] text-[#9CA3AF]">{sel.imagePrompt}</p>
                    )}
                    {sel.videoUrl ? (
                      <video src={sel.videoUrl} controls className="aspect-[9/16] w-full rounded-lg bg-black" />
                    ) : (
                      <p className="text-[12px] text-[#9CA3AF]">{sel.videoPrompt}</p>
                    )}
                  </div>
                </Surface>
              ) : null}

              {stage === "export" ? (
                <Surface>
                  <p className="text-[11px] font-semibold tracking-[0.16em] text-[#9CA3AF]">EXPORT</p>
                  <p className="mt-2 text-[13px] text-[#4B5563]">
                    {stats.videos} / {stats.total} clips ready. Stitch needs at least two.
                  </p>
                  <Btn
                    type="button"
                    className="mt-3"
                    disabled={busy === "stitch" || stats.videos < 2}
                    onClick={() => void stitch()}
                  >
                    {busy === "stitch" ? "Stitching…" : "Stitch episode"}
                  </Btn>
                  {open.episodeUrl ? <video src={open.episodeUrl} controls className="mt-3 w-full rounded-xl bg-black" /> : null}
                </Surface>
              ) : null}
            </>
          ) : null}
          {error ? <p className="mt-3 text-[12px] text-red-600">{error}</p> : null}
        </div>

        <aside>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-[#9CA3AF]">EPISODES</p>
          <div className="mt-2 space-y-2">
            {dramas.map((d) => {
              const v = d.shots.filter((s) => s.videoUrl).length;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    setOpenId(d.id);
                    setSelId(d.shots[0]?.id || "");
                  }}
                  className={cn(
                    "w-full rounded-xl border px-3 py-2 text-left text-[13px]",
                    openId === d.id ? "border-[#652DFF]" : "border-[#E6E8EE]",
                  )}
                >
                  <p className="font-semibold">{d.title}</p>
                  <p className="text-[11px] text-[#9CA3AF]">
                    {d.shots.length} shots · {v} clips · {d.stage}
                  </p>
                </button>
              );
            })}
            {!dramas.length ? <p className="text-[12px] text-[#9CA3AF]">None yet.</p> : null}
          </div>
          {open?.characterName ? (
            <p className="mt-4 text-[12px] text-[#4B5563]">
              Locked lead: <span className="font-semibold">{open.characterName}</span>
            </p>
          ) : null}
          <Link href="/create/characters" className="mt-3 inline-block text-[12px] font-semibold text-[#652DFF]">
            Characters →
          </Link>
        </aside>
      </div>
    </Page>
  );
}
