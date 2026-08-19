## 1. Domain and compiler

- [x] Add four bounded PM round packs in core.
- [x] Add deterministic brief compilation and exact serialized wire storage.
- [x] Preserve exact selected-question identity and text.

## 2. Runtime wiring

- [x] Compile before LiveKit room entry with no new migration or live read.
- [x] Gate optional nested-brief emission with the accepted flag.
- [x] Consume valid briefs in Python as constraints, not scripts or evaluators.
- [x] Keep missing, invalid, unknown-version, and v1 sessions on the safe path.
- [x] Add sanitized contract-version trace metadata.

## 3. Tests and documentation

- [x] Add shared four-round TypeScript-wire/Python-reader fixtures.
- [x] Cover replay stability, exact question, optional fields, minimization,
      invalid versions, missing context, and v1 compatibility.
- [x] Update durable room-metadata and runtime documentation.
- [x] Complete the required local validation matrix; hosted validation follows
      the ready pull request.
