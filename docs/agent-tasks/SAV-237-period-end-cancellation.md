# SAV-237 — Period-End Subscription Cancellation

## Intent

- Outcome: one cancellation policy across UI, API, Stripe, credits, and account
  deletion.
- Primary slice: billing, subscriptions, and entitlements.
- Workflow owner: the billing cancellation API; account deletion consumes the
  same no-automatic-refund policy.

## Scope

- In: retire immediate cancellation, keep access/credits through period end,
  preserve reactivation, block overlapping subscription Checkout, bind invoice
  entitlement to monotonic current-resource ordering, use authoritative DB-time
  read snapshots, apply immediate account-mutation backpressure, recover expired
  Checkout attempts safely, remove automatic account-deletion refunds, tests and
  durable policy docs, capture every known historical Stripe subscription, and
  terminate captured in-flight LiveKit rooms through retryable cleanup. Fence
  provider-created rooms again before returning credentials so deletion cannot
  win between session persistence and LiveKit creation.
- Out: manual support refunds, Stripe credential changes, catalog changes, and
  Production/test-mode provider mutations.
- Provider dependency: Stripe test-mode rehearsal after code review.
- Accepted deletion exception: durable irreversible deletion intent immediately
  ends product access and credit redemption; captured subscriptions are canceled
  without proration, refund, or customer-balance compensation. Ordinary
  cancellation remains period-end.
- Technical gate: SAV-231 must provide verified payment-to-credit-ledger
  reconciliation before a human-approved exceptional refund can be executed
  for an existing account.

## Validation

- Targeted cancellation API and account-deletion workflow tests.
- `npm run test:api`, `npm run test:workflows`, `npm run check:ci`, and
  `npm run build`.
- Stripe test-mode cancellation/reactivation evidence before launch.
- Source-aware entitlement boundary tests at, before, and after period end plus
  delayed/same-second webhook permutations.
- Deletion tests proving tombstone-time access denial, retry-stable
  `prorate=false` cancellation, deterministic multi-customer/multi-subscription
  capture, in-flight room termination, post-create token withholding, cleanup
  generation fencing, monotonic duplicate deletion subject merging,
  provisioning-subject retention across a pre-create 404, combined fence/delete
  failure containment, bounded database-clock provisioning leases with
  expiry-aware durable retry, provider-start reconciliation and provider-error
  redaction, terminal-session room capture, legacy null-expiry upgrade, late
  ambiguous-room containment, and absence of automatic refund operations.

## Rollout

- Risk: high billing trust impact; relaunch remains default-off.
- Rollback: revert the code change without enabling immediate refunds; use the
  Customer Portal/manual support path while investigating.

## Verification Evidence

- Node 22.22: `npm run check:ci` passed, including Semgrep with 0 findings.
- Node 22.22: `npm run build` passed with the public-surface manifest check.
- Disposable local PostgreSQL: `npm run db:check` and
  `npm run test:database-migrations` passed for clean and upgrade paths.
- Targeted API 78/78, billing 114/114, integration 15/15, and workflow
  173/173 suites passed.
- No Stripe, LiveKit, Supabase Production, or other provider mutation was made;
  the documented test-mode/live-mode rehearsals remain human rollout gates.
