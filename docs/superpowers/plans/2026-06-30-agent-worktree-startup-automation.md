# Agent Worktree Startup Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce fresh coding-agent worktree startup to the existing setup/run hooks by making local dev startup include the web app, Python LiveKit agent, and local Inngest server.

**Architecture:** Keep `conductor.json` pointed at `npm run setup:local` and `npm run dev:local`. Extend the Node startup script rather than the older shell scripts so port handling, process cleanup, and cross-platform behavior stay in one maintained path.

**Tech Stack:** Node.js scripts, npm workspaces, Next.js dev server, Python LiveKit agent, Inngest CLI dev server.

---

### Task 1: Encode Startup Script Behavior

**Files:**

- Create: `scripts/start-local-dev.test.mjs`
- Modify: `scripts/start-local-dev.mjs`

- [x] **Step 1: Write a failing test**

Create tests for deriving port-safe Inngest arguments from the web dev port and for converting wildcard web hosts into loopback SDK URLs.

- [x] **Step 2: Run the targeted test and verify it fails**

Run: `node --test scripts/start-local-dev.test.mjs`

Expected: FAIL because `scripts/start-local-dev.mjs` does not export the helper functions yet.

- [x] **Step 3: Extract testable startup configuration**

Export helper functions from `scripts/local-dev-config.mjs` and keep process spawning in `scripts/start-local-dev.mjs`.

- [x] **Step 4: Run the targeted test and verify it passes**

Run: `node --test scripts/start-local-dev.test.mjs`

Expected: PASS.

### Task 2: Start Inngest Automatically

**Files:**

- Modify: `scripts/start-local-dev.mjs`
- Modify: `package.json`

- [x] **Step 1: Start Inngest from `dev:local`**

Spawn `npx --yes inngest-cli@latest dev` with `--sdk-url http://<loopback-host>:<web-port>/api/inngest`, a derived UI port, and derived connect ports so multiple worktrees can run side by side.

- [x] **Step 2: Add explicit opt-out environment variables**

Support `MEELNI_SKIP_INNGEST=1` and `MEELNI_SKIP_AGENT=1` for constrained sessions.

- [x] **Step 3: Add a convenience Inngest script**

Add `dev:inngest` for the rare manual case while keeping `dev:local` as the normal one-command path.

### Task 3: Update Operational Memory

**Files:**

- Modify: `docs/operations/tooling.md`
- Modify: `docs/integrations/inngest/setup.md`
- Modify: `docs/integrations/inngest-setup.md`
- Modify: `scripts/setup-local.mjs`

- [x] **Step 1: Document the agent startup contract**

State that agent platforms honoring `conductor.json` should run setup and then `dev:local`; `dev:local` starts web, Inngest, and the Python agent when the venv exists.

- [x] **Step 2: Update Inngest docs**

Move the manual two-terminal flow behind `npm run dev:local`, while preserving the direct `npx inngest-cli@latest dev` command for troubleshooting.

- [x] **Step 3: Update setup completion output**

Tell agents that `npm run dev:local` starts all local runtime processes.

### Task 4: Validate

**Files:**

- Read-only validation across scripts and docs.

- [x] **Step 1: Run local script tests**

Run: `npm run test:local`

Result: FAIL from existing design-system guardrails in unrelated UI files: `components/dashboard/layout/sidebar.tsx`, `components/dashboard/quota-exceeded-modal.tsx`, `app/blog/page.tsx`, and `components/discontinued-banner.tsx`. The new focused startup test passes.

- [x] **Step 2: Run doctor**

Run: `npm run doctor`

Expected: PASS or warnings only for missing local secrets/provider state.

- [x] **Step 3: Run skill validation**

Run: `npm run validate:skills`

Expected: PASS.

### Task 5: Upgrade PR Prep Skill

**Files:**

- Modify: `.agents/skills/meelni-pr-prep/SKILL.md`

- [x] **Step 1: Expand PR prep beyond a thin checklist**

Add staff-level closeout gates for diff orientation, architecture boundaries, backend/data/jobs, frontend/UX, LiveKit runtime, feedback/content, security/privacy, test strategy, docs/specs/tracking, and PR body quality.

- [x] **Step 2: Validate skill registry**

Run: `npm run validate:skills`

Result: PASS.

### Task 6: Upgrade Adjacent Engineering Skills

**Files:**

- Modify: `.agents/skills/meelni-codebase-architecture/SKILL.md`
- Modify: `.agents/skills/meelni-feedback-evaluation/SKILL.md`
- Modify: `.agents/skills/meelni-livekit-interview-runtime/SKILL.md`
- Modify: `.agents/skills/meelni-vertical-slice-playbooks/SKILL.md`

- [x] **Step 1: Audit AlphaStack examples for reusable patterns**

Review `thermo-nuclear-code-quality-review`, `codebase-design`, `improve-codebase-architecture`, `domain-modeling`, and `grilling` for review posture, architecture vocabulary, and decision-gate patterns. Do not copy autonomous commit/push behavior into Meelni.

- [x] **Step 2: Harden Meelni implementation skills**

Add staff-level gates for deep-module architecture, vertical-slice scoping, feedback evaluation validity, and LiveKit runtime failure modes. Leave `meelni-question-bank-seo` unchanged for now.

- [x] **Step 3: Validate skill registry**

Run: `npm run validate:skills`

Result: PASS.

### Task 7: Add Meelni UI Design System Skill

**Files:**

- Create: `.agents/skills/meelni-ui-design-system/SKILL.md`
- Create symlinks: `.codex/skills/meelni-ui-design-system`, `.claude/skills/meelni-ui-design-system`
- Modify: `AGENTS.md`
- Modify: `docs/operations/skills.md`
- Modify: `.agents/skills/meelni-vertical-slice-playbooks/SKILL.md`
- Modify: `.agents/skills/meelni-pr-prep/SKILL.md`

- [x] **Step 1: Create Meelni-specific UI workflow**

Create a compact UI/design-system skill based on Meelni's `DESIGN.md`, `components.json`, shared primitives, and design-system guardrail tests. Borrow AlphaStack's prototype and polish ideas selectively without importing AlphaSpace-specific Storybook/generated-doc assumptions.

- [x] **Step 2: Wire skill discovery**

Add canonical `.codex` and `.claude` symlinks and mention the skill from `AGENTS.md`, PR prep, vertical-slice playbooks, and skills operations docs.

- [x] **Step 3: Validate skill registry**

Run: `npm run validate:skills`

Result: PASS. Optional `quick_validate.py` was attempted for `.agents/skills/meelni-ui-design-system` but could not run because the local Python environment is missing `yaml`/PyYAML.
