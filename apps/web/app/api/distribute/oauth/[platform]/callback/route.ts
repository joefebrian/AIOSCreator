import { NextResponse } from "next/server";
import { finishOauth } from "@/lib/social-oauth";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/social-accounts";

export const runtime = "nodejs";

const OK: SocialPlatform[] = [...SOCIAL_PLATFORMS];

export async function GET(req: Request, ctx: { params: Promise<{ platform: string }> }) {
  const { platform } = await ctx.params;
  const dest = new URL("/distribute/accounts", req.url);
  if (!OK.includes(platform as SocialPlatform)) {
    dest.searchParams.set("error", "unknown platform");
    return NextResponse.redirect(dest);
  }
  try {
    await finishOauth(platform as SocialPlatform, req);
    dest.searchParams.set("connected", platform);
  } catch (err) {
    dest.searchParams.set("error", err instanceof Error ? err.message : String(err));
  }
  return NextResponse.redirect(dest);
}
