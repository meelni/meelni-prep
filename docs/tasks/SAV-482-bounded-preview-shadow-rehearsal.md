# SAV-482 Bounded Preview-Shadow Rehearsal

## Intent

- User request: continue through the urgent lifecycle work, then wire and run
  the bounded adaptive Preview-shadow rehearsal.
- Product outcome: a human-authorized, synthetic-only Preview run can activate
  the durable control plane, allocate before LiveKit dispatch, and return
  sanitized evidence without changing interviewer speech or customer output.
- Why now: SAV-480 and SAV-481 merged the durable authority, private job
  envelope, and provider-free runtime, but deliberately shipped no executable
  owner tool or trusted Preview worker entrypoint.

## Tracking

- Parent: SAV-476 remains open and human-gated.
- Deliverable: SAV-482, In Progress.
- Branch: `codex/SAV-482-bounded-preview-shadow-rehearsal`.
- Base: exact `origin/main` at
  `aa71d4ca323ef0aacd4259a9d0f30d3f4d6f90c8`.

## Scope

- In scope: external create-only owner packet tooling; exact Ed25519 signing
  and provider-free verification; an explicit server-only operational runner;
  Preview-only job bootstrap before `ctx.connect()`; one-cell-at-a-time matrix
  execution and sanitized terminal reconciliation; source-contract and
  provider-free tests.
- Out of scope: customer/ordinary session-start routes, customer data,
  feedback or scoring, Preview influence, Production shadow/influence,
  default-on, launch GO, and automatic execution of the 28 live voice cells.
- Authority: repository merge is not executable authority. After merge the
  owner signs a fresh exact-merged-SHA packet. The packet authorizes only one
  bounded `preview_staging` Shadow run and expires within 24 hours.

## Technical boundary

1. `prepare` writes separate structural authorization and unsigned owner
   payload files outside Git custody with owner-only permissions.
2. `sign` is an explicit human command using the external Ed25519 private key;
   no agent reads or emits the key.
3. `verify` authenticates the exact merged SHA, configuration and selected
   candidate digests, stage/environment/cohort/exposure, owner references,
   nonce, decision time, expiry, and all denied authorities.
4. `activate` consumes the authenticated decision through the SAV-480 durable
   CAS. `start-cell` allocates a lease before LiveKit room/dispatch creation.
5. The Preview worker recognizes only the closed SAV-481 job envelope before
   connecting. Ordinary jobs continue through the existing entrypoint.
6. Every cell remains Shadow-only. Terminal receipt or stop-incomplete evidence
   is content-free and reconciled outside the speech path.

## Validation

- Focused owner-tool, workflow, LiveKit metadata, and Python job tests.
- Disposable local PostgreSQL activation/allocation/replay/accounting matrix.
- Node 22 `check`, agent/core/integration/operations/benchmark/feedback,
  pinned Python, calibration attestation, `verify:agent`, build/public checks,
  exact-range security scan, independent review, and hosted PR checks.

### Provider-free candidate evidence

- Exact runtime: Node 22.22.0, Python 3.12.8, OpenAI 3.3.1 and LiveKit
  Agents 1.6.5.
- Focused owner/operator/workflow: 14/14; API route: 2/2; source/deploy
  contracts: 7/7; pinned Preview Python: 28/28.
- Broad suites: agent 108/108, integrations 113/113, operations 78
  TypeScript + 46 Node, API 414/414, benchmark 34/34, feedback 43/43,
  calibration 173/173 and pinned Python 333/333.
- Frozen interviewer baseline:
  `e64f58db923c40b62355d8c49cd6af4cc24de7401048051c23c3edb6a9cb37ef`.
- Calibration runtime: 426 inputs, 1,488,348 bytes, SHA-256
  `d96158145f6a3cf89018247871ad2efff51bd2a27d3a6b2c8d596a6b9f9701e1`.
- `npm run check`, `db:check`, the disposable PostgreSQL durable matrix,
  full database migration verification and `npm run verify:agent` passed.
  The final build verified 30 public pages, 982 source files and 90 routes.
- Exact-head security validation rejected the redirect/capability candidate:
  Python 3.12 refused POST redirects for 301, 302, 303, 307 and 308 without
  forwarding the body. A separate PostgreSQL PoC reproduced an admission/stop
  lock-order deadlock; admission now follows the canonical run-then-lease
  order, and the disposable database test proves it waits on the run without
  holding the lease.
- Provider execution, environment mutation, deployment, room creation and live
  matrix work were not performed during this repository validation boundary.

## Rollout

- Merge the provider-free candidate first.
- Prepare and sign one fresh exact-merged-SHA Preview artifact.
- Deploy only the isolated `meelni-preview` interview worker.
- Activate one run and execute cells serially while watching durable budget,
  lifecycle, and stop evidence. Any hard stop revokes new leases immediately.
- Keep SAV-476 open until all 28 live cells and owner review are complete.
