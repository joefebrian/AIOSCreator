import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { ensureImageThumb, isThumbable } from "@/lib/media-thumb";
import { dataRoot } from "@/lib/paths";

export const runtime = "nodejs";

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".md": "text/markdown; charset=utf-8",
};

function resolveMedia(parts: string[]) {
  const rel = parts.join("/");
  if (!rel || rel.includes("..")) return { error: "bad path" as const, status: 400 };
  const root = path.resolve(dataRoot(), "media");
  const abs = path.resolve(root, rel);
  if (!abs.startsWith(root)) return { error: "bad path" as const, status: 400 };
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) return { error: "not found" as const, status: 404 };
  return { abs, ext: path.extname(abs).toLowerCase(), stat: fs.statSync(abs) };
}

function parseRange(header: string | null, size: number) {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const hasStart = m[1] !== "";
  const hasEnd = m[2] !== "";
  if (!hasStart && !hasEnd) return null;
  let start = hasStart ? Number(m[1]) : Math.max(size - Number(m[2]), 0);
  let end = hasEnd && hasStart ? Number(m[2]) : size - 1;
  if (!hasStart) end = size - 1;
  if (start < 0 || end >= size || start > end) return null;
  return { start, end };
}

function fileStream(abs: string, start?: number, end?: number) {
  const opts = start != null && end != null ? { start, end } : {};
  return Readable.toWeb(fs.createReadStream(abs, opts)) as ReadableStream;
}

function fileTag(stat: fs.Stats) {
  return `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
}

function commonHeaders(type: string, filename: string, download: boolean, extra: Record<string, string>) {
  const safe = filename.replace(/[^\w.\-]+/g, "_");
  return {
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=0, must-revalidate",
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${safe}"`,
    ...extra,
  };
}

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await params;
  const found = resolveMedia(parts);
  if ("error" in found) {
    return NextResponse.json({ error: found.error }, { status: found.status });
  }
  const type = TYPES[found.ext] || "application/octet-stream";
  const url = new URL(req.url);
  const download = url.searchParams.has("download");
  const thumbW = Number(url.searchParams.get("w") || 0);
  if (!download && isThumbable(found.ext) && thumbW >= 64 && thumbW <= 1280) {
    const thumb = ensureImageThumb(found.abs, thumbW);
    const tstat = fs.statSync(thumb);
    const ttype = path.extname(thumb).toLowerCase() === ".jpg" ? "image/jpeg" : type;
    const etag = fileTag(tstat);
    if (req.headers.get("if-none-match") === etag) {
      return new NextResponse(null, {
        status: 304,
        headers: { ETag: etag, "Cache-Control": "public, max-age=0, must-revalidate" },
      });
    }
    return new NextResponse(fileStream(thumb), {
      status: 200,
      headers: commonHeaders(ttype, path.basename(thumb), false, {
        "Content-Length": String(tstat.size),
        ETag: etag,
        "Last-Modified": tstat.mtime.toUTCString(),
      }),
    });
  }
  const name = path.basename(found.abs);
  const range = parseRange(req.headers.get("range"), found.stat.size);
  if (range) {
    const len = range.end - range.start + 1;
    return new NextResponse(fileStream(found.abs, range.start, range.end), {
      status: 206,
      headers: commonHeaders(type, name, download, {
        "Content-Length": String(len),
        "Content-Range": `bytes ${range.start}-${range.end}/${found.stat.size}`,
      }),
    });
  }
  return new NextResponse(fileStream(found.abs), {
    status: 200,
    headers: commonHeaders(type, name, download, {
      "Content-Length": String(found.stat.size),
    }),
  });
}

export async function HEAD(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path: parts } = await params;
  const found = resolveMedia(parts);
  if ("error" in found) {
    return new NextResponse(null, { status: found.status });
  }
  const type = TYPES[found.ext] || "application/octet-stream";
  const download = new URL(req.url).searchParams.has("download");
  return new NextResponse(null, {
    status: 200,
    headers: commonHeaders(type, path.basename(found.abs), download, {
      "Content-Length": String(found.stat.size),
    }),
  });
}
