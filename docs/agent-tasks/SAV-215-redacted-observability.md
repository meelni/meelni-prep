# SAV-215 Redacted Observability

## Intent

- User request: Address the complete relaunch-readiness program.
- Product/user outcome: Launch-critical failures are discoverable without exposing customer content or credentials.
- Why now: The product cannot safely relaunch if interview, feedback, billing, sync, and auth failures are visible only through ad hoc raw logs.

## Slice

- Primary slice: Delivery and operations.
- Secondary slices: Auth, interview runtime, feedback, billing, and question sync.
- Relevant skill(s): `meelni-ops-connections`, `meelni-codebase-architecture`, `meelni-engineering-memory`, `vercel:observability`.

## Linear Tracking

- Project: Meelni Relaunch Readiness.
- Parent slice issue: SAV-171.
- Child deliverable issue: SAV-215.
- Current Linear state: In Review.

## Scope

- In scope: Closed structured failure schema, critical server instrumentation, privacy tests, contract, runbook, and alert policy.
- Out of scope: Buying a monitoring plan, selecting a vendor, provisioning a drain, storing customer content, or claiming alert receipt without a rehearsal.
- Assumptions: Vercel Runtime Logs are the initial transport; the event contract remains provider-independent.

## Product Lens

- Audience: Operators responsible for the PM interview practice golden path.
- Activation/retention/monetization/growth lever: Reliability and launch risk containment.
- Product Compass note: Observe failures needed to restore practice; do not repurpose operational identifiers for growth profiling.

## Technical Plan

- Likely app files: Critical auth, LiveKit token, session start/end, feedback, Stripe webhook, and cron boundaries.
- Likely package/workflow files: Operational-event helper and Inngest failure hooks.
- Data or provider dependencies: Forward-only Stripe event-log redaction
  migration; isolated Preview and an approved alert destination for rehearsal.
- Docs/decisions to update: Operational event contract and runbook.

## Validation

- Required commands: Unit and route tests, `npm run check:ci`, `npm run build`, Semgrep.
- Optional/manual checks: Controlled Preview failure and alert receipt after SAV-226.
- Fixtures or regression tests needed: exhaustive error-code rejection,
  ownership-derived session correlation, typed/runtime user-ID misuse, returned
  token 5xx outcomes, recursively reached console bypasses, Stripe durable
  redaction, and every critical operation wired to the closed reporter.

## Rollout

- Risk level: Medium because logging paths span critical workflows.
- Backward compatibility: Existing HTTP and workflow responses remain stable except raw feedback-generation error details are removed.
- Metrics/events to watch: Error volume by environment/release/operation/code; no payload sampling.
- Follow-up slice: Choose alert delivery/retention and complete Preview rehearsal.
- Open launch gate: SAV-226 isolation, an approved operator/destination, and a
  controlled Preview receipt rehearsal remain required. Code and hosted build
  checks do not prove alert readiness.
- Exact-head hardening additionally bounds the unauthenticated raw Stripe body,
  makes shared JSON reads responsive to mid-read aborts, and runtime-validates
  every dynamic operational-event field before serialization.
