# Design

## Closed lifecycle projection

`GET /api/feedback/:sessionId` performs its existing ownership check, then one
joined historical session/question read. Transient lifecycle variants may add
`saved-interview.workspace.v1`, containing only saved truth, canonical round,
bounded historical question/company, and closed frozen-transcript availability.
Core strictly decodes the projection and rejects unknown or unbounded fields.

The field remains optional for rolling compatibility. A mounted client retains
the last accepted projection when a recovery or poll response omits it, but
clears it when the session route changes.

## Frozen transcript authority

Feedback transcript fetches opt into `scope=frozen`. Authentication and
ownership precede a lifecycle/evidence readiness gate. An active or ending
session returns a content-free not-ready response before either transcript
query. Healthy version-1 terminal snapshots use the existing immutable
cutoff/writer-prefix query. Unhealthy version-1 terminal evidence is
unavailable. Terminal legacy reads preserve the already-authorized bounded
compatibility behavior.

The frozen query selects the opaque transcript-row UUID in addition to its
server-only evaluation facts. A route-bound display projector returns only that
stable `id`, optional canonical `eventId`, speaker, bounded nullable text, and
nullable display start time. It strips writer identity/generation, sequence,
contract, delivery, end time, audio, section, and all other evaluation-only
metadata. Legacy rows remain distinct by row UUID when canonical event identity
is absent.

## Workspace behavior

The workspace composes existing feedback surfaces and polling/recovery actions.
It shows question/round context, textual stage status, saved/transcript/review
progress, Interview History, and either frozen transcript access or truthful
pending/unavailable copy. Delayed and retryable states retain server-owned
actions. Exhausted polling is locally paused, non-busy, animation-free, and
offers one read-only check.

Only the changing stage title and description are a polite, atomic live region.
The question, progress list, actions, and expandable transcript stay outside
that region. Reduced-motion behavior and semantic status text do not rely on
color.

## Compatibility and privacy

The default transcript response and terminal feedback presentation remain
compatible. No schema, score, prompt, provider, settlement, or observability
contract changes. Synthetic fixtures contain no customer content, and fixed
operational logs never serialize transcript or data-layer errors.
