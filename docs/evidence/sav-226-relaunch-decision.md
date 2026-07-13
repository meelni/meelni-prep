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

- Audited runtime head: `ec4fcc79e3f56c46abc1e175078915a1450fe8bd`.
- Exact Vercel Preview deployment:
  `dpl_Fqgy74xSn3ePBpLmu3Y7ynJVNdvx` at
  `meelni-fjuq1ehp3-meelni.vercel.app`.
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
  `01KXDNJAMDW41DW0RV5NC99HVG` was accepted.
- Dedicated Preview Supabase passed the strict latest-schema preflight with no
  unsafe client billing-table privileges.
- Stripe test-mode billing acceptance proved invoice-first ownership binding,
  idempotent fulfillment, and period-end cancellation with retained access and
  credits and no automatic proration or refund.
- Product language and public UI no longer frame interview practice as a gym,
  workout, or reps experience.
- Exact audited runtime head validations included API (158), product-language
  (20), operations (24), and calibration (78) tests, application and test
  typechecks, targeted lint/format checks, and a production build. Earlier
  provider-isolation and billing commits also passed their full targeted suites;
  hosted exact-head publication checks remain unavailable as recorded below.

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
   A fresh exact plan and bounded authorization remain required before another
   synthetic provider run.
2. **The exact authenticated golden path is incomplete.** There is no current
   reproducible receipt for synthetic authentication through interview,
   transcript persistence, and feedback delivery on the exact deployment. No
   synthetic credential or approved enrollment path was available, so the
   audit did not weaken authentication or enable the feature gate to fabricate
   a pass.
3. **The final exact-deployment Stripe delivery receipt is incomplete.** The
   test webhook still requires a safe URL refresh and signed synthetic delivery
   on the exact deployment. The connected Stripe API session returned an
   explicit reauthentication requirement, the browser dashboard was logged out,
   and placing the Vercel protection-bypass secret in an external tool request
   would expose it. Earlier billing acceptance remains valid for the behavior
   it proved, but it is not substituted for this deployment-specific receipt.
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

Until then, ordinary period-end cancellation and immediate account-deletion
cutoff remain the accepted billing behavior, but neither implies launch
readiness.
