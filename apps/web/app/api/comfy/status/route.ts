import { NextResponse } from "next/server";
import { comfyStatus } from "@/lib/comfy";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await comfyStatus());
}
