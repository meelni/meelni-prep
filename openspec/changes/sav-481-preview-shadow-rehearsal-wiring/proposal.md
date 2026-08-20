# Proposal: Wire The Preview-Shadow Rehearsal Seam

## Problem

SAV-480 made Preview-shadow authority durable but intentionally left the
LiveKit and Python runtime seams disconnected. A later rehearsal still lacks a
testable allocation-before-room boundary and exact worker job payload.

## Proposed change

Add a dedicated provider-free rehearsal workflow, strict LiveKit job-metadata
contract, optional exact dispatch metadata support, injected Python bootstrap,
and terminal-evidence facade. Keep every customer and provider entrypoint inert.

## Non-goals

No application route, ordinary session-start change, provider credentials,
deployment, live room, spend, Preview influence, Production/default-on, launch
decision, or live matrix execution.
