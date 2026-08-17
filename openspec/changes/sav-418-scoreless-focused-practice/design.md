# Design

> Amended by SAV-453. The scoreless source path is `coaching_review`, including
> strictly validated historical partial rows after customer projection. No
> customer-visible Partial scorecard remains.

## Canonical source resolution

The start workflow first resumes any existing owned attempt for the source
session, regardless of supported attempt version. A new attempt is considered
only after an owned completed source crosses the existing strict feedback read
boundary.

- Historical scored Feedback v2 continues through the unchanged v1
  recommendation, plan, and attempt path.
- Evidence-limited v2 coaching consumes its validated closed improvement
  signal/action/dimension identity and exact canonical citation.
- `feedback.dimension-coverage.v1` partial/coaching consumes a deterministic
  grounded facet from the already reconstructed SAV-369 answer blocks. The
  selector prioritizes grounded partial-coverage dimensions before sufficient
  ones, then uses canonical dimension, facet, and answer-block ordering. It
  never compares numerical scores. Coaching presentation and practice use the
  same selector.
- Full dimension-coverage scorecards and Unable/corrupt/unsupported sources do
  not manufacture an improvement; existing scored-v1 behavior remains the
  compatibility path for supported historical full scorecards.

Equivalent answer segmentation cannot alter the persisted facet identity,
selected practice semantics, or template. Exact source references and quotes
remain frozen integrity evidence and may differ only where canonical evidence
identity itself differs.

## Additive contracts

The new attempt/plan tuple is discriminated from v1. It stores:

- the exact validated feedback version/outcome tuple and a server-computed
  source-content fingerprint;
- the source question and round;
- the selected closed signal/action/dimension or facet/action/dimension
  identity;
- exact frozen selected evidence and its opaque canonical navigation identity;
- immutable server-owned exercise copy from a closed template catalog; and
- the existing completion/self-review contract.

No `weakestScore`, unsupported dimension score, overall score, provider drill,
or arbitrary narrative exists in the new tuple. Strict decoders reject extra
keys, unknown versions/identities, source-copy mismatch, evidence mismatch,
and lifecycle contradictions. V1 parsing remains byte-compatible.

## Persistence, ownership, and retry safety

An additive migration admits exactly the legacy tuple or the new tuple and
changes idempotency to one owner/source path across contract versions. Existing
v1 rows remain valid. Account-identity locking, owner-scoped reads, deletion
tombstones, immutable-snapshot triggers, RLS, and compare-and-set completion
remain authoritative.

Before inserting a new attempt, the repository locks the owned source and
reconstructs its bounded content fingerprint in the same transaction. Drift
between selection and insert fails closed without writing. Once created,
question or feedback changes do not rewrite the snapshot. Concurrent starts
and committed-but-response-lost retries return the same attempt; exact
completion replay succeeds and divergent replay conflicts.

## Privacy and customer DTO

The persisted snapshot may retain the one exact selected citation needed to
prove authorization. The HTTP boundary emits a separately parsed allow-listed
customer attempt. It excludes owner/source-feedback identities, source
fingerprints, raw provider data, internal feedback tuples, internal facet or
signal codes, transcript/answer-block references, and exact citation text.
The workspace receives only server-owned plan copy, the source question and
dimension label, lifecycle state, and candidate-authored self-review.

## UI and recovery

Supported coaching reviews, including historical partial rows projected as
coaching, render one focused-practice workspace after
the prioritized focus and before Transcript. Initial copy states that the
server selected the grounded focus. Permanent source unavailability is
distinguished from retryable transport/service failure. Completion preserves
the existing self-review and adds an explicit return-to-interview action for
the frozen source question without auto-starting or using credit.

Mobile and desktop preserve semantic controls, visible focus, announcements,
44-pixel targets, long-content wrapping, zoom, and no horizontal overflow.
