# LiveKit Agents Architecture & Guide

**Last Updated**: 2025-11-06
**LiveKit Agents Version**: 1.2.18
**Project**: Meelni - Real-Time AI Mock Interviews

> This is a historical provider guide and contains operational examples from
> earlier deployments. For current application truth, use
> `docs/contracts/interview-session-lifecycle.md`,
> `docs/contracts/livekit-room-metadata.md`, `agent/README.md`, and the runtime
> source. A LiveKit job ending or participant disconnect is an adapter signal;
> it is not the canonical Meelni session terminal outcome.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Key Components](#key-components)
4. [Worker Lifecycle](#worker-lifecycle)
5. [Development Workflow](#development-workflow)
6. [LiveKit Cloud Agent Deployment](#livekit-cloud-agent-deployment)
7. [Explicit Agent Dispatch](#explicit-agent-dispatch)
8. [Demo Modal Architecture](#demo-modal-architecture)
9. [Common Issues & Solutions](#common-issues--solutions)
10. [Configuration Reference](#configuration-reference)
11. [Voice Pipeline](#voice-pipeline)
12. [Best Practices](#best-practices)
13. [Resources](#resources)

---

## Overview

LiveKit Agents is a framework for building programmable, server-side participants that join LiveKit rooms. Our agent acts as an AI interviewer that conducts voice-based PM interviews.

**Key Capabilities**:
- Real-time voice conversation (STT → LLM → TTS)
- Automatic job dispatch from LiveKit Cloud
- Multi-session handling without restarts
- Interruption/barge-in support via VAD (Voice Activity Detection)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    LiveKit Cloud                             │
│  - WebRTC Infrastructure                                     │
│  - Room Management                                           │
│  - Job Dispatch                                              │
└────────────────┬────────────────────────────────────────────┘
                 │
                 │ WebSocket (persistent)
                 │
┌────────────────▼────────────────────────────────────────────┐
│               Agent Worker (Python)                          │
│  - Registers with LiveKit Cloud                             │
│  - Receives job dispatch requests                           │
│  - Spawns job subprocesses                                  │
│  - Manages process pool                                     │
└────────────────┬────────────────────────────────────────────┘
                 │
                 │ Spawns processes
                 │
┌────────────────▼────────────────────────────────────────────┐
│           Job Subprocess (per session)                       │
│  - Joins LiveKit room                                        │
│  - Listens to user audio                                    │
│  - Processes: Deepgram → GPT-4.1-mini → Cartesia           │
│  - Streams TTS back to room                                 │
│  - Exits when user disconnects                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Key Components

### 1. Main Worker Process

**File**: `agent/interview/agent.py` (lines 115-123)

```python
if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
            num_idle_processes=2,
            load_threshold=0.9,
        ),
    )
```

**Responsibilities**:
- Register with LiveKit Cloud via WebSocket
- Maintain persistent connection
- Receive job dispatch requests
- Manage process pool (idle + active jobs)
- Report worker status/load every 2.5 seconds

### 2. Job Subprocess

**Created for each room session**

**Lifecycle**:
1. Spawned when job request arrives
2. Connects to LiveKit room as participant
3. Initializes AgentSession (STT/LLM/TTS pipeline)
4. Listens to user audio via microphone track
5. Processes conversation turns
6. Exits when user disconnects or room closes

**Key Code Pattern**:
```python
async def entrypoint(ctx: JobContext):
    # Extract room metadata (interview config)
    metadata = json.loads(ctx.room.metadata)

    # Configure voice pipeline
    stt_model = metadata.get("stt_model", "deepgram/nova-3")
    llm_model = metadata.get("llm_model", "openai/gpt-4.1-mini")
    tts_model = f"cartesia/sonic-3:{metadata.get('voice')}"

    # Start AgentSession
    session = AgentSession(
        stt=stt_model,
        llm=llm_model,
        tts=tts_model,
        vad=ctx.proc.userdata["vad"],  # Silero VAD
    )

    await session.start(agent=InterviewAgent(instructions=...), room=ctx.room)
```

### 3. Prewarm Function

**Purpose**: Initialize resources before job starts (reduces latency)

```python
def prewarm(proc: JobProcess):
    """Prewarm function to load VAD model before agent starts"""
    proc.userdata["vad"] = silero.VAD.load()
```

**Note**: Changes to prewarm function require worker restart (not auto-reloaded in dev mode).

---

## Worker Lifecycle

### Startup Sequence

1. **Worker Registration**
   ```
   INFO - starting worker {"version": "1.2.18"}
   INFO - registered worker {"id": "AW_xyz123", "url": "wss://..."}
   ```

2. **Process Pool Initialization**
   - Spawns `num_idle_processes` (default: 2 in our config)
   - Each process calls `prewarm()` to load VAD model

3. **Wait for Jobs**
   - Worker maintains WebSocket connection to LiveKit Cloud
   - Sends availability status updates every 2.5 seconds

### Job Dispatch Flow

1. **Frontend creates room** with metadata via LiveKit SDK
2. **Frontend generates token** via `/api/livekit/token` route
3. **User connects** to room with token
4. **LiveKit Cloud dispatches job** to available worker
   ```
   INFO - received job request {"job_id": "AJ_abc", "room_name": "interview-123"}
   ```
5. **Worker spawns subprocess** (or reuses idle process)
6. **Subprocess joins room** and starts AgentSession
7. **Conversation proceeds** via voice pipeline
8. **User disconnects** → session closes → subprocess exits
9. **Worker spawns new idle process** to replace exited one

### Shutdown

- **Graceful shutdown**: SIGTERM/SIGINT → worker drains active jobs (up to `drain_timeout`)
- **Dev mode**: `drain_timeout=0` (immediate shutdown)
- **Production mode**: `drain_timeout=30min` (allows sessions to complete)

---

## Development Workflow

### Running the Agent

**Development Mode (with file watching)**:
```bash
cd agent
source venv/bin/activate
python agent.py dev
```

**Development Mode (without file watching)** - **RECOMMENDED for testing multiple sessions**:
```bash
python agent.py dev --no-watch
```

**Production Mode**:
```bash
python agent.py start
```

### Why Use `--no-watch`?

**Problem**: Dev mode's auto-reload mechanism tries to **resume old jobs** after file changes, preventing the worker from accepting new job dispatches for different rooms.

**Solution**: Use `--no-watch` flag when:
- Testing multiple sequential sessions
- Different rooms/sessions without restarting worker
- Want fresh job dispatch for each new room

**Trade-off**: Must manually restart agent after code changes.

### Making Code Changes (Self-Hosted Agents)

**With auto-reload (default `dev` mode)**:
- Worker detects file changes
- Attempts to preserve active jobs
- Restarts with new code
- **Problem**: Can cause issues with multiple sessions (see below)

**Without auto-reload (`--no-watch`)**:
- Worker does NOT reload on file changes
- Must manually kill and restart worker
- **Benefit**: Clean job dispatch for every new session

---

## LiveKit Cloud Agent Deployment

**Overview**: LiveKit Cloud provides managed hosting for agents with auto-scaling, rolling deployments, and zero-downtime updates.

### Agent Types in Meelni

1. **Demo Agent** (`demo_agent.py`): Deployed to LiveKit Cloud
   - 60-second product demos on landing page
   - Auto-scales based on demand
   - Agent ID: `CA_Wp8bi3bRroE2`

2. **Main Interview Agent** (`agent.py`): Self-hosted (local dev)
   - Full interview sessions
   - Planned for Railway/Render/Fly.io production deployment

### Prerequisites

```bash
# Install LiveKit CLI
brew install livekit-cli  # macOS
# or download from: https://docs.livekit.io/home/cli/

# Authenticate with LiveKit Cloud
lk cloud auth
```

### First-Time Deployment

**Step 1: Prepare Environment File**
```bash
cd agent

# Create .env.demo with your API keys
cat > .env.demo << EOF
OPENAI_API_KEY=your_openai_key_here
DEEPGRAM_API_KEY=your_deepgram_key_here
EOF

# Note: CARTESIA_API_KEY not needed when using LiveKit Inference!
```

**Step 2: Ensure Dockerfile Exists**
```bash
# Copy Dockerfile.demo to Dockerfile (CLI expects this name)
cp Dockerfile.demo Dockerfile
```

**Dockerfile.demo Structure**:
```dockerfile
FROM python:3.12-slim
WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y build-essential

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy agent code
COPY demo_agent.py .

# Run agent in production mode
CMD ["python", "demo_agent.py", "start"]
```

**Step 3: Deploy Agent**
```bash
# Create and deploy new agent (first time)
lk agent create --secrets-file .env.demo .

# Output will include agent ID (e.g., CA_Wp8bi3bRroE2)
# This is automatically saved to livekit.toml
```

**Step 4: Configure Agent Name for Explicit Dispatch**

**CRITICAL**: Update `demo_agent.py` to include `agent_name` in WorkerOptions:

```python
if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
            agent_name="CA_Wp8bi3bRroE2",  # Use your agent ID from Step 3
        ),
    )
```

**Why this is critical**:
- Without `agent_name`, the agent will NOT receive explicit dispatches
- Setting `agent_name` **disables automatic dispatch** entirely
- The agent will ONLY join rooms when dispatched via `AgentDispatchClient`

**Step 5: Redeploy with Agent Name**
```bash
# Deploy updated agent with agent_name configured
lk agent deploy .

# Wait for deployment to complete (~30-60 seconds)
```

**Step 6: Update Frontend with Agent ID**
```typescript
// Update /app/api/livekit/demo-token/route.ts
const DEMO_AGENT_ID = "CA_Wp8bi3bRroE2"; // Your agent ID from Step 3
```

### Updating Existing Agent

```bash
cd agent

# Ensure Dockerfile exists
cp Dockerfile.demo Dockerfile

# Deploy new version (rolling deployment)
lk agent deploy .

# Old instances stay active up to 1 hour to complete sessions
```

**Rolling Deployment Behavior**:
- New instances start with updated code
- Old instances continue serving active sessions
- Old instances drain and shut down after sessions complete (max 1 hour)
- Zero downtime for users

### Monitoring

```bash
# View agent status
lk agent status

# View runtime logs (agent activity)
lk agent logs

# View deployment logs (build/deploy events)
lk agent logs --log-type=deploy

# View build logs (Docker build output)
lk agent logs --log-type=build

# List all agents in project
lk agent list
```

**Key Log Messages**:
- `"Agent deployed successfully"` - Deployment complete
- `"Image built"` - Docker build succeeded
- `"Scaling up"` - New instances starting
- `"Draining old instances"` - Old version shutting down

### Troubleshooting Cloud Deployment

**Issue: Build Failed**
```bash
# View build logs
lk agent logs --log-type=build

# Common causes:
# - Missing dependencies in requirements.txt
# - Dockerfile syntax error
# - Base image not available
```

**Issue: Agent Not Receiving Dispatches**
```bash
# Check: Is agent_name set in WorkerOptions?
grep -A5 "WorkerOptions" demo_agent.py

# Should see: agent_name="CA_xxxxxxxxxxxx"

# View agent status
lk agent status

# Check dispatch in LiveKit dashboard
# Go to: https://cloud.livekit.io/projects/{project}/agents
```

**Issue: Runtime Errors**
```bash
# View runtime logs
lk agent logs

# Common causes:
# - Missing environment variables
# - Invalid model names (e.g., wrong format string)
# - API key issues
```

**Issue: Update Secrets**
```bash
# Update environment variables without redeploying
lk agent update-secrets \
  --secrets OPENAI_API_KEY=sk-new-key \
  --secrets DEEPGRAM_API_KEY=new-key
```

### Rollback

```bash
# Rollback to previous version
lk agent rollback

# Old version will be redeployed immediately
```

### Delete Agent

```bash
# Remove agent from LiveKit Cloud
lk agent delete

# WARNING: This will terminate all active sessions!
```

### Cloud Configuration Limitations

**DO NOT USE** (not supported on LiveKit Cloud):
- `load_threshold` - Reverted to default (0.7)
- `num_idle_processes` - Managed by Cloud
- `request_fnc` - Custom request handling not supported

**ONLY USE**:
- `entrypoint_fnc` - Your agent entrypoint
- `prewarm_fnc` - Prewarm function for VAD
- `agent_name` - Agent ID for explicit dispatch (REQUIRED)

**Why the limitations?**
Cloud agents are managed by LiveKit's orchestration system, which needs full control over scaling and load balancing.

### Cost Considerations

**LiveKit Cloud Agent Hosting**:
- Charges per active agent instance hour
- Auto-scales based on demand (0 to N instances)
- Scales to zero when no sessions active (no idle cost)
- Cold start: ~2-3 seconds (first dispatch after scale-to-zero)

**Demo Use Case** (60-second sessions):
- Agent only active during demo (~1 minute)
- Most cost-effective for sporadic, short-duration usage
- No 24/7 server costs vs self-hosted

**Production Considerations**:
- For high-volume (>100 concurrent sessions), self-hosting may be cheaper
- For predictable load, self-hosted with reserved instances may be more economical
- For sporadic load, Cloud auto-scaling is most cost-effective

---

## Explicit Agent Dispatch

**Overview**: Explicit dispatch gives you full control over which agent joins which room, enabling multi-agent architectures.

### Why Use Explicit Dispatch?

**Problems with Automatic Dispatch**:
- Multiple agents compete for job requests (first-available wins)
- Can't control which agent type handles which room
- Self-hosted and Cloud agents may conflict

**Benefits of Explicit Dispatch**:
- Route demo rooms to demo agent, interview rooms to main agent
- Support multiple agent types (different prompts, models, capabilities)
- Predictable agent assignment (no competition)
- Better isolation (demo agent never joins interview rooms)

### How It Works

**Traditional Automatic Dispatch**:
```
User joins room → LiveKit Cloud picks any available agent → Agent joins
```

**Explicit Dispatch**:
```
Backend creates room → Backend dispatches specific agent → Agent joins
```

### Implementation

**Step 1: Configure Agent with `agent_name`**

```python
# /agent/demo/agent.py
if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
            agent_name="CA_Wp8bi3bRroE2",  # CRITICAL: enables explicit dispatch
        ),
    )
```

**Key Behavior**:
- Setting `agent_name` **disables automatic dispatch**
- Agent will NOT join rooms unless explicitly dispatched
- `agent_name` must match deployed agent ID from `livekit.toml`

**Step 2: Backend Dispatch via AgentDispatchClient**

```typescript
// /app/api/livekit/demo-token/route.ts
import { AgentDispatchClient, RoomServiceClient } from "livekit-server-sdk";

const DEMO_AGENT_ID = "CA_Wp8bi3bRroE2"; // Must match agent_name

// Create room
const roomClient = new RoomServiceClient(livekit_url, apiKey, apiSecret);
await roomClient.createRoom({
  name: roomName,
  emptyTimeout: 120, // Auto-delete after 2 min
  maxParticipants: 2, // User + agent only
});

// Dispatch specific agent to room
const dispatchClient = new AgentDispatchClient(livekit_url, apiKey, apiSecret);
const dispatch = await dispatchClient.createDispatch(roomName, DEMO_AGENT_ID);

console.log("Agent dispatched:", dispatch);
```

**Step 3: Generate Token for User**

```typescript
const token = new AccessToken(apiKey, apiSecret, {
  identity: participantName,
});

token.addGrant({
  roomJoin: true,
  room: roomName,
});

return { token: token.toJwt(), url: livekit_url, roomName };
```

### Dispatch Metadata

Pass configuration to agent via room metadata:

```typescript
const metadata = {
  demo_mode: true,
  duration: 60,
  question_type: "product_sense",
};

await roomClient.createRoom({
  name: roomName,
  metadata: JSON.stringify(metadata),
});
```

Agent reads metadata in entrypoint:

```python
async def entrypoint(ctx: JobContext):
    metadata = json.loads(ctx.room.metadata or "{}")
    is_demo = metadata.get("demo_mode", False)
    duration = metadata.get("duration", 1800)
```

### Multiple Agent Types

**Example Architecture**:
```typescript
// Demo modal
const DEMO_AGENT_ID = "CA_Wp8bi3bRroE2";
await dispatchClient.createDispatch(demoRoomName, DEMO_AGENT_ID);

// Full interview
const INTERVIEW_AGENT_ID = "CA_xyz789abc";
await dispatchClient.createDispatch(interviewRoomName, INTERVIEW_AGENT_ID);
```

**Agent Routing by Room Name Pattern**:
```python
# Alternative: Agents can filter rooms by name pattern
async def request_fnc(ctx: JobRequest) -> bool:
    # Only accept demo rooms
    return ctx.room.name.startswith("demo-")
```

**Note**: `request_fnc` is NOT supported on LiveKit Cloud. Use explicit dispatch instead.

### Debugging Explicit Dispatch

**Check 1: Agent has `agent_name` configured**
```bash
grep -A5 "WorkerOptions" demo_agent.py
# Should see: agent_name="CA_Wp8bi3bRroE2"
```

**Check 2: Frontend uses correct agent ID**
```bash
grep "DEMO_AGENT_ID" app/api/livekit/demo-token/route.ts
# Should match agent_name from agent code
```

**Check 3: Dispatch succeeded**
```typescript
// Check API response
const dispatch = await dispatchClient.createDispatch(roomName, agentId);
console.log("Dispatch:", dispatch);
// Should return: { id: "...", agentId: "CA_...", roomName: "..." }
```

**Check 4: Agent received dispatch**
```bash
lk agent logs
# Should see: "received job request" with matching room name
```

### Common Pitfalls

**Pitfall 1: Missing `agent_name`**
- Symptom: Agent joins random rooms automatically
- Fix: Add `agent_name` to WorkerOptions

**Pitfall 2: Agent ID mismatch**
- Symptom: Dispatch succeeds but agent doesn't join
- Fix: Ensure `agent_name` matches `DEMO_AGENT_ID` exactly

**Pitfall 3: Multiple self-hosted agents competing**
- Symptom: First session works, subsequent sessions fail
- Fix: Either stop self-hosted agents OR configure them with `agent_name`

---

## Demo Modal Architecture

**Purpose**: Provide instant voice AI demo on landing page without requiring signup.

### Architecture Flow

```
┌──────────────────────────────────────────────────────────────┐
│                      Landing Page                             │
│                                                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Hero Section                                          │  │
│  │  ┌──────────────────────────────────────────────────┐  │  │
│  │  │  "Talk to Meelni" Button                         │  │  │
│  │  │  onClick={() => setIsDemoModalOpen(true)}        │  │  │
│  │  └──────────────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       │ Button Click
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                    DemoModal Opens                            │
│                                                               │
│  1. useEffect triggers on mount                              │
│  2. Fetches token from /api/livekit/demo-token              │
│  3. Displays "Connecting..." state                           │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       │ POST /api/livekit/demo-token
                       ▼
┌──────────────────────────────────────────────────────────────┐
│              Demo Token API Route                             │
│                                                               │
│  1. Generate unique room: demo-{timestamp}-{random}          │
│  2. Create room with RoomServiceClient                       │
│     - emptyTimeout: 120 (auto-delete after 2 min)           │
│     - maxParticipants: 2 (user + agent only)                │
│  3. Dispatch Cloud agent with AgentDispatchClient            │
│     - agentId: "CA_Wp8bi3bRroE2"                            │
│  4. Generate participant access token                        │
│  5. Return { token, url, roomName }                          │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       │ Dispatch → LiveKit Cloud
                       ▼
┌──────────────────────────────────────────────────────────────┐
│            LiveKit Cloud Agent Receives Dispatch              │
│                                                               │
│  1. Agent worker receives job request                        │
│  2. Spawns job subprocess (cold start ~2-3s)                 │
│  3. Subprocess connects to room                              │
│  4. Initializes AgentSession with demo prompt                │
│  5. Agent appears as participant in room                     │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       │ Agent Joined
                       ▼
┌──────────────────────────────────────────────────────────────┐
│              DemoModal LiveKit Connection                     │
│                                                               │
│  1. LiveKitRoom connects with token                          │
│  2. useVoiceAssistant hook initializes                       │
│  3. BarVisualizer displays audio waveform                    │
│  4. User speaks → Deepgram → GPT-4.1-mini → Cartesia        │
│  5. Agent responds with audio                                │
│  6. 60-second demo conversation                             │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       │ User Clicks Close or "Start Full Interview"
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                    Session Cleanup                            │
│                                                               │
│  1. User disconnects from room                               │
│  2. Agent detects participant disconnect                     │
│  3. Agent session closes                                     │
│  4. Room auto-deletes after 2 minutes (emptyTimeout)         │
│  5. Cloud agent scales down (no active sessions)             │
└──────────────────────────────────────────────────────────────┘
```

### Key Components

**1. DemoModal Component** (`/components/demo-modal.tsx`)
```typescript
export function DemoModal({ isOpen, onClose }: DemoModalProps) {
  const [token, setToken] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && !token) {
      fetch("/api/livekit/demo-token", {
        method: "POST",
        body: JSON.stringify({ participantName: "Demo User" }),
      })
        .then((res) => res.json())
        .then((data) => {
          setToken(data.token);
          setUrl(data.url);
        });
    }
  }, [isOpen]);

  if (!token || !url) return <div>Connecting...</div>;

  return (
    <LiveKitRoom token={token} serverUrl={url} connect={true} audio={true}>
      <DemoControls onClose={onClose} />
    </LiveKitRoom>
  );
}
```

**2. Demo Token API** (`/app/api/livekit/demo-token/route.ts`)
```typescript
export async function POST(request: Request) {
  const { participantName } = await request.json();

  // Generate unique room name
  const roomName = `demo-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  // Create room
  await roomClient.createRoom({
    name: roomName,
    emptyTimeout: 120,
    maxParticipants: 2,
  });

  // Dispatch Cloud agent
  const dispatchClient = new AgentDispatchClient(livekit_url, apiKey, apiSecret);
  await dispatchClient.createDispatch(roomName, "CA_Wp8bi3bRroE2");

  // Generate token
  const token = new AccessToken(apiKey, apiSecret, { identity: participantName });
  token.addGrant({ roomJoin: true, room: roomName });

  return Response.json({ token: token.toJwt(), url: livekit_url, roomName });
}
```

**3. Demo Agent** (`/agent/demo/agent.py`)
```python
DEMO_AGENT_INSTRUCTIONS = """You are Meelni, an AI interview coach giving a 60-second product demo.

Structure (keep under 60 seconds total):
1. Introduce yourself briefly (10s): "Hi! I'm Meelni, your AI interview coach."
2. Ask ONE quick product sense question (10s)
3. Listen to their response (max 20s)
4. Give very brief feedback (10s): one strength, one improvement
5. End with: "Ready for a full mock interview? Click 'Start Full Interview' on the page!"

Keep responses SHORT and FAST. This is a quick preview, not a full interview."""

if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
            agent_name="CA_Wp8bi3bRroE2",  # Required for explicit dispatch
        ),
    )
```

### Room Naming Convention

**Pattern**: `demo-{timestamp}-{random}`

**Example**: `demo-1699234567890-a3x9k2`

**Benefits**:
- Guaranteed uniqueness (timestamp + random)
- Easy to identify demo rooms in analytics
- Can filter/query by prefix (`demo-*`)
- Chronological ordering by timestamp

### Auto-Cleanup

**Configuration**:
```typescript
emptyTimeout: 120  // Room deleted 2 minutes after last participant leaves
```

**Behavior**:
- User leaves → room empty → 2-minute countdown starts
- After 2 minutes → room deleted from LiveKit Cloud
- No manual cleanup needed
- Prevents orphaned rooms from accumulating

### User Experience Flow

1. **Landing page** → User clicks "Talk to Meelni"
2. **Modal opens** → Shows "Connecting..." (~2-3 seconds)
3. **Agent joins** → Status changes to "Connected"
4. **Agent speaks first** → "Hi! I'm Meelni..."
5. **User responds** → Audio visualizer shows activity
6. **60-second demo** → Quick question + feedback
7. **Agent prompts** → "Ready for a full mock interview?"
8. **User exits** → Either closes modal or clicks "Start Full Interview"

### Monitoring Demo Sessions

```bash
# View active demo rooms
lk room list | grep "demo-"

# View demo agent activity
lk agent logs | grep "demo-"

# Check agent status
lk agent status
```

**Key Metrics to Track**:
- Demo completion rate (% who finish 60 seconds)
- Conversion rate (% who click "Start Full Interview")
- Cold start latency (time to agent first speech)
- Average demo duration

---

## Common Issues & Solutions

### Issue 1: Worker Only Handles One Session, Then Stops Receiving Jobs

**Symptoms**:
- First session works perfectly
- Second session gets stuck on "connecting..."
- No "received job request" in agent logs
- Worker remains registered with LiveKit Cloud

**Root Cause**:
Dev mode's auto-reload mechanism tries to resume the old job after file changes, blocking new job dispatches.

**Solution**:
```bash
python agent.py dev --no-watch
```

**Details**:
- When files change, `WatchServer` captures "active" jobs to preserve them during reload
- Even if the original room is gone, the reloaded job blocks the worker's capacity
- With `--no-watch`, no auto-reload occurs, so each new room gets a fresh job dispatch

**Reference**: `livekit-agents/livekit/agents/cli/watcher.py:101-115`

---

### Issue 2: Cloud Agent Not Receiving Explicit Dispatches

**Symptoms**:
- AgentDispatchClient.createDispatch() succeeds
- Dispatch ID returned successfully
- But Cloud agent never joins the room
- No "received job request" in agent logs

**Root Cause**:
Missing `agent_name` in WorkerOptions. Without this parameter, the agent uses automatic dispatch mode and **ignores explicit dispatches**.

**Solution**:
```python
# CRITICAL: Add agent_name to WorkerOptions
if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
            agent_name="CA_Wp8bi3bRroE2",  # Your agent ID from livekit.toml
        ),
    )
```

**Verification**:
```bash
# Check agent configuration
grep -A5 "WorkerOptions" agent/demo/agent.py

# Should see: agent_name="CA_xxxxxxxxxxxx"

# Check agent status
lk agent status

# Test dispatch
lk agent logs
# Should see: "received job request" when dispatch occurs
```

**Important Notes**:
- `agent_name` must EXACTLY match the agent ID in `livekit.toml`
- Setting `agent_name` **disables automatic dispatch**
- The agent will ONLY respond to explicit dispatches via AgentDispatchClient
- After adding `agent_name`, redeploy with `lk agent deploy .`

---

### Issue 3: Custom `load_threshold` Ignored on LiveKit Cloud

**Symptoms**:
- Set `load_threshold=0.9` in `WorkerOptions`
- Worker still seems unavailable after handling jobs

**Root Cause**:
When using LiveKit Cloud (detected via `_worker_token`), custom `load_fnc` and `load_threshold` settings are **overridden and reverted to defaults**.

**Default Values**:
- **Dev mode**: `load_threshold = math.inf` (disabled)
- **Production mode**: `load_threshold = 0.7`

**Solution**:
- In dev mode, load threshold is disabled anyway (shouldn't be an issue)
- In production, you cannot customize `load_threshold` on LiveKit Cloud
- Consider self-hosted LiveKit server if you need custom load settings

**Reference**: `livekit-agents/livekit/agents/worker.py:290-300`

---

### Issue 3: Agent Doesn't Join Room

**Symptoms**:
- Frontend creates room successfully
- Token generation works
- Agent receives job request
- But agent doesn't appear in room

**Possible Causes**:

1. **Token mismatch**: Room name in token doesn't match actual room
   ```typescript
   // Check: app/api/livekit/token/route.ts
   const token = new AccessToken(apiKey, apiSecret, {
     identity: participantName,
   });
   token.addGrant({ roomJoin: true, room: roomName });
   ```

2. **Metadata parsing error**: Agent crashes when parsing room metadata
   ```python
   # Check: agent/interview/agent.py
   metadata = json.loads(ctx.room.metadata or "{}")
   ```

3. **API key mismatch**: Agent using different LIVEKIT_API_KEY than frontend
   ```bash
   # Verify in agent/.env and .env.local
   LIVEKIT_API_KEY=your_key
   LIVEKIT_API_SECRET=your_secret
   ```

---

### Issue 4: Voice Pipeline Not Working

**Symptoms**:
- Agent joins room
- User can see agent participant
- But no audio or transcription

**Debug Steps**:

1. **Check model configuration**:
   ```python
   logger.info(f"STT Model: {stt_model}")
   logger.info(f"LLM Model: {llm_model}")
   logger.info(f"TTS Model: {tts_model}")
   ```

2. **Verify API keys**:
   ```bash
   # Agent needs these in .env
   OPENAI_API_KEY=sk-...
   DEEPGRAM_API_KEY=...
   # Cartesia does NOT need API key with LiveKit Inference
   ```

3. **Check microphone permissions**: User must grant mic access in browser

4. **Look for VAD issues**:
   ```
   DEBUG - start reading stream {"participant": "user-xyz", "source": "SOURCE_MICROPHONE"}
   ```

---

## Configuration Reference

### WorkerOptions

```python
WorkerOptions(
    entrypoint_fnc: Callable,       # Required: async function called for each job
    prewarm_fnc: Callable,          # Optional: called before job starts
    num_idle_processes: int,        # Dev default: 0, Prod default: 4
    load_threshold: float,          # Dev default: inf, Prod default: 0.7 (ignored on LiveKit Cloud)
    drain_timeout: int,             # Dev default: 0, Prod default: 1800 (seconds)
    worker_type: WorkerType,        # ROOM (default) or PUBLISHER
    permissions: ParticipantPermissions,  # Agent's room permissions
)
```

### AgentSession Parameters

```python
AgentSession(
    stt: str,            # "deepgram/nova-3" or "deepgram"
    llm: str,            # "openai/gpt-4.1-mini" or "openai/gpt-4o-mini"
    tts: str,            # "cartesia/sonic-3:<voice_id>"
    vad: VAD,            # Silero VAD instance from prewarm
)
```

### Model Format Strings

**STT (Speech-to-Text)**:
- `"deepgram"` - uses default Nova-2 model
- `"deepgram/nova-2"` - explicit Nova-2
- `"deepgram/nova-3"` - upgraded model (recommended)

**LLM (Language Model)**:
- `"openai/gpt-4o-mini"` - cost-effective, fast
- `"openai/gpt-4.1-mini"` - better reasoning (recommended)
- `"openai/gpt-4-turbo"` - highest quality, higher cost

**TTS (Text-to-Speech)**:
- `"cartesia"` - uses default voice
- `"cartesia/sonic-3:<voice_id>"` - specific voice with Sonic 3 model
- Example: `"cartesia/sonic-3:6ccbfb76-1fc6-48f7-b71d-91ac6298247b"` (Tessa voice)

**Note**: When using LiveKit Inference, Cartesia does NOT require a separate API key.

---

## Voice Pipeline

### Flow Diagram

```
User speaks
    ↓
Microphone Audio Stream
    ↓
Silero VAD (Voice Activity Detection)
    ↓
Deepgram Nova-3 (Speech-to-Text)
    ↓
GPT-4.1-mini (Language Model)
    ↓
Cartesia Sonic 3 (Text-to-Speech)
    ↓
Audio Stream to Room
    ↓
User hears agent
```

### VAD (Voice Activity Detection)

**Purpose**: Detect when user is speaking vs. silence

**Implementation**: Silero VAD (loaded in prewarm)

**Benefits**:
- Enables barge-in (agent stops speaking when user interrupts)
- Reduces false transcriptions from background noise
- On-device processing (no API cost)

### Interruption Handling

**Built-in Barge-In**:
- VAD detects user speech while agent is speaking
- Agent immediately stops TTS playback
- User's new input is processed
- Enables natural conversation flow

---

## Best Practices

### 1. Use `--no-watch` for Multi-Session Testing

Always use `--no-watch` when testing multiple sequential sessions to avoid auto-reload issues.

### 2. Validate Room Metadata

```python
async def entrypoint(ctx: JobContext):
    try:
        metadata = json.loads(ctx.room.metadata or "{}")
    except json.JSONDecodeError:
        logger.error("Invalid room metadata")
        return

    # Provide defaults for optional fields
    role = metadata.get("role", "interviewee")
    mode = metadata.get("mode", "mock_interview")
```

### 3. Log Configuration at Session Start

```python
logger.info(f"Configuration: {metadata}")
logger.info(f"STT Model: {stt_model}")
logger.info(f"LLM Model: {llm_model}")
logger.info(f"TTS Model: {tts_model}")
```

Makes debugging much easier when sessions fail.

### 4. Monitor Worker Logs

**Key log messages**:
- `"received job request"` - New session starting
- `"process initialized"` - Job subprocess ready
- `"Voice agent started successfully"` - AgentSession running
- `"start reading stream"` - Listening to user audio
- `"received user transcript"` - STT working
- `"closing agent session due to participant disconnect"` - User left
- `"session closed"` - Job completed

### 5. Handle Graceful Shutdown

In production, ensure `drain_timeout` is long enough for typical sessions:

```python
WorkerOptions(
    entrypoint_fnc=entrypoint,
    prewarm_fnc=prewarm,
    drain_timeout=1800,  # 30 minutes (default in prod)
)
```

### 6. Separate Dev and Prod Configs

```python
import os

is_production = os.getenv("ENVIRONMENT") == "production"

WorkerOptions(
    entrypoint_fnc=entrypoint,
    prewarm_fnc=prewarm,
    num_idle_processes=4 if is_production else 2,
    drain_timeout=1800 if is_production else 0,
)
```

---

## Resources

### Official Documentation

- **LiveKit Agents GitHub**: https://github.com/livekit/agents
- **LiveKit Core GitHub**: https://github.com/livekit/livekit
- **LiveKit Docs**: https://docs.livekit.io/agents/
- **Agent Dispatch**: https://docs.livekit.io/agents/worker/agent-dispatch/
- **Worker Options**: https://docs.livekit.io/agents/worker/options/
- **Job Lifecycle**: https://docs.livekit.io/agents/worker/job/

### API References

- **Python API Docs**: https://docs.livekit.io/reference/python/livekit/agents/
- **Cartesia Voice Library**: https://docs.cartesia.ai/getting-started/available-models
- **Deepgram Models**: https://developers.deepgram.com/docs/models-overview

### Key Source Files (for debugging)

- `livekit-agents/livekit/agents/worker.py:290-300` - LiveKit Cloud overrides
- `livekit-agents/livekit/agents/worker.py:720-725` - Worker status updates
- `livekit-agents/livekit/agents/worker.py:938-944` - Load threshold check
- `livekit-agents/livekit/agents/cli/watcher.py:101-115` - Auto-reload mechanism

### Community

- **LiveKit Slack**: https://livekit.io/join-slack
- **GitHub Issues**: https://github.com/livekit/agents/issues

---

## Appendix: Troubleshooting Checklist

When debugging agent issues:

- [ ] Check worker registered successfully (see `"registered worker"` log)
- [ ] Verify job request received (see `"received job request"` log)
- [ ] Check room metadata is valid JSON
- [ ] Verify all API keys are set in `.env`
- [ ] Confirm model format strings are correct
- [ ] Check user granted microphone permissions
- [ ] Look for exceptions in agent logs
- [ ] Verify LiveKit Cloud dashboard shows room + participants
- [ ] Test with `--no-watch` flag if multi-session issues
- [ ] Confirm frontend creates unique room names
- [ ] Check token generation includes correct room name

---

**End of Document**
