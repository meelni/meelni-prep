# Stateful Interviewer Contract Delta

## ADDED Requirements

### Requirement: Director influence is synchronous and optional

The runtime SHALL inspect only an already-ready session-local recommendation at
the serialized tool-admission boundary. It SHALL NOT await, start, retry, or
perform Director/provider work on the admission path.

#### Scenario: Recommendation is unavailable

- **WHEN** influence is disabled or advice is missing, late, stale, malformed,
  repeated, interrupted, mismatched, or rejected
- **THEN** the original deterministic tool request proceeds unchanged

### Requirement: Controller authority is preserved

The recommendation MAY influence only move type, target, and that move's closed
controller-validated reason code after exact policy validation. Commit SHALL
remain non-close and graceful-close SHALL remain close-only. The existing
assessor and controller reducer SHALL still authorize the effective move, and
the Director SHALL NOT speak or mutate lifecycle, transcript, evidence,
feedback, or settlement state.

#### Scenario: Advice is ready and eligible

- **WHEN** advice matches the exact current turn/state/revision/lifecycle,
  freshness, phase, deadline, legal move/target, probe eligibility, question,
  and delivered ledger
- **THEN** the controller independently admits or rejects the effective move

### Requirement: Revocation and replay are bounded

The runtime SHALL read the exact server-owned influence policy on every
admission. Consumed recommendation state SHALL be bounded to current authority,
and the controller delivered ledger SHALL remain authoritative after delivery.

#### Scenario: Policy is revoked after advice becomes ready

- **WHEN** advice is ready and the server policy is disabled before admission
- **THEN** that advice cannot influence the admission

### Requirement: Influence is attributable without content capture

The runtime SHALL emit stable flag/cohort/config/model/contract attribution,
closed accept/reject/ignore reasons, and planned-versus-delivered stages without
capturing session IDs, transcript text, prompts, evidence, or reasoning.
