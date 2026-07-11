# Contact Submission Operations

Status: local implementation and rehearsal only; no Preview/Production mutation performed

## Before rollout

1. Keep the relaunch/contact exposure gate unchanged.
2. Have Product/Legal accept a contact-content retention and deletion policy. SAV-182 does not invent one.
3. Generate an independent, server-only `CONTACT_RATE_LIMIT_HMAC_SECRET` of at least 32 characters in each target environment. Do not reuse a provider key or expose it through `NEXT_PUBLIC_*`.
4. Confirm Vercel is the direct trusted edge. Vercel documents `x-vercel-forwarded-for` as equivalent to its overwritten, spoofing-resistant `x-forwarded-for`; a non-Vercel production request fails closed. See [Vercel request headers](https://vercel.com/docs/headers/request-headers).
5. Approve and verify a trusted-edge WAF/bot-control rule for distributed abuse. The database attempt budget covers every request but is not a botnet defense.
6. Apply the migration only through the guarded database workflow after backup/preflight/rehearsal. Do not use `db:push`.
7. Verify the registered hourly Inngest cleanup runs and alert when it reports `backlogLikely: true`.
8. Assign a support owner and test the audited queue/read/claim/resolve procedure below.
9. Preserve direct email fallbacks until target-environment storage, triage, cleanup, and monitoring evidence is accepted.

Linked contact acceptance and account deletion share the account-identity/application-user lock order. Do not remove that serialization or replace the deletion-tombstone check with an email comparison: concurrent deletion must either remove a contact row that committed first or prevent a later linked insert.

## Migration convergence

This independent branch currently carries one complete contact migration as `0008_durable_contact_submission` because it was generated from its reviewed parent. Other open migration stacks also occupy that number and later numbers. Final convergence must regenerate this single contact migration as the next number from the final canonical parent, with a fresh snapshot and schema fingerprint. Do not hand-merge journals or snapshots, predict the final number before the preceding stacks land, or treat this branch's current numeric order as final.

## Least-privilege triage

Use an approved, individually attributable database login with command history and session recording disabled. Never run these reads in CI, paste results into Linear, or redirect output to files. Shared database credentials do not satisfy the audit requirement.

```sql
BEGIN;
SET LOCAL ROLE service_role;
SELECT * FROM public.list_contact_submissions(50);
SELECT * FROM public.read_contact_submission(
  'receipt-uuid-here'::uuid
);
SELECT public.set_contact_submission_triage_state(
  'receipt-uuid-here'::uuid,
  'claimed'
);
SELECT public.set_contact_submission_triage_state(
  'receipt-uuid-here'::uuid,
  'resolved'
);
COMMIT;
```

Queue listing is PII-free. Exact-receipt read writes an append-only audit row. Claim and resolve each write an audit row. PostgreSQL derives a pseudonymous audit fingerprint from the authenticated `session_user`; callers cannot self-assert it, and the operator roster remains outside customer-data logs. The service role has execute access to these functions but no direct select/update access to contact or audit tables. Do not use database-owner access for ordinary triage.

## Limiter cleanup

Limiter fingerprints are short-lived operational security state. The registered Inngest function runs at minute 17 each hour, processes at most four 5,000-row batches, and reports only `deleted`, `batches`, and `backlogLikely`. If recovery is needed, an operator may run one bounded batch:

```sql
BEGIN;
SET LOCAL ROLE service_role;
SELECT public.cleanup_contact_submission_rate_limits(5000) AS deleted;
COMMIT;
```

The function uses the indexed window timestamp, deletes only windows older than 24 hours, locks with `SKIP LOCKED`, and never scans or deletes contact content.

## Monitoring

Monitor counts and latency only: API outcomes by fixed code; database transaction latency/error count; PII-free queue size/oldest-new timestamp; cleanup deleted-count; limiter row count; and audit count by access type. Do not emit receipts, names, emails, subjects, messages, raw addresses, SQL parameters, or returned rows into operational logs.

## Recovery and rollback

- On 503 or missing trusted identity/secret, the UI preserves the form and directs the visitor to direct email. Do not convert the error to success.
- Application rollback leaves additive rows and audit evidence in place. Do not drop or rewrite stored requests during an incident.
- If triage or cleanup is unavailable, keep the product gate paused and use direct email; restore the functions before relying on the form.
- A future email-delivery adapter must use a separate durable outbox and delivery state. It cannot reinterpret `stored` as `delivered`.
