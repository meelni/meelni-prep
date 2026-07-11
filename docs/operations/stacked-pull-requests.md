# Stacked Pull Requests

Meelni's relaunch stacks must contain the exact current parent head. A GitHub
base label and a previously green test run are not proof of that relationship.

## Contract

`.github/stacked-prs.json` is the default-branch-owned, machine-readable
relationship registry. Each entry declares the repository, child branch,
parent branch, PR number, and exact parent head the child is expected to
contain. The declaration is stale as soon as the parent branch moves.

The PR body carries evidence because a commit cannot contain its own final SHA.
The `meelni-stack-evidence` block records the exact child head, parent head, and
merge-base tested by the reviewer. Hosted CI compares that block with Git and
invalidates it after either branch moves.

The verifier reports:

- declared and actual parent head;
- actual merge-base;
- commits the child is behind and ahead of the parent;
- missing or superseded evidence fields.

Non-stacked branches targeting `main` are unaffected, including fork branches
whose local branch name happens to match a registered child. Declared stacks
must originate in the registered repository and fail closed when the PR number,
base, ref, head, parent, or evidence differs.

## Local verification

Fetch the current child and parent refs, then run:

```bash
npm run check:stack -- \
  --head-ref codex/child-branch \
  --head-revision refs/remotes/origin/codex/child-branch \
  --parent-revision refs/remotes/origin/codex/parent-branch \
  --skip-evidence
```

The JSON result must show:

```text
status: pass
declaredParentHead = actualParentHead = mergeBase
behind: 0
```

Copy the exact `head`, `actualParentHead`, and `mergeBase` into the PR template's
evidence block. Pushes do not require PR-body evidence, but pull-request CI does.

To audit the historical PR #263 failure mode, run the same command with
`codex/sav-229-stable-start-attempt` as the child and
`codex/sav-193-transcript-privacy` as the parent. Until it is reconverged, the
command reports the old merge-base and a nonzero `behind` count.

## Reconvergence policy

Do not force-push or rewrite shared stack history. Converge from the root toward
the leaves with an ordinary parent merge:

```bash
git fetch origin
git switch codex/child-branch
git merge --no-ff origin/codex/parent-branch
```

Then update that child's `expectedParentHead` in the authoritative manifest on
`main`, run relevant functional checks, push the child, and replace the PR-body
evidence block. Do not rely on a manifest edit that exists only inside the
stacked child; the trusted workflow intentionally ignores PR-controlled copies.
A parent's new remediation commit invalidates every descendant's evidence, so
repeat in order.

Current runtime/privacy/billing order:

1. `sav-189-deadline-server`
2. `sav-190-reconnect-recovery`
3. `sav-194-transcript-ingest`
4. `sav-193-transcript-privacy`
5. `sav-229-stable-start-attempt`
6. `sav-230-provider-credit-recovery`
7. `sav-231-billing-truth`

`sav-149-transcript-body-hardening` branches from transcript ingest and should
reconverge after that parent stabilizes.

Current feedback order:

1. `sav-194-transcript-ingest`
2. `sav-195-feedback-v2`
3. `sav-196-evaluation-validation`
4. `sav-197-feedback-workflow`
5. `sav-198-evaluation-calibration`
6. `sav-201-deterministic-recommendations`

`sav-211-feedback-accessibility` branches from evaluation validation and should
reconverge after that parent stabilizes.

## CI behavior

The verifier itself performs no network access. Unit tests construct temporary
local Git repositories. The authoritative `Stack Topology / Verify` check uses
`pull_request_target`, checks out only the repository's default branch, and
runs the verifier and registry from that trusted checkout. It never checks out
or executes a pull request's code. The hosted adapter validates the event's PR
number and repository identity, fetches the server-owned `refs/pull/<n>/head`
plus the one declared parent ref, and supplies the exact PR body to the
deterministic verifier. Push events fail closed in this adapter; local branch
work uses the command above.

Because the repository is private, the trusted checkout retains the workflow's
`contents: read` token long enough to fetch those two refs. The token is never
made available to PR code because no PR-controlled file is checked out or
executed, and the checkout action removes its stored credential during cleanup.

This separation is intentional. A normal `pull_request` job executes files from
the proposed change, so it cannot be the authority that decides whether its own
checker or registry was weakened. The trusted workflow has read-only repository
permission and does not expose secrets to PR code.

Functional, security, Preview, and provider verification remain separate
requirements.

## Initial rollout for the existing stacks

Merging the gate to `main` makes the trusted workflow available without copying
the checker through every existing stack branch. It does not retroactively make
old green `Validate` runs topology evidence. Before any stacked PR merges:

1. Configure `Stack Topology / Verify` as a required check for every protected
   branch that can receive a stacked PR.
2. Starting at each stack root, fetch the exact current parent and run the local
   command above. Do not change evidence for a failing topology.
3. Replace the PR-body evidence block with the exact result. The body edit
   triggers a fresh trusted check for existing PRs.
4. Confirm the check is attached to the exact current PR head. PR #263 must show
   `head_does_not_contain_current_parent` until it is reconverged; an old green
   general `Validate` result is not an exception.
5. Reconverge root-to-leaf. Land each expected-parent update on `main`, replace
   the affected PR's evidence, and require a new trusted pass after every parent
   or child movement. Keep the child blocked while its default-branch manifest
   update is under review.

Keep the relaunch and stack merge queue frozen until every open stacked PR has a
fresh `Stack Topology / Verify` result. If repository rules cannot require the
check on a non-default target branch, treat its absence as a manual merge block.
