# DESIGN.md - Meelni Design Front Door

The entry point for how Meelni should look, feel, and be implemented. Read this before changing product UI, marketing pages, dashboard surfaces, setup/interview flows, feedback, charts, or shared primitives.

## Product Direction

Meelni is a PM interview gym: real product-manager questions, live voice reps, PM-calibrated feedback, and visible improvement over time.

The UI should feel professional, tactical, trustworthy, and focused. It should help a candidate feel prepared and in control, not entertained by generic AI decoration.

## Source Of Truth

- Global tokens and typography utilities live in `app/globals.css`.
- Base primitives live in `components/ui/`.
- Product surfaces live in domain folders such as `components/dashboard/`, `components/interview/`, `components/feedback/`, `components/question-bank/`, and `components/sections/`.
- Current audit and roadmap live in `docs/design/2026-06-28-design-system-audit.md`.
- Product container taxonomy and authenticated route audit live in `docs/design/2026-07-08-product-container-audit.md`.
- Agent-scale maturity rules live in `docs/design/2026-07-08-agent-design-system-maturity.md`.
- Canonical UI pattern examples live in `docs/design/2026-07-08-canonical-ui-patterns.md`.
- External design-audit lens policy lives in `docs/design/2026-07-08-external-design-lenses.md`.
- Historical redesign decision: `docs/architecture/adrs/ADR-014-ui-redesign-linear-notion.md`.

## Design Model

Meelni uses a shadcn/ui foundation with Tailwind v4 CSS tokens. Components should consume semantic tokens and shared primitives before inventing local treatments.

### Color Roles

- `background` / `foreground`: page canvas and primary text.
- `card` / `card-foreground`: raised product surfaces and cards.
- `popover` / `popover-foreground`: dialogs, menus, floating surfaces.
- `primary` / `primary-foreground`: primary actions, selected states, focus emphasis, Meelni identity accents.
- `secondary` / `secondary-foreground`: quiet secondary controls and lower-emphasis fills.
- `muted` / `muted-foreground`: subdued panels, helper text, empty states.
- `accent` / `accent-foreground`: hover, subtle selection, and secondary active states.
- `destructive`: irreversible or dangerous actions.
- `border`, `input`, `ring`: edges, form outlines, and focus.
- `chart-*`: charts only.

Do not wrap OKLCH token variables in `hsl(var(--token))` or `rgb(var(--token))`. Use `var(--token)` in CSS and inline chart styles, or Tailwind utilities such as `bg-primary`, `text-muted-foreground`, and `border-border`.

### Typography

- Display: `font-display`, currently Outfit loaded as the Everett replacement.
- UI text: `font-sans`, Public Sans.
- Monospace: `font-mono`, Commit Mono for code, metrics, IDs, timestamps, and technical labels.

Use the shared text utilities in `app/globals.css` when they fit: `text-display-xl`, `text-display-lg`, `text-label`, `text-body`, `text-code`, and `text-code-sm`. Add named utilities before spreading arbitrary `text-[Npx]` classes across pages.

### Components

- Start from `components/ui` primitives: `Button`, `Input`, `Card`, `Badge`, `Dialog`, `Select`, `Switch`, `Table`, `Popover`, `Tooltip`, and related Radix wrappers.
- Use `components/ui/app-surface.tsx` for repeated app chrome and product surfaces:
  - `AppSurface`: bordered product panel/card shell with `default`, `panel`, `muted`, and `accent` variants.
  - `AppSurfaceHeader`, `AppSurfaceTitle`, `AppSurfaceDescription`: canonical compact panel header treatment.
  - `StatusPill`: canonical small status/category pill for primary, muted, warning, success, and danger states.
- Use `components/auth/auth-shell.tsx` for authentication pages:
  - `AuthShell`: centered auth canvas with the canonical background and optional back action.
  - `AuthCard`: branded auth card with icon, title, description, and shared surface styling.
  - `AuthDivider`, `AuthMessage`, `GoogleAuthButton`: canonical auth support pieces.
- Use `components/ui/selectable-card.tsx` for setup and other single-choice selection cards:
  - `SelectableCard`: native button-backed selectable surface with selected and locked states.
  - `SelectableCardIcon`, `SelectableCardCheck`, `SelectableCardLockOverlay`: canonical icon, selection, and locked upgrade affordances.
- Use `components/ui/segmented-control.tsx` for compact mutually exclusive mode switches:
  - `SegmentedControl`: canonical bordered group with stable equal-width slots.
  - `SegmentedControlItem`: native button-backed option with selected state and dashboard/default tones.
- Use `components/dashboard/dashboard-surface.tsx` for repeated dashboard cards:
  - `DashboardSidebarNavItem`: canonical dashboard settings/sidebar category option.
  - `DashboardMetricCard`: canonical stat/KPI card with optional icon and change indicator.
  - `DashboardChartCard`: canonical chart panel with title, description, action slot, and stable content spacing.
  - `DashboardStateCard`: canonical dashboard empty/error state surface.
  - `DashboardSkeletonCard`: canonical dashboard metric/chart loading skeleton.
  - `DashboardSectionCard`: canonical compact dashboard panel with uppercase section title.
  - `DashboardActionCard`: canonical dashboard recommendation or CTA panel with action slot.
- Use `components/feedback/feedback-surface.tsx` for repeated feedback cards:
  - `FeedbackReviewShell`: canonical reduced product-container shell for feedback result, loading/status, and comparison routes.
  - `FeedbackSectionCard`: canonical titled feedback panel with optional icon, action slot, tone, and content spacing.
  - `FeedbackScoreCard`: canonical emphasized score summary panel.
  - `FeedbackStateCard`: canonical feedback empty/loading/generate state surface.
  - `FeedbackStatusPage`: canonical full-page feedback status layout for partial, insufficient, abandoned, loading, and recovery states.
  - `FeedbackMetricCard`: canonical compact metric tile for session stats and feedback thresholds.
  - `FeedbackActionItem`: canonical row item for feedback recommendations, reasons, tips, and troubleshooting guidance.
- Add product-level composition components when a treatment repeats across pages, such as app shell, page header, metric card, empty state, status pill, CTA panel, and chart card.
- Raw `<button>` and `<input>` are acceptable only when a primitive cannot express the required native behavior; document the exception in code if it is non-obvious.
- Use lucide-react icons through component imports. Avoid hand-drawn inline SVG icons for common actions.

### Action Hierarchy

Every product surface should have a clear action model before styling buttons.

- Primary action: the one next PM interview action in the current scope. Use `Button` default or `glow` only for high-emphasis marketing or launch CTAs. Examples: start rep, generate feedback, save settings.
- Secondary action: useful but not the main commitment. Use `outline`. Examples: view feedback, repeat later, manage plan.
- Tertiary/navigation action: local back, dismiss, reveal, collapse, or low-risk utility. Use `ghost` or `link`; do not make these compete with the primary action.
- Destructive action: irreversible or scary actions. Use `destructive`; pair with confirmation or recovery copy when the consequence is meaningful.
- Icon-only action: use `Button size="icon"` with a lucide icon, accessible `aria-label` or `title`, and a stable square hit target. Do not use text-only rounded rectangles when a familiar icon exists.
- Segmented/filter actions: use an existing primitive such as `SegmentedControl`, `FilterPill`, `SelectableCard`, tabs, or a domain-specific reusable control. Raw native buttons are allowed inside those primitives only.
- One primary per scope: a page, modal, card, or toolbar can each own a primary action, but sibling actions inside that scope should not all look primary.

Button variants currently allowed in the shared primitive are `default`, `destructive`, `outline`, `secondary`, `ghost`, `link`, `glow`, and `quiet`. Do not add a new variant for one page. First try composition with existing variants, then create a domain primitive if the pattern repeats.

### Route And Shell Decision Tree

Before editing a page, classify the route family:

1. Dashboard workspace: authenticated sidebar pages and New Rep. Use `app/dashboard/layout.tsx`, the dashboard content panel, and `DashboardPage`.
2. Feedback review workspace: result, loading/status, skipped/partial/insufficient, and comparison pages. Use `FeedbackReviewShell` or `FeedbackStatusPage`.
3. Focused interview room: `/interview` only. Keep full-screen stage-first chrome and shared controls; do not add dashboard sidebar chrome.
4. Auth flow: sign-in, sign-up, forgot password, and reset password. Use `AuthShell` and auth primitives; do not borrow dashboard or marketing shells.
5. Public/content: marketing, blog, companies, docs, pricing, contact, legal, and explore. Use marketing/article/question-bank primitives, not authenticated product shells.
6. Compatibility redirect: legacy `/setup`; do not route new CTAs there.

If a route does not fit one of these families, stop and add the family to the product-container audit before building UI.

### Component Decision Tree

Use this order when building UI:

1. Existing domain composition: dashboard, feedback, auth, marketing, question-bank, or interview component.
2. Shared app primitive: `Button`, form controls, `AppSurface`, `StatusPill`, `SelectableCard`, `SegmentedControl`, `FilterPill`, `Card`, `Dialog`, `Popover`, `Tooltip`, `Table`.
3. Small domain primitive: create one when the same treatment appears in two or more places or when the pattern encodes product meaning.
4. Local markup: only for one-off layout glue with semantic HTML and tokenized styling.

Avoid nested cards, page-level floating card stacks, raw colors, ad hoc gradients, arbitrary text sizes, and route-local shells that duplicate a shared family shell.

### Required States

Every meaningful workflow surface should account for:

- Loading and skeleton or progress state.
- Empty or first-time state.
- Error and recovery state.
- Disabled or permission/entitlement state.
- Success or completion state when the action has a durable result.
- Mobile and desktop layout, with no horizontal overflow.
- Keyboard/focus path, semantic labels, and non-color-only status.

If a state is intentionally impossible, leave a concise code comment or test fixture showing why.

### Agent UI Change Checklist

Before an agent changes UI:

1. Read this file and the route's family audit doc.
2. Name the route family and shell.
3. Choose the primary action for the scope.
4. Open `docs/design/2026-07-08-canonical-ui-patterns.md` and pick the closest production example.
5. List the shared primitives being reused.
6. Check loading, empty, error, disabled, and success states.
7. Add or update guardrails for systemic drift.
8. Run `npm run test:local` when design guardrails change, `npm run typecheck` for meaningful UI changes, and `npm run lint` when TSX changes.

### External Design Lenses

Use `meelni-design-review-orchestrator` when bringing in external design-audit lenses such as Impeccable, ibelick/ui-skills, or Taste Skill.

- Impeccable is the preferred pilot for structured product/brand audit and detector-style review.
- ibelick/ui-skills is a tactical checklist source for accessibility, motion performance, metadata, and baseline cleanup.
- Taste Skill is allowed for public/content art direction and anti-generic marketing critique, not authenticated product UI.

Meelni wins on conflicts: PM interview product behavior, route shells, shared primitives, semantic tokens, and `lucide-react` icon conventions override external recommendations.

### Motion

Use existing motion presets from `lib/animations.ts` for app surfaces. Motion should clarify state changes and reduce perceived latency. Avoid large hover scaling on utilitarian surfaces; prefer subtle elevation, color, or 1.005-scale feedback.

### Page Families

- Public marketing: landing, pricing, blog, companies, docs, contact.
- Auth: sign in, sign up, reset, forgot password.
- Activation: setup and question-bank entry points.
- Interview: live room, transcript, controls, nudges, end-session modal.
- Feedback: loading, result, compare, partial/insufficient/abandoned states.
- Dashboard: overview, history, questions, analytics, settings, billing states.

Prioritize authenticated product quality before marketing polish when time is constrained.

## Enforcement Expectations

- Run `npm run typecheck` after meaningful UI changes.
- Run targeted tests for changed behavior.
- Add guardrail tests when fixing systemic drift, especially token misuse, raw primitive spread, or chart color hardcoding.
- Use local browser or screenshot verification for visible layout changes when a route can be rendered locally.
