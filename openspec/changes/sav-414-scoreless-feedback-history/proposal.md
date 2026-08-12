# SAV-414 scoreless feedback history

## Why

Completed evidence-limited feedback is a durable review result, but Dashboard
and History currently equate reviewability with a numerical overall score. A
valid scoreless review therefore disappears after the candidate leaves the
feedback page.

## Outcome

Dashboard and History link valid completed evidence-limited reviews with
truthful no-score copy while keeping all numerical progress, focus, trend, and
pattern behavior scored-only.

## Boundaries

- Do not infer reviewability from a null score or completed status alone.
- Do not expose provider/version/content fields in the sessions API.
- Do not label invalid, corrupt, pending, processing, failed, skipped, or
  missing feedback as ready.
- Keep the canonical feedback route as the strict citation/evidence presenter.
- Do not change generation, scoring, providers, Production data, or schemas.
