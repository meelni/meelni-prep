# Engineering Evidence

This directory contains reproducible, machine-readable evidence generated from
non-secret repository inputs. Reports must not contain customer data, provider
credentials, recordings, or real transcripts.

Live calibration reports additionally exclude prompt and transcript text and
record only sanitized case-level diagnostics plus aggregate call/cost
accounting. Spend authorization does not satisfy the separately required PM or
product-owner adjudication approval.

`sav-198-paid-run-authorization.json` records the explicit product-owner spend
boundary for one fixed aggregate paid run: at most 96 provider calls/physical
attempts and $3, using synthetic or separately approved fixtures only. It is
code-bound authorization evidence, not a reusable per-process budget, a live
run result, or semantic approval of the gold-set candidates. Its one-time spend
authority is the deterministic genesis and protected payload-free activation
ref in the canonical GitHub repository described in the calibration contract.
Local remotes, reports, and caches are never budget authority.

`sav-198-rebased-plan-acceptance.json` records the product owner's delegated,
conservative acceptance of the exact rebased plan within that existing
authorization: 96 calls, 2,754,487,500 nano-USD ($2.7544875) deterministic
worst case, and plan hash
`c70ac55143d952c08aa85cefcbb11a27b3d037b78133957f6cd13a45492b86a1`.
This is not a new or expanded authorization. The $3 cap, model, fixtures,
semantic approval, and one-run boundary are unchanged; the artifact performs
no provider call or ledger activation and grants no launch authority.

SAV-198 includes a calibration preflight and deterministic harness report. Both
are local evidence only and deliberately keep live-provider launch acceptance
pending.

Its adjudication review manifest contains agent-authored synthetic candidates.
The separate `sav-198-adjudication-approval.json` records the product owner's
explicit task-thread delegation, the exact reviewed head and candidate/corpus
hashes, three review rounds, and two named independent agent-panel signoffs.
The delegated authority is represented as a non-human identity with a null
human reviewer identity; no person's identity is inferred or fabricated. The
approval is limited to the 32-case semantic adjudication. It does not authorize
provider calls, spend, ledger mutation, Production data, or launch acceptance.
