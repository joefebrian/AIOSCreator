# UGC Factory — Technical Contracts

These are proposed application contracts. Adapt names and routes to the actual host repository while preserving behavior. Use the host schema-validation library and persistence conventions; examples are not a mandate to introduce a new TypeScript stack.

## 1. Entity map and invariants

| Entity | Required content | Invariant |
| --- | --- | --- |
| ProductFamily | Category/subcategory, commercial use, play/use mechanism, display label | Shared family is not proof of identical physical products. |
| CanonicalSku | Physical variant, model/identifier if known, component count, included items, appearance references, age/evidence where relevant | Every product fact and shot reference resolves to the exact SKU. |
| MarketplaceListing | SKU link, market, marketplace, seller, URL, merchant IDs, equivalence state, availability evidence | Several listings may bind to one verified SKU. |
| ListingSnapshot | Imported/manual field candidates, observed_at, extractor version, evidence refs, confirmation state | Snapshots are immutable; corrections create revisions. |
| OfferSnapshot | Exact listing, currency, price/promo/commission terms, validity, source, confirmation | Dynamic offer fields cannot leak between listings/markets. |
| TruthPack | Authorized facts/claims, explicit unknowns, prohibited claims, intended-use/age evidence | A user confirming a source does not create missing scientific/performance evidence. |
| Asset | Internal media ID, kind, hash, source/provenance, rights/consent state, SKU/creator/state labels | Transient external URLs are not stable identity. |
| Benchmark | Media identity, quality/category role, observed breakdown, uncertainty, optional performance metadata | Reference quality and campaign performance are separate. |
| CategoryPlaybook | Adult buyer tensions, supported actions, difficulty, assets, factual limitations | Category guidance cannot override exact SKU facts. |
| RecipeVersion | Allowed category/mechanisms, required states/assets, beat roles, quality checks, active/experimental status | A production pins the version used. |
| Production | Exact SKU/listing, market/locale/placement, objective, budget, current revision | One final video; no implicit five-market multiplication. |
| CreativeDecision | Candidate set, constraints, context/evidence IDs, selected recipe, source, model/version, confidence, test mode | Decision confidence is not measured ad performance. |
| ScriptRevision | Concept, narrative beats, dialogue/captions, facts/offers, source references, unknowns | Only authorized product facts may be asserted. |
| PlanRevision | Shot plan, object states, bindings, audio strategy, render strategy, edit plan, estimate | Approval binds the full effective plan hash. |
| Approval | Scope, revision hash, actor, time, review result | Editing a dependency invalidates the corresponding new draft approval. |
| RenderAttempt | Provider/model, request hash, idempotency key, inputs, job ID/status, costs, output IDs | One attempt can have many events; it is not many paid submissions. |
| FinalOutput | Media hash/specs, source takes, assembly version, QC report, approval, export manifest | APPROVED requires a real reviewed file. |
| Experiment | Primary variable, control/comparison set, context, metric definitions | Multi-variable tests are exploratory and cannot isolate one causal variable. |
| PerformanceRecord | Final output identity, source, windows/denominators/attribution/currency, record kind | Null is unknown; duplicate imports do not increase totals. |

All user-owned rows and assets require workspace ownership, authorization, and scoped foreign-key checks. System recipe defaults may be shared read-only; workspace overrides and private references must remain scoped.

Unique identity is workspace-scoped. A merchant product ID does not become the canonical SKU ID, and a reusable asset hash does not bypass ownership checks.

## 2. Catalog contract

~~~typescript
type Market = "ID" | "MY" | "SG" | "TH" | "US";
type Equivalence = "PROPOSED" | "VERIFIED" | "REJECTED";
type FactState = "EXTRACTED" | "CONFIRMED" | "CONFLICTED" | "EXPIRED";
type ClaimState = "NEEDS_EVIDENCE" | "SUPPORTED" | "REJECTED";
type SourceLevel =
  | "LISTING"
  | "MANUFACTURER"
  | "SUPPLIED_TEST"
  | "OPERATOR_OBSERVATION";

interface CanonicalSku {
  id: string;
  workspace_id: string;
  family_id: string;
  revision: number;
  physical_signature: {
    model_id: string | null;
    gtin: string | null;
    variant_label: string;
    color: string | null;
    dimensions: Record<string, string> | null;
    component_count: number | null;
    included_items: Array<{ item: string; quantity: number | null }>;
    region_hardware_variant: string | null;
  };
  product_reference_asset_ids: string[];
  age_evidence_ids: string[];
  market_suitability_evidence_ids: string[];
}

interface MarketplaceListing {
  id: string;
  workspace_id: string;
  canonical_sku_id: string;
  market: Market;
  marketplace: string;
  seller_id: string | null;
  source_url: string;
  canonical_url: string | null;
  merchant_product_id: string | null;
  merchant_variant_id: string | null;
  equivalence: Equivalence;
  equivalence_evidence_ids: string[];
  confirmed_by: string | null;
  confirmed_at: string | null;
  local_packaging_asset_ids: string[];
  availability: "UNKNOWN" | "AVAILABLE" | "UNAVAILABLE";
  availability_observed_at: string | null;
}

interface ApprovedFact {
  id: string;
  canonical_sku_id: string;
  listing_id: string | null;
  statement: string;
  value: string | number | boolean | null;
  unit: string | null;
  state: FactState;
  source_level: SourceLevel;
  evidence_ids: string[];
  allowed_wording: string[];
  restrictions: string[];
  confirmed_by: string | null;
  confirmed_at: string | null;
  expires_at: string | null;
}
~~~

Validate all IDs, ownership, integer quantities, units, provenance, and referenced media. Do not treat this illustration as the entire executable schema.

Age information must identify the source and exact SKU. A seller title saying 3+ or a certification keyword is extracted evidence, not automatically verified conformity. Record the product selection review appropriate for the intended market; this plan does not provide a legal certification determination.

Unboxing package contents must be confirmed even if the component_count field is unknown. If the script explicitly states a number, that number must be separately authorized.

Demand evidence is a separate object: units/GMV, source, market/listing/variant scope, observed_at, period_start/end if known, and whether a counter is cumulative. An unknown period cannot be represented as last_30_days.

## 3. Production context and revisions

~~~typescript
interface ProductionContext {
  workspace_id: string;
  production_mode: "OPERATOR_PILOT" | "STANDARD";
  canonical_sku_id: string;
  sku_revision: number;
  listing_id: string;
  listing_snapshot_id: string;
  offer_snapshot_id: string | null;
  truth_pack_revision_id: string;
  market: Market;
  primary_locale: string;
  platform: string;
  placement_profile_id: string;
  placement_profile_version: number;
  objective: "AFFILIATE_CONTRIBUTION" | "PRODUCT_CLICKS" | "CONSIDERATION";
  duration_ms: number;
  aspect_ratio: "9:16";
  creator_mode: "HANDS" | "GENERATED_ADULT" | "SUPPLIED_ADULT";
  creator_binding_id: string | null;
  benchmark_ids: string[];
  campaign_id: string | null;
  experiment_id: string | null;
}
~~~

Factory v1 starts at 9:16. A future aspect ratio is a versioned output-profile change; don't silently squeeze an incompatible generated frame.

The selected listing normally matches the target market. A cross-border destination requires explicit availability/shipping review and remains visibly identified; a regional URL is not silently relabeled.

Revision dependency hash includes the effective SKU/truth/offer revision, creator/voice/asset hashes, recipe/playbook/reference versions, locale/placement, script, shot/edit plan, provider binding, generation parameters, and cost constraints.

Different destinations with identical physical products can reuse approved product anchors where rights and references permit. Before first approval, commercial draft context can be revised. After first plan approval, changing SKU, listing, market, locale, or placement creates a new production with parent lineage. Script/shot repairs and compatible offer updates create revisions within the existing commercial context. Reusing a video does not establish equivalence of the new destination.

If asset preparation is required, persist a bounded preparation action and review its actual outputs before final plan approval. The final video-plan hash uses real approved reference hashes. A pending placeholder is not an approved anchor, and a paid preparation action cannot implicitly dispatch motion.

## 4. Decision contract and Jev adapter

Code creates a feasible pool before Jev:

1. Recipe is ACTIVE, or PILOT in an explicit operator-pilot production, and fits category/use/play mechanism.
2. Product identity/required facts are confirmed.
3. Required assets and object states exist or have an approved preparation path.
4. Creator/voice/locale/input modes are supported by actual bindings.
5. Target duration/aspect/candidate count fit the provider profile.
6. Approved campaign/test constraints and budget are enforceable.

Zero candidates: BLOCKED with exact missing requirements. One candidate: code may choose it with decision_source=DETERMINISTIC and confidence=null. More than one: make the typed Jev call. Operator choice is allowed with decision_source=OPERATOR and a reason; hard constraints still apply.

Public TypeSafe contract to verify against the current SDK/API:

~~~json
{
  "model": "jev-1.13.0",
  "state": {
    "production_context": "normalized context and IDs",
    "approved_product_summary": "facts only, with source IDs",
    "audience_tension": "one supported buyer concern",
    "feasible_recipes": ["HOME_HANDS_DEMO", "HOME_CREATOR_DEMO"],
    "available_action_summary": "what can actually be shown",
    "performance_context": "comparable records or explicitly unknown",
    "test_mode": "EXPLORE"
  },
  "questions": {
    "next_recipe": {
      "type": "choice",
      "instructions": "Choose the most useful feasible next UGC recipe for this SKU and context. Use supplied evidence; absent performance requires a hypothesis.",
      "criteria": {
        "HOME_HANDS_DEMO": "Use the observable product action as the main reason to watch.",
        "HOME_CREATOR_DEMO": "Use an adult explanation with a supported demonstration to answer the stated purchase hesitation."
      }
    }
  }
}
~~~

This is a payload shape example, not a complete campaign or proof of model access. Validate answers.next_recipe.type, choice, probabilities, confidence, returned model ID, and selected membership. Validate finite numbers and distributions according to the actual provider contract.

Pinned ID: jev-1.13.0. Keep a deliberate version migration process. Independent questions in one request share the same state; a hook question cannot depend on another question's newly selected recipe unless the application stages the second call.

Log only the structured inputs/IDs and actual response/usage needed for traceability. Do not expose credentials. Store confidence with its provider definition; do not rename it viral_probability.

The application records:

~~~typescript
interface CreativeDecision {
  id: string;
  production_revision_id: string;
  eligible_recipe_ids: string[];
  rejected_candidates: Array<{ recipe_id: string; requirement_codes: string[] }>;
  selected_recipe_id: string;
  recipe_version: number;
  decision_source: "JEV" | "DETERMINISTIC" | "OPERATOR";
  model_id: string | null;
  confidence: number | null;
  probabilities: Record<string, number> | null;
  performance_evidence_ids: string[];
  test_mode: "EXPLORE" | "REUSE_BEST_OBSERVED";
  evidence_label: "HYPOTHESIS" | "TESTED" | "BEST_OBSERVED" | "INSUFFICIENT";
  context_policy_version: string;
}
~~~

A low-confidence routing threshold is configuration calibrated against this domain, not a universal constant. Initially require operator review of all proposed plans. A timeout or malformed response is a recoverable decision failure, not permission to invent a Jev result.

Human-readable rationale can be a code summary and an Astra explanation grounded in decision/evidence IDs. Jev does not need to generate prose.

## 5. Astra brief and output

Brief includes exact product/listing context, authorized facts/claims, unknowns, one adult viewer tension, objective, selected recipe, playbook, abstract references, supplied experience statements if any, creator/voice constraints, available action assets, duration, edit/output profile, and actual offer/destination.

Use the original Bible/implementation guide as reference. Retrieve compact abstract guidance and allowed attributed spans, not the whole corpus. Original false/pending source approval fields remain unchanged.

Required output:

~~~typescript
interface CreativePlanDraft {
  status: "DRAFT_READY" | "NEEDS_INPUT";
  production_revision_id: string;
  angle: string;
  hook_mechanism: string;
  viewer_tension: string;
  primary_pattern_id: string | null;
  creative_hypothesis: string;
  references: Array<{
    reference_id: string;
    version: string;
    source_span_id: string | null;
    start_ms: number | null;
    end_ms: number | null;
    timing_precision: "EXACT_MEDIA" | "APPROXIMATE_SEMANTIC" | "NOT_APPLICABLE";
    borrowed_structure: string;
    excluded_source_content: string[];
  }>;
  beats: Array<{
    id: string;
    start_ms: number;
    end_ms: number;
    purpose: string;
    dialogue: string | null;
    on_screen_text: string | null;
    product_action: string;
    approved_fact_ids: string[];
    offer_id: string | null;
    delivery_direction: string;
    intended_shot_ids: string[];
  }>;
  shot_plan: ShotPlan[];
  audio_plan: AudioPlan;
  edit_plan: EditPlan;
  fact_use_audit: Array<{ fact_id: string; beat_ids: string[]; wording: string }>;
  missing_inputs: Array<{ field: string; reason: string; required_for: string[] }>;
  limitations: string[];
}
~~~

Code validates complete duration coverage, deliberate silent intervals, ID existence, language, facts/offers, action feasibility, and all referenced assets. Fact-use audit is necessary but not sufficient: review uncited assertions in generated dialogue and on-screen text too.

Approximate word rate is a drafting tool. Preview/measured audio determines speaking duration. Thai segmentation and caption wrapping cannot use English whitespace assumptions.

Generated presenters can describe the current demonstration. They cannot inherit source testimonials or claim unsupplied parenting/purchase/use history.

## 6. Object states and camera shots

~~~typescript
interface ObjectState {
  id: string;
  sku_id: string;
  label: string;
  visible_components: Array<{ component_id: string; count: number | null }>;
  assembly_configuration: string | null;
  contents_asset_ids: string[];
  invariant_fact_ids: string[];
}

interface ShotPlan {
  id: string;
  beat_ids: string[];
  start_ms: number;
  end_ms: number;
  purpose: string;
  framing: string;
  camera_behavior: string;
  actor_action: string;
  product_action: string;
  state_in_id: string;
  state_out_id: string;
  product_reference_asset_ids: string[];
  creator_binding_id: string | null;
  action_reference_asset_ids: string[];
  anchor_asset_ids: string[];
  approved_fact_ids: string[];
  offer_id: string | null;
  audio_owner: "NATIVE_TAKE" | "VOICEOVER" | "OBJECT_SOUND" | "SILENT";
  cut_reason: string | null;
  provider_binding_id: string;
  render_group_id: string;
  risk_notes: string[];
}
~~~

A beat is a semantic unit; a shot is a camera/render/edit unit. A render_group can execute several approved shots in one native take. Observed output timing must then be reconciled with the actual edit; planned timestamps are not proof that the provider followed them.

Object-state continuity is a graph, not a narration paragraph. A requested transition requires a plausible action and sufficient visual references. Overlapping edit inserts may share a beat; the final timeline resolves actual frame boundaries and sound.

## 7. Audio and edit contract

~~~typescript
interface AudioPlan {
  mode: "NATIVE_AV" | "CONTINUOUS_VOICEOVER" | "HYBRID";
  primary_locale: string;
  voice_binding_id: string;
  voice_lock_method: "VOICE_ID" | "REFERENCE_AUDIO" | "SINGLE_TAKE";
  pronunciation_entries: Array<{ term: string; rendering: string }>;
  speech_segments: Array<{ beat_id: string; text: string; pause_after_ms: number }>;
  object_sound_instructions: string[];
  music_asset_id: string | null;
}

interface EditPlan {
  output_profile_id: string;
  ordered_shot_ids: string[];
  edit_instructions: Array<{ shot_id: string; reason: string; trim_rule: string }>;
  caption_mode: "NONE" | "BURNED_IN";
  caption_style_profile_id: string | null;
  safe_area_profile_id: string;
  cta_beat_id: string | null;
}
~~~

A voice lock method is usable only when the actual account/provider can honor it. Native clips with unverified voice continuity require remediation/review, not a fabricated stable voice ID.

Exactly one primary speech owner per timeline interval unless an intentional overlap is approved. Native dialogue and external narration must not duplicate each other. On-camera dialogue replacement requires synchronization.

Rendered CTA text/captions belong to the compositor for exact spelling. Provider-generated lettering is reviewed and replaced where unreliable. Caption timing aligns with measured speech. Thai glyphs, line breaking, and punctuation are part of the output review.

## 8. Provider adapter and capability registry

~~~typescript
interface VideoProviderAdapter {
  capabilities(bindingId: string): Promise<CapabilityRecord>;
  estimate(plan: ApprovedRenderRequest): Promise<CostEstimate>;
  submit(request: ApprovedRenderRequest, idempotencyKey: string): Promise<Submission>;
  getStatus(attemptId: string): Promise<ProviderStatus>;
  cancel(attemptId: string): Promise<CancelResult>;
  resolveOutputs(attemptId: string): Promise<OutputDescriptor[]>;
}
~~~

These are internal interfaces, not assumed provider API methods. An adapter implements cancellation/idempotency reconciliation even when the underlying service lacks a matching endpoint.

CapabilityRecord contains:

- provider, provider_model_id, account/region binding, verified_at, documentation source;
- supported reference/image/video/audio input modes and reference-count constraints;
- native audio, voice/reference-audio binding, and locale evidence;
- aspect ratio, duration, resolution, fps, input/output limits;
- model-specific parameter schema and pricing version;
- cancellation semantics, callback signature validation, polling rate limits;
- submission idempotency support and reconciliation strategy.

WAN public documentation names wan3.0-video and wan3.0-video-prime. A gateway may use another identifier; record the exact mapping verified for this application. Seedance public capability is not a guessed gateway slug.

GPT 6 Astra is a configured creative role. Discover its actual model ID and access from the host model client; never synthesize an ID from the display name.

An ApprovedRenderRequest binds production/plan/shot revision, model/capability version, internal input media IDs/hashes, reference roles, compiled action prompt, native audio instructions, output profile, candidate count, reserved budget, and operator approval ID.

Prompt compilation is structured: reference roles → locked creator/product/state → one feasible action group → framing/camera → dialogue/audio → end state → relevant constraints. Avoid a long stitched dump of all dialogue as the visual prompt.

Development fixtures are deterministic and visibly labeled. They test state and errors; they cannot satisfy live-model or benchmark acceptance.

## 9. State and job transitions

Production status:

~~~text
DRAFT
PREPARING
AWAITING_APPROVAL
READY_TO_GENERATE
QUEUED
RUNNING
REVIEW_REQUIRED
APPROVED
BLOCKED
FAILED
CANCELLING
CANCELLED
~~~

Stage is separate: CATALOG, REFERENCES, DECISION, SCRIPT, PLAN, ANCHORS, RENDER, ASSEMBLY, QC, EXPORT.

| Trigger | Required transition/effect |
| --- | --- |
| Save draft | DRAFT; no provider submission. |
| Start planning | PREPARING at the actual stage. |
| Missing identity/assets/locale/provider/budget | BLOCKED with requirement codes; preserve all completed work. |
| Valid complete plan | AWAITING_APPROVAL; preview and estimate available. |
| Approve current plan | READY_TO_GENERATE; persist approval on exact hash, with no implicit paid video submission. |
| Generate action | Validate approval/budget; atomically queue durable work. |
| Worker obtains dispatch lease | RUNNING; one bounded attempt identity. |
| All selected media ingested | Queue ASSEMBLY/QC; provider success alone does not approve production. |
| Draft final file/QC observations available | REVIEW_REQUIRED. |
| Human accepts exact final hash and issues resolved | APPROVED with active final_output_id. |
| Meaningful edit | New draft revision; affected downstream nodes marked stale. |
| Cancel | CANCELLING until reconciled, then CANCELLED. |
| Late provider completion after cancel | Ingest/account for result safely; keep cancelled state and require explicit reuse. |

Attempt status: CREATED, SUBMITTING, SUBMISSION_UNKNOWN, QUEUED, RUNNING, SUCCEEDED, FAILED, CANCEL_REQUESTED, CANCELLED. Assembly/QC jobs have their own durable identities.

Single ingested candidates may be selected automatically for draft assembly after mechanical validation. Candidate selection is not final approval. Operator comparison/selection remains available for multiple takes and repairs.

Duplicate callbacks and concurrent pollers cannot regress a terminal attempt, requeue dispatch, create duplicate media, or multiply costs. Callback events include provider event identity/hash. Workspace and attempt matching is mandatory.

On a crash between provider acceptance and storing the remote job ID, enter reconciliation. Use request identity/provider records where available; otherwise block automatic resubmission and surface uncertainty.

## 10. Cost ledger and concurrency

Use decimal money strings and currency identifiers, never floating-point accumulation. Financial correctness includes failed and cancelled attempts that were actually billed.

Ledger kinds: ESTIMATE, RESERVATION, RELEASE, REPORTED_CHARGE, CORRECTION. Reservation is not an actual charge. Unknown actual billing remains null with a billing status.

Enforce per-production and configured workspace limits in code. Include candidate takes, prepared anchors/audio where paid, assembly if charged, and repair allowance. Recheck before every new billable action.

Concurrent Generate clicks with the same plan/action idempotency key produce one orchestration request. Different keys for an already-active plan must be rejected or explicitly create a new bounded attempt.

Retry only classified transient errors with backoff and a maximum attempt count. Permanent schema/auth/capability errors do not loop. Provider/model substitution requires allowed bindings and a plan revision when it materially changes the approved output or cost.

## 11. Logical API/service surface

Map these operations onto host routes rather than creating a parallel application:

| Operation | Behavior |
| --- | --- |
| Create/update family and SKU | Workspace-scoped revisions and product signature. |
| Add listing / import listing | Save URL, extract candidates, preserve failures, expose manual fallback. |
| Confirm listing equivalence | Require evidence and explicit actor; reject incompatible physical variants. |
| Confirm truth/offer snapshot | Revisioned facts, claim restrictions, dynamic validity. |
| Register/analyze/review benchmark | Timecoded observations and source uncertainty. |
| Create/list/update production | Saved context, board filters, revision checks. |
| Select creative | Feasible candidate pool, actual typed decision, logged override. |
| Draft script/plan | Structured schema; needs-input responses are not complete scripts. |
| Approve script/plan | Expected revision and immutable approval hash. |
| Generate | Server-side budget/capability/approval check, durable idempotent enqueue. |
| Retry/repair/cancel | Stage-specific recovery with costs and dependency invalidation. |
| Ingest callback/poll output | Signature/event dedupe, scoped identity, file verification. |
| Assemble and review final | Real output, deterministic checks and timecoded observations. |
| Approve/export | Exact final version; destination/offer freshness and required review gates. |
| Import performance | Staging validation, dedupe, period semantics, attribution/version checks. |
| Create controlled variation | Explicit primary variable and new production count preview. |

All mutations accept an expected revision or equivalent optimistic concurrency token. Stale edits return a recoverable conflict without overwriting the current revision. Generation and performance import also require idempotency.

Standard error shape: code, stage, message, requirement_ids, retryable, affected_revision_id, recovery_action, correlation_id. Avoid raw secret/provider headers and arbitrary stack traces in product UI.

## 12. Quality report and export manifest

QC separates:

1. Measured media checks: decoded duration, dimensions, fps, stream/audio presence, clipping/silence anomalies, caption timing bounds, output hash.
2. Semantic observations: product/creator continuity, hands/contact, object states, language, dialogue/claim agreement, edit/action rhythm, and CTA.
3. Human judgment: benchmark comparison, natural delivery, product truth, and commercial clarity.

Each issue contains severity, category, time interval, evidence source, confidence/uncertainty, affected shot/beat IDs, and a remediation action.

Automatic review can suggest PASS/REPAIR/UNKNOWN. Missing observations never equal pass. An unresolved critical product/claim/destination issue blocks final approval; subjective style issues can be dispositioned with an operator reason.

Manifest includes production/revision/output IDs and hash, SKU/listing/snapshot/offer IDs, locale/market/placement, recipe/reference/playbook versions, selected take IDs/hashes, provider model IDs, assembly version, measured specs, approvals, cost summary with billing status, caption/disclosure metadata required by the profile, destination URL, and the export time.

Revalidate dynamic offer/destination requirements at export. Expired spoken offers require audio/video repair or a non-price revision; removing a metadata field does not remove a spoken assertion.

## 13. Performance import contract

Required attribution identity: production_id, output_id, output_sha256, campaign_id, market, locale, platform, placement_profile_id, listing_id, measurement_source, external_record_id, record_kind, window_start_utc, window_end_utc, distribution_mode, attribution_definition.

Other fields are nullable. A blank field is unknown; zero is a reported zero. Verify linked market/locale/listing/output hash instead of trusting CSV identifiers.

record_kind:

- PERIOD_TOTAL: totals for a defined window; overlapping windows are not blindly summed.
- CUMULATIVE_SNAPSHOT: latest as-of total for a defined source identity; snapshots replace/compare, never append as independent increments.

Unique upsert key uses workspace + measurement source + external record ID. If the source lacks an ID, compute a deterministic key from declared context/window/record kind and report its limitations. Show insert/update/conflict/rejected counts before committing.

Metric definitions, computed in code:

| Metric | Formula/requirements |
| --- | --- |
| Product click rate | Product clicks / views, only when the supplied measurement definition supports that denominator. |
| Click-to-order rate | Attributed orders / product clicks with a matching attribution definition/window. |
| Completion rate | Completed views / views with matching platform definitions. |
| Three-second hold rate | Three-second views / views only when both exist and definitions align. |
| Revenue/commission per thousand views | Known applicable amount / views × 1000; currency shown. |
| Net contribution | Applicable commission minus refunds/media spend/allocated production costs under declared matching currency and finalization rules. |

Unknown/zero denominator → null, with an explanation. Do not silently treat missing spend/refunds as zero. Show available gross figures separately when net contribution is incomplete.

Retain actual billed/known production costs across successful and failed attempts. Allocation rules for reused footage and batches are versioned; disclose them. Do not combine USD and IDR into a single total without a separate explicit conversion method.

Comparison filters include SKU or clearly labeled family, market, locale, platform/placement, objective, distribution mode, attribution definition, measurement window, and final output revision. Observational performance can guide a next test; it does not prove causal lift.

An exposure/sample policy determines TESTED/BEST_OBSERVED readiness in code. Imported results update decision context; they do not train Jev or relabel old reference ads as winners.
