import fs from "node:fs";
import path from "node:path";
import { ensureDataDirs, mediaUrlToPath } from "./paths";
import { listPublications, type Publication, updatePublication } from "./publications";
import { canStripAiMarks, stripAiMarksForDownload } from "./strip-ai-marks";
import {
  getSocialAccount,
  socialApps,
  upsertSocialAccount,
  type SocialAccount,
} from "./social-accounts";
import { PINTEREST_API } from "./social-oauth";

const YT_INSERT_CAP = 12;

function extOf(p: string) {
  return path.extname(p).toLowerCase();
}

function mimeOf(p: string) {
  const e = extOf(p);
  if (e === ".mp4") return "video/mp4";
  if (e === ".mov") return "video/quicktime";
  if (e === ".webm") return "video/webm";
  if (e === ".jpg" || e === ".jpeg") return "image/jpeg";
  if (e === ".webp") return "image/webp";
  if (e === ".png") return "image/png";
  return "application/octet-stream";
}

export function youtubeInsertsToday(accountId: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return listPublications().filter(
    (p) =>
      p.accountId === accountId &&
      p.platform === "youtube" &&
      p.status === "published" &&
      p.publishedAt &&
      Date.parse(p.publishedAt) >= start.getTime(),
  ).length;
}

export async function refreshYoutube(row: SocialAccount): Promise<SocialAccount> {
  const apps = socialApps();
  const app = apps.youtube;
  if (!app?.clientId || !app.clientSecret || !row.refreshToken) return row;
  const exp = row.tokenExpiry ? Date.parse(row.tokenExpiry) : 0;
  if (exp && exp - 60_000 > Date.now() && row.accessToken) return row;
  const body = new URLSearchParams({
    client_id: app.clientId,
    client_secret: app.clientSecret,
    refresh_token: row.refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body });
  const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !json.access_token) throw new Error(json.error || `YouTube refresh HTTP ${res.status}`);
  return upsertSocialAccount({
    ...row,
    accessToken: json.access_token,
    tokenExpiry: new Date(Date.now() + (json.expires_in || 3600) * 1000).toISOString(),
    connectionState: "connected",
    lastError: undefined,
  });
}

async function refreshTiktok(row: SocialAccount): Promise<SocialAccount> {
  const apps = socialApps();
  const app = apps.tiktok;
  if (!app?.clientId || !app.clientSecret || !row.refreshToken) return row;
  const exp = row.tokenExpiry ? Date.parse(row.tokenExpiry) : 0;
  if (exp && exp - 60_000 > Date.now() && row.accessToken) return row;
  const body = new URLSearchParams({
    client_key: app.clientId,
    client_secret: app.clientSecret,
    grant_type: "refresh_token",
    refresh_token: row.refreshToken,
  });
  const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", { method: "POST", body });
  const json = (await res.json()) as { access_token?: string; expires_in?: number; refresh_token?: string; error?: string };
  if (!res.ok || !json.access_token) throw new Error(json.error || `TikTok refresh HTTP ${res.status}`);
  return upsertSocialAccount({
    ...row,
    accessToken: json.access_token,
    refreshToken: json.refresh_token || row.refreshToken,
    tokenExpiry: new Date(Date.now() + (json.expires_in || 86400) * 1000).toISOString(),
    connectionState: "connected",
    lastError: undefined,
  });
}

/** Library masters stay. The copy that leaves this PC has C2PA/EXIF and the corner mark removed. */
async function fileForUpload(mediaUrl: string): Promise<string> {
  const src = mediaUrlToPath(mediaUrl);
  if (!src || !fs.existsSync(src)) throw new Error("media file missing");
  if (!canStripAiMarks(path.extname(src))) return src;
  return stripAiMarksForDownload(src);
}

export async function writeExportPack(post: Publication): Promise<string> {
  const dir = path.join(ensureDataDirs(), "media", "exports", post.id);
  fs.mkdirSync(dir, { recursive: true });
  const src = await fileForUpload(post.mediaUrl);
  const destMedia = path.join(dir, `media${extOf(src) || (post.mediaType === "video" ? ".mp4" : ".png")}`);
  fs.copyFileSync(src, destMedia);
  fs.writeFileSync(path.join(dir, "caption.txt"), post.caption || "", "utf8");
  fs.writeFileSync(
    path.join(dir, "disclosure.md"),
    [
      `# Export pack · ${post.platform}`,
      "",
      post.disclosure || "Add paid-promotion / affiliate disclosure in the native app if this is commercial.",
      "",
      post.containsSyntheticMedia ? "Mark as AI-generated / contains synthetic media where the platform asks." : "",
      post.madeForKids ? "Made for kids: YES" : "Made for kids: NO",
      "",
      "Finish in the official app if Direct/Inbox is not connected.",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "meta.json"),
    JSON.stringify(
      {
        platform: post.platform,
        title: post.title,
        caption: post.caption,
        privacy: post.privacy,
        containsSyntheticMedia: post.containsSyntheticMedia,
        madeForKids: post.madeForKids,
        characterId: post.characterId,
      },
      null,
      2,
    ),
    "utf8",
  );
  return `/api/media/exports/${post.id}/caption.txt`;
}

async function publishYoutube(account: SocialAccount, post: Publication): Promise<string> {
  const live = await refreshYoutube(account);
  if (!live.accessToken) throw new Error("YouTube not connected");
  const used = youtubeInsertsToday(account.id);
  if (used >= YT_INSERT_CAP) throw new Error(`YouTube daily cap ${YT_INSERT_CAP} (PRD). Override later with a reason.`);
  if (used >= 8) {
    // warn only — still allow until 12
  }
  const file = await fileForUpload(post.mediaUrl);
  const size = fs.statSync(file).size;
  const privacy = post.approval === "approved" ? post.privacy : "private";
  const tags = (post.tags || "")
    .split(/[,#\n]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 15);
  const snippet = {
    title: (post.title || post.caption || "Short").slice(0, 100),
    description: [post.caption, post.disclosure].filter(Boolean).join("\n\n").slice(0, 5000),
    categoryId: post.categoryId || "22",
    ...(tags.length ? { tags } : {}),
  };
  const status = {
    privacyStatus: privacy,
    selfDeclaredMadeForKids: post.madeForKids,
    containsSyntheticMedia: post.containsSyntheticMedia,
  };
  const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${live.accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(size),
      "X-Upload-Content-Type": mimeOf(file),
    },
    body: JSON.stringify({ snippet, status }),
  });
  if (!init.ok) {
    const t = await init.text();
    throw new Error(`YouTube init HTTP ${init.status}: ${t.slice(0, 400)}`);
  }
  const loc = init.headers.get("location");
  if (!loc) throw new Error("YouTube did not return an upload URL");
  const put = await fetch(loc, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${live.accessToken}`,
      "Content-Type": mimeOf(file),
      "Content-Length": String(size),
    },
    body: new Uint8Array(fs.readFileSync(file)),
  });
  const json = (await put.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!put.ok || !json.id) throw new Error(json.error?.message || `YouTube upload HTTP ${put.status}`);
  return json.id;
}

async function publishTiktokInbox(account: SocialAccount, post: Publication): Promise<string> {
  const live = await refreshTiktok(account);
  if (!live.accessToken) throw new Error("TikTok not connected");
  if (post.mediaType !== "video") throw new Error("TikTok inbox MVP is video. Use Export pack for stills.");
  const file = await fileForUpload(post.mediaUrl);
  const size = fs.statSync(file).size;
  const init = await fetch("https://open.tiktokapis.com/v2/post/publish/inbox/video/init/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${live.accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify({
      source_info: {
        source: "FILE_UPLOAD",
        video_size: size,
        chunk_size: size,
        total_chunk_count: 1,
      },
    }),
  });
  const json = (await init.json()) as {
    data?: { publish_id?: string; upload_url?: string };
    error?: { message?: string };
  };
  if (!init.ok || !json.data?.upload_url) {
    throw new Error(json.error?.message || `TikTok inbox init HTTP ${init.status}`);
  }
  const put = await fetch(json.data.upload_url, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(size),
      "Content-Range": `bytes 0-${size - 1}/${size}`,
    },
    body: new Uint8Array(fs.readFileSync(file)),
  });
  if (!put.ok) throw new Error(`TikTok upload HTTP ${put.status}`);
  return json.data.publish_id || "inbox";
}

async function publishX(account: SocialAccount, post: Publication): Promise<string> {
  if (!account.accessToken) throw new Error("X not connected");
  const text = (post.caption || post.title || "").slice(0, 280);
  if (!text) throw new Error("X needs a caption");
  const res = await fetch("https://api.twitter.com/2/tweets", {
    method: "POST",
    headers: { Authorization: `Bearer ${account.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const json = (await res.json()) as { data?: { id?: string }; detail?: string; title?: string };
  if (!res.ok || !json.data?.id) throw new Error(json.detail || json.title || `X tweet HTTP ${res.status}`);
  return json.data.id;
}

export type PinterestBoard = { id: string; name: string; privacy?: string };

function pinterestFailure(status: number, message: string) {
  if (status === 401 || /authentication failed/i.test(message)) {
    return "Reconnect Pinterest on Accounts. Sandbox needs its own token. This login is still a production token.";
  }
  if (/boards:write/i.test(message)) {
    return "Reconnect Pinterest on Accounts and allow Boards write. This login cannot create a pin until then.";
  }
  if (/trial access/i.test(message)) {
    return "This Pinterest app is still Trial. Sandbox is on, but this call reached production.";
  }
  return message;
}

export async function listPinterestBoards(account: SocialAccount): Promise<PinterestBoard[]> {
  if (!account.accessToken) throw new Error("Pinterest not connected");
  const out: PinterestBoard[] = [];
  let bookmark = "";
  for (let page = 0; page < 6; page++) {
    const url = new URL(`${PINTEREST_API}/v5/boards`);
    url.searchParams.set("page_size", "250");
    if (bookmark) url.searchParams.set("bookmark", bookmark);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${account.accessToken}` } });
    const json = (await res.json()) as {
      items?: { id?: string; name?: string; privacy?: string }[];
      bookmark?: string;
      message?: string;
    };
    if (!res.ok) throw new Error(pinterestFailure(res.status, json.message || `Pinterest boards HTTP ${res.status}`));
    for (const board of json.items || []) {
      if (board.id && board.name) out.push({ id: board.id, name: board.name, privacy: board.privacy });
    }
    if (!json.bookmark || json.bookmark === bookmark) break;
    bookmark = json.bookmark;
  }
  if (!out.length) {
    const created = await createPinterestBoard(account, "CreatorOS");
    out.push(created);
  }
  if (out.length && account.lastError?.includes("at least one board")) {
    upsertSocialAccount({ ...account, lastError: undefined, connectionState: "connected" });
  }
  return out;
}

async function createPinterestBoard(account: SocialAccount, name: string): Promise<PinterestBoard> {
  const res = await fetch(`${PINTEREST_API}/v5/boards`, {
    method: "POST",
    headers: { Authorization: `Bearer ${account.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, privacy: "PUBLIC" }),
  });
  const json = (await res.json()) as { id?: string; name?: string; privacy?: string; message?: string };
  if (!res.ok || !json.id || !json.name) {
    throw new Error(pinterestFailure(res.status, json.message || `Pinterest board HTTP ${res.status}`));
  }
  return { id: json.id, name: json.name, privacy: json.privacy };
}

/** The board saved on the post, or the only board on the login. */
export async function resolvePinterestBoard(account: SocialAccount, picked?: string): Promise<PinterestBoard> {
  const boards = await listPinterestBoards(account);
  if (picked) {
    const hit = boards.find((board) => board.id === picked);
    if (!hit) throw new Error("That board is not in Sandbox. Pick the Sandbox board. The live board stays separate.");
    return hit;
  }
  if (boards.length === 1) return boards[0];
  if (!boards.length) throw new Error("Pinterest needs at least one board on the tester account");
  throw new Error("Pick a Pinterest board");
}

async function publishPinterest(account: SocialAccount, post: Publication): Promise<string> {
  if (!account.accessToken) throw new Error("Pinterest not connected");
  const file = await fileForUpload(post.mediaUrl);
  const boardId = (await resolvePinterestBoard(account, post.boardId)).id;
  const data = fs.readFileSync(file).toString("base64");
  const ext = extOf(file);
  const contentType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
  const res = await fetch(`${PINTEREST_API}/v5/pins`, {
    method: "POST",
    headers: { Authorization: `Bearer ${account.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      board_id: boardId,
      title: (post.title || post.caption || "CreatorOS").slice(0, 100),
      description: (post.caption || "").slice(0, 500),
      media_source: { source_type: "image_base64", content_type: contentType, data },
    }),
  });
  const json = (await res.json()) as { id?: string; message?: string };
  if (!res.ok || !json.id) {
    throw new Error(pinterestFailure(res.status, json.message || `Pinterest pin HTTP ${res.status}`));
  }
  return json.id;
}

export async function publishNow(post: Publication): Promise<Publication> {
  const account = getSocialAccount(post.accountId);
  if (!account) throw new Error("account missing");
  if (account.status !== "active") throw new Error("account paused");
  updatePublication(post.id, { status: "publishing", error: undefined });

  try {
    if (post.mode === "export" || !account.accessToken) {
      const pack = await writeExportPack(post);
      return updatePublication(post.id, {
        status: "exported",
        exportPath: pack,
        publishedAt: new Date().toISOString(),
      })!;
    }
    if (post.platform === "youtube") {
      if (post.mediaType !== "video") throw new Error("YouTube Direct is video. Use Export pack for stills.");
      const id = await publishYoutube(account, post);
      return updatePublication(post.id, {
        status: "published",
        platformPostId: id,
        publishedAt: new Date().toISOString(),
      })!;
    }
    if (post.platform === "tiktok") {
      const mode = post.mode === "direct" && account.auditStatus === "direct_ok" ? "direct" : "inbox";
      if (mode === "direct") throw new Error("TikTok Direct Post is flagged until Content Posting audit. Use Inbox or Export.");
      const id = await publishTiktokInbox(account, post);
      return updatePublication(post.id, {
        status: "published",
        platformPostId: id,
        publishedAt: new Date().toISOString(),
      })!;
    }
    if (post.platform === "x") {
      const id = await publishX(account, post);
      return updatePublication(post.id, {
        status: "published",
        platformPostId: id,
        publishedAt: new Date().toISOString(),
      })!;
    }
    if (post.platform === "pinterest") {
      if (post.mediaType === "video") throw new Error("Pinterest Direct is stills. Use Export for video.");
      const id = await publishPinterest(account, post);
      upsertSocialAccount({ ...account, lastError: undefined, connectionState: "connected" });
      return updatePublication(post.id, {
        status: "published",
        platformPostId: id,
        publishedAt: new Date().toISOString(),
      })!;
    }
    if (post.platform === "threads") {
      const pack = await writeExportPack(post);
      return updatePublication(post.id, {
        status: "exported",
        exportPath: pack,
        error: "Threads publish needs a public media URL (same as Instagram). Export pack written.",
        publishedAt: new Date().toISOString(),
      })!;
    }
    const pack = await writeExportPack(post);
    return updatePublication(post.id, {
      status: "exported",
      exportPath: pack,
      error: "Instagram Graph needs a public media URL. Export pack written — finish in the official app, or set publicBaseUrl later.",
      publishedAt: new Date().toISOString(),
    })!;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    upsertSocialAccount({ ...account, lastError: message, connectionState: account.accessToken ? "error" : account.connectionState });
    return updatePublication(post.id, {
      status: "failed",
      error: message,
      retryCount: post.retryCount + 1,
    })!;
  }
}
