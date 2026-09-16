import { createHmac, timingSafeEqual } from "node:crypto";

const SKEW_SEC = 5 * 60;

export function klingWebhookSecret() {
  return (process.env.KLING_WEBHOOK_SECRET || "").trim();
}

export function klingCallbackUrl() {
  const u = (process.env.KLING_CALLBACK_URL || "").trim();
  return /^https:\/\//i.test(u) ? u.replace(/\/$/, "") : "";
}

function header(headers: Headers, name: string) {
  return headers.get(name) || headers.get(name.toLowerCase()) || "";
}

/** Kling/Standard Webhooks: HMAC-SHA256 over `{id}.{timestamp}.{rawBody}`. */
export function verifyKlingWebhook(rawBody: string, headers: Headers, secret = klingWebhookSecret()) {
  if (!secret) throw new Error("KLING_WEBHOOK_SECRET missing");
  const id = header(headers, "webhook-id");
  const ts = header(headers, "webhook-timestamp");
  const sigHeader = header(headers, "webhook-signature");
  if (!id || !ts || !sigHeader) throw new Error("missing webhook signature headers");

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() / 1000 - tsNum) > SKEW_SEC) {
    throw new Error("webhook timestamp out of range");
  }

  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const signed = `${id}.${ts}.${rawBody}`;
  const expected = createHmac("sha256", key).update(signed).digest("base64");
  const expectedBuf = Buffer.from(expected);

  for (const part of sigHeader.split(/\s+/)) {
    const sig = part.startsWith("v1,") ? part.slice(3) : part.includes(",") ? part.split(",", 2)[1] : part;
    if (!sig) continue;
    const got = Buffer.from(sig);
    if (got.length === expectedBuf.length && timingSafeEqual(got, expectedBuf)) return true;
  }
  throw new Error("webhook signature mismatch");
}

export type KlingCallback = {
  id?: string;
  status?: string;
  message?: string;
  external_id?: string;
  outputs?: { type?: string; url?: string }[];
  task_id?: string;
  task_status?: string;
  task_result?: { videos?: { url?: string }[] };
};
