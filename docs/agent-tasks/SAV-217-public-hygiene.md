# SAV-217 Public Hygiene

## Intent

- User request: Remove launch-blocking public test surfaces, copied docs, placeholder contact/repository values, and dead internal links.
- Product/user outcome: A production build exposes only intentional Meelni routes and truthful customer contact paths.
- Why now: Relaunch readiness requires public-surface evidence before the reactivation flag can default on.

## Slice

- Primary slice: Delivery and operations.
- Secondary slices: Public product experience, metadata, and repository quality.
- Relevant skills: `meelni-codebase-architecture`, `meelni-ops-connections`, `meelni-engineering-memory`, `meelni-ui-design-system`, and `meelni-pr-prep`.

## Linear Tracking

- Project: Meelni.
- Parent slice issue: SAV-171.
- Child deliverable issue: SAV-217.
- Current Linear state: In Progress; blocked by SAV-182 for the public contact-identity criterion.

## Scope

- In scope: Delete `/test-*`; remove the untruthful `/docs` page and public docs assets; remove placeholder repository values; add source, build-manifest, static-public, and production-mode HTTP crawl checks; fail Preview indexing closed; bound protected-route indexing with crawl-observable `X-Robots-Tag` headers; publish an evidence-neutral canonical sitemap that excludes unapproved legal drafts; record the contact dependency without changing delivery behavior.
- Out of scope: Provider configuration, contact-provider delivery changes, remote database changes, or enabling the relaunch gate by default.
- Assumptions: The repository's internal engineering documentation remains canonical; a public developer API is not a current product promise. Existing Meelni-domain email fallbacks remain until SAV-182 supplies durable, PII-safe delivery; SAV-217 does not assert that those mailboxes are end-to-end verified.

## Product Lens

- Audience: PM candidates evaluating or using Meelni.
- Lever: Trust and launch conversion.
- Product Compass note: Public surfaces must describe the live PM interview practice product, not inherited developer-platform scaffolding.

## Technical Plan

- App files: Remove test/docs routes and keep the pre-existing direct email fallback visible while contact hardening is unresolved.
- Workflow files: Add reusable public-surface assertions, build-manifest verification, indexing-contract tests, and a bounded production-mode local server crawler; run the crawler in CI.
- Data/provider dependencies: None.
- Docs: Record the launch guard and operating procedure.

## Validation

- Required: `npm run test:local`, `npm run check:ci`, `npm run build`, and `npm run verify:public-production`.
- Manual: Confirm `/docs` and representative `/test-*` paths return 404 from the production server; inspect the final app paths manifest.
- Regression evidence: Fixture tests prove forbidden source routes, copied/static placeholders (including `public/support.html`), forbidden manifest entries, external redirects, unlisted broken links, and unknown protected links fail closed.

## Rollout

- Risk level: Medium; intentionally removes publicly routable but unsupported content.
- Backward compatibility: `/docs` and `/test-*` become 404. No supported customer workflow depends on them.
- Metrics/events: Hosted CI build and crawl status; production 404/error telemetry after deployment.
- Follow-up: SAV-182 must land before the contact-identity acceptance criterion can close. SAV-235 owns approval and indexing readiness for the legal drafts; `/privacy` and `/terms` remain reachable QA pages but stay outside the sitemap until that work explicitly changes their status. A future public API/docs launch requires an explicit product decision, an owned contract, and removal of the `/docs` prohibition in the same reviewed change.
