# Design

## Policy boundary

`packages/agent` exposes a provider-neutral rollout policy so routes and
provider adapters cannot redefine stage semantics. The policy resolves only
exact server flag values, maps them to a cohort, validates adapter/model pins,
and assesses transitions. It performs no I/O.

Forward promotion is adjacent. Every Preview and Production target requires an
authorization matching its stage, candidate Git SHA, and configuration digest.
Rollback uses each source stage's declared safe target. Influence revocation is
immediate at the next active-session admission. Other flags govern new session
construction; an in-flight shadow uses the reviewed settle/shutdown path.
Production shadow rolls directly to disabled/current Production behavior for
new sessions.

## Evidence boundary

The operations reader uses exact repository paths, rejects symlinks, and checks
every file SHA-256 before parsing. It then validates only the claims necessary
to prevent semantic broadening: provider-free/current baseline provenance,
owner adjudication scope, shadow-entry blocker, synthetic feedback fixture
counts/outcomes, and observability valid/invalid cases.

The generated report is deterministic and self-hashed. It distinguishes current
baseline/invariants from adaptive fixture expectations and from live evidence,
which remains absent. Any missing or changed evidence fails closed.

## Authorization split

The generated v2 owner packet is a null, pending template and is never
authority. A separate v1 approved record closes and validates the exact adapter,
provider, model, integer nano-USD/session limits, privacy/retention values,
first-audio p50/p95 and other bps/ms thresholds, non-tunable hard stops,
candidate/base-configuration bindings, external decision reference, and seven-
day maximum validity. Its selected-candidate digest is domain-separated over
the requested authority, stages, exact SHA, repository policy, and normalized
selection. Strict parsing rejects duplicate/unknown/missing keys and incoherent
or unsafe values, but deliberately does not claim to authenticate the human
behind the externally verified reference.

The approved record's positive authority is an immutable allow-list of
repository implementation/configuration and provider-free tests; its deny-list
preserves provider/spend/deploy/room/influence/Production/default-on/GO
boundaries. Rollout-stage and Production-action verifiers reject it.

After the adapter candidate is reviewed, SAV-476 requires a second packet bound
to that exact new SHA/config to run bounded Preview shadow. Later steps each
require their own owner authorization and accepted evidence. The all-round and
adverse-voice rehearsal matrix remains unbound/unperformed until that second
live authorization.

## Application boundary

No application or provider adapter is introduced. The Python runtime remains
`adapter=None`. All flags remain false and current Production behavior is
unchanged.
