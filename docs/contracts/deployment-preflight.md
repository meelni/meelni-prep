# Deployment Preflight Contract

Updated: 2026-07-17
Owner: SAV-184

Meelni Preview and Production builds must fail before deployment when launch-critical billing, feedback, database, or runtime configuration is incomplete, blank, mixed-mode, or points at the wrong provider identity. The preflight is read-only. It emits only check names, target names, and stable failure codes; it never prints configured values, provider payloads, price IDs, exception messages, or customer data.

## Targets

| Target       | Stripe mode | Statsig tier | Supabase project       |
| ------------ | ----------- | ------------ | ---------------------- |
| `preview`    | test        | `preview`    | `kxpvidtxznllfosfemdl` |
| `production` | live        | `production` | `rarrrwkjuhfyfatcmrkw` |

The `build` command invokes preflight immediately before Next.js and derives the target only from `VERCEL=1` plus `VERCEL_ENV`. Vercel builds must also expose exact project ID `prj_NvpsSMhIhmUoaVAG5nPnbd2fRmT4` and Git repository `meelni/meelni-prep`; missing or copied-project identity fails. An explicit CLI target cannot override a conflicting Vercel target. Local builds without the Vercel marker skip deploy-only checks. Operator commands must select a target explicitly.

## Required Checks

### Supabase

- `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, anonymous key, service-role key, and the committed Production ref anchor are nonblank.
- Database and public URLs identify the same exact target project.
- Parsed JWT roles must be `anon` and `service_role`, their refs and issuers must match the target, and the credentials must be distinct.
- Parsed claims are not treated as cryptographic proof. The preflight also presents each credential to the target Supabase project through read-only Auth/PostgREST requests. Fabricated or cross-project tokens fail.

### Stripe

- Secret/restricted and publishable keys are in test mode for Preview and live mode for Production.
- Webhook secret and all three distinct price IDs are nonblank and well formed.
- A read-only account lookup must return the canonical Meelni account `acct_1SSreECdoT5hfbsF`.
- Read-only price lookups must prove each price is active, in the target mode, and matches accepted currency, amount, interval, interval count, usage type, `app=meelni`, and `catalog_id` metadata.

| Catalog        | Amount | Recurrence                          |
| -------------- | -----: | ----------------------------------- |
| Interview Pass |     $9 | one-time                            |
| Starter        |    $19 | monthly, interval count 1, licensed |
| Pro            |    $49 | monthly, interval count 1, licensed |

### Inngest and feedback

- `INNGEST_EVENT_KEY` is nonblank and non-placeholder.
- `INNGEST_SIGNING_KEY` is valid-shaped and target-specific: Preview accepts Inngest's shared `signkey-branch-*` identity as well as legacy test/preview keys; Production accepts only prod/production keys. Inngest branch environments share one branch signing key and route events by the deployment's branch identity.
- `OPENAI_API_KEY` is nonblank and key-shaped.
- `OPENAI_FEEDBACK_MODEL` exactly matches the accepted `gpt-5.1` model, and a read-only model retrieval succeeds.

Inngest does not expose a safe read-only Event Key validation endpoint. An authorized target-specific smoke event is release evidence, not a per-build prerequisite. It must be recorded separately and never replaced with a self-attested environment label.

### LiveKit and interview runtime

- API credentials, public/server websocket URLs, exact dispatch names, and all seven server-owned `MEELNI_INTERVIEW_*` settings are explicit.
- Demo and interview dispatch names must be distinct. A shared name cannot satisfy demo readiness and fails before any room is created.
- Public and server URLs match.
- Production is pinned to `meelni-ek4vaisp.livekit.cloud` and exact source-owned runtime values `CA_yawKG67rCMG4` (interview) and `CA_t3sKQEihMQ7x` (demo). These values are verified Cloud deployment IDs and the currently expected dispatch names; a controlled provider rehearsal must still prove that each registered dispatch name is identical before launch readiness is claimed.
- Preview is pinned to project `meelni-preview` (`p_16unz4e48is`) at `meelni-preview-dk7443ua.livekit.cloud`. The reviewed interview deployment is `CA_ZbGxFjfEYwsD`, dispatched as `meelni-preview-interview`; the reviewed demo deployment is `CA_M5XTD4CMyXk3`, dispatched as `meelni-preview-demo`.
- Preview agent identity is exact and source-owned; merely using any non-Production `*.livekit.cloud` host or any syntactically valid dispatch name is insufficient.
- A read-only room-list request against a guaranteed nonexistent room verifies project access without reading active rooms.
- Preview requires these two distinct deployments and dispatch names; neither may be replaced with a Production identity or collapsed into a shared dispatch.

### Relaunch state

- Statsig client key is nonblank, tier matches the target, and the API URL is exactly the same-origin `/api/statsig` proxy.
- Preview accepts only `MEELNI_RELAUNCH_PHASE=rehearsal` with `MEELNI_REACTIVATION_DEFAULT=false`. A branch-scoped `MEELNI_REHEARSAL_COMMIT_SHA` may name the exact reviewed 40-character commit. On Vercel, a configured anchor must exactly match `VERCEL_GIT_COMMIT_SHA` and include a valid `VERCEL_GIT_COMMIT_REF` at build time; malformed, missing-system-identity, and stale values fail preflight. Absence leaves an ordinary Preview deployable but unable to evaluate the remote gate.
- Production accepts only `MEELNI_RELAUNCH_PHASE=prelaunch` with `MEELNI_REACTIVATION_DEFAULT=false`; the gate resolves hard-off without contacting Statsig.
- Runtime resolution is target- and tier-bound: `rehearsal` can evaluate the Preview-tier gate only when Vercel reports `preview`, supplies a valid Git ref, and `VERCEL_GIT_COMMIT_SHA` exactly matches the deployment-side rehearsal SHA.
- Immutable Vercel values are not revocation authority. A fresh network Statsig response must also contain dynamic config `meelni_preview_rehearsal_authority` with `active=true`, the exact `approvedCommitSha`, the exact `approvedGitRef`, canonical `authorizedAt`, and canonical `expiresAt`. Authorization must already have begun, remain unexpired, and have a total `expiresAt - authorizedAt` lifetime no greater than two hours; an overlong authority never becomes valid merely because its remaining time shrinks. Missing, stale, malformed, expired, not-yet-authorized, overlong, wrong-commit, or wrong-ref authority resolves false before the gate is read. Advancing or disabling that central config revokes historical immutable deployments.
- The exact commit/ref are also sent as non-identifying Statsig custom attributes so the Preview gate can be independently constrained to the same deployment. `launched` can evaluate only on the Production target and tier. Phase, target, tier, branch, SHA, authority, and provider-network mismatches resolve false.
- No agent may make the current Production preflight accept `launched`. The product owner’s later GO decision requires a separately reviewed launch authorization change and rehearsal; this contract cannot make that decision.

## Rehearsal Evidence

State-changing evidence is deliberately separate from every build:

- Preview release rehearsal: synthetic/approved subjects only; prove target-specific Inngest delivery, isolated LiveKit agent/runtime parity, Stripe-test webhook delivery and durable credit settlement, cleanup, and rollback.
- Production: no smoke mutation or live-mode action without explicit product-owner authorization.
- Evidence is recorded by exact commit and target in the owning Linear issue/PR. Do not store a signing key, raw provider receipt, credential, customer transcript, or billing payload in GitHub, Linear, docs, or Vercel.

A prior draft required an exact-SHA Ed25519 receipt whose private key did not exist and whose proof required the undeployed commit to process traffic. That circular design is rejected: it bricked deployments, forced state-changing rehearsals for routine hotfixes, and did not bind launch authorization.

## Failure Semantics

Missing, blank, quoted-empty, placeholder, malformed, mixed-mode, wrong-target, unreadable, or mismatched configuration fails the target preflight. Provider errors are redacted.

Stable codes:

- `blank_or_missing`
- `invalid_format`
- `mixed_stripe_mode`
- `wrong_stripe_mode`
- `duplicate_price_id`
- `environment_identity_mismatch`
- `supabase_project_unreadable`
- `livekit_project_unreadable`
- `openai_model_unreadable`
- `stripe_price_unreadable`
- `stripe_price_mismatch`
- `stripe_account_mismatch`
