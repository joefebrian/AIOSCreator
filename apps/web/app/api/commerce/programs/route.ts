import { NextResponse } from "next/server";
import { listPrograms, setProgramTag, setShopeeMarkets, type ProgramId, type ShopeeMarket } from "@/lib/affiliate-programs";
import { involveStatus, saveInvolve } from "@/lib/involve";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ programs: listPrograms(), involve: involveStatus() });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    tag?: string;
    key?: string;
    secret?: string;
    offerMy?: string;
    offerTh?: string;
    indonesia?: string;
    my?: string;
    th?: string;
    sg?: string;
  };
  const id = (body.id || "").trim();
  if (id === "involve") {
    const involve = saveInvolve(body);
    return NextResponse.json({ ok: true, programs: listPrograms(), involve });
  }
  if (id === "shopee") {
    try {
      const markets: Partial<Record<ShopeeMarket, string>> = { id: body.indonesia, my: body.my, th: body.th, sg: body.sg };
      setShopeeMarkets(markets);
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "save failed" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, programs: listPrograms(), involve: involveStatus() });
  }
  if (!["amazon", "shopee", "aliexpress", "tiktok-shop"].includes(id)) {
    return NextResponse.json({ error: "id must be amazon, shopee, aliexpress, tiktok-shop, or involve" }, { status: 400 });
  }
  setProgramTag(id as ProgramId, body.tag || "");
  return NextResponse.json({ ok: true, programs: listPrograms(), involve: involveStatus() });
}
