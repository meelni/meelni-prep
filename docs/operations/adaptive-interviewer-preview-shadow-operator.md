# Preview-Shadow Operator Runbook

Current state: repository implementation under review; live execution remains
blocked until merge and a fresh exact-merged-SHA owner signature.

## Provider-free sequence

1. Work from a clean exact `origin/main` candidate under Node 22.22.0.
2. Run the focused owner/operator, workflow, LiveKit and Python suites.
3. Run the disposable local PostgreSQL durable matrix and full repository
   gates. Do not pull provider environments for repository verification.
4. Publish through a ready PR, terminal hosted checks, exact-range security
   review, and protected merge.

## Human execution sequence after merge

1. Refresh only the trusted staging environment and verify project identity:
   Supabase Preview `kxpvidtxznllfosfemdl`, LiveKit project `meelni-preview`,
   interview agent `CA_ZbGxFjfEYwsD`, dispatch
   `meelni-preview-interview`.
2. Prepare the closed authorization and unsigned decision under an owner-only
   external directory. Present exact merged SHA, config digest, selected
   candidate digest, target, expiry, nonce and denied authorities.
3. The owner runs the explicit sign command. Verify provider-free, then
   activate the durable run once.
4. Deploy the exact merged source only to the Preview interview worker through
   `agent/interview/deploy.sh preview-shadow`. Supply the owner-only five-name
   runtime file, exact candidate SHA and exact ready staging Vercel endpoint;
   the wrapper confirms the existing `OPENAI_API_KEY` name without reading its
   value and adds or updates only the five rehearsal variables. Verify the new
   version and `meelni.source_sha` attribute before starting any cell.
5. Start exactly one matrix cell. Join only with a synthetic owner identity and
   speak no customer or proprietary content. Reconcile the terminal receipt or
   stop-incomplete incident before admitting the next cell.
6. Stop immediately on any invariant, version/digest drift, session or
   transcript loss, kill-switch failure, budget threshold, unconfirmed cleanup,
   or closed provider/runtime error. Record a cohort stop before other rollback.
7. Run all 28 cells only if each prior cell settled and the durable run remains
   open. Missing cells remain `unperformed`; they are never inferred from
   provider-free tests.

## Rollback

Revoke new allocation through the run-control capability, settle the local
Shadow under its 250 ms bound, and retain ambiguous reservations. LiveKit
rolling deploy/drain is not the per-session kill switch. Do not enable Preview
influence or change any Production flag while this run exists.
