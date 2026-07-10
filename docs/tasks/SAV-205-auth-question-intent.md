# SAV-205 Auth Question Intent

## Intent

- User request: Preserve a signed-out candidate's selected question through every authentication method.
- Product/user outcome: Authentication returns the candidate to New Mock Interview with the exact question, while cancellation returns to the question-bank view they came from.
- Why now: This is a Wave 0 relaunch trust requirement and the issue was incorrectly marked In Review without an implementation or PR.

## Slice

- Primary slice: question bank / SEO
- Secondary slices: authentication, interview setup, UI state
- Relevant skills: meelni-question-bank-seo, meelni-ui-design-system, meelni-product-strategy, meelni-vertical-slice-playbooks

## Linear Tracking

- Project: Meelni
- Parent slice issue: SAV-169
- Child deliverable issue: SAV-205
- Current Linear state: In Progress

## Scope

- In scope: Safe post-auth and cancellation destinations; Google OAuth, email sign-in, email sign-up, and auth-page transitions; direct/repeated/invalid query regression coverage; responsive browser verification.
- Out of scope: Provider configuration, database writes, feature flags, question-bank redesign, SAV-206.
- Assumptions: `/dashboard/new-interview` remains the canonical launcher and `/explore` remains the public question-bank route.

## Product Lens

- Audience: PM candidates evaluating Meelni from a real interview question.
- Activation/retention/monetization/growth lever: Activation and question-bank conversion.
- Product Compass note: Preserve the candidate's concrete practice intent; do not introduce fitness language or generic dashboard detours.

## Technical Plan

- Likely app files: auth sign-in/sign-up/callback, auth provider, Explore sign-in modal.
- Likely package/workflow files: navigation and auth handoff helpers plus node:test regression coverage.
- Data or provider dependencies: None; no live provider mutation.
- Docs/decisions to update: Stable auth-intent contract and contracts index.

## Validation

- Required commands: `npm run check:ci`; `npm run build`.
- Optional/manual checks: Signed-out desktop/mobile Explore-to-auth states; close/back behavior; canonical query preservation. Existing URL query parameters are preserved; Explore's local-only filter controls are not converted into a new URL-state model in this slice.
- Fixtures or regression tests needed: Valid question intent, repeated parameters, empty values, external/protocol-relative/backslash/control-character destinations, and OAuth callback decisions.

## Rollout

- Risk level: Medium; authentication routing is launch-critical but the change is additive and guarded by safe internal redirects.
- Backward compatibility: Direct auth links without handoff parameters retain `/dashboard` success and `/` cancellation defaults.
- Metrics/events to watch: Auth failures, auth completion, setup views sourced from selected questions.
- Follow-up slice: SAV-206 only after this issue is merged; no work is included here.
