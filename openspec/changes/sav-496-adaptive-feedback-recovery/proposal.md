# Proposal: Restore Adaptive Admission And Reviewable Feedback

## Problem

Production web signed adaptive admission with its LiveKit project secret while
the Cloud worker verified with a different provider-injected credential. The
worker therefore fell back to the legacy interviewer. During End, the transcript
queue could then persist terminal settlement ahead of unresolved pre-cutoff
evidence, causing a later usable turn to receive `runtime_settled` and the frozen
session to become `transcript_integrity_degraded`.

## Outcome

Use one explicitly synchronized, domain-separated cross-service admission key;
await one settlement interruption; and keep the terminal settlement behind
every unresolved pre-cutoff evidence item. Preserve verified-prefix Coaching
review when settlement is missing and strict `Unable to review` for corrupt or
permanently degraded candidate evidence.

## Non-goals

No historical-row rewrite, customer-data replay, scoring-policy expansion,
provider call, Production configuration mutation, deployment, or launch action.
