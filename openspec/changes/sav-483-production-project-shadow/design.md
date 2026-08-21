# Design

The staging durable control plane remains authoritative while the paid
Production LiveKit project is used only for transport. A new topology value is
bound independently from the existing logical stage/environment. The owner
packet, Production deploy action and one-room Production action are distinct
domains and none can stand in for another.

The deploy wrapper snapshots the exact Production config and complete
replacement secret set containing ordinary variables plus run-bound Shadow
bootstrap, consumes exact Production authority, archives the authorized commit
and updates only the canonical interview agent. After source/health postflight,
the operator consumes an exact version-bound room action and then allocates
before creating one explicit room/dispatch. The existing Python metadata branch
stays silent and ordinary metadata stays on the current path.

The run stops after the first terminal outcome for owner inspection. Rollback
is a second guarded Production deploy that replaces the full secret set and
removes the Shadow bootstrap; it is not inferred from the database stop state.
