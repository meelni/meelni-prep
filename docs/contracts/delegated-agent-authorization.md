# Delegated Agent Authorization Contract

Contract: `meelni.delegated-agent-authorization.v1`

This contract records a bounded owner delegation to Codex or a future Meelni
agent. It is explicitly not a human-owner signature, a launch decision, a
provider credential, or permission to use Production data.

## Purpose

Use delegated-agent authorization when Savi has already approved a narrow class
of repeat work and the remaining work is operationally bounded, auditable, and
safe for an agent to execute without repeatedly asking for a fresh human-owner
Ed25519 signature.

Allowed examples:

- repo-only guardrail or runtime repairs under an already scoped relaunch issue;
- synthetic-only calibration retries inside a previously approved spend cap;
- provider-free evidence regeneration;
- documentation, manifest, or runbook updates that preserve existing scope.

Forbidden examples:

- launch GO/NO-GO or relaunch default-on;
- new or wider provider spend;
- customer transcripts, Production data, recordings, or PII;
- destructive actions, refunds, account deletion, or billing exceptions;
- live-mode provider mutations outside an existing exact owner-approved
  envelope;
- any artifact that pretends to be Savi's human-owner signature.

## Artifact shape

The artifact contains exactly `contract` and `payload`.

The payload contains:

- `authorizationId`: `sav<issue>_delegated_agent_<32 hex>`;
- `authorizedBy`: `human_product_owner_chat_delegation`;
- `authorizedVia`: `codex_thread`;
- `delegatedTo`: `codex`;
- `actionClass`: `repo_only_guardrail_repair` or
  `synthetic_calibration_retry`;
- a human-readable bounded `scope`;
- `reviewedSourcePolicy`: either `exact_commit_required` or
  `merged_repo_only_guardrail_repairs_allowed`;
- maximum provider calls, physical HTTP attempts, and spend in nano-USD;
- `customerTranscriptsAllowed: false`;
- `productionDataAllowed: false`;
- `launchDecision: null`;
- whole-second UTC `issuedAt` and `expiresAt`.

Delegated authorization expires after at most four hours and cannot exceed the
existing SAV-198 calibration ceiling of 96 provider calls or $3. It may be more
restrictive.

## Boundary with human-owner authorization

Human-owner-only gates continue to require
`meelni.evaluation-calibration-owner-authorization.v1` or
`meelni.production-action-authorization.v1`, depending on the workflow.
Delegated-agent artifacts are domain-separated and must be rejected by
human-owner verifiers.

Delegated authorization may help an agent continue bounded repeat work, but it
does not grant:

- launch authority;
- a valid owner Ed25519 signature;
- provider credentials;
- permission to use customer data;
- permission to bypass branch protection, provider roles, or external service
  controls.

If a supported wrapper cannot distinguish delegated authority from human-owner
authority, it must fail closed until the wrapper is updated and tested.

## Calibration retry consumption

The SAV-198/SAV-248 live calibration runner may consume delegated authorization
only as a resume of an already activated human-owner ledger ref. The delegated
artifact must use action class `synthetic_calibration_retry`, and the caller
must also supply the previous terminal v9 report. The runner accepts that
previous report only when it records a paid provider attempt with zero
completed calls and zero reconciled actual spend.

The delegated retry path:

- reads and validates the existing protected GitHub activation and its parent
  authorization commit;
- verifies the activation and authorization messages agree on run ID,
  authorization ID/hash, and plan hash;
- checks the current deterministic call list against the delegated provider
  call, physical-attempt, and nano-USD caps;
- uses the activated ledger as spend authority for request reservations.

It does not create a new ledger ref, update the activated ref, reuse the
human-owner private key, or accept delegated artifacts for owner-only launch or
Production actions.
