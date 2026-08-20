# Prepare The OpenAI Responses Director Adapter Candidate

Date: 2026-08-19
Status: accepted repository candidate boundary
Issues: SAV-478 repository candidate; SAV-476 human rollout gate
Decision owners: the human owner selected the candidate and preparation limits;
provider execution, spend, Preview, Production, default-on, and launch remain
human-owned. Repository merge remains supervisor-controlled.

## Context

SAV-474 added a deep, provider-neutral `DirectorAdapter` seam but deliberately
left the application adapter absent. SAV-477 added a closed first-gate
authorization whose only positive authority is repository implementation,
configuration, and provider-free validation of one selected candidate.

The owner approved the canonical adapter ID
`meelni_director_openai_responses`, adapter version
`interview-director-adapter.openai-responses.v1`, provider `openai-api`, and
pinned model snapshot `gpt-5.4-mini-2026-03-17`. The accepted values are bound
to base SHA `0312c34c84509187649a6af46b6c8a21c6a398e5`, rollout configuration
SHA-256 `ff50893d0bc9e3dea640e61323c79f4fe51381264ba98c6cec18f17b341cd042`,
and selected-candidate digest
`b8cc8547c6d2573b7d323b3327ab31bf74c237a1486c13e0e7780a63880e25ac`.

## Decision

Implement one stateless OpenAI Responses adapter behind the existing Python
`DirectorAdapter`. Use the directly pinned official Python SDK only through an
injected transport whose client has `max_retries=0` and whose SDK-normalized
`base_url` is exactly `https://api.openai.com/v1/`; do not add a credential or
environment factory. Reject any SDK-normalized value that retains proxy,
regional, userinfo, non-default port, query, fragment, lookalike, or
path-extended routing at construction and again before create. The application
continues to construct the Director with `adapter=None`.

Every request uses the exact model snapshot, `store:false`, `background:false`,
non-streaming mode, default service tier, `reasoning.effort:none`, strict JSON
Schema output, disabled truncation, and an empty tool surface with tool choice
`none`. It omits `previous_response_id`, conversations, files, remote MCP,
provider tools, and continuation state. Transcript strings are serialized as
untrusted input data and never interpreted as instructions by local code.

The adapter validates the response status, exact model, no-tool/no-continuation
echo, one completed assistant output item, exact closed structured output, and
complete safe integer usage. No-storage is proved on the captured request
because the SDK response does not echo `store`. Reasoning tokens must be zero.
Cost is rounded upward to integer micro-USD from the 2026-08-19 official
[model](https://developers.openai.com/api/docs/models/gpt-5.4-mini) and
[pricing](https://openai.com/api/pricing/) sources ($0.75/M input and $4.50/M
output), charging cached input at the full input rate conservatively. Any
response, output, reasoning, usage, or cost drift fails closed under
`DirectorLimits`.

## Consequences

- Repository tests can exercise the entire normalization boundary without a
  credential, network connection, provider call, or spend.
- Provider response objects, request IDs, errors, and payloads are discarded at
  the adapter boundary and cannot enter the controller, transcript, feedback,
  customer output, or telemetry.
- Probe/clarify/challenge IDs use one public pure controller helper shared with
  `list_probe_candidates`, so the adapter cannot silently copy a private hash
  algorithm that drifts from controller eligibility.
- The outer SAV-474 runner remains the hard remaining-session deadline and
  cancellation authority. The request timeout never exceeds the configured
  Director deadline, and the adapter-specific limits plus SDK both fix retries
  at zero.
- Normalized successful-response cost is not a complete spend ledger. Any
  future provider execution remains blocked until authorized attempt-level
  accounting also captures failed, interrupted, rejected, and timed-out calls.
- This decision does not authorize enabling the adapter. SAV-476 still requires
  a new exact-SHA/config authorization and live rehearsal matrix after merge.

## Rejected alternatives

### Wire the adapter into the interview entrypoint

Rejected because the first owner gate authorizes candidate preparation only,
not provider execution or a live stage.

### Use LiveKit's conversational LLM wrapper for the Director

Rejected because the Director needs a smaller stateless request/response and
usage-normalization boundary, not voice-session chat continuation or tools.

### Accept free-form JSON or provider convenience output

Rejected because schema, tool, continuation, usage, output, reasoning, and cost
drift must fail closed before entering the provider-neutral Director result.
