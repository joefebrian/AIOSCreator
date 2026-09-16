"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CharacterIdentityStage } from "@/components/create/CharacterIdentityStage";

import { DEFAULT_INFLUENCER, InfluencerForm } from "@/components/create/InfluencerForm";
import { TRANSFORM_PLATE_PROMPT } from "@/lib/character-prompts";
import type { Character } from "@/lib/character-types";
import { cn } from "@/lib/cn";
import { Page } from "@/components/ui";
import { pollJob, readJson } from "@/lib/http";
import { AspectPicker } from "@/components/AspectPicker";
import { compileInfluencerPrompt, type InfluencerSpec } from "@/lib/influencer";

export default function NewCharacterPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"generator" | "upload">("generator");
  const [name, setName] = useState("");
  const [spec, setSpec] = useState<InfluencerSpec>(DEFAULT_INFLUENCER);
  const [prompt, setPrompt] = useState(TRANSFORM_PLATE_PROMPT);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [faceFile, setFaceFile] = useState<File | null>(null);
  const [facePreview, setFacePreview] = useState("");
  const [row, setRow] = useState<Character | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [kidPhoto, setKidPhoto] = useState(false);
  const [aspect, setAspect] = useState("9:16");

  function onPick(f: File) {
    setFile(f);
    setPreview((prev) => {
      if (prev.startsWith("blob:")) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
    setError("");
  }

  async function ensureCharacter(sourcePrompt: string) {
    if (row) return row;
    const created = await fetch("/api/characters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        source: file || faceFile ? "transform" : "prompt",
        sourcePrompt,
      }),
    });
    const json = await readJson<Character & { error?: string }>(created);
    if (!created.ok) throw new Error(json.error || "create failed");
    setRow(json);
    if (name.trim() && json.name !== name.trim()) {
      await fetch(`/api/characters/${json.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
    }
    return json as Character;
  }

  async function generateFromSpec() {
    setBusy(true);
    setError("");
    try {
      const text = compileInfluencerPrompt(spec);
      const char = await ensureCharacter(text);
      let res: Response;
      if (faceFile) {
        const form = new FormData();
        form.append("mode", "transform");
        form.append("keepFace", "1");
        form.append("prompt", text);
        form.append("aspect", aspect);
        form.append("file", faceFile);
        res = await fetch(`/api/characters/${char.id}?op=identity`, { method: "POST", body: form });
      } else {
        res = await fetch(`/api/characters/${char.id}?op=identity`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: text, aspect }),
        });
      }
      const json = await readJson<Character & { jobId?: string; pending?: string; error?: string }>(res);
      if (!res.ok) throw new Error(json.error || "identity failed");
      if (json.jobId && (res.status === 202 || json.pending)) {
        const job = await pollJob(json.jobId);
        if (job.status === "failed") throw new Error(job.error || "failed");
        const fresh = await fetch(`/api/characters/${char.id}`).then((r) => r.json());
        setRow(fresh);
        return;
      }
      setRow(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function generateFromUpload() {
    setBusy(true);
    setError("");
    try {
      const text = kidPhoto ? `${prompt}\nage 8, SFW child portrait, fully clothed` : prompt;
      const char = await ensureCharacter(text);
      if (file) {
        const form = new FormData();
        form.append("mode", "transform");
        form.append("prompt", text);
        form.append("aspect", aspect);
        form.append("file", file);
        const res = await fetch(`/api/characters/${char.id}?op=identity`, { method: "POST", body: form });
        const json = await readJson<Character & { error?: string }>(res);
        if (!res.ok) throw new Error(json.error || "identity failed");
        setRow(json);
        setFile(null);
      } else {
        throw new Error("Drop a photo first, or use the influencer generator.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function lockAsIs() {
    if (!file && !row?.sourceUrl) {
      setError("Drop a photo first.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const text = kidPhoto ? `${prompt}\nage 8, SFW child portrait, fully clothed` : prompt;
      const char = await ensureCharacter(text);
      const form = new FormData();
      form.append("mode", "lock");
      form.append("prompt", text);
      if (file) form.append("file", file);
      else {
        const blob = await fetch(row!.sourceUrl!).then((r) => r.blob());
        form.append("file", new File([blob], "source.png", { type: blob.type || "image/png" }));
      }
      const res = await fetch(`/api/characters/${char.id}?op=identity`, { method: "POST", body: form });
      const json = await readJson<Character & { error?: string }>(res);
      if (!res.ok) throw new Error(json.error || "lock failed");
      setRow(json);
      setFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function goSet() {
    if (!row) return;
    if (name.trim()) {
      void fetch(`/api/characters/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      }).finally(() => router.push(`/create/characters/${row.id}/workspace?tool=generate-image`));
      return;
    }
    router.push(`/create/characters/${row.id}/workspace?tool=generate-image`);
  }

  const sourceUrl = file ? preview : row?.sourceUrl || "";
  const identityUrl = row?.identityUrl || "";

  return (
    <Page
      kicker="CREATE · CHARACTERS"
      title="New character"
      description="Default: drop a face, tweak sliders, generate the identity plate. Upload is for lock-as-is or physique-only."
      actions={
        <Link href="/create/characters" className="text-[13px] font-semibold text-[#652DFF]">
          ← Library
        </Link>
      }
    >

      <p className="mt-4 text-[12px] text-[#6B7280]">Stills locked to GPT Image 2.5 Sunburst.</p>

      <label className="mt-6 block max-w-sm text-[12px] text-[#6B7280]">
        Model name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Lili"
          maxLength={32}
          className="mt-1 w-full rounded-lg border border-[#E6E8EE] bg-white px-3 py-2 text-sm outline-none"
        />
      </label>

      <div className="mt-6 grid max-w-3xl gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setMode("generator")}
          className={cn(
            "rounded-2xl border-2 p-4 text-left",
            mode === "generator" ? "border-[#652DFF] bg-[#652DFF]/5" : "border-[#E6E8EE] bg-white",
          )}
        >
          <p className="text-[10px] font-semibold tracking-[0.16em] text-[#652DFF]">DEFAULT</p>
          <p className="mt-1 text-sm font-semibold">AI influencer generator</p>
          <p className="mt-1 text-[12px] text-[#6B7280]">Kid, teen, or adult. Face ref + sliders. Empty face = invent. Kids stay SFW.</p>
        </button>
        <button
          type="button"
          onClick={() => setMode("upload")}
          className={cn(
            "rounded-2xl border-2 p-4 text-left",
            mode === "upload" ? "border-[#652DFF] bg-[#652DFF]/5" : "border-[#E6E8EE] bg-white",
          )}
        >
          <p className="text-sm font-semibold">Upload image</p>
          <p className="mt-1 text-[12px] text-[#6B7280]">Lock as-is, or new person with the same build.</p>
        </button>
      </div>

      {mode === "generator" ? (
        <div className="mt-8 grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
          <div>
            <p className="mb-2 text-[11px] font-semibold tracking-[0.18em] text-[#9CA3AF]">SELECTED IMAGE</p>
            <div className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-[#E6E8EE] bg-[#F3F4F8]">
              {identityUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`${identityUrl}?t=${encodeURIComponent(row?.updatedAt || "")}`}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center px-4 text-center text-[12px] text-[#9CA3AF]">
                  {busy ? "Generating…" : "Portrait lands here"}
                </div>
              )}
            </div>
            <p className="mt-4 text-[11px] font-semibold tracking-[0.18em] text-[#652DFF]">FACE REF · DEFAULT PATH</p>
            <p className="mt-1 text-[11px] text-[#6B7280]">Keep this face. Sliders restyle hair, makeup, wardrobe, body. Skip = invent from sliders.</p>
            <label className="mt-2 flex cursor-pointer flex-col items-center overflow-hidden rounded-2xl border-2 border-dashed border-[#652DFF]/40 bg-white">
              {facePreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={facePreview} alt="" className="aspect-[3/4] w-full object-cover" />
              ) : (
                <span className="px-3 py-8 text-center text-[12px] text-[#9CA3AF]">Drop a face / bust photo</span>
              )}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setFaceFile(f);
                  setFacePreview((prev) => {
                    if (prev.startsWith("blob:")) URL.revokeObjectURL(prev);
                    return URL.createObjectURL(f);
                  });
                }}
              />
            </label>
            {faceFile ? (
              <button
                type="button"
                className="mt-1 text-[11px] text-[#6B7280]"
                onClick={() => {
                  setFaceFile(null);
                  setFacePreview((prev) => {
                    if (prev.startsWith("blob:")) URL.revokeObjectURL(prev);
                    return "";
                  });
                }}
              >
                Remove face ref
              </button>
            ) : null}
            {identityUrl ? (
              <button
                type="button"
                onClick={goSet}
                className="mt-3 w-full rounded-lg bg-[#0B0F2B] px-4 py-2.5 text-sm font-semibold text-white"
              >
                Select this image as identity →
              </button>
            ) : null}
            {error ? <p className="mt-2 text-[12px] text-red-600">{error}</p> : null}
            <div className="mt-4">
              <AspectPicker value={aspect} onChange={setAspect} />
            </div>
          </div>
          <InfluencerForm
            spec={spec}
            onChange={setSpec}
            busy={busy}
            onGenerate={() => void generateFromSpec()}
            onReset={() => setSpec(DEFAULT_INFLUENCER)}
          />
        </div>
      ) : (
        <div className="mt-8">
          <label className="mb-3 flex items-center gap-2 text-[13px] font-semibold">
            <input type="checkbox" checked={kidPhoto} onChange={(e) => setKidPhoto(e.target.checked)} />
            Child / teen photo · SFW only
          </label>
          <CharacterIdentityStage
            sourceUrl={sourceUrl}
            identityUrl={identityUrl}
            stamp={row?.updatedAt}
            prompt={prompt}
            onPrompt={setPrompt}
            busy={busy}
            error={error}
            onPick={onPick}
            onGenerate={() => void generateFromUpload()}
            onLock={() => void lockAsIs()}
            extra={
              identityUrl ? (
                <button
                  type="button"
                  onClick={goSet}
                  className="rounded-lg bg-[#0B0F2B] px-4 py-2.5 text-sm font-semibold text-white"
                >
                  Select this image as identity →
                </button>
              ) : null
            }
          />
        </div>
      )}
    </Page>
  );
}
