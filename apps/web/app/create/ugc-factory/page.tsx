"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useGpu } from "@/components/GpuStatus";
import { Btn, EmptyState, inputClass, Page, Pill, Surface } from "@/components/ui";
import { cn } from "@/lib/cn";
import { pollJob } from "@/lib/http";

type Product = { id: string; title: string; images: string[]; sourceUrl: string; affiliateUrl: string; features: string[] };
type Character = { id: string; name: string; identityUrl: string | null };
type Account = { id: string; platform: string; accountName: string; hasToken: boolean };
type ScriptPack = { title?: string; hook?: string; voiceover?: string; scenes?: string[]; cta?: string };
type ScriptJob = {
  id: string;
  status: string;
  input?: string;
  model?: string;
  error?: string;
  createdAt: string;
  script?: ScriptPack;
};

type Mode = "ai-creator" | "faceless";
type Angle = "review" | "unboxing" | "hold" | "talking" | "lifestyle";

const ANGLES: { id: Angle; label: string; hint: string }[] = [
  { id: "review", label: "Review", hint: "Honest take, first 2s hook" },
  { id: "unboxing", label: "Unboxing", hint: "Open, show, react" },
  { id: "hold", label: "Hold / showcase", hint: "Product in hand, readable SKU" },
  { id: "talking", label: "Talking head", hint: "To camera, product visible" },
  { id: "lifestyle", label: "Lifestyle", hint: "Use in scene, then CTA" },
];

type StepId = "product" | "creator" | "angle" | "script" | "still" | "clip" | "pack";

export default function UgcFactoryPage() {
  const gpu = useGpu();
  const [products, setProducts] = useState<Product[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [scripts, setScripts] = useState<ScriptJob[]>([]);
  const [productId, setProductId] = useState("");
  const [characterId, setCharacterId] = useState("");
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<Mode>("ai-creator");
  const [angle, setAngle] = useState<Angle>("review");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [stillUrl, setStillUrl] = useState("");
  const [clipUrl, setClipUrl] = useState("");
  const [voUrl, setVoUrl] = useState("");
  const [voices, setVoices] = useState<{ id: string; name: string }[]>([]);
  const [voiceId, setVoiceId] = useState("default");
  const [vsOnline, setVsOnline] = useState<boolean | null>(null);
  const [progress, setProgress] = useState("");
  const [draft, setDraft] = useState<ScriptPack>({});

  const product = products.find((p) => p.id === productId);
  const character = characters.find((c) => c.id === characterId);
  const latestScript = scripts.find((s) => s.status === "completed" && s.script?.voiceover);

  const load = useCallback(async () => {
    const [p, c, a, j] = await Promise.all([
      fetch("/api/commerce/products").then((r) => r.json()),
      fetch("/api/characters").then((r) => r.json()),
      fetch("/api/distribute/accounts").then((r) => r.json()),
      fetch("/api/jobs").then((r) => r.json()),
    ]);
    setProducts(p.products || []);
    setCharacters((c.characters || []).filter((x: Character) => x.identityUrl));
    setAccounts(a.accounts || []);
    setScripts((j.jobs || []).filter((x: { kind?: string }) => x.kind === "script"));
    try {
      const v = await fetch("/api/voices").then((r) => r.json());
      setVsOnline(Boolean(v.probe?.ok));
      const list = (v.voices || []) as { id: string; name: string }[];
      setVoices(list.length ? list : [{ id: "default", name: "Default" }]);
      if (list[0]?.id) setVoiceId((cur) => (list.some((x) => x.id === cur) ? cur : list[0].id));
    } catch {
      setVsOnline(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!latestScript?.script) return;
    setDraft({
      title: latestScript.script.title,
      hook: latestScript.script.hook,
      voiceover: latestScript.script.voiceover,
      scenes: latestScript.script.scenes,
      cta: latestScript.script.cta,
    });
  }, [latestScript?.id]);

  const vo = draft.voiceover || latestScript?.script?.voiceover || product?.title || "";
  const hook = draft.hook || latestScript?.script?.hook || "";
  const cta = draft.cta || latestScript?.script?.cta || "";

  const gates = useMemo(() => {
    const hasProduct = Boolean(product);
    const hasCreator = mode === "faceless" || Boolean(character?.identityUrl);
    const hasScript = Boolean(vo.trim());
    const hasStill = Boolean(stillUrl) || (mode === "faceless" && hasProduct);
    const hasClip = Boolean(clipUrl);
    const hasAccounts = accountIds.length > 0;
    return { hasProduct, hasCreator, hasScript, hasStill, hasClip, hasAccounts };
  }, [product, mode, character, vo, stillUrl, clipUrl, accountIds]);

  const steps: { id: StepId; n: string; label: string; done: boolean; ready: boolean }[] = [
    { id: "product", n: "1", label: "Product", done: gates.hasProduct, ready: true },
    { id: "creator", n: "2", label: "Creator", done: gates.hasCreator, ready: gates.hasProduct },
    { id: "angle", n: "3", label: "Angle", done: gates.hasProduct && gates.hasCreator, ready: gates.hasCreator },
    { id: "script", n: "4", label: "Script", done: gates.hasScript, ready: gates.hasProduct },
    { id: "still", n: "5", label: "Still", done: Boolean(stillUrl), ready: gates.hasScript && gates.hasCreator && !gpu.busy },
    { id: "clip", n: "6", label: "5s clip", done: gates.hasClip, ready: Boolean(stillUrl || character?.identityUrl) && !gpu.busy },
    { id: "pack", n: "7", label: "Calendar", done: false, ready: Boolean(clipUrl || stillUrl) && gates.hasAccounts },
  ];

  async function importUrl() {
    if (!url.trim()) return;
    setBusy("import");
    setError("");
    try {
      const res = await fetch("/api/commerce/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setUrl("");
      if (json.product?.id) setProductId(json.product.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function writeScript() {
    setBusy("script");
    setError("");
    try {
      const angleLine = `Angle: ${angle} UGC. Format SKU: 9:16 Short/Reels. Honest claims only.`;
      const res = await fetch("/api/jobs/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: productId || undefined,
          input: [angleLine, url || undefined].filter(Boolean).join("\n") || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "script failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function renderStill() {
    if (mode === "ai-creator" && (!character?.identityUrl || !product)) {
      setError("Pick a product and a locked character.");
      return;
    }
    if (mode === "faceless" && !product) {
      setError("Pick a product.");
      return;
    }
    setBusy("still");
    setError("");
    setProgress("product image…");
    try {
      const img = await fetch("/api/commerce/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "local-image", id: product!.id }),
      });
      const imgJson = await img.json();
      if (!img.ok) throw new Error(imgJson.error || "no product image");
      if (mode === "faceless") {
        setStillUrl(imgJson.imageUrl);
        setProgress("");
        return;
      }
      const res = await fetch(`/api/characters/${character!.id}?op=edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: character!.identityUrl,
          extraUrl: imgJson.imageUrl,
          mode: "product",
          prompt: `UGC 9:16 on-model still, ${angle} angle. ${vo}. Show the product clearly in frame. Photoreal. Not a new person.`,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "still failed");
      if (json.jobId) {
        const job = await pollJob(json.jobId, (j) => setProgress(j.progress || "still…"));
        if (job.status === "failed") throw new Error(job.error || "still failed");
        if (job.mediaUrl) setStillUrl(job.mediaUrl);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
      setProgress("");
    }
  }

  async function renderClip() {
    const imageUrl = stillUrl || character?.identityUrl;
    if (!imageUrl) {
      setError("Render a still first (or lock a character identity).");
      return;
    }
    setBusy("clip");
    setError("");
    setProgress("H3 I2V 5s…");
    try {
      const res = await fetch("/api/jobs/motion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageUrl,
          engineId: "minimax-h3",
          durationSec: 5,
          prompt: `9:16 UGC ${angle} ad. ${vo}. Natural motion, blink, product visible. Photoreal.`,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "clip failed");
      const job = json.status === "running" || res.status === 202 ? await pollJob(json.id, (j) => setProgress(j.progress || "clip…")) : json;
      if (job.status === "failed") throw new Error(job.error || "clip failed");
      if (job.mediaUrl) setClipUrl(job.mediaUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
      setProgress("");
    }
  }

  async function generateVo() {
    if (!vo.trim()) {
      setError("Write the voiceover script first.");
      return;
    }
    setBusy("vo");
    setError("");
    setProgress(gpu.busy ? `Waiting for GPU (${gpu.label})…` : "Queued VO…");
    try {
      const res = await fetch("/api/jobs/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: vo,
          voice: voiceId,
          clipUrl: clipUrl || undefined,
          productId: productId || undefined,
          characterId: characterId || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "VO failed");
      const job = json.status === "queued" || json.status === "running" || res.status === 202
        ? await pollJob(json.id, (j) => setProgress(j.progress || "VO…"))
        : json;
      if (job.status === "failed") throw new Error(job.error || "VO failed");
      const url = job.mediaUrl as string | undefined;
      if (url?.endsWith(".mp4")) setClipUrl(url);
      else if (url) setVoUrl(url);
      setNotice(url?.endsWith(".mp4") ? "VO muxed onto clip." : "VO ready.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
      setProgress("");
    }
  }

  async function sendToCalendar() {
    const media = clipUrl || stillUrl;
    if (!media || !accountIds.length) {
      setError("Need a still or clip, and at least one tester account.");
      return;
    }
    setBusy("cal");
    setError("");
    try {
      const res = await fetch("/api/distribute/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountIds,
          characterId: characterId || undefined,
          productId: productId || undefined,
          mediaUrl: media,
          caption: [hook, cta, product?.affiliateUrl, "#ad"].filter(Boolean).join("\n\n"),
          title: draft.title || product?.title,
          containsSyntheticMedia: true,
          approval: "pending",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setNotice("Queued on Calendar as pending. Approve in Queue — not Autopilot.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  return (
    <Page
      kicker="CREATE · UGC FACTORY"
      title="UGC Factory"
      description="Faceless VO only. Talent + SKU affiliate video is Character workspace → Affiliate video (Qwen 3.7 Plus script)."
    >
      <ol className="mb-6 flex flex-wrap gap-1.5">
        {steps.map((s) => (
          <li key={s.id}>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                s.done && "bg-[#ECFDF3] text-[#15803D]",
                !s.done && s.ready && "bg-[#F5F3FF] text-[#652DFF]",
                !s.done && !s.ready && "bg-[#F3F4F8] text-[#9CA3AF]",
              )}
            >
              <span className="tabular-nums">{s.n}</span>
              {s.label}
            </span>
          </li>
        ))}
      </ol>

      {error ? <p className="mb-4 text-sm text-[#B91C1C]">{error}</p> : null}
      {notice ? <p className="mb-4 text-sm text-[#15803D]">{notice}</p> : null}
      {progress ? <p className="mb-4 text-[12px] text-[#6B7280]">{progress}. Safe to leave this page — job stays on the GPU box.</p> : null}
      {gpu.busy ? (
        <p className="mb-4 text-[12px] text-[#C2410C]">
          GPU busy ({gpu.label} {gpu.elapsed}). Still/clip wait until that job finishes.
        </p>
      ) : null}

      <div className="grid max-w-5xl gap-4">
        <Surface>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">1 · Product</p>
            {product ? <Pill tone="ready">Ready</Pill> : <Pill>Required</Pill>}
          </div>
          <p className="mt-1 text-[13px] text-[#6B7280]">Paste an Amazon/Shopee URL. Claims later must stay inside these fields.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              className={inputClass + " mt-0 min-w-[16rem] flex-1"}
              placeholder="https://amazon.com/…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <Btn type="button" disabled={busy === "import"} onClick={() => void importUrl()}>
              {busy === "import" ? "Importing…" : "Import URL"}
            </Btn>
          </div>
          <select className={inputClass} value={productId} onChange={(e) => setProductId(e.target.value)}>
            <option value="">Select product…</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
          {product ? (
            <div className="mt-3 flex gap-3">
              {product.images[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={product.images[0]} alt="" className="h-16 w-16 rounded-lg object-cover" />
              ) : null}
              <div className="min-w-0 text-[12px] text-[#6B7280]">
                <p className="font-semibold text-[#111827]">{product.title}</p>
                {product.affiliateUrl ? <p className="truncate">{product.affiliateUrl}</p> : null}
              </div>
            </div>
          ) : null}
        </Surface>

        <Surface>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">2 · Mode + creator</p>
            {gates.hasCreator ? <Pill tone="ready">Ready</Pill> : <Pill tone="warn">Blocked</Pill>}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {(
              [
                ["ai-creator", "AI Creator", "Locked character + product still"],
                ["faceless", "Faceless", "Product media only, no face lock"],
              ] as const
            ).map(([id, label, hint]) => (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className={cn(
                  "rounded-xl border px-3 py-2 text-left text-[12px]",
                  mode === id ? "border-[#652DFF] bg-[#F5F3FF]" : "border-[#E6E8EE]",
                )}
              >
                <span className="block font-semibold">{label}</span>
                <span className="text-[#6B7280]">{hint}</span>
              </button>
            ))}
          </div>
          {mode === "ai-creator" ? (
            <>
              <select className={inputClass} value={characterId} onChange={(e) => setCharacterId(e.target.value)}>
                <option value="">Select locked identity…</option>
                {characters.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {character?.identityUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={character.identityUrl} alt="" className="mt-3 h-20 w-16 rounded-lg object-cover" />
              ) : !characters.length ? (
                <p className="mt-2 text-[13px] text-[#6B7280]">
                  No identity yet. <Link href="/create/characters" className="font-semibold text-[#652DFF]">Create a character</Link>.
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-3 text-[13px] text-[#6B7280]">Faceless uses the product image as the still. Voice/captions overlay comes later.</p>
          )}
        </Surface>

        <Surface>
          <p className="text-sm font-semibold">3 · Angle · 9:16 SKU</p>
          <p className="mt-1 text-[13px] text-[#6B7280]">One angle per run. Format locked to 9:16 Short/Reels for this factory slice.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {ANGLES.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setAngle(a.id)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[12px] font-semibold",
                  angle === a.id ? "border-[#652DFF] bg-[#652DFF] text-white" : "border-[#E6E8EE] text-[#374151]",
                )}
              >
                {a.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[12px] text-[#6B7280]">{ANGLES.find((a) => a.id === angle)?.hint}</p>
        </Surface>

        <Surface>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">4 · Script</p>
            {gates.hasScript ? <Pill tone="ready">Ready</Pill> : <Pill>Write</Pill>}
          </div>
          <Btn type="button" disabled={busy === "script" || (!productId && !url.trim())} onClick={() => void writeScript()}>
            {busy === "script" ? "Writing…" : latestScript ? "Rewrite script" : "Write UGC script"}
          </Btn>
          {gates.hasScript ? (
            <div className="mt-3 grid gap-2">
              <label className="text-[11px] font-semibold text-[#6B7280]">
                Title
                <input className={inputClass} value={draft.title || ""} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
              </label>
              <label className="text-[11px] font-semibold text-[#6B7280]">
                Hook (first 2s)
                <textarea className={inputClass} rows={2} value={draft.hook || ""} onChange={(e) => setDraft((d) => ({ ...d, hook: e.target.value }))} />
              </label>
              <label className="text-[11px] font-semibold text-[#6B7280]">
                Voiceover
                <textarea className={inputClass} rows={6} value={draft.voiceover || ""} onChange={(e) => setDraft((d) => ({ ...d, voiceover: e.target.value }))} />
              </label>
              <label className="text-[11px] font-semibold text-[#6B7280]">
                CTA + disclosure
                <textarea className={inputClass} rows={2} value={draft.cta || ""} onChange={(e) => setDraft((d) => ({ ...d, cta: e.target.value }))} />
              </label>
            </div>
          ) : (
            <EmptyState title="No script yet" body="Import a product, pick an angle, then Write UGC script." />
          )}
        </Surface>

        <Surface>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">4b · Voiceover (VoiceStudio)</p>
            {voUrl ? <Pill tone="ready">VO</Pill> : vsOnline ? <Pill tone="ready">:3900</Pill> : <Pill tone="warn">VoiceStudio off</Pill>}
          </div>
          <p className="mt-1 text-[13px] text-[#6B7280]">
            OpenAI <code className="text-[12px]">/v1/audio/speech</code> on localhost:3900. Job waits if Comfy/Kling/Qwen is using the 3060.
          </p>
          <label className="mt-3 block text-[11px] font-semibold text-[#6B7280]">
            Voice
            <select className={inputClass} value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
              {(voices.length ? voices : [{ id: "default", name: "Default" }]).map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-3">
            <Btn type="button" disabled={Boolean(busy) || !vo.trim()} onClick={() => void generateVo()}>
              {busy === "vo" ? "Generating VO…" : clipUrl ? "Generate VO + mux onto clip" : "Generate VO"}
            </Btn>
          </div>
          {voUrl ? <audio className="mt-3 w-full" src={voUrl} controls /> : null}
        </Surface>

        <Surface>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">5–6 · Still then 5s clip</p>
            {stillUrl ? <Pill tone="ready">Still</Pill> : null}
            {clipUrl ? <Pill tone="ready">Clip</Pill> : null}
          </div>
          <p className="mt-1 text-[13px] text-[#6B7280]">
            {mode === "faceless" ? "Still = product photo. " : "On-model still = character + product image. "}
            Clip = MiniMax H3 I2V 5s. VO waits for this GPU job to finish.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Btn type="button" disabled={Boolean(busy) || gpu.busy || !product || (mode === "ai-creator" && !character)} onClick={() => void renderStill()}>
              {busy === "still" ? "Rendering still…" : mode === "faceless" ? "Use product still" : "Render on-model still"}
            </Btn>
            <Btn type="button" disabled={Boolean(busy) || gpu.busy || !(stillUrl || character?.identityUrl)} onClick={() => void renderClip()}>
              {busy === "clip" ? "Rendering clip…" : "Render 5s UGC clip"}
            </Btn>
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            {stillUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={stillUrl} alt="" className="max-h-56 rounded-xl border border-[#E6E8EE] object-contain" />
            ) : null}
            {clipUrl ? <video src={clipUrl} className="max-h-56 rounded-xl border border-[#E6E8EE]" controls /> : null}
          </div>
        </Surface>

        <Surface>
          <p className="text-sm font-semibold">7 · Pack → Calendar</p>
          <p className="mt-1 text-[13px] text-[#6B7280]">
            Pack = still or clip (with VO if muxed) + affiliate URL. Approve in Queue.
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            {accounts.map((a) => (
              <label key={a.id} className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={accountIds.includes(a.id)}
                  onChange={() => setAccountIds((cur) => (cur.includes(a.id) ? cur.filter((x) => x !== a.id) : [...cur, a.id]))}
                />
                {a.accountName} · {a.platform}
              </label>
            ))}
            {!accounts.length ? (
              <Link href="/distribute/accounts" className="text-[13px] font-semibold text-[#652DFF]">
                Connect testers first
              </Link>
            ) : null}
          </div>
          <div className="mt-3">
            <Btn type="button" disabled={Boolean(busy) || !(clipUrl || stillUrl) || !accountIds.length} onClick={() => void sendToCalendar()}>
              {busy === "cal" ? "Queueing…" : "Send to Calendar"}
            </Btn>
          </div>
        </Surface>
      </div>
    </Page>
  );
}
