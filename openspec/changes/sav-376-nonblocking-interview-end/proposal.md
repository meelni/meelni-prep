# SAV-376 non-blocking interview end

## Why

Explicit End Interview still runs LiveKit settlement, terminalization, credit
convergence, room cleanup, and feedback dispatch on one HTTP request. Provider
and database latency therefore traps the candidate, while premature
terminalization can reject transcript evidence that was still draining.

## Outcome

End Interview first commits one owned, idempotent `ending/user_end` intent and
returns a feedback lifecycle destination. A recoverable worker settles evidence
at the recorded cutoff, terminalizes once, dispatches eligible feedback before
unrelated side effects, and converges credit and cleanup independently.

## Boundaries

- Wall-clock room duration never substitutes for transcript evidence.
- Missing or degraded writer evidence never becomes eligible feedback.
- No transcript text, provider payload, user identity, or secret enters stage
  telemetry.
- Existing terminal sessions remain immutable.
- Production/default-on action remains human-owner-only and is not part of this
  change.
