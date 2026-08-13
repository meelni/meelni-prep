# Evidence-Gated Feedback Outcomes

Status: accepted

Date: 2026-08-10; amended 2026-08-12 by SAV-411 and SAV-421

## Decision

Meelni determines post-interview feedback from frozen trustworthy candidate
evidence, never room duration or total transcript-turn count. At least one
substantive candidate answer receives grounded feedback. Numerical scores
require broader distinct evidence; narrow healthy evidence receives a
scoreless structured result under a separate strict schema. The limited
provider response contains only closed PM-rubric signal/action codes and
trusted candidate-turn aliases. The server owns every customer-visible
qualitative template and restores exact citations from frozen evidence; the
provider authors no narrative or quote.

Feedback lifecycle state uses a closed durable taxonomy that distinguishes
generated feedback, no reviewable answer, transcript integrity degradation,
dispatch failure, and generation failure. Customer presentation must preserve
that distinction. System degradation cannot be translated into microphone,
duration, answer-length, or answer-quality blame.

Transcript turns and integrity markers from one runtime writer share one
monotonic replay-stable sequence namespace because persistence, settlement,
and frozen watermarks treat them as one ordered stream.

For new `feedback.dimension-coverage.v1` evaluations, the numerical breadth
rule below is superseded by
[Round-Specific Dimension Evidence Coverage](2026-08-12-round-specific-dimension-evidence-coverage.md).
Its lexical/surface classifications remain historical compatibility and
minimum-usable-signal inputs; they do not select scores or scorecard mode.

Qualitative reviewability and numerical precision are separate evidence
levels. After canonical/security preparation and the existing quantitative
gates, a response that fails the strict scoreable surface may use a bounded,
punctuation-independent lexical fallback. It requires at least 40 tokens,
deduplicates recognized PM/reasoning lexemes across catalogs, caps recognized
occurrences at 30% of the turn and twice the distinct-lexeme count, and requires
connector-linked pairs of different recognized lexemes no more than 14 token
positions apart. At least one pair must use a strong relationship connector.
The turn must then have either five distinct lexemes and two broad pairs, or at
least 46 tokens, four distinct lexemes, and one broad pair. Strong connectors
are `because`, `so`, `then`, `therefore`, `while`, `when`, `if`, `before`,
`after`, `means`, `by`, `through`, `than`, and `into`; broad pairs also admit
ordinary grammatical glue such as `and`, `but`, `to`, `with`, `or`, forms of
`be` limited to `is`, `are`, `was`, and `were`, plus `from`, `for`, and `as`.
The fallback never contributes numerical-score
breadth and does not add another sentence-grammar parser.

Interruption integrity is scoped to the evidence that may have been lost. The
exact `interviewer/no_provider_confirmed_prefix` marker represents textless
inaudible interviewer speech and preserves independently trustworthy candidate
evidence. Candidate markers and every canonicalization failure remain
degrading. Writer progress and the frozen snapshot use the same closed
speaker/reason classifier. A preserving marker or missing writer settlement
durably sets `feedbackModeConstraint=evidence_limited_only`, so four or five
otherwise scoreable answers still cannot receive numerical feedback.

## Consequences

- Short substantive interviews can produce useful feedback without invented
  precision.
- Long silent interviews cannot receive scores merely because time elapsed.
- Degraded/corrupt transcripts remain fail closed and visibly system-owned.
- Scored Feedback v2 remains unchanged. The scoreless companion removes
  freeform provider narrative entirely and validates closed selections against
  the same frozen transcript trust boundary. Signal codes are unique within
  their category and action codes are unique across the result, regardless of
  which frozen turn is cited.
- Historical v2 generation used strict scoreable-response breadth. New v3
  generation derives numerical support only from sufficient round-specific
  rubric-dimension coverage over answer blocks.
- Deterministic evidence recognition is not semantic proof. Engineered
  low-density prose with several distinct PM anchors can satisfy the lexical
  boundary; it remains qualitative-only. The provider may choose only closed
  signal/action codes and frozen candidate aliases, and the server owns all
  narrative and exact citations. Invalid or unsupported selections fail as
  `generation_failed`; they do not become feedback or false candidate
  insufficiency.
- Provider and authenticated isolated-staging rehearsal remains a separate
  owner-authorized rollout action under the human-owned launch decision.
