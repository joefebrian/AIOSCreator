import { NextResponse } from "next/server";
import { intelligenceBoard } from "@/lib/intelligence-board";
import {
  addObservation,
  deleteHook,
  deleteObservation,
  excludeOpportunity,
  pinOpportunity,
  saveHook,
} from "@/lib/intelligence";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const region = new URL(req.url).searchParams.get("region") || "ID";
  try {
    const board = await intelligenceBoard(region);
    return NextResponse.json(board);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    id?: string;
    on?: boolean;
    url?: string;
    note?: string;
    market?: string;
    text?: string;
    source?: string;
    platform?: string;
  };
  try {
    switch (body.action) {
      case "pin":
        return NextResponse.json(pinOpportunity(String(body.id || ""), body.on !== false));
      case "exclude":
        return NextResponse.json(excludeOpportunity(String(body.id || ""), body.on !== false));
      case "observe":
        if (!body.url?.trim()) return NextResponse.json({ error: "url required" }, { status: 400 });
        return NextResponse.json(addObservation({ url: body.url, note: body.note, market: body.market, platform: body.platform }));
      case "delete-observation":
        return NextResponse.json(deleteObservation(String(body.id || "")));
      case "save-hook":
        return NextResponse.json(saveHook({ text: String(body.text || ""), source: body.source, platform: body.platform }));
      case "delete-hook":
        return NextResponse.json(deleteHook(String(body.id || "")));
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
