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

/** Singapore Model Studio video API. Not China Beijing. */
export const WAN_SINGAPORE_ROOT = "https://dashscope-intl.aliyuncs.com";
export const WAN_SINGAPORE_API = `${WAN_SINGAPORE_ROOT}/api/v1`;

export function wanApiRoot(baseURL?: string) {
  const raw = (baseURL || WAN_SINGAPORE_ROOT).trim();
  try {
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    const host = u.hostname.toLowerCase();
    if (host.includes("dashscope-intl")) return WAN_SINGAPORE_ROOT;
    if (host === "dashscope.aliyuncs.com" || host === "dashscope.aliyun.com" || host.endsWith(".aliyun.com")) {
      return WAN_SINGAPORE_ROOT;
    }
    if (host.endsWith(".aliyuncs.com")) return `${u.protocol}//${u.host}`;
  } catch {
    /* ignore */
  }
  return WAN_SINGAPORE_ROOT;
}

function mimeFor(path: string) {
  const e = path.toLowerCase();
  if (e.endsWith(".png")) return "image/png";
  if (e.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

/** I2V: still is ground truth. Prompt may only add motion/camera — unless extra wardrobe refs are attached. */
function wanMotionPrompt(prompt: string | undefined, hasStill: boolean, wardrobeRef = false) {
  const body = (prompt || "Natural motion, photoreal, 9:16.").trim().slice(0, 7000);
  if (!hasStill) return body.slice(0, 8000);
  if (wardrobeRef) {
    return [
      "Image 1 / first frame is the person — keep that face, hair, and body.",
      "Later reference images are wardrobe/product. She wears those garments.",
      "Photoreal. One woman.",
      body,
    ]
      .join(" ")
      .slice(0, 8000);
  }
  return [
    "Animate the first frame only.",
    "Keep the exact face, hair, clothes, body, and location from the image.",
    "Do not change outfit, hairstyle, or setting even if the text describes different clothes or a different place.",
    "The text is motion and camera only.",
    body,
  ]
    .join(" ")
    .slice(0, 8000);
}

export async function dashscopeWan3Video(opts: {
  prompt: string;
  stillPath?: string;
  extraStillPaths?: string[];
  videoUrl?: string;
  durationSec?: number;
  sound?: boolean;
  /** When false, DashScope does not rewrite the prompt. Use that when the look is already specified. */
  promptExtend?: boolean;
  engineId?: string;
  jobId?: string;
  ratio?: string;
  onProgress?: (label: string) => void;
}) {
  const acc = wanAccount();
  if (!acc?.apiKey) throw new Error("Wan 3.0 needs the Alibaba Wan API key (Singapore dashscope-intl.aliyuncs.com).");
  const apiRoot = wanApiRoot(acc.baseURL);

  const media: { type: string; url: string }[] = [];
  const extras = (opts.extraStillPaths || []).filter((p) => p && p !== opts.stillPath && fs.existsSync(p)).slice(0, 4);
  if (opts.stillPath && fs.existsSync(opts.stillPath)) {
    const b64 = fs.readFileSync(opts.stillPath).toString("base64");
    // Wan: first_frame may only pair with last_frame — not reference_image.
    media.push({
      type: opts.videoUrl ? "reference_image" : "first_frame",
      url: `data:${mimeFor(opts.stillPath)};base64,${b64}`,
    });
  }
  const hasStill = media.some((m) => m.type === "first_frame" || m.type === "reference_image");
  const wardrobeRef = extras.length > 0;
  if (opts.videoUrl) media.push({ type: "reference_video", url: opts.videoUrl });

  const duration = Math.max(2, Math.min(30, Math.round(opts.durationSec || 5)));
  assertSpendAllowed({ model: opts.engineId === "wan-3-0-std" ? "wan-3-0-std" : "wan-3-0", durationSec: duration });
  const engineId = opts.engineId === "wan-3-0-std" ? "wan-3-0-std" : "wan-3-0";
  let slug = engineId === "wan-3-0-std" ? "wan3.0-video" : "wan3.0-video-prime";
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
          prompt: wanMotionPrompt(opts.prompt, hasStill, wardrobeRef),
          ...(media.length ? { media } : {}),
        },
        parameters: {
          resolution: "720P",
          ratio,
          duration,
          audio: opts.sound !== false,
          // LLM rewrite invents a new costume/location and fights the first frame.
          prompt_extend: opts.promptExtend ?? !hasStill,
          watermark: false,
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    let createdJson = (await created.json().catch(() => ({}))) as WanTask;
    const primeBlocked =
      slug === "wan3.0-video-prime" &&
      /x-dashaigc-stage-capability|wan3_base|unknown.*prime/i.test(
        `${createdJson.message || ""} ${createdJson.code || ""} ${createdJson.output?.message || ""}`,
      );
    if ((!created.ok || createdJson.code) && primeBlocked) {
      slug = "wan3.0-video";
      opts.onProgress?.("Wan Prime not on this key — Wan 3.0 std…");
      const retry = await fetchRetry(`${apiRoot}/api/v1/services/aigc/video-generation/video-synthesis`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${acc.apiKey}`,
          "Content-Type": "application/json",
          "X-DashScope-Async": "enable",
        },
        body: JSON.stringify({
          model: slug,
          input: {
            prompt: wanMotionPrompt(opts.prompt, hasStill, wardrobeRef),
            ...(media.length ? { media } : {}),
          },
          parameters: {
            resolution: "720P",
            ratio,
            duration,
            audio: opts.sound !== false,
            prompt_extend: opts.promptExtend ?? !hasStill,
            watermark: false,
          },
        }),
        signal: AbortSignal.timeout(60_000),
      });
      createdJson = (await retry.json().catch(() => ({}))) as WanTask;
      if (!retry.ok || createdJson.code) {
        throw cloudHttpError(retry.status, createdJson.message || createdJson.code || `Wan HTTP ${retry.status}`);
      }
    } else if (!created.ok || createdJson.code) {
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
