"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { CharacterIdentityStage } from "@/components/create/CharacterIdentityStage";

import { IDENTITY_PLATE_PROMPT, SLOT_GROUPS, TRANSFORM_PLATE_PROMPT } from "@/lib/character-prompts";
import type { Character, CharacterSlot } from "@/lib/character-types";
import { CountryChips } from "@/components/CountryChips";
import { AspectPicker } from "@/components/AspectPicker";
import { Page } from "@/components/ui";
import { formatElapsed, pollJob, readJson } from "@/lib/http";

export default function CharacterEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [row, setRow] = useState<Character | null>(null);
  const [name, setName] = useState("");
  const [prompt, setPrompt] = useState(IDENTITY_PLATE_PROMPT);
  const [localRef, setLocalRef] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState("");
  const [progress, setProgress] = useState("");
  const [aspect, setAspect] = useState("9:16");
  const [clips, setClips] = useState<{ id: string; mediaUrl?: string; model?: string; createdAt: string; characterId?: string }[]>([]);

  const load = useCallback(() => {
    fetch(`/api/characters/${id}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "not found");
        setRow(j as Character);
        setName(j.name);
        setPrompt(j.sourcePrompt || IDENTITY_PLATE_PROMPT);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (row?.identityUrl) {
      router.replace(`/create/characters/${id}/workspace?tool=generate-image`);
    }
  }, [row?.identityUrl, id, router]);

  useEffect(() => {
    fetch("/api/jobs")
      .then((r) => r.json())
      .then((j) => {
        const all = (j.jobs || []) as { id: string; kind: string; status: string; mediaUrl?: string; model?: string; createdAt: string; characterId?: string; input?: string }[];
        setClips(
          all.filter(
            (x) =>
              x.kind === "motion" &&
              x.status === "completed" &&
              x.mediaUrl &&
              (x.characterId === id || (x.input || "").includes(id)),
          ),
        );
      })
      .catch(() => undefined);
  }, [id]);

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

  async function awaitCharacterJob(res: Response, json: Character & { jobId?: string; pending?: string; error?: string }) {
    if (!res.ok) throw new Error(json.error || "failed");
    if (json.jobId && (res.status === 202 || json.pending)) {
      const job = await pollJob(json.jobId, (j) => setProgress(j.progress || ""));
      if (job.status === "failed") throw new Error(job.error || "failed");
      load();
      return;
    }
    setRow(json);
  }

  async function saveName() {
    if (!row) return;
    const res = await fetch(`/api/characters/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error);
    setRow(json);
  }

  function onPick(file: File) {
    setPendingFile(file);
    setLocalRef((prev) => {
      if (prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
    setError("");
  }

  async function generateIdentity() {
    setBusy("identity");
    setError("");
    try {
      if (pendingFile) {
        const form = new FormData();
        form.append("mode", "transform");
        form.append("prompt", prompt || TRANSFORM_PLATE_PROMPT);
        form.append("aspect", aspect);
        form.append("file", pendingFile);
        const res = await fetch(`/api/characters/${id}?op=identity`, { method: "POST", body: form });
        const json = await readJson<Character & { jobId?: string; pending?: string; error?: string }>(res);
        await awaitCharacterJob(res, json);
        setPendingFile(null);
      } else {
        const res = await fetch(`/api/characters/${id}?op=identity`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: prompt || (row?.sourceUrl ? TRANSFORM_PLATE_PROMPT : IDENTITY_PLATE_PROMPT),
            referenceUrl: row?.sourceUrl || undefined,
            aspect,
          }),
        });
        const json = await readJson<Character & { jobId?: string; pending?: string; error?: string }>(res);
        await awaitCharacterJob(res, json);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function lockAsIs() {
    const file = pendingFile;
    if (!file && !row?.sourceUrl) {
      setError("Drop a photo first.");
      return;
    }
    setBusy("identity");
    setError("");
    try {
      const form = new FormData();
      form.append("mode", "lock");
      if (file) form.append("file", file);
      else {
        const blob = await fetch(row!.sourceUrl!).then((r) => r.blob());
        form.append("file", new File([blob], "source.png", { type: blob.type || "image/png" }));
      }
      const res = await fetch(`/api/characters/${id}?op=identity`, { method: "POST", body: form });
      const json = await readJson<Character & { jobId?: string; pending?: string; error?: string }>(res);
      await awaitCharacterJob(res, json);
      setPendingFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function genSlot(slot: CharacterSlot) {
    setBusy(slot.key);
    setError("");
    try {
      const res = await fetch(`/api/characters/${id}?op=slot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: slot.key, prompt: slot.prompt }),
      });
      const json = await readJson<Character & { jobId?: string; pending?: string; error?: string }>(res);
      await awaitCharacterJob(res, json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function genRemaining() {
    if (!row) return;
    const pending = row.slots.filter((s) => !s.url);
    const stills = pending.filter((s) => s.key !== "sheet");
    const sheet = pending.find((s) => s.key === "sheet");
    for (const slot of stills) {
      await genSlot(slot);
    }
    if (sheet) await genSlot(sheet);
  }

  async function patchPrompt(slot: CharacterSlot, next: string) {
    setRow((cur) =>
      cur ? { ...cur, slots: cur.slots.map((s) => (s.key === slot.key ? { ...s, prompt: next } : s)) } : cur,
    );
  }

  async function remove() {
    if (!confirm("Remove this character from the library? Media files stay on disk.")) return;
    const res = await fetch(`/api/characters/${id}`, { method: "DELETE" });
    if (res.ok) router.push("/create/characters");
  }

  if (row?.identityUrl) {
    return <p className="px-6 py-10 text-sm text-[#6B7280]">Opening workspace…</p>;
  }

  const filled = row ? row.slots.filter((s) => s.url).length : 0;

  return (
    <Page
      kicker="CREATE · CHARACTERS"
      title={
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void saveName().catch((err) => setError(err instanceof Error ? err.message : String(err)))}
          className="bg-transparent text-2xl font-black outline-none"
        />
      }
      description="Identity first. Continuity sheet is assembled from locked stills — it is not painted by the model."
      actions={
        <>
          <Link href="/create/characters" className="text-[13px] font-semibold text-[#652DFF]">
            ← Library
          </Link>
          <Link href="/create/motion" className="text-[13px] font-semibold text-[#652DFF]">
            MotionControl →
          </Link>
        </>
      }
    >

      <p className="mt-4 text-[12px] text-[#6B7280]">Stills locked to GPT Image 2.5 Sunburst.</p>
      <div className="mt-4 max-w-3xl">
        <p className="text-[12px] font-semibold text-[#6B7280]">Country</p>
        <p className="mt-1 text-[12px] text-[#6B7280]">Countries this person can join on a campaign.</p>
        <div className="mt-1.5">
          <CountryChips
            value={row?.markets || []}
            onChange={(next) => {
              setRow((cur) => (cur ? { ...cur, markets: next as Character["markets"] } : cur));
              void fetch(`/api/characters/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ markets: next }),
              }).then(async (res) => {
                const json = await res.json();
                if (!res.ok) throw new Error(json.error || "Save failed.");
                setRow(json as Character);
              }).catch((err) => setError(err instanceof Error ? err.message : String(err)));
            }}
          />
        </div>
      </div>
      <h2 className="mt-8 text-[11px] font-semibold tracking-[0.18em] text-[#9CA3AF]">1 · BEFORE / AFTER</h2>
      <div className="mt-3">
        <CharacterIdentityStage
          sourceUrl={pendingFile ? localRef : row?.sourceUrl || ""}
          identityUrl={row?.identityUrl || ""}
          stamp={row?.updatedAt}
          prompt={prompt}
          onPrompt={setPrompt}
          busy={busy === "identity"}
          error={error}
          onPick={onPick}
          onGenerate={() => void generateIdentity()}
          onLock={() => void lockAsIs()}
        />
        <div className="mt-4 max-w-xl">
          <AspectPicker value={aspect} onChange={setAspect} />
        </div>
      </div>
      {busy ? (
        <p className="mt-3 max-w-3xl text-[12px] text-[#6B7280]">
          Running on this PC · {elapsed || "0s"}
          {progress ? ` · ${progress}` : ""}. Safe to close the tab — the job stays on the GPU box.
        </p>
      ) : null}

      <div className="mt-10 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-[11px] font-semibold tracking-[0.18em] text-[#9CA3AF]">SET</h2>
          <p className="mt-1 text-[12px] text-[#6B7280]">
            {filled}/{row?.slots.length ?? 0} locked. Sheet uses identity + stills GEN’d after it. Old phone stills stay
            in the set until you Re-GEN each one.
          </p>
        </div>
        <button
          type="button"
          disabled={Boolean(busy) || !row?.identityUrl}
          onClick={() => void genRemaining()}
          className="rounded-lg bg-[#652DFF] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy && busy !== "identity" ? `GEN ${busy}…` : "GEN remaining set"}
        </button>
      </div>
      {SLOT_GROUPS.map((g) => {
        const slots = row?.slots.filter((s) => s.group === g.id) ?? [];
        if (!slots.length) return null;
        return (
          <section key={g.id} className="mt-10">
            <h2 className="text-[11px] font-semibold tracking-[0.18em] text-[#9CA3AF]">{g.label}</h2>
            <p className="mt-1 text-[12px] text-[#6B7280]">{g.hint}</p>
            <SlotGrid
              slots={slots}
              busy={busy}
              identity={Boolean(row?.identityUrl)}
              wide={g.id === "bible"}
              stamp={row?.updatedAt}
              onPrompt={patchPrompt}
              onGen={genSlot}
            />
          </section>
        );
      })}

      <button type="button" onClick={() => void remove()} className="mt-10 text-[12px] text-[#9CA3AF]">
        Remove from library
      </button>
    </Page>
  );
}

function SlotGrid({
  slots,
  busy,
  identity,
  wide,
  stamp,
  onPrompt,
  onGen,
}: {
  slots: CharacterSlot[];
  busy: string;
  identity: boolean;
  wide?: boolean;
  stamp?: string;
  onPrompt: (slot: CharacterSlot, next: string) => void;
  onGen: (slot: CharacterSlot) => Promise<void>;
}) {
  return (
    <div className={`mt-3 grid max-w-5xl gap-4 ${wide ? "grid-cols-1 md:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3"}`}>
      {slots.map((slot) => (
        <div
          key={slot.key}
          className={`overflow-hidden rounded-2xl border border-[#E6E8EE] bg-white ${wide ? "md:col-span-2" : ""}`}
        >
          <div className={`relative bg-[#F3F4F8] ${wide ? "aspect-[4/5] max-h-[36rem]" : "aspect-[3/4]"}`}>
            {slot.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={stamp ? `${slot.url}${slot.url.includes("?") ? "&" : "?"}t=${encodeURIComponent(stamp)}` : slot.url}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-[11px] tracking-[0.16em] text-[#9CA3AF]">
                {slot.label.toUpperCase()}
              </div>
            )}
            {busy === slot.key ? (
              <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-[12px] font-semibold">
                Generating…
              </div>
            ) : null}
          </div>
          <div className="space-y-2 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B7280]">{slot.label}</p>
              <button
                type="button"
                disabled={Boolean(busy) || !identity}
                onClick={() => void onGen(slot)}
                className="rounded-md bg-[#652DFF] px-2 py-0.5 text-[11px] font-semibold text-white disabled:opacity-50"
              >
                {slot.url ? "Re-GEN" : "GEN"}
              </button>
            </div>
            <textarea
              value={slot.prompt}
              onChange={(e) => onPrompt(slot, e.target.value)}
              rows={wide ? 8 : 3}
              className="w-full resize-none rounded-md bg-[#F8FAFC] p-2 text-[12px] leading-snug outline-none"
            />
            {!identity ? <p className="text-[11px] text-[#9CA3AF]">Lock a character first.</p> : null}
          </div>
        </div>
      ))}
    </div>
  );
}
