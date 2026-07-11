# Public Surface Hygiene

Meelni's production build must not expose internal visual test pages, copied developer documentation, placeholder support identities, or placeholder repository links. The relaunch feature gate remains default-off independently of these checks.

## Forbidden surfaces

- Any `/test-*` or `/test/*` app route.
- `/docs` and `/docs/*` until Meelni intentionally launches and owns a public developer API.
- Any directly served asset outside the explicit public-file allowlist, or an allowed text asset containing inherited placeholder markers.
- Known inherited markers such as `humans@conductor.build`, `github.com/your-repo`, and the old Mockmate domains.

Internal engineering docs remain in `docs/`; they are repository memory, not a public product surface. Until SAV-182 makes contact delivery durable, observable, and PII-safe, `/contact` presents an unavailable noindex state without canonical or social promotion, stays outside the sitemap, and `/api/contact` returns `503` without reading or logging a request body. Legal holding pages do not direct visitors to that unavailable route. The contact-identity and delivery acceptance criteria remain blocked.

## Automated checks

- `npm run verify:public-source` enumerates app pages and every directly served file under `public/`. Only reviewed files in the explicit allowlist are accepted; all other static files fail closed. Source files are scanned for inherited placeholder markers.
- `npm run build` runs Next.js production compilation and then checks `.next/server/app-paths-manifest.json` for forbidden routes.
- `npm run verify:public-production` starts the compiled app on localhost, validates the emitted robots and sitemap documents, and recursively crawls every sitemap URL plus every same-origin, page-like GET link it discovers from the public seeds. Reachable `/contact`, `/privacy`, and `/terms` pages are explicit non-indexable QA seeds outside the sitemap and must emit neither a canonical nor social promotion. Every indexed sitemap route must expose at least one Open Graph or Twitter image. The verifier resolves those canonical-host image URLs through the local artifact and requires HTTP 200 without a final-host escape; it applies the same availability check to extension-bearing same-origin assets. The crawler excludes `/_next`, `/api`, static asset extensions, and protected `/auth`, `/dashboard`, `/feedback`, `/interview`, and `/setup` pages. Every excluded protected link must match a compiled build-manifest route. It verifies `noindex` over HTTP on provider-independent API, auth, feedback, and checkout-result responses; when local public Supabase variables are absent, the verifier supplies inert loopback values so unauthenticated middleware can run without a real project or credential. Dashboard/interview/setup middleware headers are covered by the indexing contract and require configured-provider verification on a deployed target. Redirects are inspected manually; off-origin redirects fail before any off-origin request. The check fails on non-success responses, unknown or forbidden routes, missing metadata assets, non-canonical sitemap entries, invented sitemap freshness, an incomplete robots policy, or the 250-page safety cap.
- Preview and other non-Production Vercel deployments serve both a fail-closed `Disallow: /` robots policy and a global `X-Robots-Tag: noindex, nofollow, noarchive` response header. Production permits crawling and removes the global header while retaining response-level noindex on API, authentication, dashboard, feedback, interview, setup, and checkout-result responses. Do not add Production robots.txt exclusions for those URLs: a crawler blocked by robots.txt cannot observe the response-level noindex rule.
- The sitemap uses only the canonical `https://www.meelni.com` origin and enumerates approved indexable seed pages plus published blog and company-guide routes. It excludes unavailable `/contact` and the unapproved `/privacy` and `/terms` drafts, and omits synthetic `lastModified` values when the repository has no evidence for a modification instant.
- Explore is request-rendered from the active-only public-question workflow. If that read fails, the route stays available with a retryable unavailable state but emits no count or question-list schema. The compiled local verifier intentionally uses inert provider configuration, so this fallback is expected there; only an isolated Preview run can certify deployed corpus count, records, and schema parity.
- `npm run test:local` includes regression fixtures for source, manifest, link extraction, and HTTP crawl failures.

CI runs the Next.js production-mode localhost crawler after the production build. The command reports whether that artifact contains the fail-closed non-Production robots policy or the reviewed crawlable Production policy; it does not silently claim one mode from the other. The crawl proves the compiled artifact, provider-independent protected-route headers, sitemap URL graph, explicit legal-page QA reachability, and local HTTP graph; it is not evidence that a Preview or Production deployment was crawled. A passing source check alone is not launch evidence because Next.js routing is determined by the compiled artifact.

## Intentional public docs launch

Do not work around the guard with a redirect or environment-only exception. A future `/docs` launch should include:

1. An accepted product decision identifying the audience and supported API.
2. A versioned contract generated from or verified against implemented endpoints.
3. Owned domains, contact paths, authentication guidance, limits, and examples.
4. Navigation, metadata, sitemap, and link-crawl coverage.
5. A reviewed update to the forbidden-route policy and this runbook.

## Production verification

After a deployment, check representative removed paths such as `/docs`, `/test-modal`, and `/test-progress-ring`; each must return 404. Then run the crawler against the deployment URL:

```bash
node scripts/verify-public-surface.mjs \
  --manifest .next/server/app-paths-manifest.json \
  --base-url https://www.meelni.com
```

Do not point the crawler at an environment where destructive GET endpoints exist. The crawler follows all same-origin public page links, validates protected app links against the build manifest, and never calls API routes.
