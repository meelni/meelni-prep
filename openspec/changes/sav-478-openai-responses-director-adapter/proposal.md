# SAV-478: Implement The Selected OpenAI Responses Director Adapter Candidate

## Why

The owner accepted the first SAV-476 gate and selected one exact adapter,
provider, model snapshot, spend/privacy envelope, and metric thresholds. A
reviewable provider-specific candidate is required before the owner can issue a
separate authorization for an isolated Preview shadow rehearsal.

## What Changes

- Check in and validate the exact closed candidate-preparation authorization.
- Add a stateless OpenAI Responses implementation behind `DirectorAdapter`.
- Build a strict no-tools/no-storage/no-continuation request from bounded
  untrusted transcript data.
- Normalize one structured response and safe usage into the existing bounded
  provider-neutral result with conservative integer micro-USD cost.
- Add an injected official-SDK transport and provider-free fake coverage.
- Preserve `adapter=None`, all default-off flags, and every live owner gate.

## What Does Not Change

No credential/env read, provider call/spend, deployment, live room, customer
data, Preview influence, Production/default-on, GO/NO-GO, or runtime activation
is included. The deterministic controller, transcript, feedback, settlement,
and current interviewer remain authoritative.
