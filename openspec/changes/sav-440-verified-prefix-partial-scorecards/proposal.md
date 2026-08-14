# SAV-440 verified-prefix partial scorecards

## Why

SAV-441 can now project a deterministic trusted prefix from a partial frozen
interview, but the current feedback contract intentionally forces every
partial snapshot into qualitative coaching. That leaves independently closed,
verified answers numerically unused.

## What changes

- Add a versioned dimension-coverage v2 result for partial frozen snapshots.
- Send only SAV-441 trusted closed blocks to numerical evaluation.
- Persist a server-owned, versioned binding to the ordered trusted-block
  identities and validate that binding again at authenticated and dashboard
  read boundaries.
- Expose scores only for dimensions with sufficient grounded evidence and
  always withhold the overall score for a partial snapshot.
- Explain the verified scope and excluded tail in customer-safe feedback UI.
- Keep partial scorecards out of overall progress, trends, and insight claims.

## Non-goals

- Rubric, facet, scale, provider, prompt-tuning, incremental-execution, or
  shadow-evaluation changes.
- Scoring unfinished or untrusted speech.
- Production migration application, deployment, provider mutation,
  default-on activation, launch action, or merge.
