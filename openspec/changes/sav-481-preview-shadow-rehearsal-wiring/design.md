# Design

## Pre-room ordering

One dedicated server workflow receives explicit stable allocation inputs and a
LiveKit provider. It calls the SAV-480 store first. Only an executable lease
result can be serialized into job metadata and passed to
`startInterviewRoom`. Closed or failed admission never reaches the provider.

## Private dispatch envelope

The envelope carries the lease, worker-evidence capability, and allocation
result revision. It is job metadata for the named agent, not room or participant
metadata. TypeScript and Python enforce the same closed shape, bounds, and
canonical fixture.

The LiveKit integration adds optional dispatch metadata to atomic room
creation and reconciles exact bytes on retry. The option is absent for all
existing callers.

## Runtime construction

A Python bootstrap parses the envelope and delegates to the existing
lease-bounded runtime factory. Durable admission verification and the OpenAI
transport remain injected dependencies. The main interview entrypoint does not
import or call the bootstrap, so the default Director stays provider-free.

## Evidence return

A server facade accepts exactly one runtime receipt or incident plus explicit
worker capability and current revision, then calls the durable store. It does
not hide revision conflicts or add a background retry mechanism.

## Boundaries

No raw capability enters logs or durable evidence. No termination or run-control
capability enters the worker job. No LiveKit, provider, environment, or shared
database operation is part of repository validation.
