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
`pm-gold-set.v3` and `pm-gold-adjudication-candidates.v3`. This version contains
40
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
- a truthful observation and specific next step for every evidence anchor;
- contract-v2 transcript events with stable IDs and timestamps.

A fixture change that alters expected state, evidence, or score bands requires
a new adjudication review. A behaviorally incompatible corpus change requires
a new gold-set or adjudication version rather than silently rewriting the old
baseline.

These are agent-authored synthetic adjudication candidates, not human-reviewed
ground truth. Every scored case has a genuine evidenced strength and a specific
improvement grounded in a minimal exact substring of the substantive answer.
`npm run calibration:adjudication-manifest` emits the compact 32-case candidate
manifest. It contains no mutable approval flag.

The eight insufficient fixtures are validator policy negatives: they prove that
short and low-signal sessions are skipped before scoring. They have no score
bands or scored findings, so they are not part of the 32-case semantic approval
artifact. Their expected state and zero-call behavior remain enforced by the
gold-set preflight and 100% insufficient-handling threshold.

## Report contract

Every command emits `evaluation-calibration-report.v6` JSON with:

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

Live reports also include `execution.cost`, an
`evaluation-calibration-cost-report.v3` object with the fixed authorized run
and authorization identities, logical calls, the physical HTTP-attempt ceiling,
completed calls, cumulative worst-case reservations, reconciled actual cost,
unreconciled reservation cost, estimated committed cost, the deterministic stop
reason, spend-cap-breach state, resumed-call count, and the exact reviewed
pricing contract. Preflight and deterministic self-test reports set
`execution.cost` to `null`.

Reports contain aggregate metrics, case IDs, version identifiers, and failure
codes only. They never contain prompts, transcript text, provider response
content, API keys, or provider error bodies.

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
| Maximum cumulative paid-run spend               |           $3.00 |

Adjudicated evidence-anchor agreement is also required at 100%. It is reported
separately from basic evidence validity so a provider cannot pass merely by
citing some valid but irrelevant transcript text. Per-dimension floors prevent
a scorer from sacrificing one entire rubric dimension while passing the pooled
80% boundary. Round and completion-state floors expose localized regressions.

Every out-of-band score records case, run, dimension, actual score, and expected
band. Every unstable dimension records case, run, dimension, actual score, and
observed range. Model mismatches record both configured expectation and observed
result identity.

For live runs, `execution.modelVersion` must be the pinned snapshot
`gpt-5.1-2025-11-13`; moving aliases and unknown models fail before call one.
`evaluation-calibration-pricing.v1` binds that model to
`https://api.openai.com/v1`, the explicit `default` service tier, zero SDK
retries, and redirect rejection. It records the Standard pricing re-verified
against the official model page at `2026-07-12T06:28:08.000Z`: $1.25 per
million uncached input tokens, $0.125 per million cached input tokens, and $10
per million output tokens. The review expires after 24 hours; future-dated or
stale review timestamps fail before call one.
`modelVersionBasis` says `configured_provider_model`; configuration alone is
not provider proof. The OpenAI adapter records the API response's `model` value
on each validated output, and the report lists those values in
`observedModelVersions`. Acceptance requires every observed value to match the
pinned expectation. Live reports preserve every provider-reported model and
service-tier identity, including identities returned with invalid or failed
responses. Deterministic runs use an explicit local identifier.

Before each provider invocation, the runner reserves a worst-case cost using a
conservative input-token ceiling and a 2,000 completion-token limit and commits
that reservation to the durable run ledger. A call is not made when its
reservation could put estimated committed spend above $3. The runner reads a
fresh clock at reservation time and again through a callback immediately before
the physical HTTP request; crossing the 24-hour pricing expiry during request
preparation therefore stops before HTTP. Successful responses must include
internally consistent usage, and the reservation is then reconciled to actual
uncached, cached, and output token usage. Missing or malformed usage and provider
failure stop the run before another call and retain the uncertain reservation.
Valid usage above a reservation is charged at its exact known actual cost before
the run stops. If that unavoidable provider-reported cost exceeds $3, the report
truthfully sets `spendCapBreached` and records the amount rather than hiding it
behind the reservation.

The paid client rejects any ambient `OPENAI_BASE_URL`, accepts no injected
client, pins the official endpoint, requests `service_tier: "default"`, uses a
five-minute request timeout, disables SDK retries, and rejects HTTP redirects.
One fully reserved logical call can therefore create at most one physical HTTP
attempt; the 96-call cap is also a 96-attempt cap. Missing or non-default
returned tier fails after at most one call. When a mismatched model/tier response
includes valid usage, the report preserves its identity and token totals,
reconciles known cost, and then stops. Only absent or invalid usage retains an
unresolved worst-case reservation.

## Paid-run authorization and ledger contract

The approved spend is one aggregate run, not a reusable per-process allowance.
`docs/evidence/sav-198-paid-run-authorization.json` binds it to
`sav-198-authorized-paid-calibration.v1`, at most 96 provider calls and physical
attempts, and at most $3 of committed spend using synthetic or separately
approved fixtures only. The live CLI accepts neither an arbitrary run ID nor an
operator-selected ledger path, so a new process cannot mint another budget.
This spend authorization is independent of, and does not replace, the semantic
adjudication approval described below.

The live CLI holds an exclusive 20-minute lease and stores
`evaluation-calibration-run-checkpoint.v1` under
`~/.local/state/meelni/evaluation-calibration/`. Checkpoints are atomically
written and fsynced before HTTP is permitted. They bind the fixed authorization
hash and preserve every reservation, attempted call key, provider-attempt
boundary, reconciled cost, and terminal stop. A concurrent process is rejected.
After a crash, stale-lock recovery preserves the checkpoint; previously
attempted call keys are never replayed and unresolved reservations remain
committed. A terminal run cannot be reopened. Checkpoints and leases contain no
prompt, transcript, response body, API key, or customer/Production payload.

## Approval artifact contract

Approval is a separate `evaluation-adjudication-approval.v1` JSON artifact. The
runtime parses it before evaluator work and requires:

- the exact candidate-manifest SHA-256 and substantive-corpus SHA-256;
- matching gold-set and adjudication versions;
- reviewer identity and `product_owner` or `pm_reviewer` role;
- a valid `reviewedAt` timestamp;
- exactly one `approved` or `changes_required` decision for each of the 32
  scored candidate IDs.

Missing, stale, malformed, duplicate, or incomplete approval fails closed. The
candidate source and manifest cannot declare themselves approved. The current
repository intentionally commits no approval artifact or reviewer identity.
The live CLI likewise returns a failure unless the combined launch gate passes;
provider acceptance alone is never a successful command outcome.

## Gate semantics

`preflight` validates the corpus and workflow skip path without an evaluator.
`deterministic_self_test` proves the harness math and contracts with a local,
predictable evaluator. Neither can pass `liveProviderAcceptance` or
`launchAcceptance`.

Only an explicitly authorized `live_provider` execution can pass launch
acceptance. A deterministic report must retain
an unresolved launch gate even when every harness metric is perfect. Until the
candidate manifest receives product-owner/PM signoff, launch acceptance remains
`pending_adjudication_signoff`. A validated all-approved artifact moves a
non-live report only to `pending_live_provider_run`; a passing live run is still
required. A live execution that misses any threshold must fail rather than
downgrade itself to a self-test.

The evaluated modes accept exactly three repetitions. The run budget is
validated before evaluator work and rejects any plan above 96 calls. Live mode
also requires a validated, all-approved adjudication artifact before call one;
spend authorization does not substitute for PM/product-owner adjudication.
