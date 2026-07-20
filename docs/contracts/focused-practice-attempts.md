# Focused-Practice Attempt Contract

Status: durable authenticated API integration implemented for SAV-277; feedback-workspace UI remains a separate slice

## Purpose

The attempt contract turns one owned, completed interview's validated Feedback v2 into one resumable focused-practice record. It snapshots the exact deterministic plan and grounded finding that authorized the practice, then records a bounded candidate-authored revision or reflection. Completion produces a non-scored self-review comparison; it does not generate new feedback or claim interview readiness.

The pure lifecycle is owned by `packages/core/src/focused-practice-attempt.ts`. The authenticated orchestration and repository port are owned by `lib/workflows/focused-practice-attempt.ts`.

## Version tuple and states

- Attempt contract: `focused-practice-attempt.v1`.
- Completion command: `focused-practice-completion.v1`.
- Self-review: `focused-practice-self-review.v1`.
- Lifecycle version `0`: `in_progress`.
- Lifecycle version `1`: `completed` and terminal.

Changing the immutable snapshot, completion semantics, response kinds, or self-review meaning requires a new contract version. A completed v1 attempt cannot be reopened or overwritten.

## Authenticated start boundary

The start workflow accepts exactly two server-established identities:

1. authenticated `userId`; and
2. owned `sourceSessionId`.

It rejects extra client fields. A client cannot choose the feedback, recommendation, source finding, question, plan, score, evidence gap, or template.

The workflow fences accounts pending deletion before reading and again before writing. It uses an owner-scoped repository read to load a bounded source aggregate: session, completed feedback row, canonical user evidence turns, round, and source question. Missing and cross-owner sources produce the same `not_found` result.

Deletion can begin during an owner-scoped read, so the workflow rechecks the tombstone before returning an existing snapshot or continuing to source reconstruction. For durable creation and completion, a check immediately before the repository call is not sufficient: the adapter must acquire the account-identity lock, recheck the deletion tombstone, and perform the mutation in the same transaction. If deletion has been accepted, the repository returns `account_deletion_pending` without a write.

The workflow then:

1. verifies the feedback/session relationship and completed state;
2. rebuilds strict Feedback v2 from persisted fields and canonical evidence;
3. resolves the recommendation and exact selected source finding in the same trusted pass;
4. derives the five-minute plan from the current versioned template catalog; and
5. asks the repository to atomically create or return the one owned attempt for that immutable source identity.

Legacy, malformed, ungrounded, incomplete, questionless, or unsupported source records fail closed. Stored model-authored practice suggestions do not influence plan selection.

## Immutable snapshot

An in-progress attempt snapshots:

- attempt, user, source-session, and source-feedback identities;
- exact Feedback v2 schema, prompt, rubric, model, and evaluation-state provenance;
- the complete accepted focused-practice plan, including as-read question text;
- the selected grounded finding's dimension, observation, next step, references, and confidence; and
- canonical start time.

Question-bank or feedback changes after creation do not rewrite the snapshot. Repeated and concurrent starts resume the same record. The `focused_practice_attempt` adapter enforces this with a unique owner/source/version identity and an atomic create-or-load transaction; production persistence never depends on process memory.

Every repository-hydrated attempt is decoded against the exact v1 shape before it can be returned or transitioned. The decoder verifies canonical timestamps, lifecycle/state relationships, Feedback full/partial provenance, deterministic recommendation and template identities, exact versioned template copy, plan and finding consistency, and terminal self-review provenance, then rebuilds a frozen value. The workflow also binds every decoded result back to the requested owner, source, and attempt identity before returning it. Corrupt rows, unknown versions, extra fields, disposition/state contradictions, and wrong-row adapter results fail closed.

## Completion boundary

The completion workflow accepts exactly authenticated `userId`, owned `attemptId`, and one `focused-practice-completion.v1` object. Completion requires:

- `practicedAloud: true`; and
- exactly one response of kind `revised_answer` or `reflection`.

Responses are normalized for line endings and surrounding whitespace, reject control characters and unknown fields, and are bounded to 8,000 characters for a revised answer or 2,000 for a reflection. Completion time cannot precede the snapshotted start time.

The owner-scoped repository transition uses the expected lifecycle version. The first valid completion is terminal. An exact response replay is idempotent and returns the stored completion; a divergent replay is a conflict and cannot overwrite it. Cross-owner and missing attempts are non-enumerating.

Successful repository dispositions are bound to the command that produced them. A `created` result must preserve the generated attempt identity and start time, and every successful completion result must preserve the normalized submitted response as well as the original immutable snapshot.

## Self-review semantics

The deterministic self-review records the candidate response beside the snapshotted focus dimension, grounded observation, grounded next step, success criterion, and self-review prompt. It does not call a model, rescore the interview, issue pass/fail labels, predict hiring outcomes, or claim readiness.

## Durable API and privacy boundary

Migration `0028_focused_practice_attempts` adds the canonical durable table. It
binds every attempt to its owner, source session, and source feedback with
composite foreign keys; stores explicit contract/template columns beside the
strict JSON snapshot; and permits only the one `in_progress` version 0 to
`completed` version 1 transition. Immutable source or plan changes are rejected
by the database. Owner RLS is deletion-aware and grants authenticated users
read-only access; writes remain server-owned.

The authenticated, dynamic, no-store API surface is:

- `POST /api/focused-practice/attempts/start` with exactly `sourceSessionId`;
- `GET /api/focused-practice/attempts/:attemptId`; and
- `POST /api/focused-practice/attempts/:attemptId/complete` with exactly the
  v1 completion object.

Authentication and the deterministic relaunch-access gate run before body
parsing or database work. Provider authentication errors and access-resolution
errors fail closed. Missing and cross-owner resources have indistinguishable
responses. The server injects the authenticated owner and withholds internal
owner/source-feedback identifiers from responses.

Every mutation takes the account-identity lock, locks the local account row,
and checks the deletion tombstone in the same transaction. Account export
schema `1.3.0` includes the user's persisted attempts using an explicit safe
field projection. Irreversible account deletion removes attempts before the
feedback/session graph.

This integration adds no model call, LiveKit room, Inngest job, credit mutation,
analytics event, provider/environment action, or relaunch-flag change. The
feedback-workspace UI is a separate slice and must preserve the same
customer-language and non-scoring boundaries.
