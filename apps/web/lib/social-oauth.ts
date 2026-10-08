import { createHash, randomBytes } from "node:crypto";
import {
  putOauthState,
  socialApps,
  takeOauthState,
  upsertSocialAccount,
  type SocialPlatform,
} from "./social-accounts";

export function originFrom(req: Request) {
  const apps = socialApps();
  if (apps.publicBaseUrl) return apps.publicBaseUrl.replace(/\/$/, "");
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

function httpOrigin(raw: string | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname || u.hostname === "0.0.0.0") return null;
    return u.origin;
  } catch {
    return null;
  }
}

/** Where Connect sends the browser after OAuth. Never 0.0.0.0 (Next's bind address). */
export function distributeAccountsUrl(req: Request, platform?: SocialPlatform) {
  const apps = socialApps();
  const preferred =
    httpOrigin(apps.publicBaseUrl) || (platform ? httpOrigin(apps[platform]?.redirectUri) : null);
  if (preferred) return new URL("/distribute/accounts", `${preferred}/`);
  try {
    const u = new URL(req.url);
    if (u.hostname === "0.0.0.0") {
      u.hostname = "127.0.0.1";
      u.protocol = "http:";
    }
    return new URL("/distribute/accounts", `${u.origin}/`);
  } catch {
    return new URL("http://127.0.0.1:3000/distribute/accounts");
  }
}

/** Pinterest portal "Generate token" values start with pina_/pinr_/pinc_. Those are not the App secret key. */
/** Trial app. Live pins need Standard access, then point this back at https://api.pinterest.com. */
export const PINTEREST_API = "https://api-sandbox.pinterest.com";

/** Create Pin requires boards:write even though the call does not create a board. */
const PINTEREST_SCOPE = "boards:read,boards:write,pins:read,pins:write,user_accounts:read";

export function pinterestSecretProblem(secret: string | undefined): string | null {
  const s = (secret || "").trim();
  if (!s) return "Save the Pinterest App secret key first. The App ID alone is not enough.";
  if (/^pin[acr]_/i.test(s)) {
    return "That value is a Pinterest access token (it starts with pina_), not the App secret key. On developers.pinterest.com open the app, Configure, and copy App secret key. Do not paste Generate token.";
  }
  return null;
}

export function startOauthUrl(platform: SocialPlatform, req: Request, accountId?: string) {
  const apps = socialApps();
  const origin = originFrom(req);
  const state = randomBytes(16).toString("hex");
  putOauthState(state, { platform, accountId });
  if (platform === "youtube") {
    const app = apps.youtube;
    if (!app?.clientId) throw new Error("Save YouTube client id + secret first");
    const redirect = app.redirectUri || `${origin}/api/distribute/oauth/youtube/callback`;
    const q = new URLSearchParams({
      client_id: app.clientId,
      redirect_uri: redirect,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state,
      scope: [
        "https://www.googleapis.com/auth/youtube.upload",
        "https://www.googleapis.com/auth/youtube.readonly",
        "https://www.googleapis.com/auth/youtube",
      ].join(" "),
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`;
  }
  if (platform === "tiktok") {
    const app = apps.tiktok;
    if (!app?.clientId) throw new Error("Save TikTok client key + secret first");
    const redirect = app.redirectUri || `${origin}/api/distribute/oauth/tiktok/callback`;
    const q = new URLSearchParams({
      client_key: app.clientId,
      redirect_uri: redirect,
      response_type: "code",
      state,
      scope: "user.info.basic,video.upload,video.publish,video.list",
    });
    return `https://www.tiktok.com/v2/auth/authorize/?${q.toString()}`;
  }
  if (platform === "threads") {
    const app = apps.threads;
    if (!app?.clientId) throw new Error("Save Threads app id + secret first");
    const redirect = app.redirectUri || `${origin}/api/distribute/oauth/threads/callback`;
    const q = new URLSearchParams({
      client_id: app.clientId,
      redirect_uri: redirect,
      response_type: "code",
      state,
      scope: "threads_basic,threads_content_publish",
    });
    return `https://threads.net/oauth/authorize?${q.toString()}`;
  }
  if (platform === "x") {
    const app = apps.x;
    if (!app?.clientId) throw new Error("Save X client id + secret first");
    const redirect = app.redirectUri || `${origin}/api/distribute/oauth/x/callback`;
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    putOauthState(state, { platform, accountId, codeVerifier: verifier });
    const q = new URLSearchParams({
      response_type: "code",
      client_id: app.clientId,
      redirect_uri: redirect,
      scope: "tweet.read tweet.write users.read offline.access",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
    });
    return `https://twitter.com/i/oauth2/authorize?${q.toString()}`;
  }
  if (platform === "pinterest") {
    const app = apps.pinterest;
    if (!app?.clientId?.trim()) throw new Error("Save Pinterest app id + secret first");
    const problem = pinterestSecretProblem(app.clientSecret);
    if (problem) throw new Error(problem);
    const redirect = (app.redirectUri || `${origin}/api/distribute/oauth/pinterest/callback`).trim();
    const q = new URLSearchParams({
      client_id: app.clientId.trim(),
      redirect_uri: redirect,
      response_type: "code",
      state,
      scope: PINTEREST_SCOPE,
    });
    return `https://www.pinterest.com/oauth/?${q.toString()}`;
  }
  const app = apps.instagram;
  if (!app?.clientId) throw new Error("Save Instagram/Facebook app id + secret first");
  const redirect = app.redirectUri || `${origin}/api/distribute/oauth/instagram/callback`;
  const q = new URLSearchParams({
    client_id: app.clientId,
    redirect_uri: redirect,
    response_type: "code",
    state,
    scope: [
      "instagram_business_basic",
      "instagram_business_content_publish",
      "pages_show_list",
      "pages_read_engagement",
    ].join(","),
  });
  return `https://www.facebook.com/v21.0/dialog/oauth?${q.toString()}`;
}

export async function finishOauth(platform: SocialPlatform, req: Request) {
  const url = new URL(req.url);
  const err = url.searchParams.get("error");
  if (err) throw new Error(err);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) throw new Error("missing code/state");
  const st = takeOauthState(state);
  if (!st || st.platform !== platform) throw new Error("oauth state expired — try Connect again");
  const apps = socialApps();
  const origin = originFrom(req);

  if (platform === "youtube") {
    const app = apps.youtube!;
    const redirect = app.redirectUri || `${origin}/api/distribute/oauth/youtube/callback`;
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: app.clientId,
        client_secret: app.clientSecret,
        redirect_uri: redirect,
        grant_type: "authorization_code",
      }),
    });
    const json = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      error?: string;
    };
    if (!res.ok || !json.access_token) throw new Error(json.error || `YouTube token HTTP ${res.status}`);
    const me = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
      headers: { Authorization: `Bearer ${json.access_token}` },
    });
    const ch = (await me.json()) as { items?: { id: string; snippet?: { title?: string; customUrl?: string } }[] };
    const item = ch.items?.[0];
    upsertSocialAccount({
      id: st.accountId,
      platform: "youtube",
      accountName: item?.snippet?.title || "YouTube",
      handle: item?.snippet?.customUrl,
      platformUserId: item?.id,
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      tokenExpiry: new Date(Date.now() + (json.expires_in || 3600) * 1000).toISOString(),
      scopes: (json.scope || "").split(" ").filter(Boolean),
      connectionState: "connected",
      auditStatus: "unaudited",
      lastError: undefined,
    });
    return;
  }

  if (platform === "tiktok") {
    const app = apps.tiktok!;
    const redirect = app.redirectUri || `${origin}/api/distribute/oauth/tiktok/callback`;
    const res = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: app.clientId,
        client_secret: app.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirect,
      }),
    });
    const json = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      open_id?: string;
      scope?: string;
      error?: string;
      error_description?: string;
    };
    if (!res.ok || !json.access_token) throw new Error(json.error_description || json.error || `TikTok token HTTP ${res.status}`);
    upsertSocialAccount({
      id: st.accountId,
      platform: "tiktok",
      accountName: "TikTok",
      platformUserId: json.open_id,
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      tokenExpiry: new Date(Date.now() + (json.expires_in || 86400) * 1000).toISOString(),
      scopes: (json.scope || "").split(",").filter(Boolean),
      connectionState: "connected",
      auditStatus: "inbox_only",
      lastError: undefined,
    });
    return;
  }

  if (platform === "threads") {
    const app = apps.threads!;
    const redirect = app.redirectUri || `${origin}/api/distribute/oauth/threads/callback`;
    const res = await fetch("https://graph.threads.net/oauth/access_token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: app.clientId,
        client_secret: app.clientSecret,
        grant_type: "authorization_code",
        redirect_uri: redirect,
        code,
      }),
    });
    const json = (await res.json()) as { access_token?: string; user_id?: string; error?: { message?: string } };
    if (!res.ok || !json.access_token) throw new Error(json.error?.message || `Threads token HTTP ${res.status}`);
    let token = json.access_token;
    const longLived = await fetch(
      `https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=${encodeURIComponent(app.clientSecret)}&access_token=${encodeURIComponent(token)}`,
    );
    const longJson = (await longLived.json()) as { access_token?: string; expires_in?: number };
    if (longLived.ok && longJson.access_token) token = longJson.access_token;
    const me = await fetch("https://graph.threads.net/v1.0/me?fields=id,username", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const profile = (await me.json()) as { id?: string; username?: string };
    upsertSocialAccount({
      id: st.accountId,
      platform: "threads",
      accountName: profile.username ? `@${profile.username}` : "Threads",
      handle: profile.username,
      platformUserId: profile.id || json.user_id,
      accessToken: token,
      tokenExpiry: longJson.expires_in ? new Date(Date.now() + longJson.expires_in * 1000).toISOString() : undefined,
      connectionState: "connected",
      auditStatus: "unaudited",
      lastError: undefined,
    });
    return;
  }

  if (platform === "x") {
    const app = apps.x!;
    const redirect = app.redirectUri || `${origin}/api/distribute/oauth/x/callback`;
    if (!st.codeVerifier) throw new Error("X PKCE verifier missing — Connect again");
    const basic = Buffer.from(`${app.clientId}:${app.clientSecret}`).toString("base64");
    const res = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basic}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        redirect_uri: redirect,
        code_verifier: st.codeVerifier,
        client_id: app.clientId,
      }),
    });
    const json = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      error?: string;
      error_description?: string;
    };
    if (!res.ok || !json.access_token) throw new Error(json.error_description || json.error || `X token HTTP ${res.status}`);
    const me = await fetch("https://api.twitter.com/2/users/me", {
      headers: { Authorization: `Bearer ${json.access_token}` },
    });
    const profile = (await me.json()) as { data?: { id?: string; name?: string; username?: string } };
    upsertSocialAccount({
      id: st.accountId,
      platform: "x",
      accountName: profile.data?.name || profile.data?.username || "X",
      handle: profile.data?.username,
      platformUserId: profile.data?.id,
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      tokenExpiry: json.expires_in ? new Date(Date.now() + json.expires_in * 1000).toISOString() : undefined,
      scopes: (json.scope || "").split(" ").filter(Boolean),
      connectionState: "connected",
      auditStatus: "unaudited",
      lastError: undefined,
    });
    return;
  }

  if (platform === "pinterest") {
    const app = apps.pinterest!;
    const problem = pinterestSecretProblem(app.clientSecret);
    if (problem) throw new Error(problem);
    const clientId = app.clientId.trim();
    const clientSecret = app.clientSecret.trim();
    const redirect = (app.redirectUri || `${origin}/api/distribute/oauth/pinterest/callback`).trim();
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const res = await fetch(`${PINTEREST_API}/v5/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basic}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirect,
        continuous_refresh: "true",
      }),
    });
    const json = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      error?: string;
      message?: string;
    };
    if (!res.ok || !json.access_token) {
      const detail = json.message || json.error || `Pinterest token HTTP ${res.status}`;
      if (res.status === 401) {
        throw new Error(
          `${detail} Pinterest rejected the App ID and secret. Paste the App secret key from Configure, not a generated token, and keep this redirect URI exact: ${redirect}`,
        );
      }
      throw new Error(detail);
    }
    const me = await fetch(`${PINTEREST_API}/v5/user_account`, {
      headers: { Authorization: `Bearer ${json.access_token}` },
    });
    const profile = (await me.json()) as { username?: string; id?: string };
    upsertSocialAccount({
      id: st.accountId,
      platform: "pinterest",
      accountName: profile.username ? `@${profile.username}` : "Pinterest",
      handle: profile.username,
      platformUserId: profile.id,
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      tokenExpiry: json.expires_in ? new Date(Date.now() + json.expires_in * 1000).toISOString() : undefined,
      scopes: (json.scope || PINTEREST_SCOPE).split(/[\s,]+/).filter(Boolean),
      connectionState: "connected",
      auditStatus: "unaudited",
      lastError: undefined,
    });
    return;
  }

  const app = apps.instagram!;
  const redirect = app.redirectUri || `${origin}/api/distribute/oauth/instagram/callback`;
  const res = await fetch("https://graph.facebook.com/v21.0/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: app.clientId,
      client_secret: app.clientSecret,
      redirect_uri: redirect,
      code,
    }),
  });
  const json = (await res.json()) as { access_token?: string; expires_in?: number; error?: { message?: string } };
  if (!res.ok || !json.access_token) throw new Error(json.error?.message || `Instagram token HTTP ${res.status}`);
  upsertSocialAccount({
    id: st.accountId,
    platform: "instagram",
    accountName: "Instagram",
    accessToken: json.access_token,
    tokenExpiry: json.expires_in ? new Date(Date.now() + json.expires_in * 1000).toISOString() : undefined,
    connectionState: "connected",
    auditStatus: "unaudited",
    lastError: undefined,
  });
}
