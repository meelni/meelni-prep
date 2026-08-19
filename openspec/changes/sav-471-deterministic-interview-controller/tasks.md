## 1. Controller domain

- [x] Add versioned serializable controller state and strict validation.
- [x] Add authoritative monotonic clock projection and stable time bands.
- [x] Add pure legal transitions, allowed moves, repetition prevention, close,
      terminal silence, and bounded completed-turn snapshots.
- [x] Commit probe history only from canonical delivered evidence.

## 2. Runtime boundary

- [x] Add an exact disabled-by-default server flag and safe adapter factory.
- [x] Inject one turn-local snapshot only at `on_user_turn_completed`.
- [x] Correlate speech lifecycle and canonical transcript acknowledgement
      without changing existing delivery, deadline, reconnect, or settlement.
- [x] Bind controller completion to the exact accepted public speech instance so
      duplicate-ID callbacks cannot consume another instance's authority.
- [x] Make every adapter failure fall back without failing the session.

## 3. Tests and documentation

- [x] Cover the required answer, interruption, invalid-state, deadline, exit,
      reconnect, close, and post-close behaviors provider-free.
- [x] Update contract and runtime operations documentation.
- [x] Complete the local validation matrix and benchmark comparison.
- [ ] Open a ready PR and monitor hosted checks to a terminal result.
