import { NextResponse } from "next/server";
import { listMenuMedia, mediaFileExists, migrateLegacyFactoryMedia } from "@/lib/media-menu";
import { listJobs, updateJob } from "@/lib/store";

export const runtime = "nodejs";

export async function GET() {
  const jobs = listJobs();
  const { patched } = migrateLegacyFactoryMedia(jobs);
  for (const row of patched) {
    updateJob(row.id, { mediaUrl: row.mediaUrl, mediaPath: row.mediaPath, source: row.source });
  }

  const files = listMenuMedia("ugc-factory", /\.(png|jpe?g|webp|mp4|wav)$/i);
  function jobForUrl(url: string) {
    return jobs.find((j) => j.mediaUrl === url || (j.id && url.includes(j.id)));
  }
  function productIdForUrl(url: string) {
    return jobForUrl(url)?.productId;
  }
  const stills = files
    .filter((f) => /\.(png|jpe?g|webp)$/i.test(f.name))
    .slice(0, 24)
    .map((f) => {
      const j = jobForUrl(f.url);
      const model = j?.model || (/AIOSCreator-UGC_Factory/i.test(f.name) ? "factory" : "listing");
      return {
        id: f.id,
        url: f.url,
        createdAt: f.createdAt,
        productId: j?.productId,
        model,
        kind: model === "listing" || model === "catalog" ? "listing" : "factory-still",
      };
    });
  const fileClips = files.filter((f) => /\.mp4$/i.test(f.name));

  const jobClips = listJobs()
    .filter((j) => j.kind === "motion" && j.status === "completed" && j.mediaUrl && j.source === "ugc-factory" && mediaFileExists(j.mediaUrl, j.mediaPath))
    .map((j) => ({
      id: j.id,
      url: j.mediaUrl as string,
      model: j.model,
      createdAt: j.createdAt,
      productId: j.productId,
    }));

  const seen = new Set<string>();
  const clips: { id: string; url: string; model?: string; createdAt: string; productId?: string }[] = [];
  for (const c of [...jobClips, ...fileClips.map((f) => ({ id: f.id, url: f.url, createdAt: f.createdAt }))]) {
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    clips.push({ ...c, productId: c.productId || productIdForUrl(c.url) });
  }
  clips.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return NextResponse.json({ stills, clips: clips.slice(0, 24) });
}
