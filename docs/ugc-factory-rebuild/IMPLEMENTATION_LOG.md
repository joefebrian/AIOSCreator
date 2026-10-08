# Implementation log

## M0 — discovery

Files: `docs/ugc-factory-rebuild/REPOSITORY_DISCOVERY.md`, this log, `DECISIONS.md`.

Benchmark copied to `data/media/UGC_Factory/benchmarks/joe-benchmark-2026-10-02.mp4`. Hash and duration recorded. No ASR.

Next: M1 catalog and board.

## M1 — catalog and board

Files:

- `apps/web/lib/ugc-factory-v2.ts`
- `apps/web/lib/ugc-factory-v2.check.ts`
- `apps/web/app/api/ugc-factory/v2/route.ts`
- `apps/web/app/create/ugc-factory/page.tsx`
- `apps/web/app/create/ugc-factory/legacy-board.tsx`

Check `npx tsx apps/web/lib/ugc-factory-v2.check.ts` passed: one idempotent production, a second market is a second production on the same SKU, USD is not rewritten as another currency, a legacy recipe id is rejected, a different piece count is a new SKU in the same family, three listings can sit on one SKU, confirming the listing and a fact moves only that production to Ready to plan, and a stale revision is rejected.

The page was opened on desktop and at 390px. Empty board, five market filters, and a create form with one market select (Indonesia default, language id-ID). Create was not submitted, so the live board stayed at 0 productions. No paid provider call.

## M2 — benchmark breakdown and structure

The benchmark is a visual-only review. Speech stays unknown because no ASR tool is installed. A first pass every 3 seconds missed beats, so later frames were taken at exact seconds. That is still not a detected cut list and it does not certify every frame.

What the file shows: an adult creator in a bedroom, a sealed hair styling and drying system, then one control and one attachment per beat, a result pose, a recommendation, and a platform end card. On-screen lines stay labeled as source captions. The structure lines are a 30-second pattern and do not repeat those claims. Campaign performance stays unknown. The operator has not accepted this file as a quality pass.

The five pilot recipes now show their asset constraints on the page. They are still not validated. This sample is outside the home-gadget and preschool-toy pilots, so it does not select or validate a recipe.

No production script was written during that pass. Astra, Jev, Wan, and Seedance were not called then.

## Workspace correction

The board was putting the full benchmark above an empty production list. The list is now directly under the market, status, and recipe filters. With no productions, Create Production sits in the first 1440×900 viewport. The full analysis opens from View Reference. A production opens in an overlay drawer with Facts, Decision, Script, Media, and Review, so the list does not reflow.

Create saves one draft for one SKU, one listing, one market, one locale, one placement, and a duration from 10 to 30 seconds. Listing bullets stay EXTRACTED until someone confirms them. A confirmed sentence is not footage.

Recipe eligibility is code. Zero feasible pilots store a blocked decision and do not call Jev. One feasible pilot is deterministic and does not call Jev. Two or more call Jev 1.13 and reject a choice outside that set. An operator selection is stored as an override. The five recipes stay pilots. Astra is called only after `writeFactoryPlan` finds no blockers, and the client is built inside that call. Approve does not submit a job. Generate refuses while there is no reviewed generation budget and does not call Wan or Seedance.

The live draft is the catalog Shark SpeedStyle HD331, Amazon.com, market US, locale en-US, 30 seconds, package "Default package", model B0C7YJ7WML. The listing was confirmed as that same catalog product. Seven listing lines are still extracted, not confirmed. The only asset on file is the catalog photo. The stored decision says Jev was not called. There is no plan and no video. A reload still shows that one production.

`ugc-factory-v2.check.ts` passed, including a fixture decider and a fixture writer. Those fixtures are not live Jev or Astra calls. No paid render was started.

## Product catalog revamp v1.2

Products owns the shared catalog. The importer is still `apps/web/lib/product-import.ts` through `POST /api/commerce/products`. Factory and Campaigns read the same SKU, listing, and destination ids from `data/db/shared-catalog.json`. `data/db/products.json` was not replaced.

The first catalog read copied `products.json` to `data/db/products.pre-shared-catalog.json` (66,114 bytes, same size). Deleting `shared-catalog.json` rebuilds provisional rows from `products.json`. The backup is not restored automatically.

Live migration: 18 products, 18 families, 18 SKUs, 18 listings, 18 legacy links, 15 destination versions. No product was split into five countries. Shark SpeedStyle HD331 (`265a992d-eb8f-4dd3-bada-cdfd5cd24ec4`, model `B0C7YJ7WML`) has one US Amazon listing. The shop URL has no query. The tracked URL is a separate version 1, review state UNVERIFIED, account empty. The catalog variant stays provisional.

The factory draft stayed one US, en-US, 30s production. Stage `NEEDS_FACTS`. Issue now says no pilot has the facts and assets it needs. The catalog photo is stored as media id `identity:` plus the factory SKU id. Decision remains blocked, model empty. No plan, no approval, no provider job. Jev and Astra were not called. Generate was not clicked.

`shared-catalog.check.ts` and `ugc-factory-v2.check.ts` passed from `apps/web`. The Jev and Astra branches are fixtures. Browser walk on 2026-10-02 used headless Edge at 1440×900 and 390×844. Screenshots are in `docs/ugc-factory-rebuild/v12/`. Write, Approve, and Generate were not clicked. No paid render was started.
