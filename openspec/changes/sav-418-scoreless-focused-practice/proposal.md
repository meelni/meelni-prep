# SAV-418 scoreless focused practice

> Amended by SAV-453. The current customer outcome is Coaching review for all
> supported scoreless sources, including strictly validated historical partial
> rows.

## Why

SAV-453 presents every supported terminal review as a Scorecard, Coaching
review, or Unable to review. Existing durable
focused practice accepts only scored Feedback v2 and therefore cannot execute
the prioritized focus shown for canonical scoreless coaching outcomes.

## Outcome

Every supported coaching review can create, resume,
complete, and revisit exactly one provider-free focused-practice attempt. The
attempt uses the same strict server-selected grounded focus as the review,
never manufactures a weakest score, and keeps candidate-authored completion a
non-scored self-review.

## Boundaries

- Immutable transcript events remain the integrity ledger; SAV-369 answer
  blocks remain the normalized evaluation/presentation unit.
- SAV-421 coverage and SAV-420 outcome/presentation parsing remain
  authoritative; SAV-418 does not infer scores, outcomes, or citations.
- Selection is deterministic over closed server-validated identities and exact
  frozen evidence, not provider order, transcript segmentation, row count,
  punctuation, grammar, answer length, or missing scores.
- Existing scored focused-practice v1 creation and persisted reads remain
  unchanged.
- The new source snapshot is internal. Customer responses expose only the
  bounded plan and self-review fields required by the workspace.
- No provider call, Production/customer fixture, credit mutation, helpfulness
  event, LiveKit action, remote migration, deployment, launch decision, or
  merge is included.
