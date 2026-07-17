# Feedback v2 Contract

Status: additive v2 write contract; legacy v1 read compatibility retained

## Purpose

Feedback v2 makes each PM-interview finding traceable to durable transcript
evidence. `packages/core/src/feedback-v2.ts` owns the types, exact object shape,
canonical score calculation, and strict parser. Provider adapters receive
unknown JSON and may persist it only after this parser accepts it.

Rejected writes use the closed `feedback-v2-rejection.v1` taxonomy exported by
`@meelni/core`. A `FeedbackV2ParseError` contains one allowlisted invariant code
and a local developer message. Provider adapters may propagate only the code;
they must not retain or log the rejected response, evidence text, transcript
text, unknown field names, object paths, or the parser error as a cause.

## Rejection taxonomy

The closed codes identify only the failed invariant:

- envelope and identity: `response_not_object`, `response_unknown_field`,
  `schema_version_mismatch`, `prompt_version_mismatch`,
  `rubric_version_mismatch`, `evaluation_state_mismatch`, and
  `model_version_invalid`;
- canonical input: `canonical_transcript_empty`,
  `canonical_transcript_turn_invalid`, and
  `canonical_transcript_duplicate_event_id`;
- scores and finding shape: `scores_not_object`, `scores_unknown_field`,
  `score_invalid`, `exceptional_score_insufficient_evidence`,
  `findings_count_invalid`, `finding_not_object`, `finding_unknown_field`,
  `finding_dimension_invalid`, `finding_rubric_version_mismatch`,
  `finding_text_invalid`, `transcript_refs_invalid`,
  `transcript_refs_duplicate`, and `confidence_invalid`;
- evidence identity and ownership: `evidence_count_invalid`,
  `evidence_not_object`, `evidence_unknown_field`,
  `evidence_turn_ref_invalid`, `evidence_turn_ref_duplicate`,
  `evidence_turn_ref_not_found`, `evidence_turn_ref_wrong_speaker`,
  `evidence_quote_invalid`, `evidence_quote_not_grounded`,
  `evidence_quote_insufficient`, `evidence_reference_set_mismatch`,
  `evidence_reused_across_findings`, and
  `evidence_overlaps_across_findings`;
- finding grounding: `finding_exact_citation_unsupported`,
  `finding_quantitative_claim_unsupported`,
  `finding_absolute_claim_unsupported`,
  `finding_negative_claim_contradicted`,
  `finding_material_claim_unsupported`,
  `finding_observable_claim_missing`,
  `finding_observable_evidence_insufficient`,
  and `finding_high_confidence_insufficient_evidence`;
- terminal customer copy: `drills_invalid`,
  `practice_recommendation_normalization_failed`, `summary_invalid`,
  `summary_outcome_claim_disallowed`, `summary_absolute_claim_unsupported`,
  `summary_quantitative_claim_unsupported`,
  `summary_material_claim_unsupported`,
  `summary_observable_support_insufficient`;
- fail-closed fallback: `parser_internal_failure`.

Unknown, absent, forged, mutable, or proxied diagnostic values normalize to
`parser_internal_failure` at the report boundary. The fallback means parsing
failed without a trustworthy invariant classification; it never permits output
repair or acceptance. The provider adapter authenticates the code with a
module-private error association and exposes a non-configurable, non-enumerable
accessor. Constructing or mutating an exported provider error cannot mint a
trusted classification.

Directional metric anchors are material claim anchors, so unsupported
directional findings and summaries use the corresponding
`*_material_claim_unsupported` code. A separate directional code would be
unreachable after the material-claim check. Likewise, exact evidence is first
normalized to a canonical transcript turn, so observable evidence support also
proves source support; there is no separate source-only rejection code.

## Versions and evaluation state

Every v2 result stores:

| Field             | Value or rule                                               |
| ----------------- | ----------------------------------------------------------- |
| `schemaVersion`   | `feedback.v2`                                               |
| `promptVersion`   | `feedback.prompt.v2`                                        |
| `modelVersion`    | Non-empty configured provider model identifier              |
| `rubricVersion`   | `pm-feedback-rubric.v2`                                     |
| `evaluationState` | `full` or `partial`, matching committed completion evidence |

`partial` means conclusions are limited to the recorded portion. It is not a
prediction of interview readiness. `insufficient` and `abandoned` sessions are
skipped and receive no v2 result.

## Finding shape

Each strength and improvement contains exactly these fields:

```json
{
  "dimension": "insight",
  "observation": "The answer chose a specific user segment.",
  "transcriptRefs": ["writer-id:event-id"],
  "evidence": [
    {
      "turnRef": "writer-id:event-id",
      "quote": "working parents"
    }
  ],
  "nextStep": "Carry that segment through prioritization.",
  "rubricVersion": "pm-feedback-rubric.v2",
  "confidence": 0.9
}
```

- `dimension` is one of structure, clarity, insight, communication, or
  leadership.
- `transcriptRefs` contains unique canonical transcript `eventId` values. A
  database row UUID is not a feedback evidence identity.
- Every reference has exactly one evidence entry and vice versa.
- `quote` resolves to a non-empty, case-sensitive substring of the referenced
  durable candidate turn. Harmless Unicode punctuation and whitespace
  differences
  may be normalized, but the persisted value is always sliced byte-for-byte
  from the canonical transcript. The parser rejects paraphrases, altered
  capitalization, interviewer speech, unknown references, and exact spans that
  contain only pronouns, auxiliaries, bare numbers, or other non-substantive
  fragments. A concise PM-domain word, a recognized PM/technical acronym, a
  meaningful short non-Latin word, or a quantified anchor with a recognized
  unit can remain valid evidence.
- The same `(turnRef, quote)` evidence identity cannot be repeated across
  findings. A turn can support separate findings only with distinct exact
  evidence spans.
- `confidence` is a finite number from zero through one. It is a finding-level
  evidence signal, not a readiness probability. Confidence above `0.9`
  requires at least six quoted lexical units and 24 quoted letters for that
  finding. Compact Han/Kana evidence is counted by grapheme pairs so the
  threshold does not assume whitespace-delimited English.
- An exact quote is necessary but not sufficient grounding. Each
  spaced-language observation, including a negative or absence finding, must
  have at least two independent observable
  lexical stems, quantitative anchors, or bounded PM concepts in both its exact
  evidence quotes and cited candidate turns, with each concept group counted
  only once. A nearby unrelated phrase therefore cannot ground a claim that
  appears elsewhere in the turn. Bounded literal-citation statements and
  predominantly compact-script anchors retain narrower exact-evidence paths. A
  claimed literal citation—including bounded `states`, `said`, `quoted`, and
  `according to` forms—must occur in one individual evidence quote; joining
  fragments from different turns cannot manufacture something the candidate
  never said. Multiple asserted literal phrases are checked independently. A
  single compact token inside an English observation does not activate the
  compact path.
  Material safety, legal, privacy, biometric, security, compliance, and explicit
  business-outcome anchors such as growth, demand, profitability, delight, or
  product-market fit must occur in the exact evidence itself, including when
  they appear inside hyphenated compounds. Positive and negative material
  polarity remain distinct across every material family, including `safe`,
  `not safe`, `without safeguards`, `secure`, `non-secure`, `nonsecure`,
  `unsecured`, and `unencrypted`. Negative contradictions are checked against
  target-bearing source clauses, including coordinated predicates and straight-
  or curly-apostrophe contractions such as `isn't`, `aren't`, `don't`,
  `doesn't`, `wasn't`, `weren't`, and `can't`, so contracted negative evidence
  cannot ground a positive material claim and unrelated negative language cannot
  hide a directly stated positive behavior. Straight- and curly-apostrophe
  double negations are canonicalized before polarity comparison across every
  material family—for example `isn't unregulated`, `isn't non-private`,
  `isn't non-biometric`, and `isn't without consent`, growth, profitability,
  delight, or product-market fit—so valid positive equivalence is not rejected
  as contradictory evidence. A bounded adverse noun following a material
  phrase—such as `security flaws`, `privacy risks`, or `compliance gaps`—keeps
  the phrase adverse instead of being canonicalized as a positive double
  negation. Positive material actions remain distinct. A `security plan` that
  is `addressing risks` is positive. Actions that secure customer records or
  protect, safeguard, or preserve privacy are checked against their own explicit
  negation. Directional anchors such as increased/decreased,
  strong/declining, and defined/undefined must agree bidirectionally across
  observations, exact evidence, and summaries. A direction and its target must
  coexist within one individual evidence quote and its referenced source turn;
  separate turns cannot synthesize directional support. Within one clause, each
  direction binds to its nearest local metric and expands only across an
  explicitly coordinated metric group, so opposite metrics cannot cross-bind.
  Definition polarity recognizes straight- and curly-apostrophe contractions,
  bounded adverbs and failed-action forms. Negative examples include did not
  define, does not clearly define, never defined, and failed to define. A bare
  completed definition is positive, and `not undefined` is positive. Future,
  intended, expected,
  object-infinitive, modal-perfect, and other non-completed assertions—such as
  `will define`, `will have defined`, `going to define`, `expect to define`, and
  `asked the team to define`—cannot ground a claim that definition was already
  completed. Rhetorical `not only ... but also ...` coordination does not invert
  an otherwise positive predicate.
  Definition polarity remains local to its metric target. The same local
  assertion rule prevents explicitly negated or failed directional actions,
  such as `did not increase retention` or `failed to increase retention`, from
  grounding an affirmative increase.
  Predicate and clause locality applies equally to canonical metric aliases and
  generic metrics; a later sample-size predicate cannot make an earlier
  retention mention increased, decreased, or strong. Canonical metric families
  retain stable aliases, while bounded generic
  observable targets such as latency, engagement, NPS, error rate, and cost are
  extracted without requiring a fixed metric allowlist; non-metric directional
  language does not create a metric anchor.
  Every numeric, compound number-word, multiplier (including numeric, `-fold`,
  and lexical forms such as `doubled`, `tripled`, `quadrupled`, `halved`, or
  `twice`), statistical, or absolute claim in an observation must also occur
  with its claimed unit or target in that finding's exact evidence. Ordinary
  digit and number-word quantities additionally bind to the nearest local
  metric target on either side, including bounded generic metrics such as
  latency, NPS, error rate, and cost. Bounded modifiers between a metric and its
  quantity remain part of that local target span, while a count cannot borrow a
  metric from a later `for`, `in`, or `at` analysis phrase. A quantity expands to adjacent targets
  only through an explicit coordinated target group; another quantity, clause
  boundary, or intervening predicate prevents cross-binding. When one quantity
  has both a local target and unit, the value, target, and unit are also bound
  as one composite, so repeated values on different metrics cannot recombine
  into a fabricated claim such as `activation at 40 seconds` from checkout
  duration at 40 seconds and activation at 40 percent. Ordinary counts bind
  the quantity and unit to their local count predicate, including bounded
  ordinary past and progressive count verbs, so `retained 40 users` cannot
  ground `interviewed 40 users` and `called 40 customers` cannot ground
  `emailed 40 customers`. Measurement units such as seconds and percentages
  do not acquire a generic count predicate. Common pre-number count phrases
  such as `a total of`, `at least`, and `at most` do not break predicate
  binding. Count assertion mode is part of the anchor: an explicit negation,
  failed action, future or intended action, expectation, object-infinitive, or
  hypothetical/modal plan cannot ground a claim that the count action was
  completed. Completed irregular count predicates such as `met` and `had`
  remain distinct from `interviewed`, `called`, and `emailed`. A bounded
  modifier between the value and count
  noun may be abstracted to the noun head, so `40 prospective customers` can
  support `40 customers` without allowing a different action, value, or unit
  to cross-bind. Counts therefore do not borrow a metric from a later
  predicate, and the same value and unit on a different metric cannot ground
  the claim. A
  negative finding is rejected when its cited turn directly states the targeted
  positive behavior without negative language, including a coordinated
  positive predicate with an indirect object.
  These checks are deterministic evidence guardrails, not proof of arbitrary
  semantic entailment; subtle paraphrastic hallucination remains a calibration
  and review concern.
- Unknown fields at the result, score, finding, or evidence level are rejected.
- `drills` retains the legacy storage key but contains one to three focused
  practice recommendations. Product-language normalization fails closed when it
  would remove every recommendation; completed v2 feedback is never persisted
  with an empty practice action.

## Scores

Dimension scores are integers from zero through ten. The model does not return
an overall score. Core calculates it from the single canonical PM weighting in
`packages/core/src/evaluation.ts`:

- structure: 25%
- clarity: 20%
- insight: 25%
- communication: 15%
- leadership: 15%

An exceptional dimension profile whose canonically weighted overall score is
at least 9.0 is accepted only when the findings collectively cite at least
three distinct candidate turns and 18 quoted lexical units. This is a minimum
precision boundary, not a claim that broad evidence necessarily deserves an
exceptional score. Every individual dimension scored 9 or 10 must also have a
same-dimension grounded strength, even when the weighted overall remains below
9.0. A negative, unresolved, or absence observation—including bounded
morphology such as an `undefined`, `undecided`, `unmeasured`, `unvalidated`,
`unknown`, `pending`, or `to be determined` threshold—placed in the `strengths`
array does not satisfy that gate. Explicit minimizers such as `barely`,
`hardly`, and `scarcely` are adverse for this purpose. Negative directional or
material claims such as decreased retention, declining demand, or weak growth
are excluded by the same classifier. Bounded `devoid of` absence phrases for
analysis, singular or plural criteria, decision thresholds, details, evidence,
explanations, frameworks, metrics, reasoning, specifics, structure, or success
thresholds are also adverse; ordinary positive phrases such as `devoid of
jargon` are not.

## Summary boundary

The summary is evidence-limited and cannot make hiring, offer, readiness,
pass/fail, hiring-bar, or candidate-advancement claims, including candidate,
interviewee, or applicant statements that they warrant, merit, or deserve a
role, job, or position; belong, fit, or are suitable on a team or for a role; or
were selected or chosen for a role, job, position, or team. Direct actor-first,
selector-first, fragment, pronoun, intervening-predicate, reported/apparent/
confirmed, and nominalized selection forms are covered, including negated forms
and inverse `selection` or `choice` statements that ultimately went or fell to
the candidate. Natural outcome paraphrases such as the candidate `got` a job,
was `picked for` a role, `landed an offer`, `landed` or `secured` a PM role,
`accepted` a PM offer, or a job `ended up with` the candidate are covered as
well. Ordinary product, segment, experiment, and team-selection descriptions
remain allowed, as do non-hiring offer descriptions such as a discounted
pricing offer and non-hiring uses such as securing a cross-functional team.
Because summaries do not carry their own evidence links, every factual summary
needs at least two
observable supports from already grounded findings and at least half of each
factual statement's non-meta claim anchors must be supported. A grounded
statement cannot subsidize a separate unsupported statement across periods,
Unicode sentence punctuation, semicolons, or hard line boundaries, even when
the next statement has no intervening whitespace or a period is adjacent to a
digit; only a period between two digits remains part of a decimal. Factual
summaries draw support only from grounded observations and exact evidence, not
from an ungrounded `nextStep`; explicitly modal coaching statements may use the
grounded coaching path. Quantitative and material claims must also occur in
those findings' exact evidence. Default-ignorable characters are deleted for
outcome-policy scanning without changing the returned summary. The parser rejects
evaluative
absolutes such as `flawless`, `perfect`, `no weaknesses`, and `only strengths`.
Bounded descriptions of observed behavior, provenance-only summaries, and
bounded absence language such as a missing decision threshold remain valid.

## Persistence and compatibility

The existing feedback columns remain in place. V2 stores structured findings
in the existing JSONB arrays and adds nullable schema, prompt, model, and
evaluation-state columns. The database enforces either a completely absent v2
version tuple for a legacy row or a complete, internally consistent v2 tuple.
Historical string-array v1 rows keep `rubric_version=1.0.0` and remain readable.
New completed writes use v2 only.

The asynchronous worker uses the durable Inngest step IDs
`fetch-transcript-v3`, `evaluate-session-v3`, and `save-feedback-v3`. They
intentionally do not reuse legacy step IDs because Inngest may replay a
memoized step result across a deployment. The fetch boundary is versioned
because legacy output can use database row UUIDs where v2 requires canonical
event IDs. Any future incompatible cached evidence contract or result shape
requires another step-ID version rather than feeding old output into new
eligibility or persistence logic.

## Ownership boundary

SAV-195 guarantees structural completeness and exact quote-to-turn grounding.
SAV-196 owns adversarial and low-signal policy, normalization or regeneration,
repeated-turn inflation defenses, prompt-injection/corruption/missing-user-
speech fixtures, and honest precision thresholds. Passing this parser is not a
claim of comprehensive adversarial launch validation.

## Transcript validation boundary

`packages/core/src/feedback-transcript.ts` prepares untrusted transcript data
before both eligibility and model evaluation:

- malformed or non-v2 canonical events fail closed for new feedback;
- canonical event IDs are opaque, exact identities. The feedback boundary
  accepts any non-whitespace identity up to 512 JavaScript string code units
  and does not normalize, reinterpret, or restrict its character set;
- canonical event IDs never enter model traffic. Immediately before prompt
  construction the evaluation adapter projects the prepared transcript to
  deterministic `turn_0001` aliases, serializes records as escaped JSON, and
  accepts only those aliases from the model. Every finding reference is mapped
  back to the exact canonical event ID before the v2 result reaches
  persistence; unknown aliases fail closed;
- bounded text lengths and invalid control or replacement characters are
  treated as corruption;
- exact and near-identical semantic replays are normalized across ASR
  punctuation, bounded leading attempt/answer labels, terminal low-information
  option annotations, rotating leading ordinal discourse such as `First, I`,
  `Firstly, I`, `1st, I`, `First of all, I`, and `First off, I` through their
  bounded tenth forms, equivalent `In the first place` and `Number one` forms,
  and opaque nonces attached to explicit provider metadata
  markers, then removed before turn and substantive-answer thresholds are
  calculated. Punctuation-free sentinel tokens preserve those metadata classes
  through normalization. Replay tokenization is capped at 1,024 tokens per turn
  and at 65,536 normalized tokens across one preparation call; compact Han,
  Hiragana, and Katakana text is grapheme-tokenized. Inputs that normalize to
  zero tokens or exceed either deterministic budget fail closed before
  evaluation;
- per-speaker prefix tries keep terminal replay families bounded, while shared
  prefix/suffix sequence tries index internal rotating-marker insertions,
  deletions, and replacements in O(total replay tokens) construction work.
  A structurally separate one-to-three-token Unicode label, with each token
  bounded to 32 characters and using brackets or a comma, colon, semicolon,
  period, closing parenthesis, or dash, also keys an exact normalized answer-suffix
  family without a fixed label vocabulary. Numeric, circled-numeric, and mixed
  labels such as `Step 1` use the same boundary. Prefix vocabulary is never
  interpreted semantically: calendar, temporal, conditional, relational,
  stage, cohort, segment, state, scenario, and period prefixes all share the
  exact normalized answer-suffix family when the answer body is otherwise
  unchanged. Original accepted transcript text remains intact. A prefix family
  shares its key with the corresponding unlabeled answer and contributes at
  most two turns, so
  rotations such as `Alpha`, `Beta`, and `Gamma` cannot manufacture the
  three-response partial-feedback threshold. The delimiter, bounded label,
  exact suffix identity, and two-turn cap apply to both short and long answers
  within the global replay-token budget. Material answer-body changes remain
  distinct evidence;
  Every well-formed, injection-safe, within-budget observed variant extends
  replay topology even when that variant is rejected, so a chain of rejected
  bridge variants cannot reset the family. Observed topology is separate from
  accepted evidence counts: rejected variants never increment the number of
  substantive contributions or poison unrelated corrections.
  Differential tests compare that index against an exhaustive bounded-delta
  reference. A high-overlap terminal family contributes at most two turns when
  members share a normalized leading prefix of at least eight tokens covering
  at least 70% of each member, including when the shared prefix is an entire
  shorter turn. Candidate buckets are bounded by the same two-turn cap.
  Arbitrary, variable, compact-script, and unequal-length suffixes therefore
  cannot manufacture a third answer. Changed content words, product
  identifiers, comparison direction, metric values, negation, ordering, and
  substantive corrections remain distinct evidence. One-token terminal
  corrections among `retention`, `conversion`, and `revenue` are explicitly
  preserved rather than being mistaken for a replay-family suffix;
- substantive answers require Unicode-aware lexical/grapheme diversity and a
  structural language scaffold. Spaced English responses require an ordered
  main clause plus a grammatically plausible dependent, relative, coordinated,
  enumerated, or fronted-context structure. A separate multi-sentence path uses
  per-sentence diversity, ordinary function-word structure, and a bounded set
  of common finite predicates without requiring PM noun or domain-verb lists;
  subject-predicate agreement and complete complements fail closed while bounded
  `I`, `it`, plural-pronoun and common irregular-plural subjects, common
  irregular past forms, and subject heads before `of` complements remain valid.
  Bounded ordinary direct-object predicates remain eligible when their clause
  structure is complete, so common unlisted verbs do not erase real answers.
  Sentence-head and recognized-predicate evidence decide whether an
  English clause owns strict validation. A recognized Spanish, French, or German
  scaffold—including a leading non-English marker in an otherwise Latin-script
  fragment—is not rerouted through the English-only path, but multilingual
  markers cannot exempt a determinate English-headed clause from its agreement
  and complement checks. The multilingual path requires two complemented
  predicates, an ordered relationship boundary, and bounded recognized-token
  coverage. Predicate support is clause-local and requires either licensed
  grammatical structure or bounded grammar-token coverage; complement direction
  is family-aware so ordinary German object-before-predicate and verb-final
  clauses remain eligible. Keyword scaffolds followed by diverse gibberish
  remain insufficient.
  Repeated relationship markers and PM-noun word salads
  fail closed. Ordinary coherent answers are not required to use a fixed
  domain-noun allowlist. This is intentionally a surface-coherence eligibility
  guard, not semantic adjudication: a structurally coherent but implausible
  answer remains evaluator input and should receive appropriately weak
  evidence-grounded feedback rather than being mislabeled as no answer.
  Compact Han, Hiragana, and Katakana
  responses use a separate bounded path requiring two distinct reasoning
  predicates distributed across two structural segments, relationship or
  punctuation scaffolding, at least two grammar signals, and adequate
  recognized coverage when compact-script chunks are separated by whitespace.
  Keyword lists, varied filler, repeated graphemes, and arbitrary non-Latin
  strings cannot create numerical precision; unknown language families fail
  honestly rather than qualifying from grapheme diversity alone;
- no usable user speech routes to `insufficient`;
- a security-only NFKC scan projection removes default-ignorable separators and
  normalizes Unicode punctuation without changing stored transcript or evidence
  text;
- high-confidence instruction-injection and feedback-result manipulation
  shapes are classified from clause structure, control action, evaluator or
  role-envelope context, and score, one-sided-feedback, pass, or hiring
  outcome. Direct self-score equality, first- or third-person pass
  declarations, named-actor hiring controls, and the full 0–10 score domain are
  rejected. Parentheses, slash-delimited text, spaced ASCII-hyphen command
  boundaries, discourse continuations, Unicode punctuation boundaries, and
  polite/deontic forms are scanned. Bounded structural packs in Spanish,
  French, German, Chinese, Japanese, Arabic, and Russian require an action,
  self-target, and either a controlled score or one-sided-feedback outcome
  within one clause; matches route to `insufficient` and are never sent to the
  evaluation model. Bounded declarative self-outcome assertions are rejected in
  the same language packs. Externally attributed past ratings and bounded
  third-party reported assessments remain evaluable when they are reported as
  interview evidence rather than requested as a new result. Ordinary source,
  temporal, causal, quoted-label, and narrative context remains evaluable;
  bounded command wrappers before or after the report fail closed, including
  direct role vocatives, bounded purpose adjuncts, copy/repeat/respond/say/quote
  actions, exact/verbatim and formatting modifiers, explicit references to the
  preceding sentence, connector runs, coordinated numeric tails, and recognized
  discourse or acknowledgement bridges. Unknown intervening content always
  stops bridge traversal because it may establish a new antecedent. Multiple
  reported assessments are projected atomically so a wrapper around any report
  cannot hide behind another safe report. Passive third-party ratings remain
  evaluable when surrounding action-like words are balanced quoted labels rather
  than commands. Active or passive attributed-score reports—including common
  rated, scored, received, got, earned, gave, and awarded forms—are recognized
  independently from the adjacent wrapper language. English and cross-language
  copy, quote, say, print, repeat, return, respond, mention, provide, and related
  commands before or after the report fail closed across only immediate or
  recognized bridge segments, including immediate `echo`, `reproduce`, and
  `use ... as the result` and `make ... the result` forms. Delegated evaluator
  controls such as `instructed`, `told`, `asked`, `require`, `is to`, and
  `shall` fail closed when they control a result, including active or passive
  requests for multiple scores. Bounded `was 10/10 according to` or `per` an
  approved third-party source remains evaluable, while unapproved sources and
  wrappers do not.
  Unknown content remains a hard barrier. An appended declarative self-outcome
  also fails closed.
  The multilingual forms are a narrow high-confidence safety boundary, not a
  claim of full language or paraphrase coverage. Outcome-neutral calibration
  benchmarks, product metrics, workflow language, third-party product-policy
  discussion, numeric ranges, hyphenated product language, and explicit
  injection-defense discussion remain evaluable. Natural product answers about
  detecting, rejecting, filtering, protecting against, guarding against,
  preventing, or classifying example prompts, instructions, requests, and
  quoted text—including a bounded labeled direct-score example—remain data
  rather than commands; an independent command after an otherwise legitimate
  policy is still rejected, including less-common score actions such as
  `bestow`, `furnish`, or `pencil in`;
- consecutive candidate events retain two bounded security mechanisms. At most
  two 512-character prior tails and a 256-character current head feed complete
  two- and three-event manipulation scans. A separate typed state follows only
  bounded intent, evaluator or reviewer participant, optional infinitive,
  action, candidate-target, quantified dimension/category target, result-noun,
  connector, and controlled-outcome fragments across at most six candidate
  events; continued control grammar at that hard cap fails closed without
  concatenating candidate speech. Bare zero-through-ten values are controlled
  outcomes only after the preceding typed action/target/result context
  establishes a result-setting command; `all`, `every`, or `each`
  dimension/category fragments advance that context instead of resetting it. An
  attributed score plus an anaphoric command, a split score request/value, a
  split delegated control, or a four-plus-event result command therefore cannot
  evade the boundary. Interviewer, malformed, unrelated, or detected-injection
  events reset the relevant state; ordinary adjacent answers, product metrics,
  benign fragments, and third-party reports remain evaluable;
- an unrecognized evidence quote is acceptable only when its canonical source
  turn is substantive and the exact quote has at least three distinct words
  and sixteen alphabetic graphemes. Recognized PM, reasoning, acronym,
  qualified-number, and bounded localized anchors retain their explicit path.
  Arbitrary compact non-Latin graphemes are not treated as proof of meaning;
- worker and direct-evaluation entry points repeat the guard so a late corrupt
  read cannot become scored feedback.

`insufficient` is represented by a skipped feedback record with reasons and
recommendations, never a v2 score object. Existing completed legacy feedback
remains readable without reinterpretation. These deterministic controls do not
claim exhaustive adversarial coverage or hiring calibration.

Only parsed v2 results may enter the
[deterministic drill recommendation contract](./drill-recommendations.md).
Insufficient, skipped, abandoned, failed, legacy, or malformed feedback cannot
receive a score-derived fallback recommendation.

Persistence, event fencing, retries, and insights handoff follow the
[feedback generation contract](./feedback-generation.md).

## Read and presentation boundary

Persisted completed rows are untrusted input when read back. The canonical
presenter in `packages/core/src/feedback-view-model.ts` produces exactly one of:

- validated `v2`, with the exact supported version tuple, complete scores, an
  overall score that matches the canonical v2 weighting, and findings whose
  event IDs and exact quotes resolve against current canonical persisted user
  turns for the same owner-scoped session;
- validated `legacy`, with a completely absent v2 tuple, explicitly bounded
  historical strings, complete in-range scores, and an explicit historical
  feedback label;
- `invalid`, which contains no scores or findings and is shown as unavailable.

The read boundary accepts only the exact historical `1.0.0` rubric marker.
Unknown historical rubric versions fail closed. Legacy feedback preserves its
separately stored overall score; it is not reweighted using v2 rules and is
never described as transcript-grounded.

For v2, the authenticated API loads only canonical candidate-turn fields needed
for verification: event ID, speaker, text, and transcript contract version. The
presenter repeats the transcript-integrity checks at read time, rejects missing,
duplicate, non-v2, non-user, or unsafe turns, and excludes semantic replays.
Every evidence reference must exist in that canonical set and every quote must
remain an exact substring of the referenced candidate turn. A mismatch returns
`invalid`; it is never downgraded into historical feedback.

The read projection and presenter share the canonical 512-character transcript
event-ID limit used at ingestion. A valid long event ID is therefore never
truncated or reclassified as corrupt after immutable feedback has completed.

The API emits a redacted integrity log for an invalid completed row. It contains
only environment, release, and opaque session correlation—never findings,
transcript text, user identity, or raw persisted payloads.

V2 findings render in this order: observation, every transcript evidence
excerpt, then one specific next action. Confidence is described as evidence
strength, not interview readiness: `0.8–1` is strong, `0.6–0.79` is moderate,
and values below `0.6` are limited evidence.

Stored model-authored exercise strings are validated as persisted input but do
not cross the customer/API read boundary. Deterministic focused-practice work
owned by SAV-201/SAV-202 uses its separate typed contracts; this presenter does
not rank or persist recommendations.

Persisted text, JSON, lifecycle enums, and canonical evidence turns use bounded
database projections. The query reads one character or row beyond each accepted
limit so oversize data can fail closed without unbounded materialization. JSON
is decoded only after that projection, and malformed data never reaches the
customer response as personalized feedback.
