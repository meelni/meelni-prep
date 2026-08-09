# 2026-07-08 Canonical UI Patterns

## Purpose

This is the fast reference for future Meelni UI work. Use these production examples before writing new markup. The goal is not to copy every class; the goal is to copy the structural decision: shell, action hierarchy, state model, and primitive choice.

## How To Use

1. Classify the route family in `docs/design/2026-07-08-product-container-audit.md`.
2. Pick the closest pattern below.
3. Reuse the named primitives and action hierarchy.
4. If none fits, update the design-system docs before inventing a new pattern.

## Route Shell Examples

| Pattern                   | Use When                                                                                     | Canonical Files                                                                                                                  | Why It Works                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Dashboard workspace shell | Authenticated sidebar pages and New Mock Interview                                           | `app/dashboard/layout.tsx`, `components/dashboard/layout/dashboard-layout.tsx`, `components/dashboard/layout/dashboard-page.tsx` | One scroll owner, persistent sidebar, reduced content panel, label-only top strip                       |
| Dashboard overview        | A dashboard page needs one recommended next action plus supporting evidence                  | `components/dashboard/sections/overview.tsx`                                                                                     | Starts with the next mock interview, uses one primary action, then evidence and recent interviews       |
| Dashboard Question Bank   | A dashboard page needs stable discovery controls beside a long browsable result set          | `components/dashboard/sections/questions.tsx`                                                                                    | Search and filters remain stable while the responsive question list owns vertical scrolling             |
| Feedback review shell     | Post-interview result, comparison, loading, skipped, failed, partial, or insufficient states | `components/feedback/feedback-surface.tsx`, `app/feedback/[sessionId]/page.tsx`, `app/feedback/[sessionId]/compare/page.tsx`     | Feedback feels like part of the product workspace without sidebar chrome                                |
| Focused interview room    | User is in the live voice interview                                                          | `app/interview/page.tsx`, `app/interview/components/interview-controls.tsx`                                                      | Full-screen stage, stable controls, transcript rail, no dashboard navigation competing with the session |
| Marketing/content page    | Public pricing, blog, company, docs, contact, legal, and landing pages                       | `components/marketing/marketing-surface.tsx`, `app/blog/[id]/page.tsx`, `app/companies/[slug]/page.tsx`                          | Public pages use article/CTA primitives instead of authenticated app chrome                             |
| Auth page                 | Sign in, sign up, reset, forgot password                                                     | `components/auth/auth-shell.tsx`, `app/auth/signin/page.tsx`, `app/auth/signup/page.tsx`                                         | Consistent centered auth card, provider button, divider, message, and back affordance                   |

## Action Cluster Examples

| Pattern                   | Canonical Files                                                                                                                                           | Action Model                                                                                                                           |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Recommendation CTA        | `components/dashboard/sections/overview.tsx`, `components/dashboard/weakest-area-card.tsx`                                                                | One primary `Start mock interview`; secondary review/feedback action only when relevant                                                |
| Feedback recovery         | `components/feedback/feedback-review.tsx`, `components/feedback/feedback-lifecycle-status.tsx`                                                            | Recovery follows the authoritative lifecycle state; dashboard navigation stays secondary                                               |
| Feedback page back action | `app/feedback/[sessionId]/page.tsx`, `app/feedback/[sessionId]/compare/page.tsx`                                                                          | Back action is `ghost`, not primary; review content remains dominant                                                                   |
| Modal footer actions      | `components/dashboard/setup-modal.tsx`, `app/interview/components/end-session-modal.tsx`                                                                  | Secondary cancel/back and primary/destructive commit are visually distinct                                                             |
| Marketing conversion CTA  | `components/marketing/marketing-surface.tsx`, `components/public-activation-action.tsx`, `components/sections/cta.tsx`, `components/sections/pricing.tsx` | Public activation actions consume the shared relaunch decision; marketing can use higher emphasis while product dashboards stay calmer |

## State Examples

| State                        | Canonical Files                                                                                                                             | Notes                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard loading            | `components/dashboard/loading.tsx`, `components/dashboard/dashboard-surface.tsx`, `components/dashboard/sections/overview.tsx`              | Use dashboard loading primitives inside the dashboard shell                                                                       |
| Dashboard error              | `components/dashboard/error.tsx`                                                                                                            | Recovery action is clear and contained inside the product surface                                                                 |
| Empty or first-use dashboard | `components/dashboard/first-time-user-experience.tsx`, `components/dashboard/empty-state-card.tsx`                                          | Empty state should move users toward a PM mock interview, not generic onboarding                                                  |
| Feedback lifecycle states    | `components/feedback/feedback-review.tsx`, `components/feedback/feedback-lifecycle-status.tsx`                                              | One state machine owns missing, active, settling, pending, processing, skipped, failed, legacy, invalid, partial, and full states |
| Evidence-first finding       | `components/feedback/feedback-finding-card.tsx`                                                                                             | Present observation, every transcript quote, one next action, and confidence as evidence strength                                 |
| Interview deadline reached   | `app/interview/page.tsx`, `app/interview/components/timer-display.tsx`, `components/feedback/feedback-lifecycle-status.tsx`                 | Remove voluntary controls and mute input; hand ending/terminal truth to the actionable feedback lifecycle                         |
| Auth error/success message   | `components/auth/auth-shell.tsx`, `app/auth/forgot-password/page.tsx`                                                                       | Use shared auth message treatment rather than local alert markup                                                                  |
| Entitlement/upgrade          | `components/dashboard/quota-exceeded-modal.tsx`, `components/dashboard/tier-upgrade-modal.tsx`, `components/dashboard/sections/billing.tsx` | Plan, credit, and upgrade states should be explicit and recoverable                                                               |

## Primitive Examples

| Primitive                 | Canonical Files                                                                                                                | Use It For                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `Button`                  | `components/ui/button.tsx`                                                                                                     | Ordinary actions; variants are role-based, not page-themed                                      |
| `StatusPill`              | `components/ui/app-surface.tsx`, `app/interview/page.tsx`, `components/feedback/feedback-surface.tsx`                          | Compact status, category, and mode labels                                                       |
| `SelectableCard`          | `components/ui/selectable-card.tsx`, `app/setup/components/round-selector.tsx`, `app/setup/components/difficulty-selector.tsx` | Single-choice or locked selectable options                                                      |
| `SegmentedControl`        | `components/ui/segmented-control.tsx`, `components/feature-flags/feature-flag-dev-menu.tsx`                                    | Compact mutually exclusive mode switches with equal-width slots                                 |
| Dashboard surfaces        | `components/dashboard/dashboard-surface.tsx`                                                                                   | Dashboard metric, chart, state, skeleton, section, and action panels                            |
| Feedback surfaces         | `components/feedback/feedback-surface.tsx`                                                                                     | Feedback sections, scores, status, metrics, and recommendation rows                             |
| Marketing surfaces        | `components/marketing/marketing-surface.tsx`                                                                                   | Public page hero, article, card, prose, and CTA structure                                       |
| Public activation actions | `components/public-activation-action.tsx`                                                                                      | Relaunch-aware public practice, signup, demo, and purchase actions with a truthful paused state |
| `FilterPill`              | `components/ui/filter-pill.tsx`, `components/dashboard/sections/questions.tsx`, `components/dashboard/sections/history.tsx`    | Compact filter choices where pill shape communicates filter state                               |
| `DashboardSidebarNavItem` | `components/dashboard/dashboard-surface.tsx`, `components/dashboard/sections/settings.tsx`                                     | Dashboard category/sidebar choices where the selected item behaves like local page navigation   |

## Anti-Patterns To Avoid

- Copying from `app/test-*` into production routes.
- Adding raw page-level `<button>` instead of `Button`, `SegmentedControl`, `FilterPill`, `SelectableCard`, tabs, or a domain primitive.
- Adding a new `Button` variant for one page.
- Creating a route-local `container mx-auto` shell for dashboard or feedback pages.
- Putting cards inside cards.
- Making every sibling action primary.
- Using public marketing primitives inside authenticated dashboard pages.
- Using dashboard chrome in the focused interview room.
- Adding loading text without a skeleton, progress, or recovery model for meaningful workflows.

## When To Add A New Example

Add a new canonical example when:

- A pattern repeats across two or more production surfaces.
- A page introduces a new route family or workflow state.
- A guardrail allows an exception that future agents may copy.
- Review feedback shows agents are repeatedly misunderstanding a UI rule.

Keep examples short, production-linked, and current. Stale examples should be removed or replaced.
