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
proves only the harness; its live-provider and calibration-evidence gates
remain pending.

## V3 synthetic-output semantic review

The SAV-248 v9 live launcher integrates the semantic-review contract in
`docs/contracts/evaluation-output-semantic-adjudication.md`. The private-run
boundary must hash raw synthetic output byte-for-byte and emit only the trusted
hash manifest. Separately, a trusted operator/orchestrator must construct the
authority envelope from the approved plan, complete expected opaque case/run
inventory, exact run/response-set/review-input hashes, and two verified panel
execution receipts. Reviewer artifacts cannot construct or replace this
out-of-band authority. Keep raw output outside the repository and public
evidence.

Two independently receipted agent task paths must review the same manifest and
record only closed per-output decisions. Pass the manifest, both panel
artifacts, and the separately trusted authority envelope to
`validateSemanticAdjudication`; publish only its sanitized report. Stop
without a report if it rejects a hash, coverage, identity, prose, consistency,
alternative-review, or agreement invariant. A report with `gate: failed` is
terminal rejection evidence for that response set.

The launcher captures the exact UTF-8 bytes of the decoded provider message
content before JSON parsing. It atomically persists a v9 automated report in
`pending_semantic_review`, then waits for two decision-only panel files plus a
separate operator-authored execution-authority file. Semantic review grants no
provider access or spend authority. The current v9 artifacts are deliberately
non-executable proposals; a fresh exact owner authorization, reviewed post-merge
source commit, refreshed pricing review, and protected GitHub ledger would all
be required before any paid run.

### Provider-free capture and retention

Use `calibration-semantic-capture.ts` only from a trusted local operator or
orchestrator boundary. Initialize a new absolute capture directory; the
workflow creates it as `0700`, stores its private manifest and every exact
response byte sequence as `0600`, and generates random opaque case/output IDs.
The canonical parent must already exist and must not be inside a Git worktree,
including through a symlink.
The private manifest binds the approved plan, corpus, prompt, response schema,
model, run, and complete hashed case/run inventory. Finalization requires one
and only one byte-exact output for every expected case/run and rechecks every
file hash before review and publication. The issued process capability also
anchors the directory device/inode, randomized case/output identities, every
captured response hash, lifecycle state, and the finalized response-set and
review-input hashes; a self-consistent rewritten manifest is not authority.

Run two actual, distinct agent review tasks against the same finalized private
capture. The orchestrator—not either reviewer artifact—constructs one
content-free execution receipt for each completed task and then a separate
trusted-execution authority. The constructor is a trust-boundary formatter and
hash binder, not cryptographic proof that a task ran; the operator must verify
the canonical task path and execution event before calling it. Never construct
authority from panel-authored JSON or invent a human reviewer identity.

`publishPrivateSemanticReviewBeforeTerminalReport` delegates decisions to the
SAV-251 validator. It writes only a mode-`0600`, sanitized, content-free report
for either unanimous acceptance or unanimous rejection, initially with
`rawCaptureDeleted: false`. It also requires the exact opaque outputs marked
`reviewed_legitimate` to equal the automated report's unique canonical-evidence
mismatches; a count-only or unrelated alternative cannot convert a mismatch to
a pass. The runner hashes only the immutable semantic-adjudication section,
atomically replaces the pending v9 report with passed or failed, and verifies
that exact terminal file before `completePrivateSemanticReviewAfterTerminalReport`
may delete the private directory. It then atomically updates the semantic
report to `rawCaptureDeleted: true`. Failure before terminal v9 publication
preserves the capture. Failure or crash after terminal publication can leave
the deletion bit conservatively false but cannot revert terminal evidence.
Invalid, disagreeing, or malformed review input publishes no semantic result;
the live runner atomically records terminal v9 failure before authenticated
cleanup. Public report paths inside the private capture are forbidden,
including paths whose existing parent resolves through a symlink into that
directory.

The issued capture handle is an opaque, module-authenticated, same-process
capability. Reconstructed, spread, serialized, or post-restart handles are not
accepted. The process running this workflow must either complete or explicitly
clean up before exit. An operator/watchdog in that same process must schedule
`purgeExpiredPrivateSemanticCapture`; expiry blocks capture, finalization, and
completion, while authenticated cleanup/purge remains available even when the
private manifest is corrupt. Cleanup and purge refuse to delete if the issued
directory path now resolves to a different device/inode. This flow does not
claim crash-surviving automatic deletion. A future restart-capable workflow
would require a separate durable authenticated capability design, not a plain
serialized handle.

The capture and adjudication helpers are testable without a provider. During
any future authorized v9 run they may receive only synthetic/approved fixture output;
they must never receive Production or customer data, reuse a terminal v1/v2
authority, or imply provider acceptance or launch approval.

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
Any delegated retry must resume only a previously owner-activated ledger ref
and must preserve the original spend, source, and report boundaries.

The eight insufficient fixtures are separately enforced validator negatives,
not scored adjudication candidates. They have no score bands or findings;
preflight requires all eight to skip evaluation and make zero provider calls.

## Proposed live-provider run (not authorized)

Do not run this step. The current code intentionally fails before the readiness
handshake or credential delivery because no fresh v9 spend authorization exists.
The proposal evaluates 32 scored synthetic transcripts twice, for exactly 64
planned model calls. The eight insufficient transcripts are expected to make
zero model calls. Its proposed envelope remains at most 96 physical attempts and
$3 total estimated committed spend, but those numbers are not an authorization.
The v1 and v2 refs are terminal historical authorities and cannot be reused.

The repository contains the fail-closed verifier for a future external owner
handoff. It does not contain an approval: the public-key registry at
`config/evaluation-calibration-owner-keys.json` contains only reviewed public
verification material, no signed v9 envelope exists, and private signing
material must never be placed in Git, chat, environment files, logs, or
generated evidence. Rotating or enrolling another owner public key requires a
reviewed source change and runtime-bundle regeneration.

`docs/evidence/sav-248-v9-paid-run-authorization-proposal.json` truthfully
records `pending_explicit_product_owner_approval`, null authorization source and
date, and a null `reviewedSourceCommit`. It cannot authorize a provider request,
GitHub mutation, or credential delivery. Before any future run, the product
owner must approve one exact post-merge source commit and a regenerated plan
after the official pricing review is refreshed. The signed approval remains an
external input; the historical pending proposal remains non-executable evidence
and historical approval for v1/v2 cannot be reused.

The executable handoff must not trust `reviewedSourceCommit` as data alone.
Before readiness, the runtime resolves the repository containing its source,
compares the actual 40-character `HEAD` to the approved commit, independently
hashes every tracked working-tree blob against the `HEAD` tree, and rejects any
tracked, staged, or untracked worktree change. This direct content check also
rejects changes hidden by Git `assume-unchanged` or `skip-worktree` flags.
Launcher owner/mode checks do not satisfy this source-binding requirement.

The future owner envelope must be an absolute path outside every repository
worktree, owned by the invoking user, mode `0600`, one hard link, a regular
non-symlink file, and no larger than 64 KiB. It uses contract
`meelni.evaluation-calibration-owner-authorization.v1` and an Ed25519 signature
over the UTF-8 bytes of the contract name, one NUL byte, and the repository's
canonical JSON serialization of `payload`. The signature key ID must select one
active public key in the reviewed registry. The payload includes only the human
product-owner approval decision—not a launch decision—and binds the exact
source commit, plan hash, planned call/attempt count, worst-case nano-USD,
96-call/attempt and $3 ceilings, synthetic-only fixture policy, no customer or
Production data, and all non-reusable predecessor authorities. Issue and
expiry timestamps must be canonical ISO strings, the issue time must be on a
whole-second boundary, and the lifetime must be no longer than 30 minutes.

Prepare the later handoff in this order: merge the reviewed public-key/runtime
and fresh-pricing source; select one new `sav248_v9_auth_` identifier plus the
issue/expiry window; build the v9 authorization request from those fixed values;
regenerate the exact plan against that authorization and merged commit; place
its hash/count/cost in the outer payload; then have the human product owner sign
that exact payload outside Git. Any change to source, authorization metadata,
plan, count, or cost requires a new envelope. The verifier brands the parsed
authorization in memory; copying or reconstructing its fields does not preserve
authority.

When a previous lane has already activated or failed and a later source change
promotes the executable lane, do not reapply or regenerate the older lane's
GitHub rulesets. First confirm `origin/main`, the run ID, ruleset names, and
ledger ref suffix all match the current source. Historical lane rulesets remain
evidence for predecessor authorities; duplicating them by name creates
ambiguous guardrail state and does not authorize the newer run.

Use the provider-free owner helper for that external handoff. It derives and
verifies only the calibration-specific
`meelni.evaluation-calibration-owner-authorization.v1` contract; it does not
call the provider, mutate the GitHub ledger, touch Production data, or make a
launch decision.

```bash
npm run calibration:owner-authorization -- prepare \
  --adjudication-approval docs/evidence/sav-198-adjudication-approval.json \
  --authorization-id sav248_v9_auth_<32 lowercase hex characters> \
  --reviewed-source-commit <final reviewed 40-character source commit> \
  --signing-key-id meelni-owner-2026-07 \
  --issued-at <whole-second ISO timestamp> \
  --ttl-minutes 30 \
  --output-path /secure/external/path/sav-248-v9-owner-authorization-request.json

npm run calibration:owner-authorization -- sign \
  --payload-path /secure/external/path/sav-248-v9-owner-authorization-request.json \
  --artifact-path /secure/external/path/sav-248-v9-owner-authorization.json \
  --key-id meelni-owner-2026-07 \
  --private-key-path /secure/external/path/meelni-owner-private-key.pem

npm run calibration:owner-authorization -- verify \
  --artifact-path /secure/external/path/sav-248-v9-owner-authorization.json \
  --adjudication-approval docs/evidence/sav-198-adjudication-approval.json \
  --reviewed-source-commit <final reviewed 40-character source commit> \
  --output-path /secure/external/path/sav-248-v9-owner-authorization-report.json
```

The private key and signed artifact paths must be absolute paths outside every
repository worktree, regular non-symlink files, owned by the invoking user,
mode `0600`, single-link, and at most 64 KiB. The sanitized verification report
contains hashes, counts, cost ceilings, and genesis metadata only; it records
`providerCallsExecuted: false`, `ledgerActivated: false`, and
`launchAuthorized: false`.

Local calibration bundle construction and verification first run
`npm run runtime:check`, which requires the exact version in `.node-version`
(`22.22.0`). This prevents a wrong host runtime from producing or verifying a
bundle and then failing later inside security attestation. The package engine
remains `22.x` for supported Vercel patch updates; it does not replace the
privileged launcher's independently reviewed binary digest and signature pin.

The live child does not execute through `tsx` or import from mutable
`node_modules`. `npm run calibration:build-runtime` reproducibly bundles the
complete 363-input runtime into
`scripts/generated/run-evaluation-calibration.bundle.mjs`; only Node built-ins
remain external. `npm run calibration:verify-runtime` must reproduce the exact
tracked bundle and `docs/evidence/sav-248-v9-runtime-manifest.json`. Before
spawning the child, the credential-free bootstrap checks the bundle's regular
file identity, ownership, link count, mode, byte length, SHA-256, package-lock
SHA-256, Node version, platform, and architecture. A dependency or source
change therefore requires a reviewed bundle/manifest regeneration before a
future exact owner authorization.

A future authorized invocation must export
`MEELNI_CALIBRATION_REVIEWED_SOURCE_COMMIT` as the exact owner-approved merged
commit alongside the separately required paid-run acknowledgement. The launcher
consumes and unsets that value before bootstrap. It runs system Git with an
empty environment and `GIT_NO_REPLACE_OBJECTS=1`, requires actual `HEAD` to
match, and compares the raw working bytes of the launcher, bootstrap, startup
verifier, manifest, bundle, and package lock to the corresponding blobs in that
commit. It then copies every post-launch artifact into the private launcher
directory, changes each copy to owner-read-only, rechecks the copies against the
same commit, and executes only that sealed snapshot. Any absent, wrong, dirty,
coherently replaced, hard-linked, or mid-copy artifact fails before bootstrap
readiness and before GitHub or Keychain credential retrieval. The current
proposal has no approved source commit, so do not set this variable or attempt
the live command yet.

The same pre-secret step pins the full Node 22.22.0 arm64 binary SHA-256 to
`913b144fdb40638b1acef7974ab3c33fbd527cc0974cb5da467ab1e6ac51b4d4`
and verifies its Node.js Foundation Developer ID team `HX7739G8FX`. It pins
GitHub CLI 2.96.0 SHA-256 to
`02d2d4a85241c6a8c0b77ebb1ec76fc723caf7fb128e00915b306b968847cba1`.
The launcher copies both binaries into the private snapshot, changes them to
owner-executable/read-only, repeats the digest/signature checks, and uses only
those sealed copies. Upgrading Node or `gh` requires a reviewed digest change,
bundle reproduction, and a new exact authorization; never weaken this to a
version-string or `PATH` check.

The paid launcher never loads `.env.local` and has no npm script. It retrieves
the OpenAI key from the macOS Keychain service
`meelni-calibration-openai`; add or rotate that item through Keychain Access,
not a shell argument, environment variable, repository file, or chat message.
Before preparing a short-lived owner or delegated retry artifact, run the
non-spending provider preflight:

```bash
npm run calibration:provider-preflight
```

This command reads only the `meelni-calibration-openai` Keychain item and makes
one read-only model lookup against the pinned OpenAI model. It redacts the
credential, rejects ambient `OPENAI_API_KEY` or `OPENAI_BASE_URL` values because
the live launcher rejects them too, and exits non-zero for missing keys, HTTP
401 authentication failures, inaccessible models, redirects, stale pricing
review timestamps, or network timeouts. A passing provider preflight is not
calibration evidence and does not authorize launch; it only proves the next
authorized calibration attempt is unlikely to fail before call one because of
local provider credential setup.

The launcher pins `OPENAI_FEEDBACK_MODEL=gpt-5.1-2025-11-13` in the minimal
attested runtime environment. That exact snapshot is bound to the repository's
reviewed `evaluation-calibration-pricing.v1` contract; a moving alias or any
other model fails before call one. The current proposal's pricing contract was
re-verified against the official OpenAI GPT-5.1 model page at
`2026-07-24T17:17:35.000Z` and uses Standard rates of $1.25/M uncached input,
$0.125/M cached input, and $10/M output tokens. The review is valid for only 24
hours and is not expected to remain current through merge. Refresh the reviewed
timestamp in code only after rechecking the official page, then regenerate the
plan proposal before requesting exact owner authorization. Stale or future-dated
reviews fail before call one. A pricing change requires a reviewed code change,
not an environment override.

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

Generate and verify the non-executable v9 proposal:

```bash
npm run calibration:plan-proposal -- \
  --approval docs/evidence/sav-198-adjudication-approval.json \
  --output docs/evidence/sav-248-v9-plan-proposal.json
```

The current proposal is 64 physical calls (two symmetric runs for each of 32
scored fixtures), 2,432,705,000 nano-USD ($2.432705) worst case, and hash
`543e7eae030a6f5235f6e66812bb1f7554f2aecad0a6cdf63a4181b289c04f94`.
The former 96-call plan exceeds the $3 reservation under the current feedback
prompt and is not authorized. Treat any other value as stale or mismatched.
This proposal additionally pins request-policy hash
`5da35139f3f910970f9f60bf699168604eae592ebd621d212f4959b6bbae866a`
but leaves the reviewed source commit null. A future exact plan must change
after the final source commit and refreshed pricing are bound; treat this
proposal as historical review input, never as an accepted or executable plan.

### Durable single-run GitHub activation

Paid execution remains disabled. Only after the reviewed public-key/runtime and
fresh-pricing source is merged and a fresh exact external authorization is
verified may repository owners configure the two exact active repository
rulesets below for:

```text
refs/heads/meelni-ledger/sav-248-authorized-paid-calibration.v9
```

1. `Meelni SAV-248 v9 calibration ledger immutable`: exact ref include, no
   excludes, no bypass actors, with `deletion` and `non_fast_forward` rules.
   With no bypass, administrators remain subject to both invariants.
2. `Meelni SAV-248 v9 calibration activation actor`: the same exact ref include,
   no excludes, `creation` and `update` restrictions, and exactly one `always`
   bypass actor: GitHub user `saviii`, actor type `User`, user ID `24397508`.
   The independent immutable ruleset still prevents that actor from deleting or
   force-updating the ref.

The runtime also requires GitHub's effective branch-rule endpoint to return
`creation`, `update`, `deletion`, and `non_fast_forward`. Configure and verify
both rulesets before creating the ref. This PR intentionally does not create,
configure, query, or activate the real ledger ref during tests.

Generate the exact non-mutating ruleset payload packet from the reviewed source
instead of reusing ad hoc temporary files:

```bash
npm run calibration:github-guardrails -- \
  --output-dir /secure/external/path/sav-248-v9-github-guardrails
```

The command writes only local JSON payloads and a README with the current source
commit and exact `gh api` apply/verify commands. It does not call GitHub, create
rulesets, create the ledger ref, sign owner authorization, call the provider, or
authorize launch.

The current code computes the following proposal-only genesis. Do not create it.
After a fresh exact external authorization is generated and independently
verified, recompute the final authorization message and OID before any GitHub
mutation:

```text
repository: meelni/meelni-prep (1089904588)
organization owner: meelni (302571838)
tree: 4b825dc642cb6eb9a060e54bf8d69288fbee4904
parents: []
author/committer: Meelni Calibration Authorization <calibration-ledger@meelni.invalid>
author/committer date: 2026-07-18T19:10:00.000Z
message: exact calibrationAuthorizationCommitMessage() output
proposal commit: 3d74d088ae1fd198943a90a8d68857f80236b7cf
```

The final authorized runbook may use `gh api --hostname github.com` against the
fixed repository to create only the recomputed commit object, but only after
separate explicit authority to mutate GitHub. Verify the returned SHA before
using the create-reference endpoint once for the exact ledger ref. Do not use
local `git push`, `origin`, a push URL, or a repository redirect for seeding.

The trusted shell launcher invokes the fixed `/opt/homebrew/bin/gh auth token
--hostname github.com` command only after the credential-free bootstrap has
spawned the runtime and relayed the runtime's exact authorization-ready
handshake. The runtime then calls only
`api.github.com:443` through Node HTTPS, using bundled TLS roots, standard
hostname verification and SNI, redirect rejection, a ten-second timeout, and a
1 MiB response limit. The
production path exposes no alternate base URL, dispatcher, client, agent, DNS,
remote, or ledger path. It accepts only `GITHUB_TOKEN`; ambient GitHub
host/config, Unix-socket, proxy, custom-CA, and TLS override variables fail
closed before every request. The executable POSIX launcher starts the absolute
fnm Node 22.22.0 runtime under `env -i`, with no tokens, preload flags, debug
state, proxy configuration, or TLS overrides. The bootstrap attests empty
`execArgv`, verifies and launches the exact sealed standalone runtime bundle
whose working bytes were first bound to the externally supplied owner-approved
commit, without credentials or a package loader, and waits. The runtime must validate
executable authorization, the exact clean reviewed checkout, and every private
path before writing its internal readiness; only then does the bootstrap return
`MEELNI_CALIBRATION_READY_V1` over a private FIFO. The launcher derives or
transmits either credential only after that point over a second mode-`0600`
FIFO. The bootstrap rejects extra
preloads/imports, inspector/debugger flags, TLS key logging, OpenSSL config,
custom CA, profiler, coverage, proxy, and endpoint overrides before credential
delivery, again before client construction, and again before every
authority request. The CLI then repeats the identity/protection
checks, builds and hashes the approved plan, creates a unique empty-tree
activation child, and updates the ref with `force: false`. Concurrent sibling
activations allow exactly one winner; the loser refuses before provider work.

An activated ref cannot be activated again and cannot mint a new budget. A
bounded delegated retry may resume the already-activated ledger only when a
previous terminal report proves zero completed calls and zero reconciled actual
spend, the delegated artifact is
`meelni.delegated-agent-authorization.v1` with action class
`synthetic_calibration_retry`, and its call/attempt/spend caps cover the exact
ledger plan. The delegated path does not create or update the Git ref, does not
replace human-owner activation authority, and cannot authorize launch,
Production data, customer transcripts, refunds, destructive actions, or wider
provider spend. Missing/deleted refs, changed activation heads, malformed
ledger messages, non-zero prior completed calls, or non-zero prior actual spend
fail closed. Local reports or caches may be deleted without affecting authority
and must never contain prompts, transcripts, provider bodies, API keys,
customer data, or Production data.

Do not run this command under shell tracing (`set -x`); the launcher rejects
xtrace. Do not export `GITHUB_TOKEN` or `OPENAI_API_KEY`: the launcher
rejects both so they cannot appear in inherited process environments. It
sanitizes PATH and provider configuration, derives the short-lived GitHub token
through the authenticated GitHub CLI, and reads the OpenAI key from Keychain
only after readiness. The following is the future invocation shape after the
reviewed source is merged and a fresh exact external authorization is issued;
do not run it against the pending proposal:

```bash
MEELNI_ALLOW_PAID_CALIBRATION=I_UNDERSTAND_THIS_CALLS_A_PAID_MODEL \
  ./scripts/run-evaluation-calibration-live.sh \
  --owner-authorization /secure/external/path/sav-248-v9-owner-authorization.json \
  --approval /secure/path/evaluation-adjudication-approval.json \
  --output /secure/path/sav-248-automated-report.json \
  --semantic-capture-dir /secure/private/path/sav-248-capture \
  --semantic-public-report /secure/path/sav-248-semantic-report.json \
  --semantic-review-request /secure/path/sav-248-review-request.json \
  --semantic-panel-a /secure/path/sav-248-panel-a.json \
  --semantic-panel-b /secure/path/sav-248-panel-b.json \
  --semantic-execution-authority /secure/path/sav-248-execution-authority.json \
  --semantic-review-timeout-seconds 7200
```

For the narrow delegated retry path after a zero-cost terminal failure, replace
`--owner-authorization` with both delegated inputs:

```bash
MEELNI_ALLOW_PAID_CALIBRATION=I_UNDERSTAND_THIS_CALLS_A_PAID_MODEL \
  ./scripts/run-evaluation-calibration-live.sh \
  --delegated-agent-authorization /secure/external/path/sav-303-delegated-agent-authorization.json \
  --previous-terminal-report /secure/path/previous-sav-248-automated-report.json \
  --approval /secure/path/evaluation-adjudication-approval.json \
  --output /secure/path/sav-248-automated-report.json \
  --semantic-capture-dir /secure/private/path/sav-248-capture \
  --semantic-public-report /secure/path/sav-248-semantic-report.json \
  --semantic-review-request /secure/path/sav-248-review-request.json \
  --semantic-panel-a /secure/path/sav-248-panel-a.json \
  --semantic-panel-b /secure/path/sav-248-panel-b.json \
  --semantic-execution-authority /secure/path/sav-248-execution-authority.json \
  --semantic-review-timeout-seconds 7200
```

All six output/review files must be new and pairwise distinct. The private
capture directory must be outside every Git worktree; the automated report,
review request, panel files, execution authority, and sanitized semantic report
must be outside that capture and outside every Git worktree. Every parent must
be an owner-owned `0700` directory and each file must be `0600`. The runner
rejects pre-existing, symlinked, unsafe, or non-private paths before readiness.

After all non-canonical automated thresholds pass, the same process finalizes
the capture, writes a pending v9 report and the review request, and waits. Start
two actual independent agent tasks against the same capture and request. Each
panel file contains only the review-input hash and decisions; it must not claim
its own task or execution identity. After independently observing both
completed executions, the trusted operator writes the separate authority:

```bash
npm run calibration:semantic-authority -- \
  --review-request /secure/path/sav-248-review-request.json \
  --panel-a /secure/path/sav-248-panel-a.json \
  --panel-b /secure/path/sav-248-panel-b.json \
  --task-a /root/sav248/panel_a --execution-a exec_<opaque-a> \
  --completed-a 2026-07-18T20:10:00.000Z \
  --task-b /root/sav248/panel_b --execution-b exec_<opaque-b> \
  --completed-b 2026-07-18T20:11:00.000Z \
  --output /secure/path/sav-248-execution-authority.json
```

The constructor binds operator-observed metadata; it is not cryptographic proof
that a task ran. The launcher uses one combined poll loop for all three files.
Malformed, unsafe, stale, symlinked, oversized, or hash-mismatched input fails
immediately. Unanimous acceptance or rejection publishes a sanitized semantic
report with a conservative deletion bit, atomically replaces the pending
automated report with passed or failed, verifies that terminal file, and only
then deletes raw output. Timeout, disagreement, interruption, or any other
terminal failure exits nonzero after atomically replacing an already-pending v9
report with failure; cleanup occurs only after terminal publication. If that
publication fails, raw capture remains. SIGKILL and host crashes cannot
guarantee automatic deletion; retention is sized for 64 five-minute requests,
the full review window, and ten minutes of overhead for operator recovery.

The launcher sends credentials only through the private pipe after the exact
handshake, never through argv, logs, reports, environment files, or temporary
regular files. It requires a validated, all-approved adjudication artifact.
Spend approval does not approve the candidate gold set. The acknowledgement is
deliberately exact so an ambient boolean cannot accidentally enable paid
calibration.

The live CLI exits zero only when `calibrationEvidenceAcceptance` is `passed` in
the current `evaluation-calibration-report.v9` report. A zero exit means only
that the complete calibration evidence contract passed; it is not the human
product owner's launch decision. A provider-quality pass still exits nonzero
when adjudication approval is missing, stale, incomplete, or contains
`changes_required` decisions.
Review the report's model and all five version fields before accepting it as
evidence. Store approved calibration evidence in the release record without
adding secrets or provider responses containing sensitive data.

The committed v7 receipts remain byte-for-byte immutable. Their historical
`gate.launchAcceptance` values have the same technical state interpretation as
v9 `gate.calibrationEvidenceAcceptance`, but never represent owner GO/NO-GO.
Do not rewrite or regenerate those historical files during a v9 run.

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
- The cost report uses `evaluation-calibration-cost-report.v5`, the current
  report uses `evaluation-calibration-report.v9`, and the fixed run,
  authorization ID, and
  authorization hash match the committed spend-authorization manifest.
- The activated plan reports exactly 64 calls and at most $3 worst-case, the
  activation commit remains the protected ref head, and each reservation has
  exactly one successful physical-dispatch boundary. A second or concurrent
  boundary attempt is counted, rejected before transport, and does not increase
  the physical HTTP-attempt ceiling.
- `observedServiceTiers` contains only `default` for a passing run. A missing or
  different returned tier stops after the first affected call.
- Evidence validity and insufficient handling are 100%. Canonical adjudicated
  evidence match remains a diagnostic regression metric. A non-canonical exact
  phrase can count only after complete unanimous semantic review; it is never
  automatically accepted.
- An adjudicated match may quote a wider exact span from the same user turn,
  but it must preserve the complete approved anchor plus the approved finding
  kind and dimension. Do not reinterpret another grounded phrase as an
  automatic semantic match; follow the SAV-250 audit boundary.
- Pooled and per-dimension score-band agreement are at least 80%; each round and
  completion state is at least 75%.
- Maximum repeated-run score range is at most 1.
- Every output model identity matches the configured expected model and the
  observed identities are reviewed.
- Report versions match the candidate being evaluated.
- `calibrationEvidenceAcceptance` is `passed`; a deterministic `passed` state
  is not enough, and this field never authorizes launch.
- Adjudication acceptance records completed product-owner/PM signoff; candidate
  status is never treated as ground truth.
- Candidate and corpus hashes match the separately stored approval artifact,
  and all 32 scored-case decisions are approved.
- The report contains no prompt text, transcript text, provider body, secret,
  or Production/customer-data payload.

If a live run fails or crashes, keep calibration evidence acceptance failed or
pending and retain a `not ready` launch-readiness recommendation. Inspect
available case/run/dimension failure records. For invalid-feedback failures,
use only the closed `feedbackRejectionCode` to identify the failed invariant.
For provider invocation failures, use only the optional bounded
`providerDiagnostic.kind` and numeric `providerDiagnostic.httpStatus` to triage
the transport/request category. Do not add raw provider output, provider error
messages, parser messages or causes, transcript text, evidence text, unknown
keys, object paths, headers, request bodies, response bodies, or customer data
to a report, log, PR, or ticket. A `parser_internal_failure` requires a
provider-free parser investigation before any new authorization. An invocation
failure without a bounded diagnostic requires a provider-free diagnostics fix
before another paid authorization package. Update the evaluator or adjudication
deliberately, and obtain a separate new authorization before any paid retry.
The activated SAV-198 run never resumes.
