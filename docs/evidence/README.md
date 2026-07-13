# Engineering Evidence

This directory contains reproducible, machine-readable evidence generated from
non-secret repository inputs. Reports must not contain customer data, provider
credentials, recordings, or real transcripts.

Live calibration reports additionally exclude prompt and transcript text and
record only sanitized case-level diagnostics plus aggregate call/cost
accounting. Spend authorization does not satisfy the separately required PM or
product-owner adjudication approval.

`sav-248-paid-run-authorization.json` records the fresh, explicit product-owner
spend boundary for one distinct aggregate v2 paid run: at most 96 provider
calls/physical attempts and $3, using synthetic or separately approved fixtures
only. It is code-bound authorization evidence, not a reusable per-process
budget, a live run result, or semantic approval of the gold-set candidates. Its
one-time spend authority is the deterministic genesis and protected
payload-free activation ref in the canonical GitHub repository described in the
calibration contract. Local remotes, reports, and caches are never budget
authority.

`sav-248-strict-format-plan-acceptance.json` records the exact v2 plan: 96
calls, 2,853,997,500 nano-USD ($2.8539975) deterministic worst case, plan hash
`354bdc4046b0759e50940127c574abe355ee0754d9a8aaf2c25338b49aca8419`,
strict-format hash and serialized-schema identities, and a 1,800-token output
ceiling. It performs no provider call or ledger activation and grants no launch
authority.

`sav-198-paid-run-authorization.json` and
`sav-198-rebased-plan-acceptance.json` record the product owner's prior,
conservative acceptance of the exact rebased plan within that existing
authorization: 96 calls, 2,754,487,500 nano-USD ($2.7544875) deterministic
worst case, and plan hash
`22a0f4da11a7dd5c618f39fdd187b40fe8d17807b0404407c95c5dec16172804`.
That v1 authority is consumed immutable history. It cannot authorize the v2
run and is not silently rebased.

SAV-198 includes a calibration preflight and deterministic harness report. Both
are local evidence only and deliberately keep live-provider launch acceptance
pending.

`sav-198-evaluation-calibration-live.json` records the single authorized live
attempt. The protected ledger activated once, the first synthetic case stopped
on a sanitized provider/evaluation failure, and the run reconciled one physical
attempt at $0.015545 with no cap breach. The report is a launch NO-GO: unused
calls are not reusable, and another paid attempt requires a separately reviewed
fix and new explicit authorization.

`sav-248-provider-free-mitigation.md` records the strict structured-output
contract, sanitized terminal categories, deterministic schema hash, exact
schema byte ceilings, and a provider-free 96-call/$2.8539975 prospective
calculation. The fresh v2 authorization and accepted plan now bind those values;
execution remains closed until the distinct v2 protected ledger authority is
provisioned. The mitigation work performed no provider call and grants no
provider or launch acceptance.

`sav-226-relaunch-decision.md` is the human-readable release record for the
exact relaunch candidate. It preserves the passed Preview evidence, the failed
calibration and unavailable Production-health evidence, the remaining
deployment-specific Stripe and golden-path gaps, and the criteria required to
reconsider the current NO-GO decision. It grants no Production or paid-provider
authority.

Its adjudication review manifest contains agent-authored synthetic candidates.
The separate `sav-198-adjudication-approval.json` records the product owner's
explicit task-thread delegation, the exact reviewed head and candidate/corpus
hashes, three review rounds, and two named independent agent-panel signoffs.
The delegated authority is represented as a non-human identity with a null
human reviewer identity; no person's identity is inferred or fabricated. The
approval is limited to the 32-case semantic adjudication. It does not authorize
provider calls, spend, ledger mutation, Production data, or launch acceptance.
