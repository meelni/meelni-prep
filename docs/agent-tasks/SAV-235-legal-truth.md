# SAV-235: Legal Page Product Truth

## Intent

- User request: Replace unsupported Terms and Privacy claims with a conservative draft grounded in implemented Meelni behavior.
- Product/user outcome: Accountable owners can review an accurate product/data baseline without stale billing, recording, retention, provider, or legal guarantees being presented as approved policy.
- Why now: The relaunch audit found that the existing legal pages contradict the accepted credit catalog and current privacy/data flows.

## Slice

- Primary slice: Public legal-content truth and launch safety.
- Secondary slices: Billing, account privacy, auth, analytics, SEO indexing, and engineering memory.
- Relevant skills: `meelni-question-bank-seo`, `meelni-linear-workstream`, `meelni-engineering-memory`, `meelni-ui-design-system`, `meelni-pr-prep`.

## Linear Tracking

- Project: Meelni.
- Child deliverable issue: SAV-235.
- Current Linear state: Unknown; connector requires OAuth and no write is claimed.

## Scope

- In scope: Audit factual claims, rewrite `/terms` and `/privacy`, explicitly noindex both pages, keep them absent from the sitemap, document open owner/legal decisions, and add regression contracts.
- Out of scope: Legal advice, approving a legal policy, changing analytics consent behavior, changing provider terms, selecting jurisdiction, or enabling the relaunch gate.
- Assumptions: Repository contracts and implemented behavior are engineering truth; legal applicability and final policy language require accountable owner/legal approval.

## Product Lens

- Audience: PM candidates considering or using live PM interview practice.
- Lever: Trust and launch quality.
- Product Compass note: Use live PM interview practice language, avoid fitness framing, make no outcome guarantee, and keep the relaunch fallback default-off.

## Technical Plan

- Likely app files: `app/privacy/page.tsx`, `app/terms/page.tsx`, `app/sitemap.ts` tests.
- Likely package/workflow files: Canonical billing presentation and account-privacy contracts remain sources, not duplicated policy.
- Data/provider dependencies: Supabase/Auth, LiveKit voice processing, transcript persistence, Stripe/credit ledger, PostHog, Statsig, Vercel, Inngest, and model/speech providers.
- Docs to update: Add a public legal-draft review contract and index it.

## Validation

- Required commands: Targeted legal/content tests, product-language tests, typecheck, lint, `npm run check:ci`, and production build.
- Optional/manual checks: Inspect built `/terms`, `/privacy`, and `/sitemap.xml` metadata/source.
- Regression fixtures: Unsupported legacy claim denylist, canonical credit facts, explicit noindex metadata, and sitemap exclusion.
- Completed: `npm run check:ci` and `npm run build` passed on Node 22. The production server emitted `noindex, nofollow`, no canonical link, explicit draft status, and no Terms/Privacy sitemap entries.
- Visual limitation: The in-app browser was unavailable in this task, so desktop/mobile screenshot verification remains an explicit PR review step rather than a claimed result.

## Rollout

- Risk level: High trust/compliance impact; code behavior risk is low.
- Backward compatibility: Routes remain available but explicitly unindexed; no provider or database mutation.
- Metrics/events to watch: None until accountable approval; legal-page analytics are not an approval signal.
- Follow-up slice: Owner/legal review must define entity/contact, jurisdiction, rights/bases, age policy, subprocessors, retention, cookies/consent, refund/cancellation, and effective dates before indexing.
