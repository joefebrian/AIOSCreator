import { NextResponse } from "next/server";
import { clearResearchCookies, cookiesStatus, saveResearchCookies } from "@/lib/research-cookies";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(cookiesStatus());
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { header?: string; netscape?: string };
  const status = saveResearchCookies({
    header: typeof body.header === "string" ? body.header : undefined,
    netscape: typeof body.netscape === "string" ? body.netscape : undefined,
  });
  return NextResponse.json(status);
}

export async function DELETE() {
  return NextResponse.json(clearResearchCookies());
}
