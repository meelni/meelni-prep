# Control-Plane-Only Staging Delta

## Requirement: exact disabled capability

The system MUST classify staging as control-plane-only only when the complete
canonical Vercel project/repository identity, Preview environment marker,
Shadow rehearsal-server marker and separate control-plane-only marker match.
Partial, malformed, copied or application-only identity MUST NOT disable
ordinary staging LiveKit checks.

## Requirement: no web LiveKit reachability

In the control-plane-only lane, preflight MUST construct no LiveKit reader and
MUST emit a distinct typed skip. Session start, interview/demo token, presence,
settlement, end, webhook and background LiveKit paths MUST stop before auth,
database, credit, configuration or provider work.

## Requirement: independent Shadow server gate

The internal Shadow endpoint MUST retain its existing exact staging/server
gate. Control-plane-only classification MUST NOT authorize activation,
allocation, room creation, dispatch, provider work, influence, Production,
default-on or launch.

## Requirement: unchanged neighboring lanes

Generic Preview MUST remain intentionally disabled under its existing tuple.
Trusted staging without the complete control-plane-only tuple MUST remain
strict against the canonical Preview LiveKit identity. Production MUST remain
strict against the canonical Production identity.
