# SAV-186 Authenticated Preview Golden Path

## Intent

- User request: autonomously complete the isolated synthetic Preview rehearsal without using customer or Production data.
- Product/user outcome: a fresh candidate can activate the canonical trial, practice one selected PM question with the LiveKit interviewer, retain a durable transcript, end in one terminal state, and receive completed asynchronous feedback.
- Why now: this is a release-blocking evidence gap behind the current `not ready` recommendation; the product owner's launch decision remains pending.

## Slice

- Primary slice: interview session.
- Secondary slices: trial activation, selected-question intent, LiveKit runtime, transcript persistence, feedback evaluation, and feature-gate rollback.
- Relevant skills: `meelni-livekit-interview-runtime`, `meelni-feedback-evaluation`, and `meelni-vertical-slice-playbooks`.

## Linear Tracking

- Project: Meelni.
- Parent slice issue: SAV-226.
- Child deliverable issue: SAV-186.
- Current Linear state: evidence gap open; provider-free preflight in progress.

## Scope

- In scope: exact Preview identity, fresh synthetic account, canonical trial, selected question, one LiveKit room and dispatch, durable version-2 transcript, user-end terminalization, credit consumption, completed feedback, candidate-only flag targeting, default-off rollback, cleanup, and a sanitized receipt.
- Out of scope: Production, customers, shared provider provisioning, agent deployment, Stripe endpoint mutation, Vercel environment mutation, recordings, transcript content in tracked artifacts, and more than one rehearsal session.
- Assumptions: the existing isolated Supabase, LiveKit, Inngest, and exact Vercel Preview remain the intended targets; missing or conflicting identity is a stop.

## Product Lens

- Audience: a PM candidate returning to Meelni for live interview practice.
- Activation/retention/monetization/growth lever: first-session activation and feedback trust.
- Product Compass note: prove the actual PM interview loop; do not substitute a demo, generic chat, or provider health check.

## Technical Plan

- App files: no behavior change is currently required; use the authenticated session, transcript, end, and feedback APIs as deployed.
- Workflow files: no production workflow mutation in this preflight.
- Provider dependencies: candidate-only Statsig rule, exact Preview Supabase, exact Preview LiveKit agent, exact branch Inngest environment, one bounded feedback evaluation, and the existing protected Vercel deployment.
- Scaffolding: `scripts/verify-preview-golden-path-receipt.mjs`, its provider-free tests, and `docs/operations/authenticated-preview-golden-path.md`.

## Validation

- Required commands: the receipt-verifier test, API/workflow/billing/agent/integration/Python contract suites, typechecks, and formatting checks.
- Optional/manual checks: exact Vercel deployment identity, LiveKit running-version inventory, branch Inngest inventory, and controlled browser/runtime rehearsal.
- Fixtures: private approved synthetic audio only. Text input is insufficient because canonical transcript events require measured speaking timestamps.

## Rollout

- Risk level: high because the slice crosses authentication, entitlements, realtime providers, durable evidence, and paid evaluation.
- Backward compatibility: no customer-facing change; the feature gate remains default-off before and after the rehearsal.
- Metrics/events to watch: start-to-active latency, one dispatch, durable transcript count, terminal outcome, feedback dispatch/completion, credit settlement, room cleanup, and provider-call cost.
- Follow-up slice: publish the sanitized exact-head receipt, update SAV-226, and retain a `not ready` recommendation unless every other release gate also passes. Only the human product owner can make the final GO/NO-GO.
