# Explore SEO Truth Contract

Status: active relaunch guidance; supersedes the November 2025 optimization plan

The former document at this path recommended estimated corpus totals, fake FAQ answers, company authorship, render-time freshness, geographic coverage, and traffic/ranking forecasts. Those recommendations are quarantined because they were not supported by visible product data or durable evidence. Do not restore them from Git history.

## Active rules

- Exact question counts may appear only after a successful active-question API response.
- Company is an organizational tag, not question authorship or proof that a prompt appears in a current hiring loop.
- Interview prompts must not have `acceptedAnswer` or `FAQPage` markup unless an answer is visibly published.
- Omit ratings, reviews, freshness, publication dates, coverage, distribution, rankings, traffic forecasts, and provider-training claims unless a durable source supports the exact visible claim.
- Keep Explore schema minimal: page/breadcrumb identity, API-derived list/count, and a minimal description of the visible collection.
- Public copy should describe choosing a PM practice question, answering it out loud, and reviewing feedback after a completed mock interview.
- The first Explore page is request-rendered from the active-only question workflow. A provider failure renders the explicit unavailable state and emits no corpus count or question-list schema; it must never become a build-time cached fallback.
- Search, filters, pagination, authentication handoff, and practice selection remain client interactions after the initial server render.
- Company guides must pass through an explicit `published` selection before lookup, static params, listing, schema, or sitemap exposure.
- Every indexed route must emit a canonical URL plus a resolvable Open Graph/Twitter image on `https://www.meelni.com`.

The durable editorial rules are in [Public Content Evidence Policy](../content/editorial-evidence-policy.md). SAV-207 owns the converged metadata, canonical, sitemap, and schema architecture; SAV-209 must remain compatible with that truth contract until the branch stack converges.

## Verification

Run the local content/SEO tests, workflow tests, compiled public-surface verifier, CI suite, and production build. Inspect emitted JSON-LD from local fixtures or a local build. Ordinary verification must not submit sitemaps, request indexing, query Search Console, or read Preview/Production product data.

Local fixture and inert-provider checks do not prove the deployed corpus. Before launch, isolated Preview evidence must confirm active-only results, the visible count and initial records, schema parity with those records, and the no-invented-count failure state.
