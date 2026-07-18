# SAV-198 Evaluation Calibration

## Intent

- User request: prove PM feedback quality against an adjudicated gold set before relaunch.
- Product/user outcome: feedback evidence, completion state, score agreement, and repeated-run stability have an honest calibration-evidence gate.
- Why now: SAV-196 made transcript evidence fail closed and SAV-197 made generation retry-safe; neither proves live model quality.

## Slice

- Primary slice: feedback and evaluation.
- Secondary slices: reusable fixtures and operator tooling.
- Relevant skills: `meelni-feedback-evaluation`, `meelni-vertical-slice-playbooks`, `meelni-engineering-memory`, `meelni-pr-prep`.

## Linear Tracking

- Project: Meelni.
- Parent slice issue: SAV-168.
- Child deliverable issue: SAV-198.
- Current Linear state: In Progress.

## Scope

- In scope: at least 40 synthetic PM transcripts spanning weak, average, and strong sufficient answers; agent-authored semantic adjudication candidates with exact evidence; an explicit product-owner/PM signoff gate; dimension score bands; model provenance; a bounded workflow-backed calibration harness; machine-readable reports; and operator docs.
- Out of scope: customer transcripts, remote database writes, paid provider calls without explicit authorization, model tuning, and launch-readiness claims from deterministic fixtures.
- Assumptions: the SAV-196 canonical transcript validator and SAV-197 generation workflow remain the production boundaries under test.

## Technical Plan

- Fixture files: `packages/test-fixtures/src/evaluation-calibration.ts` and behavior tests.
- Workflow files: `lib/evaluation/calibration.ts` and behavior tests using `generateFeedbackWorkflow` with an in-memory store.
- Operator files: `scripts/run-evaluation-calibration.ts` and package scripts.
- Provider dependency: optional OpenAI execution through the existing scorer, guarded by an explicit paid-calibration acknowledgement, an all-approved adjudication artifact, the fresh pinned `gpt-5.1-2025-11-13` + official endpoint + default-tier pricing contract, zero SDK retries/redirects, a five-minute request timeout, a 96-physical-attempt cap, and a $3 hard spend cap.
- Authorization boundary: SAV-248 v3 is a non-executable proposal because the earlier ≤96/$3 authority was consumed by v1/v2. The proposal binds the correct terminal activation commits `4acdf549eecad5fe88d685c28fbc98d7475b8f05` and `d0c4fc4c028b10d8616fdde337be150315a7798c`, records pending owner approval, and leaves the reviewed source commit null. The runtime refuses before readiness or credential delivery. A future reviewed authorization would still hard-bind the GitHub repository/owner/actor identities, exact ref, and two no-force/no-delete/restricted-writer rulesets.
- Proposed v3 plan: the current symmetric proposal contains 64 calls (two runs for each of 32 scored fixtures) at 2,247,265,000 nano-USD ($2.247265) deterministic worst case, plan hash `a0ca65f49bcbf6f0140701a1eb2e58d018b916e18a5bf80b3c438938d4062363`, and request-policy hash `884a3ff52b5dc309b982942740bb9b8e6cb2529e4472be47b3ac4abd8de628db`. It must be regenerated after the final source commit and pricing refresh, then receive fresh exact owner approval before any GitHub or provider action.
- Semantic-review boundary: the proposed paid scorer captures the exact decoded UTF-8 message-content bytes before JSON parsing into an authenticated private directory outside Git. The launcher atomically persists a pending v9 automated report, finalizes the complete response set, waits for two decision-only panels plus separately operator-authored execution authority, publishes a sanitized passed/failed semantic report, atomically finalizes the automated report, and deletes raw capture on terminal normal/SIGINT/SIGTERM paths.
- Startup boundary: a trusted POSIX launcher first requires the externally supplied exact owner-approved commit, disables Git replacement objects, binds all launch artifacts to that commit, pins the signed Node 22.22.0 and GitHub CLI binary digests, and executes only reverified owner-only sealed artifact/binary copies. It starts the sealed Node bootstrap under `env -i` without credentials. The bootstrap verifies and starts the reproducible standalone runtime bundle with empty `execArgv`, no package loader, and no mutable `node_modules`; it relays readiness only after executable authorization, direct tracked-blob comparison to the same reviewed source, and private-path preflight pass. The launcher retrieves and sends credentials through a private pipe only afterward. Unsafe preload, inspector, TLS-keylog, OpenSSL/custom-CA, proxy, debug, profiler, coverage, and endpoint state is rejected before credential delivery/client construction and before every GitHub authority request.
- Request boundary: every request must match the activated plan, then a custom guarded fetch rechecks fresh pricing and canonical GitHub authority and atomically consumes the reservation's one physical-dispatch allowance. Re-entry is counted and rejected before HTTP.
- Docs: calibration contract, operations runbook, and a checked preflight report.

## Validation

- Required commands: calibration preflight/self-test, fixture/core/workflow tests, `npm run check:ci`, `npm run build`, and `npm run verify:agent` when the local environment permits it.
- Fixtures: 10 Product Sense, 10 Execution, 10 Strategy, and 10 Behavioral cases; every round includes weak, average, and strong sufficient answers plus full, partial, short, and low-signal states.
- Acceptance thresholds: 100% exact evidence validity, insufficient handling, and model identity; at least 80% pooled and per-dimension score agreement; at least 75% per-round and per-state agreement; maximum repeated-run dimension range of 1; and exactly two runs per scored case within the unchanged 96-call authorization and $3 total estimated committed spend cap.

## Rollout

- Risk level: high because the result gates claims about feedback trustworthiness.
- Backward compatibility: additive test/operator surface only; no runtime schema or customer data changes.
- Metrics/events to watch: provider-run validity, score agreement, unstable dimensions, insufficient cases incorrectly sent to the model.
- Follow-up slice: merge and verify SAV-248, refresh pricing, bind the exact merged source commit, and request fresh explicit owner authorization for the regenerated plan. Only then may separately authorized work configure the protected ledger and execute one aggregate provider run with two independent semantic-review tasks. Keep SAV-198 In Progress until both machine-readable reports pass. Any crash or additional paid run requires another explicit authorization.
