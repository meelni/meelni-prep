# Design

## Candidate evidence levels

Core classifies each canonical replay-normalized user response as
`insufficient`, `evidence_limited`, or `scoreable`. All paths retain the outer
quantitative gates: more than ten lexical tokens, adequate uniqueness and
content diversity, and at least 30 alphabetic characters.

The existing surface-coherence contract exclusively owns `scoreable`.
Qualitative fallback requires at least 40 lexical tokens; deduplicated
recognized PM/reasoning lexemes; occurrence density no higher than 30%; and no
more than two occurrences per distinct lexeme. It counts greedily disjoint
pairs of different recognized lexemes within an exact 14-token-index distance
only when a connector occurs between them. At least one pair must use a strong
connector. A turn then needs either five distinct lexemes and two broad pairs,
or at least 46 tokens, four distinct lexemes, and one broad pair. It does not
depend on punctuation or parse agreement, sentence ownership, or predicate
complements. Canonical preparation still rejects malformed events, prompt
injection, replay inflation, and unsafe text before this classifier runs.

Completion statistics persist both reviewable `substantiveResponses` and strict
`scoreableResponses`. One reviewable response permits partial feedback. Five
strict scoreable responses permit full depth, and four permit numerical scores.
Any number of fallback-only responses remains partial and uses
`evidence_limited` mode. Historical rows without the additive scoreable count
retain their previous behavior.

Deterministic evidence recognition is not semantic proof. Dense keyword salad,
sparse anchors, and repeated-token stuffing fail the bounded lexical gate, but
engineered low-density unrelated causal prose and rotated distinct-anchor loops
can qualify. Such input remains qualitative-only. The closed evidence-limited
provider selection and exact frozen citation validation remain the semantic
coaching gate; the provider cannot author narrative or scores. Unknown,
unsupported, or invalid selections become provider-neutral
`generation_failed`, never feedback or candidate insufficiency.

## Interruption integrity

Core owns one exhaustive classifier over marker `speaker` and `reason`. Only a
textless interviewer `no_provider_confirmed_prefix` marker has `preserve`
impact. Candidate markers and every `canonicalization_failed` marker have
`degrade` impact.

Writer progress records each fact's typed impact while continuing to advance
the shared turn/marker sequence. Gap rehydration reconstructs the same impact
from stored marker fields. The final evidence snapshot receives typed markers
and counts only degrading impacts. Writer state and final marker checks
therefore cannot disagree or double-penalize the harmless case. Conflicting
sequence identities, writer gaps, degraded settlements, invalid boundaries,
and previously degraded writers remain fail-closed.

The Python runtime applies the same exact classifier before setting its global
settlement-integrity flag. A harmless marker may therefore settle healthy; hard
markers still settle degraded. At freeze, any preserving marker or missing
writer settlement sets the additive durable
`feedbackModeConstraint=evidence_limited_only`, downgrades the evaluation state
to partial, and prevents four or five otherwise scoreable answers from
receiving numerical feedback.

## Verification

A sanitized fixture contains six synthetic long spoken/STT-shaped PM answers,
one harmless interviewer marker, and a missing settlement. The full provider-
free path crosses ingest, writer progress semantics, partial frozen snapshot,
end finalization, outbox dispatch, generation, evidence-limited parsing,
persistence, API decoding, and view presentation. It asserts the evaluator mode
is `evidence_limited` and no scoreable response is manufactured.

Adversarial coverage retains filler, replay, dense keyword salad, gibberish,
prompt injection, candidate markers, canonicalization markers, gaps, and
degraded settlements as fail-closed inputs. It also records the known
low-density lexical false-positive boundary without misrepresenting it as
semantic rejection.
