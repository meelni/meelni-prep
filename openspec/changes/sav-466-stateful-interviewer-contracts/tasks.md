## 1. Durable contracts

- [x] Add the OpenSpec proposal, design, tasks, and delta spec.
- [x] Record the accepted architecture decision and canonical contract.
- [x] Define the authority, failure, evidence, latency-anchor, rollout, and
      rollback boundaries.

## 2. Executable parity

- [x] Add strict TypeScript contracts behind the `@meelni/agent` entrypoint.
- [x] Add mirrored Python readers and freshness validation.
- [x] Add one shared TypeScript/Python golden fixture.
- [x] Keep top-level room metadata v1 and add optional nested-brief negotiation.

## 3. Compatibility and safety tests

- [x] Cover old/new writer-reader behavior, absent/unknown/malformed briefs, and
      top-level version-2 rejection.
- [x] Cover exact selected-question preservation and replay-identical digest.
- [x] Cover move CAS/writer fencing, expiry boundaries, and canonical delivery.
- [x] Cover evidence isolation, privacy, no coaching, and unchanged demo
      contract.

## 4. Validation and handoff

- [x] Run targeted package and Python tests.
- [x] Run typecheck, build, agent verification, and OpenSpec validation.
- [x] Publish a ready PR, record exact evidence in SAV-466, and leave SAV-465
      open.
