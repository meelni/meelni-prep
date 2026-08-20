# Adaptive Preview-Shadow Execution Gate

Status: repository candidate validated; Linear child creation/sync blocked by
connector reauthentication; no live authorization

## Intent

- User request: continue the adaptive-interviewer workstream after the owner
  said “I approve all gates.”
- Outcome: make `synthetic -> preview_shadow` technically executable and
  auditable after a future fresh authorization bound to the exact merged SHA.
- Why now: the selected OpenAI Responses Director adapter is merged, but the
  repository has no live-stage authorization, attempt-spend, construction, or
  bounded settle/rehearsal boundary.

## Slice

- Primary: authenticated interview session / LiveKit Director shadow.
- Secondary: owner authorization, spend accounting, sanitized evidence, and
  operations memory.
- Workflow owner: the Preview-shadow execution gate. The canonical interview
  lifecycle, transcript writer, feedback pipeline, controller, and speech
  runtime remain authoritative.

## Linear tracking

- Project: Meelni.
- Parent: SAV-476 remains open and human-gated.
- Child: unavailable because the Linear connector requires reauthentication.
  No issue ID is invented; the future PR must not use SAV-476 as its closing
  issue or title key. Sync this intake to a PR-sized child before publication.
- Owner direction reference:
  `linear:SAV-476:comment:fe76af4b-9a83-4899-b38e-db985e1f3c84`.

## Scope

- In: closed Preview-shadow authorization/request contracts, exact runtime
  config and digest, injected runtime factory, conservative attempt ledger,
  provider-free lifecycle/rollback rehearsal, and content-free evidence.
- Out: credentials or environment reads, provider calls/spend, deploys,
  rooms/sessions, flags, Preview influence, customer data, Production,
  default-on, and GO/NO-GO.
- Assumption: “approve all gates” authorizes progression and this repository
  preparation, but is not a reusable wildcard. Live execution requires a new
  owner authorization containing the exact merged SHA, config digest, nonce,
  decision time, expiry, and external decision reference.

## Technical plan

- `@meelni/agent`: own the closed authorization, exact Preview configuration,
  canonical digest, pending request generator, and pure control-plane reference
  protocols. A follow-up authenticated durable adapter owns one-time activation.
- Python agent: own typed default-off/unavailable provider-neutral construction,
  attempt reservation/reconciliation, lifecycle settle/shutdown, and sanitized
  evidence.
- Application entrypoint: remain literal `adapter=None`, with every environment
  flag default off. The new factory is injectable only and performs no ambient
  credential lookup.

## Validation

- Focused TypeScript and Python contract suites.
- Pinned `livekit-agents==1.6.5` and `openai==3.3.1` venv suites.
- Agent/core/integrations/operations, benchmark/baseline, feedback/evidence,
  calibration graph/attestation, exact Node 22 checks, build/public verification,
  and diff/secret scan.
- Live matrix: deliberately closed and `unperformed`; no provider or room may
  be contacted by this slice.

Completed provider-free evidence is recorded in
`docs/evidence/adaptive-interviewer-preview-shadow-provider-free-validation.md`.
The independent calibration graph delta is exactly 424 -> 426 inputs with only
the two intended Preview-shadow TypeScript modules added, no removals, builtin-
only externals, 1,488,348 bundle bytes, and SHA-256
`d96158145f6a3cf89018247871ad2efff51bd2a27d3a6b2c8d596a6b9f9701e1`.

## Rollout

- Risk: high if authorization, replay, spend, or shadow isolation is bypassed;
  no current runtime behavior changes while the entrypoint remains unwired.
- Rollback: keep all flags off for new sessions, atomically deny admission,
  retain conservative reservations for ambiguous attempts, settle/cancel
  in-flight shadow within the configured bound, and leave speech/transcript/
  feedback authority untouched.
- Follow-up: create the Linear child after reauthentication, merge through
  exact-head review and terminal CI, then ask for one fresh exact-merged-SHA
  Preview-shadow authorization before any live operation.
