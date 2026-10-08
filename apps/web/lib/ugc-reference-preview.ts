/** Client-safe post identity and embed preview. No files, no network. */

export function referenceIdentity(raw: string) {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new Error("Enter an http or https URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") throw new Error("Enter an http or https URL.");
  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  const pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  const instagram = host === "instagram.com" ? pathname.match(/\/(?:reel|p|tv)\/([A-Za-z0-9_-]+)/i) : null;
  if (instagram) {
    const postId = instagram[1];
    return { platform: "instagram", postId, url: raw.trim(), dedupeKey: `instagram:${postId.toLowerCase()}` };
  }
  const tiktok = host.endsWith("tiktok.com") ? pathname.match(/\/video\/(\d+)/) : null;
  if (tiktok) return { platform: "tiktok", postId: tiktok[1], url: raw.trim(), dedupeKey: `tiktok:${tiktok[1]}` };
  const facebook = host.endsWith("facebook.com") || host === "fb.watch" ? pathname.match(/\/(?:reel|videos|posts)\/(\d+)/i) : null;
  if (facebook) return { platform: "facebook", postId: facebook[1], url: raw.trim(), dedupeKey: `facebook:${facebook[1]}` };
  const youtubeHost = host === "youtube.com" || host === "youtu.be" || host.endsWith(".youtube.com");
  if (youtubeHost) {
    const shorts = pathname.match(/\/shorts\/([A-Za-z0-9_-]{6,})/);
    const embed = pathname.match(/\/embed\/([A-Za-z0-9_-]{6,})/);
    const short = host === "youtu.be" ? pathname.split("/").filter(Boolean)[0] : "";
    const postId = parsed.searchParams.get("v") || shorts?.[1] || embed?.[1] || short || "";
    if (postId) return { platform: "youtube", postId, url: raw.trim(), dedupeKey: `youtube:${postId}` };
  }
  const x = host === "x.com" || host === "twitter.com" ? pathname.match(/\/status\/(\d+)/) : null;
  if (x) return { platform: "x", postId: x[1], url: raw.trim(), dedupeKey: `x:${x[1]}` };
  return { platform: host || "link", postId: null, url: raw.trim(), dedupeKey: `url:${parsed.origin}${pathname}${parsed.search}` };
}

export function canAcquirePost(raw: string) {
  try {
    const identity = referenceIdentity(raw);
    const host = new URL(identity.url).hostname.replace(/^www\./, "").toLowerCase();
    const social = host === "instagram.com" || host.endsWith("tiktok.com") || host.endsWith("facebook.com") || host === "fb.watch" || host === "youtube.com" || host === "youtu.be" || host === "x.com" || host === "twitter.com";
    if (social) return Boolean(identity.postId);
    return true;
  } catch {
    return false;
  }
}

/** Embed is a preview surface only. It is not a stored analysis asset. */
export function embedPreviewUrl(raw: string) {
  let identity: ReturnType<typeof referenceIdentity>;
  try {
    identity = referenceIdentity(raw);
  } catch {
    return null;
  }
  if (!identity.postId) return null;
  if (identity.platform === "instagram") {
    const kind = /\/tv\//i.test(identity.url) ? "tv" : /\/p\//i.test(identity.url) ? "p" : "reel";
    return `https://www.instagram.com/${kind}/${identity.postId}/embed`;
  }
  if (identity.platform === "tiktok") return `https://www.tiktok.com/embed/v2/${identity.postId}`;
  return null;
}
