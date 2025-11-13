### ADR-009: LiveKit AgentSession API Pattern
- **Date**: 2025-11-05
- **Decision**: Use `AgentSession` with string-based model configuration instead of older `VoiceAssistant` API
- **Rationale**:
  - LiveKit Agents framework evolved; `AgentSession` is current recommended pattern
  - Simpler string-based config: `stt="deepgram"`, `llm="openai/gpt-4o-mini"`, `tts="cartesia"`
  - Documentation lagged behind SDK changes; referenced official GitHub examples
- **Consequences**:
  - Custom `Agent` class extends base `livekit.agents.Agent`
  - Prewarm function needed for VAD model optimization
  - Clear separation: agent definition vs session orchestration
  - Learning: Always check official examples when docs don't match SDK

