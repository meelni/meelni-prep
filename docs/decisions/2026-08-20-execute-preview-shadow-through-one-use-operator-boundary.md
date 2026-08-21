# Execute Preview Shadow Through A One-Use Operator Boundary

Status: accepted

## Decision

The first live adaptive Preview-shadow rehearsal uses a dedicated operator
boundary, not an application route or ordinary interview workflow.

The operator boundary requires a fresh exact-merged-SHA structural
authorization and domain-separated Ed25519 owner artifact. It authenticates
and activates SAV-480 once, allocates each SAV-481 lease before LiveKit room or
dispatch creation, and reconciles sanitized worker evidence. Execution is
serial and explicit by matrix cell; the system never fabricates live evidence.

The isolated Preview worker may inspect exact job metadata before
`ctx.connect()`. Missing or invalid Preview metadata does not create the
adaptive runtime. Ordinary interview jobs retain the existing path. The
Preview branch is read-only Shadow: it cannot speak, mutate the controller,
write transcript or feedback, or influence customer output.

## Consequences

- Repository merge, deployment, and packet preparation remain non-authorizing.
- A signed packet authorizes only `preview_staging` / `preview_shadow` /
  `shadow` with exposure `none`; all later-stage and Production fields remain
  false.
- Raw capabilities and provider credentials stay outside Git and evidence.
- The durable run is the sole global cap/replay authority. A local process or
  LiveKit worker cannot mint or reactivate leases.
- Any hard stop denies new allocation first. Ambiguous cleanup retains budget
  and emits stop-incomplete evidence.
