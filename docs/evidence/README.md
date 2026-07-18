# Engineering Evidence

This directory contains reproducible, machine-readable evidence generated from
non-secret repository inputs. Reports must not contain customer data, provider
credentials, recordings, or real transcripts.

Live calibration reports additionally exclude prompt and transcript text and
record only sanitized case-level diagnostics plus aggregate call/cost
accounting. Spend authorization does not satisfy the separately required PM or
product-owner adjudication approval.

`sav-250-adjudicated-evidence-anchor-audit.md` records the provider-free review
of all 32 scored cases and 64 canonical anchors. It finds every canonical pair
plausible but non-exhaustive, corrects only whole-anchor quote-span brittleness,
and preserves fail-closed treatment for arbitrary alternative evidence. It
does not reinterpret the discarded SAV-248 response, alter historical reports,
authorize spend, or authorize launch. The audit's legacy release-gate wording
is preserved because the file is hash-bound by the panel signoffs; it describes
technical evidence, never owner GO/NO-GO.

`sav-250-agent-panel-signoffs.json` binds two independent provider-free agent
reviews to the exact candidate commit, candidate/corpus hashes, and audit-file
hash. It records no human approval, spend authority, provider call, Production
data use, v3 authority, or launch decision.

`sav-198-paid-run-authorization.json` is historical v1 authorization evidence.
Its protected ledger was activated and is terminal; neither this file nor the
later rebased-plan artifact can create, renew, or imply remaining spend
authority. Preserve both byte-for-byte as incident history.

`sav-198-rebased-plan-acceptance.json` records the product owner's delegated,
conservative acceptance of the exact rebased plan within that existing
authorization: 64 planned calls within the 96-call ceiling, 2,052,925,000
nano-USD ($2.052925) deterministic worst case, and plan hash
`53e88d34564efe1a869acf6a3464ee024b7e298955ac2b17be89510b75250fa0`.
This historical artifact cannot revive the consumed v1 authority. It performs
no provider call or ledger activation and grants no launch authority.

`sav-248-v3-paid-run-authorization-proposal.json` is deliberately not an
authorization. It records the proposed boundary—at most 96 physical attempts
and a hard $3 total cap using synthetic/approved fixtures only—together with
`pending_explicit_product_owner_approval`, null approval source/date, and a null
reviewed source commit. The current 64-call proposal has a $2.247265
deterministic worst case and proposal hash
`a0ca65f49bcbf6f0140701a1eb2e58d018b916e18a5bf80b3c438938d4062363`.
It explicitly records the correct v1 and v2 refs and terminal, non-reusable
activation commits:
`refs/heads/meelni-ledger/sav-198-authorized-paid-calibration.v1` at
`4acdf549eecad5fe88d685c28fbc98d7475b8f05`, and
`refs/heads/meelni-ledger/sav-248-authorized-paid-calibration.v2` at
`d0c4fc4c028b10d8616fdde337be150315a7798c`. Its proposal authorization hash is
`06dc48d46fb8c639ffc2687c58b270dc23b9c96782461e7cb69ea39e7a4515b5`.
No v3 Git ledger exists or is authorized. The proposal-only deterministic
genesis is `d9dbb6b0b6d203e7a5e0c92d868451bbc5f2d9f2` and must not be created.

`sav-248-v3-plan-proposal.json` binds the proposed corpus, adjudication, prompt,
strict response format, request policy, model, endpoint, service tier, pricing,
and plan hashes while leaving the reviewed source commit null. It authorizes no
provider call, GitHub mutation, Production data, customer transcript,
feature-flag, or launch action. After merge and a fresh pricing check, it must be
regenerated and explicitly approved against one exact source commit before any
paid run can become executable.

SAV-198 includes a calibration preflight and deterministic harness report. Both
are immutable v7 local evidence only. Their historical `launchAcceptance`
field is the technical predecessor of current v9
`calibrationEvidenceAcceptance`; it does not represent owner launch authority.
Both reports deliberately keep live-provider and calibration-evidence
acceptance pending.

Its adjudication review manifest contains agent-authored synthetic candidates.
The separate `sav-198-adjudication-approval.json` records the product owner's
explicit task-thread delegation, the exact reviewed head and candidate/corpus
hashes, three review rounds, and two named independent agent-panel signoffs.
The delegated authority is represented as a non-human identity with a null
human reviewer identity; no person's identity is inferred or fabricated. The
approval is limited to the 32-case semantic adjudication. It does not authorize
provider calls, spend, ledger mutation, Production data, or launch.
