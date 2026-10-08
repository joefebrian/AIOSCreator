import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { affiliateCopyTarget } from "./affiliate-copy";
import { brandFromListingHtml } from "./product-import";
import { getProduct, setProductBrand, setProductsRootForTests, upsertProduct, type Product } from "./products";
import { ensureSharedCatalog, readSharedCatalog, setSharedCatalogRootForTests } from "./shared-catalog";
import {
  addUgcReferenceUrl,
  addReferenceCandidateFact,
  analyzeUgcReference,
  attachUgcVideo,
  listUgcReferences,
  saveReviewedAnalysisForTests,
  setUgcReferencesRootForTests,
} from "./ugc-references";
import {
  addFactoryFact,
  approveFactoryPlan,
  confirmFactoryFact,
  confirmListingEquivalence,
  createFactoryProduction,
  pinFactoryReference,
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

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ugc-references-"));
  process.env.CREATOROS_DATA_DIR = dir;
  setProductsRootForTests(dir);
  setSharedCatalogRootForTests(dir);
  setUgcReferencesRootForTests(dir);
  setFactoryV2RootForTests(dir);

  const tracked = "https://example.com/wiper?sub_id=aioscreator&keep=1";
  const copy = affiliateCopyTarget({
    skuId: "sku-1",
    market: "US",
    listings: [{ id: "L1", market: "US", sourceUrl: "https://example.com/wiper" }],
    destinations: [
      { listingId: "L1", trackedUrl: "https://example.com/wiper?sub_id=old", nativeProductRef: null, reviewState: "UNVERIFIED", version: 1 },
      { listingId: "L1", trackedUrl: tracked, nativeProductRef: "B00NOTAURL", reviewState: "UNVERIFIED", version: 2 },
    ],
    preferences: [],
  });
  check("copy keeps the tracked query", copy.action === "copy" && copy.url === tracked && copy.url !== "https://example.com/wiper");

  const preferred = affiliateCopyTarget({
    skuId: "sku-1",
    market: "US",
    listings: [
      { id: "L1", market: "US", sourceUrl: "https://example.com/wiper", variantReview: "PROVISIONAL" },
      { id: "L2", market: "US", sourceUrl: "https://example.com/other", variantReview: "PROVISIONAL" },
    ],
    destinations: [
      { listingId: "L1", trackedUrl: null, nativeProductRef: "B00NOTAURL", reviewState: "UNVERIFIED", version: 3 },
      { listingId: "L1", trackedUrl: tracked, nativeProductRef: null, reviewState: "EXPIRED", version: 4 },
      { listingId: "L2", trackedUrl: "https://example.com/other?sub_id=aioscreator", nativeProductRef: null, reviewState: "UNVERIFIED", version: 1 },
    ],
    preferences: [{ skuId: "sku-1", market: "US", listingId: "L1" }],
  });
  check("preferred listing without a url is not another listing", preferred.action === "add-affiliate" && preferred.listingId === "L1");
  check("a non-url native ref is not a copy", preferred.action === "add-affiliate");
  check("no listing asks for a listing", affiliateCopyTarget({ skuId: "sku-1", market: "SG", listings: [], destinations: [], preferences: [] }).action === "add-listing");

  const shark = '<script type="application/ld+json">{"@type":"Product","name":"SpeedStyle","brand":{"name":"Shark"}}</script>';
  const plain = '<script type="application/ld+json">{"@type":"Product","name":"SpeedStyle"}</script>';
  check("json-ld brand name", brandFromListingHtml(shark) === "Shark");
  check("missing json-ld brand stays blank", brandFromListingHtml(plain) === "");

  const wiper = productRow("p-wiper", "Kitchen wiper", "https://example.com/wiper");
  upsertProduct(wiper);
  const catalog = ensureSharedCatalog([wiper]);
  const skuIds = catalog.skus.map((row) => row.id).join();
  const snapshotTitle = catalog.listingSnapshots.map((row) => row.title).join("|");
  check("one catalog sku", catalog.skus.length === 1 && catalog.legacy.length === 1);
  setProductBrand("p-wiper", "  Shark   Home ");
  const branded = getProduct("p-wiper");
  const afterBrand = readSharedCatalog();
  check("brand saved on the same product", branded?.brand === "Shark Home" && branded.id === "p-wiper" && branded.title === "Kitchen wiper");
  check("brand leaves the catalog snapshot", afterBrand.skus.map((row) => row.id).join() === skuIds && afterBrand.skus.length === 1 && afterBrand.listingSnapshots.map((row) => row.title).join("|") === snapshotTitle);
  let tooLong = false;
  try {
    setProductBrand("p-wiper", "S".repeat(81));
  } catch (err) {
    tooLong = err instanceof Error && err.message === "Keep the brand under 80 characters.";
  }
  check("brand over 80 rejected", tooLong && getProduct("p-wiper")?.brand === "Shark Home");
  setProductBrand("p-wiper", "   ");
  check("empty brand clears", getProduct("p-wiper")?.brand == null && getProduct("p-wiper")?.title === "Kitchen wiper");

  const other = productRow("p-other", "Other wiper", "https://example.com/other");
  upsertProduct(other);
  const both = ensureSharedCatalog([wiper, other]);
  const skuCount = both.skus.length;
  const wiperSku = both.legacy.find((row) => row.productId === "p-wiper")?.skuId || "";
  const otherSku = both.legacy.find((row) => row.productId === "p-other")?.skuId || "";
  check("second product stays its own sku", skuCount === 2 && wiperSku !== otherSku && both.skus.map((row) => row.id).join().includes(skuIds));

  const firstUrl = "https://www.instagram.com/reel/AbC123/?igsh=keep";
  const sameShortcode = "https://instagram.com/reel/AbC123?utm=other";
  const first = addUgcReferenceUrl({ productId: "p-wiper", skuId: wiperSku, url: firstUrl, creator: "ada", publishedAt: "2026-10-01", market: "US", locale: "en-US" });
  const repeat = addUgcReferenceUrl({ productId: "p-wiper", skuId: wiperSku, url: firstUrl });
  const shortcode = addUgcReferenceUrl({ productId: "p-wiper", skuId: wiperSku, url: sameShortcode });
  check("repeat url is the same row", first.created && repeat.created === false && repeat.reference.id === first.reference.id);
  check("same shortcode dedupes", shortcode.created === false && listUgcReferences("p-wiper").length === 1);
  let copied = false;
  try {
    addUgcReferenceUrl({ productId: "p-other", skuId: otherSku, url: firstUrl });
  } catch (err) {
    copied = err instanceof Error && err.message === "This reference is already saved on another product. It was not copied into a new SKU.";
  }
  check("same url on another product is refused", copied && readSharedCatalog().skus.length === skuCount && listUgcReferences("p-other").length === 0 && getProduct("p-wiper")?.id === "p-wiper");

  let linkOnly = false;
  try {
    await analyzeUgcReference({ productId: "p-wiper", referenceId: first.reference.id });
  } catch (err) {
    linkOnly = err instanceof Error && err.message === "A saved link has no playable video. Analysis needs the file.";
  }
  check("link only cannot be analyzed", linkOnly && listUgcReferences("p-wiper")[0]?.status === "link_saved");

  const fileId = randomUUID();
  const mediaDir = path.join(dir, "media", "ugc-references");
  fs.mkdirSync(mediaDir, { recursive: true });
  fs.writeFileSync(path.join(mediaDir, `${fileId}.mp4`), Buffer.from("tiny-reference"));
  const mediaUrl = `/api/media/ugc-references/${fileId}.mp4`;
  const attached = attachUgcVideo({ productId: "p-wiper", skuId: wiperSku, mediaUrl, referenceId: first.reference.id });
  let unmatched = "";
  try {
    addReferenceCandidateFact({ productId: "p-wiper", referenceId: attached.reference.id, statement: "It wipes glass.", source: "speech", startSec: 0 });
  } catch (err) {
    unmatched = err instanceof Error ? err.message : String(err);
  }
  check("unconfirmed reference cannot add a product fact", unmatched.includes("same physical product") && readSharedCatalog().facts.every((row) => row.statement !== "It wipes glass."));
  const analyzed = await analyzeUgcReference({ productId: "p-wiper", referenceId: attached.reference.id });
  check(
    "a non-video file fails analysis",
    analyzed.status === "failed" && /not a video|playable/i.test(analyzed.failure || "") && (analyzed.analysis?.transcript.length || 0) === 0,
  );
  const again = attachUgcVideo({ productId: "p-wiper", skuId: wiperSku, mediaUrl });
  check("same file hash is not a second row", again.created === false && again.reference.id === attached.reference.id && listUgcReferences("p-wiper").length === 1);
  let hashCopied = false;
  try {
    attachUgcVideo({ productId: "p-other", skuId: otherSku, mediaUrl });
  } catch (err) {
    hashCopied = err instanceof Error && err.message === "This video is already saved on another product. It was not copied into a new SKU.";
  }
  check("same video on another product is refused", hashCopied && readSharedCatalog().skus.length === skuCount);

  const reviewed = saveReviewedAnalysisForTests(attached.reference.id, { hook: "Open on the package", beat: "Show the wipe", cta: "Look at the result" });
  check("reviewed version is explicit", reviewed.analysis?.reviewed === true && reviewed.analysis.version === 1 && reviewed.status === "analyzed");

  const made = createFactoryProduction({
    idempotencyKey: "wiper-us",
    product: { ...wiper, brand: "HomeBrand" },
    market: "US",
    locale: "en-US",
    placement: "TIKTOK",
    recipeId: "HOME_HANDS_DEMO",
  });
  const family = readFactoryV2().families.find((row) => row.id === readFactoryV2().skus.find((sku) => sku.id === made.production.skuId)?.familyId);
  check("family still uses the brand", family?.label === "HomeBrand");
  confirmListingEquivalence(made.production.listingId, "VERIFIED");
  setFactoryAsset(made.production.skuId, "productAppearance", true, "/api/media/products/fixture-a.jpg");
  setFactoryAsset(made.production.skuId, "operationReference", true, "/api/media/products/fixture-op.mp4");
  setFactoryAsset(made.production.skuId, "outputState", true, "/api/media/products/fixture-out.mp4");
  addFactoryFact({ skuId: made.production.skuId, statement: "It wipes a counter in one pass.", kind: "USE" });
  const useFact = readFactoryV2().facts.find((row) => row.kind === "USE" && row.skuId === made.production.skuId);
  confirmFactoryFact(useFact!.id);
  const ready = readFactoryV2().productions.find((row) => row.id === made.production.id)!;
  const pinned = pinFactoryReference(ready.id, ready.revision, { referenceId: reviewed.id, analysisVersion: reviewed.analysis!.version! });
  const pinnedAgain = pinFactoryReference(pinned.id, pinned.revision, { referenceId: reviewed.id, analysisVersion: reviewed.analysis!.version! });
  check("repeat pin does not bump revision", pinned.revision === ready.revision + 1 && pinnedAgain.revision === pinned.revision && pinnedAgain.planApprovedAt == null);

  let seenVersion = 0;
  let seenHook = "";
  let leaked = false;
  const drafted = await writeFactoryPlan(pinnedAgain.id, pinnedAgain.revision, async (input) => {
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
  check("writer receives the reviewed pattern", seenVersion === 1 && seenHook === "Open on the package" && !leaked);
  check("plan stores the pinned version", drafted.plan?.references?.[0]?.referenceId === reviewed.id && drafted.plan.references[0]?.analysisVersion === 1 && drafted.plan.modelId === "fixture-not-astra");
  const repin = pinFactoryReference(drafted.id, drafted.revision, { referenceId: reviewed.id, analysisVersion: 1 });
  check("pin after the plan stays on the same revision", repin.revision === drafted.revision && repin.plan?.concept === "One wipe across the counter.");

  const approved = approveFactoryPlan(drafted.id, drafted.revision);
  let blocked = "";
  try {
    pinFactoryReference(approved.id, approved.revision, { referenceId: reviewed.id, analysisVersion: 1 });
  } catch (err) {
    blocked = err instanceof Error ? err.message : String(err);
  }
  const kept = readFactoryV2().productions.find((row) => row.id === approved.id);
  check(
    "approved plan is not pinned over",
    blocked === "The approved plan stays as saved. This reference was not pinned." && kept?.planApprovedAt === approved.planApprovedAt && kept?.plan?.concept === approved.plan?.concept && kept?.revision === approved.revision,
  );
  check("references did not create a sku", readSharedCatalog().skus.length === skuCount && readFactoryV2().productions.length === 1);

  const route = fs.readFileSync(path.join(process.cwd(), "app", "api", "commerce", "products", "route.ts"), "utf8");
  check("match does not insert references", route.includes('action === "branded-search"') && !route.includes("ugc-references"));

  setProductsRootForTests(null);
  setSharedCatalogRootForTests(null);
  setUgcReferencesRootForTests(null);
  setFactoryV2RootForTests(null);
  delete process.env.CREATOROS_DATA_DIR;
  console.log("ugc-references checks passed");
}

void main();
