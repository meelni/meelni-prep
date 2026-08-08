# Design: Preview worker supervisor

## Context

LiveKit Agents 1.6.5 supports one RTC session registration per worker process.
Each worker also starts an HTTP health server, which defaults to port 8081.
The hosted deployment injects the same project credentials and deployment token
into every child process.

## Design

The Preview container runs a minimal PID 1 supervisor. It validates the
Preview-only runtime contract, then starts:

1. the authenticated interview worker on port 8081 with dispatch
   `meelni-preview-interview`;
2. the public demo worker on port 8082 with dispatch
   `meelni-preview-demo`.

The workers retain separate Python entrypoints and process pools. The
supervisor does not parse room metadata or participate in sessions. This keeps
the provider topology concern outside both product runtimes.

## Failure semantics

- Invalid environment or duplicate names: start no child and exit nonzero.
- Either child exits unexpectedly: terminate and reap the sibling, then exit
  nonzero so the hosted deployment restarts.
- SIGTERM/SIGINT: forward the signal to both children, wait for bounded graceful
  shutdown, then kill and reap any straggler.
- Interview health failure: port 8081 returns unhealthy and the platform can
  restart the container.
- Demo-only failure: the demo child exits, the supervisor takes down the
  interview sibling, and the container restarts rather than serving a partial
  topology.

## Alternatives

### One shared dispatch and metadata router

Rejected. It would require weakening the web and deployment contracts that
prevent a public demo worker from handling authenticated interview rooms.

### Put Preview workers in the Production project

Rejected. Preview credentials would gain project-wide access to Production
rooms and provider operations, defeating environment isolation.

### Keep the personal-account Preview project

Rejected as the target state. It preserves a personal ownership and recovery
dependency.

### Buy another Ship plan

Rejected by the owner.

## Verification and rollback

Unit tests prove local supervisor behavior. Provider verification proves the
unsupported-until-observed assumption that one hosted deployment token may
register both named child workers. Failure at that gate restores the existing
interview-only deployment and leaves staging unchanged.
