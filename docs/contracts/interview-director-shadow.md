# Read-Only Interview Director Shadow

Status: repository implementation for SAV-474; runtime and provider execution
remain disabled

## Purpose and authority

The Interview Director is an asynchronous, session-local observer for comparing
a bounded recommendation with the canonical interviewer move after delivery.
It is not an interviewer, controller, evaluator, transcript writer, settlement
worker, tool host, or source of customer-visible output.

The repository entrypoint constructs the observer behind the exact server flag
`MEELNI_INTERVIEW_DIRECTOR_SHADOW_V1_ENABLED=true`, but deliberately injects
`adapter=None`. Therefore the application cannot execute Director work in this
slice even if the flag is present. Only provider-free tests inject
`DeterministicFakeDirectorAdapter`.

Director results have no path into:

- the live model chat context, prompt, speech, or voice generation;
- the SAV-471 controller state, snapshot, allowed moves, or lifecycle;
- transcript events, answer blocks, feedback evidence, scoring, or customer
  output;
- deadline watchdogs, settlement, database, billing, credits, accounts,
  secrets, or privileged tools.

The runtime calls the observer only after successful transcript persistence,
ignores its bounded status return, and continues room projection independently.
Shutdown drains/cancels Director tasks before closing semantic observability;
settlement cancels Director work without awaiting it on the settlement path.

## Contracts

`director-recommendation.v1` contains exact fields for:

- policy and model-adapter versions;
- recommendation, session, brief, writer, writer-generation, controller-state,
  and lifecycle identities;
- finalized source turn ID and authoritative transcript revision;
- one accepted move type, question/topic/source target, optional bounded probe
  candidate ID, and closed reason code;
- canonical creation time and deterministic expiry no later than 10 seconds or
  the session deadline.

It contains no prose response, prompt, transcript quote, evidence quote,
candidate score, feedback label, provider payload, tool payload, or chain of
thought. Unknown versions, extra keys, malformed timestamps, mismatched reason
codes, and unsafe identifiers fail closed with content-free error codes.

Implementation-local versions are:

- `interview-director-policy.v1`;
- `interview-director-adapter.fake.v1` (synthetic tests only);
- `interview-director-context.v1`;
- `interview-director-runner.v1`;
- `interview-director-store.v1`; and
- `interview-director-shadow-trace.v1`.

## Finalized and speculative input

Authoritative recommendations are published only for successfully persisted,
finalized candidate turns. Interim text may start speculative local work through
the explicit speculative API. That context is marked `speculative`; no
recommendation enters the store until final text is received.

If final text has the same content digest, completed speculative work is
reconciled to the final turn ID/revision and materialized as
`source_finality=finalized`. If content differs, the old task/result is canceled
or discarded and only the final revision may run. Raw interim text and hidden
reasoning are absent from recommendation storage and telemetry.

When matching speculative work is still in flight, finalization captures the
exact current controller/lifecycle authority and the finalized-turn
availability time. The eventual result is materialized against that final
authority, not the earlier speculative state revision, and is rejected if that
captured authority is no longer current at publication.

## Counterfactual move vocabulary

When SAV-471 has already admitted the canonical move, its live `allowed_moves`
is intentionally empty while that move is pending. Shadow comparison may still
evaluate a counterfactual recommendation against the global accepted move
vocabulary (`probe`, `clarify`, `challenge`, `transition`, `close`). This does
not grant admission or generation authority: the vocabulary exists only inside
the Director context and result validator, and no result flows back to SAV-471.

The counterfactual vocabulary is empty when the deadline is elapsed or has zero
remaining time, speech is fenced, or lifecycle is outside `connecting`,
`active`, and `reconnecting`. Such work is not started or is rejected as stale.
Influence remains separately absent and belongs to SAV-475.

## Bounded runner and storage

The provider-neutral adapter interface defines prewarm, session affinity,
recommend, recovery, and close boundaries. `DirectorLimits` applies hard
ceilings to context turns/bytes, per-turn bytes, output bytes, reasoning units,
deadline, retries, concurrency, estimated micro-USD cost, pending tasks,
recommendation-store capacity, and TTL. Runtime settings cannot exceed the
compiled ceilings.

The in-memory store is owned by one session and active writer generation. It:

- keeps the latest fresh finalized recommendation by source turn/revision;
- rejects cross-session/writer access, malformed values, replay conflicts,
  expired results, and older out-of-order completions;
- deduplicates recommendation and delivery identities;
- compares only exact session/source turn/source revision/move attribution;
- explicitly classifies a recommendation arriving after delivery; and
- clears recommendations, delivery correlations, and replay state on writer
  generation rollover or settlement.

Capacity is explicit and fail-closed. Slow, failed, timed-out, canceled, stale,
malformed, or over-capacity work emits bounded metadata and has zero live effect.
Director-ready latency starts when the persisted finalized candidate turn is
available to the observer and ends at recommendation publication. It therefore
includes pending concurrency/semaphore time and bounded context construction;
speculative-ready work does not emit a finalized-turn readiness measurement.

## Telemetry and comparison

`interview-director-shadow-trace.v1` records only closed outcome/freshness/
comparison vocabularies, contract/policy/adapter versions, move categories,
bounded readiness/age latency, deterministic estimated cost, and emission time.
Its SAV-469 projection uses the existing `director` semantic event and carries
no session ID, turn ID, transcript, prompt, quote, provider/model name, secret,
tool payload, or reasoning.

Result events and later comparison events are distinct observations. Aggregate
result counts and readiness percentiles include only result events; an expired
comparison marks that result stale without adding a second denominator entry.

Exact attribution remains inside the bounded session-local comparison record:
session, source turn/revision, recommendation, canonical delivered move, and
delivery event. Synthetic SAV-467 fixtures test comparison plumbing and
contract validity only. They do not establish real-model quality, cost, or
readiness thresholds.

## Future owner gate

The smallest future action is an owner-authorized isolated Preview shadow
rehearsal with an owner-selected server adapter/provider/model, explicit spend
cap, metadata-only telemetry review, and accepted quality/cost/freshness gates.
That action is not included here. Production, default-on, influence, launch,
and merge remain separately controlled.
