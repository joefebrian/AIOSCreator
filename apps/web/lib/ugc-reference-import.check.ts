import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getProduct, setProductBrand, setProductsRootForTests, upsertProduct, type Product } from "./products";
import { addCatalogFact, confirmCatalogFact, ensureSharedCatalog, readSharedCatalog, setSharedCatalogRootForTests } from "./shared-catalog";
import { canAcquirePost, embedPreviewUrl, referenceIdentity } from "./ugc-reference-preview";
import {
  getUgcImportJob,
  importPreparedFile,
  listUgcImportState,
  publicPostDownloaderCapability,
  setReferenceFetchForTests,
  setReferenceResolverForTests,
  setReferenceWatchDownloaderForTests,
  setUgcReferenceImportRootForTests,
  startUgcReferenceImport,
  storedPlayerReady,
  ugcImportTask,
} from "./ugc-reference-import";
import { openFactoryDraftForReference } from "./ugc-reference-factory";
import {
  addReferenceFromImport,
  analyzeUgcReference,
  importAndPreviewReference,
  listUgcReferences,
  saveReviewedAnalysisForTests,
  setUgcReferencesRootForTests,
} from "./ugc-references";
import {
  addFactoryFact,
  approveFactoryPlan,
  confirmFactoryFact,
  confirmListingEquivalence,
  decideFactoryRecipe,
  readFactoryV2,
  setFactoryAsset,
  setFactoryV2RootForTests,
  writeFactoryPlan,
} from "./ugc-factory-v2";

function check(name: string, ok: boolean) {
  if (!ok) throw new Error(name);
  console.log("ok", name);
}

function productRow(id: string, title: string, sourceUrl: string): Product {
  const stamp = "2026-10-05T00:00:00.000Z";
  return {
    id,
    provider: "amazon",
    providerProductId: id,
    title,
    brand: "HomeBrand",
    category: "kitchen",
    price: "19.00",
    currency: "USD",
    features: ["Wipes glass"],
    images: [],
    market: "com",
    sourceUrl,
    affiliateUrl: `${sourceUrl}?sub_id=aioscreator&keep=1`,
    score: 0,
    scoreParts: [],
    createdAt: stamp,
    updatedAt: stamp,
  };
}

function makeSample(dest: string) {
  const ffmpeg = fs.existsSync("C:\\ffmpeg\\bin\\ffmpeg.exe") ? "C:\\ffmpeg\\bin\\ffmpeg.exe" : "ffmpeg";
  const probe = ffmpeg.replace(/ffmpeg(\.exe)?$/i, "ffprobe$1");
  process.env.FFMPEG_PATH = ffmpeg;
  process.env.FFPROBE_PATH = probe;
  const result = spawnSync(ffmpeg, [
    "-y",
    "-f", "lavfi", "-i", "color=c=black:s=64x64:d=1",
    "-f", "lavfi", "-i", "anullsrc=channel_layout=mono:sample_rate=44100",
    "-shortest", "-t", "1",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
    dest,
  ], { windowsHide: true });
  if (result.status !== 0 || !fs.existsSync(dest) || fs.statSync(dest).size < 1000) {
    throw new Error("ffmpeg sample failed");
  }
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ugc-import-"));
  process.env.CREATOROS_DATA_DIR = dir;
  setProductsRootForTests(dir);
  setSharedCatalogRootForTests(dir);
  setUgcReferencesRootForTests(dir);
  setUgcReferenceImportRootForTests(dir);
  setFactoryV2RootForTests(dir);

  const wiper = productRow("p-wiper", "Kitchen wiper", "https://example.com/wiper");
  upsertProduct(wiper);
  const other = productRow("p-other", "Other wiper", "https://example.com/other");
  upsertProduct(other);
  const catalog = ensureSharedCatalog([wiper, other]);
  const skuIds = catalog.skus.map((row) => row.id).join();
  const skuCount = catalog.skus.length;
  const wiperSku = catalog.legacy.find((row) => row.productId === "p-wiper")?.skuId || "";
  const otherSku = catalog.legacy.find((row) => row.productId === "p-other")?.skuId || "";
  setProductBrand("p-wiper", "HomeBrand");
  check("two catalog skus", skuCount === 2 && Boolean(wiperSku) && wiperSku !== otherSku);

  let missing = "";
  try {
    await startUgcReferenceImport({ productId: "p-wiper", skuId: wiperSku, url: "" });
  } catch (err) {
    missing = err instanceof Error ? err.message : String(err);
  }
  check("missing url does not import", missing === "Enter an http or https URL." && listUgcImportState().jobs.length === 0 && listUgcReferences("p-wiper").length === 0);

  let privateUrl = "";
  try {
    await startUgcReferenceImport({ productId: "p-wiper", skuId: wiperSku, url: "http://127.0.0.1/secret.mp4" });
  } catch (err) {
    privateUrl = err instanceof Error ? err.message : String(err);
  }
  check("private url is blocked", privateUrl === "Private URLs are blocked." && listUgcImportState().jobs.length === 0);

  let profile = "";
  try {
    await startUgcReferenceImport({ productId: "p-wiper", skuId: wiperSku, url: "https://instagram.com/somebrand" });
  } catch (err) {
    profile = err instanceof Error ? err.message : String(err);
  }
  check("handle without a post id is not downloaded", profile === "This link has no post id. Add the post URL." && listUgcImportState().jobs.length === 0);

  const embed = embedPreviewUrl("https://www.instagram.com/reel/AbC123xyz/");
  check("embed is preview only", Boolean(embed && embed.endsWith("/embed")) && listUgcImportState().assets.length === 0);

  const fetches: string[] = [];
  setReferenceResolverForTests(async () => [{ address: "1.1.1.1" }]);
  setReferenceFetchForTests(async (input) => {
    const href = String(input);
    fetches.push(href);
    if (href.startsWith("https://1.1.1.1/clip.mp4")) {
      return new Response(null, { status: 302, headers: { location: "http://127.0.0.1/secret.mp4" } });
    }
    if (href.startsWith("https://1.1.1.1/page")) {
      return new Response("<html>no video</html>", { status: 200, headers: { "content-type": "text/html" } });
    }
    return new Response("nope", { status: 200, headers: { "content-type": "video/mp4", "content-length": String(121 * 1024 * 1024) } });
  });
  const redirected = await startUgcReferenceImport({ productId: "p-wiper", skuId: wiperSku, url: "https://1.1.1.1/clip.mp4" });
  await ugcImportTask(redirected.job.id);
  const redirectJob = getUgcImportJob(redirected.job.id);
  check(
    "redirect to a private host fails",
    redirectJob?.status === "failed" && /Private URLs are blocked/.test(redirectJob.error || "") && !fetches.some((href) => href.includes("127.0.0.1")) && !redirectJob.assetId,
  );

  const page = await startUgcReferenceImport({ productId: "p-wiper", skuId: wiperSku, url: "https://1.1.1.1/page" });
  await ugcImportTask(page.job.id);
  check("html page is not a video", getUgcImportJob(page.job.id)?.status === "failed" && /not a video/.test(getUgcImportJob(page.job.id)?.error || ""));

  const huge = await startUgcReferenceImport({ productId: "p-wiper", skuId: wiperSku, url: "https://1.1.1.1/huge.mp4" });
  await ugcImportTask(huge.job.id);
  check("oversize file is refused", /120MB/.test(getUgcImportJob(huge.job.id)?.error || ""));

  const tempsBefore = new Set(fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith("ugc-import-")));
  setReferenceWatchDownloaderForTests(async () => {
    throw new Error("Restricted");
  });
  const reel = "https://www.instagram.com/reel/AbC123xyz/";
  const firstReel = await startUgcReferenceImport({ productId: "p-wiper", skuId: wiperSku, url: reel, creator: "ada", publishedAt: "2026-10-01" });
  await ugcImportTask(firstReel.job.id);
  const secondReel = await startUgcReferenceImport({ productId: "p-wiper", skuId: wiperSku, url: reel });
  await ugcImportTask(secondReel.job.id);
  const reelJobs = listUgcImportState().jobs.filter((job) => job.dedupeKey === firstReel.job.dedupeKey);
  check(
    "restricted post reuses one failed job",
    firstReel.job.id === secondReel.job.id && reelJobs.length === 1 && getUgcImportJob(firstReel.job.id)?.status === "failed" && !getUgcImportJob(firstReel.job.id)?.assetId && listUgcReferences("p-wiper").length === 0,
  );
  const leftovers = fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith("ugc-import-") && !tempsBefore.has(name));
  check("failed temp files are removed", leftovers.length === 0);

  setReferenceFetchForTests(null);
  setReferenceResolverForTests(null);
  setReferenceWatchDownloaderForTests(null);

  const sample = path.join(dir, "sample.mp4");
  makeSample(sample);
  const sourceUrl = "https://example.com/posts/sample-video.mp4";
  const imported = await importPreparedFile({ productId: "p-wiper", skuId: wiperSku, url: sourceUrl, filePath: sample, creator: "ada", publishedAt: "2026-10-01" });
  const again = await importPreparedFile({ productId: "p-wiper", skuId: wiperSku, url: sourceUrl, filePath: sample });
  check(
    "stored video is ready once",
    imported.job.status === "ready" && imported.asset != null && again.asset?.id === imported.asset.id && again.job.id === imported.job.id && storedPlayerReady(imported.asset.mediaUrl) && imported.asset.durationSec > 0 && imported.asset.width === 64 && imported.asset.hasAudio && Boolean(imported.asset.fileHash) && listUgcReferences("p-wiper").length === 0 && readSharedCatalog().skus.map((row) => row.id).join() === skuIds,
  );

  let unconfirmed = "";
  try {
    addReferenceFromImport({
      productId: "p-wiper",
      skuId: wiperSku,
      mediaUrl: imported.asset!.mediaUrl,
      fileHash: imported.asset!.fileHash,
      sourceUrl: imported.asset!.sourceUrl,
      platform: imported.asset!.platform,
      postId: imported.asset!.postId,
      creator: imported.asset!.creator,
      publishedAt: imported.asset!.publishedAt,
      posterUrl: imported.asset!.posterUrl,
      durationSec: imported.asset!.durationSec,
      width: imported.asset!.width,
      height: imported.asset!.height,
      hasAudio: imported.asset!.hasAudio,
      assetId: imported.asset!.id,
      relation: "SAME_PRODUCT",
      confirmed: false,
      source: "match",
    });
  } catch (err) {
    unconfirmed = err instanceof Error ? err.message : String(err);
  }
  check("same product waits for confirmation", unconfirmed.includes("same physical product") && listUgcReferences("p-wiper").length === 0);

  const savedAsset = {
    mediaUrl: imported.asset!.mediaUrl,
    fileHash: imported.asset!.fileHash,
    sourceUrl: imported.asset!.sourceUrl,
    platform: imported.asset!.platform,
    postId: imported.asset!.postId,
    creator: imported.asset!.creator,
    publishedAt: imported.asset!.publishedAt,
    posterUrl: imported.asset!.posterUrl,
    durationSec: imported.asset!.durationSec,
    width: imported.asset!.width,
    height: imported.asset!.height,
    hasAudio: imported.asset!.hasAudio,
    assetId: imported.asset!.id,
  };
  const added = addReferenceFromImport({
    productId: "p-wiper",
    skuId: wiperSku,
    ...savedAsset,
    relation: "SAME_CATEGORY",
    confirmed: false,
    market: "US",
    locale: "en-US",
    source: "match",
  });
  const addedAgain = addReferenceFromImport({
    productId: "p-wiper",
    skuId: wiperSku,
    ...savedAsset,
    relation: "SAME_CATEGORY",
    market: "US",
    locale: "en-US",
    source: "match",
  });
  check(
    "add to reference is one row",
    added.created && addedAgain.created === false && addedAgain.reference.id === added.reference.id && listUgcReferences("p-wiper").length === 1 && added.reference.status === "media_saved" && added.reference.relation === "SAME_CATEGORY" && added.reference.assetId === imported.asset!.id,
  );

  let copied = "";
  try {
    addReferenceFromImport({ productId: "p-other", skuId: otherSku, ...savedAsset, relation: "STYLE_ONLY", source: "url" });
  } catch (err) {
    copied = err instanceof Error ? err.message : String(err);
  }
  check("import does not copy into another sku", copied.includes("another product") && listUgcReferences("p-other").length === 0 && readSharedCatalog().skus.length === skuCount);

  const confirmed = addCatalogFact({ skuId: wiperSku, kind: "USE", statement: "It wipes a counter in one pass." });
  const keptFact = confirmed.db.facts.find((row) => row.statement === "It wipes a counter in one pass.");
  confirmCatalogFact(keptFact!.id, "Compared with the wiper on the counter.");
  const factsBefore = readSharedCatalog().facts.map((row) => `${row.id}:${row.state}:${row.statement}`).join("|");
  const analyzed = await analyzeUgcReference({ productId: "p-wiper", referenceId: added.reference.id });
  check(
    "silent sample is measured and does not rewrite sku facts",
    analyzed.status === "analyzed" && analyzed.analysis?.version === 1 && analyzed.analysis.reviewed === false && analyzed.analysis.transcriptStatus === "no-speech" && analyzed.analysis.transcript.length === 0 && analyzed.analysis.candidateFacts.length === 0 && analyzed.analysis.audio === "silent" && analyzed.analysis.beats.length >= 1 && readSharedCatalog().facts.map((row) => `${row.id}:${row.state}:${row.statement}`).join("|") === factsBefore,
  );
  check("youtube post id is required before download", canAcquirePost("https://www.youtube.com/watch?v=dQw4w9WgXcQ") && referenceIdentity("https://youtu.be/dQw4w9WgXcQ").postId === "dQw4w9WgXcQ" && canAcquirePost("https://www.youtube.com/@shark") === false);

  let early = "";
  try {
    openFactoryDraftForReference({ productId: "p-wiper", referenceId: added.reference.id });
  } catch (err) {
    early = err instanceof Error ? err.message : String(err);
  }
  check("recreate waits for a reviewed analysis", early.includes("reviewed analysis") && readFactoryV2().productions.length === 0);

  const reviewed = saveReviewedAnalysisForTests(added.reference.id, { hook: "Open on the package", beat: "Show the wipe", cta: "Look at the result" });
  const opened = openFactoryDraftForReference({ productId: "p-wiper", referenceId: reviewed.id, market: "US", locale: "en-US" });
  const reopened = openFactoryDraftForReference({ productId: "p-wiper", referenceId: reviewed.id, market: "US", locale: "en-US" });
  check(
    "recreate pins the reviewed version once",
    opened.production.pinnedReferences?.[0]?.referenceId === reviewed.id && opened.production.pinnedReferences[0]?.analysisVersion === reviewed.analysis?.version && reopened.production.revision === opened.production.revision && reopened.production.providerJobId == null && opened.href.includes(opened.production.id) && readFactoryV2().productions.length === 1 && readSharedCatalog().skus.map((row) => row.id).join() === skuIds,
  );

  confirmListingEquivalence(opened.production.listingId, "VERIFIED");
  setFactoryAsset(opened.production.skuId, "productAppearance", true, "/api/media/products/fixture-a.jpg");
  setFactoryAsset(opened.production.skuId, "operationReference", true, "/api/media/products/fixture-op.mp4");
  setFactoryAsset(opened.production.skuId, "outputState", true, "/api/media/products/fixture-out.mp4");
  addFactoryFact({ skuId: opened.production.skuId, statement: "It wipes a counter in one pass.", kind: "USE" });
  const useFact = readFactoryV2().facts.find((row) => row.kind === "USE" && row.skuId === opened.production.skuId);
  confirmFactoryFact(useFact!.id);
  const beforeDecide = readFactoryV2().productions.find((row) => row.id === opened.production.id)!;
  const decided = await decideFactoryRecipe(beforeDecide.id, beforeDecide.revision, async () => {
    throw new Error("Jev must not be called");
  });
  console.log("one feasible pilot, Jev was not called");
  check("decision did not call Jev", decided.jevCalled === false && decided.production.recipeId === "HOME_HANDS_DEMO");

  let seenVersion = 0;
  let seenHook = "";
  let leaked = false;
  const drafted = await writeFactoryPlan(decided.production.id, decided.production.revision, async (input) => {
    seenVersion = input.references[0]?.analysisVersion || 0;
    seenHook = input.references[0]?.hook || "";
    leaked = /https?:|ugc-references|fixture-op/i.test(JSON.stringify(input.references));
    return {
      modelId: "fixture-not-astra",
      concept: "One wipe across the counter.",
      spoken: "This wipes the counter.",
      delivery: "Hands only. The wiper stays in frame.",
      audio: "Narrator reads the spoken line. No sample transcript.",
      edit: "One continuous action across the requested duration.",
      beats: [{
        id: "x",
        purpose: "Wipe",
        spoken: "This wipes the counter.",
        onScreen: null,
        action: "Two hands pull the wiper across the counter until the water line moves.",
        stateIn: "The wiper is in the right hand over a dry counter.",
        stateOut: "The water line has moved and the same wiper is still in frame.",
        factIds: [useFact!.id],
      }],
    };
  });
  console.log("fixture writer, not a live Astra call");
  check("writer receives the reviewed pattern", seenVersion === reviewed.analysis?.version && seenHook === "Open on the package" && !leaked && drafted.plan?.references?.[0]?.analysisVersion === reviewed.analysis?.version);
  const approved = approveFactoryPlan(drafted.id, drafted.revision);
  let blocked = "";
  try {
    openFactoryDraftForReference({ productId: "p-wiper", referenceId: reviewed.id });
  } catch (err) {
    blocked = err instanceof Error ? err.message : String(err);
  }
  const kept = readFactoryV2().productions.find((row) => row.id === approved.id);
  check(
    "approved plan is not pinned over",
    blocked === "The approved plan stays as saved. This reference was not pinned." && kept?.planApprovedAt === approved.planApprovedAt && kept?.plan?.concept === "One wipe across the counter." && readFactoryV2().productions.length === 1 && getProduct("p-wiper")?.id === "p-wiper",
  );

  setReferenceResolverForTests(async () => [{ address: "93.184.216.34" }]);
  setReferenceFetchForTests(async () => {
    const body = fs.readFileSync(sample);
    return new Response(body, { status: 200, headers: { "content-type": "video/mp4", "content-length": String(body.length) } });
  });
  const manualUrl = "https://example.com/manual-preview.mp4";
  const previewed = await importAndPreviewReference({ productId: "p-wiper", skuId: wiperSku, url: manualUrl, source: "url" });
  await ugcImportTask(previewed.job.id);
  const againPreview = await importAndPreviewReference({ productId: "p-wiper", skuId: wiperSku, url: manualUrl, source: "url" });
  await ugcImportTask(againPreview.job.id);
  const manual = listUgcReferences("p-wiper").find((row) => row.id === previewed.reference.id);
  const manualJobs = listUgcImportState().jobs.filter((job) => job.dedupeKey === previewed.job.dedupeKey);
  check(
    "manual import reuses one reference and stores playback",
    previewed.reference.id === againPreview.reference.id && manualJobs.length === 1 && manual?.status === "media_saved" && Boolean(manual.assetId && manual.mediaUrl?.startsWith("/api/media/ugc-references/") && (manual.durationSec || 0) > 0 && manual.width === 64 && manual.hasAudio) && readSharedCatalog().skus.map((row) => row.id).join() === skuIds,
  );
  setReferenceFetchForTests(null);
  setReferenceResolverForTests(null);
  const manualAnalyzed = await analyzeUgcReference({ productId: "p-wiper", referenceId: manual!.id });
  const keptImport = await importAndPreviewReference({ productId: "p-wiper", skuId: wiperSku, url: manualUrl, source: "url" });
  await ugcImportTask(keptImport.job.id);
  const keptRow = listUgcReferences("p-wiper").find((row) => row.id === manual!.id);
  check(
    "repeat import keeps the saved analysis",
    keptImport.reference.id === manual!.id && manualAnalyzed.analysis?.version === 1 && keptRow?.status === "analyzed" && keptRow.analysis?.version === 1 && keptRow.analysis?.transcriptStatus === "no-speech",
  );

  const cap = await publicPostDownloaderCapability();
  console.log("ytdlp available", cap.ytdlp);
  let direct = "not run";
  try {
    const live = await startUgcReferenceImport({ productId: "p-wiper", skuId: wiperSku, url: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4" });
    await ugcImportTask(live.job.id);
    const done = getUgcImportJob(live.job.id);
    const asset = listUgcImportState().assets.find((row) => row.id === done?.assetId);
    if (done?.status === "ready" && asset && storedPlayerReady(asset.mediaUrl)) direct = `ready bytes=${asset.bytes} duration=${asset.durationSec.toFixed(2)} audio=${asset.hasAudio}`;
    else direct = `blocked ${done?.status || "missing"} ${done?.error || ""}`;
  } catch (err) {
    direct = `blocked ${err instanceof Error ? err.message : String(err)}`;
  }
  console.log("direct public file", direct.replace(/https?:\/\/\S+/g, "[url]"));
  check("catalog ids stayed", readSharedCatalog().skus.map((row) => row.id).join() === skuIds && readSharedCatalog().skus.length === skuCount);

  setProductsRootForTests(null);
  setSharedCatalogRootForTests(null);
  setUgcReferencesRootForTests(null);
  setUgcReferenceImportRootForTests(null);
  setFactoryV2RootForTests(null);
  delete process.env.CREATOROS_DATA_DIR;
  fs.rmSync(dir, { recursive: true, force: true });
  console.log("ugc reference import checks finished");
}

void main();
