# Proposal: Isolate Production Shadow Runtime

## Problem

Admitted Shadow jobs currently continue into customer transcript/lifecycle
setup, and LiveKit Cloud cannot reach the Deployment-Protected staging control
plane without an explicit edge bypass.

## Outcome

Ship one separate synthetic Shadow voice path that is admitted before provider
work, produces no customer persistence or influence, reconciles exactly once
and can cross Vercel protection with a temporary narrowly held bypass secret.

## Non-goals

No customer rollout, second rehearsal cell, Preview influence, Production
rollout, default-on or launch decision.
