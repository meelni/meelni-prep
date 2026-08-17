# Proposal: Dimension evidence coverage for feedback scoring

> Amended by SAV-453. A customer Scorecard now requires every weighted
> dimension and the canonical total. Incomplete coverage reduces to scoreless
> Coaching review; historical partial rows remain stored without rewrite.

## Why

The current numerical-feedback decision still depends on whether individual transcript rows resemble written English and how many rows survive that heuristic. Equivalent speech can therefore receive different scoreability decisions when STT finalization changes. That is not a PM competency signal.

SAV-369 established immutable-event-preserving, segmentation-invariant candidate answer blocks. Feedback scoring should now use closed, round-specific rubric evidence over those blocks.

## What Changes

- Add an additive dimension-coverage feedback contract and strict provider selection schema.
- Require provider selections to use only configured round/facet codes and existing answer-block aliases.
- Derive `sufficient | partial | absent` coverage and the user result mode in provider-neutral core code.
- Permit customer-visible dimension scores only when every weighted dimension
  is sufficient and the canonical overall is present.
- Reconstruct and validate answer blocks from frozen evidence at generation and authenticated read boundaries.
- Persist new results additively while leaving completed historical rows unchanged.
- Add provider-free synthetic calibration and adversarial fixtures.

## Non-Goals

- Changing the immutable transcript ledger or SAV-369 grouping rules.
- Inferring PM skill from punctuation, grammar, transcript-row counts, word count, or keyword presence.
- Free-form provider narrative, confidence, citations, or mode selection.
- Production migrations, provider mutation, deployment, launch authorization, or merge.
