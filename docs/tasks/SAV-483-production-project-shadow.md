# SAV-483: Isolated Production-Project Shadow Rehearsal

## Intent

- User request: use the existing paid LiveKit Production project for the
  bounded adaptive-interviewer Shadow rehearsal instead of a separately billed
  Preview project.
- Product/operator outcome: exercise one explicit synthetic Shadow room on the
  reviewed Production interview worker without influencing an interview or
  changing customer defaults.
- Why now: LiveKit plans are per project, the recorded Preview project is not
  accessible to the owner account, and the paid project already uses both Ship
  deployment slots for the interview and dormant demo workers.

## Slice

- Primary slice: LiveKit interview runtime and guarded provider operations.
- Secondary slices: durable Shadow admission, owner authority, lifecycle and
  spend evidence.
- Skills: Linear workstream, LiveKit runtime, ops connections, architecture,
  vertical slice, engineering memory, and PR prep.

## Linear Tracking

- Project: Meelni.
- Parent: SAV-476.
- Child: SAV-483.
- Related blocked Preview execution: SAV-482.
- State: In Progress.

## Scope

- In scope: a closed Production-project transport topology for Preview-shadow
  semantics; a fresh exact owner decision; a distinct one-use Production
  action for the interview-worker deploy; explicit synthetic dispatch; durable
  allocation before room creation; terminal receipt or stop-incomplete
  reconciliation; rollback to the ordinary all-off worker configuration.
- Out of scope: ordinary customer-room construction, the demo worker, Preview
  or Production influence, canary traffic, default-on, launch GO/NO-GO, and
  direct unguarded provider commands.
- Assumption: the existing Production interview deployment is updated in place;
  no third LiveKit deployment is created.

## Product Lens

- Audience: the human product owner operating the adaptive-interviewer gate.
- Lever: reliability and launch confidence, not customer activation.
- Product Compass: preserve realistic PM interviewing and post-interview-only
  evaluation; Shadow output is silent and read-only.

## Technical Plan

- Extend the closed rehearsal topology without calling it rollout
  `production_shadow`: the app/database lane remains staging and the LiveKit
  transport alone is the paid Production project.
- Require independent exact bindings for candidate, config, selected adapter,
  LiveKit project/agent, staging control-plane endpoint, run, expiry, and
  exposure `none`.
- Add a guarded Production-shadow deploy entrypoint that consumes an exact
  Production interview deploy action before changing the Production worker.
  Keep logical run activation under the separate Preview-shadow owner decision,
  and require a third one-use room action after exact deployment postflight.
- Reuse the existing private job metadata and worker branch. Ordinary metadata
  stays on the existing path and never constructs the Director adapter.
- Add a provider-free operator mode that uses staging database/control-plane
  authority with the exact Production LiveKit project and agent identity.

## Validation

- Focused owner/operator/Production-entrypoint/package/Python behavior tests.
- Existing durable PostgreSQL activation/allocation/reconciliation contracts
  remain covered by the repository integration and agent verification gates.
- Node 22 check, agent/core/integration/operations suites, pinned Python,
  benchmark/feedback/calibration, verify-agent, build and public verification.
- Exact-head security diff scan before publication; hosted PR review and CI
  remain the independent publication gates.
- After merge only: fresh owner artifacts, exact Production deploy source
  postflight, one synthetic room, terminal reconciliation and all-off rollback.

### Provider-free repository evidence

- Exact Node.js 22.22.0 `npm run check`: green, including dependency graph,
  Semgrep with zero findings over 1,384 targets, and 21 quality tests.
- Agent 108/108; operations 83 TypeScript + 47 Node; pinned Python 334/334;
  benchmark 34/34; feedback 43/43; calibration 173/173.
- `npm run verify:agent`: terminal green, including integration, lint, pinned
  runtime contracts, Next.js production build, 30 public pages over 984 source
  files, and 90 public build routes.
- `bash -n agent/interview/deploy.sh`, TypeScript application/test typechecks,
  focused Production authorization/operator tests, Python entrypoint isolation,
  `git diff --check`, and provider-free CLI fakes: green.
- No LiveKit mutation, room, dispatch, provider call, secret read, or environment
  promotion occurred during repository validation.

## Rollout

- Risk: high because one reviewed worker version is deployed in the paid
  Production project, even though Shadow exposure is none.
- Backward compatibility: ordinary Production metadata and dispatch stay
  byte-for-byte on the current path; absence of the exact private envelope is
  all-off.
- Watch: deployment source SHA/health, ordinary-session error rate, admission
  denial, allocation/reconciliation revision, reserved/reconciled nano-USD,
  settle result, and rollback source SHA.
- Follow-up: SAV-476 retains all influence/canary/default/launch authority.

## Freeze

- No live use of the SAV-482 Preview packet.
- No provider mutation before this repository slice is merged and every fresh
  exact run, deploy and room artifact verifies in its own domain.
- No Production room is created through a generic CLI or dashboard path.
