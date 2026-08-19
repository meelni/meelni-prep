# Design

`@meelni/agent` owns the provider-independent benchmark contracts and invariant
engine. `@meelni/test-fixtures/interviewer-benchmark` owns synthetic sessions
and frozen replay outputs. A local runner composes both, validates every output
and usage record, derives distributions and thresholds, and emits deterministic
JSON. The CLI hashes current Python prompt/runtime sources so drift invalidates
the checked baseline. It can read or atomically replace only the exact
repo-owned SAV-467 evidence file and rejects absolute, traversal, unrelated,
non-regular, or symlink targets.

The judge sees candidate behavior only as adaptation context and scores only
the interviewer. Fixed seeds bound variance. The default adapter performs local
replay with zero provider calls, token usage, credential reads, Production
calls, and cost. A provider adapter requires an exact versioned authorization
before its first invocation, a pinned versioned model identity, truthful
credential/Production evidence, finite nonnegative integer token counts, and
the report's 12-call, 100,000-token-per-direction/per-call, and USD-1 bounds.

The v2 suite adds normalized deterministic checks for advice/praise variants,
compound interrogative/directive clauses, and repeated text independent of
caller move/topic labels. The v2 report adds execution authorization and token
evidence plus a benchmark-engine source fingerprint. Its quality, latency,
variance, actionable-failure, runtime-source, and owner-manifest values remain
identical to the reviewed v1 baseline; its input hash changes to bind the v2
engine sources.

Owner adjudication is a separate authority gate: the exact eight examples are
identified by a manifest hash and remain agent-authored until the product owner
records per-example accept/reject outcomes.
