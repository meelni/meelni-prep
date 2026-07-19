---
name: meelni-livekit-interview-runtime
description: Plan, implement, or review Meelni LiveKit interview runtime work, including voice sessions, room metadata, transcript events, turn-taking, prompts, model/provider config, demo/full agents, and LiveKit deployment.
---

# Meelni LiveKit Interview Runtime

Use this skill for LiveKit, voice interviews, session lifecycle, transcript publishing, and Python agent runtime changes. Treat the runtime as a distributed system: web app, LiveKit room, Python worker, transcript persistence, and feedback handoff must stay correlated under failure.

## Read First

- `AGENTS.md`
- `docs/architecture/codebase-principles.md`
- `docs/architecture/target-monorepo.md`
- `.claude/LIVEKIT.md`
- `agent/README.md`
- `agent/interview/README.md`
- `agent/demo/README.md`
- `.agents/skills/meelni-ops-connections/references/connections.md`
- Relevant docs under `docs/operations/` and `docs/contracts/`

Check current official LiveKit docs before relying on API names or runtime behavior.

## Architecture Rules

- Keep LiveKit event names out of core lifecycle concepts.
- Normalize room metadata and transcript payloads before the web app consumes them.
- Preserve correlation across session ID, room name, selected question, transcript turns, and feedback.
- Treat runtime failures as explicit session outcomes where possible.
- Keep model/provider tuning internally controlled unless product strategy accepts exposing it.
- Prefer testable helpers for config parsing, prompt contracts, and event payloads.

## Runtime Model

Track the full chain for every change:

1. User/setup choice becomes web app config.
2. Web app creates a session and room metadata.
3. Token route authorizes the participant and room.
4. LiveKit dispatches the configured demo or interview agent.
5. Python worker parses metadata and starts the voice pipeline.
6. Transcript events persist with session, room, participant, role, text, and timing.
7. Interview end triggers feedback generation and insights.

If any link changes, inspect the adjacent links. Most runtime bugs are correlation bugs.

## Failure-Mode Gates

### Dispatch And Configuration

- Do web app envs, room metadata, token grants, and agent dispatch names agree?
- Does the selected demo/full agent receive only the metadata it understands?
- Are missing, malformed, stale, or version-skewed metadata handled explicitly?
- Can local `dev:local`, LiveKit Cloud agents, and Vercel envs be verified without exposing secrets?

### Conversation And Turn-Taking

- What happens when the user interrupts, disconnects, reconnects, is silent, or talks over the agent?
- Are partial and final transcripts separated enough to avoid duplicate or polluted turns?
- Does selected-question practice reliably start with the selected question and preserve company/type/text?
- Does the agent keep PM interview discipline instead of drifting into generic coaching?
- Does the authenticated full-interview prompt stay in realistic interviewer role, with hints off and evaluation deferred by default? Keep the short public demo's feedback-preview behavior separate.

### Persistence And Handoff

- Are transcript writes idempotent or de-duplicated across retries/reconnects?
- Does the session end path tolerate missing transcript turns, short sessions, and agent failures?
- Is feedback generation triggered exactly when intended, and does failure leave a recoverable state?
- Are room name, session ID, question ID/text, participant identity, and transcript turns correlated in logs and data?

### Operations

- Prefer the LiveKit Docs MCP when available before relying on API names, Cloud agent behavior, examples, changelogs, or deployment commands. Configure it with `codex mcp add --url https://docs.livekit.io/mcp livekit-docs` when the environment allows MCP installation.
- Useful LiveKit Docs MCP capabilities include docs search, page rendering, changelog lookup, Python agent examples, public LiveKit code search, and pricing info.
- Use local docs for Meelni-specific account, env, and agent-name truth.
- Never paste LiveKit API secrets, room tokens, recordings, or transcripts into chat or tracked files.
- After changing Cloud agent code or secrets, note the deploy/verification path.

## Review Questions

- What happens if the user disconnects mid-interview?
- Are partial transcripts separated from final transcript turns?
- Does selected-question practice reliably present the selected question first?
- Can interrupted agent speech avoid polluting the transcript?
- Is model/provider config logged without secrets?
- Is the feedback pipeline robust to short, abandoned, or failed sessions?

## Validation

Choose by surface:

- Metadata/config helpers: direct unit tests in `packages/agent`, `packages/integrations`, or `agent/`.
- Session lifecycle or token changes: targeted API/workflow tests plus manual local run when envs exist.
- Python runtime changes: `npm run test:python-agent` when `agent/venv` exists, or explain skip.
- Full interview behavior: manual LiveKit verification with exact room/session steps and observed transcript/feedback result.
- Cloud deployment changes: verify agent status and document affected demo/interview agent.

## Output

Use:

```markdown
## Runtime Impact
- Web/session:
- LiveKit room/agent:
- Transcript/feedback:

## Failure Modes
- Dispatch/config:
- Turn-taking:
- Persistence:
- Operations:

## Validation
- Automated:
- Manual:
- Skipped:

## Risks
- ...
```
