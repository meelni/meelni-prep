# Evidence-Gated Feedback Outcomes

Status: accepted

Date: 2026-08-10

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
- Provider and authenticated isolated-staging rehearsal remains a separate
  owner-authorized rollout action under the human-owned launch decision.
