# Deterministic Drill Recommendation Contract

Status: provider-neutral core contract implemented for SAV-201; no product UI or persistence integration in this slice

## Purpose

The contract maps validated Feedback v2 evidence to one stable internal practice-template identity. Equal accepted inputs return the same result. It does not generate coaching prose, call a model, infer hiring readiness, or reinterpret legacy feedback.

`packages/core/src/drill-recommendation.ts` owns the decision. Consumers use the public `@meelni/core` entrypoint.

## Version tuple and stable identity

- Contract version: `drill-recommendation.v1`.
- Supported template version: `pm-drill-templates.v1`.
- Stable drill ID: `pm-drill:<templateVersion>:<roundType>:<weakestDimension>:<evidenceGap>`.
- Evidence gap is `grounded_full` for a full Feedback v2 evaluation or `grounded_partial` for a partial evaluation.

The stable ID depends only on the registered template version, canonical PM round, selected minimum-scoring dimension, and evidence gap. Provider/model identifiers, summaries, generated drill text, observations, next-step prose, improvement-array order, and evidence-array order cannot change it.

An unknown template version returns `unsupported_template_version`; it never reuses the current mapping. A mapping or template change must register a new version and mint new stable IDs. Existing version-to-ID behavior remains immutable.

## Trust boundary

Recommendations accept only a completed `FeedbackV2Result` produced after `parseFeedbackV2` validates the raw provider response against the canonical transcript. A legacy result, missing result, version mismatch, malformed score object, or non-completed state cannot authorize a recommendation.

The recommendation boundary repeats the invariants needed for safe selection rather than trusting the shallow item shape alone:

- every dimension score is a finite integer from zero through ten;
- the selected improvement has non-empty observation and next-step text;
- confidence is finite, greater than zero, and no greater than one;
- transcript references are non-empty and unique;
- evidence references match the transcript-reference set exactly;
- evidence quotes are non-empty and evidence identities are unique.

Exact quote-to-transcript validation remains owned by `parseFeedbackV2`, which has the canonical transcript. The recommendation contract never accepts raw model JSON as a substitute for that parser.

## Weakest validated dimension

1. Find the absolute minimum across the five validated Feedback v2 dimension scores.
2. Collect every dimension tied at that exact score.
3. Keep only tied dimensions with at least one grounded improvement finding.
4. Choose among those dimensions using the round-specific order below.
5. Choose the highest-confidence grounded finding for the dimension; an exact tie uses the finding's sorted evidence identity, not array order.

| PM round      | Tie order                                              |
| ------------- | ------------------------------------------------------ |
| Product Sense | insight, structure, clarity, communication, leadership |
| Execution     | structure, insight, clarity, communication, leadership |
| Behavioral    | leadership, structure, insight, clarity, communication |
| Strategy      | insight, structure, leadership, clarity, communication |

The absolute minimum remains authoritative. If none of its tied dimensions has grounded improvement evidence, the result is `missing_grounded_improvement`. The resolver does not fall through to a stronger dimension merely because that dimension has an improvement. This fail-closed rule prevents generic or hallucinated personalization.

## State behavior

| Source state   | Result reason           |
| -------------- | ----------------------- |
| `completed`    | evaluate validated v2   |
| `pending`      | `feedback_pending`      |
| `processing`   | `feedback_processing`   |
| `failed`       | `feedback_failed`       |
| `skipped`      | `feedback_skipped`      |
| `insufficient` | `feedback_insufficient` |
| `abandoned`    | `feedback_abandoned`    |

Additional unavailable reasons are `invalid_round`, `invalid_source_state`, `unsupported_template_version`, `missing_validated_feedback`, `invalid_scores`, and `missing_grounded_improvement`.

Insufficient, skipped, abandoned, and failed sessions never receive a score-derived fallback. Pending and processing results remain explicitly unavailable until validated evidence exists.

## Recommended result

A recommended result contains the stable drill ID, canonical round, selected dimension and score, all exact minimum-score ties, full/partial evidence gap, and the selected finding's sorted transcript references and confidence. It does not copy provider-authored drill text or manufacture personalized claims.

`drillId` and related `drill` names are internal compatibility vocabulary. Product surfaces must label the outcome as **focused practice** or a **practice recommendation**. The stable ID is never marketing copy and must not reintroduce gym, reps, workouts, or fitness framing.

## Scope and rollout

SAV-201 adds only the provider-neutral package contract, fixtures, tests, and documentation. It does not change model prompts, feedback generation, APIs, UI, database records, credits, analytics, or feature flags. A later explicitly scoped slice may integrate the stable ID with a drill catalog or product surface.
