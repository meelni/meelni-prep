# Public Content Credibility Audit — 2026-07-10

## Scope

Reviewed active Explore metadata/schema/copy, all seven company-guide records and pages, and company-specific/high-traffic blog content. The SAV-209 acceptance criteria named Amazon, but the repository has no Amazon company-guide record; Amazon appeared only in unsourced Explore marketing and one company-process blog article.

## Findings and disposition

| Surface                     | Finding                                                                                                                                                                   | Disposition                                                                                                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Explore                     | Hardcoded 2,879/2,879+ totals, “100+ companies,” “updated daily/weekly,” and “real/actual interview” provenance claims were not tied to canonical evidence.               | Removed static totals, fake FAQ answers, company authorship, provenance, render-time freshness, distribution, and temporal/geographic coverage claims. Visible counts remain API-derived. |
| Explore question cards      | `askedAt` was displayed as if it were verified interview recency.                                                                                                         | Removed from presentation pending a provenance contract.                                                                                                                                  |
| Company index/detail        | Seven guides rendered exact duration, round count, subjective difficulty, salary tables, negotiation policy, and detailed process stages without sources or review dates. | Removed volatile company fields from public presentation. Guides now show illustrative questions and an explicit recruiter-verification note.                                             |
| Company schema              | Question tags were represented as proof that a question was actually asked, and practice CTAs were mislabeled as FAQ answers.                                             | Removed the unsupported FAQ schema; visible copy labels prompts as illustrative and company-tagged.                                                                                       |
| Google and Meta             | Exact compensation/process claims existed in canonical data and were publicly rendered.                                                                                   | Quarantined from presentation; no current-source claim remains visible.                                                                                                                   |
| Amazon                      | No canonical company guide exists, despite marketing copy implying coverage.                                                                                              | Removed Amazon/100+ coverage promises. Do not create a guide until evidence and content meet policy.                                                                                      |
| Company-specific blog posts | Three Meta/Instagram articles and one multi-company process article presented unsourced prompts or changing process details as fact.                                      | Unpublished until editorial review; direct routes now resolve through the published collection only.                                                                                      |
| General blog content        | Published posts included unsourced Meta values, hiring outcomes, level mappings, candidate-percentile claims, and real-time/unshipped product behavior.                   | Unpublished the company-specific failure walkthrough. Rewrote the remaining educational posts to durable frameworks and observable completed-session behavior.                            |
| Global structured data      | Dormant global FAQ/software markup retained company provenance, provider-training, interview-duration, adaptation, and aggregate-rating claims.                           | Deleted the unused component in alignment with SAV-207 rather than leaving it available for accidental reuse.                                                                             |

## Quarantined compatibility data

`lib/data/companies.ts` still contains legacy salary/process fields so this credibility slice does not combine a large data-model deletion with public behavior changes. No active company page reads those fields, and the regression contract prevents reintroduction. Remove or migrate the dormant fields in a focused content-data cleanup after the public branch stack converges.

The November 2025 documents at `docs/seo/EXPLORE_PAGE_SEO_OPTIMIZATION.md` and `docs/seo/IMPLEMENTATION_CHECKLIST.md` also contained legacy estimated totals, invented schema properties, and ranking forecasts. Their paths are retained because the Meelni SEO skill routes agents to them, but their contents now explicitly supersede and quarantine the prior guidance.

## Remaining verification

- Merge/converge SAV-207 SEO truth so canonical metadata and structured data use one source. SAV-209 follows its minimal-schema/server-404 contract without importing SAV-207's unrelated stack.
- Crawl the isolated Preview deployment and inspect rendered JSON-LD, no-JavaScript output, direct unpublished-blog routes, Google/Meta company pages, and mobile company cards.
- Re-run the audit before enabling the relaunch flag by default.
