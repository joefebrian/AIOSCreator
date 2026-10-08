import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { mediaHasAudio, silenceOntoClip } from "./voice-mux";

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";

function run(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(FFMPEG, args, { windowsHide: true });
    let err = "";
    child.stderr.on("data", (d: Buffer) => {
      err += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg failed (${code}). ${err.slice(-400)}`));
    });
  });
}

function fontFile() {
  const candidates = [
    "C:\\Windows\\Fonts\\arial.ttf",
    "C:\\Windows\\Fonts\\segoeui.ttf",
  ];
  return candidates.find((file) => fs.existsSync(file)) || "";
}

function breakLines(text: string, width: number) {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (next.length > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Fit the caption into maxLines by widening the measure, then stop. */
function wrap(text: string, width: number, maxLines: number) {
  let measure = width;
  let lines = breakLines(text, measure);
  while (lines.length > maxLines && measure < 52) {
    measure += 4;
    lines = breakLines(text, measure);
  }
  return lines.slice(0, maxLines).join("\n");
}

/**
 * Short overlay in the top margin, spoken line in the bottom margin.
 * Model audio is dropped here; the spoken line is muxed afterwards.
 */
/** One slow push on the photo for the whole film. No video model is called. */
export async function pushPhoto(src: string, durationSec: number, dest: string) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const seconds = Math.max(1, Number(durationSec) || 1);
  const frames = Math.max(30, Math.round(seconds * 30));
  await run([
    "-y", "-loop", "1", "-framerate", "30", "-i", src,
    "-frames:v", String(frames),
    "-vf", `scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=white,zoompan=z='min(1+0.12*on/${frames},1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=720x1280:fps=30,format=yuv420p`,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an",
    dest,
  ]);
  if (!fs.existsSync(dest) || fs.statSync(dest).size < 1000) throw new Error("The photo move did not render.");
}

/** Hold one photo for the scene. No camera model is called. */
export async function holdStill(src: string, durationSec: number, dest: string) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const seconds = Math.max(1, Number(durationSec) || 1);
  await run([
    "-y", "-loop", "1", "-framerate", "30", "-i", src,
    "-t", seconds.toFixed(3),
    "-vf", "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=white,fps=30,format=yuv420p",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-an",
    dest,
  ]);
  if (!fs.existsSync(dest) || fs.statSync(dest).size < 1000) throw new Error("The photo preview frame did not render.");
}

export async function burnStoryboardCard(src: string, dest: string, card: { overlay: string; spoken: string }) {
  const font = fontFile();
  if (!font) throw new Error("No font for storyboard text.");
  const dir = path.dirname(dest);
  fs.mkdirSync(dir, { recursive: true });
  const overlayFile = path.join(dir, `${path.basename(dest, ".mp4")}-overlay.txt`);
  const spokenFile = path.join(dir, `${path.basename(dest, ".mp4")}-spoken.txt`);
  fs.writeFileSync(overlayFile, wrap(card.overlay, 28, 2), "utf8");
  fs.writeFileSync(spokenFile, wrap(card.spoken, 36, 3), "utf8");
  const fontArg = font.replace(/\\/g, "/").replace(":", "\\:");
  const overlayArg = overlayFile.replace(/\\/g, "/").replace(":", "\\:");
  const spokenArg = spokenFile.replace(/\\/g, "/").replace(":", "\\:");
  const band = "fontcolor=white:borderw=2:bordercolor=black:box=1:boxcolor=black@0.55:boxborderw=10";
  const draw = [
    `drawtext=fontfile='${fontArg}':textfile='${overlayArg}':expansion=none:fontsize=28:${band}:line_spacing=6:x=(w-text_w)/2:y=40`,
    `drawtext=fontfile='${fontArg}':textfile='${spokenArg}':expansion=none:fontsize=22:${band}:line_spacing=4:x=(w-text_w)/2:y=h-text_h-36`,
  ].join(",");
  try {
    await run(["-y", "-i", src, "-vf", draw, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "veryfast", "-an", dest]);
  } finally {
    fs.rmSync(overlayFile, { force: true });
    fs.rmSync(spokenFile, { force: true });
  }
  if (!fs.existsSync(dest) || fs.statSync(dest).size < 1000) throw new Error("Storyboard text did not land on the clip.");
}

/** Captions change with the spoken lines on one continuous picture. */
export async function burnCaptionTimeline(src: string, dest: string, cues: { start: number; end: number; overlay: string; spoken: string }[]) {
  const font = fontFile();
  if (!font) throw new Error("No font for storyboard text.");
  const dir = path.dirname(dest);
  fs.mkdirSync(dir, { recursive: true });
  const fontArg = font.replace(/\\/g, "/").replace(":", "\\:");
  const band = "fontcolor=white:borderw=2:bordercolor=black:box=1:boxcolor=black@0.55:boxborderw=10";
  const files: string[] = [];
  const draws: string[] = [];
  cues.forEach((cue, index) => {
    const overlayFile = path.join(dir, `${path.basename(dest, ".mp4")}-${index}-overlay.txt`);
    const spokenFile = path.join(dir, `${path.basename(dest, ".mp4")}-${index}-spoken.txt`);
    fs.writeFileSync(overlayFile, wrap(cue.overlay, 28, 2), "utf8");
    fs.writeFileSync(spokenFile, wrap(cue.spoken, 36, 3), "utf8");
    files.push(overlayFile, spokenFile);
    const enable = `between(t\\,${cue.start.toFixed(3)}\\,${cue.end.toFixed(3)})`;
    const overlayArg = overlayFile.replace(/\\/g, "/").replace(":", "\\:");
    const spokenArg = spokenFile.replace(/\\/g, "/").replace(":", "\\:");
    draws.push(`drawtext=fontfile='${fontArg}':textfile='${overlayArg}':expansion=none:fontsize=28:${band}:line_spacing=6:x=(w-text_w)/2:y=40:enable='${enable}'`);
    draws.push(`drawtext=fontfile='${fontArg}':textfile='${spokenArg}':expansion=none:fontsize=22:${band}:line_spacing=4:x=(w-text_w)/2:y=h-text_h-36:enable='${enable}'`);
  });
  try {
    await run(["-y", "-i", src, "-vf", draws.join(","), "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "veryfast", "-an", dest]);
  } finally {
    for (const file of files) fs.rmSync(file, { force: true });
  }
  if (!fs.existsSync(dest) || fs.statSync(dest).size < 1000) throw new Error("Storyboard text did not land on the clip.");
}

export async function muxPictureAudio(video: string, audioSource: string, dest: string) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  await run([
    "-y", "-i", video, "-i", audioSource,
    "-map", "0:v:0", "-map", "1:a:0",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-ac", "2",
    "-shortest", "-movflags", "+faststart",
    dest,
  ]);
  if (!fs.existsSync(dest) || fs.statSync(dest).size < 1000) throw new Error("The photo move did not keep its voice.");
}

export async function concatSceneClips(paths: string[], dest: string) {
  if (!paths.length) throw new Error("No scenes to join.");
  const dir = path.dirname(dest);
  fs.mkdirSync(dir, { recursive: true });
  const temps: string[] = [];
  const ready: string[] = [];
  for (const file of paths) {
    if (await mediaHasAudio(file)) {
      ready.push(file);
      continue;
    }
    const silent = path.join(dir, `${path.basename(file, ".mp4")}-silent.mp4`);
    await silenceOntoClip(file, silent);
    temps.push(silent);
    ready.push(silent);
  }
  if (ready.length === 1) {
    fs.copyFileSync(ready[0], dest);
    for (const file of temps) fs.rmSync(file, { force: true });
    return;
  }
  const list = path.join(dir, `${path.basename(dest, ".mp4")}-concat.txt`);
  fs.writeFileSync(list, ready.map((file) => `file '${file.replace(/\\/g, "/")}'`).join("\n"));
  try {
    await run([
      "-y", "-f", "concat", "-safe", "0", "-i", list,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "veryfast",
      "-c:a", "aac", "-b:a", "160k", "-ar", "44100", "-ac", "2",
      "-movflags", "+faststart",
      dest,
    ]);
  } finally {
    fs.rmSync(list, { force: true });
    for (const file of temps) fs.rmSync(file, { force: true });
  }
  if (!fs.existsSync(dest) || fs.statSync(dest).size < 1000) throw new Error("Scene join produced an empty file.");
}
