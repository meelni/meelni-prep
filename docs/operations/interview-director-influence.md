# Interview Director Influence Operations

Status: repository-only, default off, no provider adapter

## Safety boundary

Do not enable this flag in Preview or Production, configure a provider/model,
run a live room, deploy, or authorize default-on as part of SAV-475. Repository
tests use only the deterministic provider-free fake.

## Immediate rollback contract

The exact server policy is
`MEELNI_INTERVIEW_DIRECTOR_INFLUENCE_V1_ENABLED=true`. The gate reads it on
every tool admission. Removing it or setting any other value disables influence
for the next admission without a code deploy; recommendations already present
in the session store cannot override revocation.

Disabling influence does not stop or mutate SAV-474 shadow observation. Missing
or unusable advice always falls through to the deterministic tool/controller
path.

## Verification

Provider-free verification must demonstrate:

1. no async wait, task, provider, or network call on admission;
2. disabled/no-Director/failure paths match deterministic behavior;
3. a ready recommendation is blocked when policy is revoked before admission;
4. exact turn/state/revision/lifecycle/freshness/deadline/phase/target/probe and
   delivered-ledger fences;
5. bounded repeated-use state and canonical delivery correlation;
6. planned/admitted/delivered attribution and closed reasons;
7. benchmark, feedback integrity, and latency gates; and
8. the full Node 22, Python, integration, build, verify-agent,
   pinned-container, and exact-head security gates.

## Escalation

Any request to configure a real adapter/model, spend, customer data, Preview or
Production flag, live room, deployment, default-on, launch, or merge must stop
and return to the human owner. SAV-476 owns rollout evidence and GO/NO-GO.
