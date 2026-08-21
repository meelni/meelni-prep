# Design: Control-Plane-Only Staging

`resolveLiveKitDeploymentCapability` owns one new disabled lane. It requires
the complete Vercel-owned staging identity, canonical project/repository,
Preview data marker, exact Shadow server marker and a separate exact
control-plane-only marker. Missing, extra-looking or partial application-owned
identity leaves staging strict.

The existing shared voice-unavailable guard consumes only the typed capability,
so all web voice entrypoints and background jobs stop before sensitive or
provider work. Deployment preflight emits a distinct skip and never constructs
the LiveKit reader. The internal Shadow route keeps its existing independent
staging and server-marker checks; this change grants it no additional action.

The later operator continues to use a private external environment combining
staging database authority with Production LiveKit transport. No Production
LiveKit credential becomes necessary for the staging web runtime.
