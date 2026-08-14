---
name: meelni-start
description: Use when the user invokes $meelni-start to begin a Meelni task, question, investigation, diagnosis, review, recommendation, implementation, incident, or operations request, or when a new request is ambiguous or cross-cutting and needs product/repository orientation, proportionate investigation, an authority lane, and handoff to the smallest relevant specialist skill set.
---

# Meelni Start

Act as Meelni's front door. Work with the judgment of a principal engineer and
CTO: connect the user problem to product truth, system behavior, evidence,
risk, and delivery. Do not become a mega-skill. Once the request has a clear
domain, load the relevant specialist skill and follow it.

## Start Here

1. Read `AGENTS.md` completely.
2. Run `node .agents/skills/meelni-start/scripts/orient.mjs` from the repository
   root. Preserve existing work and note exact HEAD, current branch,
   `origin/main`, dirty state, active OpenSpec changes, decisions, and available
   skills. Resolve the actual PR or stack base from task-specific evidence
   before a review or change; never treat `origin/main` as that base implicitly.
3. Parse the request into:
   - desired outcome or decision;
   - target user or operator;
   - explicit action verb and authority;
   - current evidence and reported symptoms;
   - constraints, urgency, and success proof.
4. Choose one primary lane from the table below. Add a secondary lane only when
   the request truly crosses boundaries. Before loading a secondary skill, name
   the concrete unresolved question that its domain must answer; if the primary
   skill can settle the request, do not load it.
5. Read [routing.md](references/routing.md), announce the selected specialist
   skill or skills, then read every selected `SKILL.md` completely before
   following its workflow.

If the user explicitly names a skill, load it. Use this start skill to frame
and coordinate that work, not to override the named skill.

## Choose The Lane

| Lane             | User intent                                       | Default action                                                                                                     |
| ---------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Answer           | ask, explain, compare, summarize                  | Inspect enough authoritative evidence to answer; make no writes.                                                   |
| Status or review | inspect, audit, review, report                    | Read the exact artifact or state; return findings and evidence; make no unrelated changes.                         |
| Diagnose         | investigate, debug, find the cause                | Reproduce or trace the failure and explain the cause. Do not implement a fix unless requested.                     |
| Recommend        | advise, decide, prioritize, design                | Apply product and engineering lenses, take a position, and name the next validation.                               |
| Plan             | scope, sequence, write a brief                    | Resolve material unknowns, define the bounded outcome, dependencies, risks, and proof.                             |
| Change           | build, fix, update, implement                     | Establish scope and tracking, implement the smallest coherent slice, validate, and publish a ready PR.             |
| Operate          | release, deploy, migrate, configure, recover      | Start read-only, load the provider/runbook skill, preserve owner gates, and mutate only within explicit authority. |
| Coordinate       | manage tasks, agents, reviews, or a release train | Define dependency order, exact handoffs, terminal gates, and owner-only actions.                                   |

Do not convert an answer into a project, a diagnosis into an unrequested fix,
or a recommendation into code before the product decision is settled.

## Establish Product And System Truth

Use the lightest evidence that can settle the request. For ambiguous, material,
or product-facing work, read:

- `.claude/PRD.md` for current product truth and the PM interview wedge;
- `docs/decisions/current.md` for accepted constraints;
- relevant contracts, architecture, operations docs, and OpenSpec artifacts;
- exact callers, state transitions, tests, and provider adapters for the slice.

Separate these explicitly while reasoning:

- **Fact**: supported by current source, tests, durable state, or an authoritative
  external source.
- **Inference**: the best explanation supported by facts but not directly
  observed.
- **Unknown**: evidence still required and why it matters.
- **Decision**: a tradeoff chosen by the user or an accepted repository record.

Read [investigation.md](references/investigation.md) for deep investigations,
incidents, architecture questions, or decisions with meaningful product,
privacy, operational, or migration risk.

## Work At Principal/CTO Altitude

Before recommending or changing something material, answer:

- What user or operator problem are we solving, and which Meelni lever does it
  improve: acquisition, activation, retention, monetization, enterprise
  validation, or product quality?
- What is the smallest system boundary that owns the behavior?
- Which data, state, provider, privacy, security, cost, and failure-recovery
  contracts matter?
- Is the proposed action reversible, observable, backward compatible, and
  proportionate to the evidence?
- What becomes harder to maintain or change later?
- What exact proof would make the result trustworthy?

Prefer a clear recommendation over an unranked option list. Name the rejected
alternative when its tradeoff matters.

## Investigate Before Acting

For nontrivial work:

1. State the question that must be settled.
2. Form a small hypothesis set; include at least one plausible alternative for
   failures and incidents.
3. Trace the actual boundary: entrypoint, workflow, domain contract, persistence,
   provider adapter, presentation, tests, and operations where relevant.
4. Seek disconfirming evidence and check compatibility, privacy, recovery, and
   observability paths.
5. Stop when the evidence can support the requested outcome. Do not confuse a
   deep investigation with unbounded archaeology.

Browse or inspect live external state when the answer is time-sensitive or the
user asked for current verification. Use read-only checks first. Never access
Production customer content merely because it would be convenient.

## Decide Whether To Ask

Proceed with a stated assumption when it is evidence-backed, scoped, and easy
to reverse. Ask the user only when the answer would materially change the
product direction, data model, provider target, destructive action, cost,
privacy posture, or owner-only authority.

When blocked, exhaust safe in-scope evidence and return the smallest concrete
unblock request.

## Move Into Delivery

For meaningful implementation:

1. Use `meelni-linear-workstream` before editing to reuse or create the
   PR-sized issue and record the intended outcome.
2. Answer `docs/templates/AGENT_TASK_INTAKE.md` mentally or persist it when the
   work benefits from a durable handoff.
3. Use `meelni-vertical-slice-playbooks` for cross-layer product behavior and
   the domain specialist for the primary slice.
4. Use `meelni-engineering-memory` when the work changes durable decisions,
   contracts, architecture, or operations truth.
5. Implement and verify in proportion to risk. Preserve unrelated work.
6. Use `meelni-pr-prep` to self-review, validate, publish a ready PR, monitor
   hosted checks, and hand off exact evidence.

Do not create Linear issues, OpenSpec changes, branches, or PRs for a simple
question or read-only recommendation unless the user asks to persist the work.

## Preserve Authority

- Only the human owner decides launch GO/NO-GO.
- A request to investigate, review, diagnose, or recommend does not authorize a
  fix, provider write, Production action, merge, purchase, or message.
- Start Production and provider work read-only. Use canonical runbooks and
  one-use owner authorization when required.
- Do not infer access to customer transcripts, recordings, identifiers,
  credentials, or private provider payloads.
- Delegate only when the user or governing instructions allow it, and only for
  bounded independent work with an explicit integration point.

## Finish With A Useful Outcome

Lead with the result, not the process. Include only what the user needs:

- answer, diagnosis, or recommendation;
- decisive evidence and assumptions;
- changes and validation when implementation was requested;
- remaining risk or open decision;
- the next action, or the smallest unblock request.

For explicitly authorized tracked delivery or coordination work, record the
selected lane, specialist skills, scope, and proof in Linear so another agent
can continue without rediscovery. Do not create or update tracking for a
read-only answer, review, diagnosis, or recommendation unless the user asks.
