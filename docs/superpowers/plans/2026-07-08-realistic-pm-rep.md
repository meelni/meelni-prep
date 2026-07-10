# Realistic PM Rep Implementation Plan

> **Superseded on 2026-07-09. Do not execute.** This plan is retained as
> historical implementation evidence and uses pre-positioning terminology.
> Follow the accepted product contract in [`.claude/PRD.md`](../../../.claude/PRD.md)
> and the [Live PM Interview Practice Positioning decision](../../decisions/2026-07-09-live-pm-interview-practice-positioning.md)
> for current language, routes, analytics, and product claims.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete SAV-141 so candidates can launch one credible PM practice rep from the dashboard and enter a focused live interview room with opt-in hints.

**Architecture:** Put durable contracts in `@meelni/core` and `@meelni/agent`, keep `/api/session/start` and UI routes thin, and preserve the existing LiveKit/transcript/session lifecycle. Use the current `/setup` behavior as the starting point while presenting it inside the dashboard shell.

**Tech Stack:** Next.js App Router, React/TypeScript, Tailwind v4 tokens, shadcn primitives, node:test package tests, LiveKit room wrapper, Supabase-backed session/question APIs.

---

### Task 1: Recommendation And Selected Question Contract

**Files:**
- Create: `packages/core/src/rep-launch.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/src/contracts.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests that expect `buildRecommendedRep()` to return a deterministic Product Sense fallback and expect `buildRecommendedRep({ selectedQuestion })` to map stored question types to compatible round types while preserving question text/company/type.

- [ ] **Step 2: Run red test**

Run: `npm run test:core -- packages/core/src/contracts.test.ts`
Expected: FAIL because `buildRecommendedRep` and related exports do not exist.

- [ ] **Step 3: Implement minimal helper**

Create `rep-launch.ts` with typed `RecommendedRep`, `SelectedRepQuestion`, `mapQuestionTypeToRoundType()`, and `buildRecommendedRep()` helpers. Export from `packages/core/src/index.ts`.

- [ ] **Step 4: Run green test**

Run: `npm run test:core -- packages/core/src/contracts.test.ts`
Expected: PASS.

### Task 2: Hint Mode Contract And Runtime Metadata

**Files:**
- Modify: `packages/core/src/session.ts`
- Modify: `packages/agent/src/room-metadata.ts`
- Modify: `packages/agent/src/contracts.test.ts`
- Modify: `lib/validation/setup-schema.ts`
- Modify: `lib/workflows/start-session.test.ts`
- Modify: `lib/workflows/start-session.ts`

- [ ] **Step 1: Write failing tests**

Add tests that `normalizeInterviewRuntimeConfig({ hintMode: "gentle" })` preserves `gentle`, invalid hint modes normalize to `off`, and `startInterviewSessionWorkflow` carries `hintMode` into session config.

- [ ] **Step 2: Run red tests**

Run: `npm run test:agent -- packages/agent/src/contracts.test.ts && npm run test:local -- lib/workflows/start-session.test.ts`
Expected: FAIL because hint mode is not normalized or schema-supported.

- [ ] **Step 3: Implement minimal contract**

Add `HintMode = "off" | "gentle" | "coach"` to core session config, default runtime config to `off`, normalize allowed values in agent metadata, and permit `hintMode` in setup validation.

- [ ] **Step 4: Run green tests**

Run: `npm run test:agent -- packages/agent/src/contracts.test.ts && npm run test:local -- lib/workflows/start-session.test.ts`
Expected: PASS.

### Task 3: Nudge Gating

**Files:**
- Modify: `app/api/nudges/analyze/route.ts`
- Modify: `app/interview/page.tsx`

- [ ] **Step 1: Implement conservative gating**

Skip calling `/api/nudges/analyze` when the current session config has `hintMode: "off"`. Include `hintMode` in the API body and have the API return a no-nudge response for `off` even if called.

- [ ] **Step 2: Verify**

Run: `npm run typecheck`
Expected: PASS.

### Task 4: Dashboard-contained New Rep Launcher

**Files:**
- Modify: `app/setup/setup-content.tsx`
- Modify: `components/dashboard/layout/toolbar.tsx`

- [ ] **Step 1: Recompose the launcher**

Render `/setup` with dashboard-style container language: recommendation first, customization below, one final `Start rep` action, retained credit/no-credit/mic/session-start states, and selected-question summary when present.

- [ ] **Step 2: Preserve launch behavior**

Keep existing auth redirect, credits fetch, mic permission, validation, session start API call, and interview navigation. Track launcher viewed, recommendation accepted/changed, session start attempted/succeeded/failed.

- [ ] **Step 3: Verify**

Run: `npm run typecheck`
Expected: PASS.

### Task 5: Focused Interview Room

**Files:**
- Modify: `app/interview/page.tsx`
- Modify: `app/interview/components/interview-controls.tsx`
- Modify: `app/interview/components/transcript-panel.tsx`
- Modify: `components/interview/nudge-overlay.tsx`

- [ ] **Step 1: Recompose the room**

Keep `LiveKitRoomWrapper`, transcript saving, and end-session behavior. Change layout to a top session bar, large centered interviewer/voice stage with current question, transcript-only right rail, and stable bottom controls.

- [ ] **Step 2: Add hint control**

Add a dock control for `off` and `gentle`, reserve `coach` in the type but keep the shipped control simple. Track hint toggles and nudge dismissals.

- [ ] **Step 3: Verify**

Run: `npm run typecheck`
Expected: PASS.

### Task 6: QA, Linear, And Follow-ups

**Files:**
- Modify only if needed: code comments or docs for durable behavior.

- [ ] **Step 1: Run validation**

Run targeted package/workflow tests, `npm run typecheck`, and browser/manual checks where local env permits.

- [ ] **Step 2: Update Linear**

Comment verification evidence on SAV-142 through SAV-146. Create follow-up issues for side work discovered out of scope.

- [ ] **Step 3: Final review**

Run `git diff --check`, inspect changed files, and summarize touched layers, validation, risks, and Linear status.
