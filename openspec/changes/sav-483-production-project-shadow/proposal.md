# Proposal: Rehearse Shadow On The Existing Paid LiveKit Project

## Problem

The bounded Preview-shadow operator assumes a separately accessible LiveKit
Preview project. The owner has one paid project, plans are not shared across
projects, and both paid deployment slots are already assigned. Raw Production
commands would bypass the accepted authority and isolation contracts.

## Change

Add a closed Production-project transport topology for Preview-shadow
semantics, three separated owner/deploy/room authority domains, an in-place
guarded interview-worker deploy, exact synthetic dispatch, and explicit
all-off rollback.

## Non-goals

No rollout-stage skip, customer influence, canary, default-on, launch GO,
third deployment, demo-worker change, or direct provider mutation.
