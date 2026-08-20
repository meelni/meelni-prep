# SAV-481 Preview-Shadow Rehearsal Wiring

## Intent

- User request: Continue from the merged durable Preview-shadow control plane
  toward the bounded adaptive Preview-shadow rehearsal.
- Product/user outcome: A later authorized rehearsal can allocate one durable
  lease before LiveKit room/dispatch construction, deliver only the admitted
  lease to the named worker, and return terminal evidence through the durable
  control plane without changing customer output.
- Why now: SAV-480 merged the durable authority and accounting boundary, but it
  deliberately left LiveKit and Python runtime wiring absent.

## Slice

- Primary slice: agent tooling and rollout wiring.
- Secondary slices: LiveKit dispatch metadata, server workflow, Python runtime
  bootstrap, and provider-free cross-runtime contracts.
- Relevant skills: `meelni-linear-workstream`,
  `meelni-livekit-interview-runtime`, `meelni-codebase-architecture`,
  `meelni-vertical-slice-playbooks`, `meelni-engineering-memory`, and
  `meelni-pr-prep`.

## Linear Tracking

- Project: Meelni coding-agent workstream.
- Parent slice issue: SAV-476 remains open.
- Child deliverable issue: SAV-481.
- Current Linear state: local implementation active; Linear writes are paused
  because the connector requires reauthentication.

## Scope

- In scope: a strict cross-runtime LiveKit job-metadata envelope; a dedicated
  server workflow that allocates before room construction; optional exact
  dispatch metadata support in the LiveKit integration; an injected Python
  bootstrap around the existing lease-bounded runtime; provider-free admission,
  replay, closed-lease, metadata, lifecycle, and evidence tests.
- Out of scope: application-route or ordinary start-session wiring, ambient
  environment or credential reads, provider calls or spend, deploys, live
  rooms, flag changes, Preview influence, Production/default-on/GO, and the
  28-cell live voice matrix.
- Assumptions: raw worker capability belongs only in LiveKit job metadata and an
  authenticated internal reconciliation request, never room/participant
  metadata or durable evidence; stable raw capabilities remain explicit
  caller inputs and are not derived from an ambient secret.

## Product Lens

- Audience: the human owner and trusted operators preparing the isolated
  Preview-shadow rehearsal.
- Activation/retention/monetization/growth lever: safer interviewer-quality
  iteration; no customer-facing change in this slice.
- Product Compass note: preserve realistic interviewing and score authority
  while keeping shadow computation unable to affect speech or feedback.

## Technical Plan

- Likely app files: none.
- Likely package/workflow files: dedicated server-only allocation/provisioning
  and reconciliation facades, the LiveKit integration's dispatch metadata
  projection, and a Python job-metadata/bootstrap module.
- Data or provider dependencies: existing SAV-480 store interface; provider-free
  fakes only. No migration is expected.
- Docs/decisions to update: this intake, OpenSpec, accepted decision, contract,
  runbook, and validation evidence.

## Validation

- Required commands: focused TypeScript/Python cross-runtime and workflow tests;
  exact Node 22.22.0 agent, integrations, operations, Python, calibration,
  check, verify:agent, build, and public-build gates; exact-range security scan.
- Optional/manual checks: none against LiveKit, OpenAI, Preview, Production, or
  a shared database.
- Fixtures or regression tests needed: allocation-before-room ordering; exact
  job metadata; replay and closed replay; room/participant metadata isolation;
  invalid/oversized/duplicate-key payloads; injected admission/transport only;
  no app/runtime entrypoint wiring; receipt/incident reconciliation projection.

### Provider-free results

- Focused TypeScript workflow and metadata: 8/8.
- Focused pinned Python job/admission/settlement boundary: 7/7.
- Source/privacy contracts: 3/3.
- Full integrations: 113/113; full pinned Python: 329/329 with no skips;
  workflow matrix: 1,066; local application matrix: 516.
- Benchmark 34/34, feedback 43/43, calibration 173/173, and exact calibration
  runtime 426 inputs / 1,488,348 bytes / SHA-256
  `d96158145f6a3cf89018247871ad2efff51bd2a27d3a6b2c8d596a6b9f9701e1`.
- No live/provider/deploy/environment/flag/room action was run.
- Aggregate verification and production/public build passed with 30 public
  pages, 976 source files, and 89 routes.

## Rollout

- Risk level: high because this prepares provider and durable-authority seams,
  although the implementation remains unreachable from customer runtime.
- Backward compatibility: additive dedicated workflow and optional dispatch
  metadata; existing callers omit it and preserve byte-equivalent behavior.
- Metrics/events to watch: none live in this slice. A later execution gate must
  watch admitted/replayed/closed allocation and content-free settlement results.
- Follow-up slice: independent exact-head review and merge, then a fresh
  exact-merged-SHA human authorization for one isolated Preview-shadow execution
  with explicit credentials, deploy, room, spend, privacy, and stop authority.
