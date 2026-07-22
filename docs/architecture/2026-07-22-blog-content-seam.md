# Blog content seam

Date: 2026-07-22

## Context

`lib/blog-data.ts` had grown into a mixed public API and raw-content module. The
public app only needs a narrow selector surface for blog listing, blog detail
lookup, recent-post lookup, sitemap generation, and structured data.

## Change

The raw blog records and selectors now live in `lib/blog/posts.ts`.
`lib/blog-data.ts` remains as a compatibility facade so existing public routes
and tests keep the stable import path while future blog-specific helpers can be
added under `lib/blog/`.

## Boundary

- `lib/blog/posts.ts`: owns the `BlogPost` type, raw post records, publication
  filtering, and selector helpers.
- `lib/blog-data.ts`: compatibility-only re-export while callers still import
  from the legacy root-level path.

## Rollout notes

This is a provider-free extraction. It does not change published post filtering,
metadata, routes, relaunch flags, billing, or runtime behavior.

Future SAV-219 slices should keep doing one cohesive extraction per PR. Useful
follow-ups include a separate company-guide data seam and a prompt-versioning
slice that tests prompt behavior before any relocation.
