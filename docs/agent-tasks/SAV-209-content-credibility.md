# SAV-209 Content Credibility

## Intent

- User request: Address launch-readiness inconsistencies across the full product.
- Product/user outcome: Public preparation content makes only supportable, current claims.
- Why now: Stale process, compensation, provenance, and corpus claims undermine trust before relaunch.

## Slice

- Primary slice: Question bank and SEO content credibility.
- Secondary slices: Company guides, Explore metadata/schema, blog publishing.
- Relevant skill(s): `meelni-question-bank-seo`, `meelni-product-strategy`, `meelni-engineering-memory`.

## Linear Tracking

- Project: Meelni Relaunch Readiness.
- Parent slice issue: SAV-169.
- Child deliverable issue: SAV-209.
- Current Linear state: In Review.

## Scope

- In scope: Evidence policy, full company-surface audit, canonical counts, removal/quarantine of volatile public claims, regression checks.
- Out of scope: Inventing sources, adding an Amazon guide, deleting every dormant legacy field, or changing question synchronization.
- Assumptions: Omission is preferable to an unsupported precise claim.

## Product Lens

- Audience: PM candidates using public content to choose and begin practice.
- Activation/retention/monetization/growth lever: Acquisition trust and activation quality.
- Product Compass note: Public content should convert by proving the practice workflow, not by inflating corpus or hiring claims.

## Technical Plan

- Likely app files: Explore and company pages, metadata, and structured data.
- Likely package/workflow files: Public claims and content-contract tests.
- Data or provider dependencies: Canonical active-question API count only; no live provider writes.
- Docs/decisions to update: Editorial evidence policy and dated audit.

## Validation

- Required commands: Content contract, `npm run check:ci`, `npm run build`.
- Optional/manual checks: Preview crawl, JSON-LD inspection, unpublished direct route, mobile/desktop company pages.
- Fixtures or regression tests needed: Static-count/provenance rejection and quarantine-boundary checks.

## Rollout

- Risk level: Medium because indexed content and metadata change.
- Backward compatibility: Existing company URLs remain; unsupported content becomes narrower or unpublished.
- Metrics/events to watch: Explore impressions, company-page conversion, 404s for unpublished posts.
- Follow-up slice: Source or delete quarantined legacy company data after SAV-207 and SAV-234 branch convergence.
