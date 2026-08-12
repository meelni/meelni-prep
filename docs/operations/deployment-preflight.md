# Deployment Preflight Runbook

Updated: 2026-08-12
Status: generic PR Preview is web-only; provider-backed staging remains the rehearsal lane
Owner: SAV-184, SAV-391, SAV-413

The deployment preflight validates launch-critical configuration without printing or changing provider values. Vercel runs it before every Preview or Production Next.js build. Provider checks are read-only; smoke events and billing mutations are separate, explicitly authorized rehearsals.

## Deployment lanes

- Generic PR Preview has `VERCEL_ENV=preview` and `VERCEL_TARGET_ENV=preview`. LiveKit is intentionally disabled, its configuration/reachability check prints an explicit `SKIP`, and voice entrypoints return `voice_unavailable_in_preview` without touching auth, credits, durable session state, LiveKit configuration, or providers. Non-voice surfaces remain deployable and reviewable.
- Trusted staging has `VERCEL_ENV=preview` and `VERCEL_TARGET_ENV=staging`. It remains the only provider-backed Preview rehearsal lane and must pass the exact isolated LiveKit identity and read-only project-access check.
- Production remains enabled and strict. Never put Production LiveKit credentials into generic Preview or staging.

Do not interpret an unreadable LiveKit project as intentional disablement. Only the exact Vercel-owned generic Preview identity skips; local explicit Preview, missing `VERCEL_TARGET_ENV`, and unknown targets remain strict.

## Current launched posture

The product owner recorded Production launch completion in SAV-176 on
2026-07-26. Current read-only provider evidence shows
`meelni_reactivation_access` enabled with the public `Launch all users` rule,
paired with the accepted Production state
`MEELNI_RELAUNCH_PHASE=launched` and
`MEELNI_REACTIVATION_DEFAULT=true`.

Do not disable or retarget that shared gate while preparing a Preview
rehearsal. Preview remains independently fail-closed because the server checks
the exact Vercel commit/ref and the current, time-bounded
`meelni_preview_rehearsal_authority` before it evaluates the shared gate.

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

## Post-launch isolated staging rehearsal

1. Preserve Production at its owner-launched pair and leave the shared Statsig
   gate unchanged. Preview uses `MEELNI_RELAUNCH_PHASE=rehearsal`,
   `NEXT_PUBLIC_STATSIG_ENVIRONMENT=preview`, and
   `MEELNI_REACTIVATION_DEFAULT=false`.
2. Confirm the canonical Vercel target is team `meelni`, project `meelni` (`prj_NvpsSMhIhmUoaVAG5nPnbd2fRmT4`), linked to `meelni/meelni-prep`, and custom target `staging`. The build preflight verifies the project ID and Git owner/slug from Vercel system variables and requires `VERCEL_TARGET_ENV=staging` for provider rehearsal.
3. For an authorized rehearsal only, add `MEELNI_REHEARSAL_COMMIT_SHA` to the Vercel Preview environment scoped to the reviewed PR branch, enter the exact 40-character head SHA, and redeploy that exact commit. Do not define this variable for all Preview branches. Every new commit requires a new value and redeployment. Vercel preflight rejects an anchor that differs from `VERCEL_GIT_COMMIT_SHA` or lacks `VERCEL_GIT_COMMIT_REF`.
4. Pull Preview and run the target preflight. Preview Supabase must resolve exactly to `kxpvidtxznllfosfemdl`; Production must resolve exactly to `rarrrwkjuhfyfatcmrkw`.
5. Use only LiveKit project `meelni-preview` (`p_16unz4e48is`) at `meelni-preview-dk7443ua.livekit.cloud`. Its interview deployment `CA_ZbGxFjfEYwsD` dispatches as `meelni-preview-interview`; its demo deployment `CA_M5XTD4CMyXk3` dispatches as `meelni-preview-demo`. Set those matching Preview-only Vercel values without borrowing a Production identity.
6. Restore Inngest's shared Branch Environment Event and Signing Keys for Preview. A `signkey-branch-*` signing key is the canonical branch-environment identity; Vercel supplies the branch ref used for routing. Preview may not use a prod/production signing key.
7. Confirm Stripe Preview uses test keys and Production uses live keys. Read-only preflight must resolve both to account `acct_1SSreECdoT5hfbsF` and the accepted catalog.
8. Confirm `OPENAI_FEEDBACK_MODEL=gpt-5.1` and all server-owned interview runtime settings are explicit.
9. Run `npm run check:ci`, `npm run build`, and the target preflight locally.
10. Push only after local gates pass. Require exact-head GitHub checks and Vercel build evidence.
11. In Statsig, set dynamic config `meelni_preview_rehearsal_authority` to
    `active=true`, the exact `approvedCommitSha`, exact `approvedGitRef`,
    canonical UTC `authorizedAt`, and canonical UTC `expiresAt`.
    `authorizedAt` must be current/past, `expiresAt` must be future, and their
    total interval must be at most two hours. The config is the centrally
    revocable authority; the immutable Vercel SHA is only a second factor.
12. Read and record that the shared gate still matches the owner-launched
    Production state; do not change it for Preview. Run the authorized Preview
    golden path with synthetic data, disable the dynamic authority immediately
    afterward, and remove the branch-scoped SHA anchor through the rollback
    sequence. Record the exact commit, target, authority expiry, event
    IDs/fingerprints, cleanup, and outcome without raw payloads or credentials.

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

1. Disable or remove `meelni_preview_rehearsal_authority`. This centrally
   revokes old immutable deployment URLs; changing a Vercel env alone does not
   change prior deployments. Do not change the shared launched gate.
2. Verify revocation propagation before changing Vercel: request the current
   branch alias and at least one prior rehearsal deployment URL with a unique
   query string in an authenticated/protected client. Both must render the
   holding/off experience on a fresh request. If either still exposes practice,
   stop cleanup and investigate authority propagation; do not alter Production
   access or claim revocation.
3. Remove the branch-scoped `MEELNI_REHEARSAL_COMMIT_SHA` and redeploy the
   branch so the current branch deployment also loses its deployment-side
   factor.
4. Retain only the verified Preview LiveKit host, credentials, and interview
   dispatch. Never restore a Production LiveKit value into Preview.
5. If the demo rollout caused the failure, revert the demo identity commit and
   remove the Preview demo env value together. Accept the resulting fail-closed
   preflight until a corrected Preview demo is reviewed.
6. Record the failed exact commit, both-URL hard-off verification,
   central-authority revocation, and cleanup outcome in SAV-184/SAV-226/SAV-387
   before another attempt.

## Provider Smoke Boundaries

Per-build preflight is read-only:

- Supabase Auth/PostgREST credential acceptance
- Stripe account and price retrieval
- OpenAI model retrieval
- LiveKit nonexistent-room list

The OpenAI model read has a fixed retry budget: two attempts maximum, 10 seconds per attempt, one deterministic 250 millisecond delay, and a 21 second overall ceiling. A production-default regression asserts the exact 250 millisecond delay. Only SDK-classified connection/timeout failures, rate limiting with an absent or recognized transient code, and the accepted transient server-error classes receive the one retry. Authentication, authorization, missing-model, exhausted-quota, other client failures, and unknown or malformed errors stop after the first attempt. A retry followed by a terminal failure reports only the terminal fixed class.

The SDK adapter uses class identity and numeric status only to normalize failures. At status 429 only, it reads the SDK's top-level `code`: `insufficient_quota` is terminal, `rate_limit_exceeded` or an absent code receives the bounded retry, and unknown or malformed codes fail closed. The raw status and code never cross the adapter. Poison-field regressions prove that classification does not read provider exception text, payload objects, headers, request IDs, parameters, or provider type.

OpenAI failure output contains only stable preflight codes and fixed messages. It does not include numeric status values, raw provider codes, provider exception text or payloads, headers, request IDs, configured values, or credentials. The SDK client pins `https://api.openai.com/v1`, disables SDK logs and retries, and explicitly ignores ambient base URL, log level, organization, project, and webhook configuration. Do not add provider-body parsing, header-driven backoff, ambient routing, or SDK logging to the build path.

Separate Preview rehearsal may mutate only Preview/test resources and synthetic data:

- one uniquely identified Inngest event delivered to the Preview environment;
- isolated Preview LiveKit session/agent runtime parity;
- Stripe-test Checkout/webhook/credit-settlement flow plus cleanup.

No Production smoke event, live Stripe transaction, live provider mutation, relaunch phase change, or promotion is permitted without the product owner’s explicit authorization. Preview `rehearsal` is not launch approval and cannot make Production evaluate the gate.

## Failure Response

| Area               | Response                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase           | Restore the same-target URL/database/key set. Preview must be the committed Preview ref; Production must be the committed Production ref.                                                                                                                                                                                                                                                                         |
| Stripe key/account | Restore keys from the canonical Meelni account in the expected mode. Do not recreate lookalike prices in another account.                                                                                                                                                                                                                                                                                         |
| Stripe catalog     | Correct the target price at source; price amount, cadence, interval count, usage type, and metadata must all match.                                                                                                                                                                                                                                                                                               |
| Inngest            | Restore target-specific Event and Signing Keys; then record an authorized target smoke separately.                                                                                                                                                                                                                                                                                                                |
| OpenAI/model       | For authentication, authorization, missing-model, or exhausted-quota classes, restore the canonical credential/account/model/quota binding; these failures do not retry. Transient transport, recognized/absent-code rate-limit, and accepted provider-unavailable classes receive one bounded automatic retry and still fail closed if unavailable. Do not depend on an application default or bypass the check. |
| LiveKit            | For generic Preview, require the explicit intentional `SKIP`; do not add credentials. For staging/Production, correct URLs, credentials, dispatch names, and reachability. An unreadable provider remains a failure.                                                                                                                                                                                              |
| Statsig/relaunch   | Restore target tier and `/api/statsig`; preserve the owner-launched Production pair and use Preview `rehearsal` with fallback `false`. Preview also requires exact Vercel commit/ref plus current, matching Statsig authority whose total authorized lifetime is at most two hours. Never repair Preview by changing the shared launched gate.                                                                    |
| Provider outage    | Retry only after status/access is understood. Do not bypass or downgrade checks.                                                                                                                                                                                                                                                                                                                                  |

## Redaction

Safe evidence: commit SHA, command, target, check names, SDK/API versions, deployment/PR link, synthetic provider event IDs, and one-way fingerprints where needed.

Never record: raw keys, database URLs, price IDs, webhook secrets, provider exception bodies, customer data, transcripts, recordings, private billing payloads, or env files.

The read-only catalog adapter uses the repository's canonical
`STRIPE_API_VERSION` from `lib/billing/stripe-catalog.ts`. Stripe SDK/API
upgrades remain billing-owned changes and are not hidden inside rehearsal
authority updates.

## Current Blockers

- The canonical staging alias currently serves commit
  `67b0247d62d23f4a61e1bacd4d94aebe97f78455` and returns HTTP 503: database,
  feedback dispatch, and Stripe webhook are unavailable. SAV-387 owns
  restoration before interview rehearsal authority may be activated.
- The isolated project is staging-only rehearsal infrastructure. Its matching source identity and staging-scoped Vercel values must be deployed together before staging preflight can pass; generic Preview neither needs nor receives them.
- The one-time demo bootstrap completed with a private `complete` receipt. Do not rerun it or create another demo deployment while the recorded agent remains present.
- The target-specific Inngest Event Key and provider smoke evidence must still be verified in the isolated Preview environment.
- Production catalog/provider checks and any live-mode rehearsal remain gated by explicit owner authorization.
