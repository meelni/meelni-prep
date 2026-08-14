# Shadow Feedback Artifact Contract

## Authority boundary

`feedback.shadow-artifact.v1` is an additive, non-authoritative measurement
record. It cannot complete, replace, repair, or satisfy a `feedback` lifecycle
row. The storage table has no feedback foreign key and no authenticated policy;
existing feedback APIs, dashboards, progress, insights, billing, and customer
surfaces do not read it.

This contract does not schedule work or invoke an evaluator/provider. Final
batch feedback remains the sole customer and insight authority.

## Default-off write gate

The server-only `MEELNI_SHADOW_FEEDBACK_ARTIFACT_STORAGE` setting is disabled
when absent or blank. Only the exact value `enabled` mints an opaque in-memory
storage context. Unknown values fail closed. The service write entrypoint checks
that runtime-minted context before parsing an artifact or touching its
repository; exact-set reads require the same context and return invalid before
repository access when disabled or forged. A plain or forged `enabled: true`
object is rejected. The production gate accepts no environment override and
can mint a capability only from the current server process configuration.

No environment in this change is configured or activated. The variable is not
public and does not authorize provider execution.

## Exact artifact key

`feedback.shadow-artifact-key.v1` contains:

- session UUID;
- the SAV-441 `trusted-answer-block.v1` content fingerprint;
- rubric version;
- prompt version;
- selection-schema version; and
- model version.

Its `shadow-feedback-artifact-key.v1:<sha256>` fingerprint hashes the ordered
tuple above plus the key contract version. The database stores that fingerprint
as the primary key and independently enforces the full tuple as unique.
Reconnects, duplicate events, crash retries, and equivalent 1/2/5/10 transcript
segmentation therefore converge on one immutable row. Changing any tuple member
creates a different key; an old worker cannot replace the new tuple.

## Artifact value and bounds

The v1 value repeats the exact key and stores one terminal outcome:

- `completed`: round, derived mode, and per-dimension closed facet codes with an
  optional integer score from 0 through 10; or
- `failed`: one closed failure class from the evaluator budget taxonomy.

Metrics contain duration from 0 through 90,000 milliseconds and either a full
non-negative token tuple bounded at 10,000,000 per field or all-null usage.
Cached input cannot exceed input tokens, and total tokens must equal input plus
output tokens.
The completion timestamp is canonical ISO-8601. The canonical artifact must be
at most 64,000 UTF-8 bytes. Exact-key, artifact, outcome, dimension, metrics,
and version objects reject unknown fields and unknown contract versions.

Artifacts deliberately contain no transcript text, feedback prose, provider
payload, provider request ID, raw error, credential, room name, or billing
identifier. Facet codes and scores remain measurement data, not feedback.

## Persistence and reads

`shadow_feedback_artifact` is service-only with forced RLS. `PUBLIC`, `anon`,
and `authenticated` have no privileges; `service_role` may select, insert, and
delete but cannot update. A database trigger rejects updates even from a more
privileged caller. The composite owner/session foreign key prevents
cross-account attachment.

Inserts are append-only:

- first exact key and value: `inserted`;
- same exact key and canonical value: `duplicate`;
- same key with different value: `conflict`, never update.

Exact-set reads accept the currently expected keys, fetch only those key
fingerprints, and parse every row again, but only while the same runtime-minted
storage capability is enabled. Old version tuples are ignored as stale. An
unknown/malformed stored version or conflicting duplicate invalidates the whole
set and exposes no artifact. A `complete` set means only that every expected
shadow artifact succeeded; it grants no batch or customer authority.

## Privacy and retention

Account export schema `1.5.0` includes the user's strictly parsed artifacts.
Unknown versions fail the export closed rather than being serialized as a
trusted current shape. Account deletion explicitly removes shadow artifacts
before sessions, with owner/session cascade as defense in depth.

No automatic expiry is introduced. Artifacts follow their owning interview's
retention and account deletion contract until a separately accepted owner/legal
decision defines a shorter forward-only policy.

## Provider-free regression matrix

| Fixture                                   | Required result                                         |
| ----------------------------------------- | ------------------------------------------------------- |
| Storage setting absent/blank              | writes disabled, reads invalid; zero repository calls   |
| Unknown setting or forged context         | rejected/invalid; zero repository calls                 |
| Crash after insert before acknowledgement | retry returns `duplicate`; one row                      |
| Duplicate event delivery                  | same exact key returns `duplicate`; one row             |
| Reconnect                                 | same exact key returns `duplicate`; one row             |
| 1/2/5/10 equivalent segmentation          | identical trusted fingerprint and artifact key          |
| Rubric/prompt/schema/model change         | distinct exact key; old row cannot replace it           |
| Unknown artifact/key version              | exact read is `invalid`; no artifact escapes            |
| Account export                            | owner-only, strictly parsed content-minimized artifacts |
| Account deletion                          | artifacts removed before the session graph              |

Every fixture is synthetic and provider-free. This slice performs no live call,
provider configuration, paid comparison, Production mutation, deployment, or
default-on action.
