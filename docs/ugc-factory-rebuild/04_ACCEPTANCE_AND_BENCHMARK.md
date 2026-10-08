# Acceptance Matrix and Benchmark Protocol

This is a build/release verification plan, not a record of completed tests. The implementing builder must fill actual results, evidence, and blockers.

## 1. Evidence levels

| Level | What passes it | What it does not establish |
| --- | --- | --- |
| Software | Relevant unit/integration/E2E checks against durable state and deterministic provider fixtures | Real model access or realistic video quality. |
| Live integration | Actual account/model submission, status, ingested media, accurate attempts/cost handling | Benchmark acceptance or sales performance. |
| Video quality | Complete real output reviewed against exact SKU truth and the supplied benchmark | Virality, conversion, or commercial lift. |
| Commercial | Attributed, comparable campaign records with definitions and adequate sample | Causal lift without an appropriate experimental design. |

A screenshot of the UI, a provider success response, or a placeholder MP4 cannot replace the required evidence level.

## 2. Software acceptance scenarios

| ID | Scenario | Required result |
| --- | --- | --- |
| C01 | One exact product has verified ID/MY/US listings | Shared canonical SKU, separate listing/offer/package-reference records. |
| C02 | Similar title, different component count/accessories | Separate SKU or rejected equivalence; no silent merge. |
| C03 | Product exists only in ID | ID production works; other markets show missing listing without blocking the whole catalog. |
| C04 | Two sellers in one country | Operator selects the exact destination; prices/commission never combine. |
| C05 | URL import fails or source requires unavailable access | URL/draft retained; manual facts/assets path remains functional. |
| C06 | Wrong-variant image mixed into import | Conflict requires correction before relevant unboxing/use plan approval. |
| C07 | Public sold counter has no date window | Stored as period-unknown evidence; never ranked as 30-day velocity. |
| C08 | USD listing assigned to MY offer | Currency/destination mismatch blocks or is explicitly reviewed as a cross-border case. |
| C09 | Seller title claims age/certification | Extracted source evidence, not automatic age/conformity approval. |
| C10 | Imported description contains an operational instruction | Treated as data; cannot change planner rules or call tools. |
| D01 | No measured creative history | Selection labeled HYPOTHESIS/EXPLORE. |
| D02 | Jev selects an option outside feasible criteria | Response rejected; no render. |
| D03 | Jev gives high confidence with no sales data | Confidence shown separately; no winning/viral probability label. |
| D04 | Recipe needs an absent assembly reference | Filtered out or blocked until the asset/preparation path is resolved. |
| D05 | One remaining feasible recipe | Deterministic selection clearly logged; no fabricated Jev response. |
| D06 | Jev timeout/malformed payload | Recoverable decision failure; manual eligible choice possible with audit. |
| D07 | Dependent hook choice after recipe choice | Second call uses the actual selected recipe state. |
| D08 | Raw corpus records have false/pending runtime flags | Import preserves them; abstract guidance remains a separate reference layer. |
| S01 | Reference includes historical discount/testimonial | New script excludes it unless the actual campaign supplies authorized evidence. |
| S02 | Generated adult says an unsupplied child/use-history claim | Validation flags it; rewrite as current observation or supported information. |
| S03 | Script cites valid facts but contains another uncited number | Uncited assertion still flagged; fact audit alone does not pass. |
| S04 | Assembly script changes a part/color/count | State/identity issue blocks the affected plan. |
| S05 | Script overruns measured voice preview | Revise content/timing; no clipped final dialogue or unreviewed speed-up. |
| S06 | Thai speech/caption handling uses English spacing | Locale test fails; require appropriate segmentation/font review. |
| S07 | Meaningful plan/voice/asset/offer edit after approval | New revision and dependent approval invalidation. |
| S08 | Concurrency edits an older revision | Recoverable version conflict; no lost update. |
| S09 | Approve a complete current video plan | READY_TO_GENERATE, no implicit video submission; explicit Generate checks current approval and budget. |
| J01 | Generate clicked twice concurrently | One effective orchestration submission/attempt and reservation. |
| J02 | Worker crashes after durable enqueue | Job resumes; production does not remain orphaned queued. |
| J03 | Provider acceptance followed by network timeout | SUBMISSION_UNKNOWN/reconciliation; no blind second charge. |
| J04 | Callback repeated and poller also completes | Single terminal attempt, one ingested result identity, deduplicated ledger. |
| J05 | Late event tries to change terminal status | State does not regress; event retained for audit if relevant. |
| J06 | Browser closes during generation | Backend job continues; board restores real status after reopening. |
| J07 | One shot fails in an otherwise usable production | Completed media retained; retry only affected dependency. |
| J08 | Unsupported locale/reference/duration parameter | Blocked before billable submission with specific recovery action. |
| J09 | Budget exhausted by a failed candidate | New attempt blocked; cost includes the billed failure. |
| J10 | Actual billing is not yet known | Unknown billing shown; not written as zero charge. |
| J11 | Cancel with in-flight non-cancellable provider | Accurate pending/in-flight status; no false immediate refund/completion. |
| J12 | Provider finishes after cancellation | Safe ingestion/cost reconciliation; no automatic approval/export. |
| J13 | Alternate provider/model proposed | Capability/cost/plan revision rules apply; no silent model/voice substitution. |
| J14 | User-owned IDs from another workspace | Authorization fails before data access, dispatch, or export. |
| E01 | Provider metadata says success, file missing/unreadable | No quality pass; ingestion/media check failure. |
| E02 | Native speech plus external narration overlaps accidentally | Audio ownership issue; repair before final approval. |
| E03 | Price expires after render | Spoken/text offer repaired or export blocked; metadata deletion is insufficient. |
| E04 | Repair one shot with changed audio length | Relevant timeline/captions/QC/final approval invalidated; unaffected media reusable. |
| E05 | New final revision produced | Older reviewed file remains traceable; new file requires its own approval. |
| E06 | Unresolved critical identity/claim/destination defect | Cannot approve final/export until corrected. |
| P01 | Import same performance CSV twice | Idempotent update/no duplicated totals. |
| P02 | Cumulative snapshots for the same ad/source | Stored/reconciled as snapshots; never summed as increments. |
| P03 | Overlapping period totals | Conflict/comparison handling; no blind aggregation. |
| P04 | Missing orders/spend/refunds | Null/unknown; no fictitious conversion or net contribution. |
| P05 | Zero or missing denominator | Rate is null with reason. |
| P06 | Wrong final hash, listing, locale, or market | Import rejected/staged as conflict; not applied to decision context. |
| P07 | High views, weak attributed contribution | Commercial ranking follows declared objective and evidence; views alone do not win. |
| P08 | MY/US or paid/organic results mixed | Context-separated comparison and visible evidence limitations. |
| P09 | Multiple variables changed at once | Labeled exploratory; no claim that one hook caused the outcome. |
| U01 | Open/close drawer from filtered/scrolled board | Filter, scroll, selection, and focus restore. |
| U02 | Batch has mixed success/block/failure | Per-item status and recovery; output count remains explicit. |
| U03 | Create one production with five supported markets in registry | One selected market produces one video; no hidden multiplication. |
| U04 | Responsive board, drawer, keyboard, loading/error states | Essential actions remain accessible across desktop/tablet/mobile. |
| U05 | Existing template/fashion/character histories | Preserved with correct original ownership and state. |
| U06 | Fixture render in development | Clearly labeled development fixture; cannot be exported as live benchmark evidence. |

Implement meaningful tests at the actual service/state boundaries. Prefer a small high-value E2E set over duplicate tests mirroring every UI component.

## 3. Golden fixtures and real pilot inputs

Software fixtures:

- Synthetic HomeGadget with one known action, approved facts, local listings, a stale offer, and an unavailable model binding.
- Synthetic large-piece building set with two deliberately incompatible package variants.
- Synthetic pretend-play set with no authentic creator/child history.
- Five market/locale configurations, including Thai text and a missing voice capability.
- Provider fixtures for success, duplicate callback, ambiguous acceptance, permanent error, partial result, and late completion after cancel.

All synthetic facts/media/results are marked fixture data. They are not sourced SKU recommendations, manufacturer evidence, or actual campaign performance.

Real pilot:

| Physical SKU | Recipes to assess | Reference requirements |
| --- | --- | --- |
| One verified HomeGadget; chopper is a candidate | HOME_HANDS_DEMO, HOME_CREATOR_DEMO, HOME_UNBOX_FIRST_USE | Exact product/packaging, operation, supported use outcome, adult identity if used. |
| One verified large-piece building set | TOY_UNBOX_BUILD_PLAY | Contents, assembly states, completed model, age evidence, actual play mechanism. |
| One verified compact pretend-play set | TOY_UNBOX_FIRST_PLAY | Contents, age evidence, plausible play episode, parent-buyer brief. |

To call all five recipes validated, assess at least one complete real output for each recipe. This is five base outputs across three physical SKUs, not five SKUs. Additional candidates/repairs follow the approved cost cap.

Choose the baseline market from available verified listings and language capabilities; Indonesia is a reasonable initial operational default, not a claim that its results generalize.

For full five-market readiness, complete at least one real local-language output per market using a verified local SKU/listing and compatible recipe. If the base outputs use one market, this requires four additional market outputs. Reuse references when the physical product matches; do not reuse mismatched packaging/contents.

This protocol proposes test coverage. It does not authorize automatic paid batch generation. Live tests use the application's explicit Generate action and a reviewed budget. A release may be reported as partial/pilot where a locale or recipe has not passed the live gate.

## 4. Benchmark preparation

Use the user's designated sample as the quality benchmark. Identify the actual file rather than assuming similarly named historical uploads are identical.

Record:

- source filename, internal asset ID, SHA256, actual duration/dimensions/audio streams;
- source role: visual/editorial benchmark or product-action reference;
- reviewed timecoded first frame, reveal, useful actions, dialogue/pause, framing/cut reasons, object sound, caption style, and CTA;
- ASR/transcript availability and uncertainty;
- source performance supplied or unknown;
- aspects transferable to the new SKU and aspects that must remain source-specific.

Keep a visual-only breakdown labeled visual-only if speech was not observed. Use full-timeline samples plus targeted intervals for questionable actions; sampled vision does not certify every frame.

No universal cut-every-two-seconds rule. No universal voice rate imported from the English reference corpus. The important comparison is whether the viewer can follow a useful action and the creator's delivery comfortably.

## 5. Technical final-video checks

Default pilot output profile proposal: 30-second, vertical 9:16 MP4, with compatible codec/audio settings from the host export profile. Prefer 1080 × 1920 where the verified pipeline supports it. Record actual source resolution and any upscale; upscale does not prove detail quality.

Verify:

1. File exists, decodes throughout, and has a stable hash.
2. Duration conforms to the approved plan/output profile within declared frame/container tolerance.
3. Aspect ratio, dimensions, frame rate, video/audio streams, and codec match the export profile.
4. No missing segments, unintended freeze/black frames, clipped words, duplicate narration, destructive sound changes, or broken synchronization.
5. Caption/overlay bounds stay inside the intended safe area and match actual speech/facts.
6. Destination/offer/market metadata matches the video and is current enough for the profile.

Checks identify anomalies with time intervals; they do not claim naturalness by themselves.

## 6. Human quality rubric

Score each dimension from 0 to 4. This is an internal acceptance rubric proposed for the pilot, not a statistically validated commercial predictor.

| Dimension | What to inspect |
| --- | --- |
| Product fidelity | Exact silhouette/color/parts/packaging, labels that matter, completed product matches the selected SKU. |
| Physical action | Hands contact objects correctly; opening, connecting, cutting, moving, and playing are plausible. |
| Continuity | Creator/product/voice/state/lighting remain coherent through intentional edits. |
| Delivery and sound | Natural thought units, appropriate pauses, clear locale/pronunciation, useful object sound and synchronized speech. |
| Editorial clarity | A clear reason to watch, inspectable action/payoff, cuts with purpose, readable text, proportionate CTA. |

Score anchors:

- 0: unusable or missing.
- 1: major defects distract or mislead.
- 2: usable portions, but obvious issues need repair.
- 3: credible and clear, with minor acceptable limitations.
- 4: strong fit to the benchmark and product brief.

Proposed pass: at least 3 in each dimension, no unresolved critical identity/claim/destination defect, and an explicit operator acceptance of the actual file. A high average cannot hide a wrong product or impossible assembly.

For every failed criterion record a timecode, affected shot, evidence, and repair action. Preserve both the first attempt and the accepted revision so the quality change is reviewable.

## 7. Benchmark scorecard record

~~~json
{
  "production_id": "actual production",
  "output_id": "actual output",
  "output_sha256": "actual hash",
  "sku_id": "actual exact SKU",
  "listing_id": "actual local listing",
  "recipe_id": "selected recipe",
  "market": "ID",
  "locale": "id-ID",
  "benchmark_asset_id": "actual user benchmark",
  "software_checks": "NOT_RUN",
  "live_integration": "NOT_RUN",
  "human_quality": "NOT_REVIEWED",
  "scores": {
    "product_fidelity": null,
    "physical_action": null,
    "continuity": null,
    "delivery_sound": null,
    "editorial_clarity": null
  },
  "timecoded_issues": [],
  "observed_media_specs": null,
  "attempt_ids": [],
  "known_costs": [],
  "billing_status": "UNKNOWN",
  "operator_id": null,
  "reviewed_at": null,
  "campaign_performance": "UNKNOWN"
}
~~~

Replace placeholders only with observed values. Do not prefill pass statuses or quality scores from the plan.

## 8. Release report

The builder's release report must include:

- milestone and acceptance IDs passed/failed/blocked, with reproducible checks;
- actual provider/model/locale access and media identity;
- the reviewed benchmark and real pilot scorecards;
- known cost/cancellation/retry limitations;
- recipe and market readiness, including partial readiness;
- migration/rollback and operator recovery steps;
- performance import capabilities and the fact that commercial outcomes remain unknown until measured.

Development completion with live gates blocked is a specific status, not full-quality completion. Leave the implementation usable and identify the exact remaining dependency.
