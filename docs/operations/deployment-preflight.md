# Deployment Preflight Runbook

Updated: 2026-07-15
Status: Implemented locally; Preview rollout remains fail-closed pending isolated LiveKit provisioning
Owner: SAV-184

The deployment preflight validates launch-critical configuration without printing or changing provider values. Vercel runs it before every Preview or Production Next.js build. Provider checks are read-only; smoke events and billing mutations are separate, explicitly authorized rehearsals.

## Commands

Local builds skip only deploy checks because they have no Vercel target:

```bash
npm run build
```

After pulling one intentionally selected environment:

```bash
npm run env:pull:preview
npm run deploy:preflight:preview

npm run env:pull:production
npm run deploy:preflight:production
```

The commands load only their matching private env file. Never source both files, pass secrets in command arguments, or paste provider output into chat, GitHub, or Linear.

## Prelaunch Rollout

1. Keep Production at `MEELNI_RELAUNCH_PHASE=prelaunch`, `MEELNI_REACTIVATION_DEFAULT=false`, and the Statsig gate off. Preview uses `MEELNI_RELAUNCH_PHASE=rehearsal`, `NEXT_PUBLIC_STATSIG_ENVIRONMENT=preview`, and the same false fallback.
2. Confirm the canonical Vercel target is team `meelni`, project `meelni` (`prj_NvpsSMhIhmUoaVAG5nPnbd2fRmT4`), linked to `meelni/meelni-prep`. The build preflight verifies the project ID and Git owner/slug from Vercel system variables.
3. For an authorized rehearsal only, add `MEELNI_REHEARSAL_COMMIT_SHA` to the Vercel Preview environment scoped to the reviewed PR branch, enter the exact 40-character head SHA, and redeploy that exact commit. Do not define this variable for all Preview branches. Every new commit requires a new value and redeployment. Vercel preflight rejects an anchor that differs from `VERCEL_GIT_COMMIT_SHA` or lacks `VERCEL_GIT_COMMIT_REF`.
4. Pull Preview and run the target preflight. Preview Supabase must resolve exactly to `kxpvidtxznllfosfemdl`; Production must resolve exactly to `rarrrwkjuhfyfatcmrkw`.
5. Use only LiveKit project `meelni-preview` (`p_16unz4e48is`) at `meelni-preview-dk7443ua.livekit.cloud`. Its interview deployment `CA_ZbGxFjfEYwsD` dispatches as `meelni-preview-interview`. Provision a separate Preview demo agent, add its exact dispatch name to `lib/deployment/provider-identities.ts`, and then set the matching Preview-only Vercel values. The current one-agent plan limit must be resolved without deleting the interview agent or borrowing a Production identity.
6. Restore target-specific Inngest Event and Signing Keys from the canonical provider environment. Preview may not use a prod/production signing key.
7. Confirm Stripe Preview uses test keys and Production uses live keys. Read-only preflight must resolve both to account `acct_1SSreECdoT5hfbsF` and the accepted catalog.
8. Confirm `OPENAI_FEEDBACK_MODEL=gpt-5.1` and all server-owned interview runtime settings are explicit.
9. Run `npm run check:ci`, `npm run build`, and the target preflight locally.
10. Push only after local gates pass. Require exact-head GitHub checks and Vercel build evidence.
11. In Statsig Preview, set dynamic config `meelni_preview_rehearsal_authority` to `active=true`, the exact `approvedCommitSha`, exact `approvedGitRef`, canonical UTC `authorizedAt`, and canonical UTC `expiresAt`. `authorizedAt` must be current/past, `expiresAt` must be future, and their total interval must be at most two hours. The config is the centrally revocable authority; the immutable Vercel SHA is only a second factor. Configure the Preview gate to target the same `meelni_deployment_commit_sha` and `meelni_deployment_git_ref` custom attributes.
12. Enable only that exact-target Preview gate, run the authorized Preview golden path with synthetic data, and return the gate off afterward. Record the exact commit, target, authority expiry, event IDs/fingerprints, cleanup, and outcome without raw payloads or credentials.

The dynamic config is strict JSON. Timestamps must exactly match JavaScript ISO
UTC output, including three millisecond digits and `Z`:

```json
{
  "active": true,
  "approvedCommitSha": "<40-lowercase-hex-commit-sha>",
  "approvedGitRef": "<reviewed-pr-ref>",
  "authorizedAt": "2026-07-15T18:00:00.000Z",
  "expiresAt": "2026-07-15T20:00:00.000Z"
}
```

Field names and types are exact. A timestamp without `.000`, a future
`authorizedAt`, or a start-to-expiry interval longer than two hours fails
closed.

### Preview rollback

1. Turn the Preview-tier Statsig gate off first.
2. Disable or remove `meelni_preview_rehearsal_authority`. This centrally revokes old immutable deployment URLs; changing a Vercel env alone does not change prior deployments.
3. Verify revocation propagation before changing Vercel: request the current branch alias and at least one prior rehearsal deployment URL with a unique query string in an authenticated/protected client. Both must render the holding/off experience on a fresh request. If either still exposes practice, keep the gate off, stop cleanup, and investigate Statsig propagation; do not claim revocation.
4. Remove the branch-scoped `MEELNI_REHEARSAL_COMMIT_SHA` and redeploy the branch so the current branch deployment also loses its deployment-side factor.
5. Retain only the verified Preview LiveKit host, credentials, and interview dispatch. Never restore a Production LiveKit value into Preview.
6. If the demo rollout caused the failure, revert the demo identity commit and remove the Preview demo env value together. Accept the resulting fail-closed preflight until a corrected Preview demo is reviewed.
7. Record the failed exact commit, both-URL hard-off verification, central-authority revocation, and cleanup outcome in SAV-184/SAV-226 before another attempt.

## Provider Smoke Boundaries

Per-build preflight is read-only:

- Supabase Auth/PostgREST credential acceptance
- Stripe account and price retrieval
- OpenAI model retrieval
- LiveKit nonexistent-room list

Separate Preview rehearsal may mutate only Preview/test resources and synthetic data:

- one uniquely identified Inngest event delivered to the Preview environment;
- isolated Preview LiveKit session/agent runtime parity;
- Stripe-test Checkout/webhook/credit-settlement flow plus cleanup.

No Production smoke event, live Stripe transaction, live provider mutation, relaunch phase change, or promotion is permitted without the product owner’s explicit authorization. Preview `rehearsal` is not launch approval and cannot make Production evaluate the gate.

## Failure Response

| Area               | Response                                                                                                                                                                                                                                                              |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase           | Restore the same-target URL/database/key set. Preview must be the committed Preview ref; Production must be the committed Production ref.                                                                                                                             |
| Stripe key/account | Restore keys from the canonical Meelni account in the expected mode. Do not recreate lookalike prices in another account.                                                                                                                                             |
| Stripe catalog     | Correct the target price at source; price amount, cadence, interval count, usage type, and metadata must all match.                                                                                                                                                   |
| Inngest            | Restore target-specific Event and Signing Keys; then record an authorized target smoke separately.                                                                                                                                                                    |
| OpenAI/model       | Restore the credential and explicit accepted model. Do not depend on an application default.                                                                                                                                                                          |
| LiveKit            | Correct URLs, credentials, and dispatch names. Preview remains blocked until its separate demo identity completes the committed anchor.                                                                                                                               |
| Statsig/relaunch   | Restore target tier and `/api/statsig`; use Preview `rehearsal` or Production `prelaunch`, always with fallback `false`. Preview also requires exact Vercel commit/ref plus current, matching Statsig authority whose total authorized lifetime is at most two hours. |
| Provider outage    | Retry only after status/access is understood. Do not bypass or downgrade checks.                                                                                                                                                                                      |

## Redaction

Safe evidence: commit SHA, command, target, check names, SDK/API versions, deployment/PR link, synthetic provider event IDs, and one-way fingerprints where needed.

Never record: raw keys, database URLs, price IDs, webhook secrets, provider exception bodies, customer data, transcripts, recordings, private billing payloads, or env files.

The read-only catalog adapter uses the repository's canonical
`STRIPE_API_VERSION` from `lib/billing/stripe-catalog.ts`. Stripe SDK/API
upgrades remain billing-owned changes and are not hidden inside rehearsal
authority updates.

## Current Blockers

- The isolated Preview LiveKit project and interview agent are verified and committed, but the project currently allows only one deployed agent. A separate Preview demo agent/dispatch name is still required before the preflight can pass; do not delete the interview agent or reuse Production.
- Existing Preview Vercel values must be replaced with the verified Preview host/credentials and dispatch names only after the demo identity is complete.
- The target-specific Inngest Event Key and provider smoke evidence must still be verified in the isolated Preview environment.
- Production catalog/provider checks and any live-mode rehearsal remain gated by explicit owner authorization.
