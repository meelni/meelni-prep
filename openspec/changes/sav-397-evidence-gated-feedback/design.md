# Design

## Writer sequence ownership

The Python runtime owns one allocator per registered writer. It assigns the
next positive safe integer to either a canonical turn or integrity marker and
stores the assignment by `(event_id, event_kind)`. Exact replay returns the
stored integer. Cross-kind identity reuse and exhaustion fail closed. The
signed ingest schemas and database uniqueness constraints remain unchanged.

## Feedback policy

Canonical transcript preparation first removes semantic replay and rejects
malformed, injected, or speech-missing evidence. One substantive candidate
answer is eligible as partial; five distinct substantive answers are full.
Duration and total turns remain statistics only. Four substantive answers are
required for numerical scores. A healthy eligible partial below that precision
boundary uses `feedback.evidence-limited.v1`.

The evidence-limited parser reuses Feedback v2's canonical transcript index,
exact-quote restoration, uniqueness/non-overlap, observable-claim grounding,
material and quantitative claim checks, confidence rules, and summary safety.
It permits one to three total findings, no more than two per array, and rejects
score fields or numerical-rating copy.

## Durable outcomes and presentation

`feedback.outcome_reason` stores the closed content-free taxonomy:

- `feedback_generated`
- `no_reviewable_answer`
- `transcript_integrity_degraded`
- `dispatch_failed`
- `generation_failed`

No-answer and degradation are immutable non-retryable outcomes. Dispatch and
generation failure retain the existing fenced recovery rules. API and view
models carry the taxonomy exactly. The degradation UI describes system
unavailability and offers no candidate-directed duration, microphone,
answer-length, or quality advice.

## Production-shaped verification

Canonical fixtures enter the real provider-neutral boundaries in order:
writer registration, out-of-order/duplicate transcript and marker ingest,
settlement, frozen evidence, durable dispatch, exported Inngest handler,
generation workflow, fake evaluator, compare-and-set persistence, presenter,
runtime lifecycle decoder, and view state. A stage ledger makes direct terminal
feedback insertion fail the test. The matrix includes the 6m14s collision
shape, short/rich, long/silent, no-answer, corrupt, retry/duplicate, immutable
completion, and representative PM rubric routes.
