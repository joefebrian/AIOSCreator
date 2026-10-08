import { NextResponse } from "next/server";
import { skuIdentityUrl } from "@/lib/product-import";
import { getProduct, listProducts } from "@/lib/products";
import { catalogDisplayName, readSharedCatalog, resolveCommercialContext } from "@/lib/shared-catalog";
import { FACTORY_RECIPES } from "@/lib/ugc-factory-recipes";
import {
  acknowledgeFactoryImpact,
  addFactoryFact,
  addFactoryListing,
  approveFactoryPlan,
  assessFactoryProduction,
  astraFactoryPlan,
  applyStoredRecreationMode,
  bindCatalogIdentityMedia,
  setFactoryPlanningMode,
  applySceneCaption,
  saveSceneEdit,
  saveSceneEdits,
  setProductionSetup,
  dismissDraftFactReview,
  setProductionLocale,
  confirmFactoryFact,
  confirmListingEquivalence,
  createFactoryProduction,
  decideFactoryRecipe,
  FACTORY_V2_MARKETS,
  FACTORY_V2_PLACEMENTS,
  FACTORY_V2_RECIPES,
  forkFactoryProduction,
  markFactoryListings,
  readFactoryV2,
  refreshStoredStages,
  refuseFactoryGenerate,
  saveBenchmarkNotes,
  setFactoryAsset,
  setProductionRecipe,
  skipLocalOffer,
  splitFactorySku,
  writeFactoryPlan,
  type Equivalence,
  type FactoryAssetKey,
  type FactoryCategory,
  type FactKind,
} from "@/lib/ugc-factory-v2";
import { attachReferenceDraft, referenceBoardSources, writeReferenceRecreation } from "@/lib/ugc-reference-factory";
import { ensureReferenceFrame, previewAdaptedVoice, proposeReferenceRewrite } from "@/lib/factory-reference-services";
import { beginCarouselJob, clearCarouselJob, copyPrompt, eligibleSkuFacts, fixtureCarousel, parseCarouselCopy, readCarousel, saveCarouselSlide, storeCarousel } from "@/lib/factory-carousel";


export const runtime = "nodejs";

export async function GET() {
  const db = refreshStoredStages(bindCatalogIdentityMedia(applyStoredRecreationMode(readFactoryV2())));
  const assessments: Record<string, ReturnType<typeof assessFactoryProduction>> = {};
  const displayNames: Record<string, string> = {};
  for (const production of db.productions) {
    assessments[production.id] = assessFactoryProduction(db, production);
    const sku = db.skus.find((row) => row.id === production.skuId);
    const family = db.families.find((row) => row.id === sku?.familyId);
    displayNames[production.id] = catalogDisplayName(sku?.catalogProductId || null, production.market, production.locale) || family?.label || "";
  }
  const products = listProducts().slice(0, 200).map((product) => ({
    id: product.id,
    title: product.title,
    image: skuIdentityUrl(product) || (product.images || []).find((url) => url.startsWith("/api/media/")) || "",
    identityImage: skuIdentityUrl(product) || "",
    currency: product.currency || "",
    price: product.price || "",
    category: product.category || "",
    provider: product.provider,
    sourceUrl: product.sourceUrl,
  }));
  return NextResponse.json({
    ...db,
    assessments,
    displayNames,
    products,
    markets: FACTORY_V2_MARKETS,
    placements: FACTORY_V2_PLACEMENTS,
    recipes: FACTORY_V2_RECIPES.map((recipe) => ({ ...recipe, status: "PILOT" as const })),
    legacyTemplates: FACTORY_RECIPES.map((recipe) => ({ id: recipe.id, name: recipe.name, family: recipe.family })),
    sources: referenceBoardSources(db.productions, db.skus),
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const op = String(body.op || "");
  try {
    if (op === "create") {
      const product = getProduct(String(body.catalogProductId || ""));
      if (!product) return NextResponse.json({ error: "Choose a catalog product" }, { status: 400 });
      const catalog = readSharedCatalog();
      const link = catalog.legacy.find((row) => row.productId === product.id);
      if (!link) throw new Error("This product is not in the shared catalog yet.");
      const resolution = resolveCommercialContext({
        skuId: link.skuId,
        market: String(body.market || ""),
        listingId: body.listingId ? String(body.listingId) : undefined,
        locale: String(body.locale || ""),
        placement: String(body.placement || ""),
      });
      if (resolution.gaps.length) throw new Error(resolution.gaps[0]);
      const shopUrl = resolution.listing?.sourceUrl || product.sourceUrl;
      const tracked = resolution.destination?.trackedUrl || "";
      const result = createFactoryProduction({
        idempotencyKey: String(body.idempotencyKey || ""),
        product: {
          id: product.id,
          title: product.title,
          brand: product.brand,
          category: product.category,
          price: product.price,
          currency: product.currency,
          sourceUrl: shopUrl,
          affiliateUrl: tracked,
          provider: product.provider,
          providerProductId: product.providerProductId,
          features: product.features || [],
          imageUrl: skuIdentityUrl(product) || "",
          hasPackagingImage: (product.imageRoles || []).includes("packaging"),
        },
        market: String(body.market || ""),
        locale: String(body.locale || ""),
        placement: String(body.placement || ""),
        destinationUrl: tracked,
        destinationVersionId: resolution.destination?.id || null,
        pinnedSkuRevision: resolution.sku.revision,
        recipeId: body.recipeId ? String(body.recipeId) : null,
        variantLabel: String(body.variantLabel || ""),
        componentCount: body.componentCount == null || body.componentCount === "" ? null : Number(body.componentCount),
        category: body.category ? (String(body.category) as FactoryCategory) : undefined,
        durationSec: body.durationSec == null || body.durationSec === "" ? undefined : Number(body.durationSec),
      });
      let production = result.production;
      if (String(body.planningMode || "") === "CAROUSEL") {
        const db = readFactoryV2();
        const row = db.productions.find((item) => item.id === production.id);
        if (row && row.planningMode !== "CAROUSEL") {
          row.planningMode = "CAROUSEL";
          row.recipeId = null;
          const { commitFactoryDb } = await import("@/lib/ugc-factory-v2");
          commitFactoryDb(db);
          production = row;
        }
      }
      if (String(body.planningMode || "") === "REFERENCE_RECREATE" && body.referenceId) {
        production = attachReferenceDraft({
          productionId: production.id,
          expectedRevision: production.revision,
          productId: product.id,
          referenceId: String(body.referenceId),
        });
      }
      return NextResponse.json({ production, created: result.created });
    }
    if (op === "set-planning-mode") {
      const production = setFactoryPlanningMode(String(body.productionId || ""), Number(body.expectedRevision), String(body.mode || "") as "TEMPLATE" | "REFERENCE_RECREATE");
      return NextResponse.json({ production });
    }
    if (op === "save-scene-edit") {
      const production = saveSceneEdit(String(body.productionId || ""), Number(body.expectedRevision), String(body.beatId || ""), {
        spoken: body.spoken == null ? undefined : String(body.spoken),
        action: body.action == null ? undefined : String(body.action),
        onScreen: body.onScreen == null ? undefined : String(body.onScreen),
        targetStartSec: body.targetStartSec == null ? undefined : Number(body.targetStartSec),
        targetEndSec: body.targetEndSec == null ? undefined : Number(body.targetEndSec),
      });
      return NextResponse.json({ production });
    }
    if (op === "save-scene-edits") {
      const edits = Array.isArray(body.edits) ? body.edits.map((row) => {
        const edit = row as Record<string, unknown>;
        return {
          beatId: String(edit.beatId || ""),
          spoken: edit.spoken == null ? undefined : String(edit.spoken),
          action: edit.action == null ? undefined : String(edit.action),
          onScreen: edit.onScreen == null ? undefined : String(edit.onScreen),
          targetStartSec: edit.targetStartSec == null ? undefined : Number(edit.targetStartSec),
          targetEndSec: edit.targetEndSec == null ? undefined : Number(edit.targetEndSec),
          speechDelivery: edit.speechDelivery ? String(edit.speechDelivery) as "CREATOR_SPEAKS" | "VOICEOVER" | "SILENT" : undefined,
          performance: edit.performance == null ? undefined : String(edit.performance),
        };
      }) : [];
      const production = saveSceneEdits(String(body.productionId || ""), Number(body.expectedRevision), edits, body.operatorNote == null ? undefined : String(body.operatorNote));
      return NextResponse.json({ production });
    }
    if (op === "set-production-setup") {
      const anchor = body.creatorAnchor && typeof body.creatorAnchor === "object" ? body.creatorAnchor as Record<string, unknown> : null;
      const image = body.productImage && typeof body.productImage === "object" ? body.productImage as Record<string, unknown> : null;
      const production = setProductionSetup(String(body.productionId || ""), Number(body.expectedRevision), {
        locale: body.locale ? String(body.locale) : undefined,
        durationSec: body.durationSec == null || body.durationSec === "" ? undefined : Number(body.durationSec),
        creatorMode: body.creatorMode ? String(body.creatorMode) as "HANDS" | "GENERATED_ADULT" | "SUPPLIED_ADULT" : undefined,
        creatorAnchor: body.creatorAnchor === null ? null : anchor ? { mediaId: String(anchor.mediaId || ""), url: String(anchor.url || ""), label: String(anchor.label || "") } : undefined,
        creatorLook: body.creatorLook === null ? null : body.creatorLook && typeof body.creatorLook === "object" ? body.creatorLook as { presentation: "woman" | "man"; age: "20s" | "30s"; hair: string; skin: string; wardrobe: string } : undefined,
        deliveryMode: body.deliveryMode ? String(body.deliveryMode) as "creator-led" | "voiceover" : undefined,
        voiceId: body.voiceId ? String(body.voiceId) : undefined,
        productImage: image ? { id: String(image.id || ""), url: String(image.url || "") } : undefined,
        audioStrategy: body.audioStrategy ? String(body.audioStrategy) as "NATIVE_AUDIO" | "EXTERNAL_TTS" : undefined,
        voiceDirection: body.voiceDirection == null ? undefined : String(body.voiceDirection),
      });
      return NextResponse.json({ production });
    }
    if (op === "propose-rewrite") {
      const db = readFactoryV2();
      const production = db.productions.find((row) => row.id === String(body.productionId || ""));
      if (!production) throw new Error("Production not found");
      if (production.revision !== Number(body.expectedRevision)) throw new Error("This draft changed. Reload it before rewriting.");
      if (production.planningMode !== "REFERENCE_RECREATE") throw new Error("A reference draft is required.");
      const scenes = Array.isArray(body.scenes) ? body.scenes.map((row) => {
        const scene = row as Record<string, unknown>;
        return {
          beatId: String(scene.beatId || ""),
          spoken: scene.spoken == null ? null : String(scene.spoken),
          onScreen: scene.onScreen == null ? null : String(scene.onScreen),
          action: String(scene.action || ""),
          sourceSpeech: scene.sourceSpeech == null ? "" : String(scene.sourceSpeech),
          targetLabel: scene.targetLabel == null ? "" : String(scene.targetLabel),
        };
      }) : [];
      const proposal = await proposeReferenceRewrite({
        mode: String(body.mode || "") as "recreate" | "revamp",
        locale: production.locale,
        market: production.market,
        productName: String(body.productName || "this product"),
        delivery: String(body.delivery || production.deliveryMode || "voiceover"),
        direction: body.direction ? String(body.direction) : "",
        beatId: body.beatId ? String(body.beatId) : null,
        scenes,
      });
      const after = readFactoryV2().productions.find((row) => row.id === production.id);
      if (after?.revision !== production.revision) throw new Error("The rewrite tried to change the draft. It was not kept.");
      return NextResponse.json({ proposal });
    }
    if (op === "preview-voice") {
      const result = await previewAdaptedVoice({
        productionId: String(body.productionId || ""),
        expectedRevision: Number(body.expectedRevision),
        beatId: String(body.beatId || ""),
        spoken: String(body.spoken || ""),
        voice: String(body.voice || ""),
        delivery: String(body.delivery || "voiceover") as "creator-led" | "voiceover",
      });
      return NextResponse.json(result);
    }
    if (op === "extract-reference-frame") {
      const result = await ensureReferenceFrame({
        mediaUrl: String(body.mediaUrl || ""),
        analysisVersion: Number(body.analysisVersion),
        startSec: Number(body.startSec),
        endSec: Number(body.endSec),
      });
      if ("error" in result) return NextResponse.json(result, { status: 422 });
      return NextResponse.json(result);
    }
    if (op === "apply-scene-caption") {
      const production = applySceneCaption(String(body.productionId || ""), Number(body.expectedRevision), String(body.beatId || ""), String(body.onScreen || ""));
      return NextResponse.json({ production });
    }
    if (op === "dismiss-fact-review") {
      const production = dismissDraftFactReview(String(body.productionId || ""));
      return NextResponse.json({ production });
    }
    if (op === "set-locale") {
      const production = setProductionLocale(String(body.productionId || ""), Number(body.expectedRevision), String(body.locale || ""));
      return NextResponse.json({ production });
    }
    if (op === "write-reference-plan") {
      const production = await writeReferenceRecreation(String(body.productionId || ""), Number(body.expectedRevision));
      return NextResponse.json({ production, modelId: production.plan?.modelId || null });
    }
    if (op === "confirm-listing") {
      const equivalence = String(body.equivalence || "") as Equivalence;
      confirmListingEquivalence(String(body.listingId || ""), equivalence);
      return NextResponse.json({ ok: true });
    }
    if (op === "confirm-fact") {
      confirmFactoryFact(String(body.factId || ""));
      return NextResponse.json({ ok: true });
    }
    if (op === "skip-offer") {
      const production = skipLocalOffer(String(body.productionId || ""), Number(body.expectedRevision));
      return NextResponse.json({ production });
    }
    if (op === "add-listing") {
      const result = addFactoryListing({
        skuId: String(body.skuId || ""),
        market: String(body.market || ""),
        sourceUrl: String(body.sourceUrl || ""),
        marketplace: String(body.marketplace || "other"),
      });
      return NextResponse.json({ listing: result.listing });
    }
    if (op === "split-sku") {
      const result = splitFactorySku({
        fromSkuId: String(body.skuId || ""),
        variantLabel: String(body.variantLabel || ""),
        componentCount: body.componentCount == null || body.componentCount === "" ? null : Number(body.componentCount),
      });
      return NextResponse.json({ sku: result.sku });
    }
    if (op === "set-recipe") {
      const production = setProductionRecipe(String(body.productionId || ""), Number(body.expectedRevision), String(body.recipeId || ""));
      return NextResponse.json({ production });
    }
    if (op === "add-fact") {
      addFactoryFact({
        skuId: String(body.skuId || ""),
        statement: String(body.statement || ""),
        kind: String(body.kind || "") as FactKind,
      });
      return NextResponse.json({ ok: true });
    }
    if (op === "set-asset") {
      setFactoryAsset(String(body.skuId || ""), String(body.key || "") as FactoryAssetKey, Boolean(body.present), body.mediaUrl ? String(body.mediaUrl) : undefined);
      return NextResponse.json({ ok: true });
    }
    if (op === "acknowledge-impact") {
      const production = acknowledgeFactoryImpact(String(body.productionId || ""), Number(body.expectedRevision), Boolean(body.apply));
      return NextResponse.json({ production });
    }
    if (op === "fork") {
      const result = forkFactoryProduction({
        productionId: String(body.productionId || ""),
        expectedRevision: Number(body.expectedRevision),
        market: String(body.market || ""),
        locale: String(body.locale || ""),
        placement: String(body.placement || ""),
        listingId: String(body.listingId || ""),
        sourceUrl: String(body.sourceUrl || ""),
        destinationUrl: String(body.destinationUrl || ""),
        destinationVersionId: body.destinationVersionId ? String(body.destinationVersionId) : null,
      });
      return NextResponse.json({ production: result.production });
    }
    if (op === "decide") {
      const result = await decideFactoryRecipe(String(body.productionId || ""), Number(body.expectedRevision));
      return NextResponse.json({ production: result.production, jevCalled: result.jevCalled });
    }
    if (op === "write-plan") {
      const board = readFactoryV2();
      const current = board.productions.find((row) => row.id === String(body.productionId || ""));
      const sku = current ? board.skus.find((row) => row.id === current.skuId) : null;
      const displayName = current ? catalogDisplayName(sku?.catalogProductId || null, current.market, current.locale) : "";
      const production = await writeFactoryPlan(String(body.productionId || ""), Number(body.expectedRevision), astraFactoryPlan, displayName);
      return NextResponse.json({ production });
    }
    if (op === "approve-plan") {
      const production = approveFactoryPlan(String(body.productionId || ""), Number(body.expectedRevision));
      return NextResponse.json({ production });
    }
    if (op === "save-carousel-slide") {
      const production = saveCarouselSlide(String(body.productionId || ""), Number(body.expectedRevision), String(body.slideId || ""), {
        headline: body.headline == null ? undefined : String(body.headline),
        body: body.body == null ? undefined : String(body.body),
        mediaId: body.mediaId == null ? undefined : String(body.mediaId),
        layout: body.layout == null ? undefined : String(body.layout) as "split-left" | "split-right" | "top-copy" | "detail" | "cta",
        scale: body.scale == null ? undefined : Number(body.scale),
        offsetX: body.offsetX == null ? undefined : Number(body.offsetX),
        offsetY: body.offsetY == null ? undefined : Number(body.offsetY),
      });
      return NextResponse.json({ production });
    }
    if (op === "generate-carousel") {
      const productionId = String(body.productionId || "");
      const expectedRevision = Number(body.expectedRevision);
      const { production, started } = beginCarouselJob(productionId, expectedRevision);
      if (!started) {
        if (production.carousel?.slides?.length === 5) return NextResponse.json({ production, duplicate: true });
        throw new Error("A carousel is already being written for this draft.");
      }
      const db = readFactoryV2();
      const sku = db.skus.find((row) => row.id === production.skuId);
      const catalog = readSharedCatalog();
      const catalogSku = catalog.skus.find((row) => row.legacyProductId === sku?.catalogProductId || row.id === sku?.catalogProductId);
      const media = (catalog.media || []).filter((row) => row.skuId === catalogSku?.id).map((row) => ({ id: row.id, url: row.url }));
      if (!media.length) {
        clearCarouselJob(productionId);
        throw new Error("Choose a product photo before generating the carousel.");
      }
      const facts = eligibleSkuFacts((catalog.facts || []).filter((row) => row.skuId === catalogSku?.id).map((row) => ({ ...row, statement: row.statement })), catalogSku?.id || "");
      const productName = catalogSku?.shortName || "This product";
      const direction = String(body.direction || "");
      try {
        let doc;
        if (body.fixture === true) {
          doc = fixtureCarousel({ productName, media, market: production.market });
          doc.direction = direction;
        } else {
          const { factoryScriptLlm, llmClient, FACTORY_ASTRA_MODEL } = await import("@/lib/llm");
          const { assertSpendAllowed } = await import("@/lib/spend-cap");
          const cfg = factoryScriptLlm(FACTORY_ASTRA_MODEL);
          assertSpendAllowed({ model: cfg.model, tokens: 2000 });
          const client = llmClient(cfg);
          const completion = await client.chat.completions.create({
            model: cfg.model,
            messages: [
              { role: "system", content: "You write one product carousel. Return JSON only. Do not invent a result or a customer story." },
              { role: "user", content: copyPrompt({ productName, market: production.market, locale: production.locale, direction, facts, media }) },
            ],
          });
          const raw = (completion.choices[0]?.message?.content || "").replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
          const parsed = parseCarouselCopy(raw, { media, facts });
          doc = { ...parsed, slides: parsed.slides.map((slide, index) => ({ ...slide, id: `slide-${index + 1}`, previous: null })), modelId: cfg.model, fixture: false, affiliateUrl: null, direction, previous: null };
        }
        const saved = storeCarousel(productionId, expectedRevision, doc, production.market);
        return NextResponse.json({ production: saved });
      } catch (err) {
        clearCarouselJob(productionId);
        throw err;
      }
    }
    if (op === "generate") {
      refuseFactoryGenerate(String(body.productionId || ""), Number(body.expectedRevision));
    }
    if (op === "save-benchmark-notes") {
      const beats = Array.isArray(body.beats) ? body.beats : [];
      const lines = Array.isArray(body.lines) ? body.lines : [];
      const benchmark = saveBenchmarkNotes({
        beats: beats.map((row) => {
          const beat = row as { id?: unknown; onScreenText?: unknown; uncertainty?: unknown; adapt?: unknown };
          return {
            id: String(beat.id || ""),
            onScreenText: String(beat.onScreenText || ""),
            uncertainty: String(beat.uncertainty || ""),
            adapt: String(beat.adapt || ""),
          };
        }),
        lines: lines.map((row) => {
          const line = row as { beatId?: unknown; structureOnly?: unknown };
          return { beatId: String(line.beatId || ""), structureOnly: String(line.structureOnly || "") };
        }),
      });
      return NextResponse.json({ benchmark });
    }
    return NextResponse.json({ error: "Unknown operation" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}
