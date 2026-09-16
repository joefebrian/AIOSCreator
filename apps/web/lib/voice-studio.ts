import fs from "node:fs";
import path from "node:path";
import { dataRoot, ensureDataDirs } from "./paths";

export type VoiceStudioCfg = {
  baseURL: string;
  apiKey: string;
  voice: string;
};

type VoiceRow = { id: string; name: string; engine?: string };

function cfgFile() {
  return path.join(ensureDataDirs(), "db", "voice-studio.json");
}

export function voiceStudioConfig(): VoiceStudioCfg {
  const fallback: VoiceStudioCfg = {
    baseURL: (process.env.VOICESTUDIO_URL || "http://127.0.0.1:3900/v1").replace(/\/$/, ""),
    apiKey: process.env.VOICESTUDIO_API_KEY || "local",
    voice: process.env.VOICESTUDIO_VOICE || "default",
  };
  try {
    if (!fs.existsSync(cfgFile())) return fallback;
    const raw = JSON.parse(fs.readFileSync(cfgFile(), "utf8")) as Partial<VoiceStudioCfg>;
    return {
      baseURL: (raw.baseURL || fallback.baseURL).replace(/\/$/, ""),
      apiKey: raw.apiKey || fallback.apiKey,
      voice: raw.voice || fallback.voice,
    };
  } catch {
    return fallback;
  }
}

export function saveVoiceStudioConfig(patch: Partial<VoiceStudioCfg>) {
  const cur = voiceStudioConfig();
  const next: VoiceStudioCfg = {
    baseURL: (patch.baseURL || cur.baseURL).replace(/\/$/, ""),
    apiKey: (patch.apiKey || cur.apiKey).trim() || "local",
    voice: (patch.voice || cur.voice).trim() || "default",
  };
  fs.writeFileSync(cfgFile(), JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function voiceFile(id: string, ext = "wav") {
  const dir = path.join(ensureDataDirs(), "media", "voices");
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, `${id}.${ext}`);
}

export function voiceMediaUrl(id: string, ext = "wav") {
  return `/api/media/voices/${id}.${ext}`;
}

function authHeaders(cfg: VoiceStudioCfg) {
  return {
    Authorization: `Bearer ${cfg.apiKey}`,
    "Content-Type": "application/json",
    "User-Agent": "CreatorOS/1.0",
  };
}

export async function listVoiceStudioVoices(): Promise<VoiceRow[]> {
  const cfg = voiceStudioConfig();
  try {
    const r = await fetch(`${cfg.baseURL}/audio/voices`, {
      headers: authHeaders(cfg),
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) throw new Error(String(r.status));
    const j = (await r.json()) as { data?: VoiceRow[]; voices?: VoiceRow[] };
    const rows = j.data || j.voices || [];
    if (rows.length) return rows.map((v) => ({ id: v.id, name: v.name || v.id, engine: v.engine }));
  } catch {
    /* server down */
  }
  return [{ id: cfg.voice || "default", name: "Default" }];
}

export async function voiceStudioSpeech(text: string, voice?: string): Promise<Buffer> {
  const cfg = voiceStudioConfig();
  const input = text.trim();
  if (!input) throw new Error("voiceover text is empty");
  const r = await fetch(`${cfg.baseURL}/audio/speech`, {
    method: "POST",
    headers: authHeaders(cfg),
    body: JSON.stringify({
      model: "tts-1",
      voice: voice || cfg.voice || "default",
      input,
      response_format: "wav",
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!r.ok) {
    const err = await r.text().catch(() => "");
    throw new Error(`VoiceStudio HTTP ${r.status}. ${err.slice(0, 240) || "Is the app running on :3900?"}`);
  }
  return Buffer.from(await r.arrayBuffer());
}

export async function probeVoiceStudio() {
  const cfg = voiceStudioConfig();
  try {
    const r = await fetch(`${cfg.baseURL}/audio/voices`, {
      headers: authHeaders(cfg),
      signal: AbortSignal.timeout(3000),
    });
    return { ok: r.ok, baseURL: cfg.baseURL, status: r.status };
  } catch (err) {
    return { ok: false, baseURL: cfg.baseURL, error: err instanceof Error ? err.message : String(err) };
  }
}
