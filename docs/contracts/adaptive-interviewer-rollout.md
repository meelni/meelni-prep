# Adaptive Interviewer Rollout

Contract version: `adaptive-interviewer-rollout.v1`

## Authority

Only the human product owner may authorize a Preview or Production forward
step, default-on behavior, or launch GO/NO-GO. Automated checks produce evidence
and the recommendation `hold_at_synthetic`; they never infer the owner decision.

Repository presence, a passing report, a selected adapter, or a prior-stage
authorization grants no later-stage authority. Each forward step binds the
exact 40-character candidate Git SHA, rollout configuration SHA-256, and target
stage. An authorization for one stage cannot be replayed for another SHA,
configuration, environment, or stage.

The generated first request is the non-authorizing template
`adaptive-interviewer-owner-preparation-request.v2`. Its selection and selected-
candidate digest are `null`, its decision/reference/timestamps are `pending` or
`null`, and both candidate preparation and rollout transition authority are
false. A non-executable `selection_template` enumerates every value-bearing
field with null placeholders while retaining the fixed privacy scope and hard
stops. It cannot be used as executable authority.

The owner-completed record is the distinct closed contract
`adaptive-interviewer-owner-preparation-authorization.v1`. It names authority
`prepare_isolated_preview_shadow_candidate_only` and permits only:

- repository implementation of the owner-selected Director adapter candidate;
- repository configuration of that candidate; and
- provider-free candidate validation.

It does not permit provider calls or spend, deployment, live rooms, Preview
influence, Production, default-on, or GO/NO-GO. Running bounded Preview shadow
requires a second owner authorization against the reviewed adapter candidate's
exact SHA and configuration.

The approved preparation record contains every selected value: Director adapter
ID/version, provider/model, integer Preview session and nano-USD spend caps,
accepted synthetic-only privacy/retention policy and bounded retention days,
and coherent integer entry/stop thresholds. Quality and rates use basis points;
latencies and recommendation age use milliseconds. First-audio p50 and p95 are
both required. Observed spend is conservatively rounded upward to integer nano-
USD before it enters an external owner packet; the contract parser accepts no
decimal or floating USD value and performs no conversion.

The selected-candidate configuration SHA-256 is domain-separated as
`adaptive-interviewer-selected-candidate-configuration.v1` and binds the
requested authority, current/future stages, exact candidate Git SHA, repository
rollout configuration SHA-256, and normalized closed selection. Missing,
unknown, duplicate, malformed, unsafe-integer, out-of-range, incoherent, or
drifted fields fail closed. Stop minima cannot exceed entry minima, stop maxima
cannot be stricter than entry maxima, p50 cannot exceed p95, the completed
sample cannot exceed the session cap, and the spend stop cannot exceed the
overall cap.

The record includes a whole-second UTC decision time, expiry no more than seven
days later, and an external decision reference. A trusted verifier supplies the
current time: authority is invalid before the decision or at/after expiry. The
parser proves only schema, safety, time, and digest bindings. It does not
authenticate a human identity or make arbitrary JSON authoritative; the human
or supervisor must verify the external decision reference before repository
work proceeds. This preparation contract is domain-separated from rollout-
stage authorization and Production action authorization, and both reject it.

## Stages

| Stage               | Environment                 | Director  | Exposure           | Required cohort | Safe rollback                                     |
| ------------------- | --------------------------- | --------- | ------------------ | --------------- | ------------------------------------------------- |
| `disabled`          | repository/current behavior | none      | none               | `current`       | none                                              |
| `synthetic`         | repository                  | none      | none               | `current`       | `disabled`                                        |
| `preview_shadow`    | Preview                     | shadow    | none               | `shadow`        | `synthetic`, with all flags off                   |
| `preview_influence` | Preview                     | influence | owner only         | `canary`        | `preview_shadow`, influence off first             |
| `production_shadow` | Production                  | shadow    | none               | `shadow`        | `disabled`, restoring current Production behavior |
| `production_canary` | Production                  | influence | bounded candidates | `canary`        | `production_shadow`, influence off first          |
| `candidate_default` | Production                  | influence | default            | `canary`        | `production_canary`                               |

Forward promotion MUST be adjacent. Rollback MUST use the declared safe target;
it MUST NOT derive a target from the previous item in the progression list.
This prevents a Production stop from activating any Preview configuration.

## Flags and cohorts

The five server-only flags are the canonical
`STATEFUL_INTERVIEWER_ROLLOUT_FLAGS`. Only the exact lowercase string `true`
enables a flag. Missing, blank, mixed-case, padded, numeric, or other values are
false.

- `disabled` and `synthetic`: every flag false, cohort `current`, adapter/model
  absent.
- shadow: brief, controller, tools, and Director shadow true; influence false;
  cohort `shadow`; exact adapter and model pins required.
- influence: all five true; cohort `canary`; exact adapter and model pins
  required.

Repository code MUST keep the application adapter `None` and every flag off
until separately authorized implementation and live-operation work occurs.

## Entry, exit, and stop

Synthetic entry requires matching frozen evidence digests, passing
provider-free verification, all flags off, and no Director adapter.

Every live entry requires the prior stage to pass its exit criteria, exact
candidate/configuration and adapter/provider/model pins, isolated environment,
owner-accepted spend/privacy/retention terms, owner-accepted numeric entry and
stop thresholds, and a separate target-stage authorization. Influence and all
Production entries additionally require the owner-defined minimum sample,
quality, latency/completion, feedback-integrity, and rollback-rehearsal gates.
Production entries also require the Production action authorization contract.
Default-on additionally requires a recorded owner launch GO.

No repository default may invent live numeric thresholds. The owner MUST record
them in the closed selection before preparation authorization and reconfirm
them before the applicable live authorization. Until then the exit result is
pending and promotion fails closed. Evidence/version drift, unauthorized
stage/cohort, deterministic invariant regression, any session/transcript loss,
and kill-switch failure are fixed non-tunable hard stops.

Any declared hard-stop signal immediately blocks promotion and starts the safe
rollback: evidence/version drift, unauthorized stage/cohort, invariant or
quality regression, first-audio/completion/fallback/tool/freshness/interruption
regression, feedback-integrity regression, session/transcript loss, spend-cap
breach, or kill-switch failure.

Only Director influence is an immediate active-session revocation: the runtime
re-reads that flag on every tool admission. Shadow, controller, tools, and brief
enablement are construction-time/session-scoped. Their configuration rollback
keeps new sessions all-off but does not claim to stop already-created work. An
in-flight Preview shadow provider/spend stop requires the reviewed session
settle/shutdown path, and that path MUST be rehearsed before live entry.

## Version pins

The configuration digest includes room metadata, brief, round pack, interview
policy/prompt/runtime/controller/snapshot/move/tool, Director recommendation/
policy/influence, observability, feedback fixture, STT/LLM/TTS/voice, and
Director adapter/model versions. Synthetic pins set Director adapter and model
to `null`. Any pin drift invalidates the prior configuration digest and owner
authorization.

The all-round and adverse-voice rehearsal matrix belongs to the second live
authorization. It is deliberately unbound and unperformed in the preparation
template and remains a blocker rather than an inferred selection.

## Evidence report

`adaptive-interviewer-readiness-report.v1` verifies the SHA-256 digest of every
frozen input before parsing it. Missing or changed bytes fail closed. Its claims
are limited to their actual artifacts:

- the SAV-467 provider-free report is the current-runtime synthetic baseline
  and deterministic-invariant evidence;
- the SAV-467 owner adjudication accepts only its exact semantic gold set;
- adaptive-feedback fixtures are synthetic expected outcomes and attribution
  integrity only; and
- observability fixtures are valid/invalid wire-contract cases only.

The report MUST record zero customer data, credentials, provider calls,
Production calls, and live rooms. It MUST NOT report an adaptive quality delta,
live feedback result, or live metric without corresponding authorized evidence.
