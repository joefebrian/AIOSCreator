"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { CommercialContextPicker, type CommercialSelection } from "@/components/commerce/CommercialContextPicker";
import { Btn } from "@/components/ui";
import { CAMPAIGN_ANGLES, CAMPAIGN_ANGLE_LABELS } from "@/lib/campaign-angles";
import { thumbSrc } from "@/lib/media-url";
import { cn } from "@/lib/cn";

type Choice = { id: string; label: string };
type Sku = { id: string; title: string; image: string; market?: string };
type Person = { id: string; name: string; thumbUrl: string; markets?: string[] };
type Experiment = { id: string; variable: "hook" | "character" | "duration"; note: string; createdAt: string };
type Campaign = {
  id: string;
  name: string;
  market: string;
  platform: string;
  angle: string;
  productIds: string[];
  characterIds: string[];
  products: Sku[];
  characters: Person[];
  stills: { id: string; url: string; createdAt: string }[];
  clips: { id: string; url: string; createdAt: string }[];
  packs: { id: string; name: string; market: string; platform: string; stage: string; brief?: string }[];
  experiments: Experiment[];
  status: "Assigned" | "In progress" | "Stills" | "Clips";
};

type Board = {
  campaigns: Campaign[];
  catalog: Sku[];
  characters: Person[];
  markets: Choice[];
  platforms: string[];
  variables: Experiment["variable"][];
};

const EMPTY: Board = { campaigns: [], catalog: [], characters: [], markets: [], platforms: [], variables: [] };

const VARIABLE_LABEL: Record<Experiment["variable"], string> = {
  hook: "Hook",
  character: "Character",
  duration: "Duration",
};

function statusClass(status: Campaign["status"]) {
  if (status === "In progress") return "bg-[#FFF7ED] text-[#C2410C]";
  if (status === "Assigned") return "bg-[#F3F4F8] text-[#6B7280]";
  return "bg-[#ECFDF5] text-[#047857]";
}

function shortTitle(title: string) {
  const cut = title.split("|")[0].trim();
  return cut.length > 48 ? `${cut.slice(0, 46)}…` : cut;
}

function FlowMap({ campaign, marketLabel, wide }: { campaign: Campaign; marketLabel: string; wide?: boolean }) {
  const experiment = campaign.experiments[0];
  const steps = [
    { k: "Product", v: shortTitle(campaign.products[0]?.title || "No SKU"), s: campaign.products.length > 1 ? `+${campaign.products.length - 1} more from Products` : "From Products" },
    { k: "Campaign", v: marketLabel, s: campaign.angle || "No angle" },
    {
      k: "Files",
      v: `${campaign.stills.length} stills · ${campaign.clips.length} clips`,
      s: campaign.characters.length ? campaign.characters.map((person) => person.name).join(", ") : `${campaign.packs.length} Factory packs · no character`,
    },
    { k: "Next test", v: experiment ? VARIABLE_LABEL[experiment.variable] : "None yet", s: experiment?.note || "One change. No render here." },
  ];
  return (
    <ol className={cn("grid gap-1.5", wide ? "sm:grid-cols-4" : "grid-cols-2")}>
      {steps.map((step, index) => (
        <li key={step.k} className="min-w-0 rounded-lg bg-[#F3F4F8] px-2 py-1.5">
          <span className="block text-[10px]! leading-none! font-semibold! text-[#9CA3AF]">{index + 1} {step.k}</span>
          <span className="mt-1 block truncate text-[12px] font-semibold text-[#111827]" title={step.v}>{step.v}</span>
          <span className="mt-0.5 block truncate text-[10px] text-[#6B7280]" title={step.s}>{step.s}</span>
        </li>
      ))}
    </ol>
  );
}

export default function CampaignsPage() {
  const router = useRouter();
  const params = useSearchParams();
  const urlId = params.get("id") || "";
  const urlNew = params.get("new") === "1";
  const [openId, setOpenId] = useState(urlId);
  const [creating, setCreating] = useState(urlNew);
  const [board, setBoard] = useState<Board>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const [editId, setEditId] = useState("");
  const [name, setName] = useState("");
  const [market, setMarket] = useState("");
  const [angle, setAngle] = useState("");
  const [productIds, setProductIds] = useState<string[]>([]);
  const [characterIds, setCharacterIds] = useState<string[]>([]);
  const [skuQuery, setSkuQuery] = useState("");
  const [personQuery, setPersonQuery] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [variable, setVariable] = useState<Experiment["variable"]>("hook");
  const [experimentNote, setExperimentNote] = useState("");
  const catalogPick = useRef<CommercialSelection | null>(null);

  async function load() {
    const res = await fetch("/api/commerce/campaigns");
    const json = (await res.json()) as Board & { error?: string };
    if (!res.ok) throw new Error(json.error || "Could not load campaigns.");
    setBoard(json);
    return json;
  }

  useEffect(() => {
    let dead = false;
    load()
      .catch((err: unknown) => {
        if (!dead) setError(err instanceof Error ? err.message : "Could not load campaigns.");
      })
      .finally(() => {
        if (!dead) setLoaded(true);
      });
    return () => {
      dead = true;
    };
  }, []);

  useEffect(() => {
    setOpenId(urlId);
    setCreating(urlNew);
  }, [urlId, urlNew]);

  useEffect(() => {
    if (!openId) setEditing(false);
  }, [openId]);

  useEffect(() => {
    function onNav(event: Event) {
      if ((event as CustomEvent<string>).detail !== "/commerce/campaigns") return;
      setOpenId("");
      setCreating(false);
      setEditing(false);
      setConfirmRemove(false);
    }
    window.addEventListener("creatoros:nav", onNav);
    return () => window.removeEventListener("creatoros:nav", onNav);
  }, []);

  function showList() {
    setOpenId("");
    setCreating(false);
    setEditing(false);
    setConfirmRemove(false);
    router.push("/commerce/campaigns");
  }

  function fillForm(campaign?: Campaign) {
    setEditId(campaign?.id || "");
    setName(campaign?.name || "");
    setMarket(campaign?.market || "");
    setAngle(campaign?.angle || "");
    setProductIds(campaign?.productIds || []);
    setCharacterIds(campaign?.characterIds || []);
    setSkuQuery("");
    setPersonQuery("");
    setError("");
    setNotice("");
    setEditing(Boolean(campaign));
    if (campaign) {
      setCreating(false);
      return;
    }
    setCreating(true);
    setOpenId("");
    router.push("/commerce/campaigns?new=1");
  }

  function toggle(list: string[], id: string, setList: (next: string[]) => void) {
    setList(list.includes(id) ? list.filter((row) => row !== id) : [...list, id]);
  }

  function pickMarket(next: string) {
    setMarket(next);
    setProductIds((ids) =>
      ids.filter((id) => {
        const product = board.catalog.find((row) => row.id === id);
        if (!product?.market) return false;
        if (market && product.market !== market && product.market !== next) return true;
        return product.market === next;
      }),
    );
    setCharacterIds((ids) =>
      ids.filter((id) => {
        const person = board.characters.find((row) => row.id === id);
        if (!person) return false;
        const tags = person.markets || [];
        if (market && !tags.includes(market) && !tags.includes(next)) return true;
        return tags.includes(next);
      }),
    );
  }

  function workspaceHref(personId: string, productId: string, angle: string) {
    const query = new URLSearchParams({ tool: "affiliate" });
    if (productId) query.set("product", productId);
    if (angle) query.set("format", angle);
    return `/create/characters/${personId}/workspace?${query}`;
  }

  async function sendSelection() {
    if (!open) return;
    setBusy("send");
    setError("");
    try {
      const res = await fetch("/api/commerce/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "send", id: open.id }),
      });
      const json = (await res.json()) as Board & { error?: string; sent?: { id: string; duplicate: boolean }[] };
      if (!res.ok) throw new Error(json.error || "Send failed.");
      setBoard(json);
      const sent = Array.isArray(json.sent) ? json.sent : [];
      setNotice(sent.some((row) => !row.duplicate) ? "Factory draft saved for the selected SKUs. No video was sent." : "Those Factory drafts are already there. No new video was sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed.");
    } finally {
      setBusy("");
    }
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy("save");
    setError("");
    try {
      const res = await fetch("/api/commerce/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: editId ? "update" : "create", id: editId, name, market, angle, productIds, characterIds }),
      });
      const json = (await res.json()) as Board & { error?: string; savedId?: string };
      if (!res.ok) throw new Error(json.error || "Save failed.");
      setBoard(json);
      setEditing(false);
      setCreating(false);
      const savedId = json.savedId || editId;
      if (savedId) setOpenId(savedId);
      router.push(savedId ? `/commerce/campaigns?id=${encodeURIComponent(savedId)}` : "/commerce/campaigns");
      setNotice(editId ? "Campaign updated." : "Campaign assigned.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setBusy("");
    }
  }

  async function mutate(body: Record<string, string>, busyKey: string) {
    setBusy(busyKey);
    setError("");
    try {
      const res = await fetch("/api/commerce/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as Board & { error?: string };
      if (!res.ok) throw new Error(json.error || "Save failed.");
      setBoard(json);
      return json;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
      return null;
    } finally {
      setBusy("");
    }
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return board.campaigns;
    return board.campaigns.filter((campaign) => {
      const blob = [
        campaign.name,
        campaign.market,
        campaign.platform,
        campaign.angle,
        ...campaign.products.map((product) => product.title),
        ...campaign.characters.map((person) => person.name),
      ]
        .join(" ")
        .toLowerCase();
      return blob.includes(needle);
    });
  }, [board.campaigns, query]);

  const formOpen = creating || (editing && Boolean(openId));
  const open = formOpen ? null : board.campaigns.find((campaign) => campaign.id === openId) || null;
  const countryLabel = board.markets.find((row) => row.id === market)?.label || "";
  const skus = market ? board.catalog.filter((product) => product.market === market && product.title.toLowerCase().includes(skuQuery.trim().toLowerCase())) : [];
  const people = market ? board.characters.filter((person) => (person.markets || []).includes(market) && person.name.toLowerCase().includes(personQuery.trim().toLowerCase())) : [];
  const outsideSkus = productIds.flatMap((id) => {
    const product = board.catalog.find((row) => row.id === id);
    if (!product || product.market === market) return [];
    return [product];
  });
  const outsidePeople = characterIds.flatMap((id) => {
    const person = board.characters.find((row) => row.id === id);
    if (!person || (person.markets || []).includes(market)) return [];
    return [person];
  });
  const marketLabel = board.markets.find((row) => row.id === (open?.market || market))?.label;

  return (
    <div className="px-3 py-3 md:px-4">
      <div className="sticky top-0 z-10 -mx-3 mb-3 border-b border-[#E6E8EE] bg-[#F3F4F8]/95 px-3 py-2 backdrop-blur md:-mx-4 md:px-4">
        <div className="flex flex-wrap items-center gap-2">
          {open || formOpen ? (
            <button type="button" onClick={showList} className="text-base font-bold tracking-tight text-[#111827]">
              ← Campaigns
            </button>
          ) : (
            <h1 className="text-base font-bold tracking-tight">Campaigns</h1>
          )}
          <span className="text-[12px] text-[#6B7280]">{loaded ? `${visible.length} assigned` : "Loading…"}</span>
          <div className="ml-auto flex items-center gap-1">
            {board.campaigns.length > 0 && !formOpen && !open ? (
              <input
                id="campaign-search"
                name="campaignSearch"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                className="h-8 w-36 rounded-full border border-[#E6E8EE] bg-white px-3 text-[12px] outline-none"
              />
            ) : null}
            <button
              type="button"
              disabled={!loaded}
              onClick={() => fillForm()}
              className="h-8 rounded-full bg-[#111827] px-3 text-[12px]! leading-none! font-semibold! text-white disabled:opacity-40"
            >
              New
            </button>
          </div>
        </div>
      </div>

      {error ? <p className="mb-3 text-[13px] text-red-600">{error}</p> : null}
      {notice ? <p className="mb-3 text-[13px] text-[#166534]">{notice}</p> : null}

      {formOpen ? (
        <form onSubmit={(event) => void save(event)} className="mb-4 rounded-xl border border-[#E6E8EE] bg-white p-3 shadow-[0_1px_0_rgba(15,23,42,0.04)]">
          <p className="text-[13px] font-semibold text-[#111827]">{editId ? "Edit assignment" : "New assignment"}</p>
          <p className="mt-0.5 text-[12px] leading-snug text-[#6B7280]">Pick SKUs already in the catalog. Stills and clips are made in UGC Factory or a character workspace.</p>
          <div className="mt-3 grid items-start gap-4 xl:grid-cols-2">
            <div className="grid gap-3 sm:grid-cols-2">
              <label htmlFor="campaign-name" className="block text-[11px]! leading-none! font-semibold! text-[#6B7280] sm:col-span-2">
                Name
                <input
                  id="campaign-name"
                  name="campaignName"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={64}
                  required
                  autoComplete="off"
                  className="mt-1.5 h-8 w-full rounded-lg border border-[#E6E8EE] px-3 text-[13px]! leading-none! text-[#111827] outline-none focus:border-[#111827]"
                />
              </label>
              <label htmlFor="campaign-angle" className="block text-[11px]! leading-none! font-semibold! text-[#6B7280] sm:col-span-2">
                Angle
                <select
                  id="campaign-angle"
                  name="campaignAngle"
                  value={angle}
                  onChange={(event) => setAngle(event.target.value)}
                  required
                  className="mt-1.5 h-8 w-full rounded-lg border border-[#E6E8EE] bg-white px-2 text-[13px] text-[#111827] outline-none focus:border-[#111827]"
                >
                  <option value="">Pick an angle</option>
                  {angle && !CAMPAIGN_ANGLE_LABELS.includes(angle) ? <option value={angle}>{angle}</option> : null}
                  {CAMPAIGN_ANGLES.map((group) => (
                    <optgroup key={group.group} label={group.group}>
                      {group.items.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <div className="sm:col-span-2">
                <p className="text-[11px]! leading-none! font-semibold! text-[#6B7280]">Market</p>
                <p className="mt-1 text-[11px] leading-snug text-[#9CA3AF]">Country for this test. SKUs and characters follow it.</p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {board.markets.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => pickMarket(row.id)}
                      className={cn(
                        "rounded-full border px-2 py-1! text-[11px]! leading-none! font-medium!",
                        market === row.id ? "border-[#111827] bg-[#111827] text-white" : "border-[#E6E8EE] bg-white text-[#6B7280]",
                      )}
                    >
                      {row.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
            <div className="min-w-0 sm:col-span-2">
              <p className="text-[11px]! leading-none! font-semibold! text-[#6B7280]">Catalog context</p>
              <p className="mt-1 text-[11px] leading-snug text-[#9CA3AF]">Same SKU, market, and listing as Products and UGC Factory. Adding it here does not start a video.</p>
              <div className="mt-2">
                <CommercialContextPicker
                  showPlacement={false}
                  initialMarket={market || undefined}
                  onChange={(selection) => { catalogPick.current = selection; }}
                />
              </div>
              <Btn
                type="button"
                variant="ghost"
                className="mt-2"
                onClick={() => {
                  const selection = catalogPick.current;
                  if (!selection?.legacyProductId) return;
                  if (!market && selection.market) pickMarket(selection.market);
                  setProductIds((ids) => ids.includes(selection.legacyProductId) ? ids : [...ids, selection.legacyProductId]);
                }}
              >
                Add this SKU
              </Btn>
            </div>
            <fieldset className="min-w-0">
              <legend className="text-[11px]! leading-none! font-semibold! text-[#6B7280]">SKUs · {productIds.length} selected</legend>
              <input
                id="campaign-sku-search"
                name="skuSearch"
                value={skuQuery}
                onChange={(event) => setSkuQuery(event.target.value)}
                placeholder="Search catalog"
                className="mt-1.5 h-8 w-full rounded-lg border border-[#E6E8EE] px-3 text-[12px] outline-none"
              />
              <ul className="mt-1.5 max-h-52 space-y-1 overflow-auto xl:max-h-[min(28rem,calc(100vh-22rem))]">
                {outsideSkus.map((product) => (
                  <li key={product.id}>
                    <label className="flex items-center gap-2 rounded-lg bg-[#FEF2F2] px-1 py-1">
                      <input
                        type="checkbox"
                        name="productIds"
                        value={product.id}
                        checked={productIds.includes(product.id)}
                        onChange={() => toggle(productIds, product.id, setProductIds)}
                      />
                      {product.image ? <img src={thumbSrc(product.image, 64)} alt="" className="h-8 w-8 rounded-md object-cover" /> : <span className="h-8 w-8 rounded-md bg-[#F3F4F8]" />}
                      <span className="min-w-0">
                        <span className="block truncate text-[12px] text-[#111827]">{product.title}</span>
                        <span className="block text-[10px] text-[#B91C1C]">{board.markets.find((row) => row.id === product.market)?.label || "Another country"}</span>
                      </span>
                    </label>
                  </li>
                ))}
                {skus.map((product) => (
                  <li key={product.id}>
                    <label className="flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-[#F3F4F8]">
                      <input
                        type="checkbox"
                        name="productIds"
                        value={product.id}
                        checked={productIds.includes(product.id)}
                        onChange={() => toggle(productIds, product.id, setProductIds)}
                      />
                      {product.image ? <img src={thumbSrc(product.image, 64)} alt="" className="h-8 w-8 rounded-md object-cover" /> : <span className="h-8 w-8 rounded-md bg-[#F3F4F8]" />}
                      <span className="truncate text-[12px] text-[#111827]">{product.title}</span>
                    </label>
                  </li>
                ))}
              </ul>
              {!market ? <p className="mt-1.5 text-[12px] text-[#6B7280]">Pick a country first.</p> : null}
              {market && !skus.length && !outsideSkus.length ? <p className="mt-1.5 text-[12px] text-[#6B7280]">No SKU from {countryLabel} in the catalog.</p> : null}
            </fieldset>
            <fieldset className="min-w-0">
              <legend className="text-[11px]! leading-none! font-semibold! text-[#6B7280]">Characters · optional · {characterIds.length} selected</legend>
              <input
                id="campaign-character-search"
                name="characterSearch"
                value={personQuery}
                onChange={(event) => setPersonQuery(event.target.value)}
                placeholder="Search characters"
                className="mt-1.5 h-8 w-full rounded-lg border border-[#E6E8EE] px-3 text-[12px] outline-none"
              />
              <ul className="mt-1.5 max-h-52 space-y-1 overflow-auto xl:max-h-[min(28rem,calc(100vh-22rem))]">
                {outsidePeople.map((person) => (
                  <li key={person.id}>
                    <label className="flex items-center gap-2 rounded-lg bg-[#FEF2F2] px-1 py-1">
                      <input
                        type="checkbox"
                        name="characterIds"
                        value={person.id}
                        checked={characterIds.includes(person.id)}
                        onChange={() => toggle(characterIds, person.id, setCharacterIds)}
                      />
                      {person.thumbUrl ? <img src={thumbSrc(person.thumbUrl, 64)} alt="" className="h-8 w-8 rounded-full object-cover" /> : <span className="h-8 w-8 rounded-full bg-[#F3F4F8]" />}
                      <span className="min-w-0">
                        <span className="block truncate text-[12px] text-[#111827]">{person.name}</span>
                        <span className="block text-[10px] text-[#B91C1C]">Set this country on the character</span>
                      </span>
                    </label>
                  </li>
                ))}
                {people.map((person) => (
                  <li key={person.id}>
                    <label className="flex items-center gap-2 rounded-lg px-1 py-1 hover:bg-[#F3F4F8]">
                      <input
                        type="checkbox"
                        name="characterIds"
                        value={person.id}
                        checked={characterIds.includes(person.id)}
                        onChange={() => toggle(characterIds, person.id, setCharacterIds)}
                      />
                      {person.thumbUrl ? <img src={thumbSrc(person.thumbUrl, 64)} alt="" className="h-8 w-8 rounded-full object-cover" /> : <span className="h-8 w-8 rounded-full bg-[#F3F4F8]" />}
                      <span className="truncate text-[12px] text-[#111827]">{person.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
              {!market ? <p className="mt-1.5 text-[12px] text-[#6B7280]">Pick a country first.</p> : null}
              {market && !people.length && !outsidePeople.length ? <p className="mt-1.5 text-[12px] text-[#6B7280]">No character is set for {countryLabel}.</p> : null}
            </fieldset>
            </div>
          </div>
          {outsideSkus.length || outsidePeople.length ? (
            <p className="mt-3 text-[12px] text-[#B91C1C]">Change the country, or clear the SKU or character that belongs somewhere else.</p>
          ) : null}
          <div className="mt-3 flex gap-2">
            <button type="submit" disabled={busy === "save" || !market || !angle || !productIds.length || outsideSkus.length > 0 || outsidePeople.length > 0} className="h-8 rounded-lg bg-[#111827] px-3 text-[12px]! leading-none! font-semibold! text-white disabled:opacity-40">
              {busy === "save" ? "Saving…" : "Save assignment"}
            </button>
            <button type="button" onClick={() => { if (creating) showList(); else setEditing(false); }} className="h-8 rounded-lg border border-[#E6E8EE] px-3 text-[12px]! leading-none! font-semibold! text-[#6B7280]">
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {!formOpen && open ? (
        <section className="rounded-xl border border-[#E6E8EE] bg-white p-3 shadow-[0_1px_0_rgba(15,23,42,0.04)]">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <button type="button" onClick={showList} className="text-[12px]! leading-none! font-semibold! text-[#6B7280]">
                All campaigns
              </button>
              <h2 className="mt-1 truncate text-[16px] font-bold text-[#111827]">{open.name}</h2>
              <p className="mt-1 text-[12px] text-[#6B7280]">
                {[marketLabel || open.market, open.angle].filter(Boolean).join(" · ")}
              </p>
            </div>
            <span className={cn("rounded-full px-2 py-1 text-[10px]! leading-none! font-semibold!", statusClass(open.status))}>{open.status}</span>
          </div>
          <div className="mt-3">
            <FlowMap campaign={open} marketLabel={marketLabel || open.market} wide />
            <p className="mt-1.5 text-[11px] leading-snug text-[#6B7280]">The same SKU id connects Products, this campaign, and the Factory files.</p>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {open.products.map((product) => (
              <span key={product.id} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[#F3F4F8] py-1 pr-2 pl-1">
                {product.image ? <img src={thumbSrc(product.image, 64)} alt="" className="h-5 w-5 rounded-full object-cover" /> : null}
                <span className="truncate text-[11px] font-medium text-[#111827]">{product.title}</span>
              </span>
            ))}
            {open.characters.flatMap((person) => {
              const products = open.products.length ? open.products : [{ id: "", title: "", image: "" }];
              return products.map((product) => (
                <Link key={`${person.id}-${product.id}`} href={workspaceHref(person.id, product.id, open.angle)} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[#E6E8EE] py-1 pr-2 pl-1 text-[11px] font-medium text-[#111827]">
                  {person.thumbUrl ? <img src={thumbSrc(person.thumbUrl, 64)} alt="" className="h-5 w-5 rounded-full object-cover" /> : null}
                  <span className="truncate">Open {person.name}{products.length > 1 && product.title ? ` · ${product.title}` : ""}</span>
                </Link>
              ));
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" disabled={busy === "send" || !open.products.length} onClick={() => void sendSelection()} className="h-8 rounded-lg bg-[#111827] px-3 text-[12px]! leading-none! font-semibold! text-white disabled:opacity-40">
              {busy === "send" ? "Sending…" : "Send selection"}
            </button>
            <p className="text-[12px] text-[#6B7280]">{open.characters.length ? "SKU becomes a Factory draft. Character opens in the workspace. Nothing is rendered." : "No character selected. The SKU becomes a Factory draft, and nothing is rendered."}</p>
          </div>

          <h3 className="mt-4 text-[11px]! leading-none! font-semibold! text-[#9CA3AF]">Stills · {open.stills.length}</h3>
          {open.stills.length ? (
            <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              {open.stills.map((still) => (
                <li key={still.id}>
                  <a href={still.url} target="_blank" rel="noreferrer">
                    <img src={thumbSrc(still.url, 320)} alt="" className="aspect-[3/4] w-full rounded-lg object-cover" />
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[12px] text-[#6B7280]">No stills tied to these SKUs yet.</p>
          )}

          <h3 className="mt-4 text-[11px]! leading-none! font-semibold! text-[#9CA3AF]">Clips · {open.clips.length}</h3>
          {open.clips.length ? (
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {open.clips.map((clip) => (
                <li key={clip.id}>
                  <video src={clip.url} controls preload="metadata" className="aspect-[9/16] max-h-80 w-full rounded-lg bg-black object-contain" />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[12px] text-[#6B7280]">No clips tied to these SKUs yet.</p>
          )}

          <h3 className="mt-4 text-[11px]! leading-none! font-semibold! text-[#9CA3AF]">Factory packs · {open.packs.length}</h3>
          {open.packs.length ? (
            <ul className="mt-2 space-y-1">
              {open.packs.map((pack) => (
                <li key={pack.id}>
                  <Link href={`/create/ugc-factory?variant=${pack.id}`} className="flex items-center justify-between gap-2 rounded-lg bg-[#F3F4F8] px-2 py-1.5 hover:bg-[#E7E9EF]">
                    <span className="min-w-0 truncate text-[12px] text-[#111827]">{pack.name}</span>
                    <span className="shrink-0 text-[10px] text-[#6B7280]">{[pack.market, pack.platform, pack.stage, pack.brief?.replace(/^Format:\s*/, "")].filter(Boolean).join(" · ")}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-1 text-[12px] text-[#6B7280]">No Factory pack uses these SKUs yet.</p>
          )}


          <h3 className="mt-4 text-[11px]! leading-none! font-semibold! text-[#9CA3AF]">Experiments</h3>
          <p className="mt-1 text-[12px] leading-snug text-[#6B7280]">A note about one change: Hook, Character, or Duration. Add does not make a still or a clip. Make that in UGC Factory or the character workspace.</p>
          <ul className="mt-2 space-y-1">
            {open.experiments.map((experiment) => (
              <li key={experiment.id} className="flex items-center justify-between gap-2 rounded-lg border border-[#E6E8EE] px-2 py-1.5">
                <span className="min-w-0 text-[12px] text-[#111827]">
                  <span className="font-semibold">{VARIABLE_LABEL[experiment.variable]}</span>
                  {experiment.note ? <span className="text-[#6B7280]"> · {experiment.note}</span> : null}
                </span>
                <button
                  type="button"
                  disabled={busy === experiment.id}
                  onClick={() => void mutate({ action: "remove-experiment", experimentId: experiment.id }, experiment.id)}
                  className="shrink-0 text-[11px]! leading-none! font-semibold! text-[#6B7280]"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <form
            className="mt-2 flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void mutate({ action: "add-experiment", id: open.id, variable, note: experimentNote }, "experiment").then((json) => {
                if (json) setExperimentNote("");
              });
            }}
          >
            <label htmlFor="experiment-variable" className="sr-only">Variable</label>
            <select
              id="experiment-variable"
              name="experimentVariable"
              value={variable}
              onChange={(event) => setVariable(event.target.value as Experiment["variable"])}
              className="h-8 rounded-lg border border-[#E6E8EE] bg-white px-2 text-[12px]"
            >
              {board.variables.map((row) => (
                <option key={row} value={row}>{VARIABLE_LABEL[row]}</option>
              ))}
            </select>
            <input
              id="experiment-note"
              name="experimentNote"
              value={experimentNote}
              onChange={(event) => setExperimentNote(event.target.value)}
              maxLength={160}
              placeholder="Note, for example 15 seconds"
              className="h-8 min-w-0 flex-1 rounded-lg border border-[#E6E8EE] px-3 text-[12px] outline-none"
            />
            <button type="submit" disabled={busy === "experiment"} className="h-8 rounded-lg bg-[#111827] px-3 text-[12px]! leading-none! font-semibold! text-white disabled:opacity-40">
              Add
            </button>
          </form>

          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => fillForm(open)} className="h-8 rounded-lg border border-[#E6E8EE] px-3 text-[12px]! leading-none! font-semibold! text-[#111827]">
              Edit assignment
            </button>
            {confirmRemove ? (
              <>
                <span className="self-center text-[12px] text-[#6B7280]">Remove this campaign?</span>
                <button
                  type="button"
                  disabled={busy === "remove"}
                  onClick={() => {
                    void mutate({ action: "remove", id: open.id }, "remove").then((json) => {
                      if (!json) return;
                      showList();
                      setNotice("Campaign removed.");
                    });
                  }}
                  className="h-8 rounded-lg bg-red-600 px-3 text-[12px]! leading-none! font-semibold! text-white disabled:opacity-40"
                >
                  Remove
                </button>
                <button type="button" onClick={() => setConfirmRemove(false)} className="h-8 px-2 text-[12px]! leading-none! font-semibold! text-[#6B7280]">
                  Cancel
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmRemove(true)} className="h-8 px-2 text-[12px]! leading-none! font-semibold! text-[#B91C1C]">
                Remove
              </button>
            )}
          </div>
        </section>
      ) : null}

      {!formOpen && !open && loaded && visible.length === 0 ? (
        <div className="rounded-xl border border-[#E6E8EE] bg-white px-6 py-10 text-center shadow-[0_1px_0_rgba(15,23,42,0.04)]">
          <p className="text-sm font-semibold">{board.campaigns.length === 0 ? "Assign a SKU" : "No campaigns in this view."}</p>
          <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-[#6B7280]">
            {board.campaigns.length === 0
              ? "A campaign keeps the SKUs, characters, and tags together. Make the stills and clips in UGC Factory or a character workspace."
              : "Try another search."}
          </p>
          {board.campaigns.length === 0 ? (
            <button type="button" onClick={() => fillForm()} className="mt-4 text-[13px] font-semibold text-[#7C6CFF]">
              New assignment
            </button>
          ) : null}
        </div>
      ) : null}

      {!formOpen && !open && visible.length > 0 ? (
        <ul className="grid grid-cols-1 gap-2">
          {visible.map((campaign) => (
            <li key={campaign.id}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => { setNotice(""); setEditing(false); setCreating(false); setOpenId(campaign.id); router.push(`/commerce/campaigns?id=${encodeURIComponent(campaign.id)}`); }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setNotice("");
                    setEditing(false);
                    setCreating(false);
                    setOpenId(campaign.id);
                    router.push(`/commerce/campaigns?id=${encodeURIComponent(campaign.id)}`);
                  }
                }}
                className="flex h-full w-full cursor-pointer flex-col rounded-xl border border-[#E6E8EE] bg-white p-3 text-left shadow-[0_1px_0_rgba(15,23,42,0.04)] hover:border-[#111827]"
              >
                <span className="flex items-start justify-between gap-2">
                  <span className="truncate text-[13px] font-semibold text-[#111827]">{campaign.name}</span>
                  <span className={cn("shrink-0 rounded-full px-2 py-1 text-[10px]! leading-none! font-semibold!", statusClass(campaign.status))}>{campaign.status}</span>
                </span>
                <span className="mt-2">
                  <FlowMap campaign={campaign} marketLabel={board.markets.find((row) => row.id === campaign.market)?.label || campaign.market} wide />
                </span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
