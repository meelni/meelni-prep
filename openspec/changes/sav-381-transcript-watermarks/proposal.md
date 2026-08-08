# SAV-381 committed transcript watermarks

## Why

Canonical turns are persisted with writer generation and sequence, but the
database does not continuously record which prefix is contiguous. End currently
requires a final settlement from every registered runtime and feedback later
reads the session transcript without an immutable per-writer boundary. A short
provider failure can therefore suppress trustworthy feedback or allow the
evidence read to drift from the terminal decision.

## Outcome

Every transcript write advances durable writer progress. Terminalization freezes
one immutable cutoff and per-writer committed prefix. Feedback consumes exactly
that snapshot, and a sufficiently complete healthy prefix can receive explicitly
partial feedback when exact end settlement is unavailable.

## Boundaries

- Postgres is the durability and feedback-evidence authority.
- LiveKit conversation events remain normalized runtime inputs, not terminal
  truth; the browser remains display-only.
- Gaps, integrity markers, degraded settlements, malformed progress, and absent
  writer registration fail closed.
- The existing canonical partial-feedback threshold and UI are reused; scoring,
  rubric, and prompt behavior do not change.
- Production migration, deployment, and relaunch remain separately gated.
