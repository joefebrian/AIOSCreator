import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fitVoiceOntoClip, silenceOntoClip } from "./voice-mux";
import { probeVoiceStudio, voiceStudioSpeech } from "./voice-studio";

const VOICES: Record<string, string> = {
  "ms-my": "ms-MY-YasminNeural",
  my: "ms-MY-YasminNeural",
  "id-id": "id-ID-GadisNeural",
  id: "id-ID-GadisNeural",
  "th-th": "th-TH-PremwadeeNeural",
  th: "th-TH-PremwadeeNeural",
  "ja-jp": "ja-JP-NanamiNeural",
  jp: "ja-JP-NanamiNeural",
  "en-sg": "en-SG-LunaNeural",
  sg: "en-SG-LunaNeural",
  "en-my": "en-US-AriaNeural",
  "en-us": "en-US-AriaNeural",
  us: "en-US-AriaNeural",
};

export function narrationVoice(locale?: string, market?: string) {
  const loc = (locale || "").trim().toLowerCase();
  if (VOICES[loc]) return VOICES[loc];
  if (loc.startsWith("en-")) return VOICES["en-us"];
  const country = (market || "").trim().toLowerCase();
  return VOICES[country] || "en-US-AriaNeural";
}

function runEdge(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn("python", ["-m", "edge_tts", ...args], { windowsHide: true });
    let err = "";
    child.stderr.on("data", (d) => {
      err += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Market voice failed (${code}). ${err.slice(-300)}`));
    });
  });
}

async function edgeSpeak(text: string, voice: string, dest: string) {
  const note = `${dest}.txt`;
  fs.writeFileSync(note, text.trim(), "utf8");
  try {
    await runEdge(["--voice", voice, "--file", note, "--write-media", dest]);
  } finally {
    fs.rmSync(note, { force: true });
  }
  if (!fs.existsSync(dest) || fs.statSync(dest).size < 500) throw new Error("Market voice file is empty.");
}

/** VoiceStudio when it is up, otherwise the market neural voice. */
export async function speakNarration(text: string, voice: string) {
  const input = text.trim();
  if (!input) throw new Error("voiceover text is empty");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-vo-"));
  const probe = await probeVoiceStudio();
  if (probe.ok) {
    try {
      const wav = path.join(dir, "line.wav");
      fs.writeFileSync(wav, await voiceStudioSpeech(input));
      if (fs.statSync(wav).size > 500) return { file: wav, dir, engine: "voicestudio" as const, voice: "studio" };
    } catch {
      /* studio answered the probe and then failed the line */
    }
  }
  const mp3 = path.join(dir, "line.mp3");
  try {
    await edgeSpeak(input, voice, mp3);
  } catch (err) {
    fs.rmSync(dir, { recursive: true, force: true });
    throw err;
  }
  return { file: mp3, dir, engine: "edge-tts" as const, voice };
}

export async function attachSceneNarration(opts: {
  clipPath: string;
  dest: string;
  text: string;
  locale?: string;
  market?: string;
}) {
  const line = opts.text.replace(/\s+/g, " ").trim();
  if (!line) {
    await silenceOntoClip(opts.clipPath, opts.dest);
    return { engine: "silence" as const, voice: "", tempo: 1, voiceSec: 0 };
  }
  const spoken = await speakNarration(line, narrationVoice(opts.locale, opts.market));
  try {
    const fit = await fitVoiceOntoClip(opts.clipPath, spoken.file, opts.dest);
    return { engine: spoken.engine, voice: spoken.voice, tempo: fit.tempo, voiceSec: fit.voiceSec };
  } finally {
    fs.rmSync(spoken.dir, { recursive: true, force: true });
  }
}
