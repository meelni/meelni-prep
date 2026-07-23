# Stacked Pull Requests

Meelni's relaunch stacks must contain the exact current parent head. A GitHub
base label and a previously green test run are not proof of that relationship.

## Contract

`.github/stacked-prs.json` is the default-branch-owned, machine-readable
relationship registry. Each entry declares the repository, child branch,
parent branch, child PR number, and parent PR number. Mutable commit SHAs do
not belong in the registry: trusted CI resolves both PRs and refs from GitHub
for every run.

The PR body carries evidence because a commit cannot contain its own final SHA.
The `meelni-stack-evidence` block records the exact child head, parent head, and
merge-base tested by the reviewer. Hosted CI compares that block with Git and
invalidates it after either branch moves.

The verifier reports:

- resolved child and parent heads;
- actual merge-base;
- commits the child is behind and ahead of the parent;
- missing or superseded evidence fields.

Non-stacked branches targeting `main` are unaffected, including fork branches
whose local branch name happens to match a registered child. Declared stacks
must originate in the registered repository and fail closed when the PR number,
base, ref, head, parent, or evidence differs.

The trusted publisher completes the custom head-bound check with an explicit
GitHub `success` conclusion for an unregistered PR targeting `main`, while its
title and summary continue to say that the PR is not a registered stack child.
The custom check is exact-head audit evidence. Live classic protection did not
reliably enforce REST-created Check Runs even when their aggregate conclusion
was successful, so the stable GitHub Actions job context `Trusted Publisher` is
the required topology gate. It succeeds only when publication and topology
verification complete safely. This does not weaken stack validation: declared
stacks and undeclared non-default stacks still fail closed on invalid evidence.

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
actualParentHead = mergeBase
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

Then run relevant functional checks, push the child, and replace the PR-body
evidence block. A normal parent movement does not require a default-branch
manifest edit. Change the trusted registry only when the child/parent PR or ref
identity changes. A parent's new remediation commit invalidates every
descendant's evidence, so repeat in order.

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
local Git repositories. The authoritative `Trusted Publisher` job uses
`pull_request_target`, checks out only the repository's default branch, and
runs the verifier and registry from that trusted checkout. It never checks out
or executes a pull request's code. On every same-repository PR event the hosted
adapter revalidates the triggering PR and each open registered child whose
declared parent ref is the triggering PR's head ref. It fetches each
server-owned `refs/pull/<n>/head` plus its declared parent. Before fetching Git
refs, it loads both child and parent PRs from GitHub and validates their PR
numbers, head refs, repository, open state, and child base. It supplies the
server-returned child PR body to the deterministic verifier; event body, head,
repository, and base fields are not verification authority. After initial
trusted resolution and verification identifies the exact child head, it creates
a dedicated custom `Stack Topology / Verify` Check Run on that head. It then
reloads both PRs and refreshes both exact refs immediately before every
completion. Initial API, transport, or malformed-evidence errors fail the stable
publisher even when they occur before a custom check can be created. A changed
child or parent generation fails the in-progress check instead of publishing
stale success. Classic protection requires the stable
`Trusted Publisher` Actions job. A registered triggering child with invalid
topology fails that stable context. When a parent event discovers an invalid
dependent child, the child's custom check fails while the parent's stable
context succeeds. API or publication failures always fail the stable job.
Manual topology failures are recorded on child checks without making the sweep
itself fail; API or publication failures fail the sweep.
Push events fail closed in this adapter; local branch work uses the command
above.

All event, filtered default-branch, and manual publishers share one
non-cancelling workflow
concurrency group with GitHub's maximum pending queue. Parent events are not
replaced by a newer pending run, so each queued movement subsequently
republishes every dependent child's exact current generation. The workflow also
subscribes to `closed`: closing or deleting a parent PR revalidates its open
registered children, and a deleted parent ref fails their checks closed.

Draft branch movement and base changes run one combined dependency audit so a
ready peer cannot retain stale migration or topology evidence. Draft title
edits allocate no hosted runner. Draft body edits run only the bounded registry
snapshot refresh because evidence changes can invalidate a ready registry PR;
the normal topology check evaluates the latest body when the draft becomes
ready. Trusted checker or manifest changes on `main` and `workflow_dispatch`
each provide one combined full fan-out without executing code from a proposed
branch.

Because the repository is private, the trusted checkout retains the job token
long enough to fetch those two refs. Both jobs grant only `contents: read`,
`checks: write`, and `pull-requests: read`; event fan-out needs the last
permission to load current dependent-child metadata.
The token is never made available to PR code because no PR-controlled file is
checked out or executed, and checkout removes its stored credential during
cleanup.

For an exact one-file `modified` `.github/stacked-prs.json` pull request,
GitHub suppresses ordinary full Validate and this same default-branch checkout
may publish the protected `Validate` context after verifying the proposed
manifest as inert data. The publisher binds repository, PR, head, and base
identity; traverses the exact commit/tree/blob chain and accepts only one
non-truncated `100644 blob` whose SHA and bounded canonical bytes match every
GitHub response; checks the complete open stack inventory and every declared
topology twice; and creates a new exact-head pending check before the expensive
proof. Forks, extra
paths, added/removed/renamed registries, API errors, stale snapshots, and
concurrent movement receive no synthetic success. The same non-cancelling
publisher queue sweeps every open ready registry candidate on ready and close
events, draft branch/base movement, draft evidence-body edits, and trusted
push/manual fan-out. A later-invalid generation completes the pending check as
failure; a failure completing an already-created check leaves that check pending
and blocking. A failure before a replacement check is created can leave an
older cross-PR green result visible. The result is validation evidence, not
merge authorization. Exact registry-only PRs must never use repository-owned
auto-merge, a custom write-token merge workflow, recovery inference, or admin
bypass. After confirming the live base is `main`, the intended exact head is
current, and all three required contexts are successful, the human owner uses
GitHub's native protected pull-request merge as documented in
`docs/operations/ci-cost-control.md`. If live branch protection is also
expecting the ordinary CI `Validate` job, include a small relevant operations
documentation update with the registry change rather than bypassing protection
or publishing a synthetic merge authorization.

This repository's merge queue is not currently configured, auto-merge is
disabled, and CI does not support `merge_group`. GitHub's pull-request merge API
can bind the head but not an expected base SHA, so repeated custom preflight
reads cannot create atomic merge semantics. The bespoke merge and recovery
surface is intentionally absent. A future native merge queue requires a
separately reviewed repository-policy, validation-trigger, and cost change.

This separation is intentional. A normal `pull_request` job executes files from
the proposed change, so it cannot be the authority that decides whether its own
checker or registry was weakened. The trusted workflow has read-only repository
permission and does not expose secrets to PR code.

Functional, security, Preview, and provider verification remain separate
requirements.

For an unregistered PR targeting `main`, the custom check's explicit success is
compatibility evidence, not stack evidence. The required `Trusted Publisher`
job succeeds after the trusted adapter safely publishes that result. Registered
stack children receive success only after exact child, parent, ancestry, and
PR-body evidence verification.

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

The check runs on non-draft open, reopen, synchronize, edit, and ready-for-review
events, plus close events and operator-controlled or filtered default-branch
revalidation. Draft branch movement and base edits use one combined dependency
audit; draft body and title edits do not run the migration audit (the separate
registry refresh handles body evidence). Manual and default-branch full sweeps
publish every open same-repository PR, replacing stale non-owner evidence with
a neutral exact-head result. An identical completed result on the same exact
head is reused, bounding Check Run churn. The workflow still checks out only
default-branch code; it reads PR metadata and file names but never fetches or
executes PR files for collision detection.

Classic protection requires the stable `Migration Collision Publisher` Actions
job, not the REST-created custom Check Run. The event job still inventories all
open same-repository PRs and publishes custom failure evidence to every
collision owner. Its required job context fails for global inventory,
publication, or freshness errors and when the triggering open PR's own result
is failure/error. A non-migration trigger succeeds despite unrelated existing
collisions, and a closed trigger does not inherit peer collisions. Fork events
cannot prove ownership with the same-repository inventory and fail the required
job closed; private-repository changes must use a maintainer-owned branch.

Topology event, filtered default-branch, and manual runs inherit the workflow's
one global,
non-canceling `queue: max` boundary. Each parent event fans out to the triggering
PR and its open registered dependents, so topology publication is not scoped to
per-PR concurrency. Migration jobs run inside that globally queued workflow and
also share the `migration-collision-audit` serialization boundary across event
event publishers. Draft-impact and full revalidation each run both audits in a
single globally serialized job and continue to the second audit if the first
fails. This prevents an older migration audit from landing green after a newer
run has detected a collision. The publisher also rechecks
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

1. Configure the GitHub Actions job contexts `Trusted Publisher` and
   `Migration Collision Publisher` as required checks for every protected
   branch that can receive a relaunch PR. Keep `Validate` required on `main`.
   Do not require the REST-created `Stack Topology / Verify` or
   `Migration Collision / Verify` Check Runs under classic protection; inspect
   them as exact-head audit evidence.
2. Starting at each stack root, fetch the exact current parent and run the local
   command above. Do not change evidence for a failing topology.
3. Replace the PR-body evidence block with the exact result. The body edit
   triggers a fresh trusted check for existing PRs.
4. Confirm the check is attached to the exact current PR head. PR #263 must show
   `head_does_not_contain_current_parent` until it is reconverged; an old green
   general `Validate` result is not an exception.
5. Reconverge root-to-leaf. Land each expected-parent update on `main`, replace
   the affected PR's evidence, and require a new trusted pass after every parent
   or child movement. Use the manual dispatch when no qualifying PR event will
   publish the updated evidence. Keep the child blocked while its default-branch
   manifest update is under review.

Keep the relaunch and stack merge queue frozen until every open stacked PR has
successful `Trusted Publisher` and `Migration Collision Publisher` jobs plus
fresh `Stack Topology / Verify` and `Migration Collision / Verify` audit
results. If repository rules cannot require the jobs on a non-default target
branch, treat their absence as a manual merge block.
