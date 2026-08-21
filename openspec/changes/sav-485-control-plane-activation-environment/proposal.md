# Proposal: Control-Plane Activation Environment

The durable Shadow activation CAS uses only staging PostgreSQL, but its
operator currently requires the unavailable Preview LiveKit identity. Split
that validation so activation and durable stop accept the exact staging data
identity without any LiveKit credential, while all room-start paths remain
strict.

This change creates no provider, worker, room, influence or rollout authority.
