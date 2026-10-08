import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  addFactoryFact,
  addFactoryListing,
  approveFactoryPlan,
  assessFactoryProduction,
  confirmFactoryFact,
  confirmListingEquivalence,
  createFactoryProduction,
  decideFactoryRecipe,
  markFactoryListings,
  noteFactoryNameImpact,
  pinFactoryReference,
  readFactoryV2,
  refuseFactoryGenerate,
  saveRecreationPlan,
  setFactoryPlanningMode,
  saveBenchmarkNotes,
  setFactoryAsset,
  setFactoryV2RootForTests,
  splitFactorySku,
  writeFactoryPlan,
  type CatalogSlice,
} from "./ugc-factory-v2";

const product: CatalogSlice = {
  id: "sku-60",
  title: "Kitchen wiper",
  brand: "HomeBrand",
  category: "kitchen",
  price: "19.00",
  currency: "USD",
  sourceUrl: "https://example.com/us",
  affiliateUrl: "https://example.com/us?tag=1",
  provider: "amazon",
  providerProductId: "B00TEST",
  features: ["Wipes glass"],
};

function check(name: string, ok: boolean) {
  if (!ok) throw new Error(name);
  console.log("ok", name);
}

async function main() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-v2-"));
  setFactoryV2RootForTests(dir);
  fs.mkdirSync(path.join(dir, "db"), { recursive: true });
  fs.writeFileSync(path.join(dir, "db", "ugc-factory-v2.json"), JSON.stringify({
    schema: "ugc-factory-v2",
    families: [],
    skus: [],
    listings: [],
    snapshots: [],
    facts: [],
    productions: [],
    idempotency: [],
    benchmark: { sha256: "63d0689dbeb2ba5e99609da92a901b506a80e1f0e652e642f070c6d900932c46", breakdown: "not_reviewed" },
  }));
  const upgraded = readFactoryV2();
  check("visual only", upgraded.benchmark.review === "visual_only");
  check("speech unknown", upgraded.benchmark.speech === "unknown");
  check("performance unknown", upgraded.benchmark.performance === "unknown");
  check("source line kept", upgraded.benchmark.beats.some((beat) => beat.onScreenText === "Trying Shark Flexstyle"));
  check("structure stays clean", upgraded.benchmark.referenceScript.lines.every((line) => !/shark|highly recommend|heat damage/i.test(line.structureOnly)));
  check("no universal drop rule", !/drop first/i.test(upgraded.benchmark.pattern) && !/end card drop/i.test(upgraded.benchmark.pattern));
  check("production script not written", upgraded.benchmark.productionScript.status === "not_written");
  const beatIds = new Set(upgraded.benchmark.beats.map((beat) => beat.id));
  check("script covers beats", upgraded.benchmark.beats.every((beat) => upgraded.benchmark.referenceScript.lines.some((line) => line.beatId === beat.id)) && upgraded.benchmark.referenceScript.lines.every((line) => beatIds.has(line.beatId)));
  check("contents beat", upgraded.benchmark.beats.some((beat) => beat.id === "b-contents" && (beat.onScreenText || "").includes("5 attachments")));
  check("diffuser beat", upgraded.benchmark.beats.some((beat) => beat.id === "b-diffuser"));
  const first = createFactoryProduction({
    idempotencyKey: "one",
    product,
    market: "US",
    locale: "en-US",
    placement: "TIKTOK",
    recipeId: "HOME_HANDS_DEMO",
  });
  const again = createFactoryProduction({
    idempotencyKey: "one",
    product,
    market: "US",
    locale: "en-US",
    placement: "TIKTOK",
    recipeId: "HOME_HANDS_DEMO",
  });
  check("idempotent", first.production.id === again.production.id && again.created === false);
  check("one video", readFactoryV2().productions.length === 1);
  check("usd kept", readFactoryV2().snapshots[0]?.currency === "USD");

  let threw = false;
  try {
    createFactoryProduction({
      idempotencyKey: "bad-locale",
      product,
      market: "ID",
      locale: "en-US",
      placement: "TIKTOK",
    });
  } catch {
    threw = true;
  }
  check("locale blocked", threw);

  threw = false;
  try {
    createFactoryProduction({
      idempotencyKey: "legacy",
      product,
      market: "US",
      locale: "en-US",
      placement: "TIKTOK",
      recipeId: "F03",
    });
  } catch {
    threw = true;
  }
  check("legacy recipe blocked", threw);

  const second = createFactoryProduction({
    idempotencyKey: "my",
    product,
    market: "MY",
    locale: "ms-MY",
    placement: "REELS",
    recipeId: "HOME_HANDS_DEMO",
  });
  check("second market is another production", second.production.id !== first.production.id);
  check("same physical sku", second.production.skuId === first.production.skuId);
  check("currency not converted", readFactoryV2().snapshots.every((row) => !row.currency || row.currency === "USD"));

  const split = splitFactorySku({ fromSkuId: first.production.skuId, variantLabel: "100 piece pack", componentCount: 100 });
  check("different package is a new sku", split.sku.id !== first.production.skuId && split.sku.familyId.length > 0);
  const family = readFactoryV2().families.find((row) => row.id === split.sku.familyId);
  const original = readFactoryV2().skus.find((row) => row.id === first.production.skuId);
  check("same family", family?.id === original?.familyId);

  addFactoryListing({ skuId: first.production.skuId, market: "SG", sourceUrl: "https://example.com/sg" });
  check("three links", readFactoryV2().listings.filter((row) => row.skuId === first.production.skuId).length === 3);

  confirmListingEquivalence(first.production.listingId, "VERIFIED");
  const fact = readFactoryV2().facts.find((row) => row.skuId === first.production.skuId);
  confirmFactoryFact(fact!.id);
  const ready = readFactoryV2().productions.find((row) => row.id === first.production.id);
  check("title confirm does not unlock the plan", ready?.stage === "NEEDS_FACTS" && !/at least one fact/i.test(ready?.issue || ""));
  const my = readFactoryV2().productions.find((row) => row.id === second.production.id);
  check("other market still needs facts", my?.stage === "NEEDS_FACTS");

  threw = false;
  try {
    const { setProductionRecipe } = await import("./ugc-factory-v2");
    setProductionRecipe(first.production.id, (ready?.revision || 1) - 1, "HOME_CREATOR_DEMO");
  } catch {
    threw = true;
  }
  check("stale revision", threw);

  const saved = saveBenchmarkNotes({
    beats: [{ id: "b-package", onScreenText: "Trying Shark Flexstyle", uncertainty: "Operator checked the first sample.", adapt: "Open on the sealed package." }],
    lines: [{ beatId: "b-package", structureOnly: "Show the sealed package for this SKU." }],
  });
  check("note saved", saved.beats.find((beat) => beat.id === "b-package")?.uncertainty === "Operator checked the first sample.");
  check("other beat kept", saved.beats.find((beat) => beat.id === "b-setup")?.onScreenText === "Let's start with wet hair");
  check("identity kept", saved.sha256.startsWith("63d0689d") && saved.speech === "unknown" && saved.performance === "unknown");
  const roundtrip = readFactoryV2().benchmark;
  check("note roundtrip", roundtrip.beats.find((beat) => beat.id === "b-package")?.adapt === "Open on the sealed package.");
  threw = false;
  try {
    saveBenchmarkNotes({
      beats: [],
      lines: [{ beatId: "b-end", structureOnly: "Highly recommend this Shark." }],
    });
  } catch {
    threw = true;
  }
  check("sample claim blocked", threw);
  check("blocked line unchanged", readFactoryV2().benchmark.referenceScript.lines.find((line) => line.beatId === "b-end")?.structureOnly.startsWith("Stop on the product"));
  check("default duration", first.production.durationMs === 30000);
  check("operator override", first.production.decision?.decisionSource === "OPERATOR");
  const extracted = readFactoryV2().facts.find((row) => row.statement === "Wipes glass");
  check("feature stays extracted", extracted?.state === "EXTRACTED" && extracted.kind === "LISTING");
  let badDuration = false;
  try {
    createFactoryProduction({ idempotencyKey: "long", product, market: "US", locale: "en-US", placement: "TIKTOK", durationSec: 45 });
  } catch {
    badDuration = true;
  }
  check("duration capped", badDuration);

  const blockedPlan = readFactoryV2().productions.find((row) => row.id === first.production.id);
  let writerCalled = false;
  let planError = "";
  try {
    await writeFactoryPlan(blockedPlan!.id, blockedPlan!.revision, async () => {
      writerCalled = true;
      throw new Error("writer should not run");
    });
  } catch (err) {
    planError = err instanceof Error ? err.message : String(err);
  }
  check("plan blocked before writer", !writerCalled && planError.startsWith("Cannot write a plan yet."));

  let bareAsset = false;
  try {
    setFactoryAsset(first.production.skuId, "operationReference", true);
  } catch {
    bareAsset = true;
  }
  check("file claim needs a media id", bareAsset);
  setFactoryAsset(first.production.skuId, "productAppearance", true, "/api/media/products/fixture-a.jpg");
  setFactoryAsset(first.production.skuId, "productAppearance", true, "/api/media/products/fixture-b.jpg");
  const { assessFactoryProduction } = await import("./ugc-factory-v2");
  const photoOnly = assessFactoryProduction(readFactoryV2(), readFactoryV2().productions.find((row) => row.id === first.production.id)!);
  check(
    "second photo is not an action reference",
    photoOnly.rejected.some((row) => row.recipeId === "HOME_HANDS_DEMO" && row.missing.some((item) => item.includes("operated"))),
  );
  setFactoryAsset(first.production.skuId, "operationReference", true, "/api/media/products/fixture-op.mp4");
  setFactoryAsset(first.production.skuId, "outputState", true, "/api/media/products/fixture-out.mp4");
  setFactoryAsset(first.production.skuId, "adultIdentity", true, "/api/media/characters/fixture-face.jpg");
  addFactoryFact({ skuId: first.production.skuId, statement: "It wipes a counter in one pass.", kind: "USE" });
  const useFact = readFactoryV2().facts.find((row) => row.kind === "USE");
  confirmFactoryFact(useFact!.id);
  const beforeDecide = readFactoryV2().productions.find((row) => row.id === first.production.id)!;
  let outside = false;
  try {
    await decideFactoryRecipe(beforeDecide.id, beforeDecide.revision, async () => ({ choice: "TOY_UNBOX_FIRST_PLAY", modelId: "fixture-jev", confidence: null }));
  } catch {
    outside = true;
  }
  check("choice outside feasible set", outside);
  check("rejected choice not saved", readFactoryV2().productions.find((row) => row.id === first.production.id)?.decision?.modelId !== "fixture-jev");
  const fixture = await decideFactoryRecipe(beforeDecide.id, beforeDecide.revision, async () => ({ choice: "HOME_HANDS_DEMO", modelId: "fixture-jev", confidence: null }));
  console.log("fixture decider, not a live Jev call");
  check("fixture choice", fixture.jevCalled && fixture.production.decision?.decisionSource === "JEV" && fixture.production.decision.modelId === "fixture-jev" && fixture.production.decision.confidence === null && fixture.production.decision.evidenceLabel === "HYPOTHESIS");
  check("fixture stays pilot wording", (fixture.production.decision?.summary || "").includes("pilot"));

  const readyPlan = readFactoryV2().productions.find((row) => row.id === first.production.id)!;
  const confirmedUse = readFactoryV2().facts.find((row) => row.kind === "USE" && row.state === "CONFIRMED")!;
  let genericRejected = false;
  try {
    await writeFactoryPlan(readyPlan.id, readyPlan.revision, async () => ({
      modelId: "fixture-not-astra",
      concept: "Wipe",
      spoken: "natural, viral UGC",
      delivery: "Hands close.",
      audio: "Narrator.",
      edit: "Hold the last second.",
      beats: [{ id: "x", purpose: "Wipe", spoken: "Wipe.", onScreen: null, action: "Two hands pull the wiper.", stateIn: "Wiper in the right hand.", stateOut: "The same wiper has crossed the counter.", factIds: [confirmedUse.id] }],
    }));
  } catch (err) {
    genericRejected = err instanceof Error && /generic prompt/.test(err.message);
  }
  check("generic prompt rejected", genericRejected && !readFactoryV2().productions.find((row) => row.id === first.production.id)?.plan);
  let briefName = "";
  const drafted = await writeFactoryPlan(readyPlan.id, readyPlan.revision, async (input) => {
    briefName = input.skuLabel;
    return {
    modelId: "fixture-not-astra",
    concept: "One wipe across the counter.",
    spoken: "This wipes the counter.",
    delivery: "Hands only. The wiper stays in frame.",
    audio: "Narrator reads the spoken line. No sample transcript.",
    edit: "One continuous action across the requested duration.",
    beats: [{ id: "x", purpose: "Wipe", spoken: "This wipes the counter.", onScreen: null, action: "Two hands pull the wiper across the counter until the water line moves.", stateIn: "The wiper is in the right hand over a dry counter.", stateOut: "The water line has moved and the same wiper is still in frame.", factIds: [confirmedUse.id] }],
    };
  }, "Kitchen wiper US");
  check("plan brief receives the resolved name", briefName === "Kitchen wiper US");
  console.log("fixture writer, not a live Astra call");
  check("fixture plan stored", drafted.plan?.modelId === "fixture-not-astra" && drafted.plan.beats[0]?.factIds[0] === confirmedUse.id && drafted.planApprovedAt == null);
  const approved = approveFactoryPlan(drafted.id, drafted.revision);
  check("approve does not render", approved.stage === "READY_TO_GENERATE" && approved.planApprovedAt != null);
  let generateRefused = false;
  try {
    refuseFactoryGenerate(approved.id, approved.revision);
  } catch (err) {
    generateRefused = err instanceof Error && err.message.startsWith("No video job was submitted.");
  }
  check("generate refused", generateRefused && readFactoryV2().productions.length === 2);
  const unpicked = createFactoryProduction({
    idempotencyKey: "no-recipe",
    product,
    market: "TH",
    locale: "th-TH",
    placement: "SHORTS",
  });
  check("no recipe stays blocked", unpicked.production.stage === "NEEDS_FACTS" && !/facts are confirmed/i.test(unpicked.production.issue) && !/at least one fact/i.test(unpicked.production.issue));
  const sg = readFactoryV2().listings.find((row) => row.market === "SG" && row.sourceUrl === "https://example.com/sg");
  check("sg link starts proposed", sg?.equivalence === "PROPOSED");
  markFactoryListings({ catalogProductId: "sku-60", sourceUrl: "https://example.com/sg/", market: "SG", equivalence: "VERIFIED" });
  check("catalog review verifies the matching link", readFactoryV2().listings.find((row) => row.id === sg?.id)?.equivalence === "VERIFIED");
  const approvedBefore = readFactoryV2().productions.find((row) => row.id === first.production.id);
  markFactoryListings({ catalogProductId: "sku-60", sourceUrl: "https://example.com/us", market: "US", equivalence: "REJECTED" });
  const kept = readFactoryV2().productions.find((row) => row.id === first.production.id);
  const usListing = readFactoryV2().listings.find((row) => row.id === first.production.listingId);
  check("verified listing is not downgraded", usListing?.equivalence === "VERIFIED" && kept?.planApprovedAt === approvedBefore?.planApprovedAt && kept?.plan?.modelId === "fixture-not-astra");
  const named = readFactoryV2().productions.find((row) => row.id === first.production.id)!;
  const skuIds = readFactoryV2().skus.map((row) => row.id).join();
  const snapshotTitle = readFactoryV2().snapshots.find((row) => row.listingId === named.listingId)?.title;
  noteFactoryNameImpact({ catalogProductId: "sku-60", skuRevision: named.revision, field: "local name US en-US", market: "US", locale: "en-US" });
  const afterName = readFactoryV2().productions.find((row) => row.id === named.id)!;
  const otherName = readFactoryV2().productions.find((row) => row.market === "TH")!;
  check("local name flags only that draft", afterName.impact?.fields.includes("local name US en-US") === true && !otherName.impact);
  check("approved snapshot stays after a rename", afterName.planApprovedAt === named.planApprovedAt && afterName.plan?.spoken === named.plan?.spoken && afterName.plan?.modelId === "fixture-not-astra" && !afterName.providerJobId);
  check("rename does not create a factory sku or retitle the listing", readFactoryV2().skus.map((row) => row.id).join() === skuIds && readFactoryV2().snapshots.find((row) => row.listingId === named.listingId)?.title === snapshotTitle);
  const beauty = createFactoryProduction({
    idempotencyKey: "beauty-ref",
    product: { ...product, id: "beauty-1", title: "Medicube toner pads", category: "Beauty", brand: "Medicube" },
    market: "ID",
    locale: "id-ID",
    placement: "TIKTOK",
  });
  const beautySku = readFactoryV2().skus.find((row) => row.id === beauty.production.skuId);
  const beautyFamily = readFactoryV2().families.find((row) => row.id === beautySku?.familyId);
  check("beauty stays outside the pilot categories", beautyFamily?.category === "other");
  const pinnedBeauty = pinFactoryReference(beauty.production.id, beauty.production.revision, { referenceId: "ref-beauty", analysisVersion: 3, blueprintVersion: 1 });
  const referenceMode = setFactoryPlanningMode(pinnedBeauty.id, pinnedBeauty.revision, "REFERENCE_RECREATE");
  const referenceReport = assessFactoryProduction(readFactoryV2(), referenceMode);
  check("reference mode skips pilot recipes", referenceMode.planningMode === "REFERENCE_RECREATE" && referenceMode.recipeId == null && !referenceReport.planBlockers.some((item) => /pilot recipe|home-gadget|preschool-toy/i.test(item)));
  check("beauty category was not rewritten", readFactoryV2().families.find((row) => row.id === beautyFamily?.id)?.category === "other");
  const storedPlan = saveRecreationPlan(referenceMode.id, referenceMode.revision, {
    modelId: "gpt-6-astra",
    concept: "Observer hook",
    spoken: "Lihat kulitnya.",
    delivery: "Observer.",
    audio: "Estimated until a voice exists.",
    edit: "Shots are camera shots.",
    beats: [{ id: "shot-1", purpose: "hook", spoken: "Lihat kulitnya.", onScreen: null, action: "Not observed in the source.", stateIn: "Not observed.", stateOut: "Not observed.", factIds: [] }],
  });
  let unmatchedBlocked = false;
  try {
    approveFactoryPlan(storedPlan.id, storedPlan.revision);
  } catch (err) {
    unmatchedBlocked = err instanceof Error && /listing|variant/i.test(err.message);
  }
  check("unverified variant blocks approval", unmatchedBlocked && readFactoryV2().productions.find((row) => row.id === storedPlan.id)?.planApprovedAt == null);
  const currentApproved = readFactoryV2().productions.find((row) => row.id === approved.id)!;
  let approvedUntouched = false;
  try {
    setFactoryPlanningMode(currentApproved.id, currentApproved.revision, "REFERENCE_RECREATE");
  } catch (err) {
    approvedUntouched = err instanceof Error && /approved plan stays/.test(err.message);
  }
  check("approved snapshot is not switched", approvedUntouched && readFactoryV2().productions.find((row) => row.id === approved.id)?.planApprovedAt === approved.planApprovedAt);
  setFactoryV2RootForTests(null);
  console.log("factory-v2 checks passed");
}

void main();
