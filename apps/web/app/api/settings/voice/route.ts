import { NextResponse } from "next/server";
import { listVoiceStudioVoices, probeVoiceStudio, saveVoiceStudioConfig, voiceStudioConfig } from "@/lib/voice-studio";

export const runtime = "nodejs";

export async function GET() {
  const cfg = voiceStudioConfig();
  const probe = await probeVoiceStudio();
  const voices = await listVoiceStudioVoices();
  return NextResponse.json({ ...cfg, probe, voices });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    baseURL?: string;
    apiKey?: string;
    voice?: string;
  };
  const cfg = saveVoiceStudioConfig(body);
  const probe = await probeVoiceStudio();
  const voices = await listVoiceStudioVoices();
  return NextResponse.json({ ok: true, ...cfg, probe, voices });
}
