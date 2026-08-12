# Design

## Server-owned presentation kind

The sessions persistence adapter maps private bounded feedback fields to one
closed presentation kind: `scored`, `evidence_limited`, or `unavailable`.
Only that discriminator crosses the sessions API; version fields, findings,
summary, and provider identity do not.

`evidence_limited` requires completed/generated/partial lifecycle facts, the
exact accepted evidence-limited provenance tuple, a bounded non-empty model
identity, all score columns null, empty drills, and server-owned closed-template
content. A null score, arbitrary completed row, malformed JSON, unknown code,
or incompatible tuple remains unavailable. `scored` requires either the exact
supported v2 tuple with complete coherent scores or the exact supported legacy
tuple with complete in-range historical scores. The feedback route
independently revalidates full stored content and, for v2, exact frozen
transcript citations before rendering.

## Dashboard behavior

Both scored and evidence-limited kinds are reviewable. Evidence-limited rows
say `Feedback ready — no score` and never supply a score, focus dimension, bar,
average, trend, or weakness-pattern input. Existing completed-score rules remain
the sole numeric evidence gate.

Overview's latest-feedback action chooses the most recent reviewable result,
while its recommendation and progress model continue to use the most recent
scored result. History pattern calls to action continue to target scored
feedback; when no scored pattern exists, the newest reviewable qualitative
feedback remains reachable.

## Privacy and analytics

`session_history_viewed.has_feedback` continues to report one boolean derived
from reviewable links. Evidence-limited findings, transcript references, model
identity, and raw lifecycle details never enter analytics or the sessions API.
