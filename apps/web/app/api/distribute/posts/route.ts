import { NextResponse } from "next/server";
import { listCharacters } from "@/lib/characters";
import { createPublication, listPublications } from "@/lib/publications";
import { getSocialAccount, listSocialAccounts, publicAccount } from "@/lib/social-accounts";
import type { PublishMode, SocialPlatform } from "@/lib/social-accounts";
import type { Approval, Privacy } from "@/lib/publications";
import { resolvePinterestBoard } from "@/lib/social-publish";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    posts: listPublications(),
    accounts: listSocialAccounts().map(publicAccount),
    characters: listCharacters().map((c) => {
      const media: { url: string; label: string }[] = [];
      const push = (url: string | null | undefined, label: string) => {
        if (!url || media.some((item) => item.url === url)) return;
        media.push({ url, label });
      };
      push(c.identityUrl, "Headshot");
      for (const slot of c.slots || []) push(slot.url, slot.label || slot.key);
      for (const edit of (c.edits || []).slice(0, 8)) {
        const when = edit.createdAt ? new Date(edit.createdAt).toLocaleString() : "";
        push(edit.url, when ? `Edit · ${when}` : "Edit");
      }
      return { id: c.id, name: c.name, media };
    }),
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
    boardId?: string;
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
    let boardId: string | undefined;
    let boardName: string | undefined;
    if (account.platform === "pinterest" && mode === "direct" && mediaType === "image") {
      try {
        const board = await resolvePinterestBoard(account, body.boardId);
        boardId = board.id;
        boardName = board.name;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Pick a Pinterest board";
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }
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
        boardId,
        boardName,
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
