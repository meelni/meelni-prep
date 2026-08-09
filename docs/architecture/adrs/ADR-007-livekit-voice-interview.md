### ADR-007: LiveKit Voice Interview Integration

- **Date**: 2025-11-05
- **Decision**: Implemented LiveKit Agents framework for real-time voice interviews
- **Rationale**:
  - LiveKit Agents provides integrated voice pipeline (Deepgram ASR + GPT-4o-mini + Cartesia TTS)
  - Python agent runs separately, joins LiveKit rooms as programmable participant
  - Next.js frontend generates tokens and connects users to rooms
  - Enables natural conversation with interruption handling (barge-in)
- **Consequences**:
  - Monorepo structure with `/agent` directory for Python code
  - Separate deployment needed for agent worker (Railway/Render/Fly.io)
  - Frontend: `/interview` page with LiveKit React components
  - Backend: `/api/livekit/token` route for access token generation
  - Agent uses Deepgram (STT), GPT-4o-mini (LLM), Cartesia (TTS), Silero (VAD)
