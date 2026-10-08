"use client";

import { useEffect, useState } from "react";
import { Btn, EmptyState, Page, Pill, Surface, TextLink } from "@/components/ui";

type Account = { id: string; platform: string; accountName: string; handle?: string };
type Post = {
  id: string;
  accountId: string;
  platform: string;
  caption: string;
  title?: string;
  mediaUrl: string;
  mediaType?: string;
  status: string;
  approval: string;
  mode: string;
  boardName?: string;
  scheduledAt?: string;
  error?: string;
  platformPostId?: string;
  exportPath?: string;
};

type Filter = "all" | "needs" | "scheduled" | "done" | "failed";

function liveUrl(p: Post) {
  if (!p.platformPostId) return "";
  if (p.platform === "youtube") return `https://www.youtube.com/watch?v=${p.platformPostId}`;
  if (p.platform === "x") return `https://x.com/i/web/status/${p.platformPostId}`;
  if (p.platform === "pinterest") return `https://www.pinterest.com/pin/${p.platformPostId}`;
  return "";
}

function statusTone(status: string): "ready" | "off" | "muted" | "warn" {
  if (status === "published" || status === "exported") return "ready";
  if (status === "failed") return "off";
  if (status === "publishing") return "warn";
  return "muted";
}

export default function QueuePage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [focus, setFocus] = useState("");

  async function load() {
    const res = await fetch("/api/distribute/posts");
    const json = await res.json();
    setPosts(json.posts || []);
    setAccounts(json.accounts || []);
  }

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    setFocus(q.get("post") || "");
    const asked = q.get("filter");
    if (asked === "needs" || asked === "scheduled" || asked === "done" || asked === "failed") setFilter(asked);
    void load();
  }, []);

  async function act(id: string, action: string) {
    setBusy(id + action);
    setError("");
    try {
      const res = await fetch(`/api/distribute/posts/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "failed");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  const visible = posts.filter((p) => {
    if (filter === "needs") return p.approval !== "approved" && p.status !== "published" && p.status !== "exported";
    if (filter === "scheduled") return p.status === "scheduled" || p.status === "draft";
    if (filter === "done") return p.status === "published" || p.status === "exported";
    if (filter === "failed") return p.status === "failed";
    return true;
  });

  const filters: { id: Filter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "needs", label: "Needs approval" },
    { id: "scheduled", label: "Scheduled" },
    { id: "done", label: "Done" },
    { id: "failed", label: "Failed" },
  ];

  return (
    <Page
      kicker="DISTRIBUTE"
      title="Publish"
      description="Approve a row, then publish it. Direct uses the connected login. Export writes a pack on this PC."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <TextLink href="/distribute/calendar">Calendar</TextLink>
          <Btn
            type="button"
            variant="ghost"
            onClick={async () => {
              setBusy("tick");
              setError("");
              try {
                const res = await fetch("/api/distribute/tick", { method: "POST" });
                const json = await res.json();
                if (!res.ok) throw new Error(json.error || "tick failed");
                await load();
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
              } finally {
                setBusy("");
              }
            }}
          >
            {busy === "tick" ? "Running…" : "Publish due now"}
          </Btn>
        </div>
      }
    >
      {error ? <p className="mb-4 text-sm text-[#B91C1C]">{error}</p> : null}
      <div className="mb-4 flex flex-wrap gap-2">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-3 py-1 text-[12px] font-semibold ${filter === f.id ? "bg-[#652DFF] text-white" : "bg-white text-[#4B5563] ring-1 ring-[#E6E8EE]"}`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {posts.length === 0 ? (
        <EmptyState title="Nothing queued" body="Schedule a still from Calendar. It shows up here for approval." action={<TextLink href="/distribute/calendar">Open Calendar</TextLink>} />
      ) : visible.length === 0 ? (
        <EmptyState title="Nothing in this filter" body="Switch the filter, or schedule another post." />
      ) : (
        <div className="space-y-3">
          {visible.map((p) => {
            const account = accounts.find((a) => a.id === p.accountId);
            const href = liveUrl(p);
            const done = p.status === "published" || p.status === "exported";
            const video = p.mediaType === "video" || /\.mp4($|\?)/i.test(p.mediaUrl);
            const who = account?.handle ? `@${account.handle}` : account?.accountName || p.platform;
            return (
              <Surface key={p.id} className={`flex flex-wrap items-start gap-3 ${focus === p.id ? "ring-2 ring-[#652DFF]" : ""}`}>
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[#F3F4F8]">
                  {video ? (
                    <video src={p.mediaUrl} className="h-full w-full object-cover" muted />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.mediaUrl} alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {who} <span className="font-normal text-[#6B7280]">· {p.platform} · {p.mode}</span>
                  </p>
                  <p className="mt-1 flex flex-wrap gap-1">
                    <Pill tone={statusTone(p.status)}>{p.status}</Pill>
                    <Pill tone={p.approval === "approved" ? "on" : "warn"}>{p.approval}</Pill>
                  </p>
                  <p className="mt-1 line-clamp-2 text-[13px] text-[#4B5563]">{p.caption || p.title || "No caption"}</p>
                  {p.scheduledAt ? <p className="mt-1 text-[12px] text-[#6B7280]">{new Date(p.scheduledAt).toLocaleString()}</p> : null}
                  {p.boardName ? <p className="mt-1 text-[12px] text-[#6B7280]">Board · {p.boardName}</p> : null}
                  {href ? (
                    <a className="mt-1 inline-block text-[12px] font-semibold text-[#652DFF]" href={href} target="_blank" rel="noreferrer">
                      Open on {p.platform}
                    </a>
                  ) : null}
                  {p.exportPath ? (
                    <a className="mt-1 block text-[12px] font-semibold text-[#652DFF]" href={p.exportPath}>
                      Export pack
                    </a>
                  ) : null}
                  {p.error ? <p className="mt-1 text-[12px] text-[#B91C1C]">{p.error}</p> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {p.approval !== "approved" && !done ? (
                    <Btn type="button" disabled={busy.startsWith(p.id)} onClick={() => void act(p.id, "approve")}>
                      Approve
                    </Btn>
                  ) : null}
                  {!done ? (
                    <Btn type="button" disabled={busy.startsWith(p.id) || p.approval !== "approved"} onClick={() => void act(p.id, "publish")}>
                      Publish
                    </Btn>
                  ) : null}
                  <Btn type="button" variant="ghost" disabled={busy.startsWith(p.id)} onClick={() => void act(p.id, "export")}>
                    Export
                  </Btn>
                  <Btn
                    type="button"
                    variant="danger"
                    disabled={busy.startsWith(p.id)}
                    onClick={async () => {
                      if (!window.confirm("Remove this queued post?")) return;
                      setBusy(p.id + "delete");
                      setError("");
                      try {
                        const res = await fetch(`/api/distribute/posts/${p.id}`, { method: "DELETE" });
                        const json = await res.json().catch(() => ({}));
                        if (!res.ok) throw new Error(json.error || "delete failed");
                        await load();
                      } catch (err) {
                        setError(err instanceof Error ? err.message : String(err));
                      } finally {
                        setBusy("");
                      }
                    }}
                  >
                    Delete
                  </Btn>
                </div>
              </Surface>
            );
          })}
        </div>
      )}
    </Page>
  );
}
