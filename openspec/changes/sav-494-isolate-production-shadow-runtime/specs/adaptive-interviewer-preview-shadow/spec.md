# Adaptive Interviewer Preview Shadow Delta

## Requirement: Shadow runtime isolation

The worker SHALL route an admitted Shadow job to a dedicated synthetic runtime
before connection or ordinary customer-runtime construction.

### Scenario: ordinary metadata

Ordinary interview metadata SHALL remain on the existing customer path and
SHALL NOT construct the Shadow adapter.

### Scenario: invalid Shadow metadata

Invalid or unavailable Shadow metadata SHALL shut down before room connection,
voice provider construction or durable customer work.

### Scenario: admitted Shadow metadata

An exact admitted Shadow job MAY use fixed voice providers, SHALL keep Director
recommendations silent, MAY project final turns only to the owner room in
memory, and SHALL NOT call customer transcript, lifecycle, feedback or credit
surfaces.

## Requirement: Deployment-Protected control plane

The Shadow worker SHALL include the exact temporary Vercel bypass header on
admission and reconciliation while retaining the existing payload-level owner,
lease and capability authentication.

### Scenario: missing bypass

Missing, malformed or mismatched bypass configuration SHALL make the Shadow
runtime unavailable before provider construction.

### Scenario: cleanup

Ordinary rollback SHALL remove the bypass secret and the operator SHALL revoke
it after the one-cell rehearsal.
