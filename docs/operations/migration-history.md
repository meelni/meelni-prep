# Migration History

## Current committed journal

<!-- migration-journal:start -->

| Index | Journal tag                              |
| ----: | ---------------------------------------- |
|     0 | `0000_many_nocturne`                     |
|     1 | `0001_panoramic_otto_octavius`           |
|     2 | `0002_relaunch_reconciliation`           |
|     3 | `0003_durable_account_deletion`          |
|     4 | `0004_stripe_deletion_privacy`           |
|     5 | `0005_multi_subject_account_deletion`    |
|     6 | `0006_interview_session_lifecycle`       |
|     7 | `0007_atomic_session_completion`         |
|     8 | `0008_deadline_room_cleanup_ack`         |
|     9 | `0009_interview_session_reconnect`       |
|    10 | `0010_reconnect_cutoff_owner`            |
|    11 | `0011_transcript_ingest`                 |
|    12 | `0012_transcript_privacy_integrity`      |
|    13 | `0013_runtime_settlement`                |
|    14 | `0014_stable_start_usable_credit`        |
|    15 | `0015_provider_credit_recovery`          |
|    16 | `0016_billing_truth`                     |
|    17 | `0017_webhook_convergence`               |
|    18 | `0018_invoice_status_convergence`        |
|    19 | `0019_subscription_resource_convergence` |
|    20 | `0020_durable_livekit_deletion`          |
|    21 | `0021_feedback_v2`                       |
|    22 | `0022_server_owned_billing_privileges`   |
|    23 | `0023_explicit_analytics_consent`        |
|    24 | `0024_runtime_settlement_reconciliation` |
|    25 | `0025_public_demo_limits`                |
|    26 | `0026_preview_lineage_reconciliation`    |
|    27 | `0027_question_provenance`               |
|    28 | `0028_focused_practice_attempts`         |
|    29 | `0029_durable_contact_submission`        |
|    30 | `0030_transcript_committed_watermarks`   |
|    31 | `0031_sav_397_feedback_outcomes`         |
|    32 | `0032_dimension_evidence_coverage`       |
|    33 | `0033_scoreless_focused_practice`        |

<!-- migration-journal:end -->

This thirty-four-entry inventory is generated from the same ordered contract as
`lib/db/migrations/meta/_journal.json`; the operations test fails if either the
count, order, or tag changes without this section being updated.

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

The standalone Supabase helpers `apply_all_rls.sql` and
`feedback_system_rls.sql` are also retired. They predated the reconciled
Drizzle journal and could grant authenticated users direct `transcript_turn`
inserts, bypassing the signed runtime ingest boundary. Git history preserves
them for audit purposes; no doctor, runbook, rollback, or deployment path may
execute or restore them.

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

## Transcript ingest identity and ordering

`0011_transcript_ingest` adds the canonical version-2 transcript identity,
writer sequence, measured timing, section, and delivery-state fields. The
canonical tuple is all-or-nothing, event IDs are globally unique, and
`(session_id, writer_id, sequence)` prevents a writer from assigning one
sequence to multiple events. Historical transcript rows remain readable with
all canonical fields null.

Transcript insertion and terminalization serialize through the interview
session row so feedback eligibility is calculated from one durable transcript
snapshot and new distinct turns cannot race a terminal claim. Rehearse clean,
legacy-upgrade, idempotent replay, exact lock-interleaving, and post-claim
rejection paths with `npm run test:database-migrations` before applying the
migration remotely.

## Transcript privacy integrity

`0012_transcript_privacy_integrity` adds the service-only
`transcript_interruption_marker` table. The table contains no transcript text;
it records a provider-confirmed interruption whose heard prefix was unavailable
or a committed turn whose canonical measurement failed. RLS and ACLs deny
browser roles. A marker makes feedback ineligible so incomplete evidence
cannot be scored as complete.

## Runtime settlement

`0013_runtime_settlement` adds the service-only
`transcript_runtime_writer` registry and writer-scoped
`transcript_runtime_settlement` table. Audible runtimes register before output
and receive a positive generation; replacement writers are fenced by later
generations without erasing earlier settlement obligations. The migration adds
`writer_generation` to canonical turns and interruption markers, backfills
legacy version-2 writer evidence deterministically, and binds turns, markers,
and settlements to `(session_id, generation, writer_id)` through composite
foreign keys.

Terminal feedback eligibility requires a trusted metadata-only `settled`
watermark for every registered writer generation and no integrity markers.
Missing or degraded settlement fails closed. Both writer and settlement tables
enable RLS, revoke browser roles, and grant access only to `service_role`.

## Stable interview start and usable credit

`0014_stable_start_usable_credit` adds durable start-attempt identity,
request-fingerprint fencing, provider-provisioning state, and immutable usable
interview evidence to the existing session, question, and credit-reservation
records. A version-1 start uses one deterministic attempt ID across those
records and the LiveKit room name, so retries converge on the same interview
instead of creating duplicate reservations or rooms.

The migration distinguishes a provider-ready interview from one that became
usable. Credit settlement can consume a reservation only after the session has
both activation evidence and its first accepted candidate transcript event;
otherwise terminal recovery releases the reservation. Database checks, unique
indexes, foreign keys, and an immutability trigger prevent identity drift or
later rewriting of provisioning and usable evidence.

## Provider credit recovery

`0015_provider_credit_recovery` adds immutable billing-fault classification,
provider-failure identity, and terminal credit-settlement evidence to version-1
interview sessions. Provider and transcript-integrity failures after usable
signal can issue one idempotent make-good grant, pre-usable terminal outcomes
release the reservation, and user-owned outcomes after usable signal retain the
consumed credit.

Database constraints bind each settlement action to its allowed fault and
reason, while a service-only trigger prevents later rewriting of fault,
provider-event, or settlement evidence. A unique runtime-failure event index
and deterministic settlement keys make retries converge without duplicate
credit changes.

## Billing and webhook convergence

`0016_billing_truth` adds durable payment-adjustment, payment-state, and
rollover-lot evidence so refunds and disputes reconcile to the exact paid
credit source without clawing back unrelated credits.

`0017_webhook_convergence` adds a nullable unique logical transition key so
distinct Stripe Event deliveries for the same immutable provider transition
replay one idempotent handler result.

`0018_invoice_status_convergence` deduplicates invoice-status history,
persists complete deletion-subject fingerprints, and adds deterministic
same-second subscription event ordering.

`0019_subscription_resource_convergence` persists subscription-resource
creation proof and retired resource identities so delayed events cannot
resurrect a superseded subscription generation.

## Durable LiveKit account-deletion cleanup

`0020_durable_livekit_deletion` stores the normalized LiveKit room cleanup
targets on the durable account-deletion request. Account deletion can therefore
immediately fence access while provider cleanup remains retryable and
idempotent across process restarts.

## Feedback v2 evidence contract

`0021_feedback_v2` additively versions generated feedback with the schema,
prompt, model, rubric, and evaluation-state tuple required by the grounded
feedback contract. Existing legacy rows remain readable with a fully absent v2
tuple; new v2 rows must store the complete internally consistent tuple. The
migration does not rewrite historical feedback or infer evidence that was not
previously persisted.

## Server-owned billing privileges

`0022_server_owned_billing_privileges` removes all browser-role table grants
from the four billing provenance tables while retaining the complete
`service_role` privilege set. Billing state remains server-owned even when RLS
policies change later.

## Explicit analytics consent

`0023_explicit_analytics_consent` adds the versioned tri-state analytics consent
record. Existing users remain undecided, which fails closed; the migration does
not opt anyone into browser analytics.

## Runtime-settlement forward reconciliation

`0024_runtime_settlement_reconciliation` recognizes only the exact canonical
runtime-settlement shape or the exact historical Preview-only shape recorded by
the legacy `0013_runtime_settlement` hash. It never rewrites the Drizzle ledger.
The historical path is allowed only when settlement rows, canonical version-2
turns, and interruption markers are all empty. It then recreates the canonical
writer-generation contract while preserving generic historical transcript
rows. Any mixed, nonempty, or unknown shape aborts atomically.

## Public voice preview limits

Migration `0025_public_demo_limits` adds the shared Postgres authority for the
anonymous two-minute voice preview. It stores only HMAC-derived IP/device
identifiers, serializes global, IP, device, and signed-session admission, and
reserves the single recovery token before signing. Identifier rows are created
only for accepted reservations, so denied traffic cannot manufacture unbounded
limiter rows. The service role is the only table/function caller, and expired
pseudonymous data is eligible for pruning after 48 hours.

## Preview-lineage forward reconciliation

Migration `0026_preview_lineage_reconciliation` preserves the three original
Preview ledger rows for 0023–0025 and accepts only that exact historical triple
or the exact reviewed canonical triple. It rejects mixed hashes and unexpected
schema shapes before mutation, adds and backfills the analytics-consent
revision when needed, normalizes runtime-transcript table ownership, and
replaces the public-demo functions with the exact persisted-deadline and
five-second delivery-margin contract. Existing public-demo deadlines are only
shortened to the canonical two-minute bound. The migration never updates or
deletes migration history. It blocks until every old `provisioning` or `ready`
public-demo deadline has passed, because a database update cannot revoke an
already-issued three-minute LiveKit token.

## Question provenance, focused practice, and durable contact

Migration `0027_question_provenance` adds canonical source and verification
evidence for question-bank records. Migration `0028_focused_practice_attempts`
adds the deterministic focused-practice attempt contract on the exact stacked
parent lineage.

Migration `0029_durable_contact_submission` adds durable contact requests,
idempotent receipts, HMAC-only rate-limit state, account-linked privacy
behavior, and append-only access auditing. It creates the hardened
`meelni_contact_triage` `NOLOGIN` capability group. Only individually named
PostgreSQL login roles approved by database operations may receive membership
and use `SET LOCAL ROLE`; Supabase `service_role`, PostgREST `authenticator`,
and browser roles cannot execute PII triage functions. Runtime limiter and
bounded cleanup execution remain separately scoped to `service_role`, which
has no direct contact-table privileges. Preview and Production validation also
require the dedicated contact HMAC secret before a deployment may proceed.

## Committed transcript watermarks

Migration `0030_transcript_committed_watermarks` adds an observed and contiguous
committed sequence boundary to each registered runtime writer, backfills those
boundaries from canonical turns and interruption markers, and marks ambiguous
or marker-bearing histories degraded. It also adds the service-owned immutable
per-writer cutoff table and terminal session evidence fields. Terminalization
can therefore freeze the exact database-proven prefix used by feedback without
making availability depend on a final LiveKit round trip. Legacy terminal rows
remain readable through the bounded compatibility path; rollback leaves the
additive evidence fields and table unused rather than deleting customer data.

## Evidence-gated feedback outcomes

Migration `0031_sav_397_feedback_outcomes` adds the closed content-free
`feedback.outcome_reason` taxonomy, backfills existing terminal and failed
rows conservatively from feedback and frozen session state, and admits the
strict scoreless `feedback.evidence-limited.v2` version tuple only with
`evaluation_state = partial`, alongside scored Feedback v2's contracted
`full` and `partial` states. The migration does not enqueue work, rerun
evaluation, or change
session, billing, provider, or customer state beyond this additive durable
classification.

## Round-specific dimension evidence coverage

Migration `0032_dimension_evidence_coverage` additively stores the closed
feedback mode, canonical PM round, and server-derived per-dimension evidence
coverage for `feedback.dimension-coverage.v1`. It admits only the exact v3
schema, prompt, and rubric tuple while requiring legacy, scored v2, and
evidence-limited v2 rows to keep the new fields null. Existing completed rows
are not rewritten, rescored, or backfilled.

## Scoreless focused practice

Migration `0033_scoreless_focused_practice` additively admits the strict v2
focused-practice attempt, plan, and template tuple for partial scorecards and
coaching reviews. It preserves v1 rows and lifecycle behavior, fences each
owner/source review to one attempt across contract versions, and requires the
v2 immutable source fingerprint and closed grounded-focus snapshot. The
migration does not create attempts, rewrite feedback or transcript evidence,
or invoke any provider.
