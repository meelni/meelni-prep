# Evaluation Output Semantic Adjudication

## Purpose and boundary

`evaluation-output-semantic-adjudication.v1` is a provider-free gate for
future synthetic calibration output. It determines whether each feedback
output is relevant, accurate, useful, and assigned to a defensible PM rubric
dimension. Exact transcript grounding and canonical-anchor matching remain
separate deterministic gates.

This contract does not authorize a provider call, paid spend, v3 run,
Production access, or customer-data use. Existing v1/v2 calibration evidence
is historical and is never reinterpreted through this contract.

## Trusted out-of-band authority

Reviewer-authored artifacts are never authority by themselves. Before review,
a trusted operator or orchestrator supplies a separate
`evaluation-output-semantic-authority.v1` envelope directly to the validator.
It binds the exact approved plan version/hash, the complete expected opaque
output and case/run inventory, the exact run, response-set, and review-input
hashes, and exactly two verified, distinct agent task paths and
execution-receipt hashes. Its canonical hash is bound into the final
adjudication artifact and public report.

The validator compares the review input's plan, complete coverage, and exact
run/response/review hashes to this envelope. It also requires each panel to carry the execution receipt assigned
to its task path. An omitted authority envelope, cherry-picked output subset,
forged or swapped receipt, duplicate receipt/task path, or authority-hash
mismatch produces no report. This authority authenticates review scope only;
it is not provider or spend authority and does not authorize v3.

## Hash-bound review input

The trusted private-run boundary creates one
`evaluation-output-semantic-review-input.v1` manifest. It declares
`syntheticOnly: true` and `customerDataUsed: false` and binds the exact run ID;
corpus, prompt, response-schema, and model versions and SHA-256 values; and one
opaque output ID, opaque case ID, run index, and byte-exact response SHA-256 per
output. Canonical run, response-set, and review-input hashes bind the whole
manifest.

Opaque case IDs are exactly `case_` plus 32 lowercase hexadecimal characters;
opaque output IDs are exactly `out_` plus 32 lowercase hexadecimal characters.
IDs and case/run pairs are unique, and outputs are sorted. The manifest
contains no case name, transcript, prompt, response content, error, or customer
identifier. Raw synthetic output remains in a private operator-controlled
directory and is never committed merely to support review.

## Two-panel adjudication

Exactly two independent agent task paths review the same exact
`reviewInputSha256`. Each `evaluation-output-semantic-agent-panel.v1` artifact
is canonically hashed, carries its authority-assigned execution-receipt hash,
and contains exactly one decision for every output hash.
`humanReviewerIdentity` is always `null`; no human identity is inferred.
Canonical task paths may identify direct or nested agents under `/root`; path
traversal, empty segments, and non-canonical characters are rejected.

Each output decision uses only these closed fields:

| Field                   | Closed values                                              |
| ----------------------- | ---------------------------------------------------------- |
| Evidence relevance      | `relevant`, `irrelevant`, `legitimate_alternative`         |
| Observation accuracy    | `accurate`, `inaccurate`                                   |
| Next-step usefulness    | `useful`, `not_useful`                                     |
| Dimension fit           | `fits`, `misfit`                                           |
| Alternative disposition | `not_applicable`, `reviewed_legitimate`, `review_required` |
| Overall decision        | `accept`, `reject`                                         |

Free-form notes, rationales, response excerpts, and unknown fields are
forbidden. A legitimate alternative is acceptable only when explicitly marked
`reviewed_legitimate`; `review_required` is never valid in a terminal signed
panel, regardless of the evidence-relevance value. `accept` is valid
only when evidence is not irrelevant, the observation is accurate, the next
step is useful, the dimension fits, and any alternative has been reviewed.
All other combinations must be `reject`.

The validator fails closed on missing, duplicate, reordered, or unexpected
outputs; any forged binding or artifact hash; duplicate panel task paths;
panel disagreement; a non-null human identity; contradictory decisions or
reviewer prose; and an unreviewed legitimate alternative.

## Public report

Successful validation emits
`evaluation-output-semantic-adjudication-report.v1`. It contains only authority,
contract, response, and panel hashes, opaque output IDs, closed decisions,
aggregate counts, and a `passed`/`failed` gate. It declares
`rawOutputContentIncluded: false`,
`syntheticOnly: true`, and `customerDataUsed: false`. Private raw synthetic
output may remain available to the panels under operator-controlled retention;
the report makes no claim that those private bytes were deleted. Case IDs and
run indexes remain private and are omitted from every public decision.

Unanimous `reject` decisions produce a valid report with a failed gate. An
invalid, forged, incomplete, contradictory, or disagreeing review produces no
report. Semantic acceptance is necessary but not sufficient for a future
launch decision; deterministic, cost, authority, provider, and release gates
remain independent.
