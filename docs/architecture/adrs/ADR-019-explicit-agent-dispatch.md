### ADR-019: Explicit Agent Dispatch Pattern
- **Date**: 2025-11-05
- **Decision**: Use LiveKit's explicit agent dispatch instead of automatic dispatch
- **Rationale**:
  - **Control**: Choose which agent joins which room (demo vs interview)
  - **Multi-Agent Support**: Run multiple agent types simultaneously
  - **Room Filtering**: Agents can filter by room name patterns
  - **Dispatch Metadata**: Pass context to agents via metadata
- **Implementation**:
  ```python
  # Agent Configuration (CRITICAL)
  cli.run_app(
      WorkerOptions(
          entrypoint_fnc=entrypoint,
          prewarm_fnc=prewarm,
          agent_name="CA_Wp8bi3bRroE2",  # Required for explicit dispatch!
      ),
  )
  ```
  ```typescript
  // Backend Dispatch (Next.js API)
  import { AgentDispatchClient } from "livekit-server-sdk";

  const dispatchClient = new AgentDispatchClient(livekit_url, apiKey, apiSecret);
  const dispatch = await dispatchClient.createDispatch(roomName, agentId);
  ```
- **Key Discovery**:
  - Setting `agent_name` in WorkerOptions **disables automatic dispatch**
  - Agent will ONLY join rooms when explicitly dispatched via AgentDispatchClient
  - Without `agent_name`, multiple self-hosted agents compete for job dispatches
  - Explicit dispatch provides full control over agent assignment
- **Consequences**:
  - More complex setup (must configure agent_name + dispatch API)
  - Better isolation: demo agent never joins interview rooms
  - Easier debugging: dispatch logs show which agent was assigned
  - Supports multi-tenant scenarios (assign agents by customer/use-case)

