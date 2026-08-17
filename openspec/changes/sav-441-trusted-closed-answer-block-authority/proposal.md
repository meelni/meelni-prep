# SAV-441 trusted closed answer-block authority

> Amended 2026-08-17 by SAV-453: repeated exact safe markers still keep the
> snapshot label partial, but no longer suppress a total when trusted scope has
> zero excluded candidate blocks and all weighted dimensions are sufficient.

Amended 2026-08-14 by SAV-449: the original single-terminal preserving-marker
restriction is superseded by the exact role/reason behavior below.

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
- Treat exact interviewer `no_provider_confirmed_prefix` markers as
  content-free sequence evidence that neither closes nor splits an answer.
  Repeated and mid-session occurrences preserve prompt/answer continuity; the
  marker alone does not prohibit an overall when downstream authority proves
  zero exclusions and complete weighted coverage.
- Fail closed for candidate/canonicalization markers, malformed marker
  ordering, gaps, replay conflicts, writer drift/degradation, cutoff conflicts,
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
