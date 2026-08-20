# Adaptive Interviewer Preview-Shadow Provider-Free Validation

Date: 2026-08-20
Base commit: `a618adab77441f378e9cd0775c93e7c9ce38b7fb`
Base tree: `0de7929d6b8c1944a6d4d4128c98a751a82f0d4b`
Status: replacement repository candidate validated; live execution unauthorized and blocked

## Authority and intake status

The checked pending packet is deliberately non-executable: it has no candidate
SHA, owner decision reference/time/expiry, or nonce, and its execution authority
is `false`. The broad owner direction is not reused as live authority. A future
fresh authorization must bind the exact merged SHA and complete config digest.

The PR-sized Linear child still cannot be created or synced because the Linear
connector requires reauthentication. No issue ID was invented. SAV-476 remains
open, and no push or PR is permitted until the child is available and an
independent exact-head review completes.

No credential/environment read, provider call/spend, deployment, room/session,
flag mutation, Preview influence, Production/default-on, or GO action occurred.
The 28-cell live rehearsal matrix remains `unperformed`.

## Exact runtime pins

- Node `22.22.0`, npm `10.9.4`.
- Python `3.12.8`, `livekit-agents==1.6.5`, `openai==3.3.1`.
- Preview config SHA-256:
  `c6db8b06428fde9a7ffb13d78641e66efc584203c7862db93de42a9d9d64d89c`.
- Selected candidate SHA-256:
  `b8cc8547c6d2573b7d323b3327ab31bf74c237a1486c13e0e7780a63880e25ac`.

## Provider-free contract results

- Preview TypeScript focused remediation: 16 passed, 0 failed.
- Full exact-Node-22 `test:agent`: 108 passed, 0 failed.
- Preview Python runtime plus adapter focused remediation: 38 passed, 0 failed
  in the pinned Python environment.
- Pinned full Python agent: 322 passed, 0 failed, 0 skipped.
- Production/default-on authorization: 15 passed, 0 failed.
- Core: 489 passed, 0 failed.
- Integrations: 111 passed, 0 failed.
- Operations: 74 TypeScript plus 46 Node tests passed, 0 failed.
- Interviewer benchmark: 34 passed, 0 failed.
- Frozen interviewer baseline verified at
  `e64f58db923c40b62355d8c49cd6af4cc24de7401048051c23c3edb6a9cb37ef`.
- Feedback/evidence: 43 passed, 0 failed.
- Calibration: 173 passed, 0 failed; provider-free bakeoff verified at
  `bd8ad7e89b0b1d070bc83f057e5278b5b235f9be9816f9eccce88d65d6529912`.
- `npm run check`: passed, including type checks, package boundaries, and
  tracked-source Semgrep with zero findings.
- `npm run verify:agent`: passed, including its complete local/fixture/workflow/
  integration/Python matrix, production build, and public-surface verification.
  The public checks covered 30 pages, 967 source files, and 89 built routes.

## Calibration graph and attestation

An independent exact-base/current metafile comparison proved:

- base inputs: 424;
- candidate inputs: 426;
- additions: only
  `packages/agent/src/interviewer-preview-shadow.ts` and
  `packages/agent/src/interviewer-preview-shadow-control-plane.ts`;
- removals: none;
- external imports: the exact existing 17-entry list, all Node builtins;
- bundle bytes: 1,488,348;
- bundle SHA-256:
  `d96158145f6a3cf89018247871ad2efff51bd2a27d3a6b2c8d596a6b9f9701e1`.

`calibration:verify-runtime` rebuilt the bundle byte-for-byte and matched the
checked manifest. The bundle diff contains only six inert declarations for the
two new modules; it contains no Preview runtime construction, authorization,
provider, or execution path. The agent package index does not export the
reference-model API; one inert side-effect import retains that source in the
calibration attestation graph only. The application and Python runtime do not
import or construct it.

## Proven fail-closed boundaries

- Duplicate JSON keys, hidden/symbol extras, sparse arrays, unsafe integers,
  padded/case-varied bindings, stale/expired values, and digest/version drift
  fail closed. Authorization JSON is capped at exactly 64 KiB UTF-8 and nesting
  depth 32 before traversal.
- Validated TypeScript values are deeply frozen; Python leases/receipts are
  copied into frozen values.
- Activation revalidates the complete authorization against independently
  supplied SHA/config/selection/target/time bindings and a fresh opaque trusted
  owner-decision verification immediately before the durable CAS interface.
  Independent in-memory reference stores demonstrate that only a future durable
  authenticated adapter can provide global one-time authority.
- Lease, terminal-receipt, and stop-incomplete self-digests provide integrity/
  idempotency, not authenticity. The future durable adapter must authenticate
  worker provenance/channel. Missing/rejected durable
  admission produces typed `disabled|unavailable` with `adapter=None`; no
  OpenAI adapter or shadow work begins.
- Receipt identity binds run, lease, allocation revision, attempt digest/count,
  outcome, and spend. Exact replay is idempotent; divergent replay conflicts.
- Every attempt retains at least its conservative reservation. Ambiguous spend
  is never reclaimed, and upward reconciliation closes admission before any
  next request. Multiple already-open sessions continue reconciling after stop;
  the distinct exact 25x aggregate sanity ceiling cannot truncate otherwise
  valid per-session evidence.
- Shadow settle coalesces concurrent callers on one bounded operation, closes
  admission before cancellation, awaits cancellation, always attempts
  shutdown/adapter close in a finally path, and never touches speech,
  transcript, feedback, or customer output. Confirmed cleanup emits one
  immutable content-free terminal receipt. Unconfirmed cleanup emits one
  separate stop-incomplete incident, retains the full session reservation, and
  stops central allocation; it never claims successful settlement.
