import { NextResponse } from "next/server";
import { summarizeCloudUsage } from "@/lib/cloud-usage";
import { buildStackLive } from "@/lib/stack";

export const runtime = "nodejs";

export async function GET() {
  const stack = await buildStackLive();
  return NextResponse.json({ ...stack, usage: summarizeCloudUsage(7) });
}
