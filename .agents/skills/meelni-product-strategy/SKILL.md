---
name: meelni-product-strategy
description: Use when explicitly asked for Meelni product strategy, Product Compass decisions, relaunch direction, positioning, pricing, PM interview audience focus, consumer or enterprise monetization, trials, growth loops, MVP scope, AI/agent learning expansion, or durable product decision capture.
---

# Meelni Product Strategy

Use this skill for product direction and strategy work. The Product Compass is the decision framework inside this skill: keep recommendations tied to Meelni's beachhead, product assets, monetization path, and expansion logic instead of treating every idea as equally strategic.

## Read First

- `AGENTS.md`
- `.claude/PRD.md`
- `docs/decisions/current.md`
- `docs/architecture/target-monorepo.md`
- Relevant product or SEO docs under `docs/`
- Current product surfaces in `app/`, `components/sections/`, `app/explore/`, and `app/companies/`

## Product Compass

Use these principles to evaluate product ideas, roadmap choices, positioning, pricing, and growth bets.

### Beachhead

- Start with PM interview prep: live voice reps, realistic PM prompts, PM-calibrated evaluation, transcripts, feedback, drills, and visible improvement.
- Keep Product Sense as the cleanest acquisition wedge unless evidence points to a stronger PM interview wedge.
- Treat PM-specific depth as an advantage. Avoid generic AI mock interview positioning unless there is a specific distribution or monetization reason.

### Growth Loop

- Default loop: question/company SEO -> selected question practice -> live rep -> feedback artifact -> targeted drill/material -> return practice.
- Prefer features that make a user's next rep more obvious, more personalized, or more likely to happen.
- Look for shareable artifacts only when they help users show improvement or create credible acquisition, not as vanity social mechanics.

### Monetization

- Support a consumer path first: free discovery, a short trial such as seven days, clear usage limits, and paid plans for serious interview prep.
- Paid consumer value should map to outcomes: more reps, better feedback, deeper drills, saved progress, company-specific prep, and higher-confidence readiness.
- Price experiments should be measurable and reversible. Avoid complex packaging until activation, completion, and retention signals are understood.

### Enterprise Path

- Keep enterprise in view without letting it distort the beachhead. The likely path is PM interview readiness -> team hiring enablement -> internal talent development -> custom interview agents and skills evaluation.
- Enterprise concepts worth preserving in architecture: organizations, seats, admin visibility, custom rubrics, custom agent prompts, cohort analytics, privacy controls, and evaluation exports.
- Do not build enterprise surface area early unless it also strengthens the PM candidate experience or validates a concrete buyer signal.

### AI And Agent Learning Expansion

- PMs increasingly need to understand AI agents, skills, evals, and AI product workflows. Meelni can expand from interview practice into applied AI PM readiness.
- Favor learning materials that connect to reps: agent/product sense prompts, AI product case studies, skill-building exercises, eval design drills, and feedback on AI strategy answers.
- The expansion should deepen the PM wedge before broadening to every profession.

## Decision Rules

- Ask which lever the idea improves: acquisition, activation, retention, monetization, enterprise validation, or product quality.
- Prefer small, measurable relaunch bets over broad platform expansion.
- Sequence consumer learning before enterprise commitments unless a real buyer signal changes the order.
- Tie trial, pricing, and packaging work to activation moments: first rep completed, first feedback viewed, first targeted drill started, and first return session.
- Record durable decisions when they affect positioning, pricing, audience scope, enterprise direction, core workflows, or architecture.

## Output

Separate:

- what the codebase already supports;
- Product Compass read;
- strategic recommendation;
- monetization or growth implication;
- assumptions;
- next validation step;
- product or engineering decisions worth recording.
