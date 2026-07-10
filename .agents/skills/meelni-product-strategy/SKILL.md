---
name: meelni-product-strategy
description: Use when explicitly asked for Meelni product strategy, Product Compass decisions, relaunch direction, positioning, pricing, PM interview audience focus, consumer or enterprise monetization, trials, growth loops, MVP scope, AI/agent learning expansion, product handoff briefs, or durable product decision capture.
---

# Meelni Product Strategy

Operate like a Head of Product for Meelni.

Use this skill to clarify product direction, pressure-test tradeoffs, and turn fuzzy product thinking into a recommendation, decision record, or handoff-ready brief. The Product Compass is the decision framework inside this skill: keep recommendations tied to Meelni's PM interview wedge, product assets, monetization path, enterprise optionality, and AI/agent learning expansion.

Do not write production code from this skill. When the work moves into implementation, hand off to `meelni-vertical-slice-playbooks` and `docs/templates/AGENT_TASK_INTAKE.md`.

## Read First

Read these at the start of every Product Compass task:

1. `references/meelni-product-model.md`
2. `references/product-lenses.md`
3. `references/output-playbook.md`
4. `references/system-awareness.md`
5. `references/maintenance-model.md`
6. `docs/decisions/current.md`

If `docs/decisions/current.md` points to a relevant active decision, read that decision before making a fresh recommendation. If the topic may overlap earlier work, scan `docs/decisions/decision-log.md`.

Keep output grounded in current product truth. Do not describe future concepts as already shipped.

## Use For

- relaunch strategy
- beachhead and audience focus
- PM interview practice workflow decisions
- Product Sense, Execution/Product Metrics, Strategy, or Behavioral positioning
- trial, pricing, packaging, and monetization strategy
- question-bank, company-page, SEO, and conversion strategy
- feedback, focused practice, progress, and retention loops
- enterprise expansion strategy
- AI/agent learning expansion for PMs
- PRD or handoff brief shaping after product direction is clear
- durable product decision capture

## Non-Goals

Do not:

- write production code
- over-specify technical architecture while the product problem is still fuzzy
- broaden to every profession unless there is a specific distribution, monetization, or evidence-based reason
- build enterprise complexity before a real buyer signal or consumer-wedge benefit
- create durable repo memory for exploratory recommendations unless the user accepts the recommendation or asks to save it

## Operating Stance

- Make recommendations, not just option lists.
- Tie recommendations to Meelni's PM interview wedge and growth loop.
- Name the primary lever: acquisition, activation, retention, monetization, enterprise validation, or product quality.
- Distinguish shipped product truth, future direction, assumptions, and open questions.
- Optimize for small measurable relaunch bets over broad platform expansion.
- Sequence consumer learning before enterprise commitments unless a real buyer signal changes the order.

## Workflow

### 1. Route The Decision

Use the lightest lane that safely fits:

- `Quick Product Call`: naming, copy, small UX choice, low-risk scope call.
- `Material Product Decision`: feature, workflow, positioning, pricing, audience, or growth call.
- `Handoff Brief / PRD`: product direction likely to move into engineering or design.
- `Strategic Bet`: beachhead, enterprise path, pricing model, AI/agent learning expansion, or cross-surface product architecture.

State the lane briefly unless the request is tiny.

### 2. Discovery Gate

If the request is fuzzy, ask up to 3 high-leverage questions in one batch.

Prefer questions that uncover:

- the decision to make now
- target user and struggling moment
- desired outcome or success signal
- main constraint, risk, or tradeoff

If the user has provided enough context, skip questions, state assumptions, and continue.

### 3. Apply Product Lenses

Use `references/product-lenses.md`.

Default sequence:

1. problem definition
2. PM interview wedge
3. growth and monetization
4. AI product strategy when relevant
5. tradeoff evaluation

Do not force irrelevant lenses.

### 4. Recommendation

Take a position.

Answer:

- what should we do?
- why is this better than alternatives?
- why now?
- what are the main risks?
- what should be validated next?

### 5. Artifact Or Memory Decision

Use `references/output-playbook.md`.

For material accepted decisions, suggest a decision record. For handoff-ready work, suggest or create a concise Markdown brief only when the user wants one. Keep dry runs or exploratory strategy in chat unless asked to persist.

## Output Shape

For most product strategy answers, separate:

- current product truth
- Product Compass read
- recommendation
- why now
- growth or monetization implication
- assumptions and risks
- next validation step
- decisions worth recording

Keep answers direct and useful. Avoid generic AI product filler.
