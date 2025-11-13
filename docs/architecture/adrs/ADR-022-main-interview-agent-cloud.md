### ADR-022: Main Interview Agent Deployed to LiveKit Cloud
- **Date**: 2025-11-06
- **Decision**: Deployed main interview agent to LiveKit Cloud (same infrastructure as demo agent)
- **Agent ID**: `CA_yawKG67rCMG4`
- **Deployment**: LiveKit Cloud (us-east region)
- **Version**: v20251106062030
- **Rationale**:
  - Simplified deployment: both demo and main agents on LiveKit Cloud
  - Auto-scaling handles variable load without managing infrastructure
  - Cost-effective for MVP stage (scales to zero when idle)
  - Easy rollback and version management via LiveKit CLI
  - No separate hosting provider needed (Railway/Render/Fly.io)
- **Configuration**:
  - Agent ID stored in `agent/livekit.toml`
  - Frontend dispatches via `AgentDispatchClient` in `/api/session/start`
  - Room name pattern: `interview-{sessionId}` (vs `demo-*` for demo agent)
- **Consequences**:
  - Both agents share LiveKit Cloud infrastructure
  - Agent dispatch is explicit via API (not automatic room joining)
  - Local development still available with `python agent.py dev`
  - Future migration to self-hosted possible if needed
  - Agent now has `agent_name="CA_yawKG67rCMG4"` for explicit dispatch consistency

<<<<<<< HEAD
