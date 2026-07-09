# Live PM Interview Practice Positioning Migration

## Intent

- User request: remove the PM interview gym/fitness framing and relaunch with a coherent product strategy, route, and product vocabulary.
- Product/user outcome: candidates understand that Meelni provides live PM mock interviews, PM-specific feedback, and visible progress without an unsupported readiness promise.
- Why now: the product is paused behind a feature gate and can absorb a deliberate compatibility migration before relaunch.

## Slice

- Primary slice: positioning and authenticated interview launch.
- Secondary slices: dashboard progress language, analytics compatibility, SEO entry points, and product documentation.
- Relevant skills: `meelni-product-strategy`, `meelni-ui-design-system`, `meelni-vertical-slice-playbooks`, and `meelni-engineering-memory`.

## Linear Tracking

- Project: Meelni Relaunch Readiness.
- Parent slice issue: SAV-165.
- Child deliverable issues: SAV-173 and SAV-174.
- Current Linear state: In Progress.

## Scope

- In scope: accepted positioning contract; removal of fitness metaphors; canonical `/dashboard/new-interview` route; full query-context preservation; legacy route and analytics compatibility; recent-practice language; tests and product-memory updates.
- Out of scope: changing the relaunch feature-gate default, claiming predictive interview readiness, or expanding beyond PM interview practice.
- Assumptions: `/dashboard/new-rep` and `new_rep_*` are temporary compatibility interfaces, not canonical product language.

## Product Lens

- Audience: candidates actively preparing for product-manager interviews.
- Lever: improve activation by making the next action and expected outcome immediately legible; improve retention by connecting completed interviews to a credible next focus.
- Product Compass note: voice is the delivery mechanism; PM-specific interview practice and feedback are the product value.

## Technical Plan

- Establish one product-language contract and accepted decision record.
- Migrate launcher domain names and routes to interview language.
- Parse, preserve, and apply launch context across redirects and authentication.
- Dual-emit canonical and legacy launcher analytics during a time-bounded compatibility window.
- Replace readiness and rep language in dashboard contracts and UI.
- Add regression guardrails for product language and route ownership.

## Validation

- Required commands: targeted route/core/dashboard tests, `npm run test:local`, `npm run typecheck`, `npm run typecheck:tests`, `npm run lint`, and `npm run build`.
- Manual checks: canonical launcher, legacy redirect with multiple query parameters, selected-question/auth return, dashboard CTA paths, responsive UI, and analytics emissions.
- Regression tests: query preservation and application, legacy-route allowlist, canonical event family, and prohibited active product language.

## Rollout

- Risk level: medium; this touches every practice entry point but not persisted interview data.
- Backward compatibility: preserve `/dashboard/new-rep`, `/setup`, and `new_rep_*` only at explicit compatibility boundaries through August 9, 2026.
- Metrics/events to watch: canonical launcher viewed, start attempted, start succeeded, start failed, and legacy-route redirects.
- Follow-up slice: remove compatibility aliases after the observation window and before they become permanent product vocabulary.
