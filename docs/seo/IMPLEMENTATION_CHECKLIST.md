# Public SEO Verification Checklist

Status: active relaunch checklist; supersedes the November 2025 growth checklist

The previous checklist contained unsupported corpus estimates, keyword volumes, ranking and traffic forecasts, fake FAQ guidance, and “real question asked at company” templates. It is quarantined and must not be used as implementation guidance.

## Claims and schema

- [ ] Exact corpus totals come from a successful active-question API response.
- [ ] Company tags are not represented as authorship or current interview provenance.
- [ ] Structured data contains no invented answers, ratings, reviews, dates, freshness, geographic/temporal coverage, downloadable distribution, or provider-training claims.
- [ ] Blog listing, schema, static params, metadata, and direct lookup all use the same published collection.
- [ ] Published articles contain durable educational guidance or evidence-backed claims with an as-of date.
- [ ] Company guides show only local illustrative questions/counts and explicitly direct candidates to confirm current process details with their recruiter.
- [ ] The initial Explore response contains active-only questions and its exact verified count in HTML before hydration.
- [ ] Explore provider failure emits neither a corpus total nor question-list schema and remains retryable on the client.
- [ ] Listing, lookup, schema, static params, and sitemap use only explicitly published company records.
- [ ] Every sitemap HTML route emits a canonical-host Open Graph or Twitter image that resolves successfully.

## Local verification

- [ ] Run `npm run test:content`.
- [ ] Run `npm run test:local` when design guardrails change.
- [ ] Run `npm run typecheck` and `npm run lint`.
- [ ] Run `npm run check:ci` and `npm run build` before handoff.
- [ ] Run `npm run verify:public-production` against the compiled local artifact.
- [ ] Inspect local rendered JSON-LD and unknown/unpublished 404 behavior without calling live providers.
- [ ] Record isolated Preview corpus evidence separately; local fixtures do not certify deployed data.

See [Public Content Evidence Policy](../content/editorial-evidence-policy.md) for source requirements. SAV-207 remains the owner of the eventual centralized public metadata/schema implementation.
