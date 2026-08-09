# SAV-391 Agent Task Intake

## Intent

- User request: decouple ordinary Vercel pull-request builds from provider-backed LiveKit rehearsal.
- Product/user outcome: generic web Previews deploy and remain usable for non-voice review while every voice entrypoint truthfully refuses service without spending credits or touching providers.
- Why now: otherwise healthy PR deployments fail only because generic Preview inherits a strict LiveKit rehearsal probe.

## Slice

- Primary slice: Interview Session deployment/runtime capability contract.
- Secondary slices: deployment operations, provider integration catalog, truthful disabled UI.
- Relevant skills: Linear workstream, ops connections, LiveKit runtime, vertical-slice playbooks, UI design system, engineering memory, PR prep.

## Linear Tracking

- Project: Meelni.
- Parent slice issue: SAV-365.
- Child deliverable issue: SAV-391.
- Current Linear state: In Progress.

## Scope

- In scope: derive LiveKit capability from Vercel system identity; intentionally skip LiveKit-only preflight work for generic Preview; fail all voice routes/background work before auth, credits, durable mutation, configuration parsing, or LiveKit I/O; preserve strict staging and Production behavior; update durable docs and tests.
- Out of scope: Vercel/provider env changes, LiveKit projects or credentials, Production, Statsig, customer data, live Stripe, provider rehearsal, manual deploy.
- Assumptions: Vercel supplies `VERCEL=1`, `VERCEL_ENV`, and `VERCEL_TARGET_ENV`; only the exact generic Preview tuple disables LiveKit.

## Product Lens

- Audience: PM candidates and reviewers using web Preview surfaces.
- Lever: deployment confidence and reliable review throughput.
- Product Compass note: keep voice behavior honest; a web-only Preview must never imply that an interviewer is connecting.

## Technical Plan

- Likely app files: voice API routes, interview launcher, public demo failure mapping.
- Likely package/workflow files: `@meelni/integrations` capability boundary, deployment preflight, LiveKit-backed Inngest functions.
- Data or provider dependencies: no schema/data change and no provider mutation.
- Docs/decisions to update: deployment contract/runbook, LiveKit integration, connection runbook/catalog, accepted decision indexes.

## Validation

- Required commands: targeted package/preflight/API/workflow tests, typecheck, lint/docs/repository validation, exact-head GitHub/Vercel checks.
- Optional/manual checks: inspect the Git-integrated Preview response and preflight output; no manual deployment.
- Fixtures or regression tests needed: target matrix, Production-credential negative case, spoofed app-marker negative case, and zero-call route/preflight cases.

## Rollout

- Risk level: medium; the boundary controls all voice availability.
- Backward compatibility: staging and Production stay enabled and strict; local explicit preflight remains strict.
- Metrics/events to watch: hosted build result and stable `voice_unavailable_in_preview` responses.
- Follow-up slice: restore or rehearse provider-backed staging separately; not part of SAV-391.
