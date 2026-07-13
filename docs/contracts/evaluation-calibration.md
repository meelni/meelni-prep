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

An `evaluation_provider_returned_invalid_feedback` failure additionally carries
`feedbackRejectionCode`, a member of the closed
`feedback-v2-rejection.v1` taxonomy. This field identifies the rejected parser
invariant without retaining the parser error, object path, unknown key,
evidence text, or provider response. Missing, forged, mutable, or unrecognized
values normalize to `parser_internal_failure`.

The provider adapter authenticates this diagnostic with a module-private
error-to-code association and exposes it through a non-configurable accessor.
Constructing or mutating an exported provider error cannot mint an allowlisted
parser classification. The report boundary queries the private association
directly rather than trusting public property access, so a proxy cannot mint a
classification either.

Live provider adapters may preserve only these closed, sanitized response
failure categories in `failures[].code`:

- `evaluation_provider_refused`;
- `evaluation_provider_incomplete`;
- `evaluation_provider_content_filtered`;
- `evaluation_provider_unexpected_finish`;
- `evaluation_provider_returned_no_content`;
- `evaluation_provider_returned_invalid_json`;
- `evaluation_provider_returned_invalid_feedback`;
- `evaluation_provider_usage_missing`;
- `evaluation_provider_invocation_failed`.

Refusal and non-stop finish categories are inspected before response content;
their raw refusal or partial content is never persisted. These categories,
no-content, invalid-JSON, and invalid-feedback responses carry provider usage,
model, and service-tier identity when those values were returned, so their
known cost is reconciled before the run stops. Missing-usage and invocation
failures retain the uncertain reservation and use the fail-closed
`missing_provider_usage` spend stop. At the report boundary, any unknown,
forged, mutable, provider-supplied, or otherwise unrecognized error value maps
to `evaluation_failed`. Raw messages, causes, response content, and parser
details other than the closed rejection code never enter the report. The
rejection code does not change usage reconciliation, observed model/service-tier
identity, or the fail-closed stop.

The OpenAI adapter requests `feedback-provider-response-format.v1` through
strict JSON Schema structured output. Every object is closed and requires all
declared fields. The schema constrains exact contract versions, the requested
evaluation state, scalar types, and finding shape using a conservative strict
subset. The adapter accepts content only when the provider returns the exact
`stop` finish reason; missing, null, unknown, or other terminal values fail into
a closed sanitized category.
The provider-neutral parser remains authoritative for transcript ownership,
exact quote grounding, reference/evidence equality, cross-finding uniqueness,
version/state checks, non-empty strings, collection bounds, score/confidence
ranges, score arithmetic, and customer-language normalization.
The format version plus its exact full/partial serialization has a deterministic
SHA-256 contract identity for binding into any future activated plan.

SAV-198's one-time activation is consumed and predates this strict response
format. It remains immutable historical evidence and is not silently rebased.
The distinct SAV-248 v2 authorization and accepted plan bind the strict-format
hash and both exact serialized schemas, include the applicable serialized
schema bytes in every input ceiling, and set a 1,800-token output ceiling. The
complete 96-call worst case is 2,853,997,500 nano-USD ($2.8539975), below the
$3 hard cap. Paid execution remains fail closed until the separate v2 protected
ledger ref and both exact no-bypass rulesets are provisioned and verified.

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

Anchor agreement requires the same finding kind, rubric dimension, and user
turn reference. The returned exact transcript quote must contain the complete
approved anchor, so quoting the surrounding source sentence does not create a
false mismatch. A different grounded phrase, a shorter fragment that omits any
part of the anchor, another kind, another dimension, or another turn does not
match. This is deliberately a canonical regression gate, not proof that the
approved pair exhausts every semantically legitimate finding. The provider-free
SAV-250 audit in `docs/evidence/sav-250-adjudicated-evidence-anchor-audit.md`
found defensible alternative feedback in all 32 transcripts. Arbitrary
alternatives remain review-required rather than being accepted as “any grounded
quote.”

Every out-of-band score records case, run, dimension, actual score, and expected
band. Every unstable dimension records case, run, dimension, actual score, and
observed range. Model mismatches record both configured expectation and observed
result identity.

For live runs, `execution.modelVersion` must be the pinned snapshot
`gpt-5.1-2025-11-13`; moving aliases and unknown models fail before call one.
`evaluation-calibration-pricing.v1` binds that model to
`https://api.openai.com/v1`, the explicit `default` service tier, zero SDK
retries, and redirect rejection. It records the Standard pricing re-verified
against the official model page at `2026-07-13T11:13:07.000Z`: $1.25 per
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
their conservative strict-format input ceilings, and their 1,800-token
completion ceilings.
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

The accepted v2 plan contains exactly 96 calls with a deterministic worst-case
reservation of 2,853,997,500 nano-USD ($2.8539975), below the $3 hard cap. Its
exact plan hash is
`354bdc4046b0759e50940127c574abe355ee0754d9a8aaf2c25338b49aca8419`.
It binds response-format contract hash
`66605edf2b3cad146671f22afa656d9c01c9abea2e7475a68dbe21738c8e4073`,
the exact full/partial serialized formats (2,424/2,430 bytes), their individual
SHA-256 identities, and the 1,800-token output ceiling.

## Paid-run authorization and ledger contract

The approved spend is one aggregate run, not a reusable per-process allowance.
`docs/evidence/sav-248-paid-run-authorization.json` binds it to
`sav-248-authorized-paid-calibration.v2`, at most 96 provider calls and physical
attempts, and at most $3 of committed spend using synthetic or separately
approved fixtures only. The live CLI accepts neither an arbitrary run ID nor an
operator-selected ledger path, so a new process cannot mint another budget.
This spend authorization is independent of, and does not replace, the semantic
adjudication approval described below.

The durable authority is the protected payload-free Git ref in the fixed
private GitHub repository `saviii/meelni-prep` (repository ID `1089904588`):
`refs/heads/meelni-ledger/sav-248-authorized-paid-calibration.v2`. Before call
one, the CLI requires that ref to point to deterministic genesis commit
`73064d382c37335e4d2bd895954aeb83ce5e768e`, whose zero-parent tree is empty
and whose complete message and identity encode this authorization. It creates
a unique empty-tree activation
child containing only authorization, plan-hash, and activation metadata, then
performs a GitHub REST ref update with `force: false`. Concurrent children share
the authorized parent, so only one update can fast-forward and every loser
refuses execution.
An activated head is terminal: a restart, crash, missing local cache, or local
state reset cannot reopen it. Any additional run requires a new owner
authorization and reviewed code change.

The prior SAV-198 v1 ref, genesis
`5db3fdc9a4d9bd8b57619db03f4a4193d1b9637a`, activation
`4acdf549eecad5fe88d685c28fbc98d7475b8f05`, and plan hash
`22a0f4da11a7dd5c618f39fdd187b40fe8d17807b0404407c95c5dec16172804`
remain consumed historical evidence and are never accepted as v2 authority.

The SAV-248 v2 ref is also terminal historical evidence after activation
`d0c4fc4c028b10d8616fdde337be150315a7798c`. Its sanitized report records two
attempted synthetic calls, one completed call, $0.026752 exact reconciled cost,
zero unresolved reservation, `provider_failure`, and failed live/launch gates.
The v2 authority cannot resume or authorize a retry.

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
- reviewer authority and `product_owner` or `pm_reviewer` role; delegated
  task-thread authority must use the canonical non-human identity, declare a
  null human reviewer identity, and include exactly two distinct exact-hash
  agent-panel signoffs;
- a valid `reviewedAt` timestamp;
- exactly one `approved` or `changes_required` decision for each of the 32
  scored candidate IDs.

Missing, stale, malformed, duplicate, or incomplete approval fails closed. The
immutable candidate payload cannot approve itself. The committed approval
artifact records the product owner's explicit task-thread delegation, the
17-case and 4-case correction rounds, and two independent 32/32 exact-hash
agent-panel approvals of the final candidate. It uses no fabricated human
identity and is scoped only to semantic adjudication. Paid execution, authority
activation, pricing freshness, provider acceptance, and launch remain separate
gates.
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
