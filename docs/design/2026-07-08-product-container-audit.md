# 2026-07-08 Product Container Audit

## Purpose

Meelni authenticated pages should feel like one coherent live PM interview practice product, not a set of unrelated screens. This audit defines the structural shell rules coding agents should use before touching product UI.

## Container Taxonomy

### Dashboard Workspace

Use for authenticated sidebar routes where the user is choosing, reviewing, or managing practice.

Required structure:

- `app/dashboard/layout.tsx` owns auth, sidebar state, session summary, and the canonical reduced panel.
- `components/dashboard/layout/dashboard-layout.tsx` owns the full viewport canvas and content panel.
- Each dashboard section uses `DashboardPage` from `components/dashboard/layout/dashboard-page.tsx`.
- Page content should scroll inside the content panel, not on the outer body.
- The top strip is label-only. Page titles, explanatory copy, and local actions live inside the page body when needed.

Current routes:

- `/dashboard`: uses dashboard workspace through `OverviewSection` and `DashboardPage`.
- `/dashboard/questions`: uses dashboard workspace through `QuestionsSection` and `DashboardPage`.
- `/dashboard/history`: uses dashboard workspace through `HistorySection` and `DashboardPage`.
- `/dashboard/analytics`: uses dashboard workspace through `AnalyticsSection` and `DashboardPage`.
- `/dashboard/settings`: uses dashboard workspace through `SettingsSection` and `DashboardPage`.
- `/dashboard/new-interview`: uses dashboard workspace through `SetupContent` inside the dashboard layout.

Canonical launch rule:

- User-facing CTAs that start, retry, or continue interview practice should target `/dashboard/new-interview`.
- `/setup` is a compatibility redirect only and should not be used by new CTAs.
- `/dashboard/new-rep` is a legacy compatibility alias only and should not be used by new CTAs.

### Feedback Review Workspace

Use for post-interview review, feedback generation states, and attempt comparison. Feedback is not a sidebar route, but it still needs the same reduced product-container discipline.

Required structure:

- `components/feedback/feedback-surface.tsx` owns `FeedbackReviewShell`.
- Feedback result and comparison routes import `FeedbackReviewShell` instead of creating local `container mx-auto` or gradient page shells.
- Feedback status/loading/error pages use `FeedbackStatusPage`, which is backed by `FeedbackReviewShell`.
- Feedback content uses `FeedbackSectionCard`, `FeedbackScoreCard`, `FeedbackStateCard`, `FeedbackMetricCard`, and `FeedbackActionItem`.

Current routes:

- `/feedback/[sessionId]`: uses `FeedbackReviewShell`.
- `/feedback/[sessionId]/compare`: uses `FeedbackReviewShell`.
- `/feedback/[sessionId]/loading`: uses `FeedbackStatusPage`, backed by `FeedbackReviewShell`.

### Focused Interview Room

Use for the live interview. This is an intentional full-screen exception because the user is in a timed voice session, not browsing the dashboard.

Required structure:

- Keep `/interview` full-screen and stage-first.
- Use shared action/status primitives inside the room.
- Keep transcript in a stable rail or panel.
- Do not add dashboard sidebar chrome to the live room.

Current route:

- `/interview`: intentional focused room with session bar, stage, controls, and transcript rail.

Implementation notes:

- Persisted interview links with `sessionId`, `token`, and `url` must normalize the `/api/session/:id` response before hydrating the room. The API returns a `{ session }` envelope with camel-case database fields; the client room uses its existing snake-case runtime shape.
- Global consent UI should not render inside `/interview`. The focused room needs uncontested microphone, hint, end-session, timer, and transcript controls.

### Auth Flow

Use for authentication and password recovery pages. Auth is public-facing, but it is not a marketing route; it should feel calm, direct, and account-focused.

Required structure:

- Use `components/auth/auth-shell.tsx` for `AuthShell`, `AuthCard`, `AuthDivider`, `AuthMessage`, and provider buttons.
- Keep form controls and submit actions on shared primitives.
- Do not use dashboard sidebar chrome, feedback review shells, or marketing article shells for auth routes.

Current routes:

- `/auth/signin`: uses `AuthShell`.
- `/auth/signup`: uses `AuthShell`.
- `/auth/forgot-password`: uses `AuthShell`.
- `/auth/reset-password`: uses `AuthShell`.

### Compatibility Redirects

Use for legacy links only.

Current routes:

- `/setup`: redirects to `/dashboard/new-interview` and should not regain a standalone setup UI.
- `/dashboard/new-rep`: preserves query context and redirects to `/dashboard/new-interview`.

### Public And Content Pages

Use marketing/content primitives instead of the authenticated product container.

Current route families:

- Landing and marketing: `/`, `/pricing`, `/pricing/success`, `/pricing/canceled`.
- Question/content discovery: `/explore`, `/blog`, `/blog/[id]`, `/companies`, `/companies/[slug]`.
- Utility and legal: `/contact`, `/privacy`, `/terms`.

## Production Route Inventory

Every production `app/**/page.tsx` route is classified here so future agents can audit shell decisions by file, not only by visual memory. Internal visual test routes and the unsupported public docs route were removed in SAV-217 and are guarded from production builds.

| Route File                                  | Route                           | Family                    | Required Shell/Primitive                                  |
| ------------------------------------------- | ------------------------------- | ------------------------- | --------------------------------------------------------- |
| `app/page.tsx`                              | `/`                             | Public/content            | Marketing and landing primitives                          |
| `app/pricing/page.tsx`                      | `/pricing`                      | Public/content            | Pricing/marketing surfaces                                |
| `app/pricing/success/page.tsx`              | `/pricing/success`              | Public/content            | Public-page status surface                                |
| `app/pricing/canceled/page.tsx`             | `/pricing/canceled`             | Public/content            | Public-page status surface                                |
| `app/explore/page.tsx`                      | `/explore`                      | Public/content            | Question-bank and shared form/action primitives           |
| `app/blog/page.tsx`                         | `/blog`                         | Public/content            | Marketing/content listing primitives                      |
| `app/blog/[id]/page.tsx`                    | `/blog/[id]`                    | Public/content            | Marketing article primitives                              |
| `app/companies/page.tsx`                    | `/companies`                    | Public/content            | Marketing/content listing primitives                      |
| `app/companies/[slug]/page.tsx`             | `/companies/[slug]`             | Public/content            | Marketing article primitives                              |
| `app/contact/page.tsx`                      | `/contact`                      | Public/content            | Marketing and shared form primitives                      |
| `app/privacy/page.tsx`                      | `/privacy`                      | Public/content            | Marketing article primitives                              |
| `app/terms/page.tsx`                        | `/terms`                        | Public/content            | Marketing article primitives                              |
| `app/auth/signin/page.tsx`                  | `/auth/signin`                  | Auth flow                 | `AuthShell`                                               |
| `app/auth/signup/page.tsx`                  | `/auth/signup`                  | Auth flow                 | `AuthShell`                                               |
| `app/auth/forgot-password/page.tsx`         | `/auth/forgot-password`         | Auth flow                 | `AuthShell`                                               |
| `app/auth/reset-password/page.tsx`          | `/auth/reset-password`          | Auth flow                 | `AuthShell`                                               |
| `app/dashboard/page.tsx`                    | `/dashboard`                    | Dashboard workspace       | `DashboardPage` through `OverviewSection`                 |
| `app/dashboard/questions/page.tsx`          | `/dashboard/questions`          | Dashboard workspace       | `DashboardPage` through `QuestionsSection`                |
| `app/dashboard/history/page.tsx`            | `/dashboard/history`            | Dashboard workspace       | `DashboardPage` through `HistorySection`                  |
| `app/dashboard/analytics/page.tsx`          | `/dashboard/analytics`          | Dashboard workspace       | `DashboardPage` through `AnalyticsSection`                |
| `app/dashboard/settings/page.tsx`           | `/dashboard/settings`           | Dashboard workspace       | `DashboardPage` through `SettingsSection`                 |
| `app/dashboard/new-interview/page.tsx`      | `/dashboard/new-interview`      | Dashboard workspace       | `SetupContent` inside dashboard layout                    |
| `app/dashboard/new-rep/page.tsx`            | `/dashboard/new-rep`            | Compatibility redirect    | Preserve query and redirect to `/dashboard/new-interview` |
| `app/feedback/[sessionId]/page.tsx`         | `/feedback/[sessionId]`         | Feedback review workspace | `FeedbackReviewShell`                                     |
| `app/feedback/[sessionId]/compare/page.tsx` | `/feedback/[sessionId]/compare` | Feedback review workspace | `FeedbackReviewShell`                                     |
| `app/feedback/[sessionId]/loading/page.tsx` | `/feedback/[sessionId]/loading` | Feedback review workspace | `FeedbackStatusPage` backed by `FeedbackReviewShell`      |
| `app/interview/page.tsx`                    | `/interview`                    | Focused interview room    | Full-screen interview room chrome                         |
| `app/setup/page.tsx`                        | `/setup`                        | Compatibility redirect    | Redirect to `/dashboard/new-interview`                    |

## Audit Checklist

Before changing an authenticated product page:

1. Identify the route family: dashboard workspace, feedback review workspace, focused interview room, or compatibility redirect.
2. Confirm the route uses the family shell before editing inner cards.
3. Prefer shared primitives over local markup: `DashboardPage`, dashboard surfaces, `FeedbackReviewShell`, feedback surfaces, `AppSurface`, `Button`, form controls, and `SelectableCard`.
4. Keep one scroll container per page family.
5. Keep page-level labels and actions consistent with the family: dashboard labels in the fixed top strip, feedback title/action in `FeedbackReviewShell`, interview controls in the room chrome.
6. Add or update guardrails when fixing systemic drift.

## Priority Findings

- P0 complete in this pass: Main feedback result and comparison routes now use the feedback review workspace instead of standalone `container mx-auto` shells.
- P0 complete in previous work: Dashboard sidebar pages use the reduced dashboard content panel and `DashboardPage`.
- P0 complete in this pass: Production route inventory now classifies every non-test `app/**/page.tsx` route by family and required shell.
- P0 accepted exception: `/interview` remains a focused full-screen room.
- P1 complete in this pass: Authenticated visual QA captured desktop and mobile evidence for dashboard routes, the interview-launch flow, feedback result, feedback loading, feedback comparison, and the focused interview room.
- P2 follow-up: Public/content routes should continue converging on marketing surface primitives, but they are outside this authenticated product-container slice.

## Visual QA Evidence

Authenticated screenshots and route-result JSON live in `docs/design/screenshots/2026-07-08-authenticated-qa/`.

Covered at desktop `1440x1000` and mobile `390x844`:

- `/dashboard`
- `/dashboard/questions`
- `/dashboard/history`
- `/dashboard/analytics`
- `/dashboard/settings`
- `/dashboard/new-rep` (the launch route at capture time; now a compatibility alias for `/dashboard/new-interview`)
- `/feedback/[sessionId]`
- `/feedback/[sessionId]/loading`
- `/feedback/[sessionId]/compare`
- `/interview?sessionId=...&token=...&url=...`

Results:

- All covered routes returned `200`.
- All covered routes had no horizontal overflow.
- Feedback loading correctly canonicalized to the completed feedback route after polling.
- The focused interview room stayed on `/interview`, rendered the stage, controls, timer, and transcript panel at both viewport sizes.
- Known local/headless runtime noise remains separate from structural layout pass/fail: the dev CSP blocks the web-vitals CDN script, Statsig may log SDK exception calls in local dev, and headless Chromium reports LiveKit audio support/disconnect messages.

## Guardrails

`scripts/design-system-guardrails.test.mjs` now checks that every production `app/**/page.tsx` file is classified in this inventory, priority feedback routes import the review/status primitives, and local standalone shell patterns such as `container mx-auto`, `bg-background min-h-screen`, or `from-background via-background` do not reappear in feedback review routes.
