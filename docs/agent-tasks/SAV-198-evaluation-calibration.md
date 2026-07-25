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
- Authorization boundary: SAV-248 v10 is a non-executable proposal because the earlier ≤96/$3 authorities were consumed by v1/v2/v3/v4/v5/v6/v7/v8/v9. The proposal binds the correct terminal activation commits `4acdf549eecad5fe88d685c28fbc98d7475b8f05`, `d0c4fc4c028b10d8616fdde337be150315a7798c`, `1baee0b82c61cb6d89dbe9dc23cee1beccf72b31`, `feb7591898145bcb6bec9526c650f705f2530270`, `78295d40c19ba366a64956010af9535b283aaf44`, `b23e5d54fb21d72e1043a4404fea1ac691e31a89`, `52f7e105db37ab0a48d3b4a2e5a692d0e1ccd840`, `a8f342f39f548401d91b5c2cf9f073b3f0cfd9cd`, and `08864c3bfad23d6c394847ccbef5ffca87347275`, records pending owner approval, and leaves the reviewed source commit null. The runtime refuses before readiness or credential delivery. A future reviewed authorization would still hard-bind the GitHub repository/owner/actor identities, exact ref, and two no-force/no-delete/restricted-writer rulesets.
- Proposed v10 successor plan after SAV-327 source repair: the current symmetric proposal contains 64 calls (two runs for each of 32 scored fixtures) at 2,626,785,000 nano-USD (2.626785) deterministic worst case, plan hash `b4d625bf10460aeb1992e73943640489a4474492ec85aded56fa6a30fdc186fb`, and request-policy hash `24cf06b506ef83a19f403fdfb9b19df56a69d64ad48547ae6b921888f26b9f5d`. The real v9 ledger has already failed terminally and is non-reusable; the next paid run must use a fresh exact owner authorization and this successor ledger lane before any GitHub or provider action.
- SAV-248 v10 has since also failed terminally and is non-reusable: it activated the ledger, made one paid provider attempt, spent `$0.0142825`, and stopped on `evidence_reused_across_findings` for `product_sense:01:caregiver-planning`. SAV-327 owns the source repair. Any successor paid run must regenerate the reviewed plan/hash from the repaired source and receive fresh owner authorization before provider execution.
- Semantic-review boundary: the proposed paid scorer captures the exact decoded UTF-8 message-content bytes before JSON parsing into an authenticated private directory outside Git. The launcher atomically persists a pending v10 automated report, finalizes the complete response set, waits for two decision-only panels plus separately operator-authored execution authority, publishes a sanitized passed/failed semantic report, atomically finalizes the automated report, and deletes raw capture on terminal normal/SIGINT/SIGTERM paths.
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
