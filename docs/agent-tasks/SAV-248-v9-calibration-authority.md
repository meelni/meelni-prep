# SAV-248 v9 Calibration Authority

## Intent

- User request: Complete the bounded synthetic feedback calibration without using customer transcripts or Production data, with at most 96 physical model calls and a hard total spend cap of $3.
- Product/user outcome: Meelni has trustworthy, reviewable evidence about live feedback quality before the Preview golden path can pass.
- Why now: The v1 and v2 authorities are terminal, while the provider-free diagnostics, evidence-anchor audit, semantic-adjudication contract, private capture workflow, and evidence-only terminology are complete.

## Slice

- Primary slice: Feedback evaluation and calibration.
- Secondary slices: Durable spend authority, private synthetic-output review, and release evidence.
- Relevant skills: `meelni-feedback-evaluation`, `meelni-vertical-slice-playbooks`, `meelni-engineering-memory`, `meelni-linear-workstream`, and `meelni-pr-prep`.

## Linear Tracking

- Project: Meelni.
- Parent issue: SAV-198.
- Deliverable issue: SAV-248.
- Current state: In Progress.

## Scope

- In scope: A new non-reusable run ID and protected ledger ref, current official pricing evidence, an exact deterministic plan below $3, an external exact-plan owner-authorization handoff, zero SDK retries, one physical boundary per reservation, raw synthetic-output capture outside Git, two independent hash-bound semantic reviews, sanitized public reports, and terminal cleanup.
- Out of scope: Customer transcripts, Production data, Production mutations, feature-flag changes, launch GO/NO-GO, reusing or rewriting v1/v2 authorities, automatic retries, and retaining raw provider output after terminal review.
- Authority: No fresh v7 spend authority currently exists. The earlier ≤96/$3 approvals were consumed by v1/v2/v3/v4/v5/v6. The proposal records the intended maximums, but the runtime must stop before readiness or credential delivery until the product owner approves one exact post-merge source commit and freshly priced plan.

## Technical Plan

- Version a new immutable spend-authorization and Git activation contract rather than changing the consumed v1/v2 refs.
- Verify a short-lived, externally stored, Ed25519-signed human product-owner envelope before readiness. Bind it to the exact source commit, complete plan hash, planned call/attempt count, worst-case spend, synthetic-only data policy, and non-reusability of v1 through v6. Keep the private signing key outside Git and admit only reviewed public keys from the source-bound registry.
- Bind the exact model snapshot, official endpoint, default service tier, pricing hash, approved corpus, adjudication approval, prompt/schema/request-policy versions, final source commit, and complete case/run plan.
- Integrate the SAV-252 private capture capability into the paid evaluator boundary so each decoded provider message-content byte sequence is captured before JSON parsing and is never written to logs or public evidence.
- Require complete capture finalization, two decision-only panels, and separately operator-authored trusted execution authority before publishing a sanitized semantic report; bind legitimate alternatives to the exact automated mismatches, sync terminal v9 evidence, verify it, and only then delete the private capture.
- Require the trusted pre-secret launcher to consume the externally supplied exact owner-approved commit, disable Git replacement objects, bind every launch artifact directly to that commit's blobs, pin the exact signed Node and GitHub CLI binary digests, and execute only reverified private sealed artifact/binary copies. The credential-free runtime must then independently attest the same Git `HEAD`, directly hash every tracked blob against the reviewed tree, and require a clean tracked/untracked worktree before readiness. Launch a reproducible standalone bundle with an exact built-in-only import contract so mutable `tsx`/`node_modules` never receive credentials; the outer launcher must not retrieve or deliver GitHub/OpenAI credentials before that runtime handshake.
- Preserve historical v1 through v6 evidence byte-for-byte.

## Validation

- Provider-free: reproducible runtime bundle verification, calibration preflight, deterministic self-test, exact plan/authorization tests, pricing freshness tests, GitHub authority mutation tests, private capture tests, scorer privacy tests, typechecks, lint/format, `npm run check:ci`, `npm run build`, and `npm run verify:agent` when supported.
- External read-only: verify canonical repository and owner IDs, current rulesets/ref state, GitHub viewer identity, and official OpenAI pricing without exposing credentials.
- Paid execution: not authorized by this change. The follow-up path is to enroll only the owner's reviewed public key, refresh pricing, regenerate the plan for one exact merged source commit, and obtain the owner's signature; stop before any call that could exceed 96 attempts or $3.

## Rollout

- Risk: High because the tool spends money and gates feedback-quality claims.
- Rollback: Do not activate the new ledger ref. Once activated, the run is terminal and cannot be resumed or reset; a failure becomes immutable evidence.
- Handoff: A passing technical report is calibration evidence only. It does not enable the relaunch flag or make the product owner's launch decision.
