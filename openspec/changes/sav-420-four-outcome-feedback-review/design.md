# Design

> Historical design. SAV-453 supersedes Partial scorecard and renames Full
> scorecard to Scorecard. The current customer boundary exposes a score only
> when every weighted dimension and the canonical overall are present.

## Outcome boundary

SAV-421 owns the canonical coverage and scoring result. SAV-420 consumes one
closed server-owned presentation outcome instead of reconstructing it in React
or Dashboard code:

| Outcome           | Evidence state                                                                   | Scores                    | Overall                                                     | Primary next action                                                                             |
| ----------------- | -------------------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Full scorecard    | Verified evidence supports every weighted rubric dimension                       | Every dimension           | Allowed, displayed only at supported whole-number precision | Review findings or continue practice                                                            |
| Partial scorecard | Verified evidence supports some, but not all, rubric dimensions                  | Supported dimensions only | Never                                                       | Review supported dimensions and the uncovered evidence needs                                    |
| Coaching review   | Verified evidence supports grounded coaching but no reliable numerical dimension | None                      | Never                                                       | Use one prioritized practice focus                                                              |
| Unable to review  | No grounded review can safely cross the read boundary                            | None                      | Never                                                       | Confirm credit recovery or start another interview according to the server-owned recovery state |

Coverage insufficiency and integrity failure remain different reason families.
The first describes what verified interview evidence covered; the second
describes whether the system could verify the saved evidence. An integrity
failure must not reuse coverage copy.

## Product copy proposal

### Full scorecard

- Outcome label: `Full scorecard`.
- Explanation: `Every PM rubric dimension had enough verified evidence for an
observed practice score. These scores describe this interview, not hiring
readiness.`
- Score heading: `Observed practice scores`.
- Overall: whole-number display only unless a later accepted calibration
  decision supports finer precision.

### Partial scorecard

- Outcome label: `Partial scorecard`.
- Explanation: `Some PM rubric dimensions had enough verified evidence for an
observed practice score. The other dimensions did not receive a score
because this interview did not cover enough evidence for them—not because
the performance was poor.`
- Supported row: `<Dimension> <whole number>/10`.
- Unsupported row: `<Dimension> — Not enough evidence`.
- Overall: omitted, with helper text `An overall score needs supported evidence
across every weighted dimension.`

### Coaching review

- Outcome label: `Coaching review`.
- Explanation: `There was enough verified evidence for useful coaching, but
not enough rubric coverage for reliable numerical scores. This describes
what the recorded interview covered, not a poor-performance judgment.`
- Signal section: `Observed PM signals`.
- Evidence-support label: `Exact cited evidence`.
- Confidence help: `Evidence support describes how closely this observation is
supported by the cited parts of this interview. It is not a skill rating,
probability, or progress measure.`
- Action section: `Prioritized practice focus`. Render exactly one
  server-selected focus and do not call it the weakest dimension.
- Citation label: `Exact excerpt from your interview`, followed by an
  accessible `View in transcript` action.

### Unable to review

Two customer-safe reason families share the outcome without sharing blame:

- Coverage: `We couldn’t create a grounded review because the saved interview
did not contain enough verified candidate-answer evidence. No score or
performance conclusion was created.` The next action is another mock
  interview; no credit promise is invented.
- Integrity: `We couldn’t verify the saved interview evidence, so we did not
create scores or coaching. This does not reflect your performance.` The
  server-owned recovery state adds exactly one truthful status:
  `Your interview credit was returned` or `Credit recovery is in progress`,
  with a path to another interview. Because immutable evidence cannot be
  repaired in place, this terminal outcome does not invent a retry action.
  Retry remains available only for separately modeled transient dispatch or
  generation failures.

Dashboard and History use outcome labels directly: `Full scorecard ready`,
`Partial scorecard ready`, `Coaching review ready`, and `Unable to review`.
They do not show `Evidence-limited`, `no score`, provider names, or internal
codes. A partial row never substitutes one supported dimension for an overall.

## Accessibility plan

- Keep the feedback route in `FeedbackReviewShell`; use one page heading and an
  adjacent text outcome label so state is never color-only.
- Reading order is outcome and reason, scorecard or coaching summary, grounded
  findings, prioritized practice focus, then transcript.
- Render score dimensions as semantic list or description-list rows. Supported
  scores may use a meter with an accessible name and value; unsupported rows
  use text only and never `aria-valuenow=0`.
- Confidence semantics are visible inline, not hidden behind a hover-only
  tooltip. Exact-citation actions include the dimension or observation in the
  accessible name when repeated.
- Recovery status uses `role=status` for progress and `role=alert` only for the
  terminal integrity failure. Actions remain at least 44 CSS pixels, keyboard
  reachable, visibly focused, and ordered after the explanation.
- Mobile layouts stack score rows and actions without horizontal overflow;
  long question, dimension, and citation text wraps. Desktop keeps a compact
  scan path without nested card stacks.
- Existing reduced-motion behavior remains intact; no new motion is needed.

## Data and metrics

The authenticated API returns only the closed presentation outcome, supported
dimension data, customer-safe reason family, and customer-safe recovery state
needed by the view. It does not return internal diagnostics or provider codes.
Unknown values fail closed to Unable to review.

The feedback route and Dashboard reuse one strict classifier for persisted
skipped tuples. Candidate-evidence insufficiency requires its committed
`insufficient` or `abandoned` tier. Integrity failure is independent of
candidate coverage, so its row may retain any validated tier or a null tier
when terminalization preceded answer validation; other unknown or incoherent
tuples fail closed rather than being assigned a fallback reason.

After validation, the feedback route discards the persisted status reason,
completion tier, completion statistics, and legacy recommendation fields. The
skipped customer DTO contains only `unable_to_review`, the safe reason family,
and the safe recovery state. Dashboard consumes the classification locally and
does not expose the persisted tuple through its customer contract.

Overall averages, overall trends, comparisons, and progress claims require a
valid overall score. Coaching and Unable outcomes contribute no numbers.
Partial dimension scores may be counted only by a future dimension-specific
metric that preserves a supported-score denominator; current Dashboard trends
and focus metrics remain full-overall-score-only. Missing dimensions are never
zero-filled.

## Compatibility and coordination

- Historical feedback keeps its explicit historical treatment.
- SAV-418 may consume the same server-selected coaching focus, but this change
  does not create, resume, complete, or store a focused-practice attempt.
- SAV-415 may later attach helpfulness controls and feedback-view events, but
  this change does not store or emit them.
- The implementation is rebased onto exact merged SAV-421 `main` SHA
  `7db50229bf9a9fbeacbc8275071598f34407ccb0` and adopts its public coverage
  result without creating a competing scoring contract.
