# Adaptive Interviewer Rollout Runbook

Current state: `synthetic`; system recommendation: `hold_at_synthetic`. The
owner approved repository preparation of one selected adapter candidate only;
no live-stage decision exists. Application adapter remains `None` and all flags
remain off. This runbook does not authorize environment access or mutation.

## Repository verification

From an exact reviewed checkout, run:

```bash
npm run interviewer:rollout:verify-readiness
npm run test:agent
npm run test:python-agent
npm run test:interviewer-benchmark
npm run interviewer:benchmark:verify-baseline
```

Verification reads only the four frozen repository paths listed in
`docs/evidence/sav-477-adaptive-interviewer-readiness.json`. It rejects missing,
changed, symlinked, or semantically broadened evidence and prints the exact
report SHA-256 on success.

Generate a pending owner packet only after the SAV-477 merge commit is present
on `origin/main`:

```bash
npm run interviewer:rollout:owner-request -- --candidate-sha <40-character-origin-main-sha>
```

The packet's candidate SHA and repository rollout-configuration digest must
match the reviewed checkout. It is a v2 template: selection, selected-candidate
digest, decision reference/time/expiry, and preparation authority remain null,
pending, or false. Its `selection_template` is an exhaustive null-placeholder
worksheet, not a valid selection. Generation is read-only and cannot create
approval.

## First owner gate: prepare a candidate

SAV-478's first gate is approved in
`docs/evidence/sav-478-director-adapter-preparation-authorization.json`, bound
to external reference
`linear:SAV-476:comment:05d1d32b-a1aa-45ff-b83a-4645904b4398` and selected-
candidate digest
`b8cc8547c6d2573b7d323b3327ab31bf74c237a1486c13e0e7780a63880e25ac`.
Its expiry is `2026-08-27T04:43:26.000Z`. It permits repository implementation,
configuration, and provider-free validation of the selected adapter only. It
does not permit a provider request, spend, environment mutation, deployment,
live room, or rollout transition.

The approved record completed the closed
`adaptive-interviewer-preview-shadow-selection.v1` with:

1. exact Director adapter ID/version, provider, and model;
2. positive JSON-safe integer Preview session and nano-USD spend caps;
3. acceptance of `adaptive-interviewer-preview-privacy.v1`, a provider-policy
   reference, synthetic-owner-rehearsal-only scope, no customer data or provider
   training, and bounded provider/transcript/raw-audio retention days; and
4. integer entry and stop thresholds for minimum sample, quality, first-audio
   p50 and p95, completion, fallback/tool failure, recommendation freshness and
   age, interruption recovery, feedback integrity, session/transcript loss,
   kill-switch behavior, and spend.

Quality and rates use basis points; latency and age use milliseconds. Spend is
an integer nano-USD value. If a human-facing estimate begins in decimal USD,
convert it outside the authorization payload with decimal-safe string logic and
round observed spend upward before binding the integer; the parser performs no
floating conversion. Entry/stop comparators must remain coherent, and evidence/
version drift, unauthorized cohort, invariant regression, any session or
transcript loss, and kill-switch failure remain fixed non-tunable stops.

The owner explicitly authorized
`prepare_isolated_preview_shadow_candidate_only` against the exact merged SHA,
repository configuration digest, and domain-separated selected-candidate
configuration digest. The approved v1 record includes a whole-second UTC
decision time, an expiry no more than seven days later, and the exact external
decision reference. The trusted verifier supplies current time; the record is
invalid before its decision time and at or after expiry.

Strict parsing proves only closed shape, safe bounds, time, and digest binding.
It does not authenticate a human owner. The supervisor/human must verify the
external reference before treating the record as authorization; arbitrary JSON
is not authority. This permits a new reviewed repository slice to implement/
configure the selected adapter candidate and run provider-free tests.
It does not permit provider calls/spend, deployment, live rooms, Preview
influence, Production, default-on, or GO/NO-GO.

## Second owner gate: run bounded Preview shadow

After the adapter candidate is reviewed and merged, SAV-476 requires a new
authorization bound to that exact adapter SHA/config. The owner must reconfirm
the selections and limits, authorize the isolated Preview environment, and
authorize only `preview_shadow`. The operator may then use the canonical
service runbooks to execute the bounded rehearsal. Generic Vercel PR Preview is
web-only; a trusted provider-backed staging lane is required.

That second live authorization must also bind the all-round and adverse-voice
rehearsal matrix. The preparation packet deliberately records that matrix as
unbound and unperformed; it cannot be inferred from repository tests.

No agent may reuse the first packet or infer approval from merged code. Preview
influence requires another authorization after shadow evidence and rollback
rehearsal pass the owner-accepted thresholds.

## Promotion rules

Promotion is adjacent only:

```text
synthetic -> preview_shadow -> preview_influence -> production_shadow
          -> production_canary -> candidate_default
```

Each arrow into Preview or Production requires a fresh exact-SHA/config owner
authorization. Each Production action also requires the separate Production
action authorization contract. `candidate_default` additionally requires the
owner's explicit launch GO; a report recommendation cannot substitute for it.

Before a promotion, record the exact input sample, thresholds, result, artifact
digests, candidate/config pins, owner authorization, and rollback rehearsal.
Missing or stale evidence is a failed gate, not a waiver.

## Stop and rollback

On any hard-stop signal, block promotion and revoke influence first. Influence
is the only active-session immediate revocation because its flag is read at
every tool admission.

Shadow, controller, tools, and brief enablement are construction-time/session-
scoped. Removing their flags prevents new sessions from constructing adaptive
components; it does not guarantee that an existing shadow task stops. For an
in-flight Preview shadow, use the reviewed session settle/shutdown path to stop
provider work and spend. The bounded Preview rehearsal must prove that path and
record its terminal evidence before any later stage can enter.

For new sessions, use this safe configuration rollback order:

1. Director influence;
2. Director shadow;
3. interviewer tools;
4. interview controller; and
5. interview brief.

Use the stage-specific target:

| From                | Roll back to        | Required safety result                                             |
| ------------------- | ------------------- | ------------------------------------------------------------------ |
| `preview_shadow`    | `synthetic`         | new Preview sessions all off; settle/shutdown any in-flight shadow |
| `preview_influence` | `preview_shadow`    | influence is revoked at the next admission                         |
| `production_shadow` | `disabled`          | current Production behavior; never Preview influence               |
| `production_canary` | `production_shadow` | influence off; read-only shadow only                               |
| `candidate_default` | `production_canary` | return to the last owner-bounded Production cohort                 |

Do not use a previous-stage algorithm for operational rollback. In particular,
`production_shadow -> preview_influence` is forbidden because it crosses
environments and would re-enable influence.

After rollback, stop promotion, preserve sanitized evidence, verify cohort and
version attribution, and require a new owner authorization before re-entry.
Session/transcript loss, kill-switch failure, or an unauthorized cohort is a
hard stop regardless of aggregate quality. A configuration change alone is not
evidence that already-created shadow work settled.

## Production and launch

Production shadow, Production canary, and candidate default are separate
owner decisions. Before each, bind the exact SHA/configuration and follow
`docs/contracts/production-action-authorization.md` and
`docs/operations/production-action-authorization.md`. Never reuse Preview
authority, never infer GO from a green gate, and never mark SAV-476 Done until
the owner records the actual launch decision and required evidence.
