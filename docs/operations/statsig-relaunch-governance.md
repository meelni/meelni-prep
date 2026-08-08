# Statsig Relaunch Governance

Updated: 2026-08-08
Status: Production is owner-launched; owner-only reviewer eligibility is configured, while required-review enforcement still needs proof or a documented Statsig limitation.

This runbook covers the `meelni_reactivation_access` Statsig gate, which
controls whether discontinued/relaunch-gated product entry points reopen. It
does not authorize a new launch-state mutation. Only the human product owner can
make a Production access-state decision. The owner recorded launch completion
on 2026-07-26; Preview rehearsal must preserve that launched state.

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

The governance checks on 2026-07-23 returned the following prelaunch state:

Gate `meelni_reactivation_access`:

- `status: "Disabled"`
- `isEnabled: false`
- `rules: []`
- `reviewSettings.requiredReview: false`
- `reviewSettings.allowedReviewers: []`
- eligible reviewers API: `everyone_eligible: false`, with owner user
  `7spxjTLm7lyPibNJavcTmx` / `contact@meelni.com` and no reviewer groups
- committed review `6Uip5thkTs2D7ascrYKYkQ`, type `allowed_reviewers`

Dynamic config `meelni_preview_rehearsal_authority`:

- `status: "Disabled"`
- `isEnabled: false`
- `rules: []`
- `defaultValue.active: false`
- retained historical rehearsal metadata:
  - `approvedCommitSha: "99907616fa957135bb0d5b01b78fe0ca6a4d78d2"`
  - `approvedGitRef: "codex/sav-268-preview-lineage-reconciliation"`
  - `authorizedAt: "2026-07-19T13:21:47.878Z"`
  - `expiresAt: "2026-07-19T13:31:47.878Z"`
- eligible reviewers API: `everyone_eligible: false`, with owner user
  `7spxjTLm7lyPibNJavcTmx` / `contact@meelni.com` and no reviewer groups
- committed review `QHCBMD2kK9ZIwA4hXmdzP`, type `allowed_reviewers`

The owner subsequently launched Production on 2026-07-26. A read-only Statsig
check on 2026-08-08 returned this current state:

- gate version 97 is enabled with one public 100% rule, `Launch all users`;
- the gate was last changed by the owner account during the recorded launch;
- `meelni_preview_rehearsal_authority` is disabled with
  `defaultValue.active: false`;
- its retained metadata is inactive and expired and points at the old
  `codex/staging` commit `67b0247d62d23f4a61e1bacd4d94aebe97f78455`.

The dynamic config therefore grants no current rehearsal authority. Statsig
limits eligible reviewers for both controls to the owner account. However, the
gate detail endpoint still reports `reviewSettings.requiredReview: false` and
does not show allowed reviewers there, so required-review enforcement is not
yet proven. Do not claim SAV-283 complete until either required review is read
back as enforced or the exact Statsig platform/API limitation is recorded.

## Required governance target

Before any review-governance change or rehearsal-authority mutation, configure
Statsig so that:

1. `meelni_reactivation_access` requires review for gate changes.
2. `meelni_preview_rehearsal_authority` requires review for dynamic-config
   changes.
3. `contact@meelni.com` is the explicit allowed reviewer if the Statsig plan and
   API support user-scoped reviewers.
4. Self-approval remains available for the owner-only single-operator workflow,
   matching the accepted decision that Meelni should not require a fake second
   approver.
5. The mutation preserves the gate's current enabled state, version-97 public
   `Launch all users` rule, `idType`, targeting, fallback defaults, and release
   state unless the owner separately authorizes an emergency Production
   access-state change.
6. The dynamic config remains disabled after the governance mutation, with
   `defaultValue.active: false` and no current rehearsal authority.

If Statsig cannot separately require review while preserving the owner-only
reviewer constraint, stop and record the exact limitation in Linear. Do not
substitute owner-only eligibility alone as proof that review is required.

## Owner authorization packet

SAV-283 required explicit owner approval before creating or committing a Statsig
review. The 2026-07-23 owner-only eligibility mutations have been committed, but
any future review-governance mutation, launch rehearsal, gate access-state
change, or dynamic-config activation still requires explicit owner
authorization. The
authorization request should include:

- gate ID: `meelni_reactivation_access`
- dynamic config ID: `meelni_preview_rehearsal_authority`
- current launched state: gate version 97 enabled with the public
  `Launch all users` rule; dynamic config disabled and `active: false`; owner
  `contact@meelni.com`
- proposed operation: enable required review where supported, preserving the
  owner-only reviewer constraint for both controls
- explicit non-goals: do not disable or retarget the gate, do not change
  `MEELNI_REACTIVATION_DEFAULT`, do not activate Preview rehearsal authority,
  and do not change Production launch state
- rollback rehearsal: prove a proposed Production access-state change can be
  rejected or left uncommitted, then preserve the launched gate state

Approved wording should be precise, for example:

> I authorize the SAV-283 Statsig governance mutation for
> `meelni_reactivation_access` and
> `meelni_preview_rehearsal_authority`: require review where supported,
> preserve eligible reviewers as `contact@meelni.com`, preserve owner
> self-commit for the single-operator workflow, preserve the current enabled
> gate and public targeting rule, and do not change dynamic config active state,
> fallback defaults, or launch state.

## API rehearsal sequence

Use the Statsig API or MCP tools with a user-owned key so review actions are
auditable. Never paste keys, tokens, screenshots with secrets, or customer data
into chat, docs, Linear, or PRs.

1. Read the gate and dynamic config.
   - Expected gate: enabled version 97 with only the public
     `Launch all users` rule.
   - Expected dynamic config: disabled with `defaultValue.active: false` and an
     expired authorization window.
2. Read eligible reviewers for both controls.
   - Expected target: owner user ID `7spxjTLm7lyPibNJavcTmx` is eligible, or an
     owner-only reviewer group exists.
   - Current provider state: `everyone_eligible: false`, owner user
     `7spxjTLm7lyPibNJavcTmx` eligible, no reviewer groups.
3. Create gate and dynamic-config reviews proposing only review-settings
   changes.
   - Proposed change shape should be limited to review governance fields such as
     `allowed_reviewers` and self-approval policy.
   - Do not propose a gate enabled-state or targeting change, or
     `default_value.active: true`.
4. Verify each review by ID.
   - Confirm the proposed change does not include gate enabled-state, rules,
     fallback, dynamic config activation, or targeting changes.
5. Commit through the owner account for the single-operator workflow, or stop if
   the API cannot express the required-review setting without weakening the
   owner-only reviewer constraint.
6. Read the gate and dynamic config again.
   - Required before closing SAV-283: `requiredReview: true` if Statsig exposes
     that state, owner-only reviewer constraint, the unchanged enabled
     version-97 public rule, and dynamic config `defaultValue.active: false`;
     otherwise a documented platform limitation explaining why required-review
     enforcement cannot be proven separately from owner-only eligibility.
7. Rehearse the unsafe path without committing it.
   - Create or attempt a proposed Production access-state change only if the
     owner explicitly included this rehearsal in the authorization.
   - Confirm it remains pending, rejected, or otherwise uncommitted without the
     owner review.
   - Cancel/reject the rehearsal review and verify the launched gate state is
     unchanged.

## Evidence to capture

Record these in Linear SAV-283 and the launch rehearsal issue:

- gate read before and after governance mutation
- review ID(s), status, proposer, reviewer, committed version, and timestamps
- proof that the enabled state and public rule stayed unchanged
- proof that an unapproved Production access-state change did not apply
- note whether Statsig supported explicit owner-only allowed reviewers or
  required a dashboard/team-level workaround

Do not capture raw API keys, tokens, screenshots containing secrets, customer
identifiers, or production user/session data.

## Runtime relationship

The provider review setting protects the Statsig gate. It does not replace the
repository and Vercel runtime safeguards:

- Production currently uses the owner-approved pair
  `MEELNI_RELAUNCH_PHASE=launched` and `MEELNI_REACTIVATION_DEFAULT=true`.
- Preview uses `MEELNI_RELAUNCH_PHASE=rehearsal`, fallback `false`, an exact
  deployment SHA/ref, and separately authorized dynamic config. It must not
  change the shared Production gate.
- An owner-authorized Production rollback must disable the Statsig gate and
  restore phase `prelaunch` plus fallback `false` together so a provider outage
  cannot invert the intended state.
