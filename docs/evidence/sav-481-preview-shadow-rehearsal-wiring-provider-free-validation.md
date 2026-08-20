# SAV-481 Preview-Shadow Rehearsal Wiring Validation

## Boundary

- Exact base: `7e6a6b7d80bf5cae1fcd8ae85256cb515fade616`.
- Scope: repository-only wiring for a later isolated Preview-shadow rehearsal.
- Runtime status: default-off and unreachable from the ordinary interview/session-start paths.
- External activity: no credential read, environment pull, provider request, spend,
  deploy, LiveKit room, flag change, Preview influence, Production/default-on,
  or launch action.

The implementation allocates a durable session lease before the dedicated
workflow may call the injected LiveKit provider. It transports the raw worker
capability only in private job metadata and an authenticated internal
reconciliation request. The capability does not enter room metadata,
participant metadata, durable evidence, logs, or customer output. The Python
bootstrap accepts only injected admission verification and transport
dependencies; the ordinary interview agent remains unchanged.

## Focused validation

- TypeScript rehearsal workflow and cross-runtime metadata: 8/8 passed.
- Python job metadata, admission, settlement, and hostile-input boundary: 7/7
  passed in the pinned agent environment.
- Source/privacy contracts: 3/3 passed.
- LiveKit integration contracts: included in the 113/113 integrations suite.
- Full pinned Python agent suite: 329/329 passed with no skips.
- Workflow matrix: 1,066 passed.
- Local application matrix: 516 passed.

The regressions prove allocation-before-room ordering, exact replay handling,
zero provider calls for closed or mismatched authority, exact private dispatch
metadata, cross-runtime byte parity, injected-only construction, duplicate-key,
oversize, nesting, non-finite, tamper, and reflection rejection, and exact
receipt/stop-incomplete reconciliation projection. Thrown, malformed, and
hostile LiveKit results normalize to a content-free retryable failure.

## Repository gates

- Exact Node.js: 22.22.0.
- `npm run check`: passed, including typechecks, dependency boundaries, quality
  contracts, and Semgrep with zero findings.
- `npm run verify:agent`: passed, including the 489-test core matrix, agent,
  integrations, Python, lint, production build, and public verification.
- Public verification: 30 pages, 976 source files, and 89 build routes.
- Interviewer benchmark: 34/34 passed with baseline digest
  `e64f58db923c40b62355d8c49cd6af4cc24de7401048051c23c3edb6a9cb37ef`.
- Feedback suite: 43/43 passed.
- Calibration suite: 173/173 passed.
- Calibration runtime attestation remained byte-identical: 426 inputs,
  1,488,348 bytes, SHA-256
  `d96158145f6a3cf89018247871ad2efff51bd2a27d3a6b2c8d596a6b9f9701e1`.

## Residual authority and work

This evidence is not live authorization. The dedicated workflow has no app,
session-start, or ordinary agent consumer, and no concrete live durable
admission verifier is constructed. A later exact-merged-SHA execution gate
must separately authorize credentials, deploy, provider/spend, privacy,
room/session limits, stop thresholds, and the bounded voice matrix. The parent
SAV-476 rollout remains open. Linear synchronization is paused until the
connector is reauthenticated.
