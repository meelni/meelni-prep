# Contact Submission Operations

Status: local implementation and rehearsal only; no Preview/Production mutation performed

## Before rollout

1. Keep the relaunch/contact exposure gate unchanged.
2. Have Product/Legal accept a contact-content retention and deletion policy. SAV-182 does not invent one.
3. Generate an independent, server-only `CONTACT_RATE_LIMIT_HMAC_SECRET` satisfying the shared server-secret contract in each Preview and Production environment. Do not reuse a provider key or expose it through `NEXT_PUBLIC_*`. Scoped env refresh, generic environment validation, and deployment preflight all fail closed when it is absent, quoted-empty, placeholder-like, or weak.
4. Confirm Vercel is the direct trusted edge. Vercel documents `x-vercel-forwarded-for` as equivalent to its overwritten, spoofing-resistant `x-forwarded-for`; a non-Vercel production request fails closed. See [Vercel request headers](https://vercel.com/docs/headers/request-headers).
5. Approve and verify a trusted-edge WAF/bot-control rule for distributed abuse. The database attempt budget covers every request but is not a botnet defense.
6. Apply the migration only through the guarded database workflow after backup/preflight/rehearsal. Do not use `db:push`.
7. Verify the registered hourly Inngest cleanup runs and alert when it reports `backlogLikely: true`.
8. Assign a support owner and test the audited queue/read/claim/resolve procedure below.
9. Preserve direct email fallbacks until target-environment storage, triage, cleanup, and monitoring evidence is accepted.

Linked contact acceptance and account deletion share the account-identity/application-user lock order. Do not remove that serialization or replace the deletion-tombstone check with an email comparison: concurrent deletion must either remove a contact row that committed first or prevent a later linked insert.

## Migration lineage

The complete contact schema is canonical migration
`0029_durable_contact_submission`, generated from PR #366 exact head
`62e632c8c386dee4790957215a0121f0a6d59893` after its migration 0028. Apply
0029 only after that exact parent lineage is present. Do not reuse the parked
PR #279 migration artifacts or hand-merge journals and snapshots.

## Least-privilege triage

Use an approved, individually attributable PostgreSQL `LOGIN` role with command history and session recording disabled. Never run these reads in CI, paste results into Linear, or redirect output to files. Shared database credentials do not satisfy the audit requirement.

Migration 0029 creates only the hardened `meelni_contact_triage` group role. It is `NOLOGIN`, `NOINHERIT`, non-superuser, non-role-creating, non-database-creating, non-replicating, and non-`BYPASSRLS`. It has schema usage and execute on the three triage functions, with no direct contact-table privilege. A database administrator must provision each approved human as a distinct login and grant group membership; credentials remain outside SQL history and repository files:

```sql
CREATE ROLE meelni_contact_operator_alice
  LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOREPLICATION NOBYPASSRLS;
GRANT meelni_contact_triage TO meelni_contact_operator_alice;
```

Authenticate the PostgreSQL connection directly as that named operator. Then enter the capability explicitly for one transaction:

```sql
BEGIN;
SET LOCAL ROLE meelni_contact_triage;
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

Queue listing is PII-free. Exact-receipt read writes an append-only audit row. Claim and resolve each write an audit row. PostgreSQL derives a pseudonymous audit fingerprint from the connection-time `session_user`; `SET LOCAL ROLE` changes `current_user` to the capability group while preserving the named operator as `session_user`. Callers cannot self-assert the audit identity, and the operator roster remains outside customer-data logs.

Supabase/PostgREST is deliberately not the contact-PII triage path. `service_role`, `authenticator`, `anon`, and `authenticated` cannot execute list/read/set-triage functions. Do not use a Supabase service key, Data API RPC, database-owner session, CI credential, or shared dashboard connection for ordinary triage.

Triage is monotonic and retry-safe: `new` may become `claimed` or `resolved`,
`claimed` may become `resolved`, same-state retries succeed without another
audit row, and `resolved` cannot return to `claimed`. A missing receipt returns
false; an invalid or regressive transition fails closed.

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
- If triage or cleanup is unavailable, keep the product gate paused and use direct email; restore the named-login/group-role path before relying on the form. Do not temporarily re-grant PII triage to `service_role`.
- A rollback does not drop `meelni_contact_triage`, remove operator memberships, or broaden function grants. Offboard an operator with `REVOKE meelni_contact_triage FROM <named_login>` and disable that login through the approved database-access process.
- A future email-delivery adapter must use a separate durable outbox and delivery state. It cannot reinterpret `stored` as `delivered`.
