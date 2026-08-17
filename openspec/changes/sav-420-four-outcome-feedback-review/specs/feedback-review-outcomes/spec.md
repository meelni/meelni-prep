# Feedback review outcomes delta

> Superseded in part by SAV-453. Current customer outcomes are Scorecard,
> Coaching review, and Unable to review. The Partial scorecard requirements
> below apply only as historical record; compatible stored partial rows project
> scorelessly as Coaching review.

## Outcome classification

- The server SHALL classify every supported terminal review as exactly
  Scorecard, Coaching review, or Unable to review.
- The client SHALL NOT infer an outcome or withheld reason from absent scores,
  transcript rows, punctuation, grammar, provider values, or internal codes.
- Equivalent transcript segmentations that produce equivalent derived answer
  blocks SHALL produce the same supported-dimension coverage and outcome.
- Unknown or malformed outcome, reason, supported-dimension, or recovery data
  SHALL fail closed without scores, coaching claims, or citations.

## Numerical presentation

- A Scorecard SHALL show every weighted rubric-dimension score and the
  canonically supported overall score.
- Incomplete weighted coverage SHALL produce Coaching review with no dimension
  or overall score fields.
- Coaching review and Unable to review SHALL NOT show a dimension score,
  overall score, pseudo-score, readiness band, or inferred level.
- User-visible overall precision SHALL be whole-number unless a later accepted
  calibration decision supports a finer precision.

## Coaching presentation

- A Coaching review SHALL explain that numbers were withheld because verified
  rubric coverage did not support reliable scores, not because the candidate
  necessarily performed poorly.
- It SHALL render only validated grounded PM signals and exact candidate
  citations that crossed the canonical read boundary.
- Confidence SHALL describe evidence support for one observation and SHALL NOT
  describe skill, readiness, probability, or progress.
- It SHALL render exactly one server-selected prioritized practice focus.
- It SHALL NOT create or persist focused-practice attempts or helpfulness data.

## Unable presentation and recovery

- Unable to review SHALL distinguish insufficient candidate-answer evidence
  from verified-evidence integrity failure.
- Integrity-failure copy SHALL state that the outcome does not reflect candidate
  performance and SHALL expose server-owned returned-credit or
  credit-recovery-in-progress truth plus a next-interview path.
- Retry actions SHALL remain attached to transient dispatch/generation
  lifecycle states and SHALL NOT be fabricated for immutable terminal evidence.
- Coverage copy SHALL NOT promise a returned credit unless server-owned credit
  evidence proves it.
- Feedback and Dashboard reads SHALL share one strict skipped status/reason/tier
  classifier. Integrity failure SHALL remain independent of candidate coverage:
  its row MAY retain any validated tier, and a null tier MAY be accepted only
  when integrity recovery terminalized before answer validation. Incoherent
  tuples SHALL fail closed.
- The authenticated skipped-feedback response SHALL serialize only the closed
  `unable_to_review` outcome, customer-safe reason family, and customer-safe
  recovery state. Persisted reason/tier/statistics/recommendation fields SHALL
  remain server-side validation evidence.
- Neither path SHALL expose provider, parser, settlement, transcript-integrity,
  or other internal diagnostic codes.

## Dashboard, History, and metrics

- Dashboard and History SHALL use the three customer outcome labels and SHALL
  keep every valid completed review reachable.
- Overall averages, trends, comparisons, and progress claims SHALL include only
  results with a valid overall score.
- Coaching and Unable outcomes SHALL contribute no numerical value or missing
  denominator entry.
- Historical partial rows SHALL NOT contribute numerical values after their
  scoreless Coaching projection; unsupported dimensions SHALL NOT be
  represented as zero or another score.

## Accessibility and responsive behavior

- Every outcome SHALL expose a text label and reason independent of color.
- Unsupported dimension rows SHALL be text, not zero-valued meters.
- Repeated citation actions SHALL have distinguishable accessible names and a
  keyboard path to the cited transcript evidence.
- Mobile and desktop layouts SHALL preserve the outcome-first reading order,
  wrap long content, and avoid horizontal overflow.
- Recovery progress SHALL use polite status semantics; terminal integrity
  failure SHALL use alert semantics without repeated announcements.
