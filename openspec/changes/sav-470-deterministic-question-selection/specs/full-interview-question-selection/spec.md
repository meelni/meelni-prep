# Deterministic full-interview question selection

## ADDED Requirements

### Requirement: Explicit question launches remain authoritative

An explicit selected question SHALL bypass ranking-context reads and preserve
the accepted question ID, text, company, and type bytes through brief
compilation and replay.

#### Scenario: Explicit question launch

- **WHEN** an authenticated full-interview start includes a valid question ID
- **THEN** the workflow performs no candidate, history, or feedback ranking
  read and compiles that exact selected-question snapshot

### Requirement: Question-free selection is bounded and deterministic

Question-free starts SHALL use the versioned provider-free ranker over bounded
candidate, history, and evidence inputs. Equal inputs, catalog version, and
ranker version SHALL produce identical ordering with a stable question-ID tie
break.

#### Scenario: Equal ranking inputs

- **WHEN** two starts receive the same eligible candidates, practice history,
  validated evidence signal, request, catalog version, and ranker version
- **THEN** they select the same question and compact reason codes without a
  provider or Python runtime read

#### Scenario: Exact candidate bucket

- **WHEN** a PostgreSQL candidate bucket has either a concrete or null
  difficulty among a larger adversarial corpus
- **THEN** its explicit equality or `IS NULL` branch consumes the
  question-type/difficulty index order through the 64-row limit without a
  bucket sort or post-index filtering

### Requirement: Accepted snapshots exclusively control replay

Every accepted launch mode SHALL replay from its persisted selected-question
snapshot and exact compiled brief. A concurrent insert loser SHALL use only the
locked persisted winner to decide replay bytes and whether to create a
session-question relation.

#### Scenario: Catalog changes after acceptance

- **WHEN** the current catalog row is edited, deactivated, or deleted after a
  start is accepted
- **THEN** replay returns the persisted question and brief bytes without
  consulting or substituting the current catalog row

#### Scenario: Concurrent fallback winner

- **WHEN** a fallback start wins persistence while a catalog-backed retry loses
  the insert race
- **THEN** the retry replays the fallback snapshot and creates no contradictory
  catalog relation

### Requirement: Missing ranking context does not block interview start

Empty, unavailable, stale, invalid, or deleted ranking context SHALL select a
versioned embedded PM-round fallback. Persisted observability SHALL contain
only bounded reason codes and ranker/catalog versions, never candidate scores,
private history, or feedback internals.

#### Scenario: Ranking context is unavailable

- **WHEN** the bounded context loader times out or returns no eligible
  candidate
- **THEN** the workflow compiles and persists the deterministic embedded
  fallback and starts without a provider call
