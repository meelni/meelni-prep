# Focused-Practice Plan Contract

Status: provider-neutral Phase 1 core contract implemented for SAV-202; Phase 2a attempt lifecycle and workflow seam implemented in SAV-269; no database, API, or product-surface integration yet

## Purpose

The contract turns one accepted SAV-201 recommendation into a deterministic,
five-minute focused-practice plan. It gives a PM candidate a bounded next step:
revise the relevant part of an answer, check it against one concrete success
criterion, and compare the revision with the grounded feedback.

`packages/core/src/focused-practice-plan.ts` owns the catalog and resolver.
Consumers use the public `@meelni/core` entrypoint.

## Version tuple

- Plan contract: `focused-practice-plan.v1`.
- Template catalog: `focused-practice-templates.v1`.
- Duration: five minutes.
- Template identity:
  `focused-practice:<templateVersion>:<roundType>:<focusDimension>:<evidenceGap>`.

The v1 catalog contains every combination of the four canonical PM rounds,
five Feedback v2 dimensions, and two SAV-201 evidence gaps: 40 immutable
templates. An accepted recommendation always maps to exactly one catalog
entry. Changing customer instructions, the success criterion, or selection
semantics requires a new template version; v1 behavior remains stable.

## Input and trust boundary

The resolver accepts:

1. one trusted in-process SAV-201 `DrillRecommendation`; and
2. source-question metadata with a non-empty `questionId` and bounded
   `questionText`.

The SAV-201 identifier is retained as internal compatibility vocabulary. It is
never customer copy. Template selection depends only on the exact SAV-201
recommendation identity: round, weakest grounded dimension, and evidence gap.
Changing the source question does not change the selected template.

This resolver is not a deserialization or authenticity boundary. A future API
must never accept a serialized recommendation from a client. The authenticated
workflow must rebuild the recommendation from its owned, validated Feedback v2
record with `recommendDrill`, then pass that in-process result directly to this
resolver. Structural checks here catch programming and versioning errors; they
cannot prove the provenance of an arbitrary object that a caller cast to the
TypeScript type.

The boundary repeats the invariants needed to reject a structurally inconsistent
recommendation:

- exact current recommendation and template versions;
- exact known fields with no additions;
- a canonical round, dimension, integer score, evidence gap, and derived ID;
- unique tied dimensions containing the selected weakest dimension;
- non-empty, unique, ordinally sorted transcript references; and
- finite source confidence greater than zero and no greater than one.

An unavailable SAV-201 result cannot authorize a plan. Unknown versions,
malformed metadata, an inconsistent derived ID, extra provider fields, or an
unregistered catalog identity fail closed.

Raw model `feedback.drills` values are not an input to this contract. They
cannot select, seed, or alter a template. The plan carries only source evidence
metadata already selected by SAV-201: transcript references and confidence. It
does not duplicate transcript quotes, model prose, observations, or next-step
text.

## Available result

An available plan contains:

- version and stable template identity;
- a five-minute duration;
- customer-safe title, objective, and two instructions;
- one concrete success criterion and one self-review prompt; and
- a frozen source snapshot: question identity and text, SAV-201 recommendation
  identity, PM round, focus dimension, evidence gap, transcript references, and
  confidence.

Full-evidence templates direct the candidate to the cited feedback from the
completed interview. Partial-evidence templates explicitly limit the revision
to the recorded portion and prohibit filling in missing interview context.
Neither state predicts hiring outcomes or interview readiness.

## Unavailable states

The closed v1 reasons are:

- `invalid_source_question`;
- `source_recommendation_unavailable`;
- `unsupported_recommendation_contract`;
- `unsupported_recommendation_template`;
- `invalid_recommendation`; and
- `template_not_found`.

Unavailable results contain no synthesized fallback plan.

## Scope and follow-up

Phase 1 adds only the provider-free core catalog, resolver, package exports,
fixtures, tests, and this contract. It does not create an attempt record, API,
page, interview session, model call, LiveKit room, background job, credit-ledger
entry, analytics event, or feature-flag change.

SAV-269 Phase 2a now defines the versioned attempt snapshot, idempotent start
and completion behavior, authenticated workflow/repository seam, candidate
revision-or-reflection requirement, and non-scored self-review comparison. It
does not persist an attempt or expose an API or UI. A later SAV-202 slice must
implement the durable adapter and database contract before the feedback
workspace consumes it.
