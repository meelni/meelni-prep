# Evaluation Calibration Runbook

## Safe local checks

Validate the corpus, validator classifications, evidence anchors, and
insufficient-session workflow without invoking an evaluator:

```bash
npm run calibration:preflight
```

Exercise the complete report and threshold calculations with the deterministic
local evaluator:

```bash
npm run calibration:self-test
```

Write either machine-readable report to a chosen path with:

```bash
npm run calibration:preflight -- --output /tmp/meelni-calibration-preflight.json
npm run calibration:self-test -- --output /tmp/meelni-calibration-self-test.json
```

These modes make no model or database calls. A green deterministic self-test
proves only the harness; its live-provider and launch gates remain pending.

Review the agent-authored candidate adjudications separately:

```bash
npm run calibration:adjudication-manifest -- \
  --output docs/evidence/sav-198-adjudication-review-manifest.json
```

The manifest contains the exact strength and improvement evidence, observation,
dimension, and next step for all 32 scored cases. A product owner or PM reviewer
must approve or correct these candidates in a separate
`evaluation-adjudication-approval.v1` JSON file. That approval contains the
manifest/corpus hashes, versions, reviewer identity/role, review time, and one
decision per scored case. Neither the candidate manifest, deterministic harness,
nor a live model run counts as signoff. No approval artifact is committed while
SAV-198 review remains pending.

The eight insufficient fixtures are separately enforced validator negatives,
not scored adjudication candidates. They have no score bands or findings;
preflight requires all eight to skip evaluation and make zero provider calls.

## Authorized live-provider run

Do not run this step without explicit authorization for provider spend and
confirmation that the intended model/configuration is the one being evaluated.
The approved run evaluates 32 scored synthetic transcripts three times, for up
to 96 model calls. The eight insufficient transcripts are expected to make zero
model calls. Three repetitions, 96 calls, and $3 total estimated committed
spend are hard maximums. The runner stops before any call whose worst-case
reservation could exceed the remaining spend cap.

The explicit SAV-198 spend approval is committed as
`docs/evidence/sav-198-paid-run-authorization.json`. It authorizes exactly one
aggregate run, `sav-198-authorized-paid-calibration.v1`; it is not a renewable
96-call allowance for each invocation. The CLI has no run-ID or ledger-path
override. Spend authorization permits the bounded paid run only after the
separate candidate adjudication is approved; it does not approve those semantic
judgments itself.

`calibration:live` loads `.env.local` through `tsx --env-file=.env.local`, just
like other local feedback tooling. Run `npm run setup:local` first if the file
does not exist. Keep both the provider key and model configuration only in that
gitignored file.

Set `OPENAI_FEEDBACK_MODEL=gpt-5.1-2025-11-13`. That exact snapshot is bound to
the repository's reviewed `evaluation-calibration-pricing.v1` contract; a
moving alias or any other model fails before call one. The pricing contract was
re-verified against the official OpenAI GPT-5.1 model page at
`2026-07-12T06:28:08.000Z` and uses Standard rates of $1.25/M uncached input,
$0.125/M cached input, and $10/M output tokens. The review is valid for only 24
hours. Refresh the reviewed timestamp in code only after rechecking the official
page; stale or future-dated reviews fail before call one. A pricing change
requires a reviewed code change, not an environment override.

Unset `OPENAI_BASE_URL` completely. Paid calibration rejects even an ambient
override equal to the official URL. Its client pins `https://api.openai.com/v1`,
requests the `default` service tier, sets SDK retries to zero, and rejects HTTP
redirects. It accepts no operator-supplied client or endpoint and pins a
five-minute request timeout. Each reserved logical call therefore permits at
most one physical HTTP attempt.

Before activation, the CLI precomputes every permitted call's conservative
input ceiling plus at most 2,000 completion tokens and refuses unless the whole
plan is at most 96 calls and $3 worst-case. The one-time Git activation burns
that complete plan. A custom guarded fetch revalidates the fixed GitHub
repository, effective protection, activated ref, and pricing immediately at
actual transport dispatch, then atomically consumes a single-use boundary.
Re-entry increments the boundary-attempt count but is rejected before HTTP.
Provider usage reconciles
the reservation to actual cost. Missing/malformed usage or provider failure
stops the run and forbids another call; unresolved spend retains its full
worst-case reservation. Valid usage above a reservation is charged at its exact
known actual cost before stopping. An unavoidable provider-reported total above
$3 is exposed as a breached cap and exact cost, never concealed by retaining a
smaller reservation. The report exposes attempted/completed calls and reserved,
reconciled, unresolved, and estimated committed costs.
It also preserves provider-reported model/tier identities and observed token
totals on failed or mismatched responses. Valid in-reservation usage is
reconciled to known cost before the identity failure stops the run; absent,
invalid usage retains the reservation.

### Durable single-run GitHub activation

Paid execution remains disabled until repository owners configure the two
exact active repository rulesets below for:

```text
refs/heads/meelni-ledger/sav-198-authorized-paid-calibration.v1
```

1. `Meelni SAV-198 calibration ledger immutable`: exact ref include, no
   excludes, no bypass actors, with `deletion` and `non_fast_forward` rules.
   With no bypass, administrators remain subject to both invariants.
2. `Meelni SAV-198 calibration activation actor`: the same exact ref include,
   no excludes, `creation` and `update` restrictions, and exactly one `always`
   bypass actor: GitHub user `saviii` (`24397508`). The independent immutable
   ruleset still prevents that actor from deleting or force-updating the ref.

The runtime also requires GitHub's effective branch-rule endpoint to return
`creation`, `update`, `deletion`, and `non_fast_forward`. Configure and verify
both rulesets before creating the ref. This PR intentionally does not create,
configure, query, or activate the real ledger ref during tests.

After both rulesets are active, create the initial commit through GitHub REST
with these exact immutable fields:

```text
repository: saviii/meelni-prep (1089904588)
tree: 4b825dc642cb6eb9a060e54bf8d69288fbee4904
parents: []
author/committer: Meelni Calibration Authorization <calibration-ledger@meelni.invalid>
author/committer date: 2026-07-12T08:00:00.000Z
message: exact calibrationAuthorizationCommitMessage() output
expected commit: 5db3fdc9a4d9bd8b57619db03f4a4193d1b9637a
```

Use `gh api --hostname github.com` against the fixed repository to create only
that commit object. Verify the returned SHA before using the create-reference
endpoint once for the exact ledger ref. Do not use local `git push`, `origin`, a
push URL, or a repository redirect for seeding. Then verify repository and
viewer IDs, both detailed rulesets, all four effective branch rules, the exact
ref SHA, and the genesis payload before enabling the paid command.

The live CLI does not invoke `gh`. It calls only `api.github.com:443` through
Node HTTPS, using bundled TLS roots, standard hostname verification and SNI,
redirect rejection, a ten-second timeout, and a 1 MiB response limit. The
production path exposes no alternate base URL, dispatcher, client, agent, DNS,
remote, or ledger path. It accepts only `GITHUB_TOKEN`; ambient GitHub
host/config, Unix-socket, proxy, custom-CA, and TLS override variables fail
closed before every request. `npm run calibration:live` uses a dedicated Node
22 bootstrap with empty `execArgv`, then permits only the exact resolved
repository-pinned tsx 4.23.0 preflight and loader arguments. It rejects extra
preloads/imports, inspector/debugger flags, TLS key logging, OpenSSL config,
custom CA, profiler, coverage, proxy, and endpoint overrides before reading
either token, again before client construction, and again before every
authority request. The CLI then repeats the identity/protection
checks, builds and hashes the approved plan, creates a unique empty-tree
activation child, and updates the ref with `force: false`. Concurrent sibling
activations allow exactly one winner; the loser refuses before provider work.

An activated ref is terminal even when the process crashes before call one.
There is no stale recovery or resume: all unused pre-reserved capacity is burned,
and a new paid run requires separate owner authorization plus a reviewed code
change. Missing/deleted refs and changed activation heads fail closed. Local
reports or caches may be deleted without affecting authority and must never
contain prompts, transcripts, provider bodies, API keys, customer data, or
Production data.

Derive the short-lived GitHub credential without displaying or pasting it. Do
not run this command under shell tracing (`set -x`), and do not store the token
in `.env.local`, documentation, reports, chat, or Linear. The live bootstrap
does not load `.env.local`; provide the short-lived keys only through the clean
command environment. Start it with the repository's pinned Node 22 runtime:

```bash
GITHUB_TOKEN="$(gh auth token)" \
env -u GH_CONFIG_DIR -u GH_HTTP_UNIX_SOCKET -u GH_HOST \
  -u GITHUB_API_URL -u GITHUB_GRAPHQL_URL -u GITHUB_SERVER_URL \
  -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u NO_PROXY \
  -u http_proxy -u https_proxy -u all_proxy -u no_proxy \
  -u OPENAI_BASE_URL \
  -u NODE_DEBUG -u NODE_DEBUG_NATIVE -u NODE_EXTRA_CA_CERTS \
  -u NODE_OPTIONS -u NODE_TLS_REJECT_UNAUTHORIZED \
  -u NODE_USE_ENV_PROXY -u NODE_USE_SYSTEM_CA -u NODE_V8_COVERAGE \
  -u OPENSSL_CONF -u SSLKEYLOGFILE -u SSL_CERT_FILE -u SSL_CERT_DIR \
  MEELNI_ALLOW_PAID_CALIBRATION=I_UNDERSTAND_THIS_CALLS_A_PAID_MODEL \
  npm run calibration:live -- \
  --approval /secure/path/evaluation-adjudication-approval.json \
  --output /tmp/meelni-calibration-live.json
```

Command substitution captures `gh auth token` directly into the child
environment; it must not be echoed or logged. The command also requires
`OPENAI_API_KEY` to already exist in that clean shell environment and a
validated, all-approved
adjudication artifact. Spend approval does not approve the candidate gold set.
Never paste a key into chat,
documentation, Linear, or a report. The acknowledgement is deliberately exact
so an ambient boolean cannot accidentally enable paid calibration.

The live CLI exits zero only when the combined `launchAcceptance` gate is
`passed`. A provider-quality pass still exits nonzero when adjudication approval
is missing, stale, incomplete, or contains `changes_required` decisions.
Review the report's model and all five version fields before accepting it as
evidence. Store approved launch evidence in the release record without adding
secrets or provider responses containing sensitive data.

## Review checklist

- `customerDataUsed` is `false`.
- Corpus totals are 40 overall, 32 scored, and 8 insufficient, with 10 cases per
  round.
- Expected-state mismatches and invalid gold anchors are zero.
- Provider calls are zero for preflight and deterministic modes. In a live run,
  attempted and completed calls are reported separately and can be fewer than
  96 when a fail-closed stop occurs.
- The cost report names the pinned pricing contract, never exceeds 96 attempted
  calls or 96 physical HTTP attempts. It ordinarily remains at or below $3
  estimated committed spend; if valid provider usage unexpectedly exceeds its
  reservation, it records exact actual cost and `spendCapBreached: true` before
  stopping. It has `completed_plan` only after all 96 calls reconcile
  successfully.
- The cost report uses `evaluation-calibration-cost-report.v5`, the report uses
  `evaluation-calibration-report.v6`, and the fixed run, authorization ID, and
  authorization hash match the committed spend-authorization manifest.
- The activated plan reports 96 or fewer calls and at most $3 worst-case, the
  activation commit remains the protected ref head, and each reservation has
  exactly one successful physical-dispatch boundary. A second or concurrent
  boundary attempt is counted, rejected before transport, and does not increase
  the physical HTTP-attempt ceiling.
- `observedServiceTiers` contains only `default` for a passing run. A missing or
  different returned tier stops after the first affected call.
- Evidence validity, adjudicated evidence match, and insufficient handling are
  all 100%.
- Pooled and per-dimension score-band agreement are at least 80%; each round and
  completion state is at least 75%.
- Maximum repeated-run score range is at most 1.
- Every output model identity matches the configured expected model and the
  observed identities are reviewed.
- Report versions match the code intended for launch.
- `launchAcceptance` is `passed`; a deterministic `passed` state is not enough.
- Adjudication acceptance records completed product-owner/PM signoff; candidate
  status is never treated as ground truth.
- Candidate and corpus hashes match the separately stored approval artifact,
  and all 32 scored-case decisions are approved.
- The report contains no prompt text, transcript text, provider body, secret,
  or Production/customer-data payload.

If a live run fails or crashes, keep the launch gate closed. Inspect available
case/run/dimension failure records, update the evaluator or adjudication
deliberately, and obtain a separate new authorization before any paid retry.
The activated SAV-198 run never resumes.
