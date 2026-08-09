# SAV-380 bounded interview read path

## Why

The browser currently performs a full transcript read on every agent-state
transition. When Supabase or Postgres stalls, those reads overlap and remain
open until the hosting platform terminates them. Feedback polling has a bounded
attempt count but no per-request deadline, so one request can defeat the whole
budget and leave the candidate on “Saving your interview.”

## Outcome

Transcript recovery has one browser owner and one in-flight request per
session. Customer-facing transcript and feedback reads either complete or
return a retryable result inside an eight-second hard boundary.

## Boundaries

- Runtime packets remain post-persistence display notifications.
- The database remains canonical transcript and lifecycle truth.
- No evidence, scoring, or terminal-state policy changes in this slice.
- No Production action or rollout is authorized by this change.
