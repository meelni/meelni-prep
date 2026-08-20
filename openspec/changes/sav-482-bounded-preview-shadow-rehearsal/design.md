# Design

The owner tool creates and signs two independently validated inputs: the
structural SAV-479 authorization and the SAV-480 Ed25519 owner artifact. The
operator authenticates both against exact independently supplied bindings and
lets the durable CAS consume the decision once.

The cell runner is a server-only composition of the SAV-480 store, SAV-481
allocation-before-room workflow, and LiveKit Preview integration. It reads only
explicit external configuration and emits a content-free result. Capabilities
are caller-generated and never persisted outside their domain-separated hashes.

The Preview worker routes exact job metadata before connection to the injected
Shadow runtime. The default job path remains unchanged. Terminal evidence is
reconciled outside speech before the next cell.
