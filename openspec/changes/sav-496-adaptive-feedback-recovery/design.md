# Design

The web already owns the LiveKit project secret and the worker already receives
an explicit `MEELNI_TRANSCRIPT_INGEST_SECRET` copy of that value. Both sides
derive an admission-only HMAC key using a new fixed context, then retain the
existing payload-domain signature. The worker never verifies with its
provider-injected `LIVEKIT_API_SECRET`. Construction returns only closed
admission/provider reason codes and never logs admission or secret material.

The local settlement fence remains synchronous: apply the semantic cutoff,
begin measured evidence drain, disable input/output, and invoke one force
interrupt. The returned Future is retained and awaited by speech settlement;
speech settlement must not issue a second interrupt.

The queue keeps one reserved terminal slot but treats settlement as a barrier.
It attempts transcript turns, integrity markers, and runtime events first. A
settlement cannot be posted while any such item remains pending or persisted.
Permanent evidence failures may still be followed by a degraded settlement.
Hung evidence instead leaves settlement unpersisted within the bounded wait, so
the server freezes the committed gap-free prefix as partial under the existing
authority instead of closing the endpoint ahead of that evidence.
