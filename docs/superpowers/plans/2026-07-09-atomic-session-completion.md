# Atomic Session Completion And Feedback Dispatch

## Intent

- User request: Make the relaunch-ready product reliable before enabling the existing feature flag by default.
- Product/user outcome: Ending an interview always produces one durable terminal result and either one feedback job or an explicit skipped result. Retrying is safe.
- Why now: The current route performs terminalization, feedback creation, and Inngest dispatch as separate writes. A race or provider failure can strand a paid practice session before feedback.

## Slice

- Primary slice: interview/session lifecycle.
- Secondary slices: feedback/evaluation and agent tooling/reliability.
- Relevant skills: `meelni-feedback-evaluation`, `meelni-livekit-interview-runtime`, `meelni-codebase-architecture`, `meelni-vertical-slice-playbooks`, `meelni-engineering-memory`, `meelni-linear-workstream`, and `meelni-pr-prep`.

## Linear Tracking

- Project: Meelni relaunch readiness.
- Parent slice issue: SAV-166.
- Child deliverable issue: SAV-188.
- Current Linear state: In Progress.

## Scope

- In scope:
  - atomically terminalize the canonical session lifecycle and create the one-per-session feedback record;
  - store the feedback-generation event identity and dispatch state in the same transaction;
  - claim dispatch with a lease, use a stable event ID, and make failed sends retryable;
  - repair a terminal session that predates the invariant and has no feedback row;
  - make the browser check `response.ok`, remain in the interview on a real end failure, and offer retry;
  - expose feedback-dispatch recovery through the authenticated feedback endpoint;
  - prove convergence with ten simultaneous PostgreSQL requests.
- Out of scope:
  - transcript turn identity, ordering, and the bounded end-of-session drain (SAV-194);
  - changing rubric thresholds or scoring prompts;
  - generalized rate-limit replacement;
  - enabling the public relaunch feature flag.
- Assumptions:
  - a persisted transcript turn is durable evidence that an interview became usable;
  - Inngest deduplicates replays carrying the same explicit event ID within its supported window;
  - exactly-once external delivery is approximated by one durable event identity plus idempotent worker behavior.

## Product Lens

- Audience: PM candidates completing live interview practice.
- Lever: activation and trust. The user must never lose the post-interview artifact at the highest-anxiety point in the flow.
- Product Compass note: this is reliability work for live PM interview practice, not a new fitness or “gym” mechanic.

## Technical Plan

- App files:
  - `app/api/interview/end/route.ts` becomes a thin authenticated adapter;
  - `app/api/feedback/[sessionId]/route.ts` reports dispatch recovery and accepts an authenticated retry;
  - `app/interview/page.tsx` and the end modal render retryable end failures;
  - feedback loading/result surfaces distinguish generation failure from dispatch delay.
- Workflow/data files:
  - add an atomic completion store/workflow under `lib/db` and `lib/workflows`;
  - add dispatch status, stable event ID, claim timestamps, attempts, and last error to `feedback`;
  - stop the feedback worker from writing session lifecycle or legacy session status;
  - add migration `0007` and database-contract checks.
- Provider behavior:
  - the database transaction creates feedback with `dispatch_status=pending` and a deterministic event ID;
  - one caller atomically claims the dispatch lease;
  - a send failure leaves feedback pending and marks dispatch failed, so retry is safe;
  - a crash after send may replay the same event ID, which the provider/worker must treat idempotently.
- Docs:
  - add `docs/contracts/interview-session-completion.md` and link it from the contract index;
  - update operations guidance with recovery and rollout evidence.

## Validation

- Required commands:
  - targeted workflow/API/component tests;
  - `npm run test:database-migrations` against disposable PostgreSQL 17;
  - `npm run check:ci`;
  - `npm run build`;
  - `npm run verify:agent` before handoff.
- Regression scenarios:
  - ten concurrent end requests return the same terminal state, feedback ID, and event ID;
  - one feedback row and one dispatch claim exist;
  - an Inngest-send failure returns a successful session end with retryable dispatch state;
  - replay after send failure dispatches the same event ID;
  - terminal-without-feedback is repaired without changing terminal truth;
  - client does not navigate or close the room when terminalization returns non-2xx.

## Rollout

- Risk level: high; this is the boundary between a live session, durable feedback, and credit value.
- Backward compatibility: existing feedback rows default to `not_required`; new completion writes use the outbox fields. Legacy terminal rows may be repaired on authenticated replay.
- Metrics/events: terminalization failures, dispatch claim attempts, dispatch failures, lease recovery, duplicate event IDs, pending-feedback age, and feedback completion latency.
- Rollback: revert route reads/writes to the prior path only before enabling the relaunch flag. Never rewrite canonical terminal outcomes or remove populated dispatch evidence.
- Follow-up: SAV-194 owns transcript settlement/cutoff; SAV-176 consumes Preview rehearsal evidence before feature-flag activation.
