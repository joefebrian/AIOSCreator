"use client";

import { useEffect, useMemo, useState } from "react";
import { Btn, inputClass, Page, Pill, Surface } from "@/components/ui";

type Account = { id: string; platform: string; accountName: string; connectionState: string; hasToken: boolean };
type Character = { id: string; name: string; identityUrl?: string | null; edits?: { url: string }[]; slots?: { url: string | null }[] };
type Post = {
  id: string;
  accountId: string;
  platform: string;
  mediaUrl: string;
  mediaType: string;
  caption: string;
  scheduledAt?: string;
  createdAt?: string;
  status: string;
  approval: string;
  mode: string;
  error?: string;
  platformPostId?: string;
};

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function CalendarPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [week, setWeek] = useState(() => startOfWeek(new Date()));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [characterId, setCharacterId] = useState("");
  const [mediaUrl, setMediaUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [title, setTitle] = useState("");
  const [tags, setTags] = useState("");
  const [privacy, setPrivacy] = useState("private");
  const [kids, setKids] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");
  const [mode, setMode] = useState("direct");
  const [approve, setApprove] = useState(false);

  async function load() {
    const res = await fetch("/api/distribute/posts");
    const json = await res.json();
    setPosts(json.posts || []);
    setAccounts(json.accounts || []);
    setCharacters(json.characters || []);
    if (!accountIds.length && json.accounts?.[0]) setAccountIds([json.accounts[0].id]);
  }

  useEffect(() => {
    void load();
    const t = setInterval(() => {
      void fetch("/api/distribute/tick", { method: "POST" }).then(() => load());
    }, 30000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(week);
      d.setDate(week.getDate() + i);
      return d;
    });
  }, [week]);

  const mediaOptions = useMemo(() => {
    const c = characters.find((x) => x.id === characterId);
    if (!c) return [];
    const urls: string[] = [];
    if (c.identityUrl) urls.push(c.identityUrl);
    for (const s of c.slots || []) if (s.url) urls.push(s.url);
    for (const e of c.edits || []) if (e.url) urls.push(e.url);
    return urls;
  }, [characters, characterId]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy("create");
    setError("");
    try {
      const res = await fetch("/api/distribute/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountIds,
          characterId: characterId || undefined,
          mediaUrl,
          caption,
          title,
          tags,
          privacy,
          madeForKids: kids,
          scheduledAt: scheduledAt || undefined,
          mode,
          approval: approve ? "approved" : "pending",
          containsSyntheticMedia: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "create failed");
      setCaption("");
      setTitle("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  return (
    <Page
      kicker="DISTRIBUTE · LIVE"
      title="Calendar"
      description="One media → many tester accounts. Approve before public. Tick while this page is open (30s), or Publish Queue. No Autopilot. No Stripe credits."
      actions={
        <div className="flex gap-2">
          <Btn
            variant="ghost"
            type="button"
            onClick={() => {
              const n = new Date(week);
              n.setDate(n.getDate() - 7);
              setWeek(startOfWeek(n));
            }}
          >
            ← Week
          </Btn>
          <Btn variant="ghost" type="button" onClick={() => setWeek(startOfWeek(new Date()))}>
            Today
          </Btn>
          <Btn
            variant="ghost"
            type="button"
            onClick={() => {
              const n = new Date(week);
              n.setDate(n.getDate() + 7);
              setWeek(startOfWeek(n));
            }}
          >
            Week →
          </Btn>
        </div>
      }
    >
      {error ? <p className="mb-4 text-sm text-[#B91C1C]">{error}</p> : null}

      <div className="mb-6 grid gap-2 md:grid-cols-7">
        {days.map((d) => {
          const key = ymd(d);
          const items = posts.filter((p) => {
            const raw = p.scheduledAt || p.createdAt || "";
            const local = raw ? ymd(new Date(raw)) : "";
            return local === key;
          });
          return (
            <Surface key={key} className="min-h-[9rem] p-3">
              <button
                type="button"
                className="text-left text-[12px] font-semibold"
                onClick={() => setScheduledAt(`${key}T10:00`)}
              >
                {d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
              </button>
              <div className="mt-2 space-y-1">
                {items.map((p) => (
                  <a key={p.id} href="/distribute/queue" className="block truncate text-[11px] text-[#4B5563]">
                    <Pill tone={p.status === "published" ? "ready" : p.status === "failed" ? "off" : p.approval === "approved" ? "on" : "muted"}>
                      {p.platform}
                    </Pill>{" "}
                    {p.scheduledAt ? new Date(p.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " · " : ""}
                    {p.caption || p.status}
                  </a>
                ))}
              </div>
            </Surface>
          );
        })}
      </div>

      <Surface>
        <p className="text-sm font-semibold">Schedule a post</p>
        <p className="mt-1 text-[13px] text-[#6B7280]">Same still/video can go to several testers at once. Each gets its own queue row.</p>
        <form onSubmit={create} className="mt-3 grid gap-3 md:grid-cols-2">
          <fieldset className="md:col-span-2">
            <legend className="text-[11px] font-semibold tracking-[0.16em] text-[#6B7280]">Tester accounts</legend>
            <div className="mt-2 flex flex-wrap gap-3">
              {accounts.map((a) => (
                <label key={a.id} className="flex items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    checked={accountIds.includes(a.id)}
                    onChange={() =>
                      setAccountIds((cur) => (cur.includes(a.id) ? cur.filter((x) => x !== a.id) : [...cur, a.id]))
                    }
                  />
                  {a.accountName} · {a.platform}
                  {a.hasToken ? "" : " · export"}
                </label>
              ))}
              {accounts.length === 0 ? <p className="text-[13px] text-[#9CA3AF]">Add testers in Accounts first.</p> : null}
            </div>
          </fieldset>
          <label className="text-[11px] font-semibold tracking-[0.16em] text-[#6B7280]">
            Character
            <select className={inputClass} value={characterId} onChange={(e) => setCharacterId(e.target.value)}>
              <option value="">None</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] font-semibold tracking-[0.16em] text-[#6B7280] md:col-span-2">
            Media
            <select className={inputClass} value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)}>
              <option value="">Paste or pick…</option>
              {mediaOptions.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
            <input className={inputClass} placeholder="/api/media/…" value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} required />
            {mediaUrl ? (
              <div className="mt-2 max-h-40 overflow-hidden rounded-lg border border-[#E6E8EE]">
                {/\.mp4($|\?)/i.test(mediaUrl) ? (
                  <video src={mediaUrl} className="max-h-40 w-full object-contain" muted />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaUrl} alt="" className="max-h-40 w-full object-contain" />
                )}
              </div>
            ) : null}
          </label>
          <label className="text-[11px] font-semibold tracking-[0.16em] text-[#6B7280]">
            Title (YouTube)
            <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="text-[11px] font-semibold tracking-[0.16em] text-[#6B7280]">
            When
            <input className={inputClass} type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </label>
          <label className="text-[11px] font-semibold tracking-[0.16em] text-[#6B7280]">
            Privacy (YouTube)
            <select className={inputClass} value={privacy} onChange={(e) => setPrivacy(e.target.value)}>
              <option value="private">Private</option>
              <option value="unlisted">Unlisted</option>
              <option value="public">Public (needs Approve)</option>
            </select>
          </label>
          <label className="text-[11px] font-semibold tracking-[0.16em] text-[#6B7280]">
            Tags (YouTube)
            <input className={inputClass} placeholder="comma separated" value={tags} onChange={(e) => setTags(e.target.value)} />
          </label>
          <label className="text-[11px] font-semibold tracking-[0.16em] text-[#6B7280] md:col-span-2">
            Caption
            <textarea className={inputClass} rows={4} value={caption} onChange={(e) => setCaption(e.target.value)} />
          </label>
          <label className="text-[11px] font-semibold tracking-[0.16em] text-[#6B7280]">
            Mode
            <select className={inputClass} value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="direct">Direct (YouTube when connected)</option>
              <option value="inbox">Inbox (TikTok MVP)</option>
              <option value="export">Export pack</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-[13px] font-semibold">
            <input type="checkbox" checked={approve} onChange={(e) => setApprove(e.target.checked)} />
            Approve now (required before public publish)
          </label>
          <label className="flex items-center gap-2 text-[13px] font-semibold">
            <input type="checkbox" checked={kids} onChange={(e) => setKids(e.target.checked)} />
            Made for kids (YouTube)
          </label>
          <div className="md:col-span-2">
            <Btn type="submit" disabled={busy === "create" || accountIds.length === 0}>
              {busy === "create" ? "Saving…" : "Add to calendar"}
            </Btn>
          </div>
        </form>
      </Surface>
    </Page>
  );
}
