export async function readJson<T = { error?: string }>(res: Response): Promise<T> {
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`HTTP ${res.status}`);
  }
}

export type JobRow = {
  id: string;
  status: string;
  error?: string;
  mediaUrl?: string;
  progress?: string;
  model?: string;
  provider?: string;
  input?: string;
  createdAt?: string;
  updatedAt?: string;
};

export function formatElapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m ? `${m}m ${r}s` : `${r}s`;
}

export async function pollJob(id: string, onTick?: (j: JobRow) => void): Promise<JobRow> {
  for (;;) {
    const res = await fetch(`/api/jobs/${id}`);
    const j = await readJson<JobRow & { error?: string }>(res);
    if (!res.ok) throw new Error(j.error || `job HTTP ${res.status}`);
    onTick?.(j);
    if (j.status === "completed" || j.status === "failed") return j;
    await new Promise((r) => setTimeout(r, 2000));
  }
}
