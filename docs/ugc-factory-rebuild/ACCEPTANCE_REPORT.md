# Acceptance report

Software, live providers, benchmark quality, and campaign results are separate.

| Gate | Status |
| --- | --- |
| Software: one production, one SKU, several listings, currency not converted, duration 10–30, plan blocked before a writer, fixture choice rejected when outside the feasible set | Passed in `ugc-factory-v2.check.ts` on a temp database. The Jev and Astra branches in that file are fixtures and are labeled as fixtures |
| First viewport | Desktop 1440×900 shows the production list under the filters. Empty state and Create Production were inside that viewport before the draft existed. Recipe names are not clipped |
| Live draft | One production: Shark SpeedStyle HD331, US, en-US, 30s, listing verified, listing lines still extracted. It was still there after reload |
| Live Jev | Not called. The feasible set was empty, and the saved decision says so |
| Live Astra | Not called. Write with Astra stays disabled. The stored plan is empty |
| Live Wan / Seedance | Not called. Generate is refused without a reviewed budget. No provider job was submitted |
| Benchmark breakdown | Visual only. Speech unknown. Not an operator quality pass. It is not shown as this production's video |
| Campaign performance | Unknown. No CSV imported |
| Real-media quality | Not reviewed. There is no generated video |
| Measured commercial results | None |

## v1.2 catalog walk, 2026-10-02

The HTML prototype checks are not evidence for this app. The rows below are the running app.

| Gate | Status |
| --- | --- |
| Software catalog | `shared-catalog.check.ts` passed on a temp directory. No live product was merged or cloned into five countries |
| Software factory | `ugc-factory-v2.check.ts` passed on a temp directory. Fixture Jev and fixture Astra are labeled in the output. A verified listing was not downgraded. A production with no recipe stays `NEEDS_FACTS` |
| Live migration | `products.pre-shared-catalog.json` matches `products.json` at 66,114 bytes. `shared-catalog.json` has 18 SKUs and 18 listings. SpeedStyle has one US listing |
| Live draft | One production, US, en-US, 30s, reloaded. Shop URL and tracked URL are different fields. No second video was created |
| Live Jev | Not called. No pilot is feasible. The saved decision says so |
| Live Astra | Not called. The script tab says Astra was not called. Write was not clicked |
| Live provider and video | Not started. Approve and Generate were not clicked. There is no reviewed generation budget and no provider job |
| Affiliate destination | SpeedStyle tracked URL is version 1, UNVERIFIED, no account id. It was not invented and was not applied to other countries |
| Real-media quality | Not reviewed. No generated file |
| Commercial performance | Unknown |
