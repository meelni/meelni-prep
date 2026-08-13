# Meelni Skill Routing

Use the smallest set that fully owns the request. Load each selected `SKILL.md`
completely, follow its required references, and stop applying unrelated skills.

## Handoff Protocol

1. Name the primary lane and the skill being loaded.
2. Read the specialist skill completely before taking its actions.
3. Let the specialist own its domain workflow and validation.
4. Keep `meelni-start` responsible only for the original outcome, scope,
   authority, and cross-domain coherence.
5. Return to this routing map only if the task changes domains or needs another
   delivery phase.

Load a secondary skill only for a concrete unresolved question owned by that
domain. An upstream or downstream relationship alone is not enough. If the
primary skill can settle the request, stay with the primary skill.

Do not load every skill "for completeness." Context is shared capacity.

## Product And Engineering Routes

| Request shape                                                                                               | Primary skill                       | Add when needed                                                                       |
| ----------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------- |
| Product direction, positioning, pricing, trial, growth, audience, prioritization, or an AI product bet      | `meelni-product-strategy`           | After direction is settled, hand implementation to `meelni-vertical-slice-playbooks`. |
| Package boundaries, adapters, maintainability, monorepo direction, or architectural review                  | `meelni-codebase-architecture`      | Add the domain skill whose behavior is affected.                                      |
| Cross-layer product feature or behavior change                                                              | `meelni-vertical-slice-playbooks`   | Add the primary domain skill and `meelni-ui-design-system` for user-facing UI.        |
| Live voice interview, LiveKit, turn-taking, transcript runtime, room metadata, prompts, or agent deployment | `meelni-livekit-interview-runtime`  | Add `meelni-feedback-evaluation` when the interview-to-feedback boundary changes.     |
| Feedback, scoring, rubrics, transcript evaluation, insights, focused practice, or feedback lifecycle        | `meelni-feedback-evaluation`        | Add `meelni-livekit-interview-runtime` only when runtime evidence production changes. |
| Pages, components, styling, responsive behavior, accessibility, motion, or UI implementation                | `meelni-ui-design-system`           | Add `meelni-design-review-orchestrator` for an audit using external design lenses.    |
| UI critique, visual audit, polish plan, or external design-lens review                                      | `meelni-design-review-orchestrator` | Keep `meelni-ui-design-system` authoritative for implementation.                      |
| Question bank, company pages, explore, SEO, structured data, Sheets sync, or content-to-practice conversion | `meelni-question-bank-seo`          | Add `meelni-ui-design-system` for presentation changes.                               |
| Billing, subscriptions, credits, entitlements, checkout, or Stripe webhooks                                 | `meelni-vertical-slice-playbooks`   | Add `stripe-best-practices`; use `upgrade-stripe` only for version upgrades.          |
| Stripe vendor discovery or purchasing                                                                       | `stripe-directory`                  | Purchasing always requires explicit user intent and applicable provider authority.    |
| Provisioning infrastructure or provider resources through Stripe Projects                                   | `stripe-projects`                   | Treat it as an external mutation and confirm scope and authority.                     |

## Delivery And Operations Routes

| Request shape                                                                                       | Primary skill               | Rule                                                                                      |
| --------------------------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------- |
| Linear issue, slice, dependency, status, or handoff                                                 | `meelni-linear-workstream`  | Required before meaningful tracked implementation; optional for simple read-only answers. |
| Provider accounts, authentication, environments, deployments, operational targets, or MCP/CLI setup | `meelni-ops-connections`    | Resolve the canonical target and safe interface before any write.                         |
| Accepted decision, architecture, contract, OpenSpec, runbook, or durable current-state change       | `meelni-engineering-memory` | Record only accepted durable truth, not exploratory ideas.                                |
| PR creation, update, final review, hosted checks, or merge-ready handoff                            | `meelni-pr-prep`            | Publish ready by default after scoped implementation and validation.                      |

## External And User-Named Skills

- If the user names an installed skill or plugin, obey its trigger and read its
  instructions before acting.
- Use file, document, spreadsheet, browser, security, or provider skills when
  the requested artifact or system requires them; do not mirror their
  instructions here.
- If a needed capability is unavailable, exhaust skill/tool discovery before
  proposing installation or a fallback.

## Common Sequences

### Fuzzy product request

`meelni-start` -> `meelni-product-strategy` -> user decision when material ->
`meelni-vertical-slice-playbooks` -> domain/UI skills ->
`meelni-engineering-memory` -> `meelni-pr-prep`

### Reported product failure

`meelni-start` -> domain skill for diagnosis -> stop with cause if diagnosis
only -> `meelni-linear-workstream` and implementation skills only when a fix is
requested -> `meelni-pr-prep`

### Production or provider incident

`meelni-start` -> `meelni-ops-connections` + domain skill -> read-only current
state and redacted correlation -> owner gate for any protected action -> strict
postflight and durable evidence

### Architecture improvement

`meelni-start` -> `meelni-codebase-architecture` -> domain skill if behavior
changes -> `meelni-linear-workstream` -> implementation ->
`meelni-engineering-memory` -> `meelni-pr-prep`
