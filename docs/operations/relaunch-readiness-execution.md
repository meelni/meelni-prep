# Relaunch Readiness Execution

Status: prelaunch execution runbook. This document sequences already-tracked
launch-readiness evidence and provider actions. It does not authorize launch,
provider mutation, spend, or a feature-flag flip.

The human product owner remains the only launch GO/NO-GO authority. Keep
`meelni_reactivation_access` disabled and keep `MEELNI_REACTIVATION_DEFAULT`
`false` until a separate owner launch GO is explicitly bound to the exact
candidate. Passing this runbook's technical gates is readiness evidence, not a
launch decision.

Delegated-agent authorization may be used only for bounded repeat work that is
explicitly recorded under
`meelni.delegated-agent-authorization.v1`, such as repo-only guardrail repairs
or synthetic-only calibration retries inside an already approved spend envelope.
It is not a human-owner signature and cannot authorize launch, new spend caps,
Production data, customer transcripts, destructive actions, refunds, or live
provider mutations outside the bounded scope. Human-owner-only gates must reject
delegated artifacts.

## Canonical tracking

Use Linear as the shared source of work status:

- parent relaunch slice: `SAV-165`;
- activation and billing parent: `SAV-167`;
- feedback/progress parent: `SAV-168`;
- live Stripe catalog and Production envs: `SAV-126`;
- synthetic feedback calibration: `SAV-198`;
- Statsig owner-review governance: `SAV-283`;
- Preview fresh-user golden path: `SAV-186`;
- post-observation compatibility cleanup: `SAV-223`.

GitHub should be clean before any live execution. If open PRs exist, reconcile
or explicitly defer them in Linear before relying on launch-readiness evidence.
`SAV-223` intentionally remains backlog until the observation window closes; do
not treat it as a prelaunch blocker unless its threshold evidence contradicts
the accepted compatibility contract.

## Preflight snapshot

Run these read-only checks from a clean checkout of `origin/main`:

```bash
npm run --silent relaunch:readiness-snapshot
```

The command emits sanitized JSON for the GitHub PR/issue queue, local git
state, `origin/main`, exact `SAV-198` / `SAV-248` v31 ruleset readiness, and
v31 ledger-ref presence. It does not mutate GitHub, providers, Linear, feature
flags, ledger refs, or owner authorization artifacts.

If the command is unavailable, run the underlying read-only checks manually:

```bash
gh pr list --repo meelni/meelni-prep --state open \
  --json number,title,isDraft,headRefName,updatedAt

gh issue list --repo meelni/meelni-prep --state open \
  --json number,title,url,updatedAt

git fetch origin main --quiet
git rev-parse origin/main
```

Record the results on `SAV-165` before beginning the live sequence. A dirty or
stale local worktree is acceptable for inspection only; create a fresh worktree
for commands that prepare authorization payloads or run validation.

## Required owner authorization boundary

Before any live/provider mutation, the owner authorization must name the exact
action set. A broad "looks good" or "signed" message is not enough for a newly
prepared artifact, a regenerated artifact, or a different provider action.

Current prelaunch live actions require exact owner authorization for:

1. creating the `SAV-198` / `SAV-248` v31 GitHub calibration ledger rulesets;
2. signing the fresh `SAV-198` v31 owner authorization request;
3. running the synthetic-only calibration under the $3 cap;
4. signing and executing the `SAV-126` Stripe live catalog request;
5. updating Vercel Production envs with live Stripe price IDs;
6. creating and committing the `SAV-283` Statsig governance reviews.

None of those actions may enable the relaunch gate. Default-on remains a
separate owner-GO workflow.

## Execution order

### 1. Verify GitHub calibration guardrails

`SAV-198` v31 calibration requires two exact active repository rulesets for:

```text
refs/heads/meelni-ledger/sav-248-authorized-paid-calibration.v31
```

The required rulesets are:

1. `Meelni SAV-248 v31 calibration ledger immutable`
   - exact ref include;
   - no excludes;
   - no bypass actors;
   - rule types: `deletion`, `non_fast_forward`.
2. `Meelni SAV-248 v31 calibration activation actor`
   - exact ref include;
   - no excludes;
   - rule types: `creation`, `update`;
   - exactly one `always` bypass actor: GitHub user `saviii`, actor type
     `User`, user ID `24397508`.

Verify without mutating first:

```bash
gh api 'repos/meelni/meelni-prep/rulesets?includes_parents=true&targets=branch&per_page=100' \
  --jq '[.[] | select(.name|test("SAV-248 v31 calibration";"i")) | {id,name,target,enforcement}]'

gh api repos/meelni/meelni-prep/git/ref/heads/meelni-ledger/sav-248-authorized-paid-calibration.v31 \
  --jq '{ref:.ref, sha:.object.sha, type:.object.type}' || true
```

If the exact v31 rulesets are missing, stop unless the owner has explicitly
authorized the GitHub ruleset mutation. Do not manually create the v31 ledger
ref; the calibration runtime owns the single activation commit after the
signed authorization is verified.

Prepare the non-mutating ruleset payloads from the reviewed source when an
operator needs a fresh packet:

```bash
npm run calibration:github-guardrails -- \
  --output-dir /secure/external/path/sav-248-v31-github-guardrails
```

This command writes local JSON/README files only. It does not mutate GitHub or
authorize the paid run.

### 2. Sign and verify calibration authorization

Prepare, sign, and verify the calibration authorization with the
provider-free helper described in
[Evaluation Calibration](../contracts/evaluation-calibration.md). The artifact
must bind:

- one new `sav258_v31_auth_<32 hex>` authorization ID;
- the exact reviewed 40-character source commit;
- the regenerated plan hash;
- planned provider calls and physical attempts;
- the $3 and 96-call ceilings;
- synthetic or separately approved fixtures only;
- no customer transcripts;
- no Production data;
- non-reusability of predecessor authorities.

If a prepared request expired or was generated before the current `origin/main`
commit, regenerate it before signing. Verify before any provider/model call.

### 3. Run synthetic calibration

Run only the authorized synthetic provider calibration. Stop before total spend
can exceed $3 even if fewer than the planned calls complete. Calibration
reports may contain aggregate metrics, hashes, fixture IDs, and stable failure
codes; they must not contain provider credentials, customer transcripts,
Production payloads, or raw provider bodies.

Record the sanitized report path and pass/fail summary on `SAV-198` and
`SAV-168`. A passed calibration gate is still not launch GO.

### 4. Set up Stripe live catalog

Use [Production Action Authorization](./production-action-authorization.md)
for the `stripe-live-catalog` action. Before execution, verify live Stripe
state safely:

```bash
stripe products list --live --limit 100 --color off
stripe prices list --live --limit 100 --color off
stripe subscriptions list --live --status=active --limit=100 --color off
```

Production must use live-mode Stripe objects for the accepted credit catalog:

- `meelni_interview_pass_usd`;
- `meelni_starter_monthly_usd`;
- `meelni_pro_monthly_usd`.

Do not point Production at test-mode price IDs. Do not archive or delete legacy
prices as part of catalog creation unless the owner separately authorizes that
cleanup after checking active live subscriptions. Ordinary subscription
cancellation remains period-end; irreversible account deletion cancels
immediately without proration or refund.

### 5. Update Vercel Production Stripe envs

After live Stripe prices exist, update only the Production env names expected
by the app:

```text
STRIPE_INTERVIEW_PASS_PRICE_ID
STRIPE_STARTER_MONTHLY_PRICE_ID
STRIPE_PRO_MONTHLY_PRICE_ID
```

Use live Stripe price IDs only. Do not print secret values. After env changes,
run the scoped Production pull and preflight:

```bash
npm run env:pull:production
npm run db:preflight:production
```

Record only env names, target environment, safe price IDs, and preflight result
in Linear.

### 6. Commit Statsig governance

Use [Statsig Relaunch Governance](./statsig-relaunch-governance.md) for
`SAV-283`. The governance action must:

- keep `meelni_reactivation_access` disabled;
- keep gate `rules` empty unless an owner-approved rehearsal explicitly says
  otherwise;
- keep `meelni_preview_rehearsal_authority` disabled and `active: false`;
- enforce the accepted owner-review constraint as supported by Statsig;
- preserve the single-owner operating model rather than creating a false
  second-approver launch dependency.

Read back gate details, dynamic config details, reviews, and eligible
reviewers after commit. Record review IDs and final disabled state in `SAV-283`
and `SAV-165`.

### 7. Verify Preview golden path

Run `SAV-186` only after `SAV-198` has provider-backed calibration evidence and
`SAV-126`/`SAV-283` no longer block the target environment. The golden path
must prove signup, trial/credit behavior, selected question, interview,
feedback, and rollback/fail-closed behavior using approved Preview/staging
fixtures. It must not use customer transcripts or Production data.

### 8. Final readiness report

Before asking the owner for launch GO/NO-GO, update Linear with:

- command/result evidence for each leaf issue;
- provider object IDs that are safe to share;
- sanitized calibration report paths and pass/fail state;
- Vercel Production env names updated, not secret values;
- Statsig review IDs and final disabled gate/config state;
- any deferred follow-up issues.

Then summarize the final readiness recommendation on `SAV-165`. The owner may
still say NO-GO even if every technical gate passes.

## Rollback posture

Default-off and emergency-disable rollback remain available without launch GO.
If anything fails during prelaunch execution, stop, record the failure in the
leaf issue, and do not reuse consumed or expired authorization artifacts. A
later retry needs fresh evidence and a fresh exact authorization for the action
being retried.
