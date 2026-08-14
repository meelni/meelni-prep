# Shadow Feedback Execution And Comparison Contract

## Authority boundary

Shadow feedback is a default-off, non-authoritative measurement path. Only a
successful SAV-441 projection from one terminally frozen canonical ledger may
create `feedback.shadow-scheduling-intent.v1` work. `complete` and
`verified_prefix` are the only schedulable projection states. No pre-terminal
authority exists, and this contract does not authorize LiveKit or interview
runtime changes to manufacture one.

Final batch feedback remains the sole authority for customer feedback,
feedback lifecycle completion, insights, progress, billing, UI, and interview
behavior. A shadow outcome or disagreement cannot satisfy or mutate any of
those paths.

## Structural default-off composition

`MEELNI_SHADOW_FEEDBACK_EXECUTION` is disabled when absent or blank. Only the
exact server-process value `enabled` mints its opaque capability. Unknown
values and forged objects fail closed. The production gate accepts no caller
environment override.

Scheduling, evaluation, and comparison require both this independent
execution capability and the SAV-445 storage capability. They validate the
capabilities and a configured provider-neutral runtime before any database
read/write, durable event send, evaluator call, comparison read, sleep, or
operational result. A malformed cost-rate contract or non-callable evaluator
is `runtime_unavailable` before dependency access.

The registered application composition supplies no evaluator or provider
adapter. Enabling settings alone cannot perform evaluation. Provider
configuration, spend, activation, deployment, and Production action require a
separate reviewed change and human authorization.

## Content-free scheduling and durable work

`feedback.shadow-scheduling-intent.v1` contains only its version, a
deterministic intent/idempotency fingerprint, the terminal freeze anchor, and
the SAV-445 exact artifact key. That key binds session UUID, trusted block
fingerprint, rubric version, prompt version, selection-schema version, and
model version.

The durable evaluation event ID derives only from the immutable intent. It
never embeds the arbitrary upstream delivery ID. The event adds only the owner
UUID required for service routing and rejects unknown fields or oversized
payloads.

Evaluation recomputes the current frozen projection, exact-matches the intent,
and gives one trusted answer block to an injected evaluator only in memory.
Transcript, answer, prompt, evidence prose, provider payload, raw error,
request ID, and credentials never enter durable event or step output.

## Deadline, retry, replay, and concurrency

Shadow evaluation reuses the SAV-444 90-second deadline and typed retry
policy. After every durable retry sleep and final deletion/session fence, the
workflow recomputes the current attempt plan. It starts no evaluator request
when the remaining provider budget is below policy minimum. Retry-after values
are normalized to the policy bound or null, usage is strictly bounded or null,
and duration is always a finite integer from 0 through 90,000 before a
memoized step result is returned.

Evaluation concurrency is one per exact artifact key. Event, function, step,
and evaluator idempotency identities are deterministic. Exact-read-before-work,
memoized evaluation/persistence steps, and immutable insert mean completed
event replays, reconnects, and step-complete crash retries converge without
repeating known completed work.

This is not a universal exactly-once claim. A request already in flight cannot
be cancelled reliably, and an external evaluator may complete before its
response is durably memoized. A future adapter must honor the supplied
idempotency key. If deletion begins while a call is in flight, the returned
output is discarded and no artifact is stored.

## Deletion and stale-authority fences

Every side-effect boundary rechecks the account deletion tombstone and exact
session owner/freeze anchor. Scheduling checks immediately before sending
events. Evaluation checks before exact reads, after retry sleeps, immediately
before physical evaluation, and before and inside persistence. Comparison
checks before every artifact/batch read, before every wait, and before returning
a report.

Foreign-key cascade remains defense in depth. The primary behavior is to stop
new durable metadata and discard in-flight evaluator output once deletion is
observed. This contract does not promise cancellation of an external request
that already started.

## Bounded comparison wait

The authoritative `insights/update.requested` batch-completion event starts a
single event-anchored wait horizon equal to the SAV-444 evaluation deadline:
90 seconds. Comparison performs at most 19 exact artifact-set reads, separated
by at most eighteen replay-stable five-second durable sleeps. It recalculates
remaining time after asynchronous fence checks and never schedules a zero or
negative sleep.

Missing artifacts are reread until they arrive or the horizon is exhausted.
Failed artifacts are terminal and are not waited on; any concurrently missing
keys may still use the remaining bounded wait. Disabled/malformed runtime or
capability paths perform no read or sleep. Timeout produces an incomplete
report with the remaining exact-key count and does not delay or change batch
feedback completion.

## Batch adapter and report

The service-only batch adapter strictly reparses completed persisted dimension
coverage, binds evidence references to the current trusted block fingerprints,
and then strips summary, evidence/answer prose, evaluator versions, and
provider text. Non-completed, malformed, stale-projection, or invalid-timing
rows return no authority.

`feedback.shadow-comparison-report.v1` is a bounded exact object containing
only artifact-state counts; facet, mode, and score agreement; closed failure
counts; bounded token/cost estimates; post-freeze potential lead or
unavailable; and the explicit replay/external-completion limit.

Every expected artifact must be represented by exactly one successful,
failed, or missing state. Failed identifiers exactly equal failed artifacts.
A report is complete only when every expected artifact succeeded. Invalid
reports use one exact all-zero/null/unavailable sentinel. Latency is available
only for a complete successful set whose batch and shadow timestamps share the
same terminal freeze anchor; failed or missing work cannot look like faster
feedback. This reports post-freeze potential only and cannot prove true
during-interview latency savings.

Reports contain no user/session identifier, artifact key, transcript, answer,
prompt, evidence prose, summary, provider payload, request ID, raw error, or
arbitrary string. They are not written to a product table and do not emit
through feedback, insights, billing, UI, or interview ownership.

## Provider-free regression matrix

| Fixture                                                    | Required result                                               |
| ---------------------------------------------------------- | ------------------------------------------------------------- |
| Either capability disabled/forged                          | zero DB, event, evaluator, sleep, and report effects          |
| Runtime absent/malformed                                   | `runtime_unavailable`; zero dependency access                 |
| 1/2/5/10 equivalent segmentation                           | identical content-free intents                                |
| Different source delivery IDs                              | identical durable evaluation event IDs                        |
| Replay/reconnect                                           | exact read returns terminal work; no evaluator repeat         |
| Crash after memoized evaluation                            | replay persists once without reevaluation                     |
| Deletion before send/read/call/write/report                | fenced with no applicable downstream effect                   |
| Deletion during evaluator call                             | call may finish; output is discarded                          |
| Artifact arrives after 4 seconds but within policy horizon | later exact read compares it                                  |
| Horizon expires                                            | bounded reads/sleeps; remaining keys reported missing         |
| Failed terminal artifacts                                  | immediate incomplete report; latency unavailable              |
| Malformed retry/usage/clock data                           | bounded content-free step result                              |
| Shadow disagreement                                        | aggregate disagreement; product-authority tripwires untouched |

All fixtures are synthetic and provider-free. This slice adds no migration,
live adapter, paid comparison, customer data, Production mutation, deployment,
default-on action, or launch action.
