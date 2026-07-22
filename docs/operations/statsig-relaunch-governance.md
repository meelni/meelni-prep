# Statsig Relaunch Governance

Status: pending owner-approved provider mutation.

This runbook covers the `meelni_reactivation_access` Statsig gate, which
controls whether discontinued/relaunch-gated product entry points reopen. It
does not authorize launch. Only the human product owner can make the final
launch GO/NO-GO decision, and the relaunch gate must remain disabled until that
separate decision is explicit.

## Canonical controls

| Field                 | Value                                                                                 |
| --------------------- | ------------------------------------------------------------------------------------- |
| Statsig project       | `01k0KuJePjFDEf80vuH61R`                                                              |
| Gate ID               | `meelni_reactivation_access`                                                          |
| Gate name             | `Meelni Reactivation Access`                                                          |
| Dynamic config ID     | `meelni_preview_rehearsal_authority`                                                  |
| Dynamic config name   | `Meelni Preview Rehearsal Authority`                                                  |
| Owner                 | `Savi Singh <contact@meelni.com>`                                                     |
| Owner Statsig user ID | `7spxjTLm7lyPibNJavcTmx`                                                              |
| Gate permalink        | `https://console.statsig.com/01k0KuJePjFDEf80vuH61R/gates/meelni_reactivation_access` |

## Current provider evidence

Read-only Statsig checks on 2026-07-22 returned:

Gate `meelni_reactivation_access`:

- `status: "Disabled"`
- `isEnabled: false`
- `rules: []`
- `reviewSettings.requiredReview: false`
- `reviewSettings.allowedReviewers: []`
- eligible reviewers API: `everyone_eligible: true`, with no enumerated users
  or reviewer groups
- review list: empty

Dynamic config `meelni_preview_rehearsal_authority`:

- `status: "Disabled"`
- `isEnabled: false`
- `rules: []`
- `defaultValue.active: false`
- retained historical rehearsal metadata:
  - `approvedCommitSha:
    "99907616fa957135bb0d5b01b78fe0ca6a4d78d2"`
  - `approvedGitRef: "codex/sav-268-preview-lineage-reconciliation"`
  - `authorizedAt: "2026-07-19T13:21:47.878Z"`
  - `expiresAt: "2026-07-19T13:31:47.878Z"`
- eligible reviewers API: `everyone_eligible: true`, with no enumerated users
  or reviewer groups
- review list: empty

This means both controls are safely off. The dynamic config's retained metadata
is inactive and expired, so it grants no rehearsal authority. Statsig still does
not enforce the accepted owner-only launch authority: a sufficiently privileged
editor could change the gate or config unless provider-side review settings are
configured.

## Required governance target

Before any relaunch rehearsal or launch flip, configure Statsig so that:

1. `meelni_reactivation_access` requires review for gate changes.
2. `meelni_preview_rehearsal_authority` requires review for dynamic-config
   changes.
3. `contact@meelni.com` is the explicit allowed reviewer if the Statsig plan and
   API support user-scoped reviewers.
4. Self-approval remains disabled unless a later owner-approved decision
   explicitly says otherwise.
5. The mutation does not change `isEnabled`, `status`, `rules`, `idType`,
   targeting, fallback defaults, retained inactive rehearsal metadata, or
   release state.
6. The gate and dynamic config remain disabled after the governance mutation,
   with `defaultValue.active: false`.

If Statsig cannot restrict allowed reviewers to the owner account, stop and
record the exact limitation in Linear. Do not substitute "everyone eligible" as
an owner-only control.

## Owner authorization packet

SAV-283 requires explicit owner approval before creating or committing a Statsig
review. The authorization request should include:

- gate ID: `meelni_reactivation_access`
- dynamic config ID: `meelni_preview_rehearsal_authority`
- current safe state: both controls disabled, no rules, dynamic config
  `active: false`, owner `contact@meelni.com`
- proposed operation: enable required review and restrict allowed reviewers to
  the owner account when supported for both controls
- explicit non-goals: do not enable the gate, do not add rules, do not change
  `MEELNI_REACTIVATION_DEFAULT`, do not activate Preview rehearsal authority,
  do not authorize launch
- rollback rehearsal: prove a proposed enable can be rejected or left
  uncommitted, then leave the gate disabled

Approved wording should be precise, for example:

> I authorize the SAV-283 Statsig governance mutation for
> `meelni_reactivation_access` and
> `meelni_preview_rehearsal_authority`: require review, restrict eligible
> reviewers to `contact@meelni.com` where supported, keep self-approval
> disabled, and do not change enabled state, dynamic config active state,
> targeting rules, fallback defaults, or launch state.

## API rehearsal sequence

Use the Statsig API or MCP tools with a user-owned key so review actions are
auditable. Never paste keys, tokens, screenshots with secrets, or customer data
into chat, docs, Linear, or PRs.

1. Read the gate and dynamic config.
   - Expected: `isEnabled: false`, `status: "Disabled"`, `rules: []`.
   - For the dynamic config, also require `defaultValue.active: false`.
2. Read eligible reviewers for both controls.
   - Expected target: owner user ID `7spxjTLm7lyPibNJavcTmx` is eligible, or an
     owner-only reviewer group exists.
   - Current known gap: `everyone_eligible: true` with no enumerated users or
     groups.
3. Create gate and dynamic-config reviews proposing only review-settings
   changes.
   - Proposed change shape should be limited to review governance fields such as
     `allowed_reviewers` and self-approval policy.
   - Do not propose `is_enabled: true` or `default_value.active: true`.
4. Verify each review by ID.
   - Confirm proposed change does not include gate enablement, rules, fallback,
     dynamic config activation, or targeting changes.
5. Have an eligible non-agent owner approve and commit, or stop if the API
   cannot express the owner-only reviewer constraint.
6. Read the gate and dynamic config again.
   - Required: `requiredReview: true`, owner-only reviewer constraint where
     supported, `isEnabled: false`, `rules: []`, and dynamic config
     `defaultValue.active: false`.
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
