# Proposal: Join One Production Shadow Room Through The Real Web Product

## Problem

The Shadow worker and guarded Production-project room path are merged, but the
owner can currently test only through an operator-generated LiveKit
connection. Wiring ordinary Production sessions would prematurely widen the
rollout and authority surface.

## Change

Add one hidden owner-only Production dashboard canary that locally loads the
guarded operator's private connection file and joins the room through Meelni's
real browser voice UI. Version and strengthen the external connection record
so the browser can fail closed on topology, source, config, binding and expiry.

## Non-goals

No ordinary session wiring, customer cohort, persistence, feedback, credits,
Director influence, automatic allocation, Production rollout, default-on or
launch decision.
