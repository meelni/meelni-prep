# Design: Staging-Side Shadow Activation

Add one closed activation contract beside the existing worker contract. A thin
staging route selects it by exact contract/action, constructs the immutable
activation context from the exact deployed Git SHA and rollout constants, then
delegates to the existing durable workflow with the reviewed public-key
registry and server clock.

The provider-free operator prepares a private mode-0600 request file from the
v2 owner packet. Its signature binds a domain-separated digest of the exact
run-control capability, and the durable CAS recomputes that digest before
consuming authority. Vercel's protected curl path sends that file without placing
capabilities in argv or logs and writes the unchanged private activation
receipt. Existing worker admit/reconcile envelopes remain byte-compatible.
