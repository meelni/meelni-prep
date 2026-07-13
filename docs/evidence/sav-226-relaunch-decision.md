# SAV-226 Relaunch Decision

Decision: **NO-GO**  
Recorded: 2026-07-13  
Scope: Meelni relaunch, including the default-off interview experience

This decision is fail-closed. It does not authorize a Production promotion,
live-mode provider mutation, customer-data use, a second paid calibration run,
or enabling the relaunch feature gate.

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

- Audited runtime head: `efcf1b7d031d712eabd449274f79d545592ba8f9`.
- Exact Vercel Preview deployment:
  `dpl_xEw713hBckBqixBM6iNsFXNfoFWn` at
  `meelni-ne5f3bcoe-meelni.vercel.app`.
- A deployment-protection-bypassed Preview health request returned HTTP 200
  with `web`, `database`, core-interview `livekit`, `feedback_dispatch`, and
  `stripe_webhook` healthy. This is infrastructure evidence, not Meelni user
  authentication evidence.
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
  functions, SDK 3.54.2, and the exact deployment and commit.
- Dedicated Preview Supabase passed the strict latest-schema preflight with no
  unsafe client billing-table privileges.
- Stripe test-mode billing acceptance proved invoice-first ownership binding,
  idempotent fulfillment, and period-end cancellation with retained access and
  credits and no automatic proration or refund.
- Product language and public UI no longer frame interview practice as a gym,
  workout, or reps experience.
- Exact audited runtime head validations included calibration (86), core (87),
  and product-language (20) tests, application and test typechecks, targeted
  lint/format checks, and a production build with 68 generated pages and 81
  routes. The authenticated-Preview receipt guard then passed 5 dedicated tests
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
   SAV-248 now adds strict structured output, distinct sanitized provider
   terminal categories, a deterministic response-format hash, and exact schema
   byte ceilings without a provider call. Paid calibration is disabled before
   client construction because the consumed plan did not bind this new format.
   A fresh immutable exact plan bound to the new response-format hash, current
   pricing, synthetic-only corpus, at most 96 calls, and a hard total cap at or
   below $3 remains required before another provider call. The product owner
   delegated this bounded go/no-go decision to agents; no additional
   conversational approval is required, but missing audit proof is a hard stop.
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
   branch alias and commit, and an unsigned diagnostic reaches the application-
   owned HTTP 400 on the exact deployment. Exactly one approved synthetic event
   resend first encountered the stale prior endpoint and remains
   `pending_webhooks=1`; no second resend was submitted. Preview database state
   remains unchanged and idempotent. The gate stays open until Stripe's existing
   retry receives HTTP 2xx and the provider pending count returns to zero.
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

- SAV-248 is fixed provider-free and a newly authorized calibration run passes
  every launch threshold within its new hard call and spend caps.
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
