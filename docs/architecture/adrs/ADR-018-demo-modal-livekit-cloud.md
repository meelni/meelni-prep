### ADR-018: Demo Modal with LiveKit Cloud Agent

- **Date**: 2025-11-05
- **Decision**: Implemented demo modal on landing page with separate LiveKit Cloud-deployed agent
- **Rationale**:
  - **User Experience**: Allow visitors to instantly try voice AI without signup
  - **Isolation**: Demo agent separate from main interview agent (different prompt, duration)
  - **Scalability**: Cloud-hosted agent auto-scales, no local infrastructure needed
  - **Cost Optimization**: Cloud agent only active during demo sessions (~60 seconds)
- **Architecture**:
  ```
  Landing Page → "Talk to Meelni" Button
      ↓
  DemoModal Component Opens
      ↓
  POST /api/livekit/demo-token
      ↓
  1. Create unique room: demo-{timestamp}-{random}
  2. AgentDispatchClient.createDispatch(roomName, "CA_Wp8bi3bRroE2")
  3. Return token + url
      ↓
  LiveKit Cloud Agent Receives Dispatch
      ↓
  Agent joins room (cold start ~2-3 seconds)
      ↓
  Server-bounded two-minute voice preview
      ↓
  Room auto-deletes after 2 minutes (emptyTimeout)
  ```
- **Key Components**:
  - **Demo Agent** (`/agent/demo/agent.py`): two-minute preview prompt and hard-stop runtime, separate from the main agent
  - **Demo Token API** (`/app/api/livekit/demo-token/route.ts`): Creates room + dispatches Cloud agent
  - **DemoModal** (`/components/demo-modal.tsx`): LiveKit audio visualizer UI with mic toggle
  - **Hero Integration** (`/components/sections/hero.tsx`): Modal trigger button
- **Critical Configuration**:
  - **MUST set `agent_name` in WorkerOptions**: Required for explicit dispatch via AgentDispatchClient
  - **Room Name Pattern**: `demo-*` prefix for filtering/analytics
  - **Agent ID**: `CA_Wp8bi3bRroE2` (deployed to LiveKit Cloud)
  - **Auto-cleanup**: `emptyTimeout: 120` (room deleted 2 min after last participant)
- **Consequences**:
  - Separate deployment pipeline for demo agent (uses `Dockerfile.demo`)
  - Cloud agent scales to zero when not in use (cost-effective)
  - No competition with self-hosted agents (isolated dispatch)
  - Faster iteration: update demo agent without affecting production interviews
  - **Important**: Agent requires `agent_name` parameter to receive dispatches
