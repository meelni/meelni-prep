# Feedback Review Outcome Presentation

This contract maps trusted persisted feedback and lifecycle evidence to the
customer-facing review experience. It does not replace the immutable transcript
event, derived answer-block, or rubric-dimension coverage contracts.

## Integrity and evaluation sources

- Immutable transcript events remain the integrity and exact-citation source.
- Derived candidate answer blocks are the evaluation and presentation unit.
- Equivalent semantic answers under different event segmentation must produce
  the same coverage, scores, mode, and customer outcome.
- `feedback.dimension-coverage.v1` and additive v2 remain persisted scoring
  authorities. A v2 partial snapshot may authorize a complete Scorecard only
  from an exactly recomputed trusted closed-block projection with zero excluded
  candidate blocks and sufficient coverage for every weighted dimension.
  Presentation code cannot derive coverage or outcome from punctuation,
  grammar, answer length, transcript rows, null scores, or provider fields.

## Closed customer outcomes

| Outcome          | Numerical result                                     | Customer explanation                                                        | Next action                                                                                                                             |
| ---------------- | ---------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Scorecard        | Every weighted dimension and a valid canonical total | Every PM rubric dimension had enough verified evidence                      | Review the observed scorecard and continue practice                                                                                     |
| Coaching review  | No dimension or overall score fields                 | Grounded coaching exists, but complete reliable numerical coverage does not | Use one grounded prioritized practice focus                                                                                             |
| Unable to review | No scores, coaching claim, or performance conclusion | No reviewable candidate answer exists, or saved evidence integrity failed   | Retry the saved review when revalidation proves it recoverable; otherwise start another interview and show settled/pending credit truth |

There is no customer-visible Partial scorecard. A supported historical partial
row remains immutable and is strictly validated under its stored version, then
projects as scoreless Coaching review.

Coverage and integrity are different customer-safe reason families:

- `rubric_coverage` describes what the verified answers covered. It must not
  imply poor performance.
- `verified_evidence_integrity` describes what Meelni could verify about saved
  evidence. It must explicitly say the result does not reflect performance.

Unknown or malformed outcomes, reasons, dimensions, citations, or recovery
states fail closed. They do not cross the authenticated customer read boundary.

A skipped persisted row is validated against its internal status, reason, and
completion tier before presentation, but those fields are not serialized. Its
authenticated response contains only `outcome: unable_to_review`, the
customer-safe `scoreWithheldReason`, and the customer-safe `recovery` state.

## Customer read boundary

The completed-feedback presenter may expose only:

- the customer outcome and customer-safe withheld-reason family;
- all weighted dimension scores plus the canonical overall for Scorecard;
- customer-facing facet labels, exact candidate citations, and opaque
  transcript navigation targets;
- grounded coaching signals, visible evidence-support semantics, and exactly
  one prioritized practice focus;
- for verified-prefix v2 coaching only, the semantic fact that an unfinished
  or unverified terminal tail stayed outside the review; and
- customer-safe review or credit recovery state for terminal integrity
  failures.

It does not expose model, schema, prompt, rubric, facet, answer-block, provider,
parser, settlement, or transcript-integrity codes. A supported historical
scored format appears under the same Scorecard outcome only after its stored
overall is proven equal to the canonical weighted total.

The verified-prefix explanation is visible for coaching with a real excluded
tail: Meelni reviewed only the completed answers it could verify. The excluded
end was not treated as negative evidence. The UI does not claim that exclusion
had no effect on which dimensions were supportable and never exposes block
identities, writer state, provider state, or a diagnostic excluded-block count.
An exact safe marker with zero excluded candidate blocks produces no excluded-
tail claim. It may authorize Scorecard only when normalized writer settlement
is also `settled` and every dimension is sufficient; missing settlement keeps
the same trusted prefix qualitative and scoreless.

## Coaching and citations

- Coaching review shows exact grounded citations only; it never authors or
  repairs candidate evidence in the client.
- `Exact cited evidence` means an observation is tied directly to the shown
  excerpt. It is not a skill rating, readiness estimate, probability, or
  progress measure.
- Exactly one deterministic focus is presented. It is not called or derived
  from a weakest score. SAV-418 persists the validated closed identity and
  exact frozen evidence as one focused-practice v2 attempt while exposing only
  the privacy-safe plan view to the customer.
- Repeated citation controls have distinguishable accessible names and select
  the exact canonical transcript event behind the answer-block citation.

## Recovery

`no_reviewable_answer` offers another mock interview and makes no credit
promise. Most `transcript_integrity_degraded` outcomes remain terminal and
show `credit_returned` only after a settled refund/release, or
`credit_recovery_in_progress` only while settlement is actually outstanding.
A settled retained credit is not described as recovery in progress.

There is one narrow `review_recovery_available` exception for a late
false-negative integrity skip. The authenticated owner read may expose it only
after the immutable frozen evidence revalidates under the current trusted
answer-block authority and contains reviewable trusted blocks. The response is
`retryable: true`; recovery requeues the same saved review and consumes no new
interview credit. It does not promise scores: core must still prove zero
excluded candidate scope and complete weighted coverage before a Scorecard can
result. If revalidation fails, the terminal skip stays closed and the UI offers
no review retry.
Separately modeled transient dispatch and generation failures retain their
existing retry controls.

An expired authenticated session is a reauthentication state, not a generic
feedback failure. A `401` from the feedback GET, authorized recovery POST, or
comparison read redirects through the shared safe auth handoff with the exact
owned feedback or comparison path as both the return and cancel destination.
Successful sign-in therefore resumes the same review instead of dropping the
candidate at Dashboard. The client does not surface the raw unauthorized
response as recovery copy.

Feedback-route and Dashboard reads share one strict skipped-tuple classifier.
`no_reviewable_answer` requires an `insufficient` or `abandoned` completion
tier. Integrity failure remains independent of candidate coverage, so it may
retain any validated completion tier or have no tier when it terminalizes
before answer validation; that exact null remains compatible for
`transcript_integrity_degraded` only. Unknown or incoherent status, reason, and
tier combinations fail closed instead of being coerced into a customer reason.
The persisted tuple remains server-side validation evidence and never becomes
part of the customer response.

## History, Dashboard, and metrics

History and Dashboard use `Scorecard ready`, `Coaching review ready`, or
`Unable to review`. Valid reviews remain reachable; malformed completed rows
remain unavailable and unlinked.

Only a validated Scorecard with a canonical overall enters current averages,
trends, progress bars, comparisons, focus areas, or weakness patterns.
Coaching, unable, pending, failed, malformed, and missing results add no numeric
value and no synthetic zero.

Customer-facing overall scores use whole-number presentation everywhere,
including comparison selectors and side-by-side detail. Comparison overall
deltas are derived from those displayed whole-number values, so the delta
cannot imply precision that the two displayed scores omit. Persisted canonical
score arithmetic remains unchanged.

## Accessibility and privacy

- Outcome and reason are visible text and never depend on color alone.
- Coaching has no dimension-score rows or zero-valued meters.
- Reading order is outcome, reason, scorecard or coaching evidence, one focus,
  then transcript.
- Recovery progress is polite status; terminal integrity failure is an alert.
- Actions are keyboard reachable, visibly focused, and at least 44 CSS pixels.
- Synthetic fixtures are the only transcript-like examples permitted in code,
  tests, documentation, PRs, and issue tracking.
