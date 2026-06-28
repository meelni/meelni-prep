# Meelni Agent Guide

Canonical instructions for Codex, Claude, and other coding agents working in this repository.

## Start

- Work from the repo root unless the user directs otherwise.
- Read relevant docs before changing product behavior, architecture, LiveKit runtime behavior, billing, or evaluation.
- Keep changes scoped to PM interview prep unless the user explicitly asks to broaden the product.
- Do not commit secrets, real customer data, recordings, transcripts, API keys, database URLs, or provider credentials.
- Preserve the current root Next.js app until the staged `apps/web` migration is ready.

## Product

Meelni is a PM interview practice product. The restart direction is a PM-focused interview gym: real PM interview questions, live voice reps, PM-calibrated feedback, and visible improvement over time.

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

## Skills

- Canonical Meelni skills live in `.agents/skills/`.
- `.codex/skills/meelni-*` and `.claude/skills/meelni-*` should be symlinks to `.agents/skills/meelni-*`.
- Edit `.agents/skills/*` first; do not hand-edit symlinked copies.
- Use `meelni-codebase-architecture` for module boundaries, package migration, adapter shape, and agent-friendly refactors.
- Use `meelni-livekit-interview-runtime` for LiveKit, voice interviews, turn-taking, transcript events, room metadata, and runtime config.
- Use `meelni-feedback-evaluation` for scoring, rubrics, feedback generation, insights, drills, and transcript evaluation.
- Use `meelni-question-bank-seo` for explore pages, company pages, question pages, structured data, Google Sheets sync, and conversion from content to practice.
- Use `meelni-product-strategy` when explicitly asked for product direction, positioning, relaunch strategy, pricing, or growth.
- Use `meelni-vertical-slice-playbooks` when building or reviewing cross-layer feature work by slice, including interview/session, feedback/evaluation, billing/trials, question-bank SEO, or agent tooling changes.
- Use `meelni-engineering-memory` when decisions, docs, contracts, operations notes, or OpenSpec artifacts need to be created or updated.
- Use `meelni-pr-prep` before opening or finalizing a meaningful PR.

## Tests

- Prefer behavior tests over source-shape tests.
- Every real interview, feedback, transcript, or LiveKit failure should become a fixture or regression test.
- For voice-agent work, test prompt/metadata/runtime helpers directly and manually verify LiveKit where necessary.
- For user-facing workflows, run `npm run typecheck` and targeted lint/build checks before claiming completion.

## Style

- Keep code explicit and boring.
- Prefer typed parsers and schemas for external inputs.
- Keep comments short and only where they clarify non-obvious behavior.
- Do not expose model/provider tuning as end-user controls unless it is an accepted product decision.
