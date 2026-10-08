import { after, NextResponse } from "next/server";
import { parseCreatorLook } from "@/lib/factory-native-audio";
import {
  asDuration,
  asRatio,
  clampVolume,
  emptyWizardDraft,
  isWizardHook,
  type WizardDraft,
} from "@/lib/factory-wizard";
import {
  attachUploadedStill,
  beginCreatorStill,
  beginWizardClips,
  listWizardProducts,
  loadWizardSheet,
  renderCreatorStill,
  renderWizardClips,
  SpendCapError,
  wizardMarkets,
  writeWizardDialog,
} from "@/lib/factory-wizard-run";
import { latestWizardDraft, patchWizardDraft, readWizardDraft } from "@/lib/factory-wizard-store";

export const runtime = "nodejs";
export const maxDuration = 1800;

function fail(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const status = err instanceof SpendCapError ? 402 : 400;
  return NextResponse.json({ error: message }, { status });
}

export async function GET() {
  return NextResponse.json({
    products: listWizardProducts(),
    markets: wizardMarkets(),
    draft: latestWizardDraft(),
  });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const op = String(body.op || "");
  try {
    if (op === "sheet") {
      const sheet = loadWizardSheet(String(body.catalogProductId || ""), String(body.market || "MY"), String(body.locale || ""));
      return NextResponse.json(sheet);
    }
    if (op === "save") {
      const id = String(body.id || "").trim();
      if (!id) return NextResponse.json({ error: "Draft id required." }, { status: 400 });
      const current = readWizardDraft(id) || emptyWizardDraft(id);
      const market = String(body.market || current.market || "MY");
      const locale = String(body.locale || current.locale || "");
      const catalogProductId = String(body.catalogProductId ?? current.catalogProductId);
      const productChanged = Boolean(catalogProductId && catalogProductId !== current.catalogProductId);
      let look = current.look;
      if (body.look === null) look = null;
      else if (body.look && typeof body.look === "object") look = parseCreatorLook(body.look as WizardDraft["look"]);
      const hook = isWizardHook(String(body.hook || "")) ? String(body.hook) : current.hook;
      const saved = patchWizardDraft(id, {
        catalogProductId,
        market,
        locale,
        listingId: String(body.listingId ?? current.listingId),
        productImageUrl: productChanged ? "" : String(body.productImageUrl ?? current.productImageUrl),
        dialog: productChanged ? "" : String(body.dialog ?? current.dialog).slice(0, 400),
        hook: hook as WizardDraft["hook"],
        look,
        volume: clampVolume(Number(body.volume ?? current.volume)),
        durationSec: asDuration(Number(body.durationSec ?? current.durationSec)),
        ratio: asRatio(String(body.ratio || current.ratio)),
        ...(productChanged ? { clipJobIds: [], clipError: "" } : {}),
      });
      if (catalogProductId) {
        try {
          const sheet = loadWizardSheet(catalogProductId, saved.market, saved.locale);
          const listing = sheet.listings.find((row) => row.id === saved.listingId) || sheet.listings[0];
          const image = sheet.images.find((row) => row.url === saved.productImageUrl) || sheet.images[0];
          const next = patchWizardDraft(id, {
            locale: sheet.locale,
            listingId: listing?.id || "",
            productImageUrl: image?.url || "",
          });
          return NextResponse.json({ draft: next, sheet });
        } catch (err) {
          return NextResponse.json({ draft: saved, sheetError: err instanceof Error ? err.message : String(err) });
        }
      }
      return NextResponse.json({ draft: saved });
    }
    if (op === "write-dialog") {
      const id = String(body.id || "");
      const draft = readWizardDraft(id);
      if (!draft?.catalogProductId) return NextResponse.json({ error: "Choose a SKU first." }, { status: 400 });
      const written = await writeWizardDialog({
        catalogProductId: draft.catalogProductId,
        market: draft.market,
        locale: draft.locale,
        hook: draft.hook,
        durationSec: draft.durationSec,
      });
      const saved = patchWizardDraft(id, { dialog: written.dialog, locale: written.locale });
      return NextResponse.json({ draft: saved, ...written });
    }
    if (op === "creator-still") {
      const draft = readWizardDraft(String(body.id || ""));
      if (!draft) return NextResponse.json({ error: "Save the draft first." }, { status: 400 });
      const started = beginCreatorStill(draft);
      after(async () => {
        await renderCreatorStill(started.job.id, draft.id, started.prompt, started.ratio);
      });
      return NextResponse.json({ draft: started.draft, job: started.job }, { status: 202 });
    }
    if (op === "attach-still") {
      const saved = attachUploadedStill(String(body.id || ""), String(body.url || ""));
      return NextResponse.json({ draft: saved });
    }
    if (op === "generate") {
      const draft = readWizardDraft(String(body.id || ""));
      if (!draft) return NextResponse.json({ error: "Save the draft first." }, { status: 400 });
      const started = await beginWizardClips(draft);
      after(async () => {
        await renderWizardClips({
          draftId: draft.id,
          jobs: started.jobs,
          person: started.person,
          product: started.product,
          locale: started.locale,
          ratio: started.ratio,
          durationSec: started.durationSec,
        });
      });
      return NextResponse.json({
        draft: started.draft,
        jobs: started.jobs.map((job) => job.id),
        estimateUsd: started.estimateUsd,
      }, { status: 202 });
    }
    return NextResponse.json({ error: "Unknown wizard op." }, { status: 400 });
  } catch (err) {
    return fail(err);
  }
}
