# 2026-07-22 Public Content Surface Audit

## Purpose

This refresh closes the lower-priority public/content follow-up from SAV-154.
It checks whether public pages still have a coherent Meelni marketing/content
surface after the unsupported `/docs` route and public test surfaces were
removed.

This audit does not authorize launch, change the relaunch feature gate, change
SEO strategy, or redesign the authenticated product workspace.

## Route Inventory

Current production public/content page routes:

| Route file                                 | Route                          | Surface decision                                                                      |
| ------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------- |
| `app/page.tsx`                             | `/`                            | Landing sections in `components/sections/*`; accepted marketing composition exception |
| `app/pricing/page.tsx`                     | `/pricing`                     | `MarketingPage`, `MarketingHero`, `MarketingCtaCard`, pricing/app surfaces            |
| `app/pricing/success/page.tsx`             | `/pricing/success`             | `MarketingPage` status surface through checkout success client                        |
| `app/pricing/canceled/page.tsx`            | `/pricing/canceled`            | `MarketingPage` + `MarketingCtaCard` status surface                                   |
| `app/explore/page.tsx`                     | `/explore`                     | Question-bank discovery surface with shared form/action primitives                    |
| `app/questions/[questionId]/page.tsx`      | `/questions/[questionId]`      | `MarketingPage`, `MarketingProse`, `MarketingCtaCard`, question practice CTA          |
| `app/interview-types/[roundType]/page.tsx` | `/interview-types/[roundType]` | `MarketingPage`, `MarketingCtaCard`, round-specific content listing                   |
| `app/blog/page.tsx`                        | `/blog`                        | `MarketingPage`, `MarketingHero`, `MarketingCard`, `MarketingCtaCard`                 |
| `app/blog/[id]/page.tsx`                   | `/blog/[id]`                   | `MarketingPage`, article/prose primitives, CTA card                                   |
| `app/companies/page.tsx`                   | `/companies`                   | `MarketingPage`, `MarketingHero`, `MarketingCard`, `MarketingCtaCard`                 |
| `app/companies/[slug]/page.tsx`            | `/companies/[slug]`            | `MarketingPage`, article/meta primitives, question list, CTA card                     |
| `app/contact/page.tsx`                     | `/contact`                     | Public contact holding/form surface using marketing/app/form primitives               |
| `app/privacy/page.tsx`                     | `/privacy`                     | `MarketingPage` + `MarketingProse` legal article                                      |
| `app/terms/page.tsx`                       | `/terms`                       | `MarketingPage` + `MarketingProse` legal article                                      |

`app/docs/page.tsx` is intentionally absent. The production route inventory in
`docs/design/2026-07-08-product-container-audit.md` already reflects that
removal, and public-source guardrails continue to reject removed public docs or
test surfaces returning to the production build.

## Findings

### P0/P1 launch blockers

None found in this provider-free audit.

- GitHub currently reports no open PRs for `meelni/meelni-prep`.
- Public/content pages are classified in the product-container inventory.
- Unsupported `/docs` and public test routes remain absent.
- Public practice CTAs continue to target the canonical interview-launch path,
  not the legacy `/dashboard/new-rep` alias.
- The relaunch feature flag remains off/default-off.

### Accepted composition exceptions

- The landing page still uses section-level landing components from
  `components/sections/*` rather than wrapping every block in
  `MarketingPage` primitives. This is acceptable: the landing page is a
  campaign-style marketing composition, and the canonical pattern doc already
  lists `components/sections/cta.tsx` and `components/sections/pricing.tsx` as
  valid marketing conversion examples.
- `/explore` uses question-bank-specific discovery primitives rather than
  generic marketing cards. This is acceptable because explore is a public
  product-discovery surface, not a prose article.

### Deferred cleanup

- SAV-223 remains intentionally deferred until the August 9 compatibility
  observation window and real post-launch traffic evidence. Do not remove
  `/dashboard/new-rep` or `new_rep_*` aliases before that window and canonical
  analytics verification.
- Future public/content polish can continue opportunistically, but this audit
  found no launch-blocking marketing-surface drift requiring a PR-sized fix.

## Evidence

Commands run on commit `733c6d23dcc2d9221649a4b382977b5bb5fad2cb`:

```bash
find app -path '*/page.tsx' -not -path '*/api/*' -print | sort
```

Result: production route inventory includes public/content, auth, dashboard,
feedback, interview, and compatibility routes; no `app/docs/page.tsx` route is
present.

```bash
fnm exec --using 22.22.0 npm run test:local -- --test-reporter=dot
```

Result: passed, 437 tests.

Relevant covered guardrails include production route inventory, public-source
hygiene, design-system guardrails, launch runbook guardrails, relaunch redirect
contracts, and provider-free catalog/authorization protections.

## Decision

SAV-154 does not need product code changes at this time. Treat it as complete
once this audit lands and Linear records the evidence. Keep future public polish
behind new, route-specific issues rather than leaving a broad “audit everything”
ticket open.
