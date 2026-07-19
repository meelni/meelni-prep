# Public Reactivation Conversion

## Intent

- User request: Make public conversion behavior truthful and deterministic while the relaunched experience remains gated.
- Product/user outcome: Candidates can browse useful PM interview content while paused, but cannot accidentally enter signup, checkout, demo, or setup flows.
- Why now: Relaunch readiness requires acquisition pages and activation state to tell the same story before launch.

## Slice

- Primary slice: Question bank and SEO conversion.
- Secondary slices: Public marketing UI, pricing activation, feature-flag contract.
- Relevant skills: `meelni-product-strategy`, `meelni-ui-design-system`, `meelni-question-bank-seo`, `meelni-vertical-slice-playbooks`, `meelni-engineering-memory`, `meelni-linear-workstream`, and `meelni-pr-prep`.

## Linear Tracking

- Project: Meelni.
- Parent gate issue: SAV-175.
- Child deliverable issue: SAV-271.
- Current Linear state: In Progress while review and Preview evidence remain.

## Scope

- In scope: Shared global public activation decision, inert paused actions, enabled selected-question context, Login and Dashboard access while paused, component/route/contract tests, durable behavior documentation.
- Out of scope: Checkout-success behavior owned by SAV-272, gate/default changes, provider state, Production, migrations, authentication-provider policy, billing catalog, or launch decision. Public signup controls remain in scope because they are acquisition actions.
- Accepted boundary: Google remains available for existing-account access. Supabase OAuth may create a dormant identity for a first-time user before the app can distinguish it; this does not bypass server-side practice, demo, session, or purchase gates. Provider-level abuse hardening is tracked in SAV-274.
- Assumptions: Root layout bootstrap remains the authoritative public gate value.

## Product Lens

- Audience: PM candidates discovering Meelni through questions, company guides, blog content, or pricing.
- Lever: Acquisition-to-activation trust.
- Product Compass note: Keep content discoverable; gate only actions the paused service cannot fulfill.

## Technical Plan

- App files: Explore, company, blog, pricing, authentication entry, and public navigation surfaces. The finalized SAV-272 checkout-result flow remains exact `main`.
- Workflow files: Provider-independent public activation and question-entry decisions.
- Data or provider dependencies: None.
- Docs: Public reactivation conversion contract and contract index.

## Validation

- Required: Targeted activation, content, feature-flag, product-language, type, lint, and build checks.
- Optional/manual: Browser-check Explore/company/blog at mobile and desktop with the local gate off and on.
- Fixtures: Synthetic question only; no customer or Production data.

## Rollout

- Risk level: Low to medium; public CTA behavior changes while paused.
- Backward compatibility: Enabled destinations and selected-question query context are preserved.
- Metrics/events to watch: Explore question activation, signup handoff, checkout creation, demo token creation.
- Follow-up slice: The finalized SAV-272 checkout-result commit is reconciled. Record PR and review evidence in SAV-271; exact Preview verification remains separate.
