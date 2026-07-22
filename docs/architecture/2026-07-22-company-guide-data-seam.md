# Company guide data seam

Date: 2026-07-22

## Context

`lib/data/companies.ts` had grown into a mixed public API and raw company-guide
record module. The public app only needs a narrow selector surface for company
listing, company detail lookup, sitemap generation, and public-guide projection.

## Change

The raw company-guide records and selectors now live in
`lib/data/company-guides/records.ts`. `lib/data/companies.ts` remains as a
compatibility facade so existing public routes and tests keep the stable import
path while future company-guide-specific helpers can be added under
`lib/data/company-guides/`.

The product-language contract now scans the raw blog and company content owner
files rather than their compatibility facades.

## Boundary

- `lib/data/company-guides/records.ts`: owns the `Company` type, raw guide
  records, publication filtering, and selector helpers.
- `lib/data/companies.ts`: compatibility-only re-export while callers still
  import from the legacy root-level path.
- `lib/data/public-company.ts`: remains the public projection boundary that
  prevents volatile legacy fields from entering public client payloads.

## Rollout notes

This is a provider-free extraction. It does not change published/draft company
filtering, metadata, routes, relaunch flags, billing, or runtime behavior.

Future SAV-219 slices should keep doing one cohesive extraction per PR. Useful
follow-ups include prompt-versioning before prompt relocation and a dashboard
settings view-model/API seam.
