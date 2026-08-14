# SAV-441 trusted closed answer-block authority

## Why

Frozen transcript evidence currently classifies a session as complete or
partial, while the feedback workflow treats that session-wide state as the
only numerical authority. A partial terminal tail can therefore suppress an
earlier answer that was already committed, prompt-bound, healthy, and closed.

SAV-442 made explicit End settlement intent durable and writer-fenced. Core now
needs one deterministic provider-neutral projection before any scoring policy
can consume a verified prefix.

## What changes

- Add a strict `frozen-answer-block-authority.v1` input over normalized frozen
  cutoff and writer facts.
- Reuse the existing answer-block grouper and project only a trusted closed
  prefix with explicit closure provenance.
- Preserve earlier closed blocks only for the exact terminal interviewer
  `no_provider_confirmed_prefix` marker; exclude its affected tail.
- Fail closed for candidate/canonicalization markers, non-terminal preserving
  markers, gaps, replay conflicts, writer drift/degradation, cutoff conflicts,
  malformed inputs, and unknown versions.
- Emit one private-minted, SHA-256, segmentation-invariant versioned identity
  alongside each trusted block.
- Add fully synthetic, hash-bound calibration and compatibility fixtures.

## Non-goals

- Sparse dimension scores, overall-score policy, evaluator/provider calls, or
  SAV-440 workflow behavior.
- Feedback persistence, database migrations/reads, API/UI changes, dashboard
  or insight behavior.
- Changing canonical transcript events, SAV-369 grouping, historical rows, or
  existing calibration corpora.
- Provider configuration, paid comparison, Production action, deployment,
  default-on activation, launch, or merge.
