/** Grid/list thumbs. Full file still used for preview / generate.
 *  `stamp` busts browser cache when the same path is overwritten. */
export function thumbSrc(url: string | null | undefined, w = 480, stamp?: string | number | null) {
  if (!url) return "";
  if (url.startsWith("data:") || /^https?:\/\//i.test(url)) return url;
  const join = url.includes("?") ? "&" : "?";
  const t = stamp != null && String(stamp) ? `&t=${encodeURIComponent(String(stamp))}` : "";
  return `${url}${join}w=${w}${t}`;
}

/** Master file. Never pass `w` — media route would JPEG-thumb it. */
export function originalSrc(url: string | null | undefined, download = false) {
  if (!url) return "";
  if (url.startsWith("data:")) return url;
  try {
    const u = new URL(url, "http://local.invalid");
    u.searchParams.delete("w");
    if (download) u.searchParams.set("download", "1");
    else u.searchParams.delete("download");
    return `${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}
