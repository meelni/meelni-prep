# Proposal: Single-deployment Preview voice runtime

## Problem

The isolated Meelni-owned LiveKit Preview project is on the Build plan, which
permits one hosted agent deployment. Meelni needs distinct demo and interview
dispatch behavior, but a second hosted deployment requires a new paid Ship
subscription that the owner declined.

## Proposed outcome

Run the existing demo and interview workers as two named child processes inside
one Preview-only hosted deployment. Preserve separate dispatch names and all
runtime behavior while sharing only the container lifecycle and project
credentials.

## Non-goals

- Change the Production topology or credentials.
- Collapse demo and interview onto one dispatch name.
- Merge their metadata, prompt, transcript, or shutdown workflows.
- Purchase a provider plan or delete the former Preview project.

## Acceptance

The change is accepted only after provider evidence shows both exact worker
names registered and explicit synthetic dispatch succeeds for each name,
including after a cold start. Until then, Vercel staging remains on its prior
fail-closed configuration.
