# Stateful Interviewer Contracts Preserve Existing Authorities

Date: 2026-08-18
Status: accepted
Issue: SAV-466
Decision owners: engineering contract; Production/default-on remains human-owned

## Context

The current full-interview runtime receives version-1 room metadata and relies
on a versioned interviewer prompt, the canonical deadline, transcript v2,
writer settlement, derived answer blocks, and post-interview feedback
contracts. SAV-465 adds adaptive decisions, but a planner or live model must
not become an accidental authority for time, lifecycle, delivered speech, or
candidate evaluation.

The new work also has to roll out across TypeScript and Python without making
an uncoordinated top-level room-metadata version change.

## Decision

Adopt the contracts in
`docs/contracts/stateful-interviewer-decisions.md` with these governing rules:

1. Keep top-level room metadata at version 1. Carry `InterviewBriefV2` as an
   optional independently versioned nested field and deploy readers before any
   writer enables it.
2. Make the brief deterministic and replay-stable by hashing a canonical
   payload bound to stable session-start state. Do not use compilation time,
   random IDs, model output, or unordered inputs.
3. Put phase, allowed moves, probe history, and close intent in a deterministic
   controller that remains subordinate to lifecycle, deadline, transcript,
   settlement, answer-block, and feedback authorities.
4. Treat `DirectorRecommendation` as asynchronous advice. The controller
   validates and admits; the one live interviewer alone speaks.
5. Distinguish recommended, admitted, generated, scheduled, spoken,
   interrupted/aborted, and canonically delivered states. Only durable
   transcript evidence commits delivered history.
6. Expose only five session-scoped, non-privileged tools with explicit
   deadlines, CAS, writer fencing, idempotency, typed failures, and immediate
   fallback.
7. Keep Director and tool content out of canonical transcript, answer blocks,
   and feedback evidence. Identical canonical evidence must produce identical
   evaluator input/authority regardless of operational traces.
8. Define latency anchors here, but let SAV-467 and SAV-469 establish the
   numeric baseline and regression gates.
9. Keep every new behavior default off and reversible. Production/default-on
   activation remains an explicit human-owner decision.

## Consequences

- Existing v1 sessions and old readers continue to work.
- A malformed nested brief degrades to validated v1 behavior rather than
  weakening interview policy or preventing a safe current-runtime start.
- Downstream implementations receive strict TypeScript/Python schemas and one
  golden fixture, but this decision does not authorize runtime influence.
- The controller must integrate through existing lifecycle and transcript
  adapters instead of creating competing terminal or evidence state.
- Reconnect and interruption work must reconcile from canonical writer
  evidence; ephemeral model memory is insufficient.
- Additional operational traces can improve debugging and benchmarking but
  cannot affect feedback truth.

## Rejected alternatives

### Introduce top-level room-metadata version 2 now

Rejected because it requires a coordinated reader/writer migration before the
brief compiler exists and would make rollback harder. An optional nested
contract gives a reader-first path.

### Let the Director or voice model own the next move

Rejected because stale recommendations, variable latency, reconnects, and
model memory would then control deadline, repetition, and close behavior.

### Persist generated prompts as delivered history

Rejected because interrupted or unheard speech is not candidate-visible fact
and cannot safely drive follow-up suppression or feedback.

### Feed planner/tool traces to evaluation

Rejected because hidden operational state is not candidate evidence and would
break replayability and trust.

### Set performance targets without a recorded baseline

Rejected because SAV-467 and SAV-469 own the reproducible benchmark and timing
instrumentation needed to choose defensible numeric gates.

## Follow-up

- SAV-467: baseline the current multi-turn interviewer.
- SAV-468: implement the deterministic brief compiler and round packs.
- SAV-469: instrument decision quality and latency anchors.
- SAV-471: implement the pure controller and authoritative clock projection.
- SAV-472: implement the accepted local tool adapters.
- SAV-473: add adaptive evidence-isolation fixtures.
- SAV-474/SAV-475: shadow and then separately gate Director influence.
- SAV-476: rehearse and canary only through the owner-controlled rollout gate.
