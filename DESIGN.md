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
- Use `components/dashboard/dashboard-surface.tsx` for repeated dashboard cards:
  - `DashboardMetricCard`: canonical stat/KPI card with optional icon and change indicator.
  - `DashboardChartCard`: canonical chart panel with title, description, action slot, and stable content spacing.
  - `DashboardStateCard`: canonical dashboard empty/error state surface.
  - `DashboardSkeletonCard`: canonical dashboard metric/chart loading skeleton.
  - `DashboardSectionCard`: canonical compact dashboard panel with uppercase section title.
  - `DashboardActionCard`: canonical dashboard recommendation or CTA panel with action slot.
- Use `components/feedback/feedback-surface.tsx` for repeated feedback cards:
  - `FeedbackSectionCard`: canonical titled feedback panel with optional icon, action slot, tone, and content spacing.
  - `FeedbackScoreCard`: canonical emphasized score summary panel.
  - `FeedbackStateCard`: canonical feedback empty/loading/generate state surface.
  - `FeedbackStatusPage`: canonical full-page feedback status layout for partial, insufficient, abandoned, loading, and recovery states.
  - `FeedbackMetricCard`: canonical compact metric tile for session stats and feedback thresholds.
  - `FeedbackActionItem`: canonical row item for feedback recommendations, reasons, tips, and troubleshooting guidance.
- Add product-level composition components when a treatment repeats across pages, such as app shell, page header, metric card, empty state, status pill, CTA panel, and chart card.
- Raw `<button>` and `<input>` are acceptable only when a primitive cannot express the required native behavior; document the exception in code if it is non-obvious.
- Use lucide-react icons through component imports. Avoid hand-drawn inline SVG icons for common actions.

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
