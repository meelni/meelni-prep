# SAV-226 Relaunch Decision

Decision: **NO-GO**  
Recorded: 2026-07-13  
Scope: Meelni relaunch, including the default-off interview experience

This decision is fail-closed. It does not authorize a Production promotion,
live-mode provider mutation, customer-data use, any paid calibration outside
the exact SAV-248 v2 authorization, or enabling the relaunch feature gate.

## Executive Decision

Keep the relaunch feature gate off and keep PR 302 in draft. The isolated
Preview infrastructure is substantially ready, but launch acceptance has
failed and the remaining end-to-end evidence is incomplete. Missing, stale,
ambiguous, or inaccessible evidence is a NO-GO rather than an inferred pass.

## Delegated Operating Decisions

- The 32 scored calibration cases do not require a fabricated human reviewer.
  The accepted artifact uses the product owner's task-thread delegation plus
  two independent 32/32 exact-hash agent-panel signoffs and a null human
  identity.
- Agents may run isolated Stripe and LiveKit Preview rehearsals when every
  fixture is synthetic/approved, the provider identities are positively
  non-Production, mutations and cost are bounded, cleanup is defined, and no
  customer or Production data is used.
- Agents own the relaunch go/no-go recommendation. Live mode remains NO-GO
  unless every reconsideration criterion below has fresh exact evidence,
  bounded rollback, and an explicit release record. Missing or conflicting
  evidence always resolves to NO-GO.

## Evidence That Passed

- Audited provider-runtime head:
  `f46f434ada0f7e5928bda8837b117f5e640bbaa7`.
- Exact Vercel Preview deployment:
  `dpl_3fTTr5jGqGjXrKiWFjaDhJewTje1` at
  `meelni-kd8s7rmcg-meelni.vercel.app`.
- A deployment-protection-bypassed Preview health request returned HTTP 200
  with `web`, `database`, core-interview `livekit`, `feedback_dispatch`, and
  `stripe_webhook` healthy at `2026-07-13T13:54:22.163Z`. This is
  infrastructure evidence, not Meelni user authentication evidence.
- The public voice-demo route returned provider-free HTTP 404
  `voice_demo_unavailable`; the demo is not part of this relaunch.
- The dedicated `meelni-preview` LiveKit project has one running core interview
  agent, `CA_ZbGxFjfEYwsD`, version `LJ8EHo5sNzu8`, using dispatch
  `meelni-preview-interview`.
- Inngest registered the complete runtime inventory: 14 source functions plus
  the SDK-generated feedback failure handler in environment
  `codex-sav-226-provider-isolation-d1d0d66b`. Provider-to-app recovery run
  `01KXDNFH8S2SQZ795G7NSR2FR3` completed, and app-to-provider event
  `01KXDNJAMDW41DW0RV5NC99HVG` was accepted. After credential rotation, an
  exact manual resync succeeded at 2026-07-13 06:44:47 local with all 15
  functions and SDK 3.54.2. The audited deployment then auto-synced at
  `2026-07-13T13:52:58.746Z` with the same 15-function inventory and SDK.
- Dedicated Preview Supabase passed the strict latest-schema preflight with no
  unsafe client billing-table privileges.
- Stripe test-mode billing acceptance proved invoice-first ownership binding,
  idempotent fulfillment, and period-end cancellation with retained access and
  credits and no automatic proration or refund.
- Product language and public UI no longer frame interview practice as a gym,
  workout, or reps experience.
- Exact audited provider-runtime validations included calibration (86), core
  (87), and product-language (20) tests, application and test typechecks,
  targeted lint/format checks, and a production build with 68 generated pages
  and 81 routes. The SAV-248 v2 plan then passed 87/87 calibration tests under
  pinned Node 22.22.0 plus both application/test typechecks, exact artifact
  regeneration, preflight, and deterministic self-test without a provider call.
  The authenticated-Preview receipt guard also passed 5 dedicated tests
  plus local-script (305), agent (29), integration (39), Python (87), selected
  workflow (58), and selected API (60) tests. Hosted exact-head publication
  checks remain unavailable as recorded below.

## Launch Blockers

1. **SAV-198 calibration failed.** The single authorized paid run stopped on
   the first synthetic case after one physical HTTP attempt. It completed zero
   cases, reconciled $0.015545, stayed below the $3 cap, and recorded
   `liveProviderAcceptance: failed` and `launchAcceptance: failed`. The
   one-time authority is consumed. The sanitized receipt reports
   `evaluation_failed`; it does not establish the exact semantic subcause.
   SAV-248 now has a distinct v2 authorization and accepted immutable plan. It
   binds strict structured output, response-format hash
   `66605edf2b3cad146671f22afa656d9c01c9abea2e7475a68dbe21738c8e4073`,
   the exact full/partial serialized schemas, 96 synthetic-only calls, a
   1,800-token output ceiling, and deterministic worst-case spend of
   `$2.8539975` under the hard `$3` cap. Its plan hash is
   `354bdc4046b0759e50940127c574abe355ee0754d9a8aaf2c25338b49aca8419`.
   Provider-free validation passes, but the distinct v2 rulesets, genesis, and
   protected ledger ref are not yet provisioned and no v2 provider call has
   occurred. Missing authority proof remains a hard stop.
2. **The exact authenticated golden path is incomplete.** There is no current
   reproducible receipt for synthetic authentication through interview,
   transcript persistence, and feedback delivery on the exact deployment. The
   provider-free runbook and content-free receipt verifier are implemented and
   passing, but the hosted run still requires a fresh synthetic account,
   candidate-only gate rule, positively linked Preview LiveKit CLI identity,
   approved synthetic audio, terminal settlement, feedback, rollback, and
   cleanup. The audit does not weaken authentication or fabricate transcript
   rows to create a pass.
3. **The final exact-deployment Stripe delivery receipt is incomplete.** The
   test endpoint now uses its own dedicated Vercel bypass, targets the exact
   branch alias, and is labeled with head `f46f434…` and deployment
   `dpl_3fTTr5jGqGjXrKiWFjaDhJewTje1`. An unsigned diagnostic reached the
   application-owned HTTP 400 on that exact deployment at
   `2026-07-13T13:53:55Z`. Exactly one approved synthetic event resend first
   encountered the stale prior endpoint and remains `pending_webhooks=1`; no
   second resend was submitted. Stripe's failed-delivery listing returns zero
   events, so provider evidence conflicts rather than proving delivery. Preview
   database state remains unchanged and idempotent. The gate stays open until a
   signed delivery is unambiguously accepted and the pending count returns to
   zero.
4. **Production health is unavailable.** At `2026-07-13T12:18:07.956Z`, a
   read-only request to
   `https://www.meelni.com/api/health` returned HTTP 503: `web` and core
   `livekit` were healthy, while `database`, `feedback_dispatch`, and
   `stripe_webhook` were unavailable. Immediately after the integration was
   attached, Vercel created Production deployment
   `dpl_ARGp2HE2kLve1bxx7R6YAAFkE69t` from existing main commit
   `611ef84234c5039e5a1aae4d038cb9bd21ad7a25`; this temporal sequence does not
   establish provider causality. The deployment did not contain this relaunch
   branch and the relaunch gate remained off.
5. **Hosted merge evidence is unavailable.** GitHub Trusted Publisher and
   Migration Collision Publisher fail before executing because of the
   repository billing/spending-limit condition. Draft PR CI remains skipped.

## Reconsideration Criteria

A later GO decision requires all of the following on the release candidate:

- The authorized SAV-248 v2 calibration run passes every launch threshold
  within its exact 96-call and $3 hard caps.
- The exact Preview first proves default-off denial, then temporarily enables
  only the isolated candidate, completes the authenticated synthetic golden
  path, restores default-off, and proves denial again.
- A test-mode signed Stripe webhook is accepted by the exact deployment, with
  durable redacted evidence and no duplicate grant, proration, or refund.
- Production preflight health is current and healthy without using customer
  content or mutating live data.
- Hosted required checks execute and pass, or an explicitly approved equivalent
  control is recorded.
- Temporary credentials and bypasses used for rehearsal are removed or rotated.

Credential cleanup currently retains exactly three named, separated bypasses:
`Codex Preview Automation Final`, `Inngest Preview Final`, and
`Stripe Preview Final`. Every exposed, shared, or superseded bypass was revoked,
and both provider consumers were reverified after cleanup.

Until then, ordinary period-end cancellation and immediate account-deletion
cutoff remain the accepted billing behavior, but neither implies launch
readiness.
