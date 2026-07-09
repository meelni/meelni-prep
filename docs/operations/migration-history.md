# Migration History

## Relaunch reconciliation

The original Drizzle chain recorded only `0000_many_nocturne` and
`0001_panoramic_otto_octavius`. Three later SQL files existed in the migration
directory without journal entries and were applied operationally in forms that
did not match their repository SQL exactly:

| Retired file                        | SHA-256                                                            |
| ----------------------------------- | ------------------------------------------------------------------ |
| `0002_pricing_rls_policies.sql`     | `7528cbaf5d5901a0d8310b9c5a5dd4893173f57e5900d065c39d0bd5d4442f73` |
| `0003_credit_ledger.sql`            | `60cc5b4bf7bf8df9ba1ef5a3c99c011ada7f1d73fbd4010423bcbd1a2bbb71ba` |
| `0004_subscription_catalog_ids.sql` | `f8e8d8c02941d3f5a724ec353a3f2cde0aa4e952bcd42cf552bb306f27476707` |

They were removed from the executable directory rather than added to the
journal because replaying them against the manually evolved Supabase database
would fail on existing tables and policies. Git history preserves their exact
contents. `0002_relaunch_reconciliation` replaces them with one forward-only,
idempotent migration that supports both accepted starting states:

- an empty database after journaled migrations 0000 and 0001;
- the existing Supabase schema whose later objects were created manually or by
  schema push.

Do not restore or mark the retired files as applied. Run the migration preflight
and disposable-database verification before applying the reconciliation to an
environment.

The journaled `0003_durable_account_deletion`,
`0004_stripe_deletion_privacy`, and `0005_multi_subject_account_deletion` are
new relaunch migrations and are unrelated to the retired, unjournaled files
with overlapping numeric prefixes.
