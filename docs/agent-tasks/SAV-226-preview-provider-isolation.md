# SAV-226 — Preview provider isolation reconvergence

## Intent

- User request: Complete relaunch readiness while keeping the relaunch feature flag off and leaving the launch decision with the owner.
- Product/user outcome: Preview rehearsals use isolated non-Production provider identities and cannot silently fall back to Production.
- Why now: SAV-226 gates hosted verification for consent, billing, runtime recovery, and the authenticated golden path.

## Slice

- Primary slice: Deployment and provider isolation.
- Secondary slices: LiveKit agents, Inngest branch environments, Vercel Preview configuration, and release evidence.
- Relevant skills: `meelni-ops-connections`, `meelni-livekit-interview-runtime`, `meelni-linear-workstream`, `meelni-engineering-memory`, `meelni-pr-prep`.

## Linear Tracking

- Project: Meelni.
- Parent slice issue: SAV-226.
- Current Linear state: In Progress.

## Scope

- In scope: Preserve the verified Preview interview worker, provision a separate Preview demo worker, commit both dispatch/deployment identities, accept Inngest's real shared branch-key identity, apply Preview-wide Vercel identities, and collect synthetic Preview evidence.
- Out of scope: Production provider changes, customer data, launch activation, deletion of the existing interview worker, or reuse of Production credentials.
- Assumptions: The public demo remains a product surface; Inngest branch environments are the intended Vercel Preview target; provider secrets remain outside source control.

## Product Lens

- Audience: Internal owner/operator validating the prelaunch candidate.
- Lever: Reliability and trust before relaunch.
- Product Compass note: Preview must be representative without being able to mutate or depend on Production.

## Technical Plan

- Add a one-time fail-closed Preview demo bootstrap that validates the authenticated registry, writes a sanitized Preview-only child registry outside the build context, uploads only the demo dispatch and OpenAI key, preserves the root Dockerfile, and prints only the non-secret deployment ID.
- Update Inngest validation to accept the documented `signkey-branch-*` identity in Preview and continue rejecting it in Production.
- After provisioning, pin the exact Preview demo deployment ID and dispatch name in source, tests, and operations notes.
- Apply the exact Preview LiveKit/Inngest variables to `meelni/meelni`, redeploy the reviewed candidate, and require the hosted preflight to pass.

### Current provider result

- Inngest Branch Environment credentials are installed Preview-wide in the canonical Vercel project; Production values were not changed.
- The owner upgraded the isolated LiveKit Preview project to Ship. Read-only reconciliation proved only the original interview deployment was present before recovery.
- The reviewed bootstrap then completed exactly once and provisioned demo deployment `CA_M5XTD4CMyXk3`, dispatched as `meelni-preview-demo`, alongside interview deployment `CA_ZbGxFjfEYwsD`. The private receipt is complete; no Production identity was read or changed.

## Validation

- Required: focused bootstrap adversarial tests, deployment-preflight tests, Python agent tests, typecheck, lint, build, and the agent verification suite.
- Provider evidence: Read-only LiveKit inventory before/after, exact hosted Vercel preflight, one synthetic demo session, one synthetic interview session, and one uniquely identified Inngest branch event.
- Safety: No Production target, customer transcript, or launch-flag mutation.

## Rollout

- Risk level: High operational correctness, low product-surface risk.
- Backward compatibility: Production identities and dispatches remain unchanged; Preview gains the missing demo worker and correct branch credentials.
- Rollback: Restore the prior Preview-wide Vercel values or remove the new demo worker only through a separately reviewed Preview rollback; source remains fail-closed if identities do not match.
- Follow-up slice: Apply migration 0023 and finish SAV-180's exact-deployment consent verification after SAV-226 passes.
