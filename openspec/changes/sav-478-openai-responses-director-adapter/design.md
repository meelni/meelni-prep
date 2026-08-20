# Design

## Authorization boundary

The repository stores the exact
`adaptive-interviewer-owner-preparation-authorization.v1` selected by the owner.
A trusted injected clock and exact base/config inputs validate it. Tests also
prove it is not accepted as a rollout transition or Production action. The
positive authority ends at candidate implementation/configuration and
provider-free validation.

## Adapter boundary

`OpenAIResponsesDirectorAdapter` implements the existing `DirectorAdapter` and
depends only on an injected `OpenAIResponsesTransport`. The official transport
accepts a preconstructed official SDK client, requires `max_retries=0`, and
requires the SDK-normalized `base_url` to equal the selected direct endpoint
`https://api.openai.com/v1/` at construction and before each create. The SDK may
canonicalize equivalent direct spellings first; any normalized proxy, regional,
userinfo, non-default port, query, fragment, lookalike, or path-extended value
is rejected. The transport does not read environment values. The fake
transport captures requests and returns scripted mappings without network
access.

The SAV-474 runner remains the hard remaining-session deadline, lifecycle,
affinity, freshness, recommendation, and telemetry owner. The per-request SDK
timeout never exceeds the configured Director deadline, while the outer runner
may cancel it sooner. An adapter-specific limits factory and the SDK client both
fix retries at zero. Cancellation propagates. The adapter locally validates
prewarm/recovery/close state and never creates continuation state.

## Request and privacy

The pure request builder serializes a minimal JSON data envelope. It omits
session/writer/turn identities and labels every transcript string untrusted.
The outer instructions, exact model, no-storage/no-background/no-stream flags,
default tier, reasoning none, disabled truncation, strict JSON schema, and
empty/disabled tools are immutable adapter-version behavior.

There is no `previous_response_id`, conversation object, file, remote MCP,
provider tool, or response persistence. The response ID and raw provider object
are discarded.

## Normalization and cost

The response validator admits one exact completed assistant text output only.
It parses duplicate-key-safe closed JSON, validates the move/reason/topic, and
derives probe IDs through the controller's public pure helper shared with
`list_probe_candidates`. It requires safe complete usage and zero reasoning
tokens. Standard-tier GPT-5.4 mini cost uses versioned 2026-08-19 official rates
and rounds upward, with cached input conservatively charged at full input price.
Every local result then passes `DirectorAdapterResult.validate(limits)`.
That result attributes a validated response, not all potentially billable
attempt outcomes. Provider execution stays unauthorized until independent
attempt-level spend accounting covers failures, timeouts, and interruptions.

## Application isolation

The full-interview entrypoint is unchanged and continues to inject
`adapter=None`. No factory or environment reader is added. This branch cannot
execute the provider candidate through application configuration.
