# LiveKit Agents Architecture & Guide

**Last Updated**: 2025-11-05
**LiveKit Agents Version**: 1.2.18
**Project**: MockMate - Real-Time AI Mock Interviews

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Key Components](#key-components)
4. [Worker Lifecycle](#worker-lifecycle)
5. [Development Workflow](#development-workflow)
6. [Common Issues & Solutions](#common-issues--solutions)
7. [Configuration Reference](#configuration-reference)
8. [Voice Pipeline](#voice-pipeline)
9. [Best Practices](#best-practices)
10. [Resources](#resources)

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

**File**: `agent/agent.py` (lines 115-123)

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

### Making Code Changes

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

### Issue 2: Custom `load_threshold` Ignored on LiveKit Cloud

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
   # Check: agent/agent.py
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
