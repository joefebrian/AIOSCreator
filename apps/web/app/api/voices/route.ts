import { NextResponse } from "next/server";
import { listVoiceStudioVoices, probeVoiceStudio } from "@/lib/voice-studio";

export const runtime = "nodejs";

export async function GET() {
  const probe = await probeVoiceStudio();
  const voices = await listVoiceStudioVoices();
  return NextResponse.json({ probe, voices });
}
