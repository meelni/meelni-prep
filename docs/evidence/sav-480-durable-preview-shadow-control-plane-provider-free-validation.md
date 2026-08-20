# SAV-480 Durable Preview-Shadow Control Plane: Provider-Free Validation

Date: 2026-08-20

## Scope and authority

- Exact base: `5cf8e4f0c6e99cd41eaa582fa1e85fabc173e3be`.
- Repository slice only. No application, session-start, package public-index, or
  Python runtime consumer imports the durable control plane.
- No environment pull, provider call, spend, deployment, LiveKit room,
  dispatch, flag mutation, speech influence, Production/default-on action, or
  GO/NO-GO action occurred.
- The key registry is inert checked public material. The verifier and store
  receive all trust capabilities explicitly; they perform no ambient key,
  credential, or environment reads.
- SAV-479 remains an oracle only. No reference-model transition is imported by
  the durable module or application/runtime code.

## Durable database boundary

- Migration lineage: 44 ordered Drizzle migrations through
  `0043_sav_480_durable_preview_shadow_control_plane`.
- Canonical database shape: 48 public tables; all 48 have RLS enabled.
- New authority tables: 6, each with forced RLS, no policy, no security-definer
  function, no `PUBLIC`/`anon`/`authenticated` grant, and only the minimum
  `service_role` operations.
- Composite foreign keys bind receipt/incident rows to the exact lease
  run/ordinal/allocation-revision/configuration tuple and bind termination
  acknowledgements to the exact run/lease/incident tuple.
- Canonical schema fingerprint:
  `6527d4c95a623e4759c92197f380e9bded41ca557165d4300e4e497fedc6cd48`.
- Full clean/upgrade/rolling/reconciliation migration rehearsal: passed.
- `drizzle-kit check` with the split legacy/durable schema discovery: passed.

The disposable loopback PostgreSQL matrix passed concurrent same and divergent
activation, distinct nonce/reference races, process-restart replay, DB-clock
expiry while locked, exact activation replay after expiry, absent-run expiry
denial, lease allocation races, post-write expiry rollback before lease return,
executable versus closed lease replay,
run-control revocation of open leases, wrong/cross-run capabilities,
receipt/incident/stop-event replay and divergence, evidence reconciliation for
revoked leases, upward spend after stop, retained-reservation excess,
termination acknowledgement, cap stop with the final admitted lease preserved,
injected partial-transaction rollback, ordinary-role denial, service-role
access, and absence of raw authorization/signature/capability/customer content
in rows.

## Focused contracts

- Owner decision verifier, canonical evidence builders, and workflow facade: 9
  passed, 0 failed.
- Durable source/no-wiring/privacy contracts: 3 passed, 0 failed.
- Migration, auth-doctor, migration-doc, and source-focused Node contracts: 14
  passed, 0 failed.
- Hostile accessors, symbols, non-enumerables, prototypes, and Proxy reflection
  traps fail with closed content-free errors and cannot leak caller text.
  Artifact, authorization, and key-registry inputs are snapshotted and bounded
  before date parsing or Ed25519 work; oversized signatures, timestamps, tokens,
  arrays, objects, nested runtime configuration, and JSON fail closed before
  cryptographic verification.

## Broad provider-free matrix

All Node evidence used exact Node 22.22.0.

- `npm run check`: passed, including lint, both typechecks, dependency
  boundaries, Semgrep (0 findings), and 21 quality tests.
- `npm run test:agent`: 108 passed.
- `npm run test:core`: 111 passed.
- `npm run test:integrations`: 111 passed.
- `npm run test:operations`: 46 passed.
- `npm run test:interviewer-benchmark`: 34 passed.
- `npm run test:feedback`: 43 passed.
- `npm run test:calibration`: 173 passed.
- Pinned package environment: LiveKit Agents 1.6.5 and OpenAI 3.3.1; full
  Python agent suite 322 passed, 0 failed, 0 skipped.
- `npm run verify:agent`: passed. Its ambient-Python copy reports five SDK-only
  skips; the separately recorded pinned-package run above passed all 322 with
  zero skips.
- Production build: passed, including public-build verification for 89 routes.
- Public source verification: passed for 30 pages and 974 files.

## Calibration preservation

The Drizzle config discovers the durable schema as a second schema file. The
legacy schema barrel does not export it, so evaluation runtime code cannot pull
the control plane into the sealed calibration graph.

- Metafile input count: 426.
- Bundle bytes: 1,488,348.
- Bundle SHA-256:
  `d96158145f6a3cf89018247871ad2efff51bd2a27d3a6b2c8d596a6b9f9701e1`.
- External imports: the accepted 17 Node built-ins only.
- Reproduction: byte-for-byte passed in `calibration:verify-runtime`.

## Non-acceptance observations

A bare `npm run db:preflight` loaded the provider-free worktree `.env.local`
and then denied at the remote-identity guard before opening a database or
network connection because no Preview/Production pull identity was supplied.
It was not used as acceptance evidence and was not rerun. The migration
manifest/preflight contracts are instead covered by the focused tests and full
loopback migration rehearsal above.

## Remaining gates

- Freeze the exact clean commit.
- Run an exact-base security diff scan against
  `5cf8e4f0c6e99cd41eaa582fa1e85fabc173e3be`.
- Obtain independent exact-head review before any push or PR.
