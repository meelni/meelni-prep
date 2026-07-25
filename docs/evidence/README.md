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
data use, v7 authority, or launch decision.

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

`sav-248-v21-paid-run-authorization-proposal.json` is deliberately not an
authorization. It records the proposed boundary—at most 96 physical attempts
and a hard $3 total cap using synthetic/approved fixtures only—together with
`pending_explicit_product_owner_approval`, null approval source/date, and a null
reviewed source commit. The current successor 64-call proposal has a $2.884465
deterministic worst case and plan hash
`fecab7820b9b771eff4d802dd0791052f4bed441a61e5f3ef1fcf25954ec75fa`. Its
proposal authorization hash is source-derived and must be regenerated after
merge.
It explicitly records the correct v1 through v16 refs and terminal, non-reusable
activation commits:
`refs/heads/meelni-ledger/sav-198-authorized-paid-calibration.v1` at
`4acdf549eecad5fe88d685c28fbc98d7475b8f05`, and
`refs/heads/meelni-ledger/sav-248-authorized-paid-calibration.v2` at
`d0c4fc4c028b10d8616fdde337be150315a7798c`, and
`refs/heads/meelni-ledger/sav-248-authorized-paid-calibration.v3` at
`1baee0b82c61cb6d89dbe9dc23cee1beccf72b31`, and
`refs/heads/meelni-ledger/sav-248-authorized-paid-calibration.v4` at
`feb7591898145bcb6bec9526c650f705f2530270`, and
`refs/heads/meelni-ledger/sav-248-authorized-paid-calibration.v5` at
`78295d40c19ba366a64956010af9535b283aaf44`, and
`refs/heads/meelni-ledger/sav-248-authorized-paid-calibration.v6` at
`b23e5d54fb21d72e1043a4404fea1ac691e31a89`. The authorized v9 paid run later
activated `refs/heads/meelni-ledger/sav-248-authorized-paid-calibration.v9` at
`08864c3bfad23d6c394847ccbef5ffca87347275`, made one provider request, spent
$0.01311, and failed terminally with `evidence_quote_not_grounded`. Later v10
through v16 lanes also activated and failed closed during bounded synthetic
calibration repair attempts. Those ledgers are non-reusable failure evidence.
Future paid execution requires repaired source, a fresh exact owner authorization,
and a successor ledger lane; do not manually create or reuse v9 through v16.

`sav-248-v21-plan-proposal.json` binds the repaired corpus, adjudication, prompt,
strict response format, request policy, model, endpoint, service tier, pricing,
and plan hashes while leaving the reviewed source commit null. It authorizes no
provider call, GitHub mutation, Production data, customer transcript,
feature-flag, or launch action. Because real v9 through v16 have already
failed terminally, after merge and a fresh pricing check this successor lane
must be regenerated and explicitly approved against one exact source commit
before any paid run can become executable.

The repository now defines an external Ed25519 owner-authorization handoff, but
that mechanism is not itself approval evidence. The checked-in owner public-key
registry contains only public verification material, no private signing key is
stored here, and no signed v21 authorization artifact exists. Any future artifact
must remain outside Git and bind the exact post-merge source commit and freshly
regenerated plan; the historical v1 through v16 artifacts remain unusable.

SAV-198 includes a calibration preflight and deterministic harness report. Both
are immutable v7 local evidence only. Their historical `launchAcceptance`
field is the technical predecessor of current v10
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
