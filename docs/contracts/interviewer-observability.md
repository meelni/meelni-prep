# Adaptive Interviewer Observability

Status: implemented contract for SAV-469; export and adaptive behavior remain
default off

`interviewer-observability.v1` is the provider-neutral, content-free event
contract for measuring the stateful interviewer defined by
`stateful-interviewer-decisions.md`. It extends the existing LiveKit
OpenTelemetry trace tree. It does not create another trace vendor, transcript,
lifecycle authority, or feedback input.

## Enablement and authority

The runtime creates the semantic subtree only under the existing Opik gate:
`OPIK_TRACING_ENABLED=true` plus valid Opik configuration. Disabled, invalid,
or failed telemetry is a no-op. The runtime never awaits export.

`OPIK_CAPTURE_CONTENT=true` applies only to the previously approved LiveKit
conversation spans. Both metadata-only and content-enabled modes keep
`interviewer_observability_session` and `interviewer_semantic_event` spans
content-free. The semantic sanitizer accepts only the closed
`meelni.interviewer.*` namespace, reconstructs the exact event or session
envelope, validates every value, and drops the whole semantic span when any
field is malformed. Non-semantic conversation spans cannot export semantic
attributes.

These events are observations, not authority. They cannot admit a move, alter
speech, write or settle the canonical transcript, close a session, or select a
feedback outcome.

## Common envelope

Every event contains exactly:

- `contract_version: interviewer-observability.v1`;
- one closed `event_kind` plus its exact fields;
- random opaque `runtime_correlation_id` and nullable
  `turn_correlation_id`;
- server-derived `runtime_version` and `rollout_cohort` (`current`, `shadow`,
  or `canary`); and
- a canonical millisecond UTC `emitted_at` timestamp.

Correlation IDs are generated for observability only. They must not encode or
copy a user, candidate, session, room, writer, message, provider request, or
job identifier. Runtime and turn values use `run:` or `turn:` plus a random
lowercase UUID-shaped token. A `probe_target_id`, when present, uses `probe:`
plus 32–64 lowercase hexadecimal characters derived without content. It is an
opaque taxonomy correlation, not a readable taxonomy label, question, answer,
prompt, identity, or transcript text.

## Event kinds

| Kind           | Closed fields                                                                                                     | Purpose                                                                            |
| -------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `phase`        | `phase`                                                                                                           | Observe opening, primary question, follow-up, transition, closing, or closed.      |
| `move`         | move contract version, stage, type, nullable probe target ID                                                      | Correlate planned through canonically delivered moves without prompt text.         |
| `tool`         | tool contract version, tool name, typed outcome, latency                                                          | Observe a local interviewer-tool result without arguments or result content.       |
| `director`     | recommendation/policy/adapter versions, outcome, freshness, comparison, ready latency, age, bounded cost estimate | Observe asynchronous Director readiness/comparison without recommendation content. |
| `latency`      | latency kind and milliseconds                                                                                     | Record measured user-speech or controller-decision to first audio.                 |
| `interruption` | stage, delivery observation, nullable recovery latency                                                            | Observe interruption and recovery without speech text or provider IDs.             |
| `fallback`     | closed reason and source                                                                                          | Observe policy, Director, tool, prompt, or runtime fallback.                       |
| `close`        | reason, outcome, completion status, completion authority                                                          | Separate runtime observation from canonical lifecycle completion.                  |

Unknown keys, values outside a closed enum, a non-ASCII label, a timestamp
outside canonical years 0001–9999, or non-finite/negative latency above
86,400,000 milliseconds invalidate the entire event.

## Measurement anchors

- End of user speech is LiveKit's measured `stopped_speaking_at` on an admitted
  canonical user turn.
- First interviewer audio is LiveKit's measured `started_speaking_at` on the
  next admitted canonical interviewer turn.
- Interruption begins when a scheduled speech handle completes as interrupted;
  recovery is the first later interviewer audio not belonging to the
  interrupted handle.
- Tool latency begins at local adapter invocation and ends at its typed result,
  including timeout or unavailable.
- Director-ready latency begins when the source finalized turn is available
  and ends when the recommendation is published. Recommendation age is
  measured at admission or rejection.
- Director shadow comparison is a closed category only. Estimated cost is a
  bounded non-negative integer in micro-USD supplied by the adapter contract;
  neither field contains prompt, transcript, recommendation prose, or provider
  identity, and neither establishes a quality/cost gate.
- Planned, admitted, generated, scheduled, spoken, interrupted/aborted, and
  canonically delivered move events use the accepted SAV-466 transition
  meanings. Only canonical transcript evidence can emit
  `canonically_delivered`.

The current prompt runtime emits only observations it can prove: phase,
user-speech-to-first-audio, interruption/recovery, fallback, and runtime close.
Controller, tool, Director, and canonical completion producers use the same
contract when those default-off slices exist; this issue does not fabricate
their measurements.

## Privacy boundary

Semantic spans never contain transcript, prompt, response, question, tool
argument/result, recommendation content, candidate/user identity, provider or
model identity, session/room/writer/message identifiers, hidden reasoning, raw
errors, credentials, or headers. The sanitizer enforces this boundary even
when an upstream span is malformed and even when conversation content capture
is explicitly enabled for the existing non-semantic trace.

Synthetic fixtures are the only content used by contract and sanitizer tests.

## Aggregates and rollback signals

`interviewer-observability-report.v1` groups exact events by runtime version and
cohort. It reports runtime and measured-turn counts; p50/p95 user-speech to
first-audio, Director-ready, tool, and interruption-recovery latency; repeated
canonically delivered probes; fallback and tool-failure rates; stale Director
recommendations; interruption recovery; and canonical completion.

Completion counts only `close` events whose authority is
`canonical_lifecycle`. A runtime-observed close has `completion_status=unknown`
and cannot raise or lower completion rate.

Interruption recovery is correlated only by a non-null opaque turn ID. An
interrupted turn contributes at most once and ignores unpaired or null-ID
recovery events. The per-turn reduction is input-order independent: duplicate
latencies retain the conservative maximum, and contradictory terminal evidence
resolves to `unrecovered`. Every public rate is bounded to `[0, 1]`.

The comparison function requires caller-supplied minimum samples and regression
thresholds. It compares shadow/canary versions with an explicitly named
current baseline and returns `pass`, `hold`, or `rollback` plus closed signal
codes. Runtime count alone is insufficient: missing user-audio latency,
completion, probe, Director-ready, tool, or interruption-recovery evidence
produces `hold` with `insufficient_sample`, never `pass`. These are operational
recommendations only. They do not set thresholds, enable flags, infer owner
GO/NO-GO, change Production state, or authorize a deployment.

## Failure and evidence isolation

Construction, validation, span creation, export, and close failures are caught
at the telemetry boundary. They cannot block or replace speech, transcript
admission/projection/settlement, runtime close, lifecycle finalization, or
feedback. The one runtime shutdown callback completes the authoritative bounded
transcript drain before starting semantic close work. Synchronous semantic
close is isolated on a daemon thread and receives a 50 ms deadline. After that
deadline the callback returns without waiting; slow, stuck, or failing telemetry
cannot delay transcript settlement or keep process shutdown alive.

The semantic event module is not imported by feedback preparation. Director,
tool, move, and semantic trace fields are excluded before trusted answer-block
projection. Identical frozen canonical transcript and settlement evidence must
continue to produce identical evaluator input and feedback authority.

## Rollout

Keep Opik and every adaptive-interviewer flag default off. Verification is
synthetic and Preview-only. Production tracing, content capture, Director
shadow/influence, canary promotion, thresholds, and GO/NO-GO remain explicit
owner actions under their existing contracts.
