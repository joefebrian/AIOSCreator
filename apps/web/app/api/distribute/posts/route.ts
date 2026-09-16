import { NextResponse } from "next/server";
import { listCharacters } from "@/lib/characters";
import { createPublication, listPublications } from "@/lib/publications";
import { getSocialAccount, listSocialAccounts, publicAccount } from "@/lib/social-accounts";
import type { PublishMode, SocialPlatform } from "@/lib/social-accounts";
import type { Approval, Privacy } from "@/lib/publications";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    posts: listPublications(),
    accounts: listSocialAccounts().map(publicAccount),
    characters: listCharacters().map((c) => ({
      id: c.id,
      name: c.name,
      identityUrl: c.identityUrl,
      slots: c.slots?.map((s) => ({ url: s.url })),
      edits: c.edits?.map((e) => ({ url: e.url })),
    })),
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    accountId?: string;
    accountIds?: string[];
    characterId?: string;
    mediaUrl?: string;
    mediaType?: "image" | "video";
    caption?: string;
    title?: string;
    tags?: string;
    categoryId?: string;
    disclosure?: string;
    mode?: PublishMode;
    privacy?: Privacy;
    madeForKids?: boolean;
    containsSyntheticMedia?: boolean;
    approval?: Approval;
    scheduledAt?: string;
  };
  const ids = [...new Set([...(body.accountIds || []), body.accountId].filter(Boolean) as string[])];
  if (!ids.length) return NextResponse.json({ error: "pick an account" }, { status: 400 });
  const mediaUrl = (body.mediaUrl || "").trim();
  if (!mediaUrl) return NextResponse.json({ error: "mediaUrl required" }, { status: 400 });
  const mediaType = body.mediaType || (/\.mp4($|\?)/i.test(mediaUrl) ? "video" : "image");
  const scheduledAt = body.scheduledAt || undefined;
  const rows = [];
  for (const id of ids) {
    const account = getSocialAccount(id);
    if (!account) return NextResponse.json({ error: `account missing: ${id}` }, { status: 400 });
    const mode: PublishMode =
      body.mode ||
      (account.platform === "tiktok"
        ? "inbox"
        : account.platform === "threads" || account.platform === "instagram"
          ? "export"
          : account.accessToken
            ? "direct"
            : "export");
    rows.push(
      createPublication({
        accountId: account.id,
        platform: account.platform as SocialPlatform,
        characterId: body.characterId || account.defaultCharacterId,
        mediaUrl,
        mediaType,
        caption: (body.caption || "").trim(),
        title: body.title,
        tags: body.tags,
        categoryId: body.categoryId,
        disclosure: body.disclosure,
        mode,
        privacy: body.privacy || (account.platform === "youtube" ? "private" : "public"),
        madeForKids: Boolean(body.madeForKids),
        containsSyntheticMedia: body.containsSyntheticMedia !== false,
        approval: body.approval || "pending",
        scheduledAt,
        status: scheduledAt ? "scheduled" : "draft",
      }),
    );
  }
  return NextResponse.json({ ok: true, posts: rows, post: rows[0] }, { status: 201 });
}
