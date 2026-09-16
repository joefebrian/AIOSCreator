import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { cookieHeaderFor } from "./research-cookies";
import { RESEARCH_VIDEO } from "./research-flow";
import { uploadFile } from "./paths";
import { ytdlpDownload } from "./ytdlp";

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const VIDEO_EXT = new Set([".mp4", ".webm", ".mov", ".m4v"]);
const MAX_IMAGE = 20 * 1024 * 1024;
const MAX_VIDEO = RESEARCH_VIDEO.uploadMb * 1024 * 1024;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export type ResearchImport = {
  mediaUrl: string;
  kind: "image" | "video";
  sourceUrl: string;
  note: string;
};

function decode(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extFromUrl(raw: string) {
  try {
    const u = new URL(raw);
    const pathName = u.pathname.toLowerCase();
    const m = pathName.match(/\.(mp4|webm|mov|m4v|jpg|jpeg|png|webp)$/i);
    if (m) return `.${m[1].toLowerCase()}`;
  } catch {
    /* ignore */
  }
  const m = raw.toLowerCase().match(/\.(mp4|webm|mov|m4v|jpg|jpeg|png|webp)(?:\?|$)/);
  return m ? `.${m[1]}` : "";
}

function kindFromExt(ext: string): "image" | "video" | "" {
  if (IMAGE_EXT.has(ext) || ext === ".jpeg") return "image";
  if (VIDEO_EXT.has(ext)) return "video";
  return "";
}

function kindFromType(type: string): "image" | "video" | "" {
  const t = type.toLowerCase().split(";")[0]!.trim();
  if (t === "image/jpeg" || t === "image/jpg" || t === "image/png" || t === "image/webp") return "image";
  if (t === "video/mp4" || t === "video/webm" || t === "video/quicktime") return "video";
  return "";
}

function extFromType(type: string) {
  const t = type.toLowerCase();
  if (t.includes("jpeg") || t.includes("jpg")) return ".jpg";
  if (t.includes("png")) return ".png";
  if (t.includes("webp")) return ".webp";
  if (t.includes("webm")) return ".webm";
  if (t.includes("quicktime")) return ".mov";
  if (t.includes("mp4")) return ".mp4";
  return "";
}

function assertPublicHttp(raw: string) {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new Error("Need a full http(s) URL.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Only http(s) URLs.");
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host === "0.0.0.0" || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("Local URLs are blocked.");
  }
  if (
    /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|169\.254\.|::1|fc|fd)/i.test(host) ||
    host === "localhost"
  ) {
    throw new Error("Private URLs are blocked.");
  }
  return u;
}

function isPlatformWatch(host: string) {
  return (
    /(^|\.)tiktok\.com$/i.test(host) ||
    /(^|\.)youtube\.com$/i.test(host) ||
    /(^|\.)youtu\.be$/i.test(host) ||
    /(^|\.)instagram\.com$/i.test(host) ||
    /(^|\.)cdninstagram\.com$/i.test(host) ||
    /(^|\.)facebook\.com$/i.test(host) ||
    /(^|\.)fb\.watch$/i.test(host) ||
    /(^|\.)x\.com$/i.test(host) ||
    /(^|\.)twitter\.com$/i.test(host) ||
    /(^|\.)t\.co$/i.test(host) ||
    /(^|\.)twimg\.com$/i.test(host)
  );
}

function meta(html: string, prop: string) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i");
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, "i");
  const m = html.match(re) || html.match(re2);
  return m ? decode(m[1]!).trim() : "";
}

function ogMedia(html: string) {
  const video =
    meta(html, "og:video:secure_url") ||
    meta(html, "og:video:url") ||
    meta(html, "og:video") ||
    meta(html, "twitter:player:stream");
  const image = meta(html, "og:image:secure_url") || meta(html, "og:image") || meta(html, "twitter:image");
  return { video, image };
}

function playUrlsFromHtml(html: string) {
  const out: string[] = [];
  const push = (u: string) => {
    const clean = decode(
      u
        .replace(/\\u0026/g, "&")
        .replace(/\\u002F/gi, "/")
        .replace(/\\\//g, "/")
        .replace(/\\u003d/gi, "="),
    );
    if (!/^https?:\/\//i.test(clean)) return;
    if (out.includes(clean)) return;
    out.push(clean);
  };
  for (const re of [
    /"playAddr"\s*:\s*"(https:[^"]+)"/g,
    /"downloadAddr"\s*:\s*"(https:[^"]+)"/g,
    /"play_addr"\s*:\s*\{[^}]*"url_list"\s*:\s*\[\s*"(https:[^"]+)"/g,
    /"video_url"\s*:\s*"(https:[^"]+)"/g,
    /"contentUrl"\s*:\s*"(https:[^"]+\.(?:mp4|m3u8|m4v)[^"]*)"/gi,
    /"(?:url|src)"\s*:\s*"(https:[^"]+\.mp4[^"]*)"/gi,
    /"(https:\\\/\\\/[^"\\]+googlevideo\.com[^"]+)"/g,
    /"(https:\\\/\\\/[^"\\]+tiktokcdn[^"]+)"/g,
    /"(https:\\\/\\\/[^"\\]+cdninstagram\.com[^"]+\.mp4[^"]*)"/gi,
    /"(https:\\\/\\\/[^"\\]+twimg\.com[^"]+\.mp4[^"]*)"/gi,
  ]) {
    for (const m of html.matchAll(re)) push(m[1]!);
  }
  return out.slice(0, 6);
}

async function pull(url: string, timeoutMs: number, extraCookie = "") {
  const cookie = cookieHeaderFor(url, extraCookie);
  const headers: Record<string, string> = {
    "User-Agent": UA,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,video/mp4,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
    Referer: url,
    "sec-ch-ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
  };
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(url, {
    redirect: "follow",
    headers,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`Fetch HTTP ${res.status} from ${new URL(url).host}`);
  const len = Number(res.headers.get("content-length") || 0);
  if (len > MAX_VIDEO) throw new Error(`File too large (${Math.round(len / 1024 / 1024)}MB). Cap ${RESEARCH_VIDEO.uploadMb}MB.`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_VIDEO) throw new Error(`File too large. Cap ${RESEARCH_VIDEO.uploadMb}MB.`);
  return { res, buf, type: (res.headers.get("content-type") || "").toLowerCase(), finalUrl: res.url || url };
}

function writeUpload(buf: Buffer, ext: string, kind: "image" | "video") {
  if (kind === "image" && buf.length > MAX_IMAGE) throw new Error("Image too large (20MB).");
  const safe = (ext === ".jpeg" ? ".jpg" : ext) || (kind === "video" ? ".mp4" : ".jpg");
  const id = randomUUID();
  const dest = uploadFile(id, safe);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  return { id, mediaUrl: `/api/media/uploads/${id}${safe}`, kind };
}

function platformHint(host: string, hadCookie: boolean, ytdlpErr = "") {
  if (!hadCookie) {
    return `${host} needs cookies in System → Settings, then Fetch again. yt-dlp uses that Netscape file.`;
  }
  const extra = ytdlpErr ? ` yt-dlp: ${ytdlpErr.slice(0, 220)}` : "";
  return `${host} download failed.${extra} Refresh cookies in Settings if the session expired, or paste a CDN .mp4.`;
}

export async function importResearchUrl(raw: string, extraCookie = ""): Promise<ResearchImport> {
  const trimmed = raw.trim();
  const first = assertPublicHttp(trimmed);
  const sourceUrl = first.href;
  const hadCookie = Boolean(cookieHeaderFor(sourceUrl, extraCookie));
  let ytdlpErr = "";

  const trySave = (buf: Buffer, type: string, fromUrl: string, note: string): ResearchImport | null => {
    const ext = extFromUrl(fromUrl) || extFromType(type);
    const kind = kindFromExt(ext) || kindFromType(type);
    if (!kind) return null;
    const out = writeUpload(buf, ext || (kind === "video" ? ".mp4" : ".jpg"), kind);
    return { mediaUrl: out.mediaUrl, kind, sourceUrl, note };
  };

  if (isPlatformWatch(first.hostname)) {
    try {
      const clip = await ytdlpDownload(sourceUrl);
      const ext = clip.ext === ".webm" || clip.ext === ".mov" ? clip.ext : ".mp4";
      const out = writeUpload(clip.buf, ext, "video");
      return {
        mediaUrl: out.mediaUrl,
        kind: "video",
        sourceUrl,
        note: `yt-dlp · ${first.host} · ${(clip.bytes / 1024 / 1024).toFixed(1)}MB`,
      };
    } catch (err) {
      ytdlpErr = err instanceof Error ? err.message : String(err);
    }
  }

  const directExt = extFromUrl(sourceUrl);
  const { buf, type, finalUrl } = await pull(sourceUrl, 60_000, extraCookie);

  const asMedia = trySave(buf, type, finalUrl, directExt ? `Direct file ${directExt} from ${first.host}.` : `Fetched ${first.host} as ${type.split(";")[0]}.`);
  if (asMedia && !type.includes("text/html") && !type.includes("application/json") && !type.includes("text/plain")) {
    return asMedia;
  }

  if (type.includes("text/html") || type.includes("application/xhtml")) {
    const html = buf.toString("utf8").slice(0, 1_200_000);
    const og = ogMedia(html);
    const candidates = [...playUrlsFromHtml(html), og.video, og.image].filter(Boolean);
    for (const next of candidates) {
      if (!next || !/^https?:\/\//i.test(next) || next === sourceUrl) continue;
      try {
        assertPublicHttp(next);
        const second = await pull(next, 90_000, extraCookie);
        const fromPlay = playUrlsFromHtml(html).includes(next);
        const saved = trySave(
          second.buf,
          second.type,
          second.finalUrl,
          fromPlay
            ? `Page ${first.host} → play URL (cookies).`
            : og.video && next === og.video
              ? `Page ${first.host} → og:video.`
              : `Page ${first.host} → still (og:image). For motion, paste a CDN .mp4.`,
        );
        if (saved) return saved;
      } catch {
        /* try next candidate */
      }
    }
    if (isPlatformWatch(first.hostname)) {
      throw new Error(platformHint(first.hostname, hadCookie, ytdlpErr));
    }
    throw new Error(
      `That URL is a web page, not a media file. Paste a link that ends with .mp4 / .jpg / .webp / .mov, or a CDN file URL.`,
    );
  }

  if (isPlatformWatch(first.hostname)) throw new Error(platformHint(first.hostname, hadCookie, ytdlpErr));
  throw new Error("URL is not a still or clip. Need an extension: .mp4 .webm .mov .jpg .png .webp.");
}
