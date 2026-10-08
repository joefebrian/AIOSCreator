"use client";

import { useParams, useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { CharacterStudio } from "@/components/create/CharacterStudio";
import type { Character, CharacterInspiration, CharacterSlot } from "@/lib/character-types";
import { formatElapsed, pollJob, readJson } from "@/lib/http";

function jobKey(id: string) {
  return `creatoros.charJob.${id}`;
}

function WorkspaceInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [row, setRow] = useState<Character | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [elapsed, setElapsed] = useState("");
  const [progress, setProgress] = useState("");
  const [clips, setClips] = useState<{ id: string; mediaUrl?: string; model?: string; createdAt: string }[]>([]);
  const [pins, setPins] = useState<CharacterInspiration[]>([]);

  const load = useCallback(() => {
    fetch(`/api/characters/${id}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "not found");
        setRow(j as Character);
        if (!(j as Character).identityUrl) router.replace(`/create/characters/${id}`);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [id, router]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetch("/api/inspiration")
      .then((r) => r.json())
      .then((j) => setPins((j.items || []) as CharacterInspiration[]))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    fetch(`/api/jobs?characterId=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((j) => {
        const all = (j.jobs || []) as {
          id: string;
          kind: string;
          status: string;
          mediaUrl?: string;
          model?: string;
          createdAt: string;
          characterId?: string;
          input?: string;
          provider?: string;
          upscaled?: boolean;
        }[];
        setClips(all.filter((x) => x.status === "completed" && x.mediaUrl));
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

  const followJob = useCallback(
    async (jobId: string, label: string, opts?: { release?: boolean }) => {
      try {
        sessionStorage.setItem(jobKey(id), JSON.stringify({ jobId, label }));
      } catch {
        /* ignore */
      }
      setBusy(label);
      setError("");
      try {
        const job = await pollJob(jobId, (j) => setProgress(j.progress || ""));
        if (job.status === "failed") throw new Error(job.error || "failed");
        load();
        if (job.mediaUrl) {
          setClips((prev) => [job, ...prev.filter((c) => c.id !== job.id)]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        throw err;
      } finally {
        if (opts?.release !== false) {
          try {
            sessionStorage.removeItem(jobKey(id));
          } catch {
            /* ignore */
          }
          setBusy("");
          setProgress("");
        }
      }
    },
    [id, load],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let jobId = "";
      let label = "job";
      try {
        const raw = sessionStorage.getItem(jobKey(id));
        if (raw) {
          const saved = JSON.parse(raw) as { jobId?: string; label?: string };
          jobId = saved.jobId || "";
          label = saved.label || "job";
        }
      } catch {
        /* ignore */
      }
      if (!jobId) {
        try {
          const r = await fetch("/api/jobs");
          const j = await r.json();
          const run = (j.jobs || []).find(
            (x: { status: string; characterId?: string; id: string; model?: string }) =>
              x.status === "running" && x.characterId === id,
          );
          if (run) {
            jobId = run.id;
            label = run.model || "job";
          }
        } catch {
          return;
        }
      }
      if (!jobId || cancelled) return;
      try {
        await followJob(jobId, label);
      } catch {
        /* followJob already surfaces the error */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, followJob]);

  async function genSlot(slot: CharacterSlot, prompt: string) {
    setBusy(slot.key);
    setError("");
    try {
      const res = await fetch(`/api/characters/${id}?op=slot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: slot.key, prompt: prompt || slot.prompt }),
      });
      const json = await readJson<Character & { jobId?: string; pending?: string; error?: string }>(res);
      if (!res.ok) throw new Error(json.error || "failed");
      if (json.jobId && (res.status === 202 || json.pending)) {
        await followJob(json.jobId, slot.key);
        return;
      }
      setRow(json);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  async function generateMotion(opts: {
    imageUrl: string;
    prompt: string;
    durationSec: number;
    motionUrl?: string;
    engineId?: string;
    sound?: boolean;
    extraUrls?: string[];
    orientation?: "image" | "video";
    productId?: string;
  }) {
    setBusy("motion");
    setError("");
    try {
      const res = await fetch("/api/jobs/motion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...opts,
          characterId: id,
          engineId: opts.engineId || "minimax-h3",
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.status);
      if (json.status === "running" || res.status === 202) {
        await followJob(json.id, "motion");
        return;
      }
      if (json.mediaUrl) setClips((prev) => [json, ...prev.filter((c) => c.id !== json.id)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy("");
    }
  }

  if (!row) {
    return <p className="px-6 py-10 text-sm text-[#6B7280]">{error || "Loading workspace…"}</p>;
  }

  return (
    <CharacterStudio
      character={row}
      clips={clips}
      busy={busy}
      error={error}
      notice={notice}
      elapsed={elapsed}
      progress={progress}
      onGenSlot={(slot, prompt) => genSlot(slot, prompt)}
      onEdit={async (opts) => {
        const count = Math.min(4, Math.max(1, Math.round(opts.count || 1)));
        setBusy("edit");
        setError("");
        setNotice("");
        const problems: string[] = [];
        try {
          for (let i = 0; i < count; i++) {
            if (count > 1) setNotice(`Image ${i + 1} of ${count}`);
            const res = await fetch(`/api/characters/${id}?op=edit`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(opts),
            });
            const json = await res.json();
            if (!res.ok) {
              problems.push(json.error || "edit failed");
              continue;
            }
            if (i === 0 && Array.isArray(json.warnings) && json.warnings.length) {
              setNotice(json.warnings.filter(Boolean).slice(0, 2).join(" · "));
            }
            if (json.jobId && (res.status === 202 || json.pending)) {
              try {
                await followJob(json.jobId, opts.mode === "face-swap" ? "face-swap" : "edit", {
                  release: false,
                });
              } catch (err) {
                problems.push(err instanceof Error ? err.message : String(err));
              }
              continue;
            }
            if (json.id) setRow(json);
            else load();
          }
        } catch (err) {
          problems.push(err instanceof Error ? err.message : String(err));
        } finally {
          try {
            sessionStorage.removeItem(jobKey(id));
          } catch {
            /* ignore */
          }
          setBusy("");
          setProgress("");
          if (problems.length) setError(problems[0] || "edit failed");
          if (count > 1) {
            const done = count - problems.length;
            setNotice(done === count ? `${count} images` : `${done} of ${count} images`);
          }
        }
      }}
      onUpscale={async (slot) => {
        setBusy(`upscale-${slot}`);
        setError("");
        try {
          const res = await fetch(`/api/characters/${id}?op=upscale`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slot }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || "upscale failed");
          setRow(json);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setBusy("");
        }
      }}
      onUpscaleVideo={async (mediaUrl) => {
        setBusy(`upscale-${mediaUrl}`);
        setError("");
        try {
          const res = await fetch("/api/jobs/upscale", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ videoUrl: mediaUrl }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || "upscale failed");
          setClips((prev) =>
            prev.map((c) => (c.mediaUrl === mediaUrl || c.id === json.replaced ? { ...c, upscaled: true } : c)),
          );
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setBusy("");
        }
      }}
      onVideoSet={() => {
        void (async () => {
          setBusy("video-set");
          setError("");
          try {
            const res = await fetch(`/api/characters/${id}?op=video-set`, { method: "POST" });
            const json = await readJson<{ jobId?: string; error?: string }>(res);
            if (!res.ok) throw new Error(json.error || "failed");
            if (json.jobId) await followJob(json.jobId, "complete-set");
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setBusy("");
          }
        })();
      }}
      onMotion={(opts) => void generateMotion(opts)}
      onReplicate={(opts) => {
        void (async () => {
          setBusy("replicate");
          setError("");
          try {
            const res = await fetch(`/api/characters/${id}/replicate`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(opts),
            });
            const json = await readJson<{ id?: string; error?: string }>(res);
            if (!res.ok) throw new Error(json.error || "replicate failed");
            if (json.id) await followJob(json.id, "replicate");
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
            setBusy("");
          }
        })();
      }}
      onToggleInspiration={async (item) => {
        setError("");
        try {
          const res = await fetch("/api/inspiration", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: item.url, kind: item.kind, label: item.label || row?.name }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || "pin failed");
          setPins((json.items || []) as CharacterInspiration[]);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }}
      sharedInspiration={pins}
      onDeleteMedia={async (url) => {
        setError("");
        try {
          const res = await fetch(`/api/characters/${id}?op=delete-media`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || "delete failed");
          if (json.id) setRow(json);
          setClips((prev) => prev.filter((c) => c.mediaUrl !== url));
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }}
      onDelete={async (typed) => {
        if (typed.trim() !== row.name) {
          setError("Type the character name to delete.");
          return;
        }
        const res = await fetch(`/api/characters/${id}`, { method: "DELETE" });
        if (res.ok) router.push("/create/characters");
      }}
      onTogglePublic={(next) => {
        void fetch(`/api/characters/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ visibility: next ? "public" : "private" }),
        }).then(() => load());
      }}
    />
  );
}

export default function CharacterWorkspacePage() {
  return (
    <Suspense fallback={<p className="px-6 py-10 text-sm text-[#6B7280]">Loading workspace…</p>}>
      <WorkspaceInner />
    </Suspense>
  );
}
