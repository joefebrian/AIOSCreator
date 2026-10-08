"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

type ShopeeMarkets = { id?: string; my?: string; th?: string; sg?: string };

type Program = {
  id: string;
  name: string;
  field: string;
  placeholder: string;
  hint: string;
  tag: string;
  live: boolean;
  markets?: ShopeeMarkets;
};

const SHOPEE_FIELDS: { id: keyof ShopeeMarkets; label: string }[] = [
  { id: "id", label: "Indonesia" },
  { id: "my", label: "Malaysia" },
  { id: "th", label: "Thailand" },
  { id: "sg", label: "Singapore" },
];

type Involve = { hasKey: boolean; hasSecret: boolean; offerMy: number; offerTh: number };

const STEPS = [
  ["1", "Amazon tag", "Used on amazon.com import"],
  ["2", "SKU link", "Paste the click URL under Price"],
  ["3", "Make the video", "Try-on or UGC Factory"],
];

function draftsFrom(rows: Program[]) {
  const draft: Record<string, string> = {};
  for (const row of rows) {
    draft[row.id] = row.tag;
    if (row.id === "shopee") {
      for (const field of SHOPEE_FIELDS) draft[`shopee.${field.id}`] = row.markets?.[field.id] || "";
    }
  }
  return draft;
}

function statusLabel(p: Program) {
  if (p.id === "tiktok-shop") return "Later";
  if (p.id === "amazon") return p.live ? "On import" : "Empty";
  if (p.id === "shopee") {
    const count = SHOPEE_FIELDS.filter((field) => p.markets?.[field.id]).length;
    return count ? `${count} ${count === 1 ? "country" : "countries"}` : "Empty";
  }
  return "On the SKU";
}

function chipClass(label: string) {
  return label === "On import" || label === "Key saved" || label.endsWith("country") || label.endsWith("countries")
    ? "bg-[#ECFDF5] text-[#047857]"
    : "bg-[#F3F4F8] text-[#6B7280]";
}

export default function ProgramsPage() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [involve, setInvolve] = useState<Involve>({ hasKey: false, hasSecret: false, offerMy: 0, offerTh: 0 });
  const [involveDraft, setInvolveDraft] = useState({ key: "", secret: "", offerMy: "", offerTh: "" });

  async function load() {
    const res = await fetch("/api/commerce/programs");
    const json = await res.json();
    const rows = (json.programs || []) as Program[];
    const nextInvolve = (json.involve || { hasKey: false, hasSecret: false, offerMy: 0, offerTh: 0 }) as Involve;
    setPrograms(rows);
    setDraft(draftsFrom(rows));
    setInvolve(nextInvolve);
    setInvolveDraft({ key: "", secret: "", offerMy: nextInvolve.offerMy ? String(nextInvolve.offerMy) : "", offerTh: nextInvolve.offerTh ? String(nextInvolve.offerTh) : "" });
    setLoaded(true);
  }

  useEffect(() => {
    void load().catch((err) => {
      setError(err instanceof Error ? err.message : String(err));
      setLoaded(true);
    });
  }, []);

  async function save(id: string) {
    setBusy(id);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/commerce/programs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          id === "shopee"
            ? {
                id,
                indonesia: draft["shopee.id"] || "",
                my: draft["shopee.my"] || "",
                th: draft["shopee.th"] || "",
                sg: draft["shopee.sg"] || "",
              }
            : { id, tag: draft[id] || "" },
        ),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "save failed");
      const rows = (json.programs || []) as Program[];
      setPrograms(rows);
      setDraft(draftsFrom(rows));
      setNotice(`${rows.find((p) => p.id === id)?.name || "Program"} saved.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function saveInvolveForm() {
    setBusy("involve");
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/commerce/programs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "involve", ...involveDraft }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "save failed");
      const nextInvolve = json.involve as Involve;
      setInvolve(nextInvolve);
      setInvolveDraft({ key: "", secret: "", offerMy: nextInvolve.offerMy ? String(nextInvolve.offerMy) : "", offerTh: nextInvolve.offerTh ? String(nextInvolve.offerTh) : "" });
      setNotice("Involve Asia saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  const amazon = programs.filter((p) => p.id === "amazon");
  const onSku = programs.filter((p) => p.id === "shopee" || p.id === "aliexpress" || !["amazon", "shopee", "aliexpress", "tiktok-shop"].includes(p.id));
  const later = programs.filter((p) => p.id === "tiktok-shop");
  const saved = programs.filter((p) => p.live).length;
  const involveLabel = involve.hasKey && involve.hasSecret ? "Key saved" : "Not set";

  function row(p: Program) {
    const label = statusLabel(p);
    return (
      <form
        key={p.id}
        className="px-3 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save(p.id);
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[13px] font-semibold text-[#111827]">{p.name}</p>
            <p className="mt-0.5 text-[12px] leading-snug text-[#6B7280]">{p.hint}</p>
          </div>
          <span className={cn("shrink-0 rounded-full px-2 py-1 text-[10px]! leading-none! font-semibold!", chipClass(label))}>{label}</span>
        </div>
        {p.id === "shopee" ? (
          <>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {SHOPEE_FIELDS.map((field) => {
                const fieldName = field.id === "id" ? "shopee-indonesia" : `shopee-${field.id}`;
                return (
                <label key={field.id} htmlFor={fieldName} className="block text-[11px]! leading-none! font-semibold! text-[#6B7280]">
                  {field.label}
                  <input
                    id={fieldName}
                    name={fieldName}
                    value={draft[`shopee.${field.id}`] ?? ""}
                    placeholder="Affiliate ID"
                    inputMode="numeric"
                    autoComplete="off"
                    aria-label={`${field.label} Affiliate ID`}
                    onChange={(e) => setDraft((cur) => ({ ...cur, [`shopee.${field.id}`]: e.target.value }))}
                    className="mt-1.5 h-8 w-full rounded-lg border border-[#E6E8EE] bg-white px-3 text-[13px]! leading-none! text-[#111827] outline-none placeholder:text-[#C4C8D0] focus:border-[#111827]"
                  />
                </label>
                );
              })}
            </div>
            <button
              type="submit"
              disabled={busy === p.id}
              className="mt-3 h-8 rounded-lg bg-[#111827] px-3 text-[12px]! leading-none! font-semibold! text-white disabled:opacity-40"
            >
              {busy === p.id ? "Saving…" : "Save"}
            </button>
          </>
        ) : (
          <label htmlFor={`program-${p.id}`} className="mt-3 block text-[11px]! leading-none! font-semibold! text-[#6B7280]">
            {p.field}
            <span className="mt-1.5 flex gap-2">
              <input
                id={`program-${p.id}`}
                name={`program-${p.id}`}
                value={draft[p.id] ?? ""}
                placeholder={p.placeholder}
                autoComplete="off"
                aria-label={p.field}
                onChange={(e) => setDraft((cur) => ({ ...cur, [p.id]: e.target.value }))}
                className="h-8 min-w-0 flex-1 rounded-lg border border-[#E6E8EE] bg-white px-3 text-[13px]! leading-none! text-[#111827] outline-none placeholder:text-[#C4C8D0] focus:border-[#111827]"
              />
              <button
                type="submit"
                disabled={busy === p.id}
                className="h-8 shrink-0 rounded-lg bg-[#111827] px-3 text-[12px]! leading-none! font-semibold! text-white disabled:opacity-40"
              >
                {busy === p.id ? "Saving…" : "Save"}
              </button>
            </span>
          </label>
        )}
      </form>
    );
  }

  function group(title: string, rows: Program[]) {
    if (!rows.length) return null;
    return (
      <section>
        <h2 className="mb-1.5 px-1 text-[11px]! leading-none! font-semibold! text-[#9CA3AF]">{title}</h2>
        <div className="divide-y divide-[#F3F4F8] overflow-hidden rounded-xl border border-[#E6E8EE] bg-white shadow-[0_1px_0_rgba(15,23,42,0.04)]">{rows.map(row)}</div>
      </section>
    );
  }

  const shopeeCard = onSku.filter((p) => p.id === "shopee");
  const skuRest = onSku.filter((p) => p.id !== "shopee");

  return (
    <div className="px-3 py-3 md:px-4">
      <div className="sticky top-0 z-10 -mx-3 mb-3 border-b border-[#E6E8EE] bg-[#F3F4F8]/95 px-3 py-2 backdrop-blur md:-mx-4 md:px-4">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-base font-bold tracking-tight">Affiliate programs</h1>
          <span className="text-[12px] text-[#6B7280]">{loaded ? `${saved} saved` : "Loading…"}</span>
        </div>
      </div>

      {error ? <p className="mb-3 text-[13px] text-red-600">{error}</p> : null}
      {notice ? <p className="mb-3 text-[13px] text-[#166534]">{notice}</p> : null}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <ol className="grid gap-2 sm:grid-cols-3 lg:col-span-2">
          {STEPS.map(([n, title, body]) => (
            <li key={n} className="flex items-start gap-2 rounded-xl border border-[#E6E8EE] bg-white px-3 py-2 shadow-[0_1px_0_rgba(15,23,42,0.04)]">
              <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#111827] text-[10px]! leading-none! font-semibold! text-white">{n}</span>
              <span>
                <span className="block text-[12px] font-semibold text-[#111827]">{title}</span>
                <span className="block text-[11px] leading-snug text-[#6B7280]">{body}</span>
              </span>
            </li>
          ))}
        </ol>

        <div className="contents lg:flex lg:flex-col lg:gap-4">
          {group("On import", amazon)}
          {group("On the SKU", skuRest)}
        </div>
        <div className="contents lg:flex lg:flex-col lg:gap-4">
          {group("On the SKU", shopeeCard)}
          {group("Later", later)}
        </div>

        <section className="lg:col-span-2">
          <h2 className="mb-1.5 px-1 text-[11px]! leading-none! font-semibold! text-[#9CA3AF]">Not applied</h2>
          <form
            className="rounded-xl border border-[#E6E8EE] bg-white px-3 py-3 shadow-[0_1px_0_rgba(15,23,42,0.04)]"
            onSubmit={(e) => {
              e.preventDefault();
              void saveInvolveForm();
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[#111827]">Involve Asia</p>
                <p className="mt-0.5 text-[12px] leading-snug text-[#6B7280]">
                  Import does not wrap Shopee links. A saved key stays here and is not used.
                </p>
              </div>
              <span className={cn("shrink-0 rounded-full px-2 py-1 text-[10px]! leading-none! font-semibold!", chipClass(involveLabel))}>{involveLabel}</span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <label htmlFor="involve-key" className="block text-[11px]! leading-none! font-semibold! text-[#6B7280]">
                API key
                <input
                  id="involve-key"
                  name="involve-key"
                  className="mt-1.5 h-8 w-full rounded-lg border border-[#E6E8EE] bg-white px-3 text-[13px]! leading-none! outline-none focus:border-[#111827]"
                  type="password"
                  autoComplete="off"
                  value={involveDraft.key}
                  placeholder={involve.hasKey ? "Saved. Leave blank to keep." : "Publisher API key"}
                  onChange={(e) => setInvolveDraft((cur) => ({ ...cur, key: e.target.value }))}
                />
              </label>
              <label htmlFor="involve-secret" className="block text-[11px]! leading-none! font-semibold! text-[#6B7280]">
                API secret
                <input
                  id="involve-secret"
                  name="involve-secret"
                  className="mt-1.5 h-8 w-full rounded-lg border border-[#E6E8EE] bg-white px-3 text-[13px]! leading-none! outline-none focus:border-[#111827]"
                  type="password"
                  autoComplete="off"
                  value={involveDraft.secret}
                  placeholder={involve.hasSecret ? "Saved. Leave blank to keep." : "Publisher API secret"}
                  onChange={(e) => setInvolveDraft((cur) => ({ ...cur, secret: e.target.value }))}
                />
              </label>
              <label htmlFor="involve-offer-my" className="block text-[11px]! leading-none! font-semibold! text-[#6B7280]">
                Shopee Malaysia offer id
                <input
                  id="involve-offer-my"
                  name="involve-offer-my"
                  className="mt-1.5 h-8 w-full rounded-lg border border-[#E6E8EE] bg-white px-3 text-[13px]! leading-none! outline-none focus:border-[#111827]"
                  inputMode="numeric"
                  autoComplete="off"
                  value={involveDraft.offerMy}
                  placeholder="Approved offer id"
                  onChange={(e) => setInvolveDraft((cur) => ({ ...cur, offerMy: e.target.value }))}
                />
              </label>
              <label htmlFor="involve-offer-th" className="block text-[11px]! leading-none! font-semibold! text-[#6B7280]">
                Shopee Thailand offer id
                <input
                  id="involve-offer-th"
                  name="involve-offer-th"
                  className="mt-1.5 h-8 w-full rounded-lg border border-[#E6E8EE] bg-white px-3 text-[13px]! leading-none! outline-none focus:border-[#111827]"
                  inputMode="numeric"
                  autoComplete="off"
                  value={involveDraft.offerTh}
                  placeholder="Approved offer id"
                  onChange={(e) => setInvolveDraft((cur) => ({ ...cur, offerTh: e.target.value }))}
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={busy === "involve"}
              className="mt-3 h-8 rounded-lg bg-[#111827] px-3 text-[12px]! leading-none! font-semibold! text-white disabled:opacity-40"
            >
              {busy === "involve" ? "Saving…" : "Save"}
            </button>
          </form>
        </section>

        <p className="px-1 text-[12px] leading-snug text-[#6B7280] lg:col-span-2">
          Import the listing on{" "}
          <Link href="/commerce/products" className="font-semibold text-[#111827] underline decoration-[#E6E8EE] underline-offset-2">
            Products
          </Link>
          . The click link sits under Price.
        </p>
      </div>
    </div>
  );
}
