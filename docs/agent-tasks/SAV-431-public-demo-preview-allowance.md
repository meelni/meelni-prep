# SAV-431 — Allow ten daily voice previews

## Intent

- User request: Let a visitor try the voice agent up to ten times within 24 hours.
- Product/user outcome: Visitors can evaluate the experience repeatedly without seeing an unexplained cooldown after one or two attempts.
- Why now: The existing two-preview device limit and 15-minute session fence made normal product exploration feel like capacity failure.

## Slice

- Primary slice: Public voice-preview allowance and recovery policy.
- Secondary slices: Signed anonymous session rotation, provider-start compensation, customer error states, migration operations, and API contracts.
- Relevant skills: `meelni-livekit-interview-runtime`, `meelni-ui-design-system`, `meelni-product-strategy`, `meelni-vertical-slice-playbooks`, `meelni-engineering-memory`, `meelni-linear-workstream`, and `meelni-pr-prep`.

## Linear Tracking

- Project: Meelni.
- Parent slice issue: SAV-365.
- Child deliverable issue: SAV-431.
- Current Linear state: In Progress.

## Scope

- In scope: Ten previews per signed device in a rolling 24-hour window; one active preview; transparent session-cookie rotation after the two-minute active window; unchanged global and daily IP safeguards; a ten-per-ten-minute IP burst; exact allowance refund for server-confirmed provider startup failure; distinct active-preview and daily-limit UI; behavior tests, migration rehearsal, and operations/API documentation.
- Out of scope: Deploying the migration, deploying the LiveKit agent, enabling the relaunch gate, changing the two-minute runtime, adding authentication, changing full-interview credits, or refunding failures after a usable token has been issued.
- Assumptions: Device cookies are the customer-facing allowance identity; IP and deployment limits remain invisible shared safety breakers.

## Product Lens

- Audience: Anonymous visitors deciding whether live PM interview practice is useful.
- Activation/retention/monetization/growth lever: More room to experience the interviewer while keeping the preview bounded below a full mock interview.
- Product Compass note: Explain a preview allowance or an active preview in customer language; never expose an internal cooldown concept.

## Technical Plan

- Likely app files: Demo-token API route, modal state/copy, and API/component tests.
- Likely package/workflow files: Public-demo workflow, client error mapping, Postgres limiter wrappers, and migration contracts.
- Data or provider dependencies: Postgres remains the shared admission authority. LiveKit behavior and the Python demo agent are unchanged.
- Docs/decisions to update: Accepted public-preview decision, API/OpenAPI contract, migration history, database runbook, and this intake.

## Validation

- Required commands: Focused workflow/client/API/component tests, full database migration rehearsal, migration-doc contracts, typecheck, lint, repository verification, and hosted PR checks.
- Optional/manual checks: Provider-backed Preview rehearsal after the migration is applied to an isolated environment.
- Fixtures or regression tests needed: Starts 1–10 accepted, 11th denied, active-preview denial distinct from daily exhaustion, expired-session rotation without provider work, and exact global/IP/device refund after confirmed provider startup failure.

## Rollout

- Risk level: Medium; anonymous provider-spend and shared database policy change.
- Backward compatibility: The migration replaces existing functions without changing their signatures or privileges; the application understands the new internal rotation decision before the migration is applied.
- Metrics/events to watch: Safe denial scope, allowance exhaustion, provider-start failure/refund, room provisioning, and global breaker utilization—never raw IPs, cookies, room names, questions, transcripts, or tokens.
- Follow-up slice: Apply migration `0035` before the web code in Preview and Production through the authorized database workflow, then manually verify first, tenth, eleventh, active, and provider-failure paths. The human owner retains Production and launch authorization.
