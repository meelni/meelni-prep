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

SAV-198 includes a calibration preflight and deterministic harness report. Both
are local evidence only and deliberately keep live-provider launch acceptance
pending.

Its adjudication review manifest contains agent-authored synthetic candidates,
not approved ground truth. It carries no approval flag or reviewer identity.
Product-owner/PM signoff requires a separate validated hash-bound artifact,
which is intentionally absent while review remains pending and cannot be
satisfied by a model run.
