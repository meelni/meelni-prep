# Agent-Ready Monorepo Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Meelni future-shaped for rapid agent-assisted development without a big-bang rewrite.

**Architecture:** Introduce the target monorepo rails now while keeping the root Next.js app and Python LiveKit agent operational. New packages start as public-entrypoint stubs and documentation anchors; future migrations move behavior into them in vertical slices.

**Tech Stack:** Next.js, TypeScript, Python LiveKit Agents, Supabase/Drizzle, Stripe, PostHog, npm workspaces, repo-local Codex/Claude skills, OpenSpec-style behavior specs.

---

### Task 1: Agent Guidance And Architecture Rails

**Files:**
- Create: `AGENTS.md`
- Create: `apps/web/README.md`
- Create: `packages/core/package.json`
- Create: `packages/core/src/index.ts`
- Create: `packages/agent/package.json`
- Create: `packages/agent/src/index.ts`
- Create: `packages/integrations/package.json`
- Create: `packages/integrations/src/index.ts`
- Create: `packages/test-fixtures/package.json`
- Create: `packages/test-fixtures/src/index.ts`
- Modify: `package.json`

- [x] **Step 1: Add canonical root guidance**

Create `AGENTS.md` with Meelni-specific instructions for future Codex and Claude agents.

- [x] **Step 2: Add workspace package stubs**

Create public-entrypoint package stubs for domain logic, agent contracts, provider integrations, and test fixtures.

- [x] **Step 3: Register package workspaces**

Add `packages/*` as npm workspaces while leaving the root app in place.

### Task 2: Durable Docs, Decisions, And Specs

**Files:**
- Create: `docs/architecture/codebase-principles.md`
- Create: `docs/architecture/target-monorepo.md`
- Create: `docs/architecture/spec-workflow.md`
- Create: `docs/decisions/current.md`
- Create: `docs/decisions/decision-log.md`
- Create: `docs/decisions/2026-06-27-agent-ready-monorepo.md`
- Create: `docs/contracts/README.md`
- Create: `docs/operations/skills.md`
- Create: `docs/operations/tooling.md`
- Create: `openspec/config.yaml`
- Create: `openspec/specs/README.md`
- Create: `openspec/changes/README.md`

- [x] **Step 1: Document the target architecture**

Capture the desired `apps/*` and `packages/*` direction, including the staged migration rule.

- [x] **Step 2: Capture the accepted decision**

Record that Meelni is adopting an agent-ready monorepo destination with incremental migration.

- [x] **Step 3: Add behavior-spec scaffolding**

Create OpenSpec-style folders for future interview lifecycle, question practice, feedback, billing, and LiveKit behavior changes.

### Task 3: Meelni Repo-Local Skills

**Files:**
- Create: `.agents/skills/meelni-codebase-architecture/SKILL.md`
- Create: `.agents/skills/meelni-livekit-interview-runtime/SKILL.md`
- Create: `.agents/skills/meelni-feedback-evaluation/SKILL.md`
- Create: `.agents/skills/meelni-question-bank-seo/SKILL.md`
- Create: `.agents/skills/meelni-product-strategy/SKILL.md`
- Create: `.agents/skills/meelni-engineering-memory/SKILL.md`
- Create: `.agents/skills/meelni-pr-prep/SKILL.md`
- Symlink: `.codex/skills/meelni-*`
- Symlink: `.claude/skills/meelni-*`

- [x] **Step 1: Create canonical skills under `.agents/skills`**

Each skill should be concise and route agents to relevant docs before acting.

- [x] **Step 2: Expose skills to Codex and Claude**

Symlink the Meelni skills into `.codex/skills` and `.claude/skills`.

- [x] **Step 3: Validate skills**

Run:

```bash
for skill in .agents/skills/meelni-*; do
  python3 "$HOME/.codex/skills/.system/skill-creator/scripts/quick_validate.py" "$skill"
done
```

Expected: all skills validate successfully.

### Task 4: Local Tooling

**Files:**
- Create: `scripts/local-env.mjs`
- Create: `scripts/local-env.test.mjs`
- Create: `scripts/setup-local.mjs`
- Create: `scripts/doctor-local.mjs`
- Create: `scripts/start-local-dev.mjs`
- Modify: `package.json`
- Modify: `conductor.json`

- [x] **Step 1: Add local env helpers**

Write tests first for environment parsing/link behavior, then implement helpers.

- [x] **Step 2: Add setup, doctor, and start scripts**

Use Node scripts for repeatable local setup and Conductor-friendly startup while preserving existing `npm run dev` and `npm start`.

- [x] **Step 3: Run validation**

Run:

```bash
npm run test:local
npm run doctor
npm run typecheck
```

Expected: tests pass, doctor reports actionable environment status, and TypeScript still checks.

Result: `npm run test:local`, `npm run doctor`, and `npm run typecheck` pass. `npm run lint` still fails on the pre-existing lint baseline across app/tests; this migration did not resolve that broader cleanup.

### Task 5: Follow-Up Migration Slices

**Files:** future changes only.

- [x] **Step 1: Move shared types first**

Move interview config, round types, feedback types, and question contracts into `packages/core`.

Result: `@meelni/core` now owns interview config, entitlement helpers, evaluation rubric contracts, session/transcript contracts, and selected-question practice payloads. Legacy `lib/*` import paths re-export the canonical contracts for compatibility.

- [x] **Step 2: Move agent contracts**

Move prompt-building contracts, room metadata schemas, and transcript event payloads into `packages/agent`.

Result: `@meelni/agent` now owns room metadata, transcript event, and agent state contracts. The session-start API builds LiveKit room metadata through this package, and the LiveKit room component parses transcript data through it.

- [x] **Step 2.5: Mirror agent runtime contracts in Python**

Extract Python LiveKit runtime defaults and transcript data-track helpers so the worker consumes the same normalized metadata and transcript shapes as `@meelni/agent`.

Result: `agent/shared/runtime_config.py` owns model/TTS defaults, `agent/shared/transcript_events.py` owns transcript payloads and topic names, and `agent/shared/config.py` now accepts both production `id/text/type` question metadata and legacy `question_id/question_text/question_type` metadata.

- [x] **Step 3: Move provider boundaries**

Move Supabase, LiveKit, Stripe, PostHog, Google Sheets, and Inngest adapter contracts into `packages/integrations`.

Result: `@meelni/integrations` now declares the provider set, environment requirements, missing-env detection, and normalized provider success/failure result envelopes for Supabase, LiveKit, Stripe, PostHog, Google Sheets, and Inngest.

- [x] **Step 4: Decide Next.js app relocation readiness**

After imports use package entrypoints, evaluate whether root `app/`, `components/`, and web config can move into `apps/web`.

Result: the physical move is deferred by decision record. The repo still has 224 root app/component/lib files, hundreds of root-relative `@/*` imports, and root-coupled `tsconfig`, `components.json`, Drizzle, middleware, Next, Vercel, Docker, and Conductor assumptions. Moving now is not the ideal CTO path; the safe path is to continue draining contracts and move the app when the checklist in `docs/decisions/2026-06-27-defer-web-app-relocation.md` is satisfied.

- [ ] **Step 5: Decide Python vs TypeScript voice runtime**

Keep Python if it remains fastest for LiveKit interviews; move to `apps/voice-agent` only when the JS/TS runtime gives enough operational leverage to justify the migration.
