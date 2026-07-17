# SAV-178 — Bound public voice usage and provider spend

## Intent

- User request: Continue relaunch-readiness engineering autonomously while the owner retains the only launch GO/NO-GO decision.
- Product/user outcome: The anonymous voice preview demonstrates live PM interview practice without allowing replay, bot traffic, or partial failures to create unbounded LiveKit/model spend.
- Why now: The relaunch flag is intentionally off, making this the safe point to restore the previously reviewed provider-spend boundary on the current SAV-226 lineage.

## Slice

- Primary slice: Public voice-preview abuse control and hard runtime bounds.
- Secondary slices: Anonymous identity, request policy, LiveKit room lifecycle, recoverable UI, retention, and observability.
- Relevant skills: `meelni-livekit-interview-runtime`, `meelni-vertical-slice-playbooks`, `meelni-engineering-memory`, `meelni-linear-workstream`, `meelni-ops-connections`, `meelni-pr-prep`.

## Linear Tracking

- Project: Meelni.
- Parent slice issue: SAV-164.
- Child deliverable issue: SAV-178.
- Current Linear state: In Progress.

## Scope

- In scope: Canonical migration 0024 after the analytics-consent 0023 predecessor; shared Postgres rate limits; a zero-cost signed anonymous identity handshake; replay fencing; strict request-origin/empty-JSON policy; microphone-only LiveKit grants; cleanup on partial provider failure; awaited local close plus a monotonic two-minute hard stop; typed 429/recovery UI; privacy-minimized audit data; pruning; tests and rollout documentation.
- Out of scope: Applying the migration to Preview or Production, changing provider configuration, invoking LiveKit/model providers, enabling the relaunch flag, using customer data, or making the launch decision.
- Assumptions: Historical PR #249 is an audit source only; the implementation is recovered selectively onto SAV-226's reviewed head, and migration number 0008 is not reused because canonical history now ends at 0022.

## Product Lens

- Audience: Anonymous visitors evaluating whether Meelni provides realistic live PM interview practice.
- Activation/retention/monetization/growth lever: A trustworthy activation preview that cannot become a free substitute for paid interviews or a spend-amplification endpoint.
- Product Compass note: Describe this as a two-minute voice preview, never a gym or a rep.

## Technical Plan

- Likely app files: Demo token and acknowledgement routes, demo modal, API tests.
- Likely package/workflow files: LiveKit integration adapter, anonymous identity/request policy, DB wrappers, start workflow, Inngest pruning, schema/migration contracts, and Python demo runtime.
- Data or provider dependencies: Postgres is the shared authority; LiveKit is behind the workflow boundary. This implementation turn is provider-free and performs no migration apply.
- Docs/decisions to update: Restore the accepted public-voice decision with canonical migration numbering, update environment/operations contracts, and record exact rollout blockers.

## Validation

- Required commands: Focused workflow/security/API/integration/Python tests, database migration verification, typechecks, lint, formatting, Semgrep, diff/credential scans, and a production build if local configuration permits.
- Optional/manual checks: Isolated Preview limit/replay/cleanup/browser rehearsal only after SAV-226 provider isolation and explicit operational authorization.
- Fixtures or regression tests needed: Concurrent reservation limits, replay/recovery fencing, spoofed-IP rejection, partial-room cleanup, grants/TTL, monotonic hard deadline, typed cooldown UI, and privacy-safe auditing.

## Rollout

- Risk level: High security and provider-cost impact; fail closed.
- Backward compatibility: The public endpoint remains unavailable while the relaunch feature flag is off. Migration 0024 adds isolated pseudonymous tables/functions without altering authenticated interview data.
- Metrics/events to watch: Typed denial reason/scope and retry bucket, provider start/failure/cleanup outcomes, global allowance, and cleanup health—never raw IPs, cookies, room names, questions, transcripts, or tokens.
- Follow-up slice: Apply 0023 and then 0024 only through the reviewed migration workflow, complete isolated Preview rehearsals, finish SAV-180 consent evidence, and leave launch activation to the owner.
