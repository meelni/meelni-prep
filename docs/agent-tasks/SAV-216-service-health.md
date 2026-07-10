# SAV-216 Service Health

## Intent

- User request: Complete the Linear-tracked relaunch-readiness program.
- Product/user outcome: Operators can tell whether a candidate can reach live
  practice and feedback without relying on a hardcoded status string.
- Why now: A relaunch cannot be operated safely without a truthful readiness
  signal and a repeatable synthetic check.

## Slice

- Primary slice: Delivery and operations.
- Relevant skills: `meelni-codebase-architecture`, `meelni-ops-connections`,
  `meelni-engineering-memory`, `vercel:observability`.

## Linear Tracking

- Parent: SAV-171.
- Deliverable: SAV-216.
- State: In Progress.

## Scope

- In scope: Closed health contract, public no-store endpoint, database evidence,
  LiveKit configuration readiness, feedback-dispatch backlog/configuration,
  Stripe-webhook backlog/configuration, deterministic endpoint synthetic, tests,
  and an operating runbook.
- Out of scope: A status vendor, a provider-mutating interview synthetic, an
  alert receiver, Production data writes, or changing the relaunch flag.
- Dependency: Provider-backed rehearsal and alert receipt wait for SAV-226
  isolated Preview plus an approved operator/destination.

## Privacy Boundary

- Expose only fixed check names, fixed result codes, status, contract version,
  and the current check time.
- Never expose counts, row IDs, customer/user/session IDs, event IDs, provider
  payloads, exception messages, configuration names, or secrets.

## Validation

- Unit and HTTP contract tests.
- Deterministic synthetic tests with mocked endpoint responses.
- Stalled-query single-flight, exact HTTP mapping, canonical timestamp, and
  simultaneous failed/stale evidence regressions.
- `npm run check:ci` and `npm run build`.
- Controlled isolated-Preview degradation and alert receipt remain launch gates.

## Rollout

- Keep the relaunch flag off.
- Publish the endpoint before wiring a scheduler or alert destination.
- Treat degraded as a failed synthetic during relaunch even though the public
  endpoint remains HTTP 200; unavailable returns HTTP 503.
