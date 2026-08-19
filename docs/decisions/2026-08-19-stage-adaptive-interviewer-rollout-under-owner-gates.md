# Stage Adaptive Interviewer Rollout Under Owner Gates

Date: 2026-08-19
Status: accepted repository boundary
Issues: SAV-477 repository packet; SAV-476 human rollout gate
Decision owners: repository policy is implemented here; adapter selection,
provider/spend, Preview, Production, default-on, and launch remain human-owned.
Repository merge is governed by independent exact-head review, branch
protection, terminal CI, and supervisor authorization.

## Context

SAV-471 through SAV-475 created default-off controller, tool, Director shadow,
influence, and observability boundaries. They did not add a Director provider
adapter or live evidence. SAV-467 established a current-runtime provider-free
baseline and accepted semantic gold set, not an adaptive quality improvement.

A simple sequential rollout list is insufficient for operations: reversing
from Production shadow to the preceding list item would enter Preview influence
and re-enable an unsafe mode. A first owner request also cannot claim to run
Preview shadow while forbidding the adapter implementation needed to prepare a
reviewable candidate.

A request listing only selection names is also insufficient: two different
adapter, limit, privacy, or threshold choices would otherwise share the same
generic repository digest and appear equally authorized.

## Decision

Adopt seven explicit stages with adjacent-only forward promotion and
stage-specific operational rollback. Every Preview and Production forward step
requires a separate owner authorization bound to the exact candidate SHA,
configuration digest, and target stage. Rollback follows an explicit safe
target; it is never calculated as the preceding stage.

Keep the current system at `synthetic`, all flags off, and `adapter=None`. Freeze
a readiness report over exact repository digests and label each claim by its
real artifact. Missing or drifted evidence fails closed. The system recommendation
remains `hold_at_synthetic`, and the owner decision remains `pending`.

Split the Preview work into two owner gates. The generated v2 first-gate packet
is a null pending template, not authority. A distinct v1 approved record may
authorize `prepare_isolated_preview_shadow_candidate_only`, allowing repository
implementation/configuration of the selected adapter candidate and provider-
free validation. It is a closed value-bearing selection with integer nano-USD,
basis-point, and millisecond units; explicit p50/p95, privacy/retention, fixed
hard stops, coherent thresholds, exact external decision reference, and no more
than seven days of validity. Its domain-separated digest binds authority,
stages, candidate SHA, repository configuration, and every normalized selected
value. Strict parsing proves those bindings but does not authenticate the
human; the external decision reference remains supervisor/human-verified.

The first gate permits no provider call/spend, deployment, live room,
influence, Production/default-on, or GO/NO-GO, and rollout/Production verifiers
reject it. After review and merge, SAV-476 requires a second exact-SHA/config
authorization plus the still-unbound all-round/adverse-voice rehearsal matrix
to deploy and run a bounded isolated Preview shadow rehearsal.

## Consequences

- Repository work can prepare a selected adapter without accidentally granting
  live authority.
- Preview shadow, Preview influence, and every Production step retain distinct
  human decisions.
- Influence is revoked immediately at the next active-session admission.
  Construction-time flag rollback keeps new sessions safe; in-flight shadow
  work requires the reviewed settle/shutdown path and rehearsal.
- Production shadow restores current Production behavior for new sessions
  rather than crossing into Preview.
- Synthetic invariants, fixture expectations, and wire cases cannot be
  represented as live adaptive quality, feedback, or observability evidence.
- Numeric live thresholds and privacy/retention choices remain pending until
  the owner explicitly records a coherent closed selection; agents do not
  invent a launch bar.

## Rejected alternatives

### One authorization for the whole rollout

Rejected because it cannot bind later code/config changes and would collapse
Preview, Production, default-on, and GO/NO-GO authority.

### Reverse the progression list during rollback

Rejected because `production_shadow` would fall into `preview_influence`, cross
environments, and re-enable candidate-facing influence.

### Treat synthetic invariant evidence as adaptive improvement

Rejected because no provider-backed adaptive comparison or live rehearsal has
been run.
