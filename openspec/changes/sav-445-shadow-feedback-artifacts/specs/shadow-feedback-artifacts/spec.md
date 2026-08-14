# Shadow feedback artifacts

## ADDED Requirements

### Requirement: Artifact identity binds all current authority inputs

Each artifact key MUST bind the session, SAV-441 trusted block fingerprint,
rubric version, prompt version, selection-schema version, and model version.

#### Scenario: Version change

- **WHEN** any one version changes for the same session and trusted block
- **THEN** the artifact key changes and the old tuple cannot replace the new one

### Requirement: Storage is structurally default-off

The write entrypoint MUST require a runtime-validated enabled context and MUST
return before repository access when disabled or forged.

#### Scenario: Default configuration

- **WHEN** the server-only storage setting is absent
- **THEN** recording returns disabled and performs zero database side effects

### Requirement: Writes and exact reads are immutable and fail closed

Replay of the same key/value MUST converge as a duplicate. A conflicting value
MUST NOT update the row. Exact reads MUST ignore stale version tuples and expose
no artifacts when any current row has an unknown or malformed contract.

#### Scenario: Worker crash after insert

- **WHEN** a retry repeats the exact write after the original acknowledgement is
  lost
- **THEN** one physical row remains and the retry reports duplicate

### Requirement: Shadow artifacts are non-authoritative

The table MUST remain separate from feedback lifecycle persistence and MUST NOT
be read by authenticated feedback, UI, insights, progress, or billing paths.

#### Scenario: Artifact exists without batch completion

- **WHEN** a valid shadow artifact exists for a session
- **THEN** it cannot satisfy or alter any customer feedback lifecycle response

### Requirement: Privacy lifecycle is complete

Artifacts MUST be content-minimized, service-only, bounded, owner/session
correlated, included in the versioned account export, and removed by account
deletion. No shorter retention period may be promised without an accepted
decision.

#### Scenario: Unknown artifact in export

- **WHEN** a stored artifact has an unsupported version
- **THEN** export fails closed rather than serializing it as a trusted shape
