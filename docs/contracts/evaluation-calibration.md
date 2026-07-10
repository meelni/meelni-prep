# Evaluation Calibration

## Purpose

The calibration suite measures whether the versioned PM feedback evaluator is
grounded, appropriately handles insufficient sessions, agrees with adjudicated
score bands, and remains stable across repeated runs. It uses only fully
synthetic transcripts. It is not a substitute for post-launch monitoring or a
claim about real customer outcomes.

The suite exercises the production boundaries introduced by SAV-196 and
SAV-197:

1. `calculateValidatedSessionFromTurns` decides whether a transcript is full,
   partial, or insufficient.
2. `generateFeedbackWorkflow` fences and persists each generation attempt.
3. `parseFeedbackV2` validates the returned schema and requires every evidence
   quote to be exact transcript text from the referenced user turn.

No calibration path connects to the application database.

## Gold-set contract

`packages/test-fixtures/src/evaluation-calibration.ts` owns
`pm-gold-set.v2` and `pm-gold-adjudication.v2`. This version contains 40
fully synthetic cases:

- 10 Product Sense;
- 10 Execution;
- 10 Strategy;
- 10 Behavioral.

Each round contains eight scored cases and two insufficient cases. Its scored
cases include two weak, two average, and four strong but still sufficient
answers. Every dimension therefore has weak, average, and strong adjudicated
bands in every round. The cases cover full and partial completion states. The
negative cases cover both short and low-signal transcripts and must be skipped
before evaluator invocation.

Every case records:

- synthetic provenance;
- round and expected completion state;
- gold-set, adjudication, feedback schema, prompt, and rubric versions;
- dimension score bands for scored cases;
- adjudicated strength and improvement anchors using exact user-turn text;
- contract-v2 transcript events with stable IDs and timestamps.

A fixture change that alters expected state, evidence, or score bands requires
a new adjudication review. A behaviorally incompatible corpus change requires
a new gold-set or adjudication version rather than silently rewriting the old
baseline.

## Report contract

Every command emits `evaluation-calibration-report.v2` JSON with:

- execution kind, evaluator model, repetition count, and paid-provider status;
- gold-set, adjudication, schema, prompt, and rubric versions;
- corpus counts and preflight failures;
- evidence, insufficient-session, score-band, and repeated-run metrics;
- score-band agreement broken out by dimension, round, and completion state;
- configured expected model identity and the model identities observed in
  evaluator results;
- the thresholds used for that report;
- separate deterministic, live-provider, and launch gate states;
- case-level failure codes and unresolved blockers.

Evaluator calls and paid-provider calls are separate metrics. A deterministic
self-test reports its local evaluator invocations but must always report zero
provider calls.

The acceptance thresholds are:

| Metric                                          |       Threshold |
| ----------------------------------------------- | --------------: |
| Valid evidence against exact transcript text    |            100% |
| Insufficient sessions skipped before evaluation |            100% |
| All dimension scores inside adjudicated bands   |    at least 80% |
| Each individual dimension inside its bands      |    at least 80% |
| Each round inside its bands                     |    at least 75% |
| Each completion state inside its bands          |    at least 75% |
| Repeated-run range for every dimension          | at most 1 point |
| Evaluator model identity matches expectation    |            100% |
| Repetitions per scored case                     |       exactly 3 |
| Maximum provider calls                          |              96 |

Adjudicated evidence-anchor agreement is also required at 100%. It is reported
separately from basic evidence validity so a provider cannot pass merely by
citing some valid but irrelevant transcript text. Per-dimension floors prevent
a scorer from sacrificing one entire rubric dimension while passing the pooled
80% boundary. Round and completion-state floors expose localized regressions.

Every out-of-band score records case, run, dimension, actual score, and expected
band. Every unstable dimension records case, run, dimension, actual score, and
observed range. Model mismatches record both configured expectation and observed
result identity.

For live runs, `execution.modelVersion` is the configured expected model and
`modelVersionBasis` says `configured_provider_model`; that value alone is not
provider proof. The OpenAI adapter records the API response's `model` value on
each validated output, and the report lists those values in
`observedModelVersions`. Acceptance requires every observed value to match the
configured expectation. Deterministic runs use an explicit local identifier.

## Gate semantics

`preflight` validates the corpus and workflow skip path without an evaluator.
`deterministic_self_test` proves the harness math and contracts with a local,
predictable evaluator. Neither can pass `liveProviderAcceptance` or
`launchAcceptance`.

Only an explicitly authorized `live_provider` execution can pass launch
acceptance. A deterministic report must retain
`launchAcceptance: pending_live_provider_run`, even when every harness metric
is perfect. A live execution that misses any threshold must fail rather than
downgrade itself to a self-test.

The evaluated modes accept exactly three repetitions. The run budget is
validated before evaluator work and rejects any plan above 96 calls, so a CLI
typo cannot create unbounded provider spend.
