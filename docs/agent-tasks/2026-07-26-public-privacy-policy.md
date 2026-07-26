# Agent Task Intake

## Intent

- User request: Finalize the public Privacy Policy and update the live-site
  source using the product's actual data practices.
- Product/user outcome: Visitors see a clear effective policy and a concise,
  standard cookie/analytics choice instead of an unapproved draft.
- Why now: The live consent banner links to a page that says it is not
  effective.

## Slice

- Primary slice: Public privacy policy and consent-language truth.
- Secondary slices: SEO/indexing, public-surface verification, durable policy
  memory.
- Relevant skill(s): `meelni-engineering-memory`.

## Linear Tracking

- Project: Meelni.
- Parent slice issue: SAV-165.
- Child deliverable issue: SAV-330.
- Current Linear state: In Progress; draft PR preparation underway.

## Scope

- In scope: Privacy content, effective date, contact, cookie/analytics copy,
  metadata, sitemap, public links, tests, and durable docs.
- Out of scope: Final Terms, provider-contract changes, data migrations, or
  Production deployment.
- Assumptions: `contact@meelni.com` is the monitored privacy contact;
  Meelni is the approved public operator name.

## Product Lens

- Audience: Website visitors and Meelni account holders.
- Activation/retention/monetization/growth lever: Trust and compliant-feeling
  signup/analytics consent.
- Product Compass note: Explain privacy choices without exposing implementation
  jargon in the banner.

## Technical Plan

- Likely app files: `/privacy`, signup, pricing, sitemap.
- Likely package/workflow files: Legal content and public-surface contracts.
- Data or provider dependencies: Supabase, LiveKit, Deepgram, OpenAI, Cartesia,
  Stripe, PostHog, Statsig, Inngest, Vercel, and Google authentication.
- Docs/decisions to update: Public legal contract, decision indexes, public
  surface runbook, analytics consent contract.

## Validation

- Required commands: Legal/content tests, typechecks, lint.
- Optional/manual checks: Local browser render of `/privacy` and banner.
- Fixtures or regression tests needed: Metadata, sitemap, policy claims, public
  link labels, cookie copy.

## Rollout

- Risk level: Medium; public legal representations create operational
  commitments.
- Backward compatibility: Analytics consent behavior and policy version remain
  unchanged because the purpose did not change.
- Metrics/events to watch: Privacy page availability and analytics consent API
  failures; do not add analytics to the privacy choice itself.
- Follow-up slice: Confirm a formal legal entity/address if one is adopted, and
  finalize Terms separately.
