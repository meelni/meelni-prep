# Statsig Relaunch Governance

Status: pending owner-approved provider mutation.

This runbook covers the `meelni_reactivation_access` Statsig gate, which
controls whether discontinued/relaunch-gated product entry points reopen. It
does not authorize launch. Only the human product owner can make the final
launch GO/NO-GO decision, and the relaunch gate must remain disabled until that
separate decision is explicit.

## Canonical gate

| Field                 | Value                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------- |
| Statsig project       | `01k0KuJePjFDEf80vuH61R`                                                              |
| Gate ID               | `meelni_reactivation_access`                                                          |
| Gate name             | `Meelni Reactivation Access`                                                          |
| Owner                 | `Savi Singh <contact@meelni.com>`                                                     |
| Owner Statsig user ID | `7spxjTLm7lyPibNJavcTmx`                                                              |
| Gate permalink        | `https://console.statsig.com/01k0KuJePjFDEf80vuH61R/gates/meelni_reactivation_access` |

## Current provider evidence

Read-only Statsig checks on 2026-07-21 returned:

- `status: "Disabled"`
- `isEnabled: false`
- `rules: []`
- `reviewSettings.requiredReview: false`
- `reviewSettings.allowedReviewers: []`
- eligible reviewers API: `everyone_eligible: true`, with no enumerated users
  or reviewer groups
- review list: empty

This means the gate is safely off, but Statsig does not yet enforce the
accepted owner-only launch authority. A sufficiently privileged editor could
still change the gate unless provider-side review settings are configured.

## Required governance target

Before any relaunch rehearsal or launch flip, configure Statsig so that:

1. `meelni_reactivation_access` requires review for gate changes.
2. `contact@meelni.com` is the explicit allowed reviewer if the Statsig plan and
   API support user-scoped reviewers.
3. Self-approval remains disabled unless a later owner-approved decision
   explicitly says otherwise.
4. The mutation does not change `isEnabled`, `status`, `rules`, `idType`,
   targeting, fallback defaults, or release state.
5. The gate remains disabled after the governance mutation.

If Statsig cannot restrict allowed reviewers to the owner account, stop and
record the exact limitation in Linear. Do not substitute "everyone eligible" as
an owner-only control.

## Owner authorization packet

SAV-283 requires explicit owner approval before creating or committing a Statsig
review. The authorization request should include:

- gate ID: `meelni_reactivation_access`
- current safe state: disabled, no rules, owner `contact@meelni.com`
- proposed operation: enable required review and restrict allowed reviewers to
  the owner account when supported
- explicit non-goals: do not enable the gate, do not add rules, do not change
  `MEELNI_REACTIVATION_DEFAULT`, do not authorize launch
- rollback rehearsal: prove a proposed enable can be rejected or left
  uncommitted, then leave the gate disabled

Approved wording should be precise, for example:

> I authorize the SAV-283 Statsig governance mutation for
> `meelni_reactivation_access`: require review, restrict eligible reviewers to
> `contact@meelni.com` where supported, keep self-approval disabled, and do not
> change enabled state, targeting rules, fallback defaults, or launch state.

## API rehearsal sequence

Use the Statsig API or MCP tools with a user-owned key so review actions are
auditable. Never paste keys, tokens, screenshots with secrets, or customer data
into chat, docs, Linear, or PRs.

1. Read the gate.
   - Expected: `isEnabled: false`, `status: "Disabled"`, `rules: []`.
2. Read eligible reviewers.
   - Expected target: owner user ID `7spxjTLm7lyPibNJavcTmx` is eligible, or an
     owner-only reviewer group exists.
   - Current known gap: `everyone_eligible: true` with no enumerated users or
     groups.
3. Create a gate review proposing only the review-settings change.
   - Proposed change shape should be limited to review governance fields such as
     `allowed_reviewers` and self-approval policy.
   - Do not propose `is_enabled: true`.
4. Verify the review by ID.
   - Confirm proposed change does not include gate enablement, rules, fallback,
     or targeting changes.
5. Have an eligible non-agent owner approve and commit, or stop if the API
   cannot express the owner-only reviewer constraint.
6. Read the gate again.
   - Required: `requiredReview: true`, owner-only reviewer constraint where
     supported, `isEnabled: false`, and `rules: []`.
7. Rehearse the unsafe path without committing it.
   - Create or attempt a proposed enable change only if the owner explicitly
     included this rehearsal in the authorization.
   - Confirm it remains pending, rejected, or otherwise uncommitted without the
     owner review.
   - Cancel/reject the rehearsal review and verify the gate is still disabled.

## Evidence to capture

Record these in Linear SAV-283 and the launch rehearsal issue:

- gate read before and after governance mutation
- review ID(s), status, proposer, reviewer, committed version, and timestamps
- proof that `isEnabled` stayed `false` and `rules` stayed empty
- proof that an unapproved enable did not apply
- note whether Statsig supported explicit owner-only allowed reviewers or
  required a dashboard/team-level workaround

Do not capture raw API keys, tokens, screenshots containing secrets, customer
identifiers, or production user/session data.

## Runtime relationship

The provider review setting protects the Statsig gate. It does not replace the
repository and Vercel runtime safeguards:

- `MEELNI_REACTIVATION_DEFAULT` must stay `false` before relaunch.
- The relaunch feature flag remains default-off until the owner separately says
  launch GO.
- Rollback must disable the Statsig gate and restore the Vercel fallback
  together so a provider outage cannot invert the intended state.
