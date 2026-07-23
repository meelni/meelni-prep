# Relaunch Activation and Rollback Runbook

Updated: 2026-07-22
Owner: Product owner `contact@meelni.com`
Status: Runbook ready; Preview flip evidence pending upstream launch gates
Linear: SAV-176

This runbook makes relaunch activation a controlled, reversible operator
procedure. It does not authorize launch. Agents may gather evidence and
recommend GO/NO-GO, but only the product owner may create the final Production
GO record and execute default-on.

## Non-negotiable launch authority

- Keep the Statsig gate `meelni_reactivation_access` off for Production.
- Keep `MEELNI_REACTIVATION_DEFAULT=false` for Production.
- Keep `MEELNI_RELAUNCH_PHASE=prelaunch` for Production.
- Do not use `relaunch-default-on` until the product owner signs an explicit
  GO bound to the exact release candidate.
- A successful Preview rehearsal is evidence only. It is not launch approval.

Automatic NO-GO recommendation applies when any required gate is missing,
stale, ambiguous, unverifiable, or failing.

## Exact controls

| Control           | Preview rehearsal                                                                             | Production prelaunch                | Production launch            |
| ----------------- | --------------------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------- |
| Statsig tier      | `preview`                                                                                     | `production`                        | `production`                 |
| Statsig gate      | `meelni_reactivation_access` targeted only to the exact reviewed commit/ref                   | off                                 | owner-approved target        |
| Dynamic config    | `meelni_preview_rehearsal_authority` with `active=true`, exact commit/ref, and ≤2h UTC window | absent or inactive                  | not launch authority         |
| Vercel phase      | `MEELNI_RELAUNCH_PHASE=rehearsal`                                                             | `MEELNI_RELAUNCH_PHASE=prelaunch`   | separately approved          |
| Vercel fallback   | `MEELNI_REACTIVATION_DEFAULT=false`                                                           | `MEELNI_REACTIVATION_DEFAULT=false` | owner-approved change only   |
| Deployment anchor | Branch-scoped `MEELNI_REHEARSAL_COMMIT_SHA=<40hex>`                                           | none                                | exact candidate in GO record |

## Prerequisites before Preview flip

Record evidence links in SAV-176 before enabling the Preview gate:

1. Exact-head GitHub PR queue is empty or contains only intentionally open
   non-launch work, and all accepted launch-critical PRs are merged.
2. Hosted CI/security/deployment checks are green at the candidate commit.
3. SAV-226 proves isolated Preview Supabase, Stripe test mode/webhook, LiveKit
   project/agents, and Inngest configuration with no shared Production provider
   identity.
4. SAV-198/SAV-248 v8 terminal calibration evidence is recorded truthfully,
   including the bounded synthetic provider run if separately authorized. The
   consumed v3 through v7 lanes are historical failure evidence, not the current
   terminal calibration path.
5. SAV-186 fresh-user golden path passes in Preview: signup, trial grant,
   selected question, live interview, durable transcript, calibrated feedback,
   billing cancellation policy, and irreversible deletion policy.
6. SAV-211, SAV-215, SAV-178, SAV-180, and SAV-268 are Done or have an explicit
   accepted non-blocking disposition.
7. Production preflight remains hard-off: `prelaunch`, fallback `false`, live
   Stripe mode/catalog/webhook, Production-only LiveKit identity, database
   identity/migration ledger, required Inngest keys, and no secret exposure.

## Preview flip procedure

1. Confirm the candidate:

   ```bash
   git fetch origin main
   git rev-parse origin/main
   gh pr list --repo meelni/meelni-prep --state open
   ```

2. Pull Preview env and run read-only gates:

   ```bash
   npm run env:pull:preview
   npm run deploy:preflight:preview
   npm run check:ci
   npm run build
   ```

3. In Vercel Preview, set branch-scoped
   `MEELNI_REHEARSAL_COMMIT_SHA=<candidate sha>` only for the reviewed branch
   and redeploy that exact commit.
4. In Statsig Preview, set dynamic config
   `meelni_preview_rehearsal_authority`:

   ```json
   {
     "active": true,
     "approvedCommitSha": "<candidate sha>",
     "approvedGitRef": "<reviewed git ref>",
     "authorizedAt": "YYYY-MM-DDTHH:mm:ss.000Z",
     "expiresAt": "YYYY-MM-DDTHH:mm:ss.000Z"
   }
   ```

   The interval from `authorizedAt` to `expiresAt` must be at most two hours.

5. In Statsig Preview, target `meelni_reactivation_access` only where custom
   attributes `meelni_deployment_commit_sha` and
   `meelni_deployment_git_ref` match the same candidate.
6. Run the Preview smoke matrix with synthetic/approved identities only.
7. Turn the Preview gate off immediately after the rehearsal, even when it
   passes.

## Required Preview smoke matrix

Record pass/fail, timestamp, exact deployment URL, commit, and sanitized
evidence for every row:

| State                      | Expected evidence                                                                                                                              |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Anonymous visitor          | Public pages show the live-practice promise; gated conversion actions are deterministic and do not create accounts or credits unexpectedly.    |
| New eligible user          | Signup, two trial credits exactly once, setup, selected question, interview start, transcript, and feedback path complete.                     |
| Returning user with credit | Dashboard, selected question, interview start, and feedback review work without duplicate trial grants.                                        |
| Paid one-time user         | Stripe test Checkout/webhook settlement grants one pass exactly once.                                                                          |
| Exhausted-credit user      | Checkout/upgrade path is clear and no interview token is issued before entitlement.                                                            |
| Failure path               | Provider/runtime failure preserves transcript/credit truth and emits redacted operational evidence.                                            |
| Mobile viewport            | No horizontal overflow; primary actions remain reachable.                                                                                      |
| Accessibility              | Keyboard path, focus order, labels, contrast, loading/error/disabled states, and reduced-motion behavior are acceptable.                       |
| Consent states             | Fresh/declined users do not initialize optional PostHog or browser Statsig analytics/replay; accepted users initialize only through the proxy. |

## Metrics and observability

Use redacted dashboards/events only. Record fixed codes and fingerprints, never
raw provider bodies, customer data, transcripts, recordings, keys, database
URLs, webhook payloads, or env files.

Minimum signals to inspect during the rehearsal:

- `resolveReactivationAccess` outcome by target/phase, without user PII.
- Signup and trial-grant success/failure counts.
- Credit reservation, settlement, and reversal integrity counters.
- LiveKit token issuance, room join, transcript ingest, and end-session
  completion failures.
- Inngest feedback dispatch and completion/failure codes.
- Stripe test Checkout/webhook delivery and idempotent grant evidence.
- PostHog/Statsig consent boundary network evidence.
- Redacted operational failures from SAV-215 alert boundaries.

## Rollback thresholds

Rollback immediately when any threshold is breached:

- Any Production surface evaluates the relaunch gate on or fallback true before
  owner GO.
- Preview gate targets a commit/ref different from the reviewed candidate.
- Any Preview provider identity points at Production.
- Any smoke state issues an interview token or consumes/grants credit outside
  the expected entitlement path.
- Signup, billing, interview start, transcript ingest, feedback generation,
  account deletion, or cancellation policy evidence is missing or contradictory.
- Optional analytics initializes for undecided/declined consent.
- A P0/P1 security, privacy, billing, accessibility, data-integrity, or
  observability finding appears.
- Error rate, latency, or alert thresholds from `docs/operations/service-health.md`
  or `docs/operations/redacted-observability.md` are crossed.

## Rollback path

Execute in this order:

1. Turn off the Statsig gate `meelni_reactivation_access` in Preview.
2. Disable or remove `meelni_preview_rehearsal_authority`.
3. Verify revocation on the current branch alias and at least one prior
   deployment URL with a unique query string. Both must render the off/holding
   experience on a fresh request.
4. Remove the branch-scoped `MEELNI_REHEARSAL_COMMIT_SHA` and redeploy the
   branch.
5. Run:

   ```bash
   npm run deploy:preflight:preview
   npm run test:feature-flags
   ```

6. Record the failed exact commit, rollback timestamps, both-URL hard-off
   verification, metrics, cleanup state, and next owner in SAV-176.
7. Do not attempt another rehearsal until the root cause has a linked issue or
   explicit accepted disposition.

Production rollback after a future owner GO must turn off both the Statsig gate
and `MEELNI_REACTIVATION_DEFAULT`, then run anonymous/authenticated/paid smoke
checks proving the hard-off state. It must not create automatic refunds,
prorations, or compensation.

## Evidence packet

Attach or link this packet to SAV-176 before closing:

- Exact candidate commit and deployment URLs.
- GitHub checks and Vercel deployment evidence.
- Preview preflight output summary with no secrets.
- Statsig authority timestamp window and targeted commit/ref.
- Smoke matrix results with sanitized screenshots/log fingerprints.
- Metrics reviewed and rollback thresholds.
- Rollback execution evidence proving both central authority and deployment
  factor are revoked.
- Recommendation: GO or NO-GO. This is an agent/operator recommendation only.
- Product-owner decision: absent until `contact@meelni.com` explicitly records
  GO/NO-GO for Production.

## Close criteria

SAV-176 can close only after the Preview flip and rollback are actually
exercised with evidence attached. This runbook satisfies the documentation
criterion but does not satisfy the rehearsal criterion by itself.
