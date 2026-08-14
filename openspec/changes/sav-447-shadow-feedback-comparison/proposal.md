# SAV-447 shadow feedback comparison

## Why

The accepted interview-to-feedback program needs provider-free evidence that
trusted closed-block evaluations can replay safely and disagree harmlessly
with final batch feedback. The merged contracts do not authorize evaluation
before the canonical transcript ledger is terminally frozen.

## What changes

- Add strict content-free scheduling-intent and comparison-report contracts.
- Add an independent opaque default-off execution capability, required
  together with the SAV-445 storage capability.
- Add provider-neutral scheduling, evaluation, and comparison workflow seams
  using SAV-441 authority, SAV-444 budgets, and SAV-445 exact-key artifacts.
- Register bounded Inngest functions without a live provider adapter.
- Add synthetic segmentation, replay, crash, reconnect, failure, privacy, and
  authority-isolation fixtures.

## Non-goals

- Pre-freeze or during-interview answer-block authority.
- Live model/provider calls, configuration, spend, or activation.
- Customer feedback, UI, insights, progress, billing, or interview mutation.
- Database migration, Production action, deployment, launch, or merge.
