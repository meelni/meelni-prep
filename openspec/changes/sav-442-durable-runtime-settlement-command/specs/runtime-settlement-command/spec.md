# Durable runtime-settlement command delta

## Requirement: accepted End creates durable settlement intent

An accepted explicit End MUST atomically bind its lifecycle version and
semantic cutoff to the current registered runtime writer's room, identity, and
generation in one versioned command. A replay MUST NOT create a second logical
command.

### Scenario: packet loss

Given End committed a command and the packet is lost, the exact writer MUST be
able to pull the command, settle through its immutable cutoff, and persist an
acknowledgement.

## Requirement: runtime access is signed and generation fenced

Pull and acknowledgement MUST use the internal signed runtime boundary, contain
no transcript content, reject unknown versions, and fail closed when room,
writer ID, generation, or command identity differs.

### Scenario: replacement writer

Given writer generation two owns the command, generation one MUST NOT read or
acknowledge it, and a stale acknowledgement MUST NOT upgrade terminal evidence.

## Requirement: bounded convergence

The runtime MUST discover commands on packet wake-up, exact candidate
disconnect, and shutdown. The finalizer MUST wait only within its bounded
settlement stage and then freeze typed persisted evidence after terminally
classifying an unacknowledged command.

### Scenario: unavailable runtime

When no acknowledgement arrives before the bound, the command becomes expired
and terminalization continues with partial, degraded, or missing evidence; it
MUST NOT manufacture settled proof.
