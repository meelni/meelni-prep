# SAV-215 Redacted Observability Reconvergence

## Intent

- User request: Continue the complete relaunch-readiness program while keeping Linear and GitHub current.
- Product/operator outcome: Launch-critical failures are discoverable without retaining customer content or provider payloads.
- Why now: Current `main` has truthful health checks but still emits ad hoc logs at auth, interview, feedback, billing, sync, and scheduled-workflow boundaries.

## Slice

- Primary slice: delivery and operations.
- Secondary slices: auth, interview lifecycle, feedback, billing, question sync, and account deletion.
- Relevant skills: `meelni-vertical-slice-playbooks`, `meelni-codebase-architecture`, `meelni-ops-connections`, `meelni-engineering-memory`, and `meelni-linear-workstream`.

## Linear Tracking

- Project: Meelni.
- Parent slice issue: SAV-171.
- Child deliverable issue: SAV-215.
- Current Linear state: In Progress.

## Scope

- In scope: One closed operational-failure schema; fixed error-code catalog; environment/release and owned-session correlation; current critical-boundary instrumentation; privacy and behavior tests; contract and runbook.
- Out of scope: Reviving PR #286 lineage or migration, configuring a Production log drain, customer data, transcript or provider-body capture, changing the relaunch flag, or claiming alert-receipt evidence.
- Assumptions: Vercel Runtime Logs are the first sink; an external alert receiver and controlled Preview receipt are a follow-up operational step.

## Product Lens

- Audience: Meelni operators protecting PM candidates' interview practice.
- Primary lever: product quality and launch safety.
- Product Compass note: Operational telemetry must improve recovery without becoming marketing analytics or expanding data collection.

## Technical Plan

- App files: auth callback; LiveKit token; interview start/end; feedback read/retry; Stripe webhook; account-deletion request.
- Workflow files: interview join/start; feedback dispatch/generation; question sync; account deletion; reconnect/deadline/presence/room-cleanup scheduled functions.
- Data/provider dependencies: No schema or provider mutation. Runtime stderr is the provider-neutral sink.
- Docs: Operational-failure contract, runbook, and contracts index.

## Validation

- Required: targeted operations/API/workflow tests, `npm run verify:agent`, `npm run build`, and exact-head security review.
- Fixtures: adversarial identifiers, secret-shaped inputs, sink failure, invalid enums, and critical-boundary source contracts.

## Rollout

- Risk: Medium; failure reporting must never mask the product failure or leak content.
- Backward compatibility: Additive one-line JSON event; existing product responses and durable workflow state remain unchanged.
- Watch: Event schema violations, missing release/environment, reporter failures, and duplicate alert volume.
- Follow-up: Configure an approved Preview alert destination and pair it with SAV-216's health synthetic for event/alert/acknowledgement/recovery evidence.
