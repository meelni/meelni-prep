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
explicit or implicit numerical-rating copy, including article-less and
label-free spelled-out ratings, while preserving dates, percentages, counts,
metrics, market share, revenue, time estimates, and compound quantity phrases.
Quantity and compound recognition is structural and open-ended rather than a
noun allowlist. A deterministic lexer classifies numeric spans inside local
clauses, including predicate-to-number adjacency across colon, em dash, and
newline separators. Rating scales, units, and noun-phrase heads bind only to
their numeric span. Later clauses are barriers and may independently describe
how to score, grade, rate, or mark PM artifacts without reclassifying the
earlier quantity. A bounded adjacent-clause pronoun or demonstrative crosses
that barrier only when it explicitly refers the quantity back to a score or
rating.

## Durable outcomes and presentation

`feedback.outcome_reason` stores the closed content-free taxonomy:

- `feedback_generated`
- `no_reviewable_answer`
- `transcript_integrity_degraded`
- `dispatch_failed`
- `generation_failed`

No-answer and degradation are immutable non-retryable outcomes. Dispatch and
generation failure retain the existing fenced recovery rules. A failed
dispatch is preserved as a distinct provider-neutral lifecycle response from
the bounded database read through the API, core decoder, view state, and retry
UI. API and view models carry the taxonomy exactly. The degradation UI describes system
unavailability and offers no candidate-directed duration, microphone,
answer-length, or quality advice.

## Production-shaped verification

Canonical fixtures cover the full provider-neutral matrix. The disposable
PostgreSQL acceptance path crosses the real Drizzle writer, turn, marker and
settlement stores; atomic finalizer/outbox; frozen reader; durable dispatch;
exported Inngest handler and generation workflow; fake evaluator; generation
claim and compare-and-set completion; bounded feedback read query; production
API payload builder; runtime lifecycle decoder; and view state. It verifies
out-of-order and duplicate evidence, duplicate finalization/dispatch/run,
immutable completion, and the 6m14s turn-marker incident shape. Because the
Python runtime and TypeScript web service are separate processes, the real
Python allocator test produces a checked-in identity/sequence contract that
the TypeScript fixture consumes through the disposable database seam. The
broader provider-free fixture test retains short/rich, long/silent, no-answer,
corrupt, retry/duplicate, and representative PM rubric routing coverage.
