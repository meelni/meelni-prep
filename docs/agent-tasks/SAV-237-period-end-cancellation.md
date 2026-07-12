# SAV-237 — Period-End Subscription Cancellation

## Intent

- Outcome: one cancellation policy across UI, API, Stripe, credits, and account
  deletion.
- Primary slice: billing, subscriptions, and entitlements.
- Workflow owner: the billing cancellation API; account deletion consumes the
  same no-automatic-refund policy.

## Scope

- In: retire immediate cancellation, keep access/credits through period end,
  preserve reactivation, remove automatic account-deletion refunds, tests and
  durable policy docs.
- Out: manual support refunds, Stripe credential changes, catalog changes,
  migrations, and Production/test-mode provider mutations.
- Provider dependency: Stripe test-mode rehearsal after code review.

## Validation

- Targeted cancellation API and account-deletion workflow tests.
- `npm run test:api`, `npm run test:workflows`, `npm run check:ci`, and
  `npm run build`.
- Stripe test-mode cancellation/reactivation evidence before launch.

## Rollout

- Risk: high billing trust impact; relaunch remains default-off.
- Rollback: revert the code change without enabling immediate refunds; use the
  Customer Portal/manual support path while investigating.
