# SAV-200 Evidence-First Feedback Review

## Intent

- User request: make completed feedback trustworthy and evidence-first before relaunch.
- Product/user outcome: every supported finding connects an observation to transcript evidence and a specific next action, while legacy, malformed, partial, and lifecycle states remain honest.
- Why now: feedback v2 validates new writes, but persisted reads and the current UI can still present missing or incompatible data as personalized scores.

## Slice

- Primary slice: feedback and evaluation.
- Secondary slices: authenticated feedback UI and durable feedback read contracts.
- Relevant skills: `meelni-feedback-evaluation`, `meelni-ui-design-system`, `meelni-vertical-slice-playbooks`, `meelni-linear-workstream`, and `meelni-pr-prep`.

## Linear Tracking

- Project: Meelni.
- Parent slice issue: SAV-168.
- Child deliverable issue: SAV-200.
- Current Linear state: unavailable to this agent because Linear OAuth requires reauthorization; update evidence must be added after access is restored.

## Scope

- In scope: a strict provider-independent completed-feedback read model; validated v2, validated legacy, and invalid variants; a shared lifecycle view state; evidence-first findings; full, partial, pending, processing, skipped, failed, missing, session-active, legacy, and invalid UI states; accessibility; light/dark responsive presentation; regression tests and contract documentation.
- Out of scope: database migrations, provider calls, feature flags, LiveKit, recommendation ranking, and SAV-201 implementation.
- Assumptions: the exact feedback v2 tuple and canonical scoring weights remain authoritative; legacy rows have no transcript-verification claim.

## Product Lens

- Audience: PM candidates reviewing a completed or interrupted mock interview.
- Activation/retention/monetization/growth lever: trust in feedback and a clear next practice action.
- Product Compass note: use live PM interview practice language; avoid fitness metaphors, readiness claims, and provider/model marketing.

## Technical Plan

- App/API files: `app/api/feedback/[sessionId]/route.ts`, `app/feedback/[sessionId]/page.tsx`, and the loading route.
- Package/workflow files: a new `@meelni/core` read model and lifecycle presenter contract, exported through the package public entrypoint.
- UI files: canonical feedback result and finding components plus theme-aware feedback surface tokens.
- Data/provider dependencies: none; persisted values are treated as untrusted input.
- Docs/decisions: update the feedback contract and canonical UI references; no new decision record because this implements the accepted v2 and positioning decisions.

## Validation

- Required commands: targeted core/API/UI tests, `npm run test:core`, `npm run typecheck`, `npm run lint`, `npm run check:ci`, `npm run build`, and `npm run verify:agent` where the local environment permits.
- Optional/manual checks: authenticated feedback fixtures at mobile and desktop widths in light/dark and reduced-motion modes.
- Fixtures or regression tests: valid full/partial v2, valid legacy, unsupported/malformed completed data, score mismatch, low confidence, long content, and every lifecycle state.

## Rollout

- Risk level: high because the change determines whether persisted feedback is presented as trustworthy.
- Backward compatibility: legacy feedback remains readable only through an explicit historical-feedback view; incompatible completed rows fail closed without fake scores.
- Metrics/events to watch: frequency of legacy and invalid completed read models, feedback recovery attempts, and transcript-evidence navigation failures.
- Follow-up slice: SAV-201 supplies deterministic next-practice recommendations through a narrow typed seam; SAV-200 does not rank them.

## Implementation Evidence

- Completed reads now cross one provider-independent `@meelni/core` presenter
  that returns validated v2, validated legacy, or invalid without score coercion.
- The result and loading URLs use one polling/recovery controller and one
  discriminated lifecycle state model.
- V2 findings render observation, every evidence excerpt, and one next action;
  stored model-authored practice suggestions are excluded from the customer/API
  read model until SAV-201.
- Transcript navigation resolves only canonical event IDs and programmatic
  scrolling respects reduced-motion preferences. Explicit per-field persisted
  string limits fail oversized completed feedback closed.
- Invalid completed rows emit a redacted environment/release/session integrity
  signal and use `private, no-store` caching.
- Completed v2 reads revalidate every persisted evidence event ID and exact
  quote against owner-scoped canonical v2 user turns before any finding or
  confidence label reaches the API; unsupported historical rubric versions
  fail closed instead of expanding the compatibility boundary.
- Node 22 validation passed: `npm run test:local`, targeted feedback component
  tests, `npm run check:ci`, `npm run build`, and `npm run verify:agent`.
- Browser screenshots were not captured because this isolated worktree has no
  `.env.local` or authenticated fixture session, and this slice prohibits live
  database/provider calls. Static render tests cover light/dark semantic tokens,
  mobile spacing, long-content wrapping, lifecycle copy, evidence order,
  low-confidence language, and transcript recovery states.
