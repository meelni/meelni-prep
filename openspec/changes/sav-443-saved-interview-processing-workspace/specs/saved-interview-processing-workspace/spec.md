# Saved-interview processing workspace delta

## Requirement: transient feedback remains useful

Transient settling, pending, and processing feedback states SHALL show saved
interview truth, bounded historical question/round context, a textual durable
stage, leave-and-return navigation, and explicit delayed, retryable, paused, and
unavailable behavior. The client MUST preserve the existing bounded polling and
server-owned recovery contract.

### Scenario: polling budget expires

When the bounded automatic GET budget is exhausted, the workspace SHALL remove
its busy claim and active animation, explain that checking paused, preserve
saved context, and offer one read-only `Check again` action plus Interview
History.

## Requirement: workspace projection is closed and content-minimal

The lifecycle API MAY add only `saved-interview.workspace.v1` with saved truth,
canonical round, bounded historical question/company, and closed frozen
transcript availability. It MUST NOT include user/session/room identity,
transcript turns, answers, feedback result content, raw generation events,
provider diagnostics, raw errors, or internal failure codes.

### Scenario: rolling-compatible response omits the projection

When a later decoded poll or recovery response omits the optional projection,
the mounted client SHALL retain the last accepted projection for the same
session and MUST NOT accept malformed replacement fields.

## Requirement: only frozen evidence is readable as saved transcript

The feedback transcript surface SHALL request the explicit frozen scope. The
server MUST authenticate, authorize, and verify terminal evidence readiness
before invoking a transcript query. An active or ending session MUST return a
content-free not-ready response and MUST NOT invoke either transcript query.
Healthy version-1 terminal evidence SHALL use its immutable cutoff and writer
prefix; other version-1 terminal evidence SHALL be unavailable. Existing
bounded terminal legacy behavior MAY remain compatible.

The frozen display response SHALL give every turn a stable opaque row ID and
MAY expose canonical event ID only when present. It MUST NOT expose writer ID,
writer generation, sequence, delivery state, contract version, session
identity, end time, audio, section, or other evaluation-only metadata. Distinct
terminal legacy rows with no canonical event ID MUST retain distinct display
IDs.

### Scenario: direct frozen request during settlement

Given an owned session is still ending, a direct `scope=frozen` request SHALL
return no turns, SHALL NOT invoke ordinary or frozen transcript reads, and
SHALL NOT expose a mutable tail.

## Requirement: processing status is accessible without repeated content

Stage changes SHALL use a narrow polite atomic live region whose busy value is
false while paused. Question context, progress history, controls, and transcript
content MUST remain outside that live region. Text labels SHALL communicate
state independently of color, and mobile/desktop layouts SHALL avoid horizontal
overflow.

### Scenario: processing changes to paused

When a processing workspace rerenders as paused, assistive technology SHALL
receive only the stage title/description update. Saved question and transcript
content SHALL remain present but outside the live region.
