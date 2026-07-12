# Dynamic Stacked Parent Resolution

- Status: accepted
- Date: 2026-07-12
- Owners: Engineering
- Tracking: SAV-239

## Context

The trusted stack registry stored an `expectedParentHead` SHA. Updating that SHA
required a change on `main`, and a stacked pull request for the registry change
could depend on the very SHA it was changing. Normal parent movement therefore
created registry churn and a self-referential gate.

The stable GitHub Actions context also inherited failures from dependent-child
checks during a parent event. That could block a valid parent even though the
failure belonged to the child and was already represented by a child-bound
custom check.

## Decision

The default-branch registry stores immutable topology identity only:

- repository;
- child PR number and head ref;
- parent PR number and head ref.

Trusted `pull_request_target`, scheduled, and manual publishers resolve child
and parent PR metadata from GitHub, validate repository/ref/base/open-state
identity, fetch exact Git refs, verify ancestry and evidence, then reload and
refetch immediately before publication. They never execute pull-request code or
trust event-supplied PR metadata as verification evidence.

Topology failure is distinct from API/publication failure. A triggering
registered child's own topology failure fails the stable required context. A
dependent child discovered during a parent event receives a failing custom
check without failing the parent's stable context. Scheduled/manual topology
failures are published without failing the sweep. API or publication failures
fail every mode.

## Consequences

- Parent commits no longer require a registry SHA update.
- A registry change is required only when PR/ref identity changes.
- Child checks remain exact-head audit evidence and expose dependent failures.
- The stable context represents the triggering PR and publisher health rather
  than aggregating unrelated dependent topology.
- A narrow movement window remains possible between the final GitHub read and
  the Check Run PATCH; serialized event fan-out and the five-minute sweep
  republish the current generation, while the pre-publication barrier prevents
  publishing success for movement observed during verification.
