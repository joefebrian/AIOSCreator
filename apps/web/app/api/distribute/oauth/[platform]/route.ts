import { NextResponse } from "next/server";
import { startOauthUrl } from "@/lib/social-oauth";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/social-accounts";

export const runtime = "nodejs";

const OK: SocialPlatform[] = [...SOCIAL_PLATFORMS];

export async function GET(req: Request, ctx: { params: Promise<{ platform: string }> }) {
  const { platform } = await ctx.params;
  if (!OK.includes(platform as SocialPlatform)) {
    return NextResponse.json({ error: "unknown platform" }, { status: 404 });
  }
  try {
    const accountId = new URL(req.url).searchParams.get("accountId") || undefined;
    const loc = startOauthUrl(platform as SocialPlatform, req, accountId);
    return NextResponse.redirect(loc);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.redirect(new URL(`/distribute/accounts?error=${encodeURIComponent(message)}`, req.url));
  }
}
