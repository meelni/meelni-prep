# Feedback Review Outcome Presentation

This contract maps trusted persisted feedback and lifecycle evidence to the
customer-facing review experience. It does not replace the immutable transcript
event, derived answer-block, or rubric-dimension coverage contracts.

## Integrity and evaluation sources

- Immutable transcript events remain the integrity and exact-citation source.
- Derived candidate answer blocks are the evaluation and presentation unit.
- Equivalent semantic answers under different event segmentation must produce
  the same coverage, scores, mode, and customer outcome.
- `feedback.dimension-coverage.v1` remains the scoring authority. Presentation
  code cannot derive coverage from punctuation, grammar, answer length,
  transcript rows, null scores, or provider fields.

## Closed customer outcomes

| Outcome           | Numerical result                                     | Customer explanation                                                                                       | Next action                                                                            |
| ----------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Full scorecard    | Every supported dimension and a valid overall        | Every PM rubric dimension had enough verified evidence                                                     | Review the observed scorecard and continue practice                                    |
| Partial scorecard | Supported dimensions only; never an overall          | Some rubric dimensions lacked enough verified coverage                                                     | Review supported scores and the dimensions labeled `Not enough evidence`               |
| Coaching review   | No dimension or overall scores                       | Grounded coaching exists, but reliable numerical coverage or complete verified-evidence integrity does not | Use one grounded prioritized practice focus                                            |
| Unable to review  | No scores, coaching claim, or performance conclusion | No reviewable candidate answer exists, or saved evidence integrity failed                                  | Start another interview and, for integrity failure, show returned/pending credit truth |

Coverage and integrity are different customer-safe reason families:

- `rubric_coverage` describes what the verified answers covered. It must not
  imply poor performance.
- `verified_evidence_integrity` describes what Meelni could verify about saved
  evidence. It must explicitly say the result does not reflect performance.

Unknown or malformed outcomes, reasons, dimensions, citations, or recovery
states fail closed. They do not cross the authenticated customer read boundary.

## Customer read boundary

The completed-feedback presenter may expose only:

- the customer outcome and customer-safe withheld-reason family;
- supported dimension scores and server-derived coverage labels;
- customer-facing facet labels, exact candidate citations, and opaque
  transcript navigation targets;
- grounded coaching signals, visible evidence-support semantics, and exactly
  one prioritized practice focus; and
- customer-safe credit recovery state for terminal integrity failures.

It does not expose model, schema, prompt, rubric, facet, answer-block, provider,
parser, settlement, or transcript-integrity codes. Historical supported review
formats retain their explicit compatibility treatment.

## Coaching and citations

- Coaching review shows exact grounded citations only; it never authors or
  repairs candidate evidence in the client.
- `Exact cited evidence` means an observation is tied directly to the shown
  excerpt. It is not a skill rating, readiness estimate, probability, or
  progress measure.
- Exactly one deterministic focus is presented. It is not called a weakest
  score or persisted as focused practice; SAV-418 owns that persistence.
- Repeated citation controls have distinguishable accessible names and select
  the exact canonical transcript event behind the answer-block citation.

## Recovery

`no_reviewable_answer` offers another mock interview and makes no credit
promise. `transcript_integrity_degraded` shows either `credit_returned` or
`credit_recovery_in_progress`, derived from first-party settlement evidence,
and offers another interview. An immutable terminal evidence failure does not
invent a retry action. Separately modeled transient dispatch and generation
failures retain their existing retry controls.

Feedback-route and Dashboard reads share one strict skipped-tuple classifier.
`no_reviewable_answer` requires an `insufficient` or `abandoned` completion
tier. Integrity recovery may legitimately have no completion tier when it
terminalizes before answer validation; that exact null remains compatible for
`transcript_integrity_degraded` only. Unknown or incoherent status, reason, and
tier combinations fail closed instead of being coerced into a customer reason.

## History, Dashboard, and metrics

History and Dashboard use `Full scorecard ready`, `Partial scorecard ready`,
`Coaching review ready`, or `Unable to review` for these outcomes. Valid reviews
remain reachable; malformed completed rows remain unavailable and unlinked.

Only a completed review with a valid overall score enters current averages,
trends, progress bars, comparisons, focus areas, or weakness patterns. Partial,
coaching, unable, pending, failed, malformed, and missing results add no numeric
value and no synthetic zero. A future dimension-specific metric may consume a
supported partial dimension only if it preserves a supported-score denominator.

## Accessibility and privacy

- Outcome and reason are visible text and never depend on color alone.
- Unsupported dimensions are text rows, not zero-valued meters.
- Reading order is outcome, reason, scorecard or coaching evidence, one focus,
  then transcript.
- Recovery progress is polite status; terminal integrity failure is an alert.
- Actions are keyboard reachable, visibly focused, and at least 44 CSS pixels.
- Synthetic fixtures are the only transcript-like examples permitted in code,
  tests, documentation, PRs, and issue tracking.
