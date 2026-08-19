# Deterministic Full-Interview Question Selection

## Authority

This contract applies only to authenticated full-interview starts before room
entry.

- An explicit `questionId` is an absolute override. The workflow loads it first,
  validates that it is active and maps to a PM round, and performs no ranking
  context read. Its valid stored ID, text, company, and type bytes are preserved
  through the persisted snapshot and `InterviewBriefV2`.
- A question-free start uses `question-ranking.v1` and
  `deterministic-question-ranker.v1` in TypeScript core.
- The LLM and Python voice runtime do not select questions and do not read the
  database or network for this decision.

## Bounded Input

The workflow/database boundary normalizes at most:

- 64 active, published candidates;
- 16 activated-session practice-history rows;
- one latest feedback row, emitted only as a validated scorecard signal; and
- eleven database statements in the worst evidence-validation path (three
  transaction-local timeouts, candidate, history, feedback, and five frozen-
  evidence reads).

The three logical context reads run concurrently and every database statement
has the existing 5-second interactive-read timeout; the workflow also abandons
ranking for the embedded fallback after 5 seconds so room start does not wait on
queued work. Candidate SQL uses a fixed 32-bucket matrix (eight stored question
types by Easy/Medium/Hard/null), reads at most 64 index-ordered rows per bucket,
materializes at most 2,048 rows, and returns 64. Each bucket is an explicit SQL
branch: non-null difficulty uses equality and null difficulty uses `IS NULL`.
Its local ordering includes the fixed difficulty key before source recency and
stable ID so PostgreSQL consumes the composite index order through the
per-bucket limit instead of filtering or sorting the bucket. With no requested
company, the outer window remains ordered by requested round, requested
difficulty, source recency, and stable question ID. A partial
`(question_type, difficulty, asked_at DESC, id)` index serves each exact bucket.
History first limits sessions through the partial
`(user_id, activated_at DESC, id)` index and only then joins the one question
relation. Migration `0042_sav_470_question_ranking_indexes` owns both indexes.

Core independently reapplies the 64/16/8 candidate/history/signal limits before
scoring. A nullable catalog difficulty remains eligible but neutral and never
earns the requested-difficulty weight. Candidate catalog content is hashed into
`question-catalog:sha256:<digest>` after stable ID sorting.

## Scoring Table

Weights are integer, additive, and version-bound:

| Factor                                                          | Weight |
| --------------------------------------------------------------- | -----: |
| Requested round                                                 |    +36 |
| Requested difficulty                                            |    +12 |
| Requested company                                               |    +18 |
| Recent validated weak round (score at most 6.5, within 90 days) |    +20 |
| Unseen question                                                 |    +24 |
| Practiced more than 90 days ago                                 |    +16 |
| Practiced 31–90 days ago                                        |    +10 |
| Practiced 8–30 days ago                                         |     +4 |
| Repeated within 7 days                                          |    -28 |
| Repeated within 24 hours                                        |    -48 |
| Recent validated mastered round (score at least 8)              |    -14 |
| Published corpus eligibility                                    |     +8 |
| Google Sheets provenance                                        |     +4 |
| Dated source evidence                                           |     +2 |

Only active, published, structurally valid candidates are eligible. Ordering is
score descending, then unseen/oldest practice first, then question ID ascending.
Thus identical normalized input, reference time, catalog version, and ranker
version produce identical ordering.

## Feedback And Privacy

Feedback enters ranking only after the existing completed-scorecard,
dimension-coverage, frozen-evidence, and dashboard-presentation validity checks.
Missing, invalid, future, or older-than-90-day signals are ignored. The ranker
does not receive transcripts, free-form feedback, private history details, or
provider/model data.

Persisted `questionSelectionV1` contains only:

- selection mode and bounded reason code;
- ranker and catalog version;
- selected question ID; and
- the selected question snapshot needed for exact replay.

It never stores candidate scores, factor weights, practice history, or feedback
evidence. An accepted start reuses both this receipt and the exact persisted
`InterviewBriefV2` wire without reranking. Every SAV-470 selection mode rebuilds
the selected-question response from this snapshot even if the current catalog
row was edited or deleted. The locked persisted winner also exclusively decides
whether the catalog foreign-key relation is created after an insert conflict.

## Fallbacks

- New user/no history: score the bounded published corpus normally.
- Missing or invalid feedback: omit the signal and continue.
- Inactive, quarantined, retired, malformed, stale, or deleted candidates: omit
  them before scoring.
- Empty eligible corpus or ranking-context failure: use the versioned embedded
  PM-round fallback (`fallback:question:v1:<round>`), persist its snapshot in
  start config, and do not block room start.
- Existing persisted start: reuse its selected question and config exactly.

Embedded fallbacks do not create a catalog foreign-key row; the durable start
loader reconstructs them only from its server-owned, validated selection
snapshot. Catalog selections retain the existing session-question relation.

## Non-Production Evidence

Local synthetic evidence on 2026-08-18, without providers, Production data, or
customer data:

- DB seam test: three bounded logical reads, worst-case eleven SQL statements,
  32 candidate buckets, and at most 2,048 bucket rows before the 64-row window;
- PostgreSQL 17.10 plan test: 32,000 adversarial active/published rows produce
  32 composite-index scans, each with exact type and difficulty index
  conditions, 64 rows below its direct limit, no filter removals, and no
  per-bucket sort;
- 2,000 selections over 64 synthetic candidates and 16 history rows: p50
  0.060 ms, p95 0.069 ms, maximum 0.277 ms on the local workstation.

These measurements characterize local selection work only; they are not a
Production latency claim or launch decision.
