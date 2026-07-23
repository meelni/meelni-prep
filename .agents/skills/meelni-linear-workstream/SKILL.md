---
name: meelni-linear-workstream
description: Use when starting, scoping, updating, or closing any Meelni coding-agent work stream that should be tracked in Linear, especially work organized as slices, epics, issues, sub-issues, PRs, or agent/human handoffs.
---

# Meelni Linear Workstream

Use this skill before meaningful Meelni work begins, then keep using it as progress changes. Linear is the shared source of work status for engineers, agents, designers, and PMs; local docs and PRs provide supporting detail.

## Canonical Shape

- Linear team: `Savi`.
- Linear project: `Meelni`.
- Project URL: `https://linear.app/saviiii/project/meelni-aae0fd4ee0f6`.
- Project purpose: long-running container for Meelni product and engineering work.
- Parent issue: one slice, epic, or outcome-oriented work stream.
- Child issue: one PR-sized deliverable or clearly separable task.
- Comment thread: running progress log, blocker log, verification evidence, and handoff notes.
- Project status update: use only for meaningful project-level changes, risk changes, or weekly summaries.
- Initiative: use only for multi-project strategic themes. Do not create one for ordinary slice work.
- Long-running owner-gated parent: a parent issue whose acceptance criteria
  require a human launch decision, signed owner authorization, provider/live
  action, or terminal evidence across multiple PRs. Examples include relaunch
  gates such as `SAV-198`, `SAV-167`, `SAV-168`, and `SAV-186`.

## Start Of Work

1. Read `AGENTS.md`, `docs/templates/AGENT_TASK_INTAKE.md`, and the relevant Meelni skill for the slice.
2. Use the Linear connector to resolve the workspace:
   - use team `Savi` and project `Meelni` as the canonical workspace;
   - if discovery tools are available, confirm the `Meelni` project before writing;
   - list project issues that match the user request;
   - list team statuses and labels before choosing state or labels.
3. If Linear needs reauthentication, stop Linear writes, tell the user, and continue only with local planning artifacts that do not pretend Linear was updated.
4. If the `Meelni` project does not exist, create it in team `Savi` with this summary:
   `Shared tracking for Meelni product, engineering, design, and agent work streams.`
5. Search for an existing parent slice issue. Reuse it when the intent matches. Create a new parent issue only when no suitable issue exists.
6. Create or update child issues before editing code when the requested work is meaningful, cross-layer, or likely to produce a PR.
7. For a repo-only, docs-only, guardrail, or tooling increment under a
   long-running owner-gated parent, create or reuse a PR-sized child issue and
   target the PR at that child. Do not make the parent issue the only linked
   issue unless the PR completes every parent acceptance criterion.

## Issue Format

Use this Markdown description for parent slice issues and substantial child issues:

```markdown
## Outcome
- User/business outcome:
- Success signal:
- Non-goals:

## Context
- Why now:
- Relevant repo docs/specs:
- Related Linear issues/PRs:

## Slice
- Primary slice:
- Secondary slices:
- Relevant Meelni skill(s):
- Owner type: agent | human | mixed

## Scope
- In scope:
- Out of scope:
- Assumptions:
- Dependencies/blockers:

## Acceptance Criteria
- [ ] Product behavior is clear to PM/design/engineering.
- [ ] Implementation is complete for the scoped slice.
- [ ] Relevant tests or manual checks are documented.
- [ ] Docs/specs/decisions are updated when behavior or architecture changes.
- [ ] PR is linked, reviewed as needed, merged, and the issue is closed only after merge.

## Technical Notes
- Likely files/packages:
- Data/provider dependencies:
- Rollout or migration notes:

## Validation
- Required commands:
- Manual checks:
- Regression fixtures needed:

## Handoff
- Current state:
- Next action:
- Risk:
```

Keep issue descriptions durable and readable. Put noisy execution details in comments rather than rewriting the issue body every time.

## Naming

- Parent issue title: `Slice: <outcome in plain English>`.
- Child issue title: `<area>: <PR-sized deliverable>`.
- Use product language over implementation-only language when possible.
- Prefer concrete outcomes: `Slice: Preserve interview transcripts for feedback review`, not `Slice: DB stuff`.

## Labels And State

- Inspect existing labels first. Use existing labels over creating near-duplicates.
- Preferred labels when available: `slice`, `agent`, `engineering`, `design`, `pm`, `docs`, `blocked`, `needs-spec`, `needs-design`, `needs-review`.
- If labels are missing, continue without labels unless the user has asked to maintain labels.
- Move issues through the team's normal states. Use state type semantics when exact names differ:
  - not started: backlog or todo;
  - active: in progress;
  - blocked: blocked;
  - ready for review: in review;
  - complete: done, only after PR merge or explicit no-code completion.

## Progress Comments

Add comments at these points:

- Start: selected slice, issue/PR plan, owner, first files to inspect.
- Material checkpoint: meaningful implementation progress, scope change, or decision.
- Blocker: what is blocked, evidence, and the smallest unblock request.
- Verification: commands/checks run, results, and any skipped checks.
- PR opened: PR link, summary, reviewer/design/PM notes.
- Finish: merge status, final validation, docs updated, follow-up issues.

Use concise comments. A useful update should answer: what changed, what evidence exists, what happens next.

## Agent Rules

- Do not begin meaningful implementation without either reusing or creating a Linear issue, unless Linear is unavailable.
- Do not close a Linear issue while the PR is unmerged, failing, or waiting on required review.
- Do not let a small PR close a long-running owner-gated parent. Use a
  PR-sized child issue for repo-only increments, and treat the parent as open
  until all acceptance criteria are evidenced.
- Do not use terminal PR language such as `closes`, `fixes`, or `resolves` for
  a parent issue unless the PR is intentionally completing that parent issue.
  Prefer neutral tracking language, for example: `Parent: SAV-198; closes
  SAV-293 only.`
- Do not mark scope complete without recording verification evidence.
- If the work changes shape, update Linear before continuing so the next agent or human can trust the trail.
- If a user asks for a quick exploratory answer with no code changes, a Linear issue is optional.

## Closing Work

Before final response or PR handoff:

1. Update the child issue with verification evidence and PR link.
2. Close completed child issues after merge.
3. Update the parent slice issue with remaining open work or close it if every acceptance criterion is met.
   For long-running owner-gated parents, re-check the parent state after any
   child PR merge and immediately move it back to the correct non-terminal
   state if GitHub/Linear automation moved it to Done prematurely.
4. Create follow-up issues for known deferred work instead of burying it in final chat text.
5. Mention Linear identifiers in the final answer.
