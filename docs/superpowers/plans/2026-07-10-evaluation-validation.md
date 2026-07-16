# SAV-196 Evaluation Validation

## Intent

- User request: make relaunch feedback trustworthy before the feature flag is enabled.
- Product outcome: unverifiable or low-signal interview transcripts never produce precise-looking scores.
- Why now: feedback v2 provides the strict result shape; this slice closes the transcript-integrity boundary that feeds it.

## Slice

- Primary slice: feedback/evaluation.
- Secondary slices: canonical transcript ingest and terminal session eligibility.
- Skills: `meelni-feedback-evaluation`, `meelni-livekit-interview-runtime`, and `meelni-vertical-slice-playbooks`.

## Linear Tracking

- Project: Meelni.
- Parent: SAV-168.
- Deliverable: SAV-196.
- State: In Progress.

## Scope

- In scope: canonical transcript preparation, duplicate-turn suppression, high-confidence prompt-injection rejection, user-speech evidence enforcement, conservative quote normalization, insufficient-state routing, fixtures, tests, and contract docs.
- Out of scope: calibrated hiring-readiness claims, rubric redesign, provider/model changes, and the SAV-197 workflow consolidation.
- Assumption: the relaunch runtime writes transcript contract v2 events; legacy feedback remains readable but non-canonical transcript input cannot create new v2 feedback.

## Technical Plan

1. Add a provider-neutral transcript preparation contract in `@meelni/core`.
2. Use the same prepared transcript for terminal eligibility, worker input, and direct evaluation entry points.
3. Fail closed for malformed canonical events, missing user speech, and high-confidence instruction injection; deduplicate replayed semantic turns before thresholds and evaluation.
4. Restrict feedback evidence to user turns, normalize only typographic punctuation/whitespace back to the exact canonical source substring, and reject repeated evidence identities.
5. Add adversarial fixtures and record the behavior in the feedback contract.

## Accepted deterministic boundaries

- Replay preparation uses a 1,024-token per-turn limit and a 65,536-token
  per-call limit before indexes or model input can grow further. Oversized or
  zero-token normalized input fails closed.
- Exact, leading-label, terminal-family, and bounded internal rotating-marker
  replays are removed with bounded per-speaker indexes. Word, adverbial, and
  numeric rotating leading ordinal discourse, including bounded `of all` and
  `off`, `In the first place`, and `Number one` forms, is normalized before it
  can manufacture separate turns. Safe
  rejected variants extend observed replay topology without incrementing
  accepted contribution counts, closing transitive bridge chains. Legitimate
  terminal corrections among retention, conversion, and revenue remain separate
  evidence.
- English and compact Han/Kana response gates reject the adjudicated keyword
  salads while retaining the adjudicated ordinary PM answers. These are
  bounded surface-coherence checks, not semantic understanding. Structurally
  coherent but implausible answers remain evaluator input and should receive
  weak evidence-grounded feedback instead of being mislabeled as no answer.
  Coherent multilingual scaffolds retain their path, but mixed-language markers
  cannot exempt malformed English-headed clauses from agreement and complement
  checks, including after a bounded multilingual discourse prefix. Agreement
  handles common irregular plurals and subject heads before `of` complements;
  complete ordinary direct-object clauses do not require a domain-verb list.
- Direct self-score, pass, hiring, one-sided-feedback, and structural
  multilingual manipulation shapes fail closed, including purpose-fronted,
  copy/repeat/respond/say/quote, formatting, explicit preceding-sentence,
  multi-report, and recognized acknowledgement or discourse wrappers. Unknown
  intervening content always stops traversal because it may establish a new
  antecedent; bounded English and cross-language score anaphors fail closed,
  including active/passive report variants and symmetric before/after
  copy/quote/say/print/repeat/return/respond/mention/provide action families,
  delegated evaluator controls, and immediate echo/reproduce/use/make-result
  forms, while bounded third-party rating narration and balanced quoted action
  labels remain evaluable. Every defense-example branch uses the same suffix
  action boundary, so a legitimate bounded example cannot hide a later command.
  A bounded typed rolling state also closes result controls split across two
  through six consecutive candidate events while preserving interviewer,
  malformed, and detected-injection barriers. Target prefixes cannot be split
  from bounded article, demonstrative, possessive, or pronoun targets such as
  `the answer`, `this response`, `their performance`, or `it`. That state treats
  a bare zero-through-ten value as an outcome only after typed result-setting
  context exists and keeps quantified `all`/`every`/`each` dimension or category
  targets inside the same command; unrelated numeric PM evidence still resets
  or bypasses the state.
  Neutral evaluator calibration targets, product-policy discussion, and bounded
  natural injection-defense examples remain evaluable.
- Exact quote grounding is supplemented by observable lexical/concept support,
  exact quantitative and absolute anchors, direct contradiction checks,
  high-confidence evidence breadth, a minimum evidence breadth for any weighted
  overall score of at least 9, same-dimension strength support for each 9-or-10
  dimension, and grounded summary checks that reject hiring/readiness,
  pass/fail, advancement outcomes (including articleless forms), unsupported
  material or quantitative claims, unsupported factual statements, and
  unsupported absolutes. Summary units preserve common abbreviations while
  splitting at Unicode sentence boundaries and digit-adjacent non-decimal
  periods. Literal-attribution variants must occur inside one individual
  evidence quote; factual summaries cannot borrow support from an ungrounded
  coaching next step. Directional, material, and absence polarity must agree
  bidirectionally, with target and direction coexisting in one evidence/source
  unit and mixed-direction metrics bound locally. Canonical aliases and bounded
  generic observable metrics share that binder; lexical multipliers through
  quadruple remain target-bound. Count predicates also bind assertion mode and
  common pre-number quantity phrases, so negated, failed, future, intended,
  expected, object-infinitive, or hypothetical research cannot ground a
  completed count action. Irregular completed predicates such as `met` and `had`
  remain action-bound. Bounded count-noun modifiers may be abstracted to their
  noun head without allowing action, value, or unit substitution. Definition
  and directional polarity cover bounded adverbs and the same
  completed-versus-planned assertion modes while preserving positive double
  negations and rhetorical coordination controls. Privacy and security
  protection actions remain polarity-bound, including actions that secure
  customer records or preserve privacy. Adjective-modified adverse noun
  heads remain distinct from positive plans addressing those risks. Prohibited
  hiring outcomes include natural landed-offer, secured-role, and accepted-offer
  forms without blocking non-hiring team or pricing-offer controls.
  Exceptional-strength absence classification covers singular and plural
  bounded absence targets.
  Negative or unresolved findings such as `unknown`, `pending`, `undecided`, and
  `to be determined` do not satisfy an exceptional-score strength gate. None of
  these deterministic checks proves arbitrary semantic entailment.

## Validation

- Required: targeted core/workflow/API tests, `npm run check:ci`, and `npm run build`.
- Fixtures: hallucinated quote, unsupported or contradicted observation,
  quantitative and absolute precision, typographic quote normalization, prompt
  injection, English and multilingual result manipulation, semantic replay,
  leading/internal marker replay, substantive correction, missing user speech,
  malformed canonical event, deterministic token budgets, and short session.
- Manual: inspect the worker state transition to confirm rejected input is stored as `skipped`, never `completed` or scored.

## Rollout

- Risk: high because this changes feedback eligibility; fail closed while the relaunch flag remains off.
- Backward compatibility: legacy completed feedback is read unchanged; only new generation eligibility tightens.
- Follow-up: SAV-197 owns generation workflow consolidation and SAV-211 owns accessible feedback presentation.
