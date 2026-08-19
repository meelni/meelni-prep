# Design: Bounded Deterministic Question Ranking

## Flow

1. The start workflow resolves the stable request and checks explicit
   `questionId` before any ranker context read.
2. Question-free starts concurrently load bounded eligible candidates,
   activated practice history, and the latest evidence-valid feedback signal.
3. Core normalizes, bounds, scores, and sorts with versioned integer weights and
   stable practice-time/question-ID tie breaks.
4. The workflow converts the winner into the existing selected-question shape,
   compiles it into `InterviewBriefV2`, and stores a privacy-limited receipt and
   replay snapshot in start config.
5. Replays use the accepted start config and question without querying or
   reranking. Python receives only the previously accepted brief.

## Decisions

- Core owns ranking behavior; Drizzle owns bounded normalization; the workflow
  owns orchestration and brief compilation.
- Candidate, history, evidence, and SQL work have explicit upper bounds.
- Feedback is not reinterpreted: only existing validated scorecard evidence may
  emit the compact round/score/time signal.
- Reason codes and versions are observable; candidate scores, private history,
  and feedback evidence are not.
- Empty or unavailable catalog context selects a static versioned PM-round
  fallback so interview start remains available without provider calls.

## Compatibility And Rollback

- Explicit launches preserve the selected stored question bytes and do no
  ranking read.
- Existing persisted starts lack or already contain selection metadata and
  continue through their stored question/brief path without reranking.
- Catalog-backed selections keep the existing session-question foreign key.
- Embedded fallback replay is reconstructed only from validated server-owned
  start config, so no schema migration or runtime database read is introduced.
- Reverting the TypeScript workflow/core changes restores the prior selection
  behavior; no provider or Production state was mutated by this change.
