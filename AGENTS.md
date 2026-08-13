# Meelni Agent Guide

Canonical instructions for Codex, Claude, and other coding agents working in this repository.

## Start

- Work from the repo root unless the user directs otherwise.
- Read relevant docs before changing product behavior, architecture, LiveKit runtime behavior, billing, or evaluation.
- Keep changes scoped to PM interview prep unless the user explicitly asks to broaden the product.
- Do not commit secrets, real customer data, recordings, transcripts, API keys, database URLs, or provider credentials.
- Preserve the current root Next.js app until the staged `apps/web` migration is ready.
- Local secrets live in gitignored `.env.local` files. Do not ask the user to paste API keys into chat. If env vars are missing, run `npm run env:pull` to refresh Preview envs into `.env.local`, or `npm run env:pull:production` for `.env.production.local`; Vercel sensitive values may pull as empty quoted strings, so server-only secrets may still need to be restored from the original provider dashboard or rotated.
- For fresh local worktrees, run `npm run bootstrap:worktree` before runtime work. Use `npm run dev:local` as the single local runtime command; it starts Next.js, local Inngest, and the Python LiveKit agent when configured. Agent platforms that honor `conductor.json` should use its `setup` and `run` scripts automatically.
- Before provider work, run `npm run agent:service -- <service>` to resolve the canonical target, MCP/CLI/repository boundary, safe commands, and runbooks. Use `npm run agent:doctor` to inspect workstation CLI/MCP readiness without reading provider secrets.

## Product

Meelni is a live PM interview practice product: real PM interview questions, live voice mock interviews, PM-calibrated feedback, and practice progress over time. Do not frame the product as a gym or call interviews reps. Follow `lib/product-language.ts` and the accepted positioning decision for canonical customer-facing language.

The authenticated full-interview agent acts as a realistic PM interviewer. It asks adaptive follow-ups without teaching, hinting, or evaluating mid-session; feedback belongs to the post-interview experience. The short public demo is a separate experience and may provide a brief preview of feedback.

Only the human product owner makes the final launch GO/NO-GO. Agents and
automated gates may provide evidence and a readiness recommendation, but they
must not infer the owner's decision or authorize default-on, Production, or
live-mode action. Follow the accepted human-owned launch decision.
Use the Production action authorization contract only at release and
maintenance entrypoints. Do not apply it to ordinary authenticated or
provider-signed customer/runtime transactions.

Primary product surfaces:

- Public marketing, question bank, company pages, blog, and SEO content.
- Authenticated setup, voice interview, transcript, feedback, dashboard, and billing flows.
- Python LiveKit Agents runtime for demo and full interview sessions.
- Supabase/Drizzle data layer for users, questions, sessions, transcripts, feedback, subscriptions, usage, and insights.

## Architecture

- Target shape is an incremental monorepo:

```text
apps/
  web/              # future Next.js app location
  voice-agent/      # future optional voice-agent runtime location
packages/
  core/             # PM interview domain behavior and contracts
  agent/            # prompt, room metadata, transcript, and voice-session contracts
  integrations/     # Supabase, LiveKit, Stripe, PostHog, Google Sheets, Inngest adapters
  test-fixtures/    # transcript, question, feedback, and session fixtures
```

- Keep app entry points thin: parse input, authenticate, call a workflow, map the result.
- Put reusable PM interview behavior in `packages/core` as it migrates out of `lib/`.
- Keep provider-specific code behind integration boundaries.
- Normalize LiveKit, Stripe, Supabase, PostHog, and Google Sheets payloads before they enter core behavior.
- Avoid deep imports across package boundaries; expose public entrypoints.
- Add abstractions only when they remove current duplication or clarify a real migration boundary.

## Docs

- Durable architecture notes go in `docs/architecture/`.
- Accepted decisions go in `docs/decisions/`.
- Behavior and payload contracts go in `docs/contracts/`.
- Local dev, deployment, provider setup, and runbooks go in `docs/operations/`.
- Product truth and strategic direction remain in `.claude/PRD.md`, docs, and future product docs.
- Meaningful behavior changes should use `openspec/changes/` before implementation when alignment matters.
- For meaningful agent-authored feature work, use `docs/templates/AGENT_TASK_INTAKE.md` to capture intent, slice, scope, validation, and rollout before editing.

## Skills

- Canonical Meelni skills live in `.agents/skills/`.
- `.codex/skills/meelni-*` and `.claude/skills/meelni-*` should be symlinks to `.agents/skills/meelni-*`.
- Edit `.agents/skills/*` first; do not hand-edit symlinked copies.
- Use `meelni-start` as the front door when beginning an ambiguous,
  cross-cutting, or explicitly start-routed Meelni task; let it orient the
  request and hand off to the smallest relevant specialist skill set.
- Use `meelni-codebase-architecture` for module boundaries, package migration, adapter shape, and agent-friendly refactors.
- Use `meelni-livekit-interview-runtime` for LiveKit, voice interviews, turn-taking, transcript events, room metadata, and runtime config.
- Use `meelni-feedback-evaluation` for scoring, rubrics, feedback generation, insights, practice exercises, and transcript evaluation.
- Use `meelni-ui-design-system` for UI components, pages, surfaces, styling, motion, responsive states, design tokens, prototypes, and visual guardrails.
- Use `meelni-question-bank-seo` for explore pages, company pages, question pages, structured data, Google Sheets sync, and conversion from content to practice.
- Use `meelni-product-strategy` when explicitly asked for product direction, positioning, relaunch strategy, pricing, or growth.
- Use `meelni-linear-workstream` before starting, updating, handing off, or closing meaningful Linear-tracked Meelni work streams.
- Use `meelni-vertical-slice-playbooks` when building or reviewing cross-layer feature work by slice, including interview/session, feedback/evaluation, billing/trials, question-bank SEO, or agent tooling changes.
- Use `meelni-engineering-memory` when decisions, docs, contracts, operations notes, or OpenSpec artifacts need to be created or updated.
- Use `meelni-pr-prep` before opening or finalizing a meaningful PR.

## Tests

- Prefer behavior tests over source-shape tests.
- Every real interview, feedback, transcript, or LiveKit failure should become a fixture or regression test.
- For voice-agent work, test prompt/metadata/runtime helpers directly and manually verify LiveKit where necessary.
- For user-facing workflows, run `npm run typecheck` and targeted lint/build checks before claiming completion.

## Pull Requests

- Finish routine implementation work through a ready-for-review pull request unless the user explicitly asks for review only, there is no publishable diff, or a concrete external blocker requires owner input.
- Draft is a temporary collaboration state, not the default handoff state. An agent may open a draft while actively iterating, but after scoped implementation and relevant local validation it must convert the PR with `gh pr ready` before handoff.
- A ready PR must run the repository's required hosted checks. Monitor those checks to a terminal result and fix failures owned by the branch instead of leaving the PR in Draft to avoid CI.
- Leave a PR in Draft only when the user explicitly requests it or when unavailable credentials/infrastructure, an unresolved owner decision, or another hard external dependency prevents a reviewable candidate. Record the exact blocker and smallest owner action in the PR and Linear.
- Ready-for-review does not authorize merge, Production action, provider mutation, launch, or bypassing branch protection. Those boundaries remain human-owned where otherwise required.

## Style

- Keep code explicit and boring.
- Prefer typed parsers and schemas for external inputs.
- Keep comments short and only where they clarify non-obvious behavior.
- Do not expose model/provider tuning as end-user controls unless it is an accepted product decision.
