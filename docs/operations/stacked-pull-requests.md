# Stacked Pull Requests

Meelni's relaunch stacks must contain the exact current parent head. A GitHub
base label and a previously green test run are not proof of that relationship.

## Contract

`.github/stacked-prs.json` is the machine-readable relationship registry. Each
entry declares the child branch, parent branch, PR number, and exact parent head
the child is expected to contain. The declaration is stale as soon as the
parent branch moves.

The PR body carries evidence because a commit cannot contain its own final SHA.
The `meelni-stack-evidence` block records the exact child head, parent head, and
merge-base tested by the reviewer. Hosted CI compares that block with Git and
invalidates it after either branch moves.

The verifier reports:

- declared and actual parent head;
- actual merge-base;
- commits the child is behind and ahead of the parent;
- missing or superseded evidence fields.

Non-stacked branches are unaffected. Declared stacks fail closed.

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

Then update that child's `expectedParentHead` in the manifest, run relevant
functional checks, push, and replace the PR-body evidence block. A parent's new
remediation commit invalidates every descendant's evidence, so repeat in order.

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
local Git repositories. The hosted adapter reads the checked-in manifest,
fetches only the declared parent ref, and supplies the GitHub event's exact PR
head and body to the verifier. Functional, security, Preview, and provider
verification remain separate requirements.
