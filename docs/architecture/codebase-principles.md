# Codebase Principles

Meelni should optimize for fast PM interview product iteration without trapping core behavior inside routes, providers, or one-off UI flows.

## Product Shape

The first restarted product is not a generic interview platform. It is a PM interview practice product with:

- real PM interview questions and company-specific preparation content;
- live voice interview sessions;
- transcript capture;
- PM-calibrated feedback and focused practice exercises;
- progress, streaks, insights, and billing.

## Architecture

Keep entry points thin and workflows explicit.

- UI pages and API routes should parse inputs, authenticate when needed, call a workflow, and render or map the result.
- Voice-agent handlers should normalize LiveKit/session events, call interview workflows, and publish transcript/session events.
- Workflows should own state changes, idempotency, retries, and typed failure modes.
- External services should sit behind narrow adapters.
- Provider-specific statuses should be normalized at integration boundaries before they enter core workflows.

Prefer this dependency direction as the migration progresses:

```text
apps/* -> packages/agent -> packages/core
apps/* -> packages/integrations -> packages/core
```

`packages/core` should not import from app, provider, framework, or runtime code.

## Testing

Behavior tests matter more than implementation-shape tests.

Early durable fixtures should cover:

- selected question practice;
- room metadata parsing;
- transcript event publishing;
- feedback generation and skipped/partial feedback states;
- subscription entitlement and usage quota behavior;
- dashboard insight aggregation.

Every real failed interview, feedback run, or demo should become a regression fixture.
