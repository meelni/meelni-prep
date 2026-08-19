# Stateful Interviewer And Decision Contracts

Status: accepted contract for SAV-466; SAV-471 controller and SAV-474 read-only
Director shadow implementations are available but disabled by default

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
wire types, canonicalization, structural validation, admission/correlation,
and attribution separate while the package exposes them only through
`@meelni/agent`. The stable Python façade is
`agent/shared/interviewer_contracts.py`, with canonicalization and assessment
policy in focused internal modules. Both runtimes read the shared
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

SAV-471 also uses two implementation-local versions:

- `deterministic-interview-controller.v1` for immutable reducer state; and
- `interview-controller-snapshot.v1` for the bounded turn-local model context.

These envelopes are internal to the Python runtime adapter. They project the
accepted `interview-runtime-state.v1` contract and do not widen its shared
TypeScript/Python wire shape.

The projection requires an exact durable lifecycle state and positive version
from a trusted boundary. SAV-472 extends the authenticated runtime-writer
registration receipt with the lifecycle state/version read under the same
session-row lock, then requires a separate signed, reader-only lifecycle read
bound to the exact room and current writer generation before controller
construction. A local four-second lease is renewed through that reader. Tools
never perform the read themselves. Missing, stale, conflicting, non-active, or
unavailable authority disables tool/controller participation without inventing
`active` or lifecycle version 1.

SAV-474 also uses implementation-local `interview-director-policy.v1`,
`interview-director-context.v1`, `interview-director-runner.v1`,
`interview-director-store.v1`, and `interview-director-shadow-trace.v1`
envelopes. The recommendation itself records the exact policy and
model-adapter version. The application injects no adapter, so these envelopes
are runnable only with the deterministic fake in provider-free tests.

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

Raw-number validation locates only the decoded top-level `interview_brief`
property. A same-named object below `question` or another nested value is not a
brief and cannot hide or invalidate the top-level payload. More than one
decoded top-level `interview_brief` key is ambiguous and discards the brief as
`invalid_payload`; the reader does not rely on first-key or last-key behavior.
The top-level metadata `contract_version` is likewise an authority-bearing
integer wire token: `1` is canonical, while `1.0` and `1e0` are unsupported in
both readers rather than normalized by JavaScript. Duplicate top-level version
keys are unsupported instead of relying on decoder precedence.

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

Every string in an accepted brief must contain Unicode scalar values only.
Lone high or low UTF-16 surrogates are invalid in both runtimes; they cannot be
hashed through a replacement-character path. Valid astral characters encode as
their standard UTF-8 bytes and produce the same canonical payload and SHA-256
digest in TypeScript and Python. Any Unicode or canonicalization failure is an
`invalid_payload` and optional room-metadata negotiation falls back to v1.
The only canonical brief number is `duration_minutes`; its JSON wire token must
be one of the integer lexemes `15`, `30`, or `45`. Every other integer-bearing
cross-runtime field—revisions, lifecycle versions, writer generations,
sequences, and remaining milliseconds—also requires an integer JSON token.
Float and exponent forms such as `30.0`, `3e1`, or `writer_generation: 3.0` are
invalid even when a JavaScript decoder would produce the same numeric value.
`latency_ms` is the one finite non-negative measurement field and is not an
authority-bearing integer. Timestamps remain canonical UTC strings, never
numbers or runtime date objects.

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

- an exact state revision used for controller compare-and-swap;
- a read-only lifecycle state/positive-version snapshot used as an independent
  compare-and-swap authority;
- the active transcript writer ID and positive writer generation;
- `controller_phase`, round objective, topic, and selected question ID;
- a clock projection derived from the canonical deadline;
- the controller-derived allowed move set;
- a bounded move-delivery ledger;
- the latest finalized candidate turn ID and its exact authoritative transcript
  revision, either both present or both absent;
- interruption and close state; and
- a `speech_fenced` bit that prevents further interviewer output without
  claiming that the durable session is terminal.

The controller cannot mutate lifecycle rows, extend a deadline, manufacture
settlement, or mark a session complete.

The controller computes `observed_at`, `remaining_ms`, clock band, and close
state in one state projection. `observed_at` cannot precede session start;
`remaining_ms` equals `max(0, deadline_at - observed_at)` exactly; `elapsed` is
used if and only if that value is zero; and an elapsed clock cannot remain
`open`. Warning/closing thresholds remain rollout policy, not SAV-466 latency
baselines.
Move IDs are unique within the bounded ledger. A `closing` phase requires a
requested or admitted close, an admitted close requires the `closing` phase,
and a zero lifecycle version is invalid.

### SAV-471 controller projection

The first controller implementation is a provider-free, immutable reducer with
closed event, move, lifecycle-stage, and failure vocabularies. Its internal
ledger retains at most 24 moves and eight candidate-turn fingerprints, then
projects the accepted runtime-state contract without changing that wire.

The controller anchors the accepted wall-clock deadline to a monotonic start
value and uses exact integer timedelta arithmetic. Its first disabled-by-default
policy uses these remaining-time bands: `normal` above 120,000 milliseconds,
`warning` from 120,000 through 45,001, `closing` from 45,000 through 1, and
`elapsed` at zero. At elapsed it emits neither a move nor a snapshot. It aborts
any active undelivered move and fences its operational state; the existing
hard-deadline watchdog remains the exclusive settlement and termination
authority.

The runtime projects the clock again at the public LLM generation boundary.
Crossing into closing aborts a pending non-close move before provider
generation, while elapsed aborts and fences every pending move. A close already
admitted inside the pre-deadline closing band remains eligible. The model never
owns this check.

Before that projection, the public chat context must carry both the finalized
candidate `ChatMessage.id` bound to the move and the exact
`controller:{move_id}` snapshot identity. Pinned LiveKit preemptive generation
uses a separately created candidate message, so a stale or mismatched context
is denied without clock, revision, or move-stage mutation. Only the exact
finalized context can authorize the admitted move, and it can do so once.

Pinned LiveKit 1.6.5 emits the public `speech_created` event synchronously
before creating that handle's pipeline task. A bounded per-adapter Python task
context carries the candidate handle identity across that ordering boundary,
and the adapter records its internal generation epoch at handle creation. The
epoch advances only when a new directive nonce is admitted. Creation and
ambient task context are not move authority. The adapter also mints an opaque
cryptographically random, single-use nonce for the admitted turn. Exact current
epoch, the first public `generate_reply` handle bound in that epoch,
finalized-turn identity, move identity, and nonce must match; the nonce and
candidate entry are consumed atomically before clock or reducer mutation. A
handle created before the current epoch or later in the same epoch is denied
even if handed the exact new chat context. Denied or replayed authorization is
state-stable, and denied, evicted, duplicate, and replayed handles remain
operational no-ops.

Every accepted public speech creation also receives an opaque, identity-only
completion acceptance that is captured by that event instance's done callback.
Controller completion must present that exact object before it can remove a
created or authorized correlation, advance lifecycle, or correlate transcript
or interruption evidence. A duplicate creation with a reused handle ID receives
no acceptance, so its callback cannot consume or impersonate the still-live
original even when the duplicate callback runs first. The acceptance is
bounded with the in-flight record, never serialized, and cannot readdress an
evicted record. Generic runtime interruption and settlement processing remains
outside this controller check and still runs for every public done callback.

The nonce exists only in the temporary controller system-message ID. Pinned
LiveKit serializes that temporary context to the pre-node `ATTR_CHAT_CTX` SDK
trace before invoking `llm_node`; the nonce may therefore appear in that trace.
The synchronous node consumes it without awaiting. Only after successful
authorization does the runtime replace the nonce-bearing item in an isolated
provider-bound `ChatContext` copy; denied paths do not mutate the shallow-shared
source item. The nonce is absent from provider input, is not snapshot or
message content, is never added to the durable/customer transcript, and is not
emitted by Meelni application logs. A trace observation after consumption
carries no replay authority.

The adapter retains every observed speech-handle identity for the session in a
non-evicting replay ledger with an explicit 1,000-identity cap. In-flight
correlations remain smaller and may evict, but an evicted identity cannot be
accepted again. Capacity exhaustion disables the controller before accepting a
new identity and restores the existing prompt-led interviewer path.

A completed-user-turn snapshot is admitted only from the runtime-final LiveKit
candidate message ID plus the canonical transcript event identity assigned to
that message. This identity is not represented as durably persisted at hook
time: LiveKit invokes the hook before the normal conversation-item publisher.
The later persisted publisher reconciles that same identity. Each snapshot is
limited to 2,048 UTF-8 bytes, includes no more than eight delivered moves, and
permits one substantive interviewer question.

A normal pre-deadline explicit exit admits one graceful
`candidate_requested_close` and becomes terminal only after canonical close
delivery. The adapter recognizes only bounded, anchored stop/end/finish
requests with an explicit interview/session target or clear temporal/deictic
termination context; bare or ordinary answer clauses using those verbs do not
request exit. A completed turn that instead projects elapsed, and every
already-terminal turn, returns normally from the pinned LiveKit user-turn hook
and uses an empty public-LLM-node result so LiveKit still commits/emits the
finalized user item through `conversation_item_added` exactly once. Raising
`StopResponse` for those suppressed turns is forbidden because it bypasses that
commit in LiveKit Agents 1.6.5. After terminal, every recognized shape-valid
event at the exact revision is an identical state no-op; transcript persistence
continues under its independent authority.

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
   state to the ledger entry. The event ID already present in transcript v2 is
   the move-attribution key; transcript v2 is not changed.

Only stage 7 commits delivered history. Generated, scheduled, spoken, aborted,
and unheard interrupted content never enters answer blocks or feedback.

SAV-471 observes delivery only after `TranscriptIngestQueue.publisher` receives
a successful response for the canonical event. An interviewer event may commit
a pending move only when the adapter has positively correlated that move to the
speech handle, assistant item ID, and canonical event ID. The first such event
is the sole commit; unrelated events and later correlated items from the same
speech are ignored at this adapter boundary. Explicit conflicting recommit
evidence remains an error in the pure reducer.

A persisted no-confirmed-prefix interruption marker may upgrade a correlated
aborted move to interrupted only after the queue receives a successful
response and the marker has the active writer, interviewer speaker, and exact
`no_provider_confirmed_prefix` reason. This observer is operational evidence
only and cannot settle the queue or session.

## `InterviewerMove`

An admitted move has exactly one type:

- `probe`
- `clarify`
- `challenge`
- `transition`
- `close`

It carries no spoken text, score, evaluation, coaching, or free-form hidden
rationale. It binds the session, brief, current writer ID/generation, source
state revision, lifecycle version, selected question, bounded topic, optional
finalized source turn, optional round-pack probe candidate, reason code,
creation/expiry, and idempotency key.

Reason codes are closed by move type: probe/deepen reasoning,
clarify/resolve ambiguity, challenge/test tradeoff, transition/advance round,
and close/deadline, candidate request, or catalog exhausted.
`controller_fallback` is permitted for every move type. Probe, clarify, and
challenge require a finalized source turn. Once a delivered transition reaches
the final objective/topic, the catalog is exhausted and the next policy move is
close, including during warning; clamped tail indexes cannot authorize another
transition.

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
3. Treat the tool request deadline as exclusive: at or after that timestamp the
   request is expired.
4. For every state-sensitive or mutating tool, independently require current
   time to be strictly before the canonical runtime deadline. At or after the
   session deadline, return `deadline_elapsed` even when the call deadline and
   move expiry remain live. Read-only state/clock access does not admit a move.
   While both deadlines remain live, accept a move's own expiry through its
   exact timestamp; one millisecond after it is expired.
5. Compare `expected_state_revision` to the current revision. A mismatch
   returns `stale_state` and changes nothing.
6. Compare positive `expected_lifecycle_version` to the fresh durable
   lifecycle version. A mismatch changes nothing.
7. Validate lifecycle/deadline snapshot, allowed move, one-question policy,
   probe eligibility, close/speech fence, and no-coaching policy. Probe lookup
   requires `probe`, move commit requires the move's exact type, and graceful
   close requires `close` in the fresh state's `allowed_moves`.
8. Admit exactly once and advance the controller state revision once. Commit
   and close requests do not themselves advance the independent lifecycle
   version.

Failures never partially apply the rejected request. On the live tool handle, a
failure separately invokes deterministic controller fallback policy: the
controller may admit exactly one `controller_fallback` move at the next
generation boundary to authorize one tool-free reply. A reduced system
instruction carries only its move type, question ID, and topic. That policy
transition is not a partial success, cannot use model-supplied move fields, and
still requires canonical transcript evidence to commit delivered history.
`assessInterviewerToolRequestAgainstState` and its Python mirror implement the
fresh-state comparison; a lifecycle-version mismatch returns
`stale_lifecycle` independently of controller-revision freshness.

The mutation request carries `request_digest =
"sha256:" + SHA256(UTF8(canonical_semantic_payload))`. The semantic payload
sorts every object key recursively, preserves array order, and includes
contract/tool name, session, writer ID/generation, absolute request deadline,
expected controller and lifecycle versions, and either the complete move or
close reason. It excludes only retry-local `call_id`, the outer
`idempotency_key`, and `request_digest`; the move's own idempotency key remains
inside a commit payload. TypeScript and Python use identical Unicode-scalar and
integer rules. Reordered keys therefore replay as `duplicate`; changing one
semantic field under the same idempotency key is `idempotency_conflict`.

### Interruption

An interrupted interviewer turn commits delivered history only when the
canonical transcript contains a provider-confirmed `partially_delivered`
event whose event ID, writer ID/generation, and sequence exactly match the
ledger evidence. An interruption with no provider-confirmed prefix remains
non-delivery operational state and may cite the existing metadata-only
`integrity_unavailable` marker by the same immutable identity tuple. The marker
never turns unheard text into delivery evidence. Exact event replay dedupes to
the same attribution; a conflicting replay or identity mismatch fails closed.

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
bind the expected state revision and positive lifecycle version; mutations
require an idempotency key and canonical semantic request digest.
`get_probe_candidates` also binds the active selected-question ID. The pending
request correlation rejects any successful candidate list containing another
question, and fresh-state admission applies the same check to committed moves.
The state-sensitive/mutating adapter also requires the implied or explicit move
to remain in `allowed_moves` and rejects admission with `deadline_elapsed` at
the exact canonical session deadline, independently of the per-call deadline.
The deterministic controller may still choose its separate deadline-close
fallback; a late tool call cannot authorize that transition.

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

The LiveKit surface uses exactly these five public `function_tool` descriptors
and pins `max_tool_steps=3`. While the controller is healthy, model generation
requires a tool until commit/close binds the handle. The first tool failure,
repeated name, recursive/concurrent attempt, or continuation overflow invokes
one deterministic controller fallback move, immediately fences later tool
calls, permits one tool-free reply, and then denies later re-entry. The adapter
separately permits at most three same-public-handle continuations for a tool
turn. A fourth tool call and any tool call after commit/close are fenced.
SAV-471 prompt-led handles remain single-use; continuation requires the explicit
tool-turn authority bit and cannot mint a second generation nonce or move
capability.

Each accepted public speech event still owns one opaque, non-serializable
completion acceptance object. Only object-identity agreement with that exact
handle instance may remove its record or correlate delivery. Tool calls and
model output do not stage delivery evidence. A move becomes delivered history
only through the existing acknowledged canonical interviewer transcript path.

Every `ok` or `duplicate` result validates its payload against the result
envelope, not only against the payload schema. A returned runtime state must
match the envelope session, active writer ID/generation, and exact
`observed_state_revision` and `observed_lifecycle_version`. A committed move
must match the envelope session and writer ID/generation, its
`based_on_state_revision + 1` must equal the result's controller revision, and
its lifecycle version must equal the result lifecycle version. An exact
duplicate returns the original post-commit result, so it obeys the same rules.

Before adapter use, `assessInterviewerToolResultForRequest` (and its Python
mirror) compares the result to the one pending request by call ID, tool name,
session, writer ID/generation, absolute request deadline, expected controller
revision, and expected lifecycle version. Exact request deadline is expired.
Identity mismatch, stale revision, or expired correlation rejects the result
even when its standalone schema is valid. Consumers therefore never accept a
cross-call, cross-tool, cross-session, fenced-writer, or revision-detached
result.

Telemetry records only tool name, contract version, closed outcome, and latency.
Tool arguments/results, prompt/model content, transcript content, free-form
rationale, and chain of thought are off by default.

## `DirectorRecommendation`

The Director observes bounded context off the media critical path. Interim
input may start speculative work, but the output must record
`source_finality=speculative` until reconciled to an exact finalized turn and
transcript revision.

A recommendation contains only the allowed move type, target
question/topic/source turn/probe candidate, reason code, state and writer
versions, policy and model-adapter versions, creation time, and expiry. It
contains no spoken prose, score, feedback label, lifecycle action, or chain of
thought.

SAV-474 stores only recommendations reconciled to finalized candidate text.
Speculative interim work is labeled inside the bounded context and is either
reconciled by content digest to the exact final transcript revision or
canceled/discarded. Raw interim text is never stored as recommendation,
transcript, evidence, telemetry, or customer output.

While the controller has a canonical pending move, its live `allowed_moves`
is empty. The shadow context may use the global accepted move vocabulary only
for counterfactual comparison. That vocabulary cannot admit, generate, or
speak a move and never enters the controller snapshot or live model chat. It
becomes empty at an elapsed/zero-remaining deadline, speech fence, or lifecycle
outside connecting/active/reconnecting.

Recommendation TTL is positive and at most 10,000 milliseconds; an admitted
move TTL is positive and at most 30,000 milliseconds. These are bounded
freshness windows, not claims about the measured latency baseline.

The deterministic controller may admit a recommendation only when:

- session, brief, writer, state revision, and lifecycle version are current;
- the source is the latest finalized candidate turn at the exact authoritative
  transcript revision;
- the target question is the current active/selected question;
- current time is at or after creation and at or before expiry;
- durable lifecycle is exactly `active`, speech is unfenced, and current time
  is strictly before the canonical runtime deadline;
- the move remains allowed by phase, ledger, and close policy; and
- influence is enabled for the authorized rollout cohort.

The exact canonical deadline is already elapsed for admission purposes: a
recommendation evaluated at `now == deadline_at` returns `deadline_elapsed`, as
does every later instant, even when its own TTL has not expired. During
`reconnecting`, the Director may continue shadow planning, but no recommendation
is admitted until a fresh `active` runtime-state revision reconciles the latest
turn, transcript revision, active question, writer, and deadline.

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

The executable invariant runs the frozen transcript plus writer integrity and
settlement authority through the production trusted closed-answer-block
projection and production dimension-coverage prompt builder. This remains true
even when brief rationale, controller phase, move IDs,
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

- local-tool or live Director-influence implementation;
- an application Director provider/model adapter or Preview/Production shadow execution;
- provider/model selection or migration;
- a new feedback rubric, live scoring, or incremental feedback authority;
- public demo changes;
- Production/provider mutation, customer transcript access, or launch action.
