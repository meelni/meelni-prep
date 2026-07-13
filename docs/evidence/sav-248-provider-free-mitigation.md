# SAV-248 Provider-Free Mitigation

Recorded: 2026-07-13

Provider calls: **0**

Customer or Production data: **none**

## Decision

Replace the feedback adapter's legacy JSON mode with strict structured output
for `feedback.v2`, while keeping transcript grounding and all cross-field
semantics in the provider-neutral core parser. Refusals, output truncation,
content filtering, and unexpected tool/function finishes receive distinct
closed failure codes; raw refusal text and partial output remain excluded from
reports.

The consumed SAV-198 plan is immutable history. The fresh SAV-248 v2
authorization and accepted plan now bind the new response format, its exact
serialized bytes, and the reduced output ceiling. Paid calibration still
cannot start until the new protected v2 ledger authority is provisioned and
verified.

## Exact Provider-Format Evidence

- Format version: `feedback-provider-response-format.v1`
- Contract SHA-256:
  `66605edf2b3cad146671f22afa656d9c01c9abea2e7475a68dbe21738c8e4073`
- Full-state serialized format: 2,424 bytes
- Partial-state serialized format: 2,430 bytes
- Root object and every nested object require every declared field and set
  `additionalProperties: false`.
- The provider schema deliberately uses only object closure, required fields,
  scalar types, arrays, and enums. Core retains non-empty, range, cardinality,
  grounding, and cross-field validation until provider acceptance is proven.
- The provider schema excludes `modelVersion` and `overallScore`; the adapter
  supplies model provenance and core computes the canonical weighted score.

## Prospective Bounded-Plan Calculation

Using the SAV-198 32 scored synthetic fixtures, three repetitions, the reviewed
GPT-5.1 snapshot pricing contract, exact structured-format byte ceilings, and a
prospective 1,800-token output ceiling produces:

- planned calls: 96;
- deterministic worst case: 2,853,997,500 nano-USD ($2.8539975);
- hard-cap comparison: below $3.

This calculation is now bound by authorization
`sav-248-user-authorization-2026-07-13.v2` and accepted plan hash
`354bdc4046b0759e50940127c574abe355ee0754d9a8aaf2c25338b49aca8419`.
This provider-free work performed no ledger activation or provider call and
grants no provider or launch acceptance. The one observed SAV-198 response used
1,392 output tokens but is not sufficient alone to prove corpus-wide
completion.

## Validation

- Local strict response-schema shape and exact evaluation-state constraint:
  passed provider-free; provider acceptance is not yet proven.
- Closed object requirements and deterministic schema identity: passed.
- Refusal/incomplete/filter/unexpected-finish sanitization: passed.
- Known-usage failure reconciliation behavior: preserved.
- Application and test TypeScript checks: passed.
- Calibration behavior suite: 86/86 passed under the repository-pinned Node
  22.22.0 runtime. An initial shell run selected Node 20.10.0 and correctly
  failed three startup-attestation tests before the changed code; rerunning on
  the required runtime cleared those environment-only failures.
- Production build and public-surface verification: passed (68 generated
  pages, 28 public source pages, 627 source files, and 81 manifest routes).

## Remaining Acceptance Boundary

Once Preview provider acceptance is proven, structured output is intended to
remove malformed JSON and structural drift as failure classes. The local tests
do not prove provider compatibility. Structured output also cannot prove exact
quote grounding, user-speaker provenance,
reference/evidence equality, or cross-finding evidence uniqueness. The core
parser continues to enforce those invariants. The separately authorized
synthetic-only provider run is still required to identify or clear any
remaining semantic failure and to pass all calibration thresholds, but it must
not begin until the v2 ledger activation controls pass.
