"use client";

import { useEffect, useMemo, useState } from "react";
import { studioVideoPrompt } from "@/lib/character-prompts";
import { pollJob } from "@/lib/http";
import { thumbSrc } from "@/lib/media-url";
import { inferCategory } from "@/lib/product-category";
import { cn } from "@/lib/cn";
import { i2vPromptFromScript, type ScriptPack } from "@/lib/ugc-script";

type Product = {
  id: string;
  title: string;
  images: string[];
  imageRoles?: ("identity" | "detail" | "usage" | "packaging" | "other")[];
  category?: string;
  affiliateUrl?: string;
  sourceUrl?: string;
};

const ANGLES = [
  { id: "hold", label: "Hold", hint: "SKU in hand / on body, readable" },
  { id: "review", label: "Review", hint: "Honest take, hook in 2s" },
  { id: "unboxing", label: "Unboxing", hint: "Open, show, react" },
  { id: "talking", label: "Talking", hint: "To camera, product visible" },
  { id: "lifestyle", label: "Lifestyle", hint: "Use in scene, then CTA" },
] as const;

export function AffiliateCanvas({
  name,
  characterId,
  identity,
  stills,
  engineId,
  durationSec = 8,
  onMotion,
}: {
  name: string;
  characterId: string;
  identity: string | null;
  stills: { url: string; label: string }[];
  engineId?: string;
  durationSec?: number;
  onMotion: (opts: {
    imageUrl: string;
    prompt: string;
    durationSec: number;
    engineId?: string;
    sound?: boolean;
    extraUrls?: string[];
    productId?: string;
  }) => void;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState("");
  const [angle, setAngle] = useState<(typeof ANGLES)[number]["id"]>("hold");
  const [campaignFormat, setCampaignFormat] = useState("");
  const [script, setScript] = useState<ScriptPack | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const plates = useMemo(() => {
    const seen = new Set<string>();
    const out: { url: string; label: string }[] = [];
    for (const s of stills) {
      if (!s.url || seen.has(s.url)) continue;
      seen.add(s.url);
      out.push(s);
    }
    return out.slice(0, 10);
  }, [stills]);
  const [still, setStill] = useState(plates[0]?.url || identity || "");

  useEffect(() => {
    const format = new URLSearchParams(window.location.search).get("format") || "";
    setCampaignFormat(format);
    const shot = ANGLES.find((row) => row.label.toLowerCase() === format.toLowerCase());
    if (shot) setAngle(shot.id);
    else if (/unbox/i.test(format)) setAngle("unboxing");
    else if (/review/i.test(format)) setAngle("review");
  }, []);

  useEffect(() => {
    fetch("/api/commerce/products")
      .then((r) => r.json())
      .then((j) => {
        const list = (j.products || []) as Product[];
        setProducts(list);
        const q = new URLSearchParams(window.location.search).get("product");
        if (q && list.some((p) => p.id === q)) setProductId(q);
        else if (list[0]) setProductId(list[0].id);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!still) setStill(plates[0]?.url || identity || "");
  }, [plates, identity, still]);

  const product = products.find((p) => p.id === productId);
  const identityIndex = product?.imageRoles?.indexOf("identity") ?? -1;
  const skuImg = identityIndex >= 0 ? product?.images?.[identityIndex] || "" : "";

  function generateClip() {
    const imageUrl = still || plates[0]?.url || identity || "";
    if (!imageUrl) {
      setError("Pick a still first — clip is I2V from that frame.");
      return;
    }
    if (!script?.hook?.trim()) {
      setError("Write the script first. HOOK (0–2s) is required.");
      return;
    }
    const prompt = i2vPromptFromScript(
      script,
      studioVideoPrompt({ character: name, product: product?.title, durationSec, aspect: "9:16" }),
    );
    onMotion({
      imageUrl,
      prompt,
      durationSec,
      engineId,
      sound: true,
      extraUrls: skuImg ? [skuImg] : [],
      productId: product?.id,
    });
  }

  useEffect(() => {
    function onBar() {
      generateClip();
    }
    window.addEventListener("creatoros:affiliate-generate", onBar);
    return () => window.removeEventListener("creatoros:affiliate-generate", onBar);
  });

  async function writeScript() {
    if (!productId) return;
    setBusy("script");
    setError("");
    try {
      const res = await fetch("/api/jobs/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          characterId,
          angle,
          input: `Talent: ${name} (locked identity). Angle: ${angle}. 9:16 Short/Reels. HOOK spoken+visual required. Do not repeat the hook in later beats. Product in the story from frame 1.`,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "script failed");
      setScript(json.script || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function museOnModel() {
    if (!still || !skuImg) {
      setError(productId && !skuImg ? "This SKU has no pack shot. A model photo is not used as the product." : "Pick a plate and a SKU first.");
      return;
    }
    setBusy("muse");
    setError("");
    try {
      const res = await fetch(`/api/characters/${characterId}?op=edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: still,
          extraUrl: skuImg,
          extraUrls: [skuImg],
          mode: "product",
          aspect: "9:16",
          prompt: `Photoreal 9:16 on-model UGC. Same woman. She holds or wears the exact SKU so it is fully readable. ${product?.title || ""}. One person. No watermark.`,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "try-on failed");
      const jobId = json.jobId || json.id;
      if (!jobId) throw new Error("no job");
      const job = await pollJob(jobId);
      if (job.status === "failed") throw new Error(job.error || "try-on failed");
      if (job.mediaUrl) setStill(job.mediaUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="p-4">
      <p className="text-[11px] font-semibold tracking-[0.16em] text-[#9CA3AF]">AFFILIATE · @{name}</p>
      <h2 className="mt-1 text-lg font-black">SKU → still → Write → clip</h2>
      <p className="mt-1 max-w-xl text-[13px] text-[#6B7280]">
        Named talent. Script HOOK first. Clip is I2V from the still (bar below). No empty T2V.
      </p>
      {error ? <p className="mt-2 text-[12px] font-semibold text-[#E11D48]">{error}</p> : null}

      <ol className="mt-4 max-w-xl space-y-5">
        <li>
          <p className="text-[12px] font-semibold">1 · SKU</p>
          <select
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            className="mt-1.5 h-9 w-full rounded-lg border border-[#E5E7EB] bg-white px-2 text-[13px]"
          >
            {!products.length ? <option value="">Import a product first</option> : null}
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {inferCategory(p)} · {p.title.slice(0, 72)}
              </option>
            ))}
          </select>
          {skuImg ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbSrc(skuImg, 160)} alt="" className="mt-2 h-16 rounded-lg border border-[#E5E7EB] object-cover" />
          ) : null}
        </li>

        <li>
          <p className="text-[12px] font-semibold">2 · Still · first frame</p>
          <p className="text-[11px] text-[#9CA3AF]">Plate lock, or Muse on-model so the SKU is on her before I2V.</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {plates.map((s) => (
              <button
                key={s.url}
                type="button"
                title={s.label}
                onClick={() => setStill(s.url)}
                className={cn(
                  "w-14 shrink-0 overflow-hidden rounded-lg border",
                  still === s.url ? "border-[#E11D48]" : "border-[#E5E7EB]",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={thumbSrc(s.url, 120)} alt="" className="aspect-[3/4] w-full object-cover" />
                <p className="truncate px-0.5 py-0.5 text-center text-[9px] font-semibold text-[#6B7280]">{s.label}</p>
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={!still || !skuImg || Boolean(busy)}
            onClick={() => void museOnModel()}
            className="mt-2 rounded-full border border-[#E5E7EB] px-3 py-1 text-[11px] font-semibold disabled:opacity-40"
          >
            {busy === "muse" ? "Muse try-on…" : "On-model still · Muse"}
          </button>
        </li>

        <li>
          <p className="text-[12px] font-semibold">3 · Write · HOOK timeline</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {campaignFormat ? <p className="mb-1.5 w-full text-[11px] text-[#6B7280]">Campaign format: {campaignFormat}.</p> : null}
            {ANGLES.map((a) => (
              <button
                key={a.id}
                type="button"
                title={a.hint}
                onClick={() => setAngle(a.id)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                  angle === a.id ? "bg-[#E11D48] text-white" : "border border-[#E5E7EB]",
                )}
              >
                {a.label}
              </button>
            ))}
            <button
              type="button"
              disabled={!productId || Boolean(busy)}
              onClick={() => void writeScript()}
              className="rounded-full border border-[#E5E7EB] px-3 py-1 text-[11px] font-semibold disabled:opacity-40"
            >
              {busy === "script" ? "Writing…" : script ? "Rewrite" : "Write"}
            </button>
          </div>
          {script?.hook ? (
            <div className="mt-2 space-y-1.5 rounded-lg border border-[#E5E7EB] bg-[#FAFBFF] p-2.5 text-[12px]">
              <p className="font-semibold">{script.title}</p>
              <p className="text-[11px] font-semibold text-[#111827]">HOOK 0–2s</p>
              <p className="text-[#4B5563]">{script.hook}</p>
              {script.firstFrame || script.hookVisual ? (
                <p className="text-[11px] text-[#6B7280]">Frame · {script.firstFrame || script.hookVisual}</p>
              ) : null}
              {(script.beats || []).map((b, i) => (
                <p key={`${b.t}-${i}`} className="text-[11px] text-[#4B5563]">
                  {b.t} · {b.spoken}
                </p>
              ))}
              {script.cta ? <p className="text-[11px] text-[#6B7280]">CTA · {script.cta}</p> : null}
            </div>
          ) : (
            <p className="mt-1 text-[11px] text-[#9CA3AF]">HOOK required before Generate clip.</p>
          )}
        </li>

        <li>
          <p className="text-[12px] font-semibold">4 · Clip</p>
          <p className="text-[11px] text-[#6B7280]">Bar below: Wan 3.0 / Seedance 2.5 / Grok Video. Uses the still in step 2.</p>
        </li>
      </ol>
    </div>
  );
}
