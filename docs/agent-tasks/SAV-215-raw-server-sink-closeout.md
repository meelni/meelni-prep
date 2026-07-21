# SAV-215 Raw Server Sink Closeout

## Intent

- User request: Continue SAV-215 provider-free work before configuring an external alert receiver.
- Product/operator outcome: A future receiver cannot inherit raw exceptions, provider payloads, or customer-shaped values from deployed server error paths.
- Why now: The closed `meelni_operational_failure` event is safe, but adjacent deployed server routes still wrote caught exceptions and LiveKit provider objects to Runtime Logs.

## Slice

- Primary slice: delivery and operations.
- Secondary slices: public demo, question/session reads, practice sets, feature flags, analytics, and question-usage persistence.
- Relevant skills: `meelni-codebase-architecture`, `meelni-ops-connections`, `meelni-engineering-memory`, `meelni-linear-workstream`, and `meelni-pr-prep`.

## Linear Tracking

- Project: Meelni.
- Parent slice issue: SAV-171.
- Child deliverable issue: SAV-215.
- Current Linear state: In Progress.

## Scope

- In scope: Replace raw caught-exception and provider-object console output with fixed cause-free codes; preserve existing status and response behavior; fail CI when a deployed API or launch-critical server boundary logs a catch binding directly; correct stale Preview-isolation wording.
- Out of scope: Vercel drains, alert receivers, provider configuration, Preview or Production mutation, migrations, customer data, relaunch controls, and alert-receipt claims.
- Assumptions: `toSafeErrorLog` remains permitted because it emits only a closed error-class enum; identifier-free fixed codes remain permitted.

## Product Lens

- Audience: Operators protecting candidates' PM interview practice.
- Primary lever: launch safety and diagnosability.
- Product Compass note: Operational evidence must not create a second customer-data surface.

## Technical Plan

- App files: deployed API routes with raw caught-exception output, especially public LiveKit demo and question/session boundaries.
- Shared modules: PostHog server adapter, question-usage persistence, and the operational-observability contract.
- Data/provider dependencies: None.
- Docs: operational-failure contract, redacted-observability runbook, service-health runbook, and the SAV-215 intake.

## Validation

- Required: focused API privacy regressions, `npm run test:operations`, `npm run test:api`, `npm run typecheck`, targeted lint/format, and `git diff --check`.
- Optional: broader `npm run verify:agent` when local capacity permits.
- Fixtures: secret-, email-, and provider-shaped exception messages that must appear in neither response nor console output.

## Rollout

- Risk: Low to medium; logging becomes less detailed while product responses remain stable, except the random-question 500 message becomes fixed instead of reflecting an exception.
- Backward compatibility: Status codes and response shapes remain unchanged; no event schema or provider behavior changes.
- Watch: Fixed failure-code presence and unexpected raw caught-exception contract failures.
- Follow-up: Configure a receiver that consumes only the closed operational event, then complete isolated Preview receipt, acknowledgement, cleanup, and recovery evidence with SAV-216.
