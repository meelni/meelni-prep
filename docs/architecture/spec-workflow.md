# Spec Workflow

Meelni uses lightweight OpenSpec-style artifacts for behavior and architecture changes where alignment matters.

## Directory Model

```text
openspec/
  specs/                 # Current durable behavior
  changes/               # Proposed behavior or architecture changes
    add-question-pages/
      proposal.md
      design.md
      tasks.md
      specs/
```

## When To Use

Use a change folder for:

- interview session lifecycle changes;
- LiveKit turn-taking, transcript, or room metadata behavior;
- feedback, scoring, practice exercises, or insights behavior;
- question-bank or SEO behavior that affects conversion into practice;
- entitlement, billing, usage quota, or compliance behavior;
- data model changes with migration implications;
- package boundary or provider adapter changes.

Skip it for typos, small docs cleanup, and mechanical refactors with no behavior change.

## Requirement Format

Use behavior-first requirements:

```markdown
### Requirement: Selected Question Practice

The system SHALL start an interview using the selected question when the user begins from a question-bank page.

#### Scenario: User starts from a question

- GIVEN the user selected a Product Sense question
- WHEN the session starts
- THEN the room metadata includes that question
- AND the interviewer presents that question first
```
