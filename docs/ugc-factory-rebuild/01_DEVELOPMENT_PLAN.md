# AIOSCreator UGC Factory — Rebuild Development Plan

Version 1.0 · 2 October 2026 · Owner: Joe

Target builder: Grok Build 0.2.112, Grok 4.7, xhigh.

Status: implementation proposal ready for repository discovery. This document describes required behavior; it does not assert that any route, database, provider credential, or job infrastructure already exists.

## 1. Product objective

Build a SKU-first UGC production system that produces a complete, realistic creator-style video suitable for affiliate distribution. The user's supplied sample video is the visual and editorial benchmark. Model quality alone is insufficient: product accuracy, useful actions, delivery, sound, continuity, and editing must be planned and reviewed together.

Commercial objective: improve affiliate contribution through relevant creative testing. Attention, clicks, attributed orders, and net commission are different measurements. No model score is a guarantee of virality or sales.

Initial categories:

- HomeGadget: kitchen preparation and cleaning tools. Organization products may be added through the same category registry after SKU validation.
- Preschool toys: large-piece building sets, compact pretend-play sets, and simple take-apart toys. Product age suitability must be checked for the exact SKU; 3–4 and 5–6 can have different play complexity.

The commercial toy audience is adult parents/caregivers and gift buyers. An adult creator with product demonstrations is the baseline casting approach. A child on camera is optional and requires an appropriate supplied asset and permission workflow; it is not necessary to communicate how the toy works.

## 2. Decisions that supersede older specifications

| Topic | This rebuild |
| --- | --- |
| Active markets | ID, MY, SG, TH, US. An older six-market setting is historical data, not the new creation default. |
| Active output | Complete vertical UGC videos. Slideshow and Fashion Motion remain separate existing features. |
| Recipe catalog | Five proposed pilot recipes, promoted to routine generation after real validation. Preserve the 33 legacy templates and their history without using them as the default selector pool. |
| Product organization | Product family → exact physical SKU → local marketplace listing. |
| Production unit | One production = one final video for one exact SKU, destination listing, market, primary locale, and placement. |
| Decision model | TypeSafe Jev 1.13 chooses a typed next-creative option from feasible recipes. |
| Creative planner | GPT 6 Astra is the configured writing/directing role. |
| Video execution | Seedance 2.5 and WAN 3.0/Prime through verified provider adapters. |
| Primary UX | Persistent My Productions board, contextual drawer, saved approvals, and stage-specific recovery. |
| Performance | Manual/CSV import in the first release. |
| Host integration | Reuse existing authentication, workspaces, asset/character services, storage, design system, and generation infrastructure when suitable. |

New Factory internals can be rebuilt behind a feature flag. Do not delete user data or rewrite unrelated modules to achieve a clean implementation. Make migration and rollback possible.

## 3. Product family, SKU, and local links

The same physical SKU may have listings in several markets and several marketplaces in one market. Region, seller, merchant product ID, merchant variant ID, price, commission, stock, and destination belong to the listing/offer layer.

Separate a SKU when the physical product, component count, size, color affecting the video, included accessories, regional hardware specification, or packaging contents differ. Packaging artwork itself must be captured in an appropriate local reference; if the package is materially different in the unboxing, use a listing-specific asset pack and record the difference.

SKU equivalence is explicit: proposed, verified, rejected. Never merge based on similar titles or model-written confidence. GTIN/model identifiers and actual images can support review; identifier matching alone does not establish every included accessory or current package.

Adding a link creates a candidate local listing and import snapshot. The operator can preserve the URL and supply facts/assets manually. A production cannot use unresolved package contents for an unboxing script or unresolved component states for an assembly script.

Do not require a link from all five countries before producing one video. Missing country listings leave that market unavailable for that SKU until a suitable destination is confirmed.

## 4. Market and platform configuration

| Market | Initial locale suggestion | Offer currency | Required separation |
| --- | --- | --- | --- |
| Indonesia | id-ID | IDR | Indonesian script, exact local listing, local commercial context. |
| Malaysia | ms-MY; en-MY selectable | MYR | Malay and English are separate voice/script choices. |
| Singapore | en-SG | SGD | Exact seller/package/offer for Singapore. |
| Thailand | th-TH | THB | Thai script, supported voice, font coverage, caption segmentation. |
| United States | en-US | USD | US listing, measurements, offer, and destination. |

These are application defaults proposed for the pilot, not claims that every provider supports every locale. Verify each combination in the provider/voice registry and in real media. A missing capability cannot silently switch the language.

Market, source marketplace, distribution platform, placement, locale, and seller account region are distinct fields. An Amazon listing can be a destination for a video published elsewhere; marketplace import support does not prove availability of a distribution/affiliate placement.

Reuse existing platform profiles where verified. TikTok, Reels/Meta, Shorts/YouTube, Shopee Video, and Demand Gen are selectable only to the extent the host supports and has verified their output/CTA requirements. A generic vertical export can be produced without claiming a platform-specific integration. No publishing connector is required for the first release.

Price and promotional details come from the chosen listing/offer snapshot. Currency substitution is prohibited. No conversion into a local checkout price from another market. Stale offers are refreshed, removed, or blocked before export.

## 5. Pilot recipe library

| Recipe ID | Product fit | Core arc | Minimum useful visual evidence |
| --- | --- | --- | --- |
| HOME_HANDS_DEMO | A household tool with a clear visible action | Action hook → usage → bounded result → next step | Exact product, action context, supported use, observable outcome. |
| HOME_CREATOR_DEMO | A practical purchase hesitation benefits from explanation | Creator concern → handling/demo → objection answer → CTA | Stable adult identity, exact product, inspectable feature/use. |
| HOME_UNBOX_FIRST_USE | Contents/setup are part of the buying decision | Reveal → included items → setup/use → practical close | Packaging, verified contents, setup states, working-use reference. |
| TOY_UNBOX_FIRST_PLAY | Pretend-play/simple ready-to-play toy | Reveal → contents → one concrete play episode → parent close | Packaging, pieces, realistic play action, product age evidence. |
| TOY_UNBOX_BUILD_PLAY | Large building set/simple take-apart toy | Reveal → selected assembly actions → completed object → play | Correct parts, intermediate states, completed build, feasible play. |

Reveal, build payoff, parent explanation, action-first, and objection-first are creative mechanisms within recipes. They are not a second incompatible template catalog.

Recipes specify audience tensions, supported actions, asset requirements, production difficulty, beat roles, edit rules, prohibited unsupported claims, and expected quality checks. They do not contain universal viral hooks or a fixed rhythm copied to every SKU.

Initial recipe status is PILOT. Explicit operator pilot productions can exercise these recipes after feasibility and plan review. Standard generation uses recipes promoted to ACTIVE after the real-media gate; do not claim that a seed configuration is already validated.

Extensions are data-driven and versioned. A new recipe needs an executable action model, adequate reference coverage, provider feasibility, and a passed pilot. It can remain experimental before being enabled for live selection.

## 6. Creative knowledge and benchmark analysis

The supplied Yapping Bible contains a completed English speech-led reference collection. Its source performance is unknown and its categories are skewed toward wellness/beauty. Use transferable narrative and delivery observations; create category-specific HomeGadget and preschool-toy playbooks.

Keep two layers:

1. Abstract creative guidance: tension, action, narrative structure, pauses, framing, and edit purpose.
2. Attributed source evidence: timestamps, transcript, observations, old claims/offers, limitations, and editorial status.

Do not import historical claims, endorsements, discounts, or personal experience into a new SKU. Preserve original runtime_eligible and editorial approval fields. Raw-source permissions are not changed by the new importer.

For each supplied benchmark:

- Record file identity, hash, duration, locale if known, and the intended role: quality benchmark or category reference.
- Extract timestamped speech through an actual ASR path. If ASR is unavailable, keep speech status unknown and complete visual work that is possible.
- Observe useful actions, camera/framing changes, first product appearance, object state changes, pauses, sound, on-screen text, and CTA.
- Distinguish semantic beats from camera shots. A continuous take may contain several beats; one beat may use multiple shots.
- Produce a reviewed breakdown with evidence time ranges, uncertainty, and the mechanism worth adapting.
- Record campaign performance as unknown unless supplied separately.

Do not rerun extraction of the completed 75-video corpus simply to initialize the new module. Reuse existing reports and resolve evidence only when needed.

## 7. Runtime roles

| Role | Responsibility | Boundary |
| --- | --- | --- |
| Application code | Filter feasibility; validate facts; calculate time, cost, metrics; handle state and jobs | All eligibility and budget constraints remain enforceable outside model prompts. |
| Jev 1.13 | Choose the next recipe/test mode from a defined feasible set | Text/structured state only; no direct video analysis or free-form script generation. |
| Astra creative planner | Write the angle, brief synthesis, script, beat/shot plan, performance direction, and edit plan | Must cite authorized fact/offer IDs and return the application contract. |
| Image/anchor service | Prepare verified visual anchors when source photos are insufficient | Reuse the host service/configuration; allow manual assets when no image provider is configured. |
| Seedance/WAN adapter | Generate feasible audiovisual takes/clips using locked references | Verify actual account model IDs, parameters, regions, and supported input modes. |
| ASR/vision observations | Observe dialogue, actions, defects, continuity, and timing | Missing/uncertain observations stay visible; model review is not human certification. |
| Compositor | Assemble selected takes, sound, text/captions, and final exports | Produces actual video files and media measurements. |
| Operator | Approve script/production plan and final video against product truth and benchmark | Approval is version-specific and persisted. |

The Grok 4.7 build model does not replace these runtime roles automatically.

Jev receives compact English decision summaries with original-language fact IDs preserved. Local script evaluation needs locale fixtures, especially Thai/Malay. Jev confidence is decision confidence, not predicted CTR, CVR, GMV, or probability of virality. Dependent choices are staged calls: choose recipe, then assemble the state for the chosen recipe and a separate hook/test choice if needed.

There is no customer fine-tuning or automatic retraining of Jev. Imported performance changes the application's decision context.

## 8. Production workflow and approvals

Default flow:

1. Select an exact SKU and local destination listing.
2. Choose market, locale, placement, target duration, creator mode, and production quantity.
3. Resolve product truth, assets, benchmark coverage, and provider feasibility.
4. Code computes feasible recipes; Jev selects a next-creative hypothesis or measured-context reuse option.
5. Astra creates one selected concept and timed script/shot plan. Optional text alternatives do not create new production cards automatically.
6. Prepare and review any required anchors, then review dialogue, actions, assets, creator/voice continuity, edit timing, and budget. Save approval on the exact revision hash with real referenced asset hashes.
7. Dispatch reference-based video generation with the approved inputs.
8. Review candidate takes and select usable media.
9. Assemble one full video; observe/mechanically inspect and review it.
10. Revise only affected dependencies; export the approved output.
11. Import actual campaign results and choose the next controlled variation.

One production defaults to one final video. A requested batch explicitly creates N production records; the UI previews the total before generation. Changing market, language, recipe, hook, or creator has an explicit experiment identity and affected production list.

At most one final render revision is active-approved per production. Historical approved versions remain traceable. New edits can coexist with an older approved export, but the new draft is not implicitly approved.

Before first approval, draft commercial context can be revised. After first plan approval, a different SKU, listing, market, locale, or placement creates an explicit new production with parent lineage. Script/shot/model repairs within that commercial context create revisions of the existing production.

## 9. Script, shot, audio, and edit requirements

Every beat has a viewer purpose. Every shot has concrete framing, camera behavior, product action, start/end object states, references, audio ownership, duration, and cut/hold reason.

Lock the SKU appearance and local packaging before any shot where they are visible. Use supplied product imagery, approved creator assets, or a prepared anchor; do not rely on an unconstrained text-only product recreation.

When an anchor or voice preview requires paid generation, expose an explicit bounded Prepare Assets/Preview action and record its attempts/costs before final video-plan approval. Reused/manual approved references do not require this action. Pending or unreviewed generated anchors cannot be treated as approved render inputs.

Assembly actions are modeled as state transitions: closed package → contents → partially assembled → completed → play. Avoid unobserved parts appearing, changing counts/colors, impossible hand contacts, or a finished toy that differs from the selected SKU.

Use an operation reference/manual or a verified action asset for precise mechanics. Generated visuals are illustrative; their timing/appearance does not establish independent efficacy or measured performance of the physical product.

Audio strategy is explicit:

- Native audiovisual take when provider/locale/voice/reference support is verified.
- A continuous voiceover track over demonstration footage when an existing configured voice service is suitable.
- Replacement narration only for appropriate shots; visible speech must remain synchronized.

Do not layer duplicate narration from native audio and external voiceover. Preserve useful object sounds and pauses. Caption timing comes from actual audio/ASR, not estimated English word counts. Native audio is extracted/validated like any other track.

A full-take render is allowed when one verified provider can execute the approved plan well. A clip assembly is allowed when it gives better control. The UI outcome and production count remain the same. Decide based on feasibility, continuity, budget, and demonstrated quality; do not split every sentence into a separate API request.

Default pilot duration is 30 seconds and vertical 9:16; both are proposal defaults and remain configurable within the output/provider profile. Provider max duration does not prove that one generated take will satisfy the benchmark.

## 10. UX specification

Preserve the UGC Generator navigation and the Factory entry point found in the repository. Reuse the host design system and existing approval patterns.

My Productions is the main screen:

- Compact production rows/cards: selected SKU, local market/locale, video preview/poster, stage, current issue, and one context-appropriate action.
- Search, category/market/recipe/status filters, selection, stable scroll, and controlled bulk actions.
- Counts show final productions, shot jobs, and attempts separately.
- Real stage progress rather than invented percentages when the provider supplies only status.
- Existing jobs remain visible after refresh or browser closure.

The contextual drawer contains product/listing truth, creative decision, script/shot plan, media candidates, and final review. Supporting sections can be tabbed within the drawer. Do not turn the main workflow into five separate linear pages.

Creation should ask for product and commercial context, not require the user to write model prompts. Additional instructions are optional. Provider details belong in relevant advanced settings and diagnostics; display them where they explain cost/capability/recovery.

Define and implement empty, importing, unconfirmed facts, missing assets, unsupported locale, provider unavailable, ready to generate, queued, running, partial success, failed, cancellation pending, cancelled, needs review, stale approval, and approved-export states.

Video review: playable 9:16 output, scrubber/timecoded issues, transcript/caption inspection, linked product facts, and replace-shot/revise-script actions. Compare against the benchmark where available. Never show an arbitrary stock video or a still montage as a successful UGC generation.

Escape closes the drawer and restores focus. Opening/closing it preserves the board filter, selection, and scroll. Batch failures can be recovered per item.

## 11. Architecture and host integration

Logical path:

Module API → workspace/auth/revision/idempotency checks → catalog/assets → creative planning → approval → orchestrator/outbox → durable worker/provider adapter → callback or poller → media ingestion → assembly → QC/review → export.

Bind provider submissions and output files to workspace, production revision, shot revision, attempt, and request hash. Use transactions/outbox or an equivalent host-supported durable handoff so a queued record cannot lose its job dispatch.

Persist all drafts, approvals, jobs, attempts, observations, selected media, costs, and output versions server-side. A browser process must not own the generation queue. Use the repository's suitable persistence layer; do not install a new database/queue framework before auditing what exists.

Capability registry records actual provider/model ID, modality, input modes, audio/voice/reference features, locale evidence, duration/aspect/resolution constraints, pricing version, verification timestamp, and retry/cancel semantics.

Credentials are server-side. Imported page/transcript content is treated as untrusted data. URL fetching requires bounded downloads and public-host protections; handle redirects and media fetches without exposing internal network resources or tokens.

Audit logs record operational events and decisions without storing secret headers. Signed media URLs are refreshed as needed; stable internal media IDs remain the reference.

## 12. Cost, retries, cancellation, and recovery

Each paid asset-preparation action and the approved video production plan reserves a bounded cost estimate. Include candidate takes and repair allowance in the video plan and retain earlier preparation costs in the production total. Estimate, reserved amount, reported actual cost, and unknown billing are separate states.

Code checks account capability, allowed models, remaining budget, approval revision, and idempotency before dispatch. It enforces attempt and candidate caps, concurrency, and backoff.

If a submission times out after possible provider acceptance, reconcile the existing request/attempt before creating another. Do not assume it failed and pay twice. Deduplicate callback and poller events.

Cancellation is best effort: stop undispatched work, request provider cancellation where supported, and reconcile any late completed media/cost. If an in-flight provider call is not cancellable, show that status accurately. A cancelled production cannot be auto-approved/exported by a late callback.

Model fallback is a reviewed capability/cost choice. Do not silently replace WAN Prime with standard or replace the selected locale/voice. Retry a failed attempt within the approved constraints; a materially different plan needs a new plan revision.

## 13. Performance and next-creative selection

CSV/manual records bind to production, final output hash/version, campaign, experiment, market, locale, platform, placement, listing, date window, distribution mode, and spend/source definitions.

Keep marketplace demand and creative performance in separate tables. A public sold counter with no time window is historical listing evidence; it is not 30-day sales velocity.

Compute rates only with the relevant known denominators. Missing attribution fields remain null. Preserve currency; compare monetary outcomes within the same currency/context or a separately disclosed conversion methodology.

Candidate selection uses comparable context and sufficient evidence. Code computes counts, uncertainty/sample labels, deterministic commercial metrics, and the feasible/test pool. Jev can choose a contextual reuse or exploration recipe from that pool.

Labels:

- Hypothesis: no measured campaign evidence.
- Tested: attributable measurements exist.
- Best observed in this context: leads a declared comparable set with the evidence shown.
- Insufficient evidence: missing denominators, weak sample, or incomparable distributions prevent a winning label.

Avoid a universal winning threshold. Sample minimums and objectives are versioned campaign rules, exposed in the decision rationale. An overall confidence score is not substituted for orders or net commission.

Net contribution subtracts known attributable media and production costs from commission where definitions and currency align. Report incompleteness when refunds, final commission, attribution, or costs are unavailable.

## 14. Milestones and exit conditions

### M0 — Repository discovery and integration map

Inspect applicable AGENTS.md, package manifests/locks, Factory routes, existing 33-template data, Product/Character/Asset services, provider clients, media tooling, persistence, workers, auth/workspaces, and relevant tests.

Inventory existing user changes without overwriting them. Record the actual Grok Build/model/effort configuration using available local diagnostics; do not assume flags or upgrade the CLI.

Create a repository report, route/service mapping, schema migration proposal, provider capability inventory, available benchmark list, and implementation log. Verify whether a real multimodal reviewer/ASR and image/voice path exists. Never read secret values into reports.

Exit: actual paths and suitable reused services are identified; missing capabilities have specific blockers/fallbacks. Continue to reversible implementation within scope.

### M1 — Catalog and persistent Production Board

Implement family/SKU/listing/offer/asset separation, manual/import snapshot review, explicit equivalence, five-market registry, production draft CRUD, saved board state, and feature-flagged navigation.

Provide a functional manual-input route before broadening importer integrations. URL import uses existing verified connectors; unsupported/failing links preserve the draft and show precise fallback.

Exit: one exact SKU can have several verified local listings; a different package becomes a different SKU; a draft survives refresh; existing modules/history remain intact.

### M2 — Benchmark analyzer and recipe registry

Register supplied benchmarks and inspect visuals/speech through available tooling. Create reviewed breakdown records and the five recipe/category playbooks. Integrate abstract Bible guidance with source/version separation.

Mark category gaps and experimental recipes honestly. The initial user benchmark can establish a quality target without establishing category sales performance.

Exit: each pilot recipe has asset/action constraints and an editable breakdown/playbook; source performance remains unknown; evidence uncertainty is visible.

### M3 — Jev selector and Astra brief/concept planning

Implement deterministic eligibility filtering, pinned Jev adapter, typed validation, source-aware context builder, decision logs, explicit exploration/reuse, low-confidence review, and one selected concept per production.

Integrate Astra through the existing configured model service; build the new brief/output schemas and fact/offer audit. No guessed model ID or fabricated production facts.

Exit: wrong-category/unavailable recipes cannot be selected; absent evidence yields a hypothesis; blocked model access is a real blocked state; manual recipe selection records an operator override.

### M4 — Script, shots, anchors, audio, edit plan, and approval

Generate timed semantic beats and executable camera shots; map dialogue/actions/facts; freeze creator/product/voice references; choose audio and render strategy; calculate estimate; validate duration and dependencies.

Support plan/script editing, missing-asset resolution, voice preview when configured, still/anchor preparation, and persisted version-specific approval.

Exit: a complete approved plan covers the requested duration, actual product actions, and feasible audio/visual inputs. Changing meaningful input invalidates the dependent approval.

### M5 — Durable rendering with real adapters

Implement orchestration/outbox or host equivalent, bounded attempts, capability validation, cost reservation, request hashing, durable callbacks/polling, ingestion, cancellation, and partial recovery.

Run tests against deterministic provider fixtures first. Add live adapter connectivity using actual account configuration. Do not mark fixtures as real generation.

Exit: a real generation attempt can be submitted, observed, ingested, and recovered without duplicate charge; unsupported requests block before submission. If credentials are unavailable, complete offline paths and report the live gate as blocked.

### M6 — Assembly, review, repairs, and benchmark acceptance

Assemble selected media into a full video; handle audio, captions, object sound, cuts, verified CTA, and final metadata. Review the rendered result, not only provider metadata.

Add per-shot repair and downstream invalidation. Export actual MP4 plus metadata/manifest. Run the pilot described in 04_ACCEPTANCE_AND_BENCHMARK.md with configured budget and operator-triggered generation.

Exit: real HomeGadget and toy outputs pass technical checks and human product/realism review against the supplied benchmark. Missing real clips or review evidence prevents a quality-pass claim.

### M7 — Performance import, controlled variations, and release hardening

Implement schema-validated CSV/manual import, attribution/version matching, idempotent updates, metrics with honest nulls, comparable-context reporting, experiment variables, and explicit variation creation.

Exercise locale/market paths, accessibility/responsiveness, workspace isolation, race/recovery scenarios, and migration/rollback. Ship a runbook and evidence report.

Exit: records can influence the next creative decision without turning missing data into a winner; the complete software/live-media acceptance matrix has actual statuses.

## 15. Completion reporting

Keep docs/ugc-factory-rebuild/IMPLEMENTATION_LOG.md current with milestone, files changed, checks and results, unresolved blockers, and the next executable action.

Keep docs/ugc-factory-rebuild/DECISIONS.md for repository-driven choices, exact model mappings, schema migration, and any necessary deviations from this plan. Update only project-scoped files; preserve existing AGENTS.md.

At each milestone report outcome, validation, remaining concern, and next step. Continue authorized reversible work without requesting approval for routine choices. Missing credentials or spend authorization blocks only dependent live operations.

The final build report separates:

1. Software checks passed.
2. Live provider connectivity and media generation verified.
3. Benchmark quality accepted by the operator.
4. Actual campaign performance, if supplied.

Deployment, publishing, and paid test runs must use their explicit authorized workflow; development completion is not permission to publish or run an unbounded campaign.

## 16. Documentation grounding

Checked 2 October 2026. Recheck parameter-level documentation during implementation because API support can change.

| Source | What it establishes |
| --- | --- |
| https://x.ai/build/changelog | Grok Build 0.2.112 exists; this package does not require later-version features. |
| https://docs.x.ai/developers/grok-4-7 | Grok 4.7 supports xhigh; build/runtime roles still remain separate application choices. |
| https://docs.typesafe.ai/models | Versioned Jev ID, text-only input, independent question evaluation, and request-based customization. |
| https://docs.typesafe.ai/primitives/choice | Fixed-choice request/response shape and decision confidence. |
| https://docs.typesafe.ai/api | Current TypeSafe HTTP contract; validate rather than assuming free-form LLM behavior. |
| https://seed.bytedance.com/en/seedance2_5 | Seedance 2.5 audiovisual/reference direction and up-to-30-second generation capability. |
| https://www.alibabacloud.com/help/en/model-studio/video-generate-edit-model | WAN 3.0/Prime model names and reference/audio capability direction. |
| references/AIOSCreator_UGC_Yapping_Bible_v1.0.md | Abstract creative guidance, unknown source performance, and corpus boundaries. |
| references/AIOSCreator_Yapping_Astra_Implementation_Guide.md | Product-fact authority, attributed references, output validation, and unchanged source approval policy. |

Public model capability does not establish access through this application's provider/account. Provider schema and account verification is a live-build requirement.
