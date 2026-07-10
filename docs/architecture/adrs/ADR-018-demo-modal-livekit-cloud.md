### ADR-018: Demo Modal with LiveKit Cloud Agent

- **Date**: 2025-11-05
- **Decision**: Implemented demo modal on landing page with separate LiveKit Cloud-deployed agent
- **Rationale**:
  - **User Experience**: Allow visitors to instantly try voice AI without signup
  - **Isolation**: Demo agent separate from main interview agent (different prompt, duration)
  - **Scalability**: Cloud-hosted agent auto-scales, no local infrastructure needed
  - **Cost Optimization**: Cloud agent is bounded by durable global, IP, device, and browser-session budgets
- **Architecture**:
  ```
  Landing Page → "Try a 2-minute voice preview" Button
      ↓
  DemoModal Component Opens
      ↓
  POST /api/livekit/demo-token
      ↓
  1. Atomically reserve shared abuse budgets and one durable browser session
  2. Create a server-derived room and dispatch the configured demo agent once
  3. Return a short-lived microphone-only token + URL
      ↓
  LiveKit Cloud Agent Receives Dispatch
      ↓
  Agent joins room (cold start ~2-3 seconds)
      ↓
  Two-minute voice preview
      ↓
  Agent forcibly deletes the room at the hard cap
  ```
- **Key Components**:
  - **Demo Agent** (`/agent/demo/agent.py`): Two-minute optimized prompt with authoritative room deletion
  - **Demo Token API** (`/app/api/livekit/demo-token/route.ts`): Resolves signed identity and delegates to the bounded workflow
  - **DemoModal** (`/components/demo-modal.tsx`): LiveKit audio visualizer UI with mic toggle
  - **Hero Integration** (`/components/sections/hero.tsx`): Modal trigger button
- **Critical Configuration**:
  - **MUST set `agent_name` in WorkerOptions**: Required for explicit dispatch via AgentDispatchClient
  - **Room Name Pattern**: `demo-*` prefix for filtering/analytics
  - **Agent dispatch name**: Configured through `LIVEKIT_DEMO_AGENT_NAME`; never embedded in source
  - **Auto-cleanup**: Agent room deletion is authoritative; short empty/departure timeouts are safety nets
  - **Spend authority**: Postgres atomically enforces 100 previews/day globally in Production, 20/day per IP with a 3/10-minute burst, 2/day per device, and one dispatch per signed browser session
- **Consequences**:
  - Separate deployment pipeline for the preview agent through
    `agent/demo/Dockerfile` and `agent/demo/deploy.sh`
  - Cloud agent scales to zero when not in use (cost-effective)
  - No competition with self-hosted agents (isolated dispatch)
  - Faster iteration: update demo agent without affecting production interviews
  - **Important**: Agent requires `agent_name` parameter to receive dispatches
