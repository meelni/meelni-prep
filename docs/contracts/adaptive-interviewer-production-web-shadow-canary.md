# Adaptive Interviewer Production Web Shadow Canary Contract

Status: design freeze; disabled until separate Production configuration

## Boundary

This surface is a private owner test inside the real Production Meelni web
application. It consumes an already-issued browser connection only. It is not
a session-start API, rollout stage, customer cohort, deployment command or
durable control-plane adapter.

## Server gate

The route is unavailable unless the request is authenticated and all closed
server-side fields match:

- `VERCEL=1`;
- `VERCEL_ENV=production`;
- `VERCEL_TARGET_ENV=production`;
- `MEELNI_ENV_PULL_ENVIRONMENT=production`;
- `MEELNI_PRODUCTION_WEB_SHADOW_CANARY=enabled`; and
- `MEELNI_PRODUCTION_WEB_SHADOW_OWNER_USER_ID` is one canonical UUID equal to
  the verified Supabase user ID;
- `MEELNI_PRODUCTION_WEB_SHADOW_RUN_ID` is the exact active 64-hex run; and
- `MEELNI_PRODUCTION_WEB_SHADOW_CANDIDATE_SHA` is the exact authorized
  40-hex worker source; and
- `MEELNI_PRODUCTION_WEB_SHADOW_EXPIRES_AT` is a canonical whole-second UTC
  timestamp still in the future and no more than one hour from the request.

Missing, malformed, non-Production, disabled, unauthenticated and non-owner
requests return the same not-found surface. No browser-visible variable is
accepted as authority.

The five canary values are written only by the one-use
`vercel-production-web-shadow-canary` Production action. That action binds an
exact reviewed web candidate, worker candidate, run, owner UUID, expiry,
source Production deployment and enable/disable operation, then updates
Production server-only variables and redeploys that exact source deployment.
Environment writes alone do not affect the active site. A failed or expired
enable remains unavailable; disable uses a fresh action and deployment.

## Private connection v2

The browser accepts at most 32 KiB of strict JSON with no duplicate, missing
or extra keys. The exact closed record contains:

- contract `adaptive-interviewer-preview-shadow-operator-cell-connection.v2`;
- topology `production_project_shadow`;
- exact 64-hex run, lease and session-binding IDs;
- exact 40-hex candidate Git SHA;
- the immutable Preview-shadow configuration and selected-candidate digests;
- one configured rehearsal round and voice condition;
- a canonical whole-second UTC lease expiry that is still in the future;
- room name `preview-shadow-<session binding>`;
- exact Production LiveKit URL
  `wss://meelni-ek4vaisp.livekit.cloud`; and
- a bounded canonical three-segment LiveKit participant JWT whose decoded
  claims bind the same room, exact owner identity, current lease deadline and
  microphone-only publish grant.

V1, Preview-project, expired, cross-room, cross-config, malformed or hostile
files fail closed before `LiveKitRoom` construction. The file's run and
candidate MUST equal the independent server-configured bindings; the immutable
configuration digests MUST equal the checked-in reviewed values. Claim parsing
does not replace signature authentication: the LiveKit service still verifies
the HS256 signature before admitting the browser to the room.

## Privacy and lifecycle

The file is read with the browser File API and parsed locally. The token and
raw file MUST NOT enter React query caches, URLs, cookies, localStorage,
sessionStorage, IndexedDB, analytics, logs, exceptions, network requests or
server actions. The selected file input is cleared after reading. Parsed
credentials live only in component memory and are cleared on disconnect,
unmount or connection failure.

The page may render validated in-memory transcript data-channel events for the
owner. It MUST NOT call transcript ingest/hydration, runtime readiness,
presence, session end, feedback or credit APIs. Disconnect disables the
microphone and leaves the room. Durable terminal reconciliation remains the
worker/operator contract.

## Authority

The page grants no Director influence, customer exposure, Preview influence,
Production rollout, default-on or launch GO/NO-GO authority. A connection file
is bearer material, not an owner authorization artifact; it cannot allocate,
deploy, activate, stop or reconcile anything.
