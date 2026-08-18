# Change: Define Stateful Interviewer And Decision Contracts

## Why

Adaptive full interviews need an explicit state and decision boundary before a
brief compiler, controller, tools, or asynchronous Director can be implemented.
Without it, model output could accidentally compete with existing lifecycle,
deadline, transcript, settlement, answer-block, or feedback authorities.

## What Changes

- Define independently versioned `InterviewBriefV2`,
  `InterviewRuntimeState`, `InterviewerMove`, local tool, and
  `DirectorRecommendation` contracts.
- Keep top-level room metadata at version 1 and add reader-first negotiation for
  an optional nested brief.
- Bind brief identity to deterministic canonical session-start input.
- Define move admission, delivery, CAS, idempotency, expiry, interruption, and
  reconnect semantics.
- Define the authority, failure, evidence-isolation, latency-measurement,
  rollout, and rollback boundaries.
- Add shared TypeScript/Python golden fixtures and targeted compatibility tests.

## Impact

- Affected spec: `stateful-interviewer-contracts`
- Affected code: `packages/agent`, `agent/shared`, room-metadata readers, shared
  test fixtures
- Affected docs: accepted decision and durable contract records
- Runtime behavior: no new adaptive behavior is enabled
- Provider/Production behavior: unchanged
