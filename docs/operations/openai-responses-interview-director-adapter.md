# OpenAI Responses Interview Director Adapter Operations

Current state: repository candidate only; provider execution prohibited

## Safety boundary

SAV-478 adds an owner-selected adapter implementation but does not activate it.
The application must continue to contain:

```python
adapter=None
```

Do not add `OPENAI_API_KEY` reads, construct an `AsyncOpenAI` client from the
environment, enable any adaptive flag, deploy, start a live room, or make a
Responses API request in this slice. Do not use a customer transcript.

The checked-in authorization at
`docs/evidence/sav-478-director-adapter-preparation-authorization.json` is valid
only for repository candidate preparation. Its external Linear reference was
verified by the supervising agent. The parser proves closed shape, injected
time, and exact digests; it does not independently authenticate the owner.

## Provider-free verification

Use Node 22.22.0 and the Python fake transport:

```bash
python3 -m unittest agent.test_openai_responses_director_adapter
npm run test:agent
npm run test:python-agent
npm run test:integrations
npm run test:interviewer-benchmark
npm run interviewer:benchmark:verify-baseline
npm run interviewer:rollout:verify-readiness
npm run check
npm run verify:agent
npm run build
```

The request-capture tests must prove exact model/SDK/request pins,
the exact SDK-normalized direct base URL `https://api.openai.com/v1/`, rejection
of custom/proxy/regional/lookalike endpoint variants before network activity,
zero generic-runner and SDK retries, strict schema, no tools, no storage, no
continuation, no identity fields, a request timeout no greater than the
configured deadline, earlier outer-runner cancellation when required, and
untrusted transcript serialization. Because the SDK response does not echo
`store`, response tests cover
status/model/service/background/continuation/tool, schema, usage, reasoning,
output, and cost drift plus cancellation/recovery/close.

## Failure and rollback

Malformed, incomplete, timed-out, canceled, failed, stale, or over-budget
adapter work has zero live effect and is normalized by the existing SAV-474
runner. The adapter exposes no speech, controller, transcript, feedback,
settlement, billing, account, or tool authority.

Across the adapter seam, request deadline, transport/service failure, and
returned-response normalization failure remain distinct content-free codes:
`deadline_exceeded`, `transport_unavailable`, and `invalid_adapter_result`.
Cancellation propagates unchanged. Never attach a raw provider exception,
request ID, response body, transcript, or endpoint detail to those codes.

Do not interpret a normalized successful-response cost as a provider spend
ledger. Provider execution remains prohibited until an authorized attempt-level
ledger accounts for failures, timeouts, interruptions, and rejected responses.

Repository rollback is removal of the candidate module/tests/docs/dependency
pin; current application behavior does not change because no adapter is wired.

## Second owner gate

After this candidate is independently reviewed, passes exact-head terminal CI,
and merges, SAV-476 requires a fresh owner authorization bound to the new merged
SHA and configuration before any isolated Preview shadow provider call. That
gate must also bind the all-round/adverse-voice rehearsal matrix and reconfirm
the selected caps, privacy/retention terms, thresholds, and hard stops.

No first-gate evidence may be reused as live authority.
