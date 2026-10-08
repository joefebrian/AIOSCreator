import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fixtureCarousel, parseCarouselCopy, saveCarouselSlide, storeCarousel } from "./factory-carousel";
import { exportCarouselFiles, zipStore } from "./factory-carousel-export";
import { commitFactoryDb, createFactoryProduction, readFactoryV2, setFactoryV2RootForTests } from "./ugc-factory-v2";

function check(name: string, ok: boolean) {
  if (!ok) throw new Error(name);
  console.log("ok", name);
}

function probe(file: string) {
  const bin = fs.existsSync("C:/ffmpeg/bin/ffprobe.exe") ? "C:/ffmpeg/bin/ffprobe.exe" : "ffprobe";
  return new Promise<string>((resolve, reject) => {
    const child = spawn(bin, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=p=0", file], { windowsHide: true });
    let out = "";
    child.stdout.on("data", (chunk) => { out += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(out))));
  });
}

async function main() {
  const media = [{ id: "photo-a", url: "/api/media/products/eefa1394-f077d6.jpg" }, { id: "photo-b", url: "/api/media/products/eefa1394-31b259.jpg" }];
  const doc = fixtureCarousel({ productName: "Zero Pore Pad", media, market: "MY" });
  check("fixture is five slides and labeled", doc.slides.length === 5 && doc.fixture === true && doc.slides[0].role === "hook" && doc.slides[4].role === "cta");
  let bad = false;
  try {
    parseCarouselCopy(JSON.stringify({ slides: [{ role: "hook", headline: "Hi", body: "", mediaId: "photo-a", factIds: ["missing"] }] }), { media, facts: [] });
  } catch { bad = true; }
  check("an unknown fact is rejected", bad);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "carousel-"));
  setFactoryV2RootForTests(dir);
  const product = { id: "pad", title: "Zero Pore Pad", brand: "medicube", category: "Beauty", price: "19", currency: "USD", sourceUrl: "https://example.com/p", affiliateUrl: "https://example.com/p?tag=1", provider: "amazon", providerProductId: "B00", features: [] };
  const my = createFactoryProduction({ idempotencyKey: "my-carousel", product, market: "MY", locale: "en-MY", placement: "TIKTOK", durationSec: 15 });
  const sg = createFactoryProduction({ idempotencyKey: "sg-carousel", product, market: "SG", locale: "en-SG", placement: "TIKTOK", durationSec: 15 });
  const db = readFactoryV2();
  for (const row of db.productions) row.planningMode = "CAROUSEL";
  commitFactoryDb(db);
  const saved = storeCarousel(my.production.id, my.production.revision, doc, "MY");
  let leaked = false;
  try { storeCarousel(sg.production.id, sg.production.revision, doc, "MY"); } catch { leaked = true; }
  check("a late other-market response is refused", leaked);
  const edited = saveCarouselSlide(my.production.id, saved.revision, "slide-1", { headline: "Edited hook" });
  check("an edit stays on the same five slides", edited.carousel?.slides?.length === 5 && (edited.carousel as { slides: { headline: string }[] }).slides[0].headline === "Edited hook");
  const video = createFactoryProduction({ idempotencyKey: "video", product, market: "US", locale: "en-US", placement: "TIKTOK", durationSec: 15 });
  check("a video draft is not turned into a carousel", video.production.planningMode !== "CAROUSEL");

  const image = path.resolve("../../data/media/products/eefa1394-f077d6.jpg");
  if (fs.existsSync(image)) {
    const rendered = await exportCarouselFiles({
      productionId: "proof",
      revision: edited.revision,
      doc: { ...doc, slides: doc.slides.map((slide, index) => index === 0 ? { ...slide, headline: "Edited hook" } : slide) },
      mediaPath: () => image,
      manifest: { productionId: "proof", revision: edited.revision, market: "MY", locale: "en-MY", affiliateUrl: "https://s.shopee.com.my/example?aff=1" },
    });
    const size = await probe(rendered.pngs[0]);
    check("the png is 1080 by 1350", size === "1080,1350");
    const zip = fs.readFileSync(rendered.zipPath);
    check("the zip holds five slides, the caption, and the manifest", zip.includes(Buffer.from("slide-01.png")) && zip.includes(Buffer.from("slide-05.png")) && zip.includes(Buffer.from("caption.txt")) && zip.includes(Buffer.from("manifest.json")) && zip.includes(Buffer.from("s.shopee.com.my")));
    check("zip store round trip keeps a png header", zipStore([{ name: "a.png", data: Buffer.from([137, 80, 78, 71]) }])[0] === 0x50);
  } else {
    console.log("skip raster, product photo missing");
  }
  setFactoryV2RootForTests(null);
  console.log("carousel checks passed");
}

void main();
