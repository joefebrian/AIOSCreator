"use client";

import { useEffect, useMemo, useState } from "react";
import { Btn, inputClass, Page, Pill, Surface, TextLink } from "@/components/ui";

type Account = { id: string; platform: string; accountName: string; handle?: string; connectionState: string; hasToken: boolean };
type Media = { url: string; label: string };
type Character = { id: string; name: string; media: Media[] };
type Post = {
  id: string;
  accountId: string;
  platform: string;
  mediaUrl: string;
  caption: string;
  scheduledAt?: string;
  createdAt?: string;
  status: string;
  approval: string;
};

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

function localDay(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function dayKey(raw: string) {
  if (!raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10);
  return localDay(d);
}

function fileLabel(url: string) {
  const clean = url.split("?")[0] || url;
  const name = clean.split("/").pop() || url;
  return name.length > 42 ? `${name.slice(0, 18)}…${name.slice(-16)}` : name;
}

function suggestMode(selected: Account[], video: boolean) {
  if (!selected.length) return "export";
  if (selected.some((a) => a.platform === "tiktok")) return "inbox";
  if (selected.some((a) => a.platform === "youtube") && !video) return "export";
  if (selected.some((a) => a.platform === "pinterest") && video) return "export";
  if (selected.every((a) => a.hasToken && a.platform !== "instagram" && a.platform !== "threads")) return "direct";
  return "export";
}

export default function CalendarPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [week, setWeek] = useState(() => startOfWeek(new Date()));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [accountIds, setAccountIds] = useState<string[]>([]);
  const [pickedDefault, setPickedDefault] = useState(false);
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
  const [boards, setBoards] = useState<{ id: string; name: string }[]>([]);
  const [boardId, setBoardId] = useState("");
  const [boardsNote, setBoardsNote] = useState("");

  async function load() {
    const res = await fetch("/api/distribute/posts");
    const json = await res.json();
    setPosts(json.posts || []);
    setAccounts(json.accounts || []);
    setCharacters(json.characters || []);
    return (json.accounts || []) as Account[];
  }

  useEffect(() => {
    void load().then((rows) => {
      if (pickedDefault) return;
      const connected = rows.filter((a) => a.hasToken).map((a) => a.id);
      setAccountIds(connected.length ? connected : rows[0] ? [rows[0].id] : []);
      setPickedDefault(true);
    });
    const t = setInterval(() => {
      void fetch("/api/distribute/tick", { method: "POST" }).then(() => load());
    }, 30000);
    return () => clearInterval(t);
  }, [pickedDefault]);

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(week);
      d.setDate(week.getDate() + i);
      return d;
    });
  }, [week]);

  const mediaOptions = useMemo(() => characters.find((c) => c.id === characterId)?.media || [], [characters, characterId]);
  const selected = accounts.filter((a) => accountIds.includes(a.id));
  const video = /\.mp4($|\?)/i.test(mediaUrl);
  const wantsYoutube = selected.some((a) => a.platform === "youtube");
  const pinLogins = selected.filter((a) => a.platform === "pinterest" && a.hasToken);
  const pinLogin = pinLogins.length === 1 ? pinLogins[0] : undefined;
  const wantBoard = Boolean(pinLogin) && mode === "direct" && !video;
  const today = localDay(new Date());
  const pickedDay = scheduledAt.slice(0, 10);
  const range = `${days[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;

  function applyAccounts(next: string[]) {
    setAccountIds(next);
    const rows = accounts.filter((a) => next.includes(a.id));
    setMode(suggestMode(rows, video));
  }

  useEffect(() => {
    if (!wantBoard || !pinLogin) {
      setBoards([]);
      setBoardId("");
      setBoardsNote("");
      return;
    }
    let stop = false;
    setBoardsNote("");
    void fetch(`/api/distribute/boards?accountId=${encodeURIComponent(pinLogin.id)}`)
      .then((r) => r.json())
      .then((json) => {
        if (stop) return;
        const rows = ((json.boards || []) as { id: string; name: string }[]).filter((b) => b.id && b.name);
        setBoards(rows);
        setBoardId((cur) => (rows.some((b) => b.id === cur) ? cur : rows[0]?.id || ""));
        if (json.error) setBoardsNote(json.error);
        else if (!rows.length) setBoardsNote("This login has no board yet.");
      })
      .catch(() => {
        if (!stop) setBoardsNote("Could not load boards.");
      });
    return () => {
      stop = true;
    };
  }, [wantBoard, pinLogin?.id]);

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
          tags: wantsYoutube ? tags : undefined,
          privacy: wantsYoutube ? privacy : undefined,
          madeForKids: wantsYoutube ? kids : false,
          scheduledAt: scheduledAt || undefined,
          mode,
          boardId: wantBoard ? boardId : undefined,
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
      kicker="DISTRIBUTE"
      title="Calendar"
      description="One still or video, one or more logins. Approve before it can publish. Due posts run while this page is open."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-1 text-[13px] font-semibold text-[#4B5563]">{range}</span>
          <Btn
            variant="ghost"
            type="button"
            onClick={() => {
              const n = new Date(week);
              n.setDate(n.getDate() - 7);
              setWeek(startOfWeek(n));
            }}
          >
            Previous
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
            Next
          </Btn>
        </div>
      }
    >
      {error ? <p className="mb-4 text-sm text-[#B91C1C]">{error}</p> : null}

      <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {days.map((d) => {
          const key = localDay(d);
          const items = posts.filter((p) => dayKey(p.scheduledAt || p.createdAt || "") === key);
          const isToday = key === today;
          const isPick = key === pickedDay;
          return (
            <Surface key={key} className={`min-h-[8.5rem] p-3 ${isPick ? "ring-2 ring-[#652DFF]" : ""} ${isToday ? "bg-[#F6F3FF]" : ""}`}>
              <button type="button" className="text-left text-[12px] font-semibold" onClick={() => setScheduledAt(`${key}T10:00`)}>
                {d.toLocaleDateString(undefined, { weekday: "short", day: "numeric" })}
                {isToday ? <span className="ml-1 font-normal text-[#652DFF]">today</span> : null}
              </button>
              <div className="mt-2 space-y-1.5">
                {items.map((p) => {
                  const account = accounts.find((a) => a.id === p.accountId);
                  return (
                    <a key={p.id} href={`/distribute/queue?post=${p.id}`} className="block rounded-lg bg-white/80 px-1.5 py-1 text-[11px] text-[#374151]">
                      <Pill tone={p.status === "published" || p.status === "exported" ? "ready" : p.status === "failed" ? "off" : p.approval === "approved" ? "on" : "muted"}>
                        {p.platform}
                      </Pill>
                      <span className="mt-0.5 block truncate">
                        {p.scheduledAt ? new Date(p.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " · " : ""}
                        {account?.handle ? `@${account.handle} · ` : ""}
                        {p.caption || p.status}
                      </span>
                    </a>
                  );
                })}
              </div>
            </Surface>
          );
        })}
      </div>

      <Surface>
        <p className="text-sm font-semibold">Schedule</p>
        <p className="mt-1 text-[13px] text-[#6B7280]">
          Connected logins publish. Others get an export pack. <TextLink href="/distribute/accounts">Accounts</TextLink>
        </p>
        <form onSubmit={create} className="mt-4 grid gap-3 md:grid-cols-2">
          <fieldset className="md:col-span-2">
            <legend className="text-[11px] font-semibold tracking-[0.16em] text-[#6B7280]">Logins</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {accounts.map((a) => {
                const on = accountIds.includes(a.id);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => applyAccounts(on ? accountIds.filter((id) => id !== a.id) : [...accountIds, a.id])}
                    className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold ${on ? "border-[#652DFF] bg-[#F6F3FF] text-[#3B1D9A]" : "border-[#E6E8EE] text-[#4B5563]"}`}
                  >
                    {a.handle ? `@${a.handle}` : a.accountName} · {a.platform}
                    {a.hasToken ? "" : " · export"}
                  </button>
                );
              })}
              {accounts.length === 0 ? (
                <p className="text-[13px] text-[#9CA3AF]">
                  Add a login in <TextLink href="/distribute/accounts">Accounts</TextLink> first.
                </p>
              ) : null}
            </div>
          </fieldset>
          <label className="text-[11px] font-semibold tracking-[0.16em] text-[#6B7280]">
            Character
            <select
              className={inputClass}
              value={characterId}
              onChange={(e) => {
                setCharacterId(e.target.value);
                setMediaUrl("");
              }}
            >
              <option value="">None</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] font-semibold tracking-[0.16em] text-[#6B7280]">
            When
            <input className={inputClass} type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
          </label>
          <label className="text-[11px] font-semibold tracking-[0.16em] text-[#6B7280] md:col-span-2">
            Media
            <select
              className={inputClass}
              value={mediaOptions.some((m) => m.url === mediaUrl) ? mediaUrl : ""}
              onChange={(e) => {
                const url = e.target.value;
                setMediaUrl(url);
                setMode(suggestMode(selected, /\.mp4($|\?)/i.test(url)));
              }}
            >
              <option value="">{characterId ? "Pick from this character…" : "Pick a character, or paste a path"}</option>
              {mediaOptions.map((m) => (
                <option key={m.url} value={m.url}>
                  {m.label} · {fileLabel(m.url)}
                </option>
              ))}
            </select>
            <input
              className={inputClass}
              placeholder="/api/media/…"
              value={mediaUrl}
              onChange={(e) => {
                setMediaUrl(e.target.value);
                setMode(suggestMode(selected, /\.mp4($|\?)/i.test(e.target.value)));
              }}
              required
            />
            {mediaUrl ? (
              <div className="mt-2 h-28 w-28 overflow-hidden rounded-xl border border-[#E6E8EE] bg-[#F8F8FB]">
                {video ? (
                  <video src={mediaUrl} className="h-full w-full object-cover" muted />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaUrl} alt="" className="h-full w-full object-cover" />
                )}
              </div>
            ) : null}
          </label>
          <label className="text-[11px] font-semibold tracking-[0.16em] text-[#6B7280] md:col-span-2">
            Caption
            <textarea className={inputClass} rows={3} value={caption} onChange={(e) => setCaption(e.target.value)} />
          </label>
          {wantsYoutube || selected.some((a) => a.platform === "pinterest") ? (
            <label className="text-[11px] font-semibold tracking-[0.16em] text-[#6B7280]">
              Title
              <input className={inputClass} value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
          ) : null}
          {wantsYoutube ? (
            <>
              <label className="text-[11px] font-semibold tracking-[0.16em] text-[#6B7280]">
                Privacy
                <select className={inputClass} value={privacy} onChange={(e) => setPrivacy(e.target.value)}>
                  <option value="private">Private</option>
                  <option value="unlisted">Unlisted</option>
                  <option value="public">Public</option>
                </select>
              </label>
              <label className="text-[11px] font-semibold tracking-[0.16em] text-[#6B7280]">
                Tags
                <input className={inputClass} placeholder="comma separated" value={tags} onChange={(e) => setTags(e.target.value)} />
              </label>
              <label className="flex items-center gap-2 text-[13px] font-semibold">
                <input type="checkbox" checked={kids} onChange={(e) => setKids(e.target.checked)} />
                Made for kids
              </label>
            </>
          ) : null}
          <label className="text-[11px] font-semibold tracking-[0.16em] text-[#6B7280]">
            Mode
            <select className={inputClass} value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="direct">Direct</option>
              <option value="inbox">Inbox</option>
              <option value="export">Export pack</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-[13px] font-semibold">
            <input type="checkbox" checked={approve} onChange={(e) => setApprove(e.target.checked)} />
            Approve now
          </label>
          {video && selected.some((a) => a.platform === "pinterest") ? (
            <p className="text-[12px] text-[#6B7280] md:col-span-2">Pinterest direct is a still. A video on that login uses Export.</p>
          ) : null}
          {wantBoard ? (
            <label className="text-[11px] font-semibold tracking-[0.16em] text-[#6B7280]">
              Board
              <select className={inputClass} value={boardId} onChange={(e) => setBoardId(e.target.value)}>
                {boards.length === 0 ? <option value="">No board yet</option> : null}
                {boards.map((board) => (
                  <option key={board.id} value={board.id}>
                    {board.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {pinLogins.length > 1 && mode === "direct" && !video ? (
            <p className="text-[12px] text-[#6B7280] md:col-span-2">Each Pinterest login needs its own board. Schedule one login at a time.</p>
          ) : null}
          {boardsNote ? <p className="text-[12px] text-[#B91C1C] md:col-span-2">{boardsNote}</p> : null}
          <div className="md:col-span-2">
            <Btn type="submit" disabled={busy === "create" || accountIds.length === 0 || (wantBoard && !boardId)}>
              {busy === "create" ? "Saving…" : "Add to calendar"}
            </Btn>
          </div>
        </form>
      </Surface>
    </Page>
  );
}
