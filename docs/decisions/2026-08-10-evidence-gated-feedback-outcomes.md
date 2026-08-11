# Evidence-Gated Feedback Outcomes

Status: accepted

Date: 2026-08-10

## Decision

Meelni determines post-interview feedback from frozen trustworthy candidate
evidence, never room duration or total transcript-turn count. At least one
substantive candidate answer receives grounded feedback. Numerical scores
require broader distinct evidence; narrow healthy evidence receives a
scoreless narrative result under a separate strict schema.

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
- Scored Feedback v2 retains its trust boundary; the scoreless companion reuses
  the same semantic grounding checks.
- Provider and authenticated isolated-staging rehearsal remains a separate
  owner-authorized rollout action under the human-owned launch decision.
