# Production Web Shadow Canary Runbook

Status: repository design; disabled until SAV-487 merges and a fresh
Production web configuration action is consumed

## Preconditions

1. Require an exact merged SAV-487 candidate, terminal hosted checks, sealed
   exact-range security scans and independent acceptance.
2. Keep the Production interview worker on the exact Shadow-capable source and
   the logical Preview-shadow run active under its existing owner authority.
3. Configure the Production web route only through the guarded
   `vercel-production-web-shadow-canary` action, setting the explicit enable
   flag, exact owner Supabase UUID, active run ID, worker candidate SHA and
   one-hour-or-shorter expiry. Do not expose them as `NEXT_PUBLIC_*`.
4. Prepare a fresh one-room Production-project Shadow action and start exactly
   one cell through `start-production-project-cell`.

## Owner flow

1. Open `/dashboard/internal/preview-shadow-canary` while signed into the exact
   owner Production account.
2. Select the freshly created external `connection.json`. Do not paste its
   contents into chat, Linear, a shell argument, a URL or a tracked file.
3. Confirm the page reports the expected round/voice condition and connects
   to the interviewer. The page rejects a token unless its decoded LiveKit
   room, owner identity, expiry and microphone-only grant match the same
   private connection record; LiveKit independently verifies its signature.
4. Exercise microphone mute/unmute, ordinary interview turn-taking,
   connection recovery and explicit disconnect. Director Shadow output is not
   displayed or spoken.
5. Reconcile the worker terminal receipt or retained incident through the
   existing operator. Record only sanitized closed evidence.
6. Disable the Production web gate and restore the ordinary all-off worker
   under their respective fresh Production actions.

## Production web configuration action

Use the exact merged main checkout and the READY Production deployment created
from that merge. Link the canonical Vercel project with
`npx --yes vercel@55.0.0 link --yes --project meelni --scope meelni` before the
guarded action. Keep every generated file in a new external mode-`0700`
directory; do not paste the owner UUID or run into chat or Git.

Create the closed config with `npm run
production-action:vercel-shadow-canary -- write-config`, providing operation
`enable`, the exact source deployment ID, merged web SHA, worker SHA, owner
UUID, run ID, expiry and external output path. Then prepare and sign the exact
one-use action:

```bash
npm run production-action:vercel-shadow-canary -- prepare \
  --config-file "$CONFIG" \
  --output-path "$UNSIGNED"
npm run production-action:owner -- sign \
  --payload-path "$UNSIGNED" \
  --artifact-path "$AUTHORIZATION" \
  --key-id meelni-owner-2026-07
npm run production-action:vercel-shadow-canary -- verify \
  --config-file "$CONFIG" \
  --artifact-path "$AUTHORIZATION"
npm run production-action:vercel-shadow-canary -- apply \
  --config-file "$CONFIG" \
  --artifact-path "$AUTHORIZATION"
```

The wrapper consumes the artifact before the first Vercel call, verifies the
signed source is a READY Production deployment in the canonical project,
writes all five variables as sensitive Production values through pinned Vercel
CLI 55.0.0, redeploys that exact source and accepts only a READY Production
result. Values travel over stdin rather than command arguments. If an
environment write fails, the active deployment is unchanged. If redeploy
fails, the route remains unavailable on the active deployment and the action
is consumed.

After the room test, repeat the flow with `operation: disable` and the current
canary deployment as the exact source. Disable remains available even after
the configured expiry.

## Stop conditions

Stop before connection for any file contract, topology, URL, candidate,
configuration, binding or expiry mismatch. Stop after connection for agent
source mismatch, spoken Director influence, transcript persistence, feedback
creation, ordinary-session regression, settlement ambiguity, spend hard stop
or inability to disable the web gate/restore the worker.

## Evidence

Record only exact public commit/deployment IDs, closed result codes, round,
voice condition and sanitized timestamps. Never record the raw file, token,
room name, user ID, transcript, prompt, provider payload or capability.
