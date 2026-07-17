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
must approve or explicitly delegate review of these candidates in a separate
`evaluation-adjudication-approval.v2` JSON file. That approval contains the
manifest/corpus hashes, versions, reviewer authority/role, review time, an
independent exact-hash review attestation, and one decision per scored case.
For delegated review, generate the hash-bound approval and resolved manifest:

```bash
npm run calibration:adjudication-approval -- \
  --output docs/evidence/sav-198-adjudication-approval.json
npm run calibration:adjudication-manifest -- \
  --approval docs/evidence/sav-198-adjudication-approval.json \
  --output docs/evidence/sav-198-adjudication-review-manifest.json
```

The delegated artifact uses the canonical non-human task-thread identity,
records a null human reviewer identity, and requires exactly two distinct
32/32 exact-hash agent-panel approvals. Its scope is semantic adjudication
only; it does not authorize paid/provider/ledger/Production work or launch.

The eight insufficient fixtures are separately enforced validator negatives,
not scored adjudication candidates. They have no score bands or findings;
preflight requires all eight to skip evaluation and make zero provider calls.

## Authorized live-provider run

Do not run this step without explicit authorization for provider spend and
confirmation that the intended model/configuration is the one being evaluated.
The accepted plan evaluates 32 scored synthetic transcripts twice, for exactly
64 planned model calls. The eight insufficient transcripts are expected to make
zero model calls. The existing authorization remains capped at 96 physical
attempts and $3 total estimated committed spend, but it does not expand the
accepted 64-call plan. The runner stops before any call whose worst-case
reservation could exceed the remaining spend cap.

The explicit SAV-198 spend approval is committed as
`docs/evidence/sav-198-paid-run-authorization.json`. It authorizes exactly one
aggregate run, `sav-198-authorized-paid-calibration.v1`; it is not a renewable
96-call allowance for each invocation. The CLI has no run-ID or ledger-path
override. Spend authorization permits the bounded paid run only after the
separate candidate adjudication is approved; it does not approve those semantic
judgments itself.

The paid launcher never loads `.env.local` and has no npm script. It retrieves
the OpenAI key from the macOS Keychain service
`meelni-calibration-openai`; add or rotate that item through Keychain Access,
not a shell argument, environment variable, repository file, or chat message.

The launcher pins `OPENAI_FEEDBACK_MODEL=gpt-5.1-2025-11-13` in the minimal
attested runtime environment. That exact snapshot is bound to the repository's
reviewed `evaluation-calibration-pricing.v1` contract; a moving alias or any
other model fails before call one. The pricing contract was
re-verified against the official OpenAI GPT-5.1 model page at
`2026-07-16T23:54:50.000Z` and uses Standard rates of $1.25/M uncached input,
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

Generate and verify the delegated acceptance of the exact rebased plan:

```bash
npm run calibration:plan-acceptance -- \
  --approval docs/evidence/sav-198-adjudication-approval.json \
  --output docs/evidence/sav-198-rebased-plan-acceptance.json
```

The expected plan is 64 physical calls (two symmetric runs for each of 32
scored fixtures), 2,052,925,000 nano-USD ($2.052925) worst case, and hash
`53e88d34564efe1a869acf6a3464ee024b7e298955ac2b17be89510b75250fa0`.
The former 96-call plan exceeds the $3 reservation under the current feedback
prompt and is not authorized. Treat any other value as stale or mismatched.
This acceptance remains within the existing $3 authorization and does not
activate the ledger or authorize a provider call.

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
repository: meelni/meelni-prep (1089904588)
organization owner: meelni (302571838)
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

The trusted shell launcher invokes the fixed `/opt/homebrew/bin/gh auth token
--hostname github.com` command only after the credential-free bootstrap
attests and returns its exact readiness handshake. The runtime then calls only
`api.github.com:443` through Node HTTPS, using bundled TLS roots, standard
hostname verification and SNI, redirect rejection, a ten-second timeout, and a
1 MiB response limit. The
production path exposes no alternate base URL, dispatcher, client, agent, DNS,
remote, or ledger path. It accepts only `GITHUB_TOKEN`; ambient GitHub
host/config, Unix-socket, proxy, custom-CA, and TLS override variables fail
closed before every request. The executable POSIX launcher starts the absolute
fnm Node 22.22.0 runtime under `env -i`, with no tokens, preload flags, debug
state, proxy configuration, or TLS overrides. The bootstrap attests empty
`execArgv` and returns `MEELNI_CALIBRATION_READY_V1` over a private FIFO
before the launcher derives or transmits either credential over a second
mode-0600 FIFO. It then permits only the exact resolved
repository-pinned tsx 4.23.0 preflight and loader arguments. It rejects extra
preloads/imports, inspector/debugger flags, TLS key logging, OpenSSL config,
custom CA, profiler, coverage, proxy, and endpoint overrides before credential
delivery, again before client construction, and again before every
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

Do not run this command under shell tracing (`set -x`); the launcher rejects
xtrace. Do not export `GITHUB_TOKEN` or `OPENAI_API_KEY`: the launcher
rejects both so they cannot appear in inherited process environments. It
sanitizes PATH and provider configuration, derives the short-lived GitHub token
through the authenticated GitHub CLI, and reads the OpenAI key from Keychain
only after readiness. Run it directly:

```bash
MEELNI_ALLOW_PAID_CALIBRATION=I_UNDERSTAND_THIS_CALLS_A_PAID_MODEL \
  ./scripts/run-evaluation-calibration-live.sh \
  --approval /secure/path/evaluation-adjudication-approval.json \
  --output /tmp/meelni-calibration-live.json
```

The launcher sends credentials only through the private pipe after the exact
handshake, never through argv, logs, reports, environment files, or temporary
regular files. It requires a validated, all-approved adjudication artifact.
Spend approval does not approve the candidate gold set. The acknowledgement is
deliberately exact so an ambient boolean cannot accidentally enable paid
calibration.

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
  stopping. It has `completed_plan` only after all 64 planned calls reconcile
  successfully.
- The cost report uses `evaluation-calibration-cost-report.v5`, the report uses
  `evaluation-calibration-report.v7`, and the fixed run, authorization ID, and
  authorization hash match the committed spend-authorization manifest.
- The activated plan reports exactly 64 calls and at most $3 worst-case, the
  activation commit remains the protected ref head, and each reservation has
  exactly one successful physical-dispatch boundary. A second or concurrent
  boundary attempt is counted, rejected before transport, and does not increase
  the physical HTTP-attempt ceiling.
- `observedServiceTiers` contains only `default` for a passing run. A missing or
  different returned tier stops after the first affected call.
- Evidence validity, adjudicated evidence match, and insufficient handling are
  all 100%.
- An adjudicated match may quote a wider exact span from the same user turn,
  but it must preserve the complete approved anchor plus the approved finding
  kind and dimension. Do not reinterpret another grounded phrase as an
  automatic semantic match; follow the SAV-250 audit boundary.
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
case/run/dimension failure records. For invalid-feedback failures, use only the
closed `feedbackRejectionCode` to identify the failed invariant. Do not add raw
provider output, parser messages or causes, transcript text, evidence text,
unknown keys, object paths, or customer data to a report, log, PR, or ticket. A
`parser_internal_failure` requires a provider-free parser investigation before
any new authorization. Update the evaluator or adjudication deliberately, and
obtain a separate new authorization before any paid retry.
The activated SAV-198 run never resumes.
