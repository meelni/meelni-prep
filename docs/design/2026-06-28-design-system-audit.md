# 2026-06-28 Design System Audit

## Scope

Principal front-end engineering and product design audit of the current Meelni app on `main`.

Evidence used in this pass:

- Route inventory under `app/**/page.tsx`.
- Shared primitives under `components/ui/`.
- Domain components under `components/dashboard`, `components/interview`, `components/feedback`, `components/question-bank`, `components/explore`, and `components/sections`.
- Global tokens and utilities in `app/globals.css`.
- Existing guidance in `AGENTS.md`, `.claude/agents/ui-designer.md`, and `docs/architecture/adrs/ADR-014-ui-redesign-linear-notion.md`.

This audit is code-backed. Visual browser screenshots should follow for each implemented slice where auth and local data allow rendering.

## Executive Findings

1. The app has a useful shadcn-style primitive layer, but product pages frequently bypass it with raw buttons, inputs, one-off CTA cards, arbitrary text sizes, gradient fills, and custom shadows.
2. The intended design direction exists in scattered places, but there is no repo-level `DESIGN.md` front door. This makes future UI work depend on memory and taste instead of retrieval.
3. The color token implementation and older guidance disagree. Tokens are currently OKLCH, but multiple components still use `hsl(var(--token))` or `rgb(var(--token))`, which can produce invalid CSS values.
4. Authenticated product surfaces need attention first. Dashboard, setup/interview, feedback, and question bank are where repeated users spend time and where bespoke components will multiply fastest.
5. Public SEO pages have the highest visible class drift, especially blog and company pages, but they can be normalized after the core app vocabulary exists.

## Drift Snapshot

Approximate current hotspots from `app` and `components`:

- Raw `<button>` usage: 67.
- Raw `<input>` usage: 18.
- Arbitrary text sizes: 121.
- Arbitrary shadows: 7.
- Hex color literals in TS/TSX: 38.

Highest drift files by count:

- `app/companies/[slug]/page.tsx`
- `app/blog/[id]/page.tsx`
- `app/companies/page.tsx`
- `app/auth/signup/page.tsx`
- `components/dashboard/sections/questions.tsx`
- `app/blog/page.tsx`
- `app/auth/signin/page.tsx`
- `components/dashboard/layout/sidebar.tsx`

## Page-By-Page Audit

### Landing Page

Files:

- `app/page.tsx`
- `components/home-wrapper.tsx`
- `components/sections/*`

Health: medium.

Strengths:

- Clear modular section structure.
- Strong first-screen identity and motion.
- Existing `Section` and landing sections make page-level refactors manageable.

Issues:

- Hero CTA uses a raw `<button>` and inline SVG instead of `Button` plus lucide icon.
- Hero uses local arbitrary display sizing beyond the named scale.
- Decorative gradients and checkered effects are repeated without a documented background system.

Priority: P2 after authenticated app primitives.

### Auth Pages

Files:

- `app/auth/signin/page.tsx`
- `app/auth/signup/page.tsx`
- `app/auth/forgot-password/page.tsx`
- `app/auth/reset-password/page.tsx`

Health: medium-low.

Issues:

- High raw primitive and arbitrary class count for a small page family.
- Forms should converge on shared auth shell, field, submit, helper, and provider-button patterns.
- Auth is a trust surface; inconsistency here is costly.

Priority: P1 after token guardrails.

### Dashboard Shell

Files:

- `components/dashboard/layout/dashboard-layout.tsx`
- `components/dashboard/layout/sidebar.tsx`
- `app/dashboard/layout.tsx`

Health: medium.

Strengths:

- Clear sidebar architecture.
- Collapsed state is persisted.
- Navigation is structured around meaningful product sections.

Issues:

- Sidebar imports `Button` but mostly uses raw buttons and links with local treatments.
- The primary "New Interview" CTA uses custom gradient/shadow values.
- User card, stats card, nav item, icon button, and theme toggle should become reusable shell patterns.

Priority: P0 because every authenticated dashboard route inherits this.

### Dashboard Overview, Analytics, History, Questions, Settings

Files:

- `components/dashboard/sections/*`
- `components/dashboard/charts/*`
- `components/dashboard/stats/*`

Health: medium-low.

Strengths:

- Cards and charts are already componentized.
- Empty states exist.
- Analytics components are separated enough to improve incrementally.

Issues:

- Repeated `Card` overrides create inconsistent section titles, chart cards, metric cards, and empty states.
- Chart colors mix tokens, hardcoded hex, and invalid `hsl(var(--token))` wrappers.
- Question bank has raw inputs/buttons and dense bespoke state styling.

Priority: P0/P1.

### Setup Flow

Files:

- `app/setup/page.tsx`
- `app/setup/setup-content.tsx`
- `app/setup/components/*`
- `components/dashboard/setup-modal/*`

Health: medium.

Strengths:

- Two-step flow is understandable.
- Premium/locked states and quota modals exist.

Issues:

- Setup page and setup modal appear to carry parallel patterns.
- `gradient-text` is referenced but not defined in the current CSS.
- Selection cards need one shared selectable-card primitive.

Priority: P1 because it leads directly into the interview.

### Interview Room

Files:

- `app/interview/page.tsx`
- `app/interview/components/*`
- `components/interview/*`

Health: medium-low.

Strengths:

- Strong product-specific components for visualizer, transcript, controls, and state.
- LiveKit boundary is separated.

Issues:

- Loading/error states use local raw controls.
- Transcript panel references `bg-surface`, but no `surface` token exists.
- Question panel, transcript shell, status pills, and header should use shared product surface patterns.

Priority: P0/P1 because this is the core product experience.

### Feedback

Files:

- `app/feedback/[sessionId]/*`
- `components/feedback/*`

Health: medium.

Strengths:

- Feedback states are broken into components.
- Score/rubric/drill sections have reusable potential.

Issues:

- Repeated card title treatments and progress visuals.
- Some components still reference missing `bg-surface`.
- Compare page has raw buttons.

Priority: P1 after interview surface tokens.

### Question Bank And Explore

Files:

- `app/explore/page.tsx`
- `components/explore/*`
- `components/question-bank/*`
- `components/dashboard/sections/questions.tsx`

Health: medium-low.

Issues:

- Search/filter/select patterns are bespoke across public and authenticated contexts.
- Raw inputs/buttons appear in search autocomplete, filters, dialogs, cards, and mobile drawers.
- Needs a shared filter-bar, search-input, selectable question card, and bulk-action toolbar vocabulary.

Priority: P1/P2.

### Blog And Company SEO Pages

Files:

- `app/blog/page.tsx`
- `app/blog/[id]/page.tsx`
- `app/companies/page.tsx`
- `app/companies/[slug]/page.tsx`

Health: low from a system consistency perspective.

Strengths:

- These pages are content-rich and SEO-oriented.
- Strong conversion CTAs are present.

Issues:

- Highest arbitrary text-size and gradient drift in the repo.
- CTA panels and badge labels are hand-built repeatedly.
- Prose rendering has local heading, paragraph, list, quote, code, and table styles.

Priority: P2 once product shell primitives are established.

### Pricing, Legal, Docs, Contact

Files:

- `app/pricing/page.tsx`
- `app/privacy/page.tsx`
- `app/terms/page.tsx`
- `app/docs/page.tsx`
- `app/contact/page.tsx`

Health: medium.

Issues:

- Pricing should share marketing CTA, plan card, and section heading patterns.
- Legal pages need simple prose tokens.
- Docs page uses hardcoded gray palette and should be pulled into the token system.

Priority: P2/P3.

## Prioritized Implementation Plan

### Slice 1 - Token Sanity And Design Front Door

Priority: P0.

Work:

- Add `DESIGN.md`.
- Add this audit.
- Add guardrail coverage against invalid OKLCH token wrappers.
- Replace `hsl(var(--token))` and `rgb(var(--token))` usage with `var(--token)` where the token is already a valid CSS color.
- Add missing `surface` token aliases or migrate `bg-surface` references to `bg-card` / `bg-muted` patterns.
- Define existing referenced utilities such as `gradient-text` if they remain part of the direction.

### Slice 2 - App Surface Primitives

Priority: P0.

Work:

- Introduce shared composition components for app page shell, page header, surface/card variants, status pill, icon button, and empty/loading/error states.
- Migrate dashboard sidebar and interview loading/error/transcript surfaces first.

Status:

- Started. `components/ui/app-surface.tsx` now provides `AppSurface`, compact surface header pieces, and `StatusPill`.
- Dashboard sidebar stats/user cards and interview question/transcript/status surfaces have been moved onto this vocabulary.
- Remaining P0/P1 work: app page shell, page header, and reusable empty/loading/error states.

### Slice 3 - Auth And Activation

Priority: P1.

Work:

- Create a shared auth shell and auth form field/action pattern.
- Normalize setup selectable cards and difficulty/round selectors.
- Align setup page and setup modal patterns.

Status:

- Auth shell started. `components/auth/auth-shell.tsx` now provides `AuthShell`, `AuthCard`, `AuthDivider`, `AuthMessage`, and `GoogleAuthButton`.
- Sign in, sign up, forgot password, and reset password pages now use shared `Button`, `Input`, `Label`, and auth shell primitives.
- Setup selector standardization started. `components/ui/selectable-card.tsx` now provides `SelectableCard`, `SelectableCardIcon`, `SelectableCardCheck`, and `SelectableCardLockOverlay`.
- `/setup` round type and difficulty selectors now use the shared selectable-card primitive.
- Dashboard setup modal interview-type, mode, smart-defaults, and advanced setting actions now use the shared selectable-card and button primitive families.
- Remaining P1 work: normalize shared empty/loading/error states and continue activation-adjacent question bank primitives.

### Slice 4 - Dashboard Content

Priority: P1.

Work:

- Normalize metric cards, chart cards, card titles, timelines, and dashboard empty states.
- Move chart color literals to chart tokens.
- Migrate question bank filters/search/dialogs to shared inputs/buttons.

Status:

- Started. `components/dashboard/dashboard-surface.tsx` now provides `DashboardMetricCard`, `DashboardChartCard`, `DashboardStateCard`, `DashboardSkeletonCard`, `DashboardSectionCard`, and `DashboardActionCard`.
- Overview stat cards, analytics stat cards, score trend chart, and competency radar chart now use the dashboard surface vocabulary.
- Performance trend, competency breakdown, score-by-type, time investment, and type distribution use the shared dashboard chart surface. The unused reward-oriented difficulty chart was retired in SAV-257.
- Analytics empty, loading, and error states now use shared dashboard state/skeleton cards.
- Dashboard overview recent activity, interview type breakdown, welcome state, evidence-backed next practice recommendation, and start-interview CTA use shared dashboard section/action/state cards. The former streak/reward surfaces were retired in SAV-257.
- Weakest-area focus cards now use shared dashboard section/action/skeleton cards. The former badge/achievement cards were retired in SAV-257.
- History loading, empty, and session-list states now use dashboard skeleton/state/action primitives.
- Legacy score trend and competency radar panels now use dashboard chart/state primitives; competency radar hard-coded chart colors were replaced with theme tokens.
- Settings account, appearance, and danger-zone surfaces now use shared dashboard section/action primitives.
- Billing loading/error, subscription, usage, upgrade CTA, payment history, and cancellation choices now use shared dashboard primitives and semantic destructive/warning tokens.
- Quota exceeded and tier upgrade modals now use shared dashboard section/action cards for plan, usage, and upgrade-price surfaces.
- Priority dashboard and feedback chart configs now use shared chart tokens instead of hard-coded purple hex values.
- Dashboard question-bank loading, practice-set, empty-result, desktop-table, mobile-filter, tab, bookmark, and filter controls now use shared dashboard surface and button primitives.
- Question-bank child filter, drawer, question card, practice-set list, practice-set dialog, and autocomplete controls now use shared button/form/dialog primitives; `components/ui/textarea.tsx` adds the missing shared textarea primitive.
- Dashboard error and loading states now use shared button/state/skeleton primitives and semantic status treatments. The former dashboard badge display was retired in SAV-257.
- Added shared `success`, `warning`, and `info` status tokens and migrated dashboard helper badges, recommendations, and chart callouts off raw green/orange/blue/red/purple utility classes.
- 2026-07-09 update: interview launch CTAs now target `/dashboard/new-interview`; `/setup` and `/dashboard/new-rep` remain only as compatibility redirects.
- Remaining P1 work: scan remaining dashboard/supporting surfaces for bespoke token usage, then continue into marketing and SEO surfaces.

### Slice 5 - Feedback

Priority: P1.

Work:

- Normalize feedback cards, score treatments, progress bars, rubric rows, transcript viewer, and compare actions.

Status:

- Started. `components/feedback/feedback-surface.tsx` now provides `FeedbackSectionCard`, `FeedbackScoreCard`, and `FeedbackStateCard`.
- `components/feedback/feedback-display.tsx` now uses shared feedback state, score, and section cards for the generate state, overall score, competency breakdown, strengths, improvements, and drills.
- `components/feedback/score-breakdown.tsx` now uses the shared feedback section surface for the radar chart panel.
- Strengths, improvements, drill recommendation, and transcript viewer components now use shared feedback section/state surfaces instead of local card shells.
- Partial, insufficient, and abandoned feedback states now use shared feedback status-page, metric, section, and action-item primitives.
- Compare route attempt selection now uses shared selectable cards and feedback state/section surfaces.
- Attempt comparison cards and progress summary now use shared feedback section/action primitives.
- Main feedback result route loading/error/processing/skipped/completed states now use shared feedback status, score, section, and action-item primitives.
- Rubric dimension rows now use shared feedback section cards.
- Dedicated feedback loading route/component states now use shared feedback status-page, section, action-item, and button primitives while preserving polling, progress, and retry behavior.
- 2026-07-08 update: feedback result, loading/status, and comparison routes now use `FeedbackReviewShell`, so post-interview review is housed in the authenticated product-container system instead of standalone `container mx-auto` shells.
- 2026-07-08 update: authenticated visual QA covered feedback result, loading, and comparison states at desktop and mobile sizes in `docs/design/screenshots/2026-07-08-authenticated-qa/`.
- Remaining P1 work: continue lower-traffic feedback states only when new state-specific drift appears.

### Slice 6 - Marketing And SEO

Priority: P2.

Work:

- Normalize section headings, prose typography, badge labels, CTA panels, blog cards, company cards, and conversion blocks.
- Reduce arbitrary text sizes by adding named type utilities only where needed.

Status:

- Started. `components/marketing/marketing-surface.tsx` now provides `MarketingPage`, `MarketingHero`, `MarketingEyebrow`, `MarketingCard`, `MarketingCtaCard`, and `MarketingMetaRow`.
- Blog and company index pages now share marketing hero, eyebrow, content-card, metadata-row, CTA-card, and button/link action primitives instead of parallel bespoke card and CTA markup.
- Added guardrail coverage requiring those index pages to use the shared marketing surface and action vocabulary without inline SVG arrows or page-local arbitrary text sizes.
- Pricing success, loading, processing, and canceled result states now use the shared marketing page/state surface with `Button asChild` actions and semantic success/muted tones instead of local card shells and raw green utilities.
- Added guardrail coverage for pricing result pages to prevent `ui/card` imports and raw success color utilities from returning.
- Blog detail pages now use shared marketing article header, prose, metadata-row, CTA-card, page, and button primitives; markdown callouts now use semantic success/destructive tokens instead of raw red/green utilities.
- Added guardrail coverage for the blog detail renderer to prevent inline SVG arrows, page-local arbitrary text sizes, and raw red/green status utilities from returning.
- Contact page submitted, header, form, reason selector, error, direct-contact, response-time, and quick-help surfaces now use shared marketing/app/form/selectable primitives instead of local card shells, raw buttons, raw textarea markup, and raw red/green status colors.
- Added guardrail coverage for the contact page to prevent `ui/card`, raw buttons, raw textarea markup, and raw red/green status utilities from returning.
- Company detail pages now use shared marketing page, article header, eyebrow, meta-row, CTA-card, and button primitives for the core public SEO shell, show-more controls, mini CTA, final CTA, and back link; local arbitrary text sizes and inline SVG arrows were removed from the renderer.
- Added guardrail coverage for the company detail renderer to prevent raw buttons, inline SVG arrows, and page-local arbitrary text sizes from returning.
- 2026-07-22 update: SAV-154 refreshed the public/content route inventory after
  `/docs` removal in `docs/design/2026-07-22-public-content-surface-audit.md`.
  No launch-blocking public marketing-surface drift remains; future public
  polish should be filed as route-specific follow-ups instead of a broad audit.

## Acceptance Criteria

- New UI code defaults to shared tokens and primitives.
- No invalid color wrapper around OKLCH design tokens.
- Authenticated product shell uses shared app-surface vocabulary.
- Raw primitive count decreases in touched page families.
- `npm run typecheck` passes.
- Targeted guardrail tests pass.
- Visual verification is performed for changed routable screens where local data/auth allows.
