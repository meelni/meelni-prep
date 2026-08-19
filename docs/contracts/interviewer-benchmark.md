# Interviewer Benchmark Contract

SAV-467 defines a versioned, fully synthetic benchmark for the quality of the
authenticated PM interviewer. It evaluates interviewer behavior only. It must
never produce or influence a candidate scorecard, coach the candidate, or add
mid-session evaluation to the live runtime.

## Versioned boundaries

- Scenario: `interviewer-benchmark-scenario.v1`
- Judge request: `interviewer-quality-judge-request.v1`
- Judge output: `interviewer-quality-judge-output.v1`
- Rubric: `pm-interviewer-quality-rubric.v1`
- Suite: `meelni.interviewer-benchmark-suite.v1`
- Baseline: `meelni.current-interviewer-baseline.v1`
- Report: `meelni.interviewer-benchmark-report.v1`

`@meelni/agent` owns the scenario, invariant, judge, and provider-adapter
contracts. `@meelni/test-fixtures/interviewer-benchmark` owns only synthetic
fixture data and frozen provider-free replay output. The local runner composes
those boundaries without importing provider SDKs.

All external judge output is decoded with exact keys, all ten dimension scores
are integers from zero through four, and the overall score is derived from the
dimension total. Scenario/seed mismatches, unknown evidence turn IDs, malformed
usage, and provider budget overruns fail the run closed.

## Coverage and invariants

The v1 catalog contains one complete session for product sense, execution,
strategy, and behavioral rounds. Together they exercise strong, shallow,
rambling, contradictory, silent, interrupting, and time-consuming candidate
behavior. The deterministic layer separately rejects coaching, mid-session
evaluation, multiple substantive questions in one turn, repeated probes,
speech begun at/after the deadline, and speech after a close.

The quality judge scores question relevance, depth, evidence targeting,
redundancy, one-question discipline, no coaching/evaluation, challenge
calibration, round progression, time management, and graceful close. Candidate
behavior is context for adaptation, never the object being scored.

## Reproducibility and gates

The provider-free baseline uses seeds `17`, `43`, and `89`. It reports the
runtime source hash, fixture/output input hash, report hash, quality distribution,
synthetic response-latency distribution, judge latency, provider calls, actual
cost, variance, invariant results, and turn-grounded actionable failures.

The checked baseline defines two gates:

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
the provider-free CI command.

## Human authority

The four strong/weak calibration pairs contain exactly eight agent-authored
examples. Their status remains
`agent_authored_pending_product_owner_review`. SAV-198 adjudication applies to
candidate feedback scoring and is not evidence of interviewer-quality
adjudication. Only the product owner may record acceptance or rejection of the
eight exact examples identified by the manifest hash; no automated result
authorizes shadow entry, launch, default-on behavior, or Production action.
