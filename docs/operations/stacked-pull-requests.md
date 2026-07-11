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

The trusted publisher completes the head-bound check with an explicit GitHub
`success` conclusion for an unregistered PR targeting `main`, while its title
and summary continue to say that the PR is not a registered stack child. This
is required because classic branch protection does not accept a `neutral`
conclusion for a required check. It does not weaken stack validation: a PR that
matches a declaration must still pass exact stack verification, and a PR that
targets a non-default branch without a declaration or has stale topology or
evidence still fails closed.

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
or executes a pull request's code. On every same-repository PR event the hosted
adapter revalidates the triggering PR and each open registered child whose
declared parent ref is the triggering PR's head ref. It fetches each
server-owned `refs/pull/<n>/head` plus its declared parent and supplies the exact
PR body to the deterministic verifier. It creates a dedicated
`Stack Topology / Verify` Check Run on that child head before Git verification,
then refreshes both exact refs immediately before completing success. A changed
child or parent generation fails the in-progress check instead of publishing a
stale success. The workflow's own job has a different name and is not the
branch-protection context. Push events fail closed in this adapter; local branch
work uses the command above.

All event, scheduled, and manual publishers share one non-cancelling workflow
concurrency group with GitHub's maximum pending queue. Parent events are not
replaced by a newer pending run, so each queued movement subsequently
republishes every dependent child's exact current generation. The workflow also
subscribes to `closed`: closing or deleting a parent PR revalidates its open
registered children, and a deleted parent ref fails their checks closed.

A trusted default-branch schedule re-reads every open manifest entry every five
minutes. It loads current PR metadata through the read-only API, fetches the
current parent, and publishes a new head-bound result. Parent movement or a
default-branch manifest change therefore replaces stale success without
executing code from either branch. `workflow_dispatch` provides the same fan-out
for an immediate operator refresh.

Because the repository is private, the trusted checkout retains the job token
long enough to fetch those two refs. Both jobs grant only `contents: read`,
`checks: write`, and `pull-requests: read`; event fan-out needs the last
permission to load current dependent-child metadata.
The token is never made available to PR code because no PR-controlled file is
checked out or executed, and checkout removes its stored credential during
cleanup.

This separation is intentional. A normal `pull_request` job executes files from
the proposed change, so it cannot be the authority that decides whether its own
checker or registry was weakened. The trusted workflow has read-only repository
permission and does not expose secrets to PR code.

Functional, security, Preview, and provider verification remain separate
requirements.

For an unregistered PR targeting `main`, the required check's explicit success
is branch-protection compatibility, not stack evidence. Registered stack
children receive success only after exact child, parent, ancestry, and PR-body
evidence verification.

## Cross-PR migration ownership

Stack ancestry alone cannot detect two sibling or standalone PRs adding
different Drizzle files with the same sequence. The trusted workflow therefore
loads the paginated open-PR list and each same-repository PR's paginated file
diff from GitHub. Every non-removed change to a direct
`lib/db/migrations/<numeric>_*.sql` file owns its numeric sequence, so two PRs
modifying the same numbered file also collide. Removing a migration or renaming
away its prior path fails as an immutable-history violation; the API inventory
does not guess that changing committed history is safe. Snapshot JSON and
`_journal.json` are companion artifacts, not independent owners.

`Migration Collision / Verify` is published on each exact open PR head:

- success means every sequence changed by that head has one open owner;
- failure names every colliding PR and migration path;
- neutral means that head changes no numeric Drizzle SQL migration;
- an incomplete API inventory fails closed rather than publishing speculative
  success.

The check runs on open, reopen, synchronize, edit, close, draft-conversion, and
ready-for-review events, plus the same five-minute/manual trusted revalidation.
Scheduled runs target only migration or immutable-history owners; the triggering
non-migration PR receives a neutral result. An identical completed result on the
same exact head is reused, bounding Check Run churn. The workflow still checks
out only default-branch code; it reads PR metadata and file names but never
fetches or executes PR files for collision detection.

Topology event, scheduled, and manual runs inherit the workflow's one global,
non-canceling `queue: max` boundary. Each parent event fans out to the triggering
PR and its open registered dependents, so topology publication is not scoped to
per-PR concurrency. Migration jobs run inside that globally queued workflow and
also share the `migration-collision-audit` serialization boundary across event
and scheduled publishers. This prevents an older migration audit from landing
green after a newer run has detected a collision. The publisher also rechecks
the full inventory and exact PR head before lookup, after lookup, and after
Check Run creation immediately before completion. Check output records a
deterministic SHA-256 inventory generation, and reuse requires that same
generation. A moved or unverifiable PR set gets failure instead of stale
success.

This gate prevents new duplicate ownership; it does not make independently
generated journals composable. Merge one migration-bearing PR at a time in the
canonical SAV-241 order. After each schema merge, rebase the next PR onto the
actual new `main`, remove superseded migration artifacts, regenerate its SQL,
journal entry, and snapshot at the next valid sequence, then rerun clean and
legacy-upgrade database migration tests. The PR body must name its exact base,
head, and migration predecessor. Do not merge merely because the collision
check is green.

## Initial rollout for the existing stacks

Merging the gate to `main` makes the trusted workflow available without copying
the checker through every existing stack branch. It does not retroactively make
old green `Validate` runs topology evidence. Before any stacked PR merges:

1. Configure the explicit head-bound `Stack Topology / Verify` and
   `Migration Collision / Verify` Check Runs as required checks for every
   protected branch that can receive a relaunch PR. Do not select the workflow
   jobs `Relaunch Integration Gates / Stack Topology Publisher` or
   `Relaunch Integration Gates / Migration Collision Publisher`.
2. Starting at each stack root, fetch the exact current parent and run the local
   command above. Do not change evidence for a failing topology.
3. Replace the PR-body evidence block with the exact result. The body edit
   triggers a fresh trusted check for existing PRs.
4. Confirm the check is attached to the exact current PR head. PR #263 must show
   `head_does_not_contain_current_parent` until it is reconverged; an old green
   general `Validate` result is not an exception.
5. Reconverge root-to-leaf. Land each expected-parent update on `main`, replace
   the affected PR's evidence, and require a new trusted pass after every parent
   or child movement. The scheduled fan-out fails old evidence automatically;
   use the manual dispatch when waiting five minutes is unsafe. Keep the child
   blocked while its default-branch manifest update is under review.

Keep the relaunch and stack merge queue frozen until every open stacked PR has a
fresh `Stack Topology / Verify` result. If repository rules cannot require the
check on a non-default target branch, treat its absence as a manual merge block.
