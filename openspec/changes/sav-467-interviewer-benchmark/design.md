# Design

`@meelni/agent` owns the provider-independent benchmark contracts and invariant
engine. `@meelni/test-fixtures/interviewer-benchmark` owns synthetic sessions
and frozen replay outputs. A local runner composes both, validates every output
and usage record, derives distributions and thresholds, and emits deterministic
JSON. The CLI hashes current Python prompt/runtime sources so drift invalidates
the checked baseline.

The judge sees candidate behavior only as adaptation context and scores only
the interviewer. Fixed seeds bound variance. The default adapter performs local
replay with zero provider calls and cost. A future provider adapter must be an
explicit opt-in and remains bounded by the v1 report thresholds.

Owner adjudication is a separate authority gate: the exact eight examples are
identified by a manifest hash and remain agent-authored until the product owner
records per-example accept/reject outcomes.
