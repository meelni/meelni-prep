# SAV-368 and SAV-369 interview conversation resilience

## Why

Recent Production openings lasted roughly 12–36 seconds and were entirely
non-interruptible. Candidate speech overlapped the longest opening. Transcript
timing also shows consecutive candidate turns separated by sub-second gaps,
consistent with a 600ms VAD silence threshold fragmenting structured answers.

## Outcome

The deterministic opening adds no more than a short identity/role phrase before
the selected question and permits barge-in. Interview VAD tolerates a deliberate
short thinking pause without materially changing the semantic turn detector.

## Boundaries

- The selected question remains exact and is presented once.
- The visible question remains available if the candidate interrupts audio.
- The interviewer still does not coach, hint, or evaluate mid-session.
- Broader endpointing calibration remains tracked with Production metrics.
