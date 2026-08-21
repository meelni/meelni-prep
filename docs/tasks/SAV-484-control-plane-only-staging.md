# SAV-484: Control-Plane-Only Staging Lane

## Intent

- User request: use the existing paid Production LiveKit project for the
  bounded Shadow rehearsal because there is no separate paid Preview project.
- Product/operator outcome: deploy the durable staging control plane without
  enabling any staging web voice path, then resume the separately authorized
  one-cell Production-project transport rehearsal.
- Why now: the reviewed SAV-483 merge correctly rejects the staging LiveKit
  identity currently present in Vercel, so the internal Shadow route cannot be
  deployed without an explicit control-plane-only capability.

## Slice

- Primary slice: interview-session rollout and deployment isolation.
- Secondary slices: Vercel staging identity and LiveKit fail-closed behavior.
- Skills: Linear workstream, LiveKit runtime, ops connections, architecture,
  vertical slice, engineering memory, and PR prep.

## Linear Tracking

- Project: Meelni.
- Parent: SAV-476.
- Child: SAV-484.
- Related execution: SAV-482 and SAV-483.
- State: In Progress.

## Scope

- In scope: a distinct exact staging capability that enables the existing
  Shadow control-plane server while disabling ordinary web voice entrypoints,
  background LiveKit work, configuration loading, and LiveKit provider reads.
- Out of scope: deploying a LiveKit worker, creating a room, changing
  Production web/runtime configuration, enabling influence, changing customer
  defaults, or making launch GO/NO-GO.
- Assumption: the staging Supabase lane remains the durable authority and the
  later external operator is the only surface permitted to address the paid
  Production LiveKit project.

## Product Lens

- Audience: the human product owner operating the adaptive-interviewer gate.
- Lever: reliability and safe validation, not customer activation.
- Product Compass: Shadow output remains silent, synthetic and read-only.

## Technical Plan

- Extend `@meelni/integrations` with an exact Vercel-owned
  `preview_shadow_control_plane` disabled capability requiring canonical
  project/repository identity plus two explicit server-owned staging markers.
- Make deployment preflight emit a distinct typed LiveKit skip and construct no
  LiveKit reader for that lane.
- Preserve the shared voice-unavailable guard so session start, interview/demo
  token, settlement, presence, end and LiveKit webhook routes return before
  authentication, database, credits, config or provider work.
- Keep trusted voice-capable staging strict unless the complete exact tuple is
  present; generic Preview and Production remain unchanged.

## Validation

- Package capability tests: 115/115 integrations green.
- Deployment preflight: 42/42 focused tests green, including zero-reader proof.
- Session-start, interview/demo-token and internal Shadow route: 29/29 green.
- Node 22 `npm run check`: formatting, lint, app/test typechecks, dependency
  boundaries, Semgrep 0 findings and quality 21/21 green.
- Node 22 `npm run verify:agent`: terminal green, including 334 Python tests
  with five expected optional-SDK skips, production build, 30 public pages,
  984 public source files and 90 routes.
- Exact-head security diff scan, ready PR and terminal hosted CI remain pending.

## Rollout

- Risk: high if the capability can be spoofed or broadened; mitigated by exact
  Vercel project/repository identity, exact staging markers and fail-closed
  partial-identity tests.
- Backward compatibility: generic Preview, voice-capable staging and Production
  keep their existing behavior.
- Watch: staging build preflight, internal route fail-closed response, ordinary
  voice-unavailable response and zero LiveKit read evidence.
- Follow-up: after merge, redeploy exact staging, finish the one-cell SAV-482
  rehearsal, reconcile evidence and explicitly restore the Production worker.
