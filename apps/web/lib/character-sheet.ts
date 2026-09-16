import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const CELL_W = 384;
const CELL_H = 480;

function run(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(FFMPEG, args, { windowsHide: true });
    let err = "";
    child.stderr.on("data", (d) => {
      err += d.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg sheet failed (${code}). ${err.slice(-400)}`));
    });
  });
}

/** 4:5 contact sheet from real stills. Never ask a generator to paint a mosaic. */
export async function composeCharacterSheet(paths: string[], dest: string) {
  const src = paths.filter((p) => fs.existsSync(p));
  if (!src.length) throw new Error("no stills to assemble");
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (src.length === 1) {
    fs.copyFileSync(src[0], dest);
    return;
  }
  const n = Math.min(9, src.length);
  const cols = n === 3 ? 3 : n <= 4 ? 2 : 3;
  const rows = Math.ceil(n / cols);
  const used = src.slice(0, n);
  const filters = used.map(
    (_, i) =>
      `[${i}:v]scale=${CELL_W}:${CELL_H}:force_original_aspect_ratio=increase:flags=lanczos,crop=${CELL_W}:${CELL_H},setsar=1[v${i}]`,
  );
  const layout = used
    .map((_, i) => {
      const x = (i % cols) * CELL_W;
      const y = Math.floor(i / cols) * CELL_H;
      return `${x}_${y}`;
    })
    .join("|");
  const ins = used.flatMap((p) => ["-i", p]);
  const chain = `${filters.join(";")};${used.map((_, i) => `[v${i}]`).join("")}xstack=inputs=${n}:layout=${layout}[out]`;
  await run(["-y", ...ins, "-filter_complex", chain, "-map", "[out]", dest]);
  if (!fs.existsSync(dest)) throw new Error("sheet was not written");
}
