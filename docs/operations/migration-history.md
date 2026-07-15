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

## Canonical interview lifecycle

`0006_interview_session_lifecycle` additively introduces the canonical session
state, optimistic-concurrency version, terminal reason, and transition
timestamps while retaining the legacy `status` column as a compatibility
projection. Its backfill preserves only facts the historical row can prove:
generic completed, abandoned, and error outcomes use `legacy_unknown`; only
legacy `too_short` proves `insufficient_signal`. It never fabricates an
activation timestamp or a user/provider cause. An `in_progress` row with only
`ended_at` is treated as an ambiguous interrupted write and becomes
`abandoned/legacy_unknown`, not a successful completion.

The migration is a launch prerequisite for SAV-187 and its dependent runtime
reliability slices. Rehearse both the clean chain and the six-migration upgrade
path with `npm run test:database-migrations` before applying it remotely.

## Atomic session completion

`0007_atomic_session_completion` adds immutable completion evidence and a
durable feedback-dispatch outbox to the unique feedback row. Existing rows are
conservatively marked `not_required`; the migration never enqueues historical
feedback. New eligible completions store one deterministic event identity,
dispatch lease state, attempt fencing, and redacted recovery metadata in the
same transaction as terminalization.

The migration adds database checks for tier values, dispatch identity,
nonnegative attempts, active claims, and sent acknowledgements. See the
[session completion runbook](./interview-session-completion.md) for Preview
rehearsal and recovery.

## Deadline room cleanup acknowledgement

`0008_deadline_room_cleanup_ack` adds durable room-cleanup ownership and
acknowledgement state for server-enforced interview deadlines. It records the
cleanup status and acknowledgement time independently from terminal reason,
backfills existing explicit `time_limit` outcomes to `pending`, and indexes the
recovery selector used to find cleanup work after exact-event retries are
exhausted.

Database constraints keep pending and acknowledged states consistent: pending
cleanup has no acknowledgement timestamp, while `deleted` and
`already_absent` require one. Application code must not expose or dispatch
feedback until a deadline-owned cleanup claim is acknowledged. See the
[deadline operations runbook](./interview-session-deadline.md) for failure,
recovery, and rollback behavior.

## Interview session reconnect recovery

`0009_interview_session_reconnect` adds the durable reconnect deadline,
provider-cleanup and provisioning recovery claims, readiness and presence
reconciliation timestamps, and last accepted transport-event identity. Its
indexes support reconnect expiry, presence repair, room cleanup, and stale
provisioning recovery without scanning unrelated sessions. The provisioning
constraint requires the pending claim and its lease timestamp to move together.

## Reconnect cutoff ownership

`0010_reconnect_cutoff_owner` records whether each persisted reconnect cutoff
is owned by reconnect grace or by the immutable hard interview deadline. The
backfill derives ownership from the stored start time and canonical configured
duration, using the 30-minute default for missing or legacy duration shapes.
The database constraint requires every cutoff to have one valid owner and
forbids an owner when no cutoff exists. Application authorization and recovery
use PostgreSQL time and treat equality with the stored cutoff as expired.

See the [reconnect operations runbook](./interview-session-reconnect.md) for
provider recovery, exact-boundary verification, and rollback behavior.
