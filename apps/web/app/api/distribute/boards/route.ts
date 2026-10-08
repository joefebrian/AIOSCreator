import { NextResponse } from "next/server";
import { listPinterestBoards } from "@/lib/social-publish";
import { getSocialAccount } from "@/lib/social-accounts";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const accountId = new URL(req.url).searchParams.get("accountId") || "";
  const account = getSocialAccount(accountId);
  if (!account || account.platform !== "pinterest") {
    return NextResponse.json({ error: "Pinterest login missing" }, { status: 400 });
  }
  if (!account.accessToken) return NextResponse.json({ boards: [] });
  try {
    const boards = await listPinterestBoards(account);
    return NextResponse.json({ boards });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not load boards";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
