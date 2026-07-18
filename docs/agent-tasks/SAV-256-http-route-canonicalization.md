# SAV-256 HTTP Route Canonicalization

## Intent

- User outcome: Bookmarked legacy launch URLs enter the canonical New Mock
  Interview flow without exposing obsolete product vocabulary or losing
  selected-question context.
- Business outcome: Crawlers, no-JavaScript clients, and authenticated users
  observe one canonical launch route.

## Scope

- Add pre-middleware Next redirects from `/setup` and
  `/dashboard/new-rep` to `/dashboard/new-interview`.
- Preserve every query key/value and the order of repeated values. Equivalent
  URL encoding and ordering between different keys may normalize.
- Replace hydration-based page redirects with server-only fallbacks.
- Keep canonical launcher behavior and the approved analytics compatibility
  window unchanged.
- Make no provider, database, Production, or relaunch-gate change.

## Validation

- Navigation behavior tests cover repeated query parameters.
- Public-surface tests cover the permanent redirect contract.
- The compiled production verifier starts the exact build and checks both
  aliases over HTTP with redirect following disabled.
- Product-language, design-system, public-indexing, typecheck, lint, and build
  checks must pass before review.

## Evidence

- `lib/navigation/interview-launch.test.ts`: pass, including repeated server
  page parameters and selected-question context.
- `scripts/public-surface.test.mjs`: pass, including the 308 redirect contract.
- `scripts/product-language-contract.test.mjs`: pass; the retired route stays
  bounded to its compatibility surface.
- `scripts/design-system-guardrails.test.mjs`: pass; both aliases retain
  server-only fallbacks and the client redirect component is absent.
- `npm run typecheck`, `npm run typecheck:tests`, targeted ESLint,
  `npm run test:content`, and `npm run test:product-language`: pass.
- `npm run build`: pass with 65 pages and 78 routes.
- `npm run verify:public-production`: pass against the exact compiled build.
  Both aliases returned HTTP 308 and preserved every key/value plus repeated
  value order across an interleaved query containing spaces, encoded reserved
  characters, empty values, and a flag parameter.
- `npm run check:ci`: pass end to end. Lint reported four pre-existing unused
  variable warnings outside this slice and no errors.

## Rollout

- The redirects are compatible with existing bookmarks and selected-question
  handoff, so they can merge while the relaunch gate remains off.
- Keep the aliases through the existing post-relaunch observation window.
- Roll back by reverting the SAV-256 commit; there is no migration or provider
  state to undo.
