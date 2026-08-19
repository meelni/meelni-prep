# Keep The Interview Director Read-Only In Shadow

Date: 2026-08-19
Status: accepted implementation boundary
Issue: SAV-474
Decision owners: repository architecture; provider, spend, Preview, Production,
influence, and launch remain human-owned

## Context

SAV-467 supplies synthetic interviewer fixtures, SAV-469 supplies content-free
semantic observability, and SAV-471 supplies deterministic controller and
delivery authority. The next slice needs to measure deeper asynchronous
recommendations without adding media-path latency or allowing a second system
to control the interview.

## Decision

Implement a separately configured, provider-neutral, session-local Director as
a one-way observer after canonical transcript persistence. Keep it default off
and inject no application adapter. Permit only a deterministic provider-free
fake in tests.

Recommendations are typed, versioned, bounded, finalized-turn advice. Storage,
expiry, replay handling, reconnect cleanup, comparison, and telemetry are all
bounded. Speculative interim work must reconcile to an exact final revision or
be discarded. In-flight matching work rebinds to the exact final state and
lifecycle authority before publication. Comparison occurs after canonical
delivery and cannot change the recommendation or delivered move.

When a live controller move is pending, shadow analysis may use the accepted
global move vocabulary for counterfactual comparison even though live
`allowed_moves` is empty. This vocabulary is not an authority and has no path
to the controller or prompt. It closes at elapsed time, speech fencing, and
non-active lifecycle states.

Director data is prohibited from live chat context, controller snapshots,
transcript/evidence, answer blocks, feedback, customer output, settlement,
billing, accounts, secrets, and side-effecting tools. Failures and latency have
zero live effect.

## Consequences

- Current full interviews are byte-for-byte governed by existing prompt,
  controller, transcript, deadline, and settlement paths.
- A checked-in flag does not make the Director runnable because the entrypoint
  supplies `adapter=None`.
- SAV-469-compatible metadata can measure readiness/freshness/latency/cost
  estimate and comparison categories without content capture. Readiness begins
  at finalized-turn availability and includes queue plus context-build time;
  comparison events do not double-count recommendation results.
- SAV-467 fixture agreement validates plumbing only; it cannot establish a
  real-model quality or cost threshold.
- SAV-475 must create a separate, owner-gated influence contract if shadow
  evidence later supports it.

## Rejected alternatives

### Put Director output in the live interviewer prompt

Rejected because it would make shadow latency, staleness, and failure
candidate-visible and would bypass controller authority.

### Persist Director context or recommendations as interview evidence

Rejected because interim text and operational advice are not canonical
candidate evidence and must not change feedback eligibility.

### Configure a provider as part of the repository slice

Rejected because model selection, spend, privacy, quality thresholds, and
Preview/Production activation require an explicit owner-controlled gate.
