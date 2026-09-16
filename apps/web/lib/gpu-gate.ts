import { comfyQueueBusy } from "./comfy";
import { jobOccupiesGpu } from "./job-gpu";
import { listJobs } from "./store";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** One GPU owner at a time on the 3060. Voice/still/motion wait in line. */
export async function waitForGpuIdle(opts: {
  jobId?: string;
  onWait?: (msg: string) => void;
  timeoutMs?: number;
}) {
  const deadline = Date.now() + (opts.timeoutMs ?? 30 * 60_000);
  while (Date.now() < deadline) {
    const others = listJobs().filter((j) => j.id !== opts.jobId && jobOccupiesGpu(j));
    const comfy = await comfyQueueBusy();
    if (!others.length && !comfy) return;
    const who = others[0]?.model || others[0]?.kind || (comfy ? "Comfy" : "GPU");
    opts.onWait?.(`Waiting for GPU (${who})…`);
    await sleep(2500);
  }
  throw new Error("GPU still busy after 30 minutes. Stop the other job, then retry.");
}
