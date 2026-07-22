# Blog content seam

`lib/blog/posts.ts` owns the raw public blog records and the small selector API
used by routes, metadata, sitemap generation, and tests.

Keep `lib/blog-data.ts` as the compatibility facade while public app imports
still use the legacy path. New blog-specific helpers should live under
`lib/blog/` so content edits, selectors, and future structured-data helpers do
not keep expanding a single root-level module.
