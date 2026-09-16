"use client";

import { useEffect, useState } from "react";
import { Btn, Page, Pill, Surface } from "@/components/ui";

type Post = {
  id: string;
  platform: string;
  caption: string;
  mediaUrl: string;
  status: string;
  approval: string;
  mode: string;
  scheduledAt?: string;
  error?: string;
  platformPostId?: string;
  exportPath?: string;
};

export default function QueuePage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  async function load() {
    const res = await fetch("/api/distribute/posts");
    const json = await res.json();
    setPosts(json.posts || []);
  }

  useEffect(() => {
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

  return (
    <Page
      kicker="DISTRIBUTE · LIVE"
      title="Publish Queue"
      description="Approve, then Direct / Inbox / Export. Retry is idempotent per post. YouTube cap 12/day. TikTok Direct stays blocked until audit."
      actions={
        <Btn
          type="button"
          variant="ghost"
          onClick={async () => {
            setBusy("tick");
            await fetch("/api/distribute/tick", { method: "POST" });
            await load();
            setBusy("");
          }}
        >
          {busy === "tick" ? "Running…" : "Publish due now"}
        </Btn>
      }
    >
      {error ? <p className="mb-4 text-sm text-[#B91C1C]">{error}</p> : null}
      <div className="space-y-3">
        {posts.length === 0 ? (
          <Surface>
            <p className="text-sm text-[#6B7280]">Queue empty. Schedule from Calendar.</p>
          </Surface>
        ) : (
          posts.map((p) => (
            <Surface key={p.id} className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  {p.platform} · {p.mode}{" "}
                  <Pill tone={p.status === "published" || p.status === "exported" ? "ready" : p.status === "failed" ? "off" : "muted"}>
                    {p.status}
                  </Pill>{" "}
                  <Pill tone={p.approval === "approved" ? "on" : "warn"}>{p.approval}</Pill>
                </p>
                <p className="mt-1 truncate text-[13px] text-[#4B5563]">{p.caption || p.mediaUrl}</p>
                {p.scheduledAt ? <p className="mt-1 text-[12px] text-[#6B7280]">{new Date(p.scheduledAt).toLocaleString()}</p> : null}
                {p.platformPostId ? (
                  <a
                    className="mt-1 inline-block text-[12px] font-semibold text-[#652DFF]"
                    href={
                      p.platform === "youtube"
                        ? `https://www.youtube.com/watch?v=${p.platformPostId}`
                        : p.platform === "x"
                          ? `https://x.com/i/web/status/${p.platformPostId}`
                          : p.platform === "pinterest"
                            ? `https://www.pinterest.com/pin/${p.platformPostId}`
                            : undefined
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    Published {p.platformPostId}
                  </a>
                ) : null}
                {p.exportPath ? (
                  <a className="mt-1 inline-block text-[12px] font-semibold text-[#652DFF]" href={p.exportPath}>
                    Export pack
                  </a>
                ) : null}
                {p.error ? <p className="mt-1 text-[12px] text-[#B91C1C]">{p.error}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {p.approval !== "approved" ? (
                  <Btn type="button" disabled={busy.startsWith(p.id)} onClick={() => void act(p.id, "approve")}>
                    Approve
                  </Btn>
                ) : null}
                <Btn type="button" disabled={busy.startsWith(p.id)} onClick={() => void act(p.id, "publish")}>
                  Publish
                </Btn>
                <Btn type="button" variant="ghost" disabled={busy.startsWith(p.id)} onClick={() => void act(p.id, "export")}>
                  Export
                </Btn>
                <Btn
                  type="button"
                  variant="danger"
                  onClick={async () => {
                    if (!window.confirm("Remove this queued post?")) return;
                    await fetch(`/api/distribute/posts/${p.id}`, { method: "DELETE" });
                    await load();
                  }}
                >
                  Delete
                </Btn>
              </div>
            </Surface>
          ))
        )}
      </div>
    </Page>
  );
}
