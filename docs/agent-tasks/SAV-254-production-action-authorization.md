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
  cooperative replay protection, provider-free adversarial tests, executable
  entrypoint enforcement, and fail-closed unsupported provider workflows.
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
  config/target/executor/mutation-scope drift, non-GO default-on, and replay.
- Stripe denial occurs before client construction.
- LiveKit denial occurs before `lk` invocation; Preview remains unchanged.
- Database denial occurs before Drizzle spawn; Preview/local remain unchanged.
- Production manual question sync denies the HTTP mutation path and consumes
  exact authorization through the CLI before loading the workflow.
- Legacy database mutation scripts reject Production before adapter use.
- No provider, Production, customer-data, or default-on action is performed.

## Handoff

- Implemented: shared contract; Stripe, LiveKit, database, and manual question
  sync enforcement; legacy script fencing; and a direct-entrypoint inventory
  guardrail.
- Follow-up: central protected consumption and dedicated provider adapters for
  Production promotion, first schedule activation, and default-on. Those
  mutations remain unsupported until the adapters exist.
- Human follow-up: enroll a public key and executor when available. This does
  not itself make or imply launch GO.
