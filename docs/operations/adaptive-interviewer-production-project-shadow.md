# Production-Project Shadow Runbook

Status: repository design; commands remain non-executable until SAV-483 merges

## Preconditions

1. Work from exact clean merged `main` and record its 40-character SHA.
2. Require terminal hosted checks, exact-head security review and independent
   acceptance for the SAV-483 PR.
3. Verify the canonical LiveKit project `meelni`, interview agent
   `CA_yawKG67rCMG4`, and current running version without printing secrets.
4. Pull and verify the staging control-plane environment and the Production
   deploy environment through their canonical owner-authenticated paths.
   When a separate Preview LiveKit project is unavailable, deploy staging with
   the exact control-plane-only capability. Ordinary staging voice routes must
   return `voice_unavailable_in_preview`; do not copy Production LiveKit
   credentials into the staging web runtime.
5. Prepare fresh external owner-only files. Never reuse SAV-482's
   Preview-project artifact or any consumed Production action.

## Order

1. Prepare, inspect, sign and verify the fresh logical Preview-shadow owner
   packet for the exact merged candidate. This makes no provider call.
2. Activate the staging durable run. Prefer the local owner-only staging
   database environment when its sensitive connection is available. Otherwise
   prepare the private closed activation request and send it only through the
   deployment-protected staging endpoint, which binds its exact deployed SHA
   and calls the same durable workflow. Activation requires no LiveKit
   credential and makes no LiveKit call. Do not allocate a room yet.
3. Prepare, inspect, sign and verify the separate Production interview-worker
   deploy action bound to the complete run-specific runtime snapshot.
4. Deploy only through the guarded `production-project-shadow` wrapper.
5. Prove the exact `meelni.source_sha` version is current and Running on
   `CA_yawKG67rCMG4`. Record its opaque deployment version.
6. Prepare, inspect, sign and verify one `livekit-production-shadow-room`
   action bound to that version, run, revision, session binding, matrix cell,
   expiry, project and agent.
7. Allocate and start exactly one explicit synthetic cell. Reconcile one
   terminal receipt or stop-incomplete incident.
8. Record sanitized spend/lifecycle/source evidence. Stop on any hard gate.
9. Rehearse stop and replace secrets with the ordinary eight-key runtime before
   redeploying the all-off worker through a fresh Production action. Prove the
   rollback source and health. The durable stop event uses only staging
   database/environment identity and requires no LiveKit credential.

## Guarded command surfaces

After activation, build the exact owner-only replacement runtime without
printing its contents:

```bash
npm run interviewer:preview-shadow:operator -- \
  prepare-production-project-runtime \
  --activation-path "$MEELNI_PREVIEW_SHADOW_ACTIVATION_PATH" \
  --control-plane-url "https://meelni-env-staging-meelni.vercel.app/api/internal/preview-shadow" \
  --ordinary-secrets-path "$MEELNI_LIVEKIT_PRODUCTION_INTERVIEW_SECRETS_FILE" \
  --output-path "$MEELNI_LIVEKIT_PRODUCTION_PROJECT_SHADOW_SECRETS_FILE"
```

Prepare and verify the deploy payload with
`production-action:livekit-interview --mode production-project-shadow`, then
set the signed artifact path in `MEELNI_PRODUCTION_ACTION_AUTHORIZATION` and
run only:

```bash
agent/interview/deploy.sh production-project-shadow
```

Use the read-only LiveKit version listing to confirm the current version is
Available/Running and its `meelni.source_sha` is the exact merged candidate.
Pass that opaque version to `prepare-production-project-cell`; its sanitized
JSON result provides the action, configuration hash and target fingerprint for
generic `production-action:owner prepare/sign/verify`. Then pass the signed
one-room artifact to `start-production-project-cell`. The start command
rechecks the current version/source through the read-only LiveKit CLI, then
consumes the action through fixed root-owned Node before durable allocation or
any LiveKit room call. Do not deploy the interview worker concurrently because
LiveKit dispatch is not version-selective.

The operator environment file is external and mode `0600`. It combines only
the staging database/environment identity with the exact Production LiveKit
URL, interview agent ID and owner-managed API credentials. Do not paste those
credentials into chat, shell history, tracked files, Linear or evidence.

## Forbidden shortcuts

- Do not call raw `lk agent deploy`, update secrets, create a room, or dispatch
  a job outside the guarded operator.
- Do not use the demo worker or automatic dispatch.
- Do not treat a healthy deploy as activation, a signed packet as deployment,
  or an expired run as worker rollback.
- Do not copy Production credentials into a tracked, chat, Linear, log or
  evidence surface.
- Do not run a second cell before terminal reconciliation and owner review of
  the first cell.
- Do not omit `OPENAI_API_KEY` from either exact secret-replacement file; an
  incomplete overwrite can make the shared interview worker unavailable.

## Stop conditions

Stop before provider work for any candidate/config/selected-digest/project/
agent/control-plane/source/expiry/revision mismatch. After provider admission,
stop for every existing fixed hard stop, spend cap, settlement ambiguity,
source-health regression, ordinary-session regression, or rollback failure.

## Handoff evidence

Record only exact public SHAs/IDs, closed result codes, revisions, timestamps,
integer reservations/spend, deployment health, and rollback source identity.
Do not record room names, capabilities, tokens, raw errors, prompts,
transcripts, provider payloads or customer identifiers.
