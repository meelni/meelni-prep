# Design

## Connection-time repair

When LiveKit reports transport `connected` or recovered, the browser holds the
product state at connecting/reconnecting and calls an owner-authenticated
presence endpoint. The endpoint verifies session ownership and inspects the
candidate plus voice-agent participants through the server LiveKit adapter.
Those facts are applied through `reconcileInterviewPresenceWorkflow`, exactly
like scheduled missed-webhook repair.

The browser retries a bounded sequence while an agent job is joining. It reports
Connected only for `activated`, `present`, or `recovered`. Exhaustion enters the
existing disconnected credential-recovery path instead of displaying a
transport-only false positive.

## Security and idempotency

Cross-user requests return not found before provider inspection. Every request
uses a unique delivery identity, while lifecycle versioning and normalized
transport event identities keep transition application idempotent. Responses
are private and no-store.
