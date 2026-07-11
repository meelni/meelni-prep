# SAV-207: Public SEO truth residual

## Intent

- User request: finish relaunch-readiness work without restoring unsupported public claims.
- Product/user outcome: crawlers and candidates receive the same verified Explore corpus, route identity, and public-company set.
- Why now: SAV-217 and SAV-236 landed after the original SAV-207 branch and superseded most of its public-surface and JSON-LD work.

## Slice

- Primary slice: question-bank SEO and search-to-practice conversion.
- Secondary slices: public metadata verification and launch evidence.
- Relevant skills: `meelni-question-bank-seo`, `meelni-engineering-memory`.

## Linear tracking

- Project: Meelni.
- Child deliverable: SAV-207.
- Current state: draft implementation; Preview corpus proof remains open.

## Scope

- In scope: request-render the initial active Explore corpus; serialize database dates at the workflow boundary; fail closed without invented counts or schema; select company guides through explicit publication status; give every indexed route a canonical social image; extend compiled verification and regression tests.
- Out of scope: contact/docs/robots cleanup (SAV-217), JSON-LD escaping (SAV-236), provider or Search Console changes, sitemap freshness, feature-flag changes, question provenance migration.
- Assumption: the relaunch feature gate stays default-off.

## Validation

- `npm run test:content`
- `npm run test:workflows`
- `npm run test:local`
- `npm run check:ci`
- `npm run build`
- `npm run verify:public-production`
- Preview must independently prove active-only results, visible count/records, and emitted schema parity.

## Rollout

- Risk: medium; `/explore` changes from client-only initial loading to request-time server loading with client pagination/search retained.
- Backward compatibility: `/api/questions` and public URLs do not change.
- Metrics: Explore availability errors, page views, searches, question selections, and search-to-practice starts.
- Follow-up: complete the isolated Preview corpus gate before merge or launch approval.
