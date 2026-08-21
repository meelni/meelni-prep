# Proposal: Launch The Adaptive Interviewer In Production

## Problem

The reviewed Director adapter and controller influence gate are merged but the
ordinary customer interview worker still constructs no adapter. The owner wants
to test and launch through the real Production product rather than another
special environment.

## Outcome

Issue a signed adaptive admission from the durable Production start workflow,
verify it in the ordinary worker, construct the bounded Director only for that
admission, and retain the existing controller/lifecycle/delivery/feedback/credit
authorities and all-off rollback.

## Non-goals

No scoring-policy change, separate LiveKit project, provider retries, direct
Director speech, or weakening of branch protection and release gates.
