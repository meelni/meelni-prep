# Control-Plane Activation Environment Delta

## Requirement: activation is data-plane independent

Durable Preview-shadow activation and stop MUST require the canonical Preview
Supabase database identity and exact Vercel Preview/staging markers. They MUST
NOT require or read a LiveKit URL, worker name, API key or API secret and MUST
make no LiveKit/provider call.

## Requirement: room boundaries remain strict

Preview room construction MUST continue to require the complete canonical
Preview LiveKit identity. Production-project room construction MUST continue
to require its complete canonical Production LiveKit identity and separate
one-use Production actions. A control-plane activation MUST satisfy neither
room boundary.

## Requirement: fail closed

Missing, malformed, Production, generic Preview or mismatched database/staging
identity MUST reject activation before database or provider work. No parser may
search ambient environment or invent fallback credentials.
