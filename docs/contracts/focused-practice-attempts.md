# Focused-Practice Attempt Contract

Status: durable v1 scored and additive v2 scoreless integration implemented

## Purpose

The attempt contract turns one owned, completed interview's validated Feedback v2 into one resumable focused-practice record. It snapshots the exact deterministic plan and grounded finding that authorized the practice, then records a bounded candidate-authored revision or reflection. Completion produces a non-scored self-review comparison; it does not generate new feedback or claim interview readiness.

The pure lifecycle is owned by `packages/core/src/focused-practice-attempt.ts`. The authenticated orchestration and repository port are owned by `lib/workflows/focused-practice-attempt.ts`.

## Version tuple and states

- Attempt contracts: `focused-practice-attempt.v1` and
  `focused-practice-attempt.v2`.
- Completion command: `focused-practice-completion.v1`.
- Self-review: `focused-practice-self-review.v1`.
- Lifecycle version `0`: `in_progress`.
- Lifecycle version `1`: `completed` and terminal.

Changing the immutable snapshot, completion semantics, response kinds, or self-review meaning requires a new contract version. A completed v1 attempt cannot be reopened or overwritten.

V1 remains the exact scored Feedback v2 compatibility path. V2 is admitted
only for canonical partial scorecards and coaching reviews. It snapshots a
closed grounded focus identity and exact candidate evidence without adding a
weakest-dimension score, overall score, or numerical fallback. Full
dimension-coverage scorecards do not synthesize an improvement; existing
scored v1 behavior remains available for its accepted Feedback v2 sources.

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

For v2, the trusted pass consumes only SAV-420's strict evidence-limited or
dimension-coverage result. Selection is server-owned and stable across
provider ordering: canonical dimension order, then closed action/signal or
facet identity, then canonical evidence identity. Dimension-coverage partial
reviews prefer a grounded partially covered dimension before a sufficiently
covered dimension. Coaching reviews select only a grounded supported
dimension. The client cannot submit any focus, action, signal, facet, answer
block, citation, or exercise copy.

Legacy, malformed, ungrounded, incomplete, questionless, or unsupported source records fail closed. Stored model-authored practice suggestions do not influence plan selection.

## Immutable snapshot

An in-progress attempt snapshots:

- attempt, user, source-session, and source-feedback identities;
- exact Feedback v2 schema, prompt, rubric, model, and evaluation-state provenance;
- the complete accepted focused-practice plan, including as-read question text;
- the selected grounded finding's dimension, observation, next step, references, and confidence; and
- canonical start time.

Question-bank or feedback changes after creation do not rewrite the snapshot. Repeated and concurrent starts resume the same record. The `focused_practice_attempt` adapter enforces this with a unique owner/source identity across contract versions and an atomic create-or-load transaction; production persistence never depends on process memory. A compatible v1 row therefore resumes instead of allowing a second v2 path for the same review.

V2 also freezes a SHA-256 source fingerprint over the bounded owned session,
question, feedback, immutable evidence ledger, and frozen evaluation snapshot.
Creation re-reads and locks that source in the insert transaction. Any change
between selection and insertion fails closed without a write. Once created,
later source changes do not rewrite the attempt and retries return the exact
frozen snapshot.

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
responses. The server injects the authenticated owner. V1 responses retain
their legacy shape. V2 responses use a separate strict allow-listed customer
view that withholds owner/source-feedback identities, feedback/model
provenance, source fingerprints, signal/action/facet/answer-block identities,
transcript refs, citations, and exact evidence quotes. The UI strictly decodes
that union and fails closed on unknown versions, extra keys, or corrupt
content.

Every mutation takes the account-identity lock, locks the local account row,
and checks the deletion tombstone in the same transaction. Account export
schema `1.4.0` includes the user's persisted attempts using an explicit safe
field projection. Irreversible account deletion removes attempts before the
feedback/session graph.

This integration adds no model call, LiveKit room, Inngest job, credit mutation,
provider/environment action, or relaunch-flag change. SAV-415 adds one optional,
consent-bound, content-free `feedback_practice_started` event only after a v2
attempt durably returns `created`; resume and completion emit nothing. The
feedback workspace offers exactly one path for every valid partial scorecard
or coaching review, with retryable transport/conflict states and a clear
permanent unavailable fallback. Completion offers a question-bound return to
another mock interview. Starting focused practice does not start an interview,
use another credit, create a model evaluation, or claim interview readiness.
