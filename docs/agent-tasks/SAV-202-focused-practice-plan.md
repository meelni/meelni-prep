# SAV-202 Agent Task Intake — Focused-Practice Plan Phase 1

## Intent

- User request: Continue provider-free relaunch work by turning the accepted SAV-201 recommendation into a usable short practice contract.
- Product/user outcome: A PM candidate receives one deterministic, evidence-bounded five-minute plan for revising an answer.
- Why now: Feedback needs an honest next action before a later product-surface integration can be designed or persisted.

## Slice

- Primary slice: feedback and evaluation.
- Secondary slices: core package contract, regression fixtures, and engineering memory.
- Relevant skills: `meelni-feedback-evaluation`, `meelni-vertical-slice-playbooks`, `meelni-engineering-memory`, and `meelni-ui-design-system` for customer-language guardrails.

## Linear Tracking

- Project: Meelni.
- Parent slice issue: SAV-168.
- Child deliverable issue: SAV-202.
- Current Linear state: In Progress until implementation review and stacked-PR rollout criteria are satisfied.

## Scope

- In scope: versioned five-minute plan contract, deterministic catalog for every SAV-201 identity, strict recommendation validation, source-question and evidence-metadata snapshot, public package export, fixtures, behavior tests, and contract documentation.
- Out of scope: database schema, attempt lifecycle, API, UI, analytics, provider/model calls, LiveKit, Stripe, Inngest, credits, Production actions, and feature-flag changes.
- Assumptions: SAV-201 has already converted owned, validated Feedback v2 into an in-process recommendation; a later authenticated workflow rebuilds that value and supplies question metadata from the owned interview record rather than accepting either value from a client.

## Product Lens

- Audience: PM candidates reviewing grounded post-interview feedback.
- Activation/retention lever: turn feedback into one small, understandable improvement action.
- Product Compass note: Customer copy uses focused-practice and answer-revision language. Internal legacy identifiers remain compatibility fields only.

## Technical Plan

- App files: none in Phase 1.
- Package/workflow files: `packages/core/src/focused-practice-plan.ts` through `@meelni/core`; reusable golden scenarios through `@meelni/test-fixtures`.
- Data or provider dependencies: none.
- Docs: add the focused-practice plan contract and contract index entry.

## Validation

- Required commands: targeted SAV-201/SAV-202 core tests, fixture tests, full core and fixture suites, typecheck, scoped lint, formatting, and diff checks.
- Optional commands: broader build or `verify:agent` only if the shared branch is otherwise stable.
- Fixtures or regression tests needed: all four PM rounds, all dimensions and evidence gaps, full and partial evidence, raw provider-copy rejection, unknown versions, malformed recommendation identity, unavailable recommendation, and invalid source question.

## Rollout

- Risk level: medium; customer instructions become a durable contract but are not yet rendered or persisted.
- Rollout or migration risk: additive package export only; no data migration or flag change.
- Rollback path: remove the additive export and Phase 1 files before an integration depends on them.
- Metrics or events to watch: none until an authenticated attempt workflow exists.
- Follow-up slice: persist one idempotent self-directed attempt and integrate it into the feedback workspace without starting another interview session or consuming a credit.
