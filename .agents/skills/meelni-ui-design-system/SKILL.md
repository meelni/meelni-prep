---
name: meelni-ui-design-system
description: Use when building, modifying, reviewing, or prototyping Meelni UI, components, pages, surfaces, styling, motion, responsive states, design tokens, or visual guardrails.
---

# Meelni UI Design System

Use this skill for Meelni frontend UI work. Treat UI as product behavior: the interface should help PM candidates practice, understand progress, recover from errors, and trust the product.

## Read First

- `AGENTS.md`
- `DESIGN.md`
- `components.json`
- `app/globals.css`
- `scripts/design-system-guardrails.test.mjs`
- Existing route/component files for the surface being changed.

Read relevant shared primitives before inventing markup:

- `components/ui/`
- `components/ui/app-surface.tsx`
- `components/auth/auth-shell.tsx`
- `components/ui/selectable-card.tsx`
- `components/dashboard/dashboard-surface.tsx`
- `components/feedback/feedback-surface.tsx`
- `components/marketing/marketing-surface.tsx`

## Operating Stance

- Reuse Meelni primitives before custom markup.
- Keep the UI professional, tactical, trustworthy, and PM interview-focused.
- Build the actual workflow surface first; avoid marketing detours inside product flows.
- Prefer dense, scannable, calm product UI over decorative card stacks.
- Do not add generic AI decoration, model/provider controls, or broad coaching language without product acceptance.

## Task Routing

- **Production UI change**: modify the real route/component and cover states.
- **Design-system drift**: update or reuse a shared primitive, then add/adjust guardrail tests.
- **Fuzzy UI direction**: prototype 3 structurally different variants at the real render site, behind a dev/internal gate, then delete losing variants.
- **shadcn component work**: inspect current project config with `npx shadcn@latest info`; use existing installed components first. Before adding/updating shadcn components, run `npx shadcn@latest docs <component>` and inspect docs/examples.

## UI Quality Gates

### Product And Flow

- Does the surface make the user's next PM interview action obvious?
- Are primary, secondary, and destructive actions visually distinct?
- Are empty, loading, error, disabled, permission, upgrade, and recovery states handled?
- Does copy describe PM interview practice behavior rather than generic AI features?

### Components And Tokens

- Use semantic Tailwind tokens from `DESIGN.md`; do not use raw color utilities or hardcoded color values when a token exists.
- Do not wrap OKLCH CSS variables in `hsl()`, `rgb()`, or `rgba()`.
- Use shared primitives: `Button`, form controls, `AppSurface`, `StatusPill`, `SelectableCard`, dashboard/feedback/marketing surfaces.
- Use lucide-react icons for common actions; avoid hand-drawn inline SVGs.
- Add a product-level composition component when the same treatment repeats across pages.

### Layout And Responsiveness

- Text must fit its container on mobile and desktop.
- Fixed-format elements need stable dimensions: grids, tiles, toolbars, counters, boards, cards, chart containers, and icon buttons.
- Use predictable spacing and hierarchy; related items should be grouped spatially.
- Do not put cards inside cards or turn full page sections into floating card stacks.
- Check the surface in the actual app shell, not a vacuum.

### Accessibility And Interaction

- Use semantic controls, labels, focus states, keyboard paths, and non-color-only status.
- Hit targets should be comfortable; expand small targets invisibly when needed.
- Dialogs, sheets, drawers, popovers, and menus need clear titles, focus behavior, and escape/dismiss paths.
- Loading and optimistic states should respond quickly enough to feel alive.

### Motion And Polish

- Use `lib/animations.ts` presets when they fit.
- User-triggered animations should usually finish within 300ms; hover/press feedback should be subtle.
- Avoid animation on high-frequency interactions or keyboard navigation.
- Respect reduced-motion expectations when adding meaningful motion.
- Motion should clarify state changes or perceived speed; decorative motion must earn its cost.

## Prototype Lane

Use this only when the UI direction is genuinely uncertain.

1. State the question the prototype answers.
2. Build 3, at most 5, structurally different variants at the real render site.
3. Add a dev/internal-only switcher that stores variant state in memory.
4. Use real app shell, real data shape, and realistic density when possible.
5. Keep variants read-only unless the question is specifically about interaction.
6. When a direction wins, rewrite the chosen structure into production quality and delete the switcher and losing variants.

## Validation

Choose by risk:

- Always for meaningful UI: `npm run typecheck`.
- When design primitives/guardrails changed: `npm run test:local`.
- When lint-sensitive TSX changed: `npm run lint`.
- When visible layout changed: run local app and verify mobile and desktop viewports; use screenshots when practical.
- When adding shadcn components: verify imports match `components.json` aliases and inspect generated files.

If validation fails from known unrelated baseline debt, record exact failing files/tests.

## Output

Use:

```markdown
## UI Surface
- Route/component:
- User outcome:
- Shared primitives used:

## Design Gates
- States:
- Responsive:
- Accessibility:
- Motion/polish:

## Validation
- Commands:
- Manual/browser:

## Risks
- ...
```

## Common Mistakes

- Building a custom card, modal, empty state, or CTA when a shared primitive exists.
- Making color/copy-only variants when the design question is structural.
- Verifying UI in an isolated sandbox instead of the real app surface.
- Adding animation before the hierarchy and states are clear.
- Treating TypeScript success as visual verification.
