### ADR-024: LiveKit Cloud Debugging Best Practices

- **Date**: 2025-11-08
- **Decision**: Established standard debugging workflow for LiveKit Cloud agents
- **Key Tools**:
  - `lk agent logs`: View runtime logs (agent execution, errors)
  - `lk agent logs --log-type=build`: Docker build output
  - `lk agent logs --log-type=deploy`: Deployment events
  - `lk agent status`: Agent health and version info
- **Common Failure Modes**:
  1. **ModuleNotFoundError**: Missing files in Dockerfile COPY commands
     - Symptom: Agent crashes on startup with "No module named 'utils'"
     - Fix: Add missing `COPY utils/ ./utils/` to Dockerfile
  2. **Agent not speaking**: Missing greeting instructions in prompts
     - Symptom: Agent joins room but never says anything
     - Fix: Add greeting instructions to BASE_INTERVIEWER_SYSTEM prompt
  3. **Invalid voice ID**: Use verified voice IDs from provider documentation
     - Symptom: TTS fails silently or agent doesn't speak
     - Fix: Use valid voice IDs (e.g., ElevenLabs `cgSgspJ2msm6clMCkdW9`)
  4. **Race conditions**: Always await session.start() before calling session.say()
     - Symptom: Agent greets but subsequent responses fail
     - Fix: Ensure `await session.start()` completes before any `session.say()` calls
- **Debugging Workflow**:
  1. Check agent status: `lk agent status` (is it running?)
  2. Check runtime logs: `lk agent logs` (Python errors, TTS failures)
  3. Check build logs: `lk agent logs --log-type=build` (if agent not starting)
  4. Search logs for room names: Filter by specific session to isolate issues
  5. Verify Dockerfile: Ensure all required files are copied (especially `utils/`)
  6. Verify prompts: Check that greeting instructions are present
  7. Verify voice IDs: Use valid IDs from provider docs (not example placeholders)
- **Consequences**:
  - Faster debugging (systematic approach)
  - Fewer deployment issues (checklist prevents common mistakes)
  - Better documentation (centralized troubleshooting guide)
