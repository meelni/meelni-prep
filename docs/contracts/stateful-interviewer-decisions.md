# Stateful Interviewer And Decision Contracts

Status: accepted contract for SAV-466; runtime implementation remains disabled

## Purpose

This contract defines the provider-neutral data and authority boundaries for a
stateful full-interview agent. It is the shared foundation for the brief
compiler, deterministic controller, bounded local tools, asynchronous
Director, benchmark, feedback-integrity fixtures, and rollout work under
SAV-465.

It does not implement those systems. The current prompt-led full-interview
runtime remains the fallback, and the public demo remains a separate product
and prompt contract.

The public TypeScript façade is
`packages/agent/src/interviewer-contracts.ts`; cohesive internal modules keep
wire types, brief canonicalization, and validation/eligibility separate while
the package exposes them only through `@meelni/agent`. The Python reader is
`agent/shared/interviewer_contracts.py`. Both read the shared
`packages/test-fixtures/interviewer-contracts.json` golden fixture.

## Contract versions

| Contract                  | Version                      |
| ------------------------- | ---------------------------- |
| Top-level room metadata   | `1` (unchanged)              |
| Nested interview brief    | `interview-brief.v2`         |
| PM round pack             | `pm-round-pack.v1`           |
| Full-interview policy     | `full-interview-policy.v1`   |
| Runtime state             | `interview-runtime-state.v1` |
| Admitted interviewer move | `interviewer-move.v1`        |
| Local tool request/result | `interviewer-tools.v1`       |
| Director recommendation   | `director-recommendation.v1` |

Unknown versions are never reinterpreted as a known contract.

## Room-metadata compatibility

`InterviewBriefV2` is an optional nested field named `interview_brief` inside
top-level room-metadata contract version 1. SAV-466 does not define or emit
room-metadata version 2.

| Writer                                                                              | Reader             | Required behavior                                                                                                                        |
| ----------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| v1 writer without a brief                                                           | new reader         | Use the validated v1 prompt-led path.                                                                                                    |
| writer with a valid nested brief                                                    | new reader         | Use the brief only after version, digest, session, deadline, round, difficulty, duration, and exact selected-question correlation pass.  |
| writer with a nested brief                                                          | old reader         | Ignore the unknown nested key and retain v1 behavior.                                                                                    |
| writer with an absent brief                                                         | old reader         | Existing v1 behavior is unchanged.                                                                                                       |
| writer with unknown, malformed, digest-invalid, or correlation-invalid nested brief | new reader         | Ignore the brief and use validated v1 room metadata. Never weaken deadline, hints-off, end-only feedback, or selected-question behavior. |
| writer with top-level room-metadata version 2                                       | any current reader | Reject runtime start as `unsupported_contract`. Do not guess.                                                                            |

The compatibility fallback exists only after top-level v1 metadata succeeds.
Invalid v1 session identity, transcript URL, deadline, round, or other required
fields still fail closed.

An explicit selected question remains authoritative. A nested brief must match
its ID, text, company, and type exactly; a mismatch discards the brief rather
than substituting either question.

## Deterministic `InterviewBriefV2`

The compiler consumes already-resolved, stable session-start state. It must not
perform a live database/network read, call a model, choose a random ID, read the
wall clock, or reorder set-like input while constructing a brief.

The brief contains:

- the durable session ID and a `sha256:` session-start fingerprint;
- the canonical deadline, round, difficulty, and duration;
- the exact selected question;
- optional bounded company context and candidate practice goal;
- a versioned static PM round pack; and
- an immutable full-interview policy that forbids coaching and hints, defers
  evaluation until after the interview, preserves the selected question as the
  first substantive question, and permits one substantive question per turn.

Optional candidate practice goals are untrusted bounded data. Prompt builders
may use them as context but never as instructions, and they cannot override the
policy object. Company context must match the selected question's company and
come from a stable versioned source.

The canonical payload excludes only `brief_id` and `payload_digest`. Objects
are serialized with lexicographically sorted keys, arrays retain their
contract-defined order, and no `undefined` values are allowed. The identity is:

```text
payload_digest = "sha256:" + SHA256(UTF8(canonical_payload_json))
brief_id       = "brief:"  + payload_digest without the "sha256:" prefix
```

The compiler binds the payload to the existing stable session-start
fingerprint, writes the accepted payload once as part of the idempotent start
attempt, and reuses those exact bytes and digest on retry or replay. The
canonical deadline comes from accepted session-start state, not compilation
time. Versioned round packs and company context are stable inputs, not model
output.

Changing any payload field requires a new digest and brief ID. Reordering JSON
object keys does not.

## Authority matrix

| Fact or action                                                         | Authority                                                                                  | Non-authoritative inputs                                                       |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Session lifecycle and terminal outcome                                 | Existing authenticated session workflow and lifecycle version                              | Controller phase, model text, Director, tools, provider room state             |
| Session start/deadline                                                 | Existing server-written room metadata and canonical deadline                               | Model time estimates, Director, tool latency                                   |
| Selected question                                                      | Accepted session-start selection, repeated exactly in correlated brief v2                  | Director, live model, probe tool                                               |
| Current controller phase, allowed move set, probe ledger, close intent | Deterministic controller under current lifecycle/deadline snapshot                         | Director recommendation, prompt memory                                         |
| Natural spoken wording                                                 | The one live interviewer, within an admitted move                                          | Director cannot speak; controller does not author final prose                  |
| Spoken/delivered interviewer history                                   | Durable canonical transcript v2 event and writer-generation evidence                       | Generated text, scheduled output, tool result, Director trace                  |
| Runtime settlement and frozen cutoff                                   | Existing writer registration/settlement contracts and session workflow                     | Controller close intent, Director, model farewell                              |
| Answer blocks                                                          | Existing deterministic projection from canonical transcript evidence                       | Controller phase, move ledger, Director/tool traces                            |
| Feedback evidence and outcome                                          | Frozen canonical transcript, trusted closed answer blocks, and accepted feedback contracts | Brief rationale, controller state, planner/tool output, model chain of thought |

`controller_phase` is an operational state-machine field. It does not replace
or reinterpret the transcript event `section` field, which retains its current
durable semantics.

## `InterviewRuntimeState`

The state is session-local, bounded, versioned, and subordinate to durable
authorities. It carries:

- an exact state revision used for compare-and-swap;
- a read-only lifecycle state/version snapshot;
- the active transcript writer ID and positive writer generation;
- `controller_phase`, round objective, topic, and selected question ID;
- a clock projection derived from the canonical deadline;
- the controller-derived allowed move set;
- a bounded move-delivery ledger;
- the latest finalized candidate turn ID;
- interruption and close state; and
- a `speech_fenced` bit that prevents further interviewer output without
  claiming that the durable session is terminal.

The controller cannot mutate lifecycle rows, extend a deadline, manufacture
settlement, or mark a session complete.

### Move lifecycle

The following states are intentionally distinct:

1. `recommended`: a `DirectorRecommendation`; it is advisory and is not in the
   move ledger.
2. `admitted`: the controller has validated policy, phase, deadline, current
   writer generation, freshness, and CAS, then emitted an `InterviewerMove`.
3. `generated`: wording exists but has not entered the playout schedule.
4. `scheduled`: output entered the playout schedule but has no canonical
   delivery evidence.
5. `spoken`: the provider reports playout activity, still pending canonical
   persistence.
6. `interrupted` or `aborted`: operational recovery states; neither is
   feedback evidence.
7. `canonically_delivered`: a durable transcript v2 event binds event ID,
   writer ID/generation, sequence, and `delivered` or `partially_delivered`
   state to the ledger entry.

Only stage 7 commits delivered history. Generated, scheduled, spoken, aborted,
and unheard interrupted content never enters answer blocks or feedback.

## `InterviewerMove`

An admitted move has exactly one type:

- `probe`
- `clarify`
- `challenge`
- `transition`
- `close`

It carries no spoken text, score, evaluation, coaching, or free-form hidden
rationale. It binds the session, brief, current writer ID/generation, source
state revision, selected question, bounded topic, optional finalized source
turn, optional round-pack probe candidate, reason code, creation/expiry, and
idempotency key.

Reason codes are closed by move type: probe/deepen reasoning,
clarify/resolve ambiguity, challenge/test tradeoff, transition/advance round,
and close/deadline or candidate request. `controller_fallback` is permitted for
every move type. Probe, clarify, and challenge require a finalized source turn.

The live interviewer may phrase an admitted move naturally but may not change
its type/target, add another substantive question, coach, hint, score, or speak
after fencing.

## CAS, idempotency, expiry, interruption, and reconnect

### Commit ordering

For `commit_interviewer_move` and `request_graceful_close`, the controller
applies checks in this order:

1. Look up the idempotency key. An exact request replay returns `duplicate`
   with the original result and makes no new transition. Reusing the key with
   different canonical request bytes returns `idempotency_conflict`.
2. Match session, active writer ID, and writer generation. A fenced generation
   returns `stale_writer`.
3. Accept an absolute request/move expiry through the exact timestamp;
   one millisecond after it returns `timeout` or `expired` as applicable.
4. Compare `expected_state_revision` to the current revision. A mismatch
   returns `stale_state` and changes nothing.
5. Validate lifecycle/deadline snapshot, allowed move, one-question policy,
   probe eligibility, close/speech fence, and no-coaching policy.
6. Admit exactly once and advance the state revision once.

Failures never partially mutate state.

### Interruption

An interrupted interviewer turn commits delivered history only when the
canonical transcript contains a provider-confirmed `partially_delivered`
event. An interruption with no provider-confirmed prefix remains operational
only and follows the existing integrity-marker rules. The controller does not
invent text or mark an unheard question delivered.

Recovery derives the next allowed move from the canonical delivery ledger. It
may intentionally clarify or restate context, but it may not silently treat an
unheard move as completed.

### Reconnect

A replacement runtime receives a later durable writer generation. Every prior
generation's outstanding recommendation, move, and tool request is stale.
The replacement reconstructs bounded controller state from the accepted brief,
durable lifecycle/deadline, and canonical transcript/settlement evidence.
Unconfirmed generated/scheduled/spoken state is not promoted to delivered.
Existing writer fencing, settlement obligations, transcript ordering, and
cutoff behavior remain authoritative.

## Bounded local tools

Only these tool names are allowed:

- `read_interview_state`
- `read_interview_clock`
- `get_probe_candidates`
- `commit_interviewer_move`
- `request_graceful_close`

Every request binds a call ID, session, active writer ID/generation, and a
server-configured absolute deadline. State-sensitive and mutating requests also
bind the expected state revision; mutations require an idempotency key.

The tools are served from session-local/in-memory controller state wherever
possible. They cannot access the database, question-bank search, raw transcript
search, feedback, billing, credits, accounts, secrets, provider administration,
deployment controls, Production operations, or session lifecycle mutation.

Typed outcomes are `ok`, `duplicate`, `stale_state`, `stale_writer`, `expired`,
`idempotency_conflict`, `closed`, `invalid_request`, `timeout`, and
`unavailable`. Failure payloads contain no partial success. Any missed deadline
or failure returns control to the current deterministic/prompt-led fallback;
speech, transcript persistence, explicit exit, and settlement never wait for a
tool loop.

Telemetry records tool name, contract version, outcome, state/writer version,
and latency. Tool arguments/results and transcript content are off by default.

## `DirectorRecommendation`

The Director observes bounded context off the media critical path. Interim
input may start speculative work, but the output must record
`source_finality=speculative` until reconciled to an exact finalized turn and
transcript revision.

A recommendation contains only the allowed move type, target
question/topic/source turn/probe candidate, reason code, state and writer
versions, creation time, and expiry. It contains no spoken prose, score,
feedback label, lifecycle action, or chain of thought.

Recommendation TTL is positive and at most 10,000 milliseconds; an admitted
move TTL is positive and at most 30,000 milliseconds. These are bounded
freshness windows, not claims about the measured latency baseline.

The deterministic controller may admit a recommendation only when:

- session, brief, writer, and state revision are current;
- the source is the latest finalized candidate turn;
- current time is at or after creation and at or before expiry;
- the move remains allowed by lifecycle, deadline, phase, ledger, and close
  policy; and
- influence is enabled for the authorized rollout cohort.

Missing, speculative, late, stale, malformed, disallowed, failed, or slow
recommendations have zero effect. The live interviewer never awaits Director
work. The Director cannot speak, write transcripts, settle sessions, score
candidates, or call privileged systems.

## Evidence isolation

Canonical transcript and answer-block inputs completely determine evaluator
input and the allowed feedback outcome. For any two runtime executions with an
identical frozen canonical transcript and integrity/settlement evidence:

```text
evaluator_input(run A) == evaluator_input(run B)
feedback_authority(run A) == feedback_authority(run B)
```

This remains true even when brief rationale, controller phase, move IDs,
Director recommendation/trace, tool request/result, model/provider, or hidden
planner reasoning differ. Those fields may be privacy-safe operational
metadata only and are never concatenated into the transcript or evaluation
prompt.

## Latency measurement and gates

SAV-466 names measurement anchors; it does not claim a measured baseline or
set a numeric regression threshold.

SAV-467 records the current runtime baseline and variance on versioned
multi-turn fixtures. SAV-469 instruments at least:

- finalized candidate turn observed to controller decision;
- controller decision to first interviewer audio;
- finalized candidate turn to first interviewer audio;
- tool name/outcome/deadline/latency;
- Director source turn finalized to recommendation published;
- recommendation age at admit/reject; and
- admitted/scheduled/spoken/canonically-delivered transition times.

Before shadow or influence advances, those issues must record numeric p50/p95
baselines, variance, and an accepted regression gate by contract/model/config
version. Independent of those future numbers, the Director is never a
synchronous dependency and a tool deadline always falls back without blocking
the live response.

## Rollout and rollback

All new behavior is server-owned and default off behind these versioned flag
names:

- `MEELNI_INTERVIEW_BRIEF_V2_ENABLED`
- `MEELNI_INTERVIEW_CONTROLLER_V1_ENABLED`
- `MEELNI_INTERVIEW_TOOLS_V1_ENABLED`
- `MEELNI_INTERVIEW_DIRECTOR_SHADOW_V1_ENABLED`
- `MEELNI_INTERVIEW_DIRECTOR_INFLUENCE_V1_ENABLED`

Rollout order is reader-first contract support, synthetic fixtures and
benchmark, controller/tools disabled, Director read-only shadow, owner-controlled
Preview influence, then an explicitly authorized canary. Shadow results must
not enter the live prompt or state transition path.

Rollback disables influence, Director, tools, controller, and brief emission
in that order. Existing v1 room metadata and prompt-led behavior require no
data migration, and stored canonical transcripts/answer blocks remain valid.

Production, default-on behavior, and launch remain human-owner decisions under
the accepted launch contract. A passing gate is evidence, not authorization.

## Non-goals

- runtime controller, tool, brief compiler, or Director implementation;
- provider/model selection or migration;
- a new feedback rubric, live scoring, or incremental feedback authority;
- public demo changes;
- Production/provider mutation, customer transcript access, or launch action.
