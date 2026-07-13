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
`pm-gold-set.v4` and `pm-gold-adjudication-candidates.v4`. This version contains
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

Every command emits `evaluation-calibration-report.v7` JSON with:

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
`evaluation-calibration-cost-report.v5` object with the fixed authorized run,
Git activation commit, exact activated-plan hash and worst-case reservation,
logical calls, every physical-request boundary attempt, the physical
HTTP-attempt ceiling,
completed calls, cumulative worst-case reservations, reconciled actual cost,
unreconciled reservation cost, estimated committed cost, the deterministic stop
reason, spend-cap-breach state, and the exact reviewed
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

Before call one, the runner computes all 96 or fewer permitted case/run keys,
their conservative input ceilings, and their 2,000-token completion ceilings.
It validates that the complete plan's worst-case cost is at most $3 and binds
that plan to the approved corpus, adjudication, model, endpoint, tier, and
pricing hashes in a one-time Git activation. Activation burns the whole plan;
a crash cannot resume or restore unused capacity. Each in-process call must
match one activated plan entry. A guarded custom fetch rechecks the canonical
GitHub repository identity, active no-bypass protection, activated ref, and a
fresh pricing clock at actual transport dispatch before it consumes the
reservation's single-use boundary. Re-entry is counted and rejected before
HTTP. Successful responses must include
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

The durable authority is the protected payload-free Git ref in the fixed
private GitHub repository `saviii/meelni-prep` (repository ID `1089904588`):
`refs/heads/meelni-ledger/sav-198-authorized-paid-calibration.v1`. Before call
one, the CLI requires that ref to point to deterministic genesis commit
`5db3fdc9a4d9bd8b57619db03f4a4193d1b9637a`, whose zero-parent tree is empty
and whose complete message and identity encode this authorization. It creates
a unique empty-tree activation
child containing only authorization, plan-hash, and activation metadata, then
performs a GitHub REST ref update with `force: false`. Concurrent children share
the authorized parent, so only one update can fast-forward and every loser
refuses execution.
An activated head is terminal: a restart, crash, missing local cache, or local
state reset cannot reopen it. Any additional run requires a new owner
authorization and reviewed code change.

The production authority uses Node HTTPS directly against the fixed
`api.github.com:443` endpoint. It accepts only `GITHUB_TOKEN`, uses Node's
bundled TLS roots with standard hostname verification and SNI, disables
connection-agent reuse and redirects, and bounds request time and response
size. It has no production client, dispatcher, base-URL, agent, DNS, remote, or
ledger-location injection seam. Local Git remotes, push URLs, URL rewrites,
`gh` configuration, and environment-selected ledger locations are never
authority. Ambient GitHub host/config, proxy, custom-CA, or TLS override
variables fail before every authority request, and neither their values nor the
token can enter errors or calibration reports.
The paid command starts through an executable POSIX launcher that uses `env
-i` and the absolute fnm Node 22.22.0 runtime without either provider token.
The bootstrap attests empty `execArgv`, emits the exact readiness handshake
over a private status pipe, and only then accepts the credentials through a
separate private pipe. It launches only the repository-pinned tsx 4.23.0
preflight and loader arguments with a minimal environment. The runtime repeats that attestation
before GitHub client construction and every authority request. Any additional
preload/import, inspector, debugger, TLS-keylog, OpenSSL/custom-CA, proxy,
profiler, coverage, or endpoint override fails closed. Tokens never enter npm,
argv, logs, reports, environment files, or temporary regular files.
Before activation and every HTTP dispatch it requires two exact active
repository rulesets: deletion/non-fast-forward with no bypass actors, and
creation/update restriction whose sole bypass actor is `saviii` user ID
`24397508`. GitHub's effective branch rules must expose all four restrictions.
Missing protection or a missing/deleted ref is an operational launch blocker.
The activation tree and local report/cache
contain no prompt, transcript, provider body, API key, or customer/Production
payload. Local files are never spend authority.

## Approval artifact contract

Approval is a separate `evaluation-adjudication-approval.v2` JSON artifact. The
runtime parses it before evaluator work and requires:

- an independent exact-hash review attestation for
  `evaluation-adjudication-review.v2`;
- the exact candidate-manifest SHA-256 and substantive-corpus SHA-256;
- matching gold-set and adjudication versions;
- reviewer identity and `product_owner` or `pm_reviewer` role;
- a valid `reviewedAt` timestamp;
- exactly one `approved` or `changes_required` decision for each of the 32
  scored candidate IDs.

Missing, stale, malformed, duplicate, or incomplete approval fails closed. The
candidate source and manifest cannot declare themselves approved. The v4
manifest records the product-owner-delegated two-panel review, its
`changes_required` result, and the conservative 17-case correction union. That
provenance is not human approval and remains pending independent review of the
exact regenerated hashes. The current repository intentionally commits no
approval artifact or reviewer identity.
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
