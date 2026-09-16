import fs from "node:fs";
import { bumpAccountUsage, getWanAccount } from "./api-providers";
import { cloudHttpError } from "./cloud-router";
import { logCloudUsage } from "./cloud-usage";
import { assertSpendAllowed } from "./spend-cap";

type WanTask = {
  output?: { task_id?: string; task_status?: string; video_url?: string; code?: string; message?: string };
  code?: string;
  message?: string;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isNetFail(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  const code = err && typeof err === "object" && "cause" in err ? String((err as { cause?: { code?: string } }).cause?.code || "") : "";
  return /fetch failed|ECONNRESET|ETIMEDOUT|UND_ERR|socket|network|aborted/i.test(`${msg} ${code}`);
}

async function fetchRetry(url: string, init: RequestInit, tries = 4) {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      last = err;
      if (!isNetFail(err) || i === tries - 1) throw err;
      await sleep(1500 * (i + 1));
    }
  }
  throw last instanceof Error ? last : new Error("fetch failed");
}

function wanAccount() {
  return getWanAccount();
}

function wanApiRoot(baseURL?: string) {
  const raw = (baseURL || "https://dashscope-intl.aliyuncs.com").trim();
  try {
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (u.hostname.includes("aliyuncs.com")) return `${u.protocol}//${u.host}`;
  } catch {
    /* ignore */
  }
  return "https://dashscope-intl.aliyuncs.com";
}

function mimeFor(path: string) {
  const e = path.toLowerCase();
  if (e.endsWith(".png")) return "image/png";
  if (e.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export async function dashscopeWan3Video(opts: {
  prompt: string;
  stillPath?: string;
  videoUrl?: string;
  durationSec?: number;
  sound?: boolean;
  engineId?: string;
  jobId?: string;
  ratio?: string;
  onProgress?: (label: string) => void;
}) {
  const acc = wanAccount();
  if (!acc?.apiKey) throw new Error("Wan 3.0 needs the Alibaba Wan API key (Singapore).");
  const apiRoot = wanApiRoot(acc.baseURL);

  const media: { type: string; url: string }[] = [];
  if (opts.stillPath && fs.existsSync(opts.stillPath)) {
    const b64 = fs.readFileSync(opts.stillPath).toString("base64");
    media.push({ type: opts.videoUrl ? "reference_image" : "first_frame", url: `data:${mimeFor(opts.stillPath)};base64,${b64}` });
  }
  if (opts.videoUrl) media.push({ type: "reference_video", url: opts.videoUrl });

  const duration = Math.max(2, Math.min(30, Math.round(opts.durationSec || 5)));
  assertSpendAllowed({ model: opts.engineId === "wan-3-0-std" ? "wan-3-0-std" : "wan-3-0", durationSec: duration });
  const engineId = opts.engineId === "wan-3-0-std" ? "wan-3-0-std" : "wan-3-0";
  const slug = engineId === "wan-3-0-std" ? "wan3.0-video" : "wan3.0-video-prime";
  const ratio = (opts.ratio || "9:16").trim() || "9:16";
  const t0 = Date.now();
  const log = (ok: boolean, extra?: { status?: number; error?: string }) => {
    if (acc.id) bumpAccountUsage(acc.id, ok);
    logCloudUsage({
      at: new Date().toISOString(),
      accountId: acc.id,
      providerId: "dashscope",
      model: engineId,
      ok,
      ms: Date.now() - t0,
      baseURL: apiRoot,
      kind: "motion",
      durationSec: duration,
      resolution: "720P",
      jobId: opts.jobId,
      status: extra?.status,
      error: extra?.error,
    });
  };
  opts.onProgress?.(engineId === "wan-3-0-std" ? "Wan 3.0 submitted…" : "Wan 3.0 Prime submitted…");
  try {
    const created = await fetchRetry(`${apiRoot}/api/v1/services/aigc/video-generation/video-synthesis`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${acc.apiKey}`,
        "Content-Type": "application/json",
        "X-DashScope-Async": "enable",
      },
      body: JSON.stringify({
        model: slug,
        input: {
          prompt: (opts.prompt || "Natural motion, photoreal, 9:16.").slice(0, 8000),
          ...(media.length ? { media } : {}),
        },
        parameters: {
          resolution: "720P",
          ratio,
          duration,
          audio: opts.sound !== false,
          prompt_extend: true,
          watermark: false,
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const createdJson = (await created.json().catch(() => ({}))) as WanTask;
    if (!created.ok || createdJson.code) {
      throw cloudHttpError(created.status, createdJson.message || createdJson.code || `Wan HTTP ${created.status}`);
    }
    const taskId = createdJson.output?.task_id;
    if (!taskId) throw new Error("Wan 3.0 returned no task id");

    for (let i = 0; i < 90; i++) {
      await sleep(8000);
      let st: Response;
      try {
        st = await fetchRetry(
          `${apiRoot}/api/v1/tasks/${taskId}`,
          {
            headers: { Authorization: `Bearer ${acc.apiKey}` },
            signal: AbortSignal.timeout(30_000),
          },
          4,
        );
      } catch (err) {
        if (isNetFail(err)) {
          opts.onProgress?.("Wan 3.0 reconnect…");
          continue;
        }
        throw err;
      }
      const json = (await st.json().catch(() => ({}))) as WanTask;
      const status = (json.output?.task_status || "").toUpperCase();
      opts.onProgress?.(`Wan 3.0 ${status || "…"}`);
      if (status === "PENDING" || status === "RUNNING") continue;
      if (status !== "SUCCEEDED") {
        throw new Error(json.output?.message || json.message || `Wan 3.0 ${status || "failed"}`);
      }
      const url = json.output?.video_url;
      if (!url) throw new Error("Wan 3.0 succeeded with no video url");
      const dl = await fetchRetry(url, { signal: AbortSignal.timeout(300_000) }, 5);
      if (!dl.ok) throw new Error(`Wan download HTTP ${dl.status}`);
      log(true);
      return Buffer.from(await dl.arrayBuffer());
    }
    throw new Error("Wan 3.0 timed out");
  } catch (err) {
    const status = err && typeof err === "object" && "status" in err ? Number((err as { status?: number }).status) : undefined;
    const raw = err instanceof Error ? err.message : String(err);
    const error = isNetFail(err)
      ? "Wan network drop to Singapore (poll/download). Retry Generate — the task may already be billed if it finished."
      : raw;
    log(false, { status, error });
    throw new Error(error);
  }
}
