---
name: meelni-livekit-interview-runtime
description: Plan, implement, or review Meelni LiveKit interview runtime work, including voice sessions, room metadata, transcript events, turn-taking, prompts, model/provider config, demo/full agents, and LiveKit deployment.
---

# Meelni LiveKit Interview Runtime

Use this skill for LiveKit, voice interviews, session lifecycle, transcript publishing, and Python agent runtime changes.

## Read First

- `AGENTS.md`
- `docs/architecture/codebase-principles.md`
- `docs/architecture/target-monorepo.md`
- `.claude/LIVEKIT.md`
- `agent/README.md`
- `agent/interview/README.md`
- `agent/demo/README.md`
- Relevant docs under `docs/operations/` and `docs/contracts/`

Check current official LiveKit docs before relying on API names or runtime behavior.

## Architecture Rules

- Keep LiveKit event names out of core lifecycle concepts.
- Normalize room metadata and transcript payloads before the web app consumes them.
- Preserve correlation across session ID, room name, selected question, transcript turns, and feedback.
- Treat runtime failures as explicit session outcomes where possible.
- Keep model/provider tuning internally controlled unless product strategy accepts exposing it.
- Prefer testable helpers for config parsing, prompt contracts, and event payloads.

## Review Questions

- What happens if the user disconnects mid-interview?
- Are partial transcripts separated from final transcript turns?
- Does selected-question practice reliably present the selected question first?
- Can interrupted agent speech avoid polluting the transcript?
- Is model/provider config logged without secrets?
- Is the feedback pipeline robust to short, abandoned, or failed sessions?
