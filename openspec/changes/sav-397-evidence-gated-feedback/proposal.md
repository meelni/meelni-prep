# SAV-397 evidence-gated feedback

## Why

Runtime transcript turns and integrity markers currently allocate sequences
independently even though persistence treats them as one writer namespace. A
cross-kind collision can degrade an otherwise useful transcript. Separately,
wall-clock and total-turn gates deny feedback to short but substantive answers
and collapse system degradation into candidate-insufficiency copy.

## Outcome

One writer-scoped sequence namespace preserves ordered durable evidence, and
every completed interview reaches one truthful typed feedback outcome based on
the frozen trustworthy candidate evidence. Narrow healthy evidence receives
useful grounded narrative feedback without numerical scores.

## Boundaries

- Preserve event replay identity, writer-generation fencing, cutoffs,
  settlement, ordering, idempotency, deletion/ownership checks, and fail-closed
  corruption behavior.
- Preserve scored Feedback v2 and legacy reads; add a scoreless companion
  schema rather than weakening scoring requirements.
- Do not touch Production, provider, customer, launch, or billing state.
- SAV-397 closes this slice; SAV-365 remains the open reliability parent.
