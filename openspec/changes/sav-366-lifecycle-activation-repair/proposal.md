# SAV-366 lifecycle activation repair

## Why

Production interviews with registered runtime writers and real transcript turns
remain canonically `connecting` because lifecycle activation depends on
participant webhooks or a scheduled recovery path that is not repairing them.
The browser simultaneously labels LiveKit transport as `Connected`, creating a
false-ready state.

## Outcome

Every browser transport connection triggers an authenticated,
provider-verified presence reconciliation. The UI reports Connected only after
canonical activation or recovery. Webhooks and scheduled reconciliation remain
independent repair paths rather than single points of readiness.

## Boundaries

- The browser never asserts participant presence or writes lifecycle state.
- The server verifies ownership before inspecting provider state.
- The existing lifecycle workflow remains the only transition authority.
- Provider absence never invents activation.
