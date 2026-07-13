# Agent Task Intake: SAV-254 Production Action Authorization

## Intent

- User request: keep advancing relaunch work while reserving launch GO/NO-GO
  exclusively for the human product owner.
- Operator outcome: supported Production release and maintenance commands fail
  before mutation unless the owner signed the exact action.
- Why now: existing flags and environment anchors prove intent and target
  consistency but not human-owner authorization.

## Slice

- Primary slice: release operations governance.
- Workflow owner: supported operator wrapper plus shared Production action
  verifier.
- Secondary surfaces: Stripe catalog, LiveKit deploy, database migration,
  question-sync activation, Vercel promotion, and default-on.

## Scope

- In scope: signed exact-action contract, clean-candidate binding, local
  cooperative replay protection, provider-free adversarial tests, and phased
  entrypoint enforcement.
- Out of scope: provider calls, Production changes, credentials, owner key
  enrollment, launch decision, and normal customer/runtime transactions.
- Provider dependencies: none for implementation and tests.

## Contract And Risk

- Contract: `docs/contracts/production-action-authorization.md`.
- Data changes: private external authorization and consumption artifacts only;
  no application schema change.
- Rollback: revert wrapper enforcement only through reviewed code. Default-off
  and emergency disable remain available without launch GO.
- Key risk: a generic deep adapter gate would brick legitimate runtime
  behavior, so enforcement stays at release/maintenance entrypoints.

## Validation

- Core verifier rejects schema/signature/time/key/action/provider/candidate/
  config/target/executor drift, non-GO default-on, and replay.
- Stripe denial occurs before client construction.
- LiveKit denial occurs before `lk` invocation; Preview remains unchanged.
- Database denial occurs before Drizzle spawn; Preview/local remain unchanged.
- No provider, Production, customer-data, or default-on action is performed.

## Handoff

- Phase 1: shared contract plus Stripe, LiveKit, and database enforcement.
- Phase 2: central protected consumption, legacy script fencing, question-sync
  activation/manual live control, promotion/default-on wrappers, and the
  direct-entrypoint guardrail.
- Human follow-up: enroll a public key and executor when available. This does
  not itself make or imply launch GO.
