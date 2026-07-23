# Delegated Agent Authorization Boundary

Date: 2026-07-23

## Status

Accepted.

## Context

During relaunch calibration, small repo-only guardrail repairs repeatedly
invalidated exact human-owner authorization artifacts because those artifacts
bind to a reviewed source commit. Savi explicitly approved creating a safer way
for Codex to continue bounded repeat work without asking for a new human-owner
signature each time.

The unsafe alternative is allowing an agent to use Savi's human-owner private
key autonomously. That would make artifacts claim human-owner review when the
actual actor was an agent.

## Decision

Meelni will use a separate delegated-agent authorization boundary for bounded
repeat work. Delegated artifacts use
`meelni.delegated-agent-authorization.v1`, identify `codex` as the delegated
agent, and record owner delegation as chat-thread provenance rather than an
Ed25519 human-owner signature.

Delegated authorization can cover only explicitly bounded scopes such as:

- repo-only guardrail/runtime repairs;
- synthetic-only calibration retries within an already approved spend envelope;
- provider-free evidence regeneration.

Delegated authorization cannot cover:

- launch GO/NO-GO or relaunch default-on;
- new or wider spend caps;
- Production data, customer transcripts, recordings, or PII;
- refunds, billing exceptions, account deletion, or destructive actions;
- live provider mutations outside an already approved bounded envelope.

Human-owner-only gates must remain domain-separated and reject delegated-agent
artifacts.

## Consequences

Agents can continue low-risk bounded relaunch work faster, while audit records
stay honest about who authorized what. Future wrappers may consume delegated
artifacts only after tests prove they cannot satisfy human-owner-only contracts
or expand scope.
