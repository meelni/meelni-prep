# Company guide data seam

`lib/data/company-guides/records.ts` owns the raw company-guide records,
publication filtering, and selector helpers used by public company pages,
sitemap generation, and tests.

Keep `lib/data/companies.ts` as the compatibility facade while public app
imports still use the legacy path. New company-guide data helpers should live
under `lib/data/company-guides/` so content edits and selectors do not keep
expanding a single root-level module.
