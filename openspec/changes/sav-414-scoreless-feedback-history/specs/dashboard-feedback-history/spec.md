# Dashboard feedback history delta

## Reviewability

- The sessions API SHALL expose only a closed server-owned feedback
  presentation kind for dashboard reviewability.
- Valid completed scored and evidence-limited feedback SHALL link to the
  canonical feedback route from Overview and History.
- Reviewability SHALL use the canonical persisted-content parser and exact
  transcript quote/reference support; forged citations, missing references,
  malformed findings, and malformed practice suggestions SHALL fail closed.
- Evidence-limited feedback SHALL be labeled ready without a numerical score.
- Null-score, incomplete, failed, skipped, missing, malformed, corrupt, or
  incompatible feedback SHALL NOT be labeled or linked as a valid review.

## Numeric isolation

- Only completed feedback with a valid 0–10 overall score SHALL contribute to
  averages, trends, progress bars, focus areas, or weakness patterns.
- A scoreless review link SHALL NOT change scored interview counts or numeric
  analytics evidence.

## Privacy

- Dashboard/history analytics MAY report only whether at least one reviewable
  feedback link exists; they SHALL NOT add identifiers, transcript content,
  findings, or provider fields.
