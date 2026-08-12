# SAV-412 runtime settlement reachability

## Why

An accepted authenticated End request can observe a current registered writer
while LiveKit's participant list temporarily omits the agent projection. The
web workflow then returns `runtime_not_ready` before sending the trusted
settlement packet, and the agent can continue queued speech past the durable End
cutoff.

## Outcome

The web tier resolves one exact provider-owned running agent identity for the
room even when participant projection is transiently absent. A valid trusted
End packet synchronously freezes the evidence cutoff and stops all input,
output, and queued generation before asynchronous drain. The metadata-only
settlement acknowledgement retains a reserved, bounded control path when a
data ingest request is hung.

## Boundaries

- The random transcript writer UUID remains a logical ingest identity, never a
  LiveKit participant target.
- Candidate tokens keep `canPublishData=false`; only the authenticated server
  sends the exact-target reliable packet.
- Ambiguous, stale, missing, wrong-room, or invalid provider identity facts fail
  closed.
- Packet schema, writer generations, terminal arbitration, feedback policy,
  demo behavior, and Production rollout are unchanged.
