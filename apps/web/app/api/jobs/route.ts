import { NextResponse } from "next/server";
import { comfyQueueBusy } from "@/lib/comfy";
import { jobOccupiesGpu } from "@/lib/job-gpu";
import { jobBelongsToCharacter, listJobs, liveModules, updateJob } from "@/lib/store";

export const runtime = "nodejs";

const STALE_MS = 12 * 60 * 1000;

async function reapStaleRunningJobs() {
  const gpuBusy = await comfyQueueBusy();
  if (gpuBusy) return;
  const now = Date.now();
  for (const j of listJobs()) {
    if (!jobOccupiesGpu(j)) continue;
    const t = Date.parse(j.updatedAt || j.createdAt);
    if (!Number.isFinite(t) || now - t < STALE_MS) continue;
    updateJob(j.id, { status: "failed", error: "stale - GPU idle, job process died" });
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const characterId = url.searchParams.get("characterId") || "";
  const live = url.searchParams.get("live") === "1";
  if (!live) await reapStaleRunningJobs();
  const all = listJobs();
  const scoped = characterId ? all.filter((j) => jobBelongsToCharacter(j, characterId)) : all;
  const jobs = live ? scoped.filter((j) => j.status === "running" || j.status === "queued") : scoped;
  return NextResponse.json({
    jobs,
    liveModules: liveModules(),
    modulesLive: liveModules().length,
    modulesTotal: 7,
  });
}
