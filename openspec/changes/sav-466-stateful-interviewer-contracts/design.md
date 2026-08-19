# Design: Stateful Interviewer And Decision Contracts

## Context

The full-interview runtime already has authoritative room metadata, deadlines,
transcript events, writer settlement, answer blocks, and post-interview
feedback. The new adaptive components must compose with those contracts and
roll out across TypeScript and Python without a flag-day migration.

## Goals

- Make every new payload strict, bounded, versioned, and provider-neutral.
- Preserve version-1 room-metadata and prompt-led compatibility.
- Make brief compilation deterministic and replay-stable.
- Keep the deterministic controller between model advice and state mutation.
- Keep only canonical delivered speech authoritative.
- Give downstream work an executable parity fixture and exact failure rules.

## Non-goals

- Implement the brief compiler, controller, tools, Director, or live influence.
- Select or migrate models/providers.
- Change the public demo or feedback rubric.
- Enable Production, change launch state, or use customer transcripts.

## Transport design

`interview_brief` is optional inside top-level room-metadata contract version 1.
New readers validate its independent version/digest and correlate it with the
authoritative v1 session, deadline, config, round, and selected question.
Absent, unknown, malformed, or mismatched briefs fall back to validated v1
behavior. Top-level version 2 remains unsupported.

The payload uses snake_case because it crosses TypeScript/Python boundaries.
All schemas reject unknown keys, unbounded collections, non-canonical
timestamps, and unsupported versions.

## Deterministic brief design

The canonical payload excludes only its digest and derived brief ID. Canonical
JSON sorts object keys and preserves contract-defined array order. SHA-256 binds
that payload, including the stable session-start fingerprint. The compiler
must persist and reuse the accepted bytes on retry. No compile timestamp,
random identity, live read, or generated model context is permitted.
Strings must contain Unicode scalar values only; unpaired surrogates fail
closed before canonical UTF-8 encoding in both runtimes.
`duration_minutes` permits only integer JSON wire tokens `15`, `30`, or `45`;
float/exponent spellings are invalid. Wire timestamps are strings.

## Decision design

The Director recommends a typed move from finalized or explicitly speculative
turn context. The controller checks lifecycle is exactly active, current time
is strictly before the canonical deadline, and writer generation, controller
state CAS, independent lifecycle-version CAS, finalized turn/transcript
revision, active question, freshness, allowed move, ledger, and close state all
match. Reconnect work may remain shadow-only until a fresh active state and
lifecycle version exist.
An admitted `InterviewerMove` authorizes intent but contains no spoken prose.
The live interviewer phrases it within the full-interview policy.

Recommended, admitted, generated, scheduled, spoken, interrupted/aborted, and
canonically delivered states are separate. Delivery attribution reuses the
existing transcript-v2 event ID plus writer/generation and sequence; transcript
v2 is not redesigned. Partial-prefix delivery requires an exact transcript
event, while interruption without a confirmed prefix may cite only the
existing metadata-only integrity marker and remains non-delivery.

## Tool design

The allowlist contains five local session capabilities. Every call is bound to
session/writer identity and a server-configured absolute deadline. Mutations
also bind controller revision, lifecycle version, idempotency key, and a SHA-256
digest of canonical semantic request payload bytes. Recursive key sorting makes
reordered requests duplicates; a changed semantic field under the same key is
a conflict. A separate adapter helper correlates every result to its pending
request by call/tool/session/writer/deadline and applicable revisions. No
failure blocks the current fallback or settlement.

## Evidence and authority design

The controller is operational state only. Existing workflows retain lifecycle,
deadline, transcript, settlement, answer-block, and feedback authority.
Director and tool traces are excluded from evaluation. The golden fixture and
tests pass identical frozen transcript plus writer integrity/settlement
authority through the production trusted-answer-block projector and production
dimension-coverage prompt builder, asserting identical evaluator input and
feedback authority despite different operational traces.

## Rollout design

Readers land first. Brief emission, controller, tools, Director shadow, and
Director influence each remain separately default off. SAV-467/SAV-469 record
numeric quality/latency baselines and gates before behavior advances. Influence
starts only in an owner-controlled Preview/canary after shadow evidence. The
current v1 prompt-led runtime remains the instant rollback path.
