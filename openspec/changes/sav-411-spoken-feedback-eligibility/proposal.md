# SAV-411 spoken feedback eligibility

## Why

Natural spoken/STT-shaped PM answers can pass canonical, quantitative, and PM
evidence checks while failing the hand-built scoreable grammar surface. The
same interview can contain a textless inaudible interviewer interruption whose
marker currently degrades the entire writer even though no candidate evidence
was lost. Together these false negatives suppress a safe scoreless evaluator
request.

## Outcome

Canonical long-form recognized candidate evidence may receive partial,
scoreless evidence-limited feedback without qualifying for numerical scores.
Only the exact `interviewer/no_provider_confirmed_prefix` interruption preserves
independently trustworthy candidate evidence; every candidate or
canonicalization marker remains fail-closed.

## Boundaries

- Preserve transcript preparation, replay normalization, injection rejection,
  frozen cutoffs, gaps, settlement degradation, malformed boundaries, and
  provider selection validation.
- Preserve current scored Feedback v2 grammar and evidence-breadth policy.
- Do not repair historical rows, touch Production/provider state, migrate the
  database, deploy LiveKit, or implement SAV-412.
