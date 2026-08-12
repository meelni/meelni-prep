# SAV-419 runtime settlement target

## Why

SAV-412 still allowed a Production runtime to be registered and actively
writing while target resolution returned no usable exact agent projection. The
provider state was unavailable after room cleanup, so its historical shape is
unknown. The existing idealized dispatch fixture did not cover pinned protobuf
history/current projections; SAV-419 is the smallest Production-shaped
normalization fix for the proven pre-send boundary.

## Outcome

The server resolves exactly one current interview worker from exact participant
presence or a structurally complete current dispatch job, rechecks the durable
writer generation, and sends one exact-target packet. The runtime installs an
exact cutoff-aware local evidence gate and completes its session fence
synchronously before asynchronous settlement. Only canonical measured turns at
or before the cutoff and preauthorized integrity facts with an exact occurrence
may complete during drain; closure rejects all callbacks. Closed telemetry
identifies the failing stage
without identifiers, content, provider payloads, or arbitrary errors.

## Boundaries

- No broadcast, writer-ID inference, participant/browser data authority, or
  permissive fallback is introduced.
- Packet, settlement, feedback, terminal, and database schemas are unchanged.
- Ambiguity, malformed provider state, stale generation, and partial fencing
  remain fail closed.
- Provider mutation and Production rollout are outside this change.
