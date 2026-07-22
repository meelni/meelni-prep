# Voice prompt contract seam

Date: 2026-07-22

## Context

The Python voice runtime has two launch-sensitive prompt surfaces:

- authenticated full mock interviews, built through
  `agent/shared/utils/prompt_builder.py`;
- the public two-minute demo preview, built through `agent/demo/agent.py`.

These surfaces intentionally behave differently. Full interviews preserve
realistic interviewer conditions and defer feedback to the post-interview
feedback experience. Public demos ask one preview question, one grounded
follow-up, and only produce a takeaway when the system explicitly requests it.

## Change

`agent/shared/prompt_contracts.py` now owns frozen prompt contract metadata for
the two Python voice prompt surfaces:

- `FULL_INTERVIEW_PROMPT_CONTRACT`
- `DEMO_PROMPT_CONTRACT`

The full-interview and demo builders accept their reviewed contract as a default
argument and reject unreviewed contract versions. This keeps current prompt copy
and runtime behavior unchanged while giving future prompt relocation work a
small versioned seam to test.

## Boundary

- `agent/shared/prompt_contracts.py`: stable prompt contract identities and
  behavior metadata.
- `agent/shared/utils/prompt_builder.py`: authenticated full-interview prompt
  builder; rejects unreviewed full-interview prompt contracts.
- `agent/demo/agent.py`: public demo prompt builder; rejects unreviewed public
  demo prompt contracts.
- `agent/test_runtime_contracts.py`: behavior-focused assertions that demo and
  full-interview prompt contracts stay distinct.

## Rollout notes

This is provider-free and does not change LiveKit dispatches, model settings,
prompt text, relaunch flags, transcripts, feedback scoring, or billing. Future
prompt moves should update the contract version only when prompt behavior
intentionally changes and tests describe the changed behavior.
