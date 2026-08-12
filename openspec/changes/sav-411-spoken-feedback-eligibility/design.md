# Design

## Candidate evidence levels

Core classifies each canonical replay-normalized user response as
`insufficient`, `evidence_limited`, or `scoreable`. All paths retain the outer
quantitative gates: more than ten lexical tokens, adequate uniqueness and
content diversity, and at least 30 alphabetic characters.

The existing surface-coherence contract exclusively owns `scoreable`.
Qualitative fallback requires at least 40 lexical tokens, at least two distinct
recognized PM/reasoning/qualified evidence signals, and recognized evidence in
at least two punctuation-bounded segments. It does not parse agreement,
sentence ownership, or predicate complements. Canonical preparation still
rejects malformed events, prompt injection, replay inflation, and unsafe text
before this classifier runs.

Completion statistics persist both reviewable `substantiveResponses` and strict
`scoreableResponses`. One reviewable response permits partial feedback. Five
strict scoreable responses permit full depth, and four permit numerical scores.
Any number of fallback-only responses remains partial and uses
`evidence_limited` mode. Historical rows without the additive scoreable count
retain their previous behavior.

Deterministic evidence recognition is not semantic proof. Long fluent but
implausible text that already passes the unchanged strict grammar path remains
evaluator input under the existing policy. On the fallback path, multiple
segments and recognized evidence prevent one keyword list from qualifying, but
the closed evidence-limited provider selection remains the semantic coaching
gate. Unknown or invalid selections become provider-neutral
`generation_failed`, never candidate insufficiency.

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

## Verification

A sanitized fixture contains six synthetic long spoken/STT-shaped PM answers,
one harmless interviewer marker, and a missing settlement. The full provider-
free path crosses ingest, writer progress semantics, partial frozen snapshot,
end finalization, outbox dispatch, generation, evidence-limited parsing,
persistence, API decoding, and view presentation. It asserts the evaluator mode
is `evidence_limited` and no scoreable response is manufactured.

Adversarial coverage retains filler, replay, keyword salad, gibberish,
malformed language, prompt injection, candidate markers, canonicalization
markers, gaps, and degraded settlements as fail-closed inputs.
