# SAV-230 Provider Credit Recovery Plan

Status: locally verified. Preview and Production remain out of scope until
SAV-226 provides an isolated Preview database.

## Outcome

An interview that fails because of the voice provider or transcript integrity
returns the candidate's credit exactly once. User-driven outcomes after the
interview became usable remain charged. Support can inspect the versioned fault,
action, reason, and make-good evidence without reading raw provider errors.

## Slice Gate

- Primary slice: interview session runtime and credit settlement.
- Workflow owners: provider-neutral runtime failure ingestion and interview
  credit convergence.
- In scope: runtime event contract/ingest, terminal billing classification,
  release/refund/retain policy, expired-source make-good, bounded recovery,
  PostgreSQL concurrency evidence, contracts and runbooks.
- Out of scope: pricing changes, Stripe catalog/webhooks, user-facing refund UI,
  Preview/Production migration or LiveKit Cloud deployment.
- Provider dependency: the Python LiveKit worker emits a provider-neutral,
  signed event through the existing internal ingest boundary. Core policy does
  not depend on LiveKit-specific status names.
- Data change: additive version-1 session evidence and indexes/checks.
- Rollback: keep the relaunch flag default-off; revert application writers
  before removing additive columns. No destructive migration is included.

## Policy

1. A terminal version-1 session with an active reservation releases it.
2. A consumed session with provider or transcript-integrity fault refunds it.
3. A consumed session with a user fault retains the charge.
4. Feedback dispatch or generation state never changes billing policy.
5. If a refund's allocated source grant is already expired, the source remains
   consumed and a non-expiring, idempotent make-good grant replaces the credit.
6. Settlement action and support evidence commit in the same user-serialized
   transaction under `app_user -> interview_session -> reservation -> grants`.

## Implementation

1. Add the policy classifier and versioned machine-readable evidence contract.
2. Extend the stable session schema and additive migration with fault, runtime
   failure, settlement, and make-good evidence plus database constraints.
3. Extend reservation settlement for refund/make-good and update convergence to
   record release/refund/retain evidence atomically.
4. Add signed provider-neutral `provider_failed` ingest and Python emission at
   runtime failure boundaries.
5. Add a bounded five-minute recovery scan for terminal missing settlement and
   expired active or consumed reservations.
6. Add unit, route, runtime, and real PostgreSQL concurrency/retry tests.
7. Update contracts, operations, preflight, and Linear evidence; open a stacked
   draft PR without touching shared Preview/Production state.

## Required Evidence

- Runtime contract accepts canonical provider failures and rejects malformed or
  provider-specific payload leakage.
- Pre-usable provider failure releases once.
- Post-usable provider/integrity failure refunds once.
- User end, time limit, disconnect/abandonment after usable retain.
- Feedback failure does not refund.
- Ten concurrent settlement attempts create one terminal ledger action and one
  immutable policy result.
- Expired source creates one make-good across retries.
- Recovery is capped, ordered, idempotent, and leaves no eligible stale row.
- `typecheck`, test typecheck, lint, workflows, billing, API, Python, migration
  verification, `check:ci`, `verify:agent`, and production build pass locally.
