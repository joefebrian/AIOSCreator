import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { SLIDE_H, SLIDE_LAYOUTS, SLIDE_W, wrapText, type CarouselDoc, type CarouselSlide } from "./factory-carousel";
import { dataRoot } from "./paths";

function ffmpeg() {
  return fs.existsSync("C:/ffmpeg/bin/ffmpeg.exe") ? "C:/ffmpeg/bin/ffmpeg.exe" : "ffmpeg";
}

function font(weight: "regular" | "bold") {
  const name = weight === "bold" ? "segoeuib.ttf" : "segoeui.ttf";
  const file = path.join("C:/Windows/Fonts", name);
  if (!fs.existsSync(file)) throw new Error("The export font is missing. The slide was not written.");
  return file.replace(/\\/g, "/").replace(":", "\\:");
}

function ff(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\u2019").replace(/%/g, "\\%").replace(/,/g, "\\,");
}

function run(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpeg(), args, { windowsHide: true });
    let err = "";
    child.stderr.on("data", (chunk) => { err += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err.slice(-400) || "The slide export failed."));
    });
  });
}

export async function renderSlidePng(opts: { slide: CarouselSlide; imagePath: string; dest: string }) {
  if (!fs.existsSync(opts.imagePath)) throw new Error("The product photo is missing. The slide was not exported.");
  const layout = SLIDE_LAYOUTS[opts.slide.layout];
  const boxW = Math.round(layout.product.w * opts.slide.scale);
  const boxH = Math.round(layout.product.h * opts.slide.scale);
  const x = layout.product.x + opts.slide.offsetX + Math.round((layout.product.w - boxW) / 2);
  const y = layout.product.y + opts.slide.offsetY;
  const headlines = wrapText(opts.slide.headline, 18);
  const bodies = wrapText(opts.slide.body, 28);
  const draws = [
    ...headlines.map((line, index) => `drawtext=fontfile='${font("bold")}':text='${ff(line)}':fontsize=54:fontcolor=0x111827:x=${layout.text.x}:y=${layout.text.y + index * 64}`),
    ...bodies.map((line, index) => `drawtext=fontfile='${font("regular")}':text='${ff(line)}':fontsize=32:fontcolor=0x374151:x=${layout.text.x}:y=${layout.text.y + headlines.length * 64 + 28 + index * 44}`),
  ];
  fs.mkdirSync(path.dirname(opts.dest), { recursive: true });
  await run([
    "-y",
    "-f", "lavfi", "-i", `color=c=0xF7F4EF:s=${SLIDE_W}x${SLIDE_H}`,
    "-i", opts.imagePath,
    "-filter_complex", `[1:v]scale=${boxW}:${boxH}:force_original_aspect_ratio=decrease[p];[0:v][p]overlay=${x}:${y},${draws.join(",")}`,
    "-frames:v", "1",
    opts.dest,
  ]);
  if (!fs.existsSync(opts.dest) || fs.statSync(opts.dest).size < 1000) throw new Error("The slide file is empty.");
}

function crc32(data: Buffer) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function zipStore(files: { name: string; data: Buffer }[]) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const crc = crc32(file.data);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(file.data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    locals.push(local, file.data);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(file.data.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);
    offset += local.length + file.data.length;
  }
  const central = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, end]);
}

export async function exportCarouselFiles(opts: { productionId: string; revision: number; doc: CarouselDoc; mediaPath: (id: string) => string; manifest: unknown }) {
  const dir = path.join(dataRoot(), "media", "ugc-carousel", opts.productionId, `r${opts.revision}`);
  fs.mkdirSync(dir, { recursive: true });
  const pngs: { name: string; data: Buffer }[] = [];
  for (let index = 0; index < opts.doc.slides.length; index += 1) {
    const name = `slide-0${index + 1}.png`;
    const dest = path.join(dir, name);
    await renderSlidePng({ slide: opts.doc.slides[index], imagePath: opts.mediaPath(opts.doc.slides[index].mediaId), dest });
    pngs.push({ name, data: fs.readFileSync(dest) });
  }
  const caption = Buffer.from(`${opts.doc.caption}\n\n${opts.doc.cta}\n`, "utf8");
  const manifest = Buffer.from(JSON.stringify(opts.manifest, null, 2), "utf8");
  const zip = zipStore([...pngs, { name: "caption.txt", data: caption }, { name: "manifest.json", data: manifest }]);
  const zipPath = path.join(dir, "carousel.zip");
  fs.writeFileSync(zipPath, zip);
  return { dir, zipPath, pngs: pngs.map((row) => path.join(dir, row.name)) };
}
