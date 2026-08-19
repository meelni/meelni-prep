# Interviewer Benchmark Contract

SAV-467 defines a versioned, fully synthetic benchmark for the quality of the
authenticated PM interviewer. It evaluates interviewer behavior only. It must
never produce or influence a candidate scorecard, coach the candidate, or add
mid-session evaluation to the live runtime.

## Versioned boundaries

- Scenario: `interviewer-benchmark-scenario.v1`
- Judge request: `interviewer-quality-judge-request.v1`
- Judge output: `interviewer-quality-judge-output.v1`
- Judge adapter: `interviewer-quality-judge-adapter.v1`
- Execution authorization: `interviewer-benchmark-execution-authorization.v1`
- Rubric: `pm-interviewer-quality-rubric.v1`
- Suite: `meelni.interviewer-benchmark-suite.v2`
- Baseline: `meelni.current-interviewer-baseline.v2`
- Report: `meelni.interviewer-benchmark-report.v2`

`@meelni/agent` owns the scenario, invariant, judge, and provider-adapter
contracts. `@meelni/test-fixtures/interviewer-benchmark` owns only synthetic
fixture data and frozen provider-free replay output. The local runner composes
those boundaries without importing provider SDKs.

All external judge output is decoded with exact keys, all ten dimension scores
are integers from zero through four, and the overall score is derived from the
dimension total. Scenario/seed mismatches, unknown evidence turn IDs, malformed
usage, model-identity mismatches, execution-mode contradictions, and provider
budget overruns fail the run closed. Token counts must be finite nonnegative
safe integers for provider-backed output and `null` for provider-free replay.
Each result records credential and Production use; the report aggregates those
observations instead of inferring them from the adapter mode.

Provider-free replay is the default authorization and permits zero calls, zero
cost, no token usage, no credential read, and no Production call. A
provider-backed adapter requires a separate exact-version authorization before
the first judge invocation, must identify one expected versioned model, and is
bounded to 12 calls, 100,000 input/output tokens per call, and USD 1.
Production remains prohibited in both modes.

## Coverage and invariants

The v1 catalog contains one complete session for product sense, execution,
strategy, and behavioral rounds. Together they exercise strong, shallow,
rambling, contradictory, silent, interrupting, and time-consuming candidate
behavior. The deterministic layer separately rejects coaching, mid-session
evaluation, multiple substantive questions in one turn, repeated probes,
speech begun at/after the deadline, and speech after a close. Coaching and
evaluation checks normalize text and cover declarative advice/praise variants.
Question checks recognize compound interrogative/directive clauses even when a
turn contains only one question mark. Repeated probes compare normalized text
independently of caller-supplied move and topic labels. Neutral questions about
a candidate's framework, recommendation, prioritization, or either/or choice
remain explicit false-positive controls.

The quality judge scores question relevance, depth, evidence targeting,
redundancy, one-question discipline, no coaching/evaluation, challenge
calibration, round progression, time management, and graceful close. Candidate
behavior is context for adaptation, never the object being scored.

## Reproducibility and gates

The provider-free baseline uses seeds `17`, `43`, and `89`. It reports runtime
and benchmark-engine source hashes, fixture/output input hash, report hash,
quality distribution, synthetic response-latency distribution, judge latency,
provider calls, actual cost, variance, invariant results, and turn-grounded
actionable failures.

The v2 artifact preserves the independently reviewed v1 quality, latency,
variance, failure, runtime-source, and owner-manifest values. It refreshes the
input hash to bind the strengthened benchmark engine/runner sources and changes
bytes to version and record the stronger execution attestation contract. The
checked baseline defines two gates:

- Regression: aggregate quality may fall by at most 2 points, any scenario by
  at most 5 points, response-latency p95 must stay within 15% or 250 ms of the
  baseline (whichever is larger), all deterministic invariants must pass, and
  the maximum repeated-judge dimension range is 1.
- Shadow entry: improve aggregate quality by at least 5 points, score every
  scenario at least 75, satisfy the same latency/variance/invariant gates, stay
  within 12 calls and USD 1 for an explicitly opted-in provider run, and have
  product-owner calibration approval.

The recorded latency is derived from synthetic turn timestamps and is not live
provider telemetry. Provider-backed execution is never implicit and is outside
the provider-free CI command. The CLI may read or replace only
`docs/evidence/sav-467-current-interviewer-baseline.json` beneath the resolved
repository root. Absolute, traversal, unrelated, non-regular, and symlink paths
are rejected; replacement uses a same-directory exclusive temporary file,
file/directory sync, and atomic rename.

## Human authority

The four strong/weak calibration pairs contain exactly eight agent-authored
examples. Their status remains
`agent_authored_pending_product_owner_review`. SAV-198 adjudication applies to
candidate feedback scoring and is not evidence of interviewer-quality
adjudication. Only the product owner may record acceptance or rejection of the
eight exact examples identified by the manifest hash; no automated result
authorizes shadow entry, launch, default-on behavior, or Production action.
