# Adaptive Interviewer Production Web Shadow Canary Delta

## Requirement: owner-only Production route

The canary route MUST fail as not found unless exact Vercel Production
identity, an explicit server-only enable flag and the exact authenticated owner
Supabase UUID all match. The accepted connection MUST also match independently
configured exact run and candidate bindings.
The enablement MUST expire within one hour and MUST be written and activated
only by a fresh one-use Production action bound to the exact web candidate,
source deployment, operation and closed server-only configuration. A separate
signed disable MUST remain available after expiry.

## Requirement: local private credential handling

The browser MUST accept only the strict bounded v2 Production-project
connection contract. It MUST keep the raw file and token in page memory only
and MUST NOT upload, persist, log, analyze or place them in a URL.

## Requirement: no ordinary session authority

The canary MUST NOT call or modify ordinary session start, token recovery,
runtime lifecycle, transcript persistence, feedback or credit workflows.
Non-owner and ordinary Production interviews MUST remain unchanged.

## Requirement: Shadow remains silent

The web canary MAY exercise ordinary interview audio and render in-memory
transcript events. Director recommendations MUST remain unspoken, MUST NOT
change controller authority and MUST NOT grant a later rollout stage.
