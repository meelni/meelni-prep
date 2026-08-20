# OpenAI Responses Interview Director Adapter

Status: accepted SAV-478 repository candidate contract; runtime execution is
not authorized

## Identity and authority

- Adapter ID: `meelni_director_openai_responses`
- Adapter version: `interview-director-adapter.openai-responses.v1`
- Provider: `openai-api`
- Direct API base URL: exactly normalized `https://api.openai.com/v1/`
- Model snapshot: `gpt-5.4-mini-2026-03-17`
- Official Python SDK: exactly `openai==3.3.1`
- Request contract: `interview-director-openai-responses-request.v1`
- Pricing contract: `openai-gpt-5.4-mini-standard-2026-08-19`

The adapter implements only the existing `DirectorAdapter` protocol. It is not
an interviewer, controller, tool host, transcript writer, evaluator, or
credential loader. `agent/interview/agent.py` continues to pass `adapter=None`.

The official transport validates the injected SDK client's normalized
`base_url` both at construction and immediately before a request. Only the
exact direct endpoint `https://api.openai.com/v1/` is accepted. The transport
does not prefix-match or rewrite the value; the SDK may first canonicalize
semantically identical direct spellings such as a missing trailing slash or
explicit default HTTPS port. Any normalized value that retains HTTP, userinfo,
a non-default port, query/fragment suffix, doubled or extended path, proxy,
regional host, or lookalike host fails closed as `invalid_config`. This binds
provider, pricing, and data-control attribution to the selected direct API
rather than trusting an arbitrarily routed injected client.

The checked-in preparation authorization permits implementation/configuration
and provider-free validation only. It grants no provider call/spend,
deployment, live room, Preview influence, Production, default-on, or GO/NO-GO.

## Exact request

The adapter builds one stateless `/v1/responses` request with:

- the exact model snapshot;
- `store:false`, `background:false`, `stream:false`, and disabled truncation;
- `service_tier:"default"`;
- `reasoning:{"effort":"none"}`;
- strict `json_schema` text output;
- `tools:[]`, `tool_choice:"none"`, and `parallel_tool_calls:false`;
- a limit-derived `max_output_tokens`; and
- one JSON input envelope containing only the current topic, allowed move
  vocabulary, source finality, and bounded ordered speaker/finality/text turns.

The request omits session/writer/turn identities, affinity keys, request
metadata, conversations, files, `previous_response_id`, provider tools, remote
MCP, background polling, and streaming. The instruction boundary declares all
input-envelope strings, especially transcript strings, untrusted interview
data. Local code never executes or dispatches instructions found in them.

The strict output object contains exactly `move_type`, `topic`, and
`reason_code`. The provider cannot return prose, a tool call, hidden authority,
or an arbitrary probe identity. For probe/clarify/challenge, the adapter calls
the controller's public pure `probe_candidate_id` helper using the current
question, selected move, and current topic. `list_probe_candidates` uses the
same helper, preventing hash-algorithm drift. Transition and close use no probe
candidate ID.

The provider schema uses only the documented Structured Outputs base subset;
in particular, it does not send unsupported `minLength` or `maxLength` string
keywords. The adapter enforces the non-empty 240-byte topic bound locally.

## Response normalization

Before producing `DirectorAdapterResult`, the adapter requires:

1. `status:"completed"`, no error/incomplete state, exact model, default
   service tier, no previous response, and no background mode;
2. echoed empty tools, tool choice `none`, and parallel tools false;
3. exactly one completed assistant message containing exactly one
   `output_text` item and no refusal/tool/reasoning item;
4. duplicate-key-safe JSON parsing with the exact three schema keys;
5. an allowed move, bounded trimmed topic, and the exact legal reason pairing;
6. complete safe integer input/output/total usage with total equal to the sum,
   and safe output details with zero reasoning tokens; and
7. output bytes, reasoning units, and conservatively rounded cost within the
   caller-supplied `DirectorLimits`.

Unknown, missing, duplicate, malformed, unsafe, mismatched, incomplete, or
over-limit values fail closed with `DirectorError("invalid_adapter_result")`.
Provider errors do not expose response bodies or error strings through the
Director result or telemetry. `asyncio.CancelledError` propagates unchanged.
The SDK `Response` object has no `store` echo; no-storage is therefore proved by
the exact captured request rather than inferred from a response field.

## Cost contract

The official [GPT-5.4 mini model page](https://developers.openai.com/api/docs/models/gpt-5.4-mini)
and [API pricing page](https://openai.com/api/pricing/) observed on 2026-08-19
list standard direct API rates of $0.75 per million input tokens and $4.50 per
million output tokens. The official
[API data controls guide](https://developers.openai.com/api/docs/guides/your-data)
was also reviewed on 2026-08-19 for the selected no-training and retention
boundary.
In integer micro-USD, the conservative estimate is:

```text
ceil((3 * input_tokens + 18 * output_tokens) / 4)
```

Cached input receives no discount in this estimate. A non-direct endpoint,
non-default service tier, regional uplift, pricing change, or model change
requires a new adapter/pricing version and owner binding; this adapter rejects
such request or response attribution.

## Lifecycle and isolation

- Prewarm validates local configuration and transport readiness only; it makes
  no provider call.
- The outer Director runner owns the hard remaining-session deadline and
  cancellation. Each SDK request timeout is no greater than the configured
  `limits.deadline_ms`; the outer runner may cancel sooner when less session
  time remains.
- The adapter-specific limits factory fixes the generic runner retry count at
  zero, and the official client must also have `max_retries=0`. Any nonzero
  retry limit is invalid for this adapter, so one recommendation schedules at
  most one provider attempt.
- Recovery is local/stateless and cannot resume a response or reuse a response
  ID.
- Close releases only the injected transport/client lifecycle.
- Raw provider request/response objects never enter recommendation storage,
  controller/core state, transcript/evidence, feedback, or observability.

The normalized result cost attributes only a successfully validated response;
it is not a provider spend ledger. A rejected, interrupted, timed-out, or
transport-failed attempt could still be billable without returning trustworthy
usage. Provider execution therefore remains prohibited until an authorized
attempt-level spend ledger accounts for every request outcome independently of
Director result normalization.
