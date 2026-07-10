# System Awareness

Product Compass should understand Meelni's product and system constraints at the right level.

## Know By Default

- PM interview prep is the current beachhead.
- Product Sense, Behavioral, Execution/Product Metrics, and Strategy are the main PM round types.
- Public SEO and question/company pages should convert users into selected-question practice.
- Authenticated practice flows include setup, interview, transcript, feedback, history, analytics, questions, settings, and billing.
- Live voice interviews depend on LiveKit room metadata, token generation, transcript events, and the Python agent runtime.
- Feedback depends on transcript quality, rubrics, evaluation generation, focused-practice recommendations, and user insights.
- Monetization currently routes through Stripe, subscriptions, and usage limits.
- Target architecture is incremental: root Next.js app now, future `apps/web`, packages for core, agent, integrations, and test fixtures.
- Workflow modules should hold cross-layer behavior; routes should stay thin.

## Read First For Product Compass Work

- `AGENTS.md`
- `.claude/PRD.md`
- `docs/decisions/current.md`
- `docs/operations/skills.md`
- `.agents/skills/meelni-product-strategy/references/meelni-product-model.md`

## Read Deeper When Needed

### Product and architecture direction

- `docs/architecture/target-monorepo.md`
- `docs/architecture/codebase-principles.md`
- `docs/decisions/decision-log.md`
- relevant accepted decision records under `docs/decisions/`

### Agent-operable development

- `.agents/skills/meelni-vertical-slice-playbooks/SKILL.md`
- `docs/templates/AGENT_TASK_INTAKE.md`
- `docs/operations/tooling.md`

### Voice interview runtime

- `.agents/skills/meelni-livekit-interview-runtime/SKILL.md`
- `lib/workflows/start-session.ts`
- `packages/agent/src/`
- `packages/integrations/src/livekit.ts`
- `agent/shared/`

### Feedback and evaluation

- `.agents/skills/meelni-feedback-evaluation/SKILL.md`
- `lib/evaluation/`
- `lib/inngest/functions/generate-feedback.ts`
- relevant feedback API routes and tests

### Question bank, SEO, and acquisition

- `.agents/skills/meelni-question-bank-seo/SKILL.md`
- `app/explore/`
- `app/companies/`
- `scripts/sync-questions-from-sheet.ts`
- question database helpers

### Billing, trials, and monetization

- billing API routes under `app/api/billing/`
- checkout and Stripe webhook routes
- `lib/services/usage-service.ts`
- pricing page and subscription UI

## Rule Of Thumb

Read deeper docs or source only when the product decision depends on actual system capability, billing rules, LiveKit behavior, feedback quality, SEO paths, or package boundaries.

If the bottleneck is still product clarity, stay in product reasoning and avoid code archaeology.
