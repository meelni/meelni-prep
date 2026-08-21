# Join Production Shadow Through An Owner-Only Web Canary

Status: accepted

Issue: SAV-487

## Decision

The actual Production Meelni web product may expose one hidden owner-only page
that joins an already-authorized `production_project_shadow` room. The page
does not allocate a lease, create a room, mint a token, call the staging
control plane or enter the ordinary customer session workflow. The existing
guarded operator remains the sole allocation-before-room authority.

The operator writes a versioned private external connection file. The owner
selects that file locally in the browser. Its short-lived LiveKit token exists
only in page memory: it is never posted to Meelni, persisted in browser
storage, logged, analyzed, placed in a URL or included in evidence. The parser
requires exact Production-project topology, room host, candidate/config
digests, session binding and unexpired lease metadata before connecting.

The server route fails as not found unless all of these independently match:

- Vercel Production system identity;
- the explicit server-only canary enable flag; and
- the exact authenticated owner Supabase user ID; and
- the exact independently configured active run and worker candidate.
- a bounded server-side expiry no more than one hour in the future.

Those bindings are applied only through a fresh one-use
`vercel-production-web-shadow-canary` authorization and a new Production
deployment built from the exact signed source deployment. The same guarded
path supports a separately signed disable operation. Expiry is an independent
fail-safe, not a substitute for explicit disable.

## Consequences

- The owner exercises the deployed Production web shell, browser audio,
  microphone controls, transcript presentation and Production LiveKit worker.
- Shadow Director recommendations remain silent and influence remains false.
- The canary creates no customer session, credit mutation, durable transcript
  or feedback artifact.
- Ordinary `/api/session/start`, `/interview` and non-owner behavior remain
  unchanged and cannot ingest the private connection artifact.
- Merging the repository slice does not enable the page. Production web
  configuration and each room still require their own fresh owner authority.
