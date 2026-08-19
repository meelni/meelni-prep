# Gate Director Recommendations Through The Controller

Date: 2026-08-19
Status: accepted implementation boundary
Issue: SAV-475
Decision owners: repository architecture; provider, spend, Preview, Production,
default-on, launch, and merge remain human-owned

## Context

SAV-474 provides bounded asynchronous recommendations but deliberately has no
influence path. SAV-471 and SAV-472 already provide the authoritative reducer,
five bounded mutation tools, current-writer lifecycle refresh, and stream/race
fencing. Adding another agent loop or waiting for advice would duplicate those
authorities and make latency candidate-visible.

## Decision

Add one synchronous, session-local influence policy at the existing serialized
tool mutation boundary. It may only inspect the latest already-ready Director
recommendation. It cannot start or await work.

The policy reads its exact server-owned enablement/config generation on every
admission. It rejects advice that is not exact for current session, brief,
writer generation, controller state, lifecycle, finalized source turn,
transcript revision, question, freshness, phase, deadline, legal move/target,
probe eligibility, and delivered ledger. Accepted advice may replace only move
type, target, and that move's closed controller-validated reason code on the
current tool request. Commit remains non-close and graceful-close remains
close-only. The normal assessor and controller reducer then independently
decide admission.

Every non-accepted outcome executes the original deterministic request. The
Director cannot speak, add tools, inject prompt text, mutate lifecycle or
evidence, or request fallback. Consumed IDs are bounded to current source
authority; after delivery the controller ledger is authoritative.

The application remains default off and has no Director adapter. Provider-free
synthetic tests are the only enabled influence environment in this slice.

## Consequences

- Tool admission never waits for Director latency.
- A recommendation ready before revocation cannot influence the next decision
  after the server policy is revoked.
- Stale, malformed, repeated, rejected, or absent output is observationally the
  same deterministic fallback as disabled influence.
- Exact attribution and planned/admitted/delivered stages can be measured
  without content capture.
- SAV-472 stream/race fences and SAV-474's no-adapter default boundary remain
  intact.
- SAV-476 still owns the human rollout decision.

## Rejected alternatives

### Await a recommendation before choosing a move

Rejected because it puts optional analysis on the live latency path.

### Let the Director call tools or speak directly

Rejected because it creates a second controller and can bypass one-question,
no-coaching, close, lifecycle, and delivery rules.

### Cache enablement at session construction

Rejected because a no-deploy kill switch must revoke already-ready advice at
the next admission.
