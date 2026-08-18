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

## Decision design

The Director recommends a typed move from finalized or explicitly speculative
turn context. The controller checks the current lifecycle/deadline snapshot,
writer generation, state CAS, freshness, allowed move, ledger, and close state.
An admitted `InterviewerMove` authorizes intent but contains no spoken prose.
The live interviewer phrases it within the full-interview policy.

Recommended, admitted, generated, scheduled, spoken, interrupted/aborted, and
canonically delivered states are separate. A transcript-v2 event is the only
way to bind delivered evidence into the ledger.

## Tool design

The allowlist contains five local session capabilities. Every call is bound to
session/writer identity and a server-configured absolute deadline. Mutations
also bind state revision and idempotency key. Exact replay returns the original
result, conflicting key reuse fails, stale CAS/writer fails, and no failure
blocks the current fallback or settlement.

## Evidence and authority design

The controller is operational state only. Existing workflows retain lifecycle,
deadline, transcript, settlement, answer-block, and feedback authority.
Director and tool traces are excluded from evaluation. The golden fixture and
tests assert identical evaluator input/eligibility for identical canonical
transcripts despite different operational traces.

## Rollout design

Readers land first. Brief emission, controller, tools, Director shadow, and
Director influence each remain separately default off. SAV-467/SAV-469 record
numeric quality/latency baselines and gates before behavior advances. Influence
starts only in an owner-controlled Preview/canary after shadow evidence. The
current v1 prompt-led runtime remains the instant rollback path.
