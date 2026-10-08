import { NextResponse } from "next/server";
import {
  deleteSocialAccount,
  listSocialAccounts,
  publicAccount,
  publicApps,
  saveSocialApps,
  socialApps,
  upsertSocialAccount,
  type AccountSubtype,
  SOCIAL_PLATFORMS,
  type SocialPlatform,
} from "@/lib/social-accounts";

export const runtime = "nodejs";

const PLATFORMS = SOCIAL_PLATFORMS;

export async function GET() {
  return NextResponse.json({
    apps: publicApps(),
    accounts: listSocialAccounts().map(publicAccount),
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    platform?: string;
    accountName?: string;
    defaultCharacterId?: string;
    accountSubtype?: AccountSubtype;
    id?: string;
    apps?: {
      publicBaseUrl?: string;
      youtube?: { clientId?: string; clientSecret?: string; redirectUri?: string };
      tiktok?: { clientId?: string; clientSecret?: string; redirectUri?: string };
      instagram?: { clientId?: string; clientSecret?: string; redirectUri?: string };
      threads?: { clientId?: string; clientSecret?: string; redirectUri?: string };
      x?: { clientId?: string; clientSecret?: string; redirectUri?: string };
      pinterest?: { clientId?: string; clientSecret?: string; redirectUri?: string };
    };
  };
  if (body.action === "apps") {
    const cur = socialApps();
    const pinSecret = body.apps?.pinterest?.clientSecret?.trim();
    if (pinSecret && /^pin[acr]_/i.test(pinSecret)) {
      return NextResponse.json(
        {
          error:
            "Pinterest client secret is an access token (pina_). Paste the App secret key from the app Configure page, not Generate token.",
        },
        { status: 400 },
      );
    }
    const text = (value: string | undefined, fallback = "") => (value ?? fallback).trim();
    const merge = (key: "youtube" | "tiktok" | "instagram" | "threads" | "x" | "pinterest") => {
      const incomingSecret = body.apps?.[key]?.clientSecret?.trim() || "";
      return {
        clientId: text(body.apps?.[key]?.clientId, cur[key]?.clientId ?? ""),
        clientSecret: incomingSecret || cur[key]?.clientSecret || "",
        redirectUri: text(body.apps?.[key]?.redirectUri, cur[key]?.redirectUri ?? ""),
      };
    };
    const apps = saveSocialApps({
      publicBaseUrl: text(body.apps?.publicBaseUrl, cur.publicBaseUrl ?? "") || undefined,
      youtube: merge("youtube"),
      tiktok: merge("tiktok"),
      instagram: merge("instagram"),
      threads: merge("threads"),
      x: merge("x"),
      pinterest: merge("pinterest"),
    });
    return NextResponse.json({ apps: publicApps(apps), accounts: listSocialAccounts().map(publicAccount) });
  }
  if (body.action === "delete" && body.id) {
    if (!deleteSocialAccount(body.id)) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true, accounts: listSocialAccounts().map(publicAccount) });
  }
  const platform = PLATFORMS.includes(body.platform as SocialPlatform) ? (body.platform as SocialPlatform) : null;
  if (!platform) return NextResponse.json({ error: "platform required" }, { status: 400 });
  const row = upsertSocialAccount({
    id: body.id,
    platform,
    accountName: body.accountName,
    defaultCharacterId: body.defaultCharacterId,
    accountSubtype: body.accountSubtype,
  });
  return NextResponse.json({ account: publicAccount(row), accounts: listSocialAccounts().map(publicAccount) });
}
