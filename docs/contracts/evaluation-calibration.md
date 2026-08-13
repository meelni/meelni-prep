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

## Dimension-coverage calibration

New `feedback.dimension-coverage.v1` evaluation has a separate provider-free
synthetic artifact,
`packages/test-fixtures/src/dimension-coverage-calibration.ts`, versioned as
`dimension-coverage-calibration.v1`. It validates the closed reducer and
integrity boundary for natural spoken answers, punctuation-poor STT, concise
answers, filler, keyword salad, prompt injection, off-topic prose, sparse
coverage, and complete coverage in all four rounds. The answer-block suite also
verifies identical coverage, scores, mode, citations, and persistence under
1/2/5/10 equivalent event segmentation.

This deterministic suite makes no provider call, uses no credentials, and
contains only fully synthetic candidate text. The legacy Feedback v2 paid-run
authorization and score-band corpus below do not authorize a provider run for
the new v3 prompt/rubric. Any future live v3 calibration remains separately
owner-authorized.

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

Every current command emits `evaluation-calibration-report.v10` JSON with:

- execution kind, evaluator model, repetition count, and paid-provider status;
- gold-set, adjudication, schema, prompt, and rubric versions;
- corpus counts and preflight failures;
- evidence, insufficient-session, score-band, and repeated-run metrics;
- score-band agreement broken out by dimension, round, and completion state;
- configured expected model identity and the model identities observed in
  evaluator results;
- the thresholds used for that report;
- separate deterministic, live-provider, and calibration-evidence gate states;
- a semantic-review state and sanitized semantic-report hash/count binding;
- case-level failure codes and unresolved blockers.

Live `evaluation_provider_invocation_failed` failure records may include only
the bounded `providerDiagnostic` object. It contains a normalized `kind` such
as `provider_bad_request`, `provider_authentication`, `provider_permission`,
`provider_not_found`, `provider_unprocessable`, `provider_rate_limited`,
`provider_timeout`, `provider_network`, `provider_aborted`,
`provider_server_error`, or `provider_unknown`, plus a numeric `httpStatus`
when the SDK exposed one. It must never include raw provider messages, request
bodies, response bodies, object paths, headers, prompt text, transcript text, or
credentials. Older v10 reports without this object remain valid but less
diagnostic.

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

Version 9 preserves the v8 evidence-only
`calibrationEvidenceAcceptance` name and adds `pending_semantic_review` plus a
`semanticReview` object. A live automated result can never be durable `passed`
before semantic review: the runner atomically publishes `pending`, then replaces
that report with `passed` or `failed` only after the complete independent review
is bound. This field says only whether the complete calibration evidence
contract passed. It neither records nor authorizes the product owner's launch
decision.

The committed version-7 reports under `docs/evidence/` are immutable historical
receipts and remain byte-for-byte unchanged. When reading a v7 report, interpret
its `gate.launchAcceptance` value as the historical name for v9
`gate.calibrationEvidenceAcceptance`; never interpret it as owner launch GO or
NO-GO. Current writers must emit v10 and must not recreate the v7 field.

An `evaluation_provider_returned_invalid_feedback` failure additionally carries
`feedbackRejectionCode`, a member of the closed
`feedback-v2-rejection.v1` taxonomy. It identifies only the violated invariant;
the report never receives the parser message, object path, unknown key,
provider response, or parser cause. Missing, forged, mutable, proxied, or
unrecognized classifications normalize to `parser_internal_failure`.

The provider adapter authenticates the classification with a module-private
error-to-code association. The report boundary reads that association directly
instead of trusting public property access. Runtime error logs retain only the
existing sanitized provider failure identity and safe metadata. A rejection
code never changes provider usage, observed model/service-tier reconciliation,
exact known cost, or the fail-closed stop reason.

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
| Repetitions per scored case                     |       exactly 2 |
| Maximum provider calls                          |              96 |
| Maximum cumulative paid-run spend               |           $3.00 |

Canonical adjudicated evidence-anchor agreement remains required at 100% for
the deterministic regression harness and is reported separately from basic
evidence validity. For a live run, non-canonical evidence never passes
automatically, but it may remain eligible for the complete two-panel semantic
review when every other automated threshold passes. Only unanimous review of
every exact response can resolve those mismatches. Per-dimension floors prevent
a scorer from sacrificing one entire rubric dimension while passing the pooled
80% boundary. Round and completion-state floors expose localized regressions.

Anchor agreement requires the same finding kind, rubric dimension, and user
turn reference. The returned exact transcript quote may be wider than the
approved quote, but it must contain the complete approved anchor. A different
grounded phrase, a shorter fragment that omits any part of the anchor, another
kind, another dimension, or another turn does not match. This remains a
canonical regression gate rather than proof that the approved pair exhausts
every semantically legitimate finding. The provider-free SAV-250 audit in
`docs/evidence/sav-250-adjudicated-evidence-anchor-audit.md` found defensible
alternative feedback in every scored transcript; arbitrary alternatives remain
review-required instead of being accepted as “any grounded quote.”

Any live attempt to accept non-canonical but potentially legitimate output must
satisfy `evaluation-output-semantic-adjudication.v1`, documented in
`evaluation-output-semantic-adjudication.md`. That provider-free contract binds
the exact run, corpus, prompt/schema, model, response set, and every response
hash to two independent unanimous agent panels with null human identity. It
forbids reviewer prose and fails closed on hash/coverage mutations,
contradictory decisions, disagreement, and unreviewed alternatives. Its public
report contains only hashes, closed decisions, aggregate counts, and opaque
output IDs. It is not a v4 authorization and cannot reinterpret the terminal
SAV-248 result.

Every out-of-band score records case, run, dimension, actual score, and expected
band. Every unstable dimension records case, run, dimension, actual score, and
observed range. Model mismatches record both configured expectation and observed
result identity.

For live runs, `execution.modelVersion` must be the pinned snapshot
`gpt-5.1-2025-11-13`; moving aliases and unknown models fail before call one.
`evaluation-calibration-pricing.v1` binds that model to
`https://api.openai.com/v1`, the explicit `default` service tier, zero SDK
retries, and redirect rejection. It records the Standard pricing re-verified
against the official model page at `2026-07-25T17:20:00.000Z`: $1.25 per
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

The current non-executable v6 proposal contains exactly 64 calls: two symmetric runs for
each of the 32 scored fixtures. Its deterministic worst-case reservation is
2,308,945,000 nano-USD ($2.308945), below the unchanged $3 hard cap. The
current feedback prompt makes the former 96-call reservation exceed $3, so it
is not authorized. The proposal hash is
`89d5570217306df00d9f09b009c0cbc8737b23b82ec900ce81e6f730c0e7a1c1`.
It binds request-policy hash
`5da35139f3f910970f9f60bf699168604eae592ebd621d212f4959b6bbae866a`
and the terminal v1/v2/v3/v4 authorities, but its authorization status is pending and
its reviewed source commit is null. The existing ≤96/$3 approvals were consumed
by historical attempts and cannot authorize v7. A future exact owner
approval must bind the final post-merge commit and a freshly priced regenerated
plan before any credential or provider boundary can open. The executable
runtime independently resolves the canonical repository, requires `HEAD` to
equal that reviewed commit, hashes every tracked working-tree blob directly
against the reviewed `HEAD` tree even when Git index flags hide changes, and
requires a completely clean tracked and untracked worktree before it can emit
readiness. The credential-bearing process is a checked-in, reproducible ESM
bundle, not `tsx` or mutable `node_modules`; its exact bytes, size, build
contract, package-lock digest, platform, architecture, Node version, and
built-in-only external imports are recorded in
`docs/evidence/sav-248-v11-runtime-manifest.json` and verified before spawn.

Proposed live v7 responses use the strict `feedback-provider-response-format.v1` JSON
schema. The scorer rejects refusals, incomplete finish states, and malformed
schema output. It passes the exact UTF-8 bytes of the decoded provider message
content to the authenticated private capture before JSON parsing; these are not
the raw HTTP response body bytes. Capture failure stops the run without retrying
or discarding known provider usage. The automated v10 report is atomically
published as `pending_semantic_review` before review starts, then atomically
replaced with passed or failed after semantic finalization.

Every live invocation must preflight one private capture directory plus six new,
pairwise-distinct file paths: automated report, review request, panel A, panel
B, independent execution authority, and sanitized semantic report. Every file
parent and the capture must be owner-owned `0700`, outside Git, and canonical;
files must be `0600`, absent, regular, and non-symlinked. After all 64 responses
are captured and all non-canonical automated thresholds pass, the same process
binds the response-set and review-input hashes, writes the request, and waits in
one combined loop for two decision-only panel files plus the separately trusted
operator authority. Panels cannot self-assert task or execution identity. Only
unanimous complete decisions can publish the sanitized report; acceptance or
rejection first publishes a content-free semantic report with a conservative
`rawCaptureDeleted: false` state. The exact semantic-adjudication hash and the
exact legitimate-alternative output IDs are then bound into a terminal v10
report. Only after that terminal report is synced does the workflow delete the
authenticated raw capture and update the deletion bit. Timeout, unsafe or
malformed input, disagreement, normal exceptions, SIGINT, or SIGTERM atomically
downgrade an already-pending v10 report to terminal failure before cleanup. If
terminal publication itself fails, the capture is retained. A crash after
terminal publication may leave the deletion bit conservatively false, but
cannot leave the v10 report pending without also retaining capture. SIGKILL and
host crashes cannot guarantee deletion; the retention window covers the
worst-case 64 five-minute requests, the full review timeout, and ten minutes of
overhead for operator/watchdog purge.

## Paid-run authorization and ledger contract

There is no approved v7 spend. The proposal in
`docs/evidence/sav-248-v11-paid-run-authorization-proposal.json` records at most
96 provider calls/physical attempts and $3 using synthetic or separately
approved fixtures, but explicitly records pending owner approval, null approval
source/date, and null reviewed source commit. The executable path rejects it
before readiness, credential delivery, GitHub access, or provider access. The
live CLI accepts neither an arbitrary run ID nor an operator-selected ledger
path, so a process cannot mint another budget.

The executable handoff is a separate
`meelni.evaluation-calibration-owner-authorization.v1` JSON envelope stored
outside every repository worktree. It must be an owner-owned, single-link,
regular, non-symlink file with mode `0600` and at most 64 KiB. The only accepted
decision is `APPROVE_BOUNDED_PAID_CALIBRATION` from owner `saviii` with role
`human_product_owner`; `ownerLaunchDecision` must remain null. Its Ed25519
signature is domain-separated by the contract identifier and verified against
an active public key in `config/evaluation-calibration-owner-keys.json`. That
registry contains public verification material only; private signing material
must never enter source, chat, environment files, logs, or generated evidence.
The registry alone is not approval evidence: no artifact can become executable
until a fresh exact owner authorization is signed outside Git and verified
against the final post-merge source commit, regenerated plan, and current
pricing/runtime hashes.

The signed payload binds one new `sav248_v11_auth_` authorization ID, the exact 40-character
reviewed source commit, exact regenerated plan hash, equal planned provider-call
and physical-attempt counts, exact worst-case nano-USD, the 96-call/attempt and
$3 ceilings, one aggregate run, synthetic or separately approved fixtures only,
no customer transcripts, no Production data, and explicit non-reusability of
both terminal predecessor authorities. It is valid for at most 30 minutes. The
issue time must use a whole-second boundary because it also determines the Git
authorization commit identity. The runtime rejects unknown fields,
stale/future artifacts, revoked or out-of-window
keys, signature/key mismatches, copied unverified authorization objects, and any
source, plan, call-count, or spend drift before GitHub access. A v1/v2/v3/v4/v5/v6/v7/v8/v9/v10 artifact
or run ID cannot satisfy this contract.

The supported owner handoff is
`npm run calibration:owner-authorization -- prepare|sign|verify`. That helper
is provider-free and ledger-free: it derives the exact signed payload and
sanitized verification report, but it cannot execute model calls, activate the
protected GitHub ref, touch Production data, or encode a launch decision. The
separate production-action owner tooling signs a different contract and is not
valid for calibration spend approval.

The durable authority is the protected payload-free Git ref in the fixed
private GitHub repository `meelni/meelni-prep` (repository ID `1089904588`,
organization owner ID `302571838`):
`refs/heads/meelni-ledger/sav-248-authorized-paid-calibration.v11`. Before call
one, a future reviewed CLI would require that ref to point to the final
authorization's deterministic genesis commit. The current proposal-only OID is
`a3b92bcbb243e1331c8b63aa96ea09e47f159ad0`; it must not be created and will
change when the authorization/source/pricing binding changes. The final
zero-parent tree must be empty and its complete message and identity encode the
authorization. It creates
a unique empty-tree activation
child containing only authorization, plan-hash, and activation metadata, then
performs a GitHub REST ref update with `force: false`. Concurrent children share
the authorized parent, so only one update can fast-forward and every loser
refuses execution.
An activated head cannot be activated a second time or mint another budget. A
restart, crash, missing local cache, or local state reset may resume it only via
the delegated-agent retry contract after a previous terminal v10 report proves
zero completed calls and zero reconciled actual spend. Any non-zero prior
completion or actual spend, malformed ledger history, changed activation head,
or wider delegated cap fails closed. Any additional run still requires a new
owner authorization and reviewed code change.

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
For a future authorized run, the product owner must provide the same exact
40-character reviewed commit through
`MEELNI_CALIBRATION_REVIEWED_SOURCE_COMMIT`. Before executing the bootstrap,
the trusted launcher disables Git replacement objects, requires actual `HEAD`
to equal that commit, and hashes the launcher, bootstrap, startup verifier,
runtime manifest, bundle, and package lock directly against their reviewed Git
blobs. It copies the verified bootstrap, verifier, manifest, bundle, and lock
into a private owner-only snapshot and rechecks their blobs before execution.
The launcher also requires the Node 22.22.0 arm64 executable to match SHA-256
`913b144fdb40638b1acef7974ab3c33fbd527cc0974cb5da467ab1e6ac51b4d4`
and the Node.js Foundation Developer ID (`HX7739G8FX`), and requires GitHub CLI
2.96.0 to match SHA-256
`02d2d4a85241c6a8c0b77ebb1ec76fc723caf7fb128e00915b306b968847cba1`.
Both binaries are copied into the same private snapshot, reverified, and only
the sealed copies execute. This closes executable substitution while the exact
binary identities remain part of reviewed source,
closing coherent bundle/manifest substitution and hash-to-spawn replacement.
The sealed bootstrap attests empty `execArgv`, verifies the exact standalone
runtime bundle contract, and launches that sealed bundle with a minimal
credential-free environment and no package loader. The runtime loads exactly
one private external authorization path: either the human-owner envelope for
first activation or a delegated-agent retry artifact plus a previous terminal
report for zero-spend resume. It validates executable authority, the exact plan
or protected activated ledger binding, the directly hashed reviewed Git
checkout, and private paths before it emits runtime readiness.
Only then does the bootstrap relay the exact readiness handshake over the
private status pipe; the outer launcher derives and transmits credentials over
a separate private pipe afterward. The runtime repeats its environment
attestation before GitHub client construction and every authority request. Any additional
preload/import, inspector, debugger, TLS-keylog, OpenSSL/custom-CA, proxy,
profiler, coverage, or endpoint override fails closed. Tokens never enter npm,
argv, logs, reports, environment files, or temporary regular files.
Before activation and every HTTP dispatch it requires two exact active
repository rulesets: deletion/non-fast-forward with no bypass actors, and
creation/update restriction whose sole bypass actor is `saviii` user ID
`24397508`. Repository ownership remains separately bound to the `meelni`
organization and owner ID `302571838`. GitHub's effective branch rules must
expose all four restrictions.
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
The live CLI likewise returns a failure unless
`calibrationEvidenceAcceptance` passes; provider acceptance alone is never a
successful command outcome. CLI success means only that the complete
calibration evidence contract passed. It never represents or authorizes the
human product owner's launch GO/NO-GO.

## Gate semantics

`preflight` validates the corpus and workflow skip path without an evaluator.
`deterministic_self_test` proves the harness math and contracts with a local,
predictable evaluator. Neither can pass `liveProviderAcceptance` or
`calibrationEvidenceAcceptance`.

Only an explicitly authorized `live_provider` execution can pass calibration
evidence acceptance. A deterministic report must retain an unresolved evidence
gate even when every harness metric is perfect. Until the candidate manifest
receives product-owner/PM signoff, `calibrationEvidenceAcceptance` remains
`pending_adjudication_signoff`. A validated all-approved artifact moves a
non-live report only to `pending_live_provider_run`; a passing live run is still
required. A live execution that misses any threshold must fail rather than
downgrade itself to a self-test. Even a passing evidence field cannot make the
human product owner's launch decision.

The evaluated modes accept exactly two repetitions. The run budget is
validated before evaluator work and rejects any plan above 96 calls. Live mode
also requires a validated, all-approved adjudication artifact before call one;
spend authorization does not substitute for PM/product-owner adjudication.
