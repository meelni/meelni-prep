# LiveKit Agent Debugging Guide

**Last Updated**: 2025-11-08
**Purpose**: Comprehensive troubleshooting guide for LiveKit Cloud agents

---

## Table of Contents

1. [Debugging Tools](#debugging-tools)
2. [Common Issues and Solutions](#common-issues-and-solutions)
3. [Model Configuration](#model-configuration)
4. [Deployment Best Practices](#deployment-best-practices)
5. [Quick Reference Commands](#quick-reference-commands)

---

## Debugging Tools

### 1. Agent Logs (Runtime)

View real-time agent activity and errors:

```bash
# View all runtime logs
lk agent logs

# View last 100 lines
lk agent logs | tail -100

# Follow logs in real-time (if supported)
lk agent logs --follow

# Search for specific room
lk agent logs | grep "interview-session-123"

# Search for errors
lk agent logs | grep -i "error"

# Search for specific issues
lk agent logs | grep -i "ModuleNotFoundError"
lk agent logs | grep -i "voice"
lk agent logs | grep -i "TTS"
```

**What to look for**:

- `ModuleNotFoundError`: Missing Python modules/files
- `AttributeError`: Invalid API usage or missing attributes
- `ValueError`: Invalid configuration (model names, voice IDs)
- TTS errors: `"elevenlabs error"`, `"cartesia error"`
- Agent lifecycle: `"agent started"`, `"session started"`, `"agent stopped"`

### 2. Deployment Logs

View Docker build and deployment events:

```bash
# View deployment logs
lk agent logs --log-type=deploy

# Check last deployment
lk agent logs --log-type=deploy | tail -50
```

**What to look for**:

- Deployment status: `"deployment succeeded"`, `"deployment failed"`
- Version numbers: Ensure latest version is deployed
- Rollback events: Previous deployments still active

### 3. Build Logs

View Docker build output:

```bash
# View build logs
lk agent logs --log-type=build

# Check for COPY errors
lk agent logs --log-type=build | grep -i "COPY"

# Check for dependency installation
lk agent logs --log-type=build | grep -i "requirement"
```

**What to look for**:

- `COPY failed`: Missing files/directories in Docker context
- `pip install failed`: Missing or incompatible dependencies
- Build warnings: Potential issues with dependencies

### 4. Agent Status

Check agent health and configuration:

```bash
# View agent status
lk agent status

# Output includes:
# - Agent ID
# - Status (active, inactive, error)
# - Current version
# - Last deployment time
# - Number of active sessions
```

---

## Common Issues and Solutions

### Issue 1: ModuleNotFoundError

**Symptoms**:

```
ModuleNotFoundError: No module named 'utils'
```

**Cause**: Missing directory in Dockerfile COPY command

**Solution**:

```dockerfile
# ❌ BAD - Only copies files, not directories
COPY agent.py .
COPY prompts.py .

# ✅ GOOD - Copy entire utils directory
COPY agent.py .
COPY prompts.py .
COPY utils/ ./utils/

# ✅ BETTER - Copy everything (use .dockerignore to exclude)
COPY . .
```

**Verification**:

```bash
# Check build logs for COPY errors
lk agent logs --log-type=build | grep -i "COPY"

# After fixing, redeploy the canonical Preview interview target
../agent/interview/deploy.sh preview
```

---

### Issue 2: Agent Not Speaking

**Symptoms**:

- Agent joins room but says nothing
- User sees "Agent connected" but no greeting
- No errors in logs

**Cause**: Missing initial greeting in prompts

**Solution**:

```python
# ❌ BAD - No greeting instruction
INSTRUCTIONS = """You are an AI interview coach.
Ask the user questions about product management."""

# ✅ GOOD - Explicit greeting
INSTRUCTIONS = """You are an AI interview coach.

CRITICAL: Start every new session by greeting the user warmly.
Example: "Hi! I'm Meelni, your AI interview coach. Ready to practice?"

Then proceed to ask interview questions."""
```

**Debugging Steps**:

1. Check logs for session start:
   ```bash
   lk agent logs | grep "session started"
   ```
2. Verify prompts have greeting instructions
3. Test with demo agent first (faster iteration)
4. Check if `session.say()` is called before `session.start()` completes (race condition)

**Race Condition Fix**:

```python
# ❌ BAD - Race condition
session = AgentSession(...)
session.say("Hello!")  # May not work - session not ready
await session.start(agent, room)

# ✅ GOOD - Let prompts handle greeting
session = AgentSession(...)
await session.start(agent, room)  # Agent greets via prompt instructions
```

---

### Issue 3: Invalid Voice ID

**Symptoms**:

```
elevenlabs error: Voice not found
ValueError: Invalid voice ID
```

**Cause**: Using wrong voice ID or incorrect format

**Solution**:

**ElevenLabs Voice ID Format**:

```python
# ✅ CORRECT - Full format with model and voice ID
tts_model = "elevenlabs/eleven_turbo_v2_5:21m00Tcm4TlvDq8ikWAM"

# Format breakdown:
# - Provider: elevenlabs
# - Model: eleven_turbo_v2_5
# - Voice ID: 21m00Tcm4TlvDq8ikWAM
```

**Cartesia Voice ID Format**:

```python
# ✅ CORRECT - Full format with model and voice ID
tts_model = "cartesia/sonic-3:6ccbfb76-1fc6-48f7-b71d-91ac6298247b"

# Format breakdown:
# - Provider: cartesia
# - Model: sonic-3
# - Voice ID: 6ccbfb76-1fc6-48f7-b71d-91ac6298247b
```

**How to Verify Voice IDs**:

1. **ElevenLabs**:
   - Go to: https://elevenlabs.io/app/voice-library
   - Click voice → Copy Voice ID
   - Test voice ID: `21m00Tcm4TlvDq8ikWAM` (Rachel - default)

2. **Cartesia**:
   - API endpoint: `GET https://api.cartesia.ai/voices`
   - No API key needed via LiveKit Inference
   - Test voice ID: `6ccbfb76-1fc6-48f7-b71d-91ac6298247b` (Tessa)

**Debugging**:

```bash
# Check logs for voice errors
lk agent logs | grep -i "voice"
lk agent logs | grep -i "elevenlabs"
lk agent logs | grep -i "cartesia"
```

---

### Issue 4: Agent Not Receiving Dispatches

**Symptoms**:

- Agent deployed successfully
- No errors in logs
- Agent never joins rooms when dispatched

**Cause**: Missing `agent_name` in WorkerOptions

**Solution**:

```python
# ❌ BAD - No agent_name (automatic dispatch only)
cli.run_app(
    WorkerOptions(
        entrypoint_fnc=entrypoint,
        prewarm_fnc=prewarm,
    ),
)

# ✅ GOOD - Explicit agent_name for dispatch
cli.run_app(
    WorkerOptions(
        entrypoint_fnc=entrypoint,
        prewarm_fnc=prewarm,
        agent_name="CA_yawKG67rCMG4",  # Required for explicit dispatch
    ),
)
```

**Verification**:

```bash
# Check agent status shows correct ID
lk agent status

# Verify dispatch call in backend uses matching ID
# /app/api/session/start/route.ts
const MAIN_AGENT_ID = "CA_yawKG67rCMG4";
await dispatchClient.createDispatch(roomName, MAIN_AGENT_ID);
```

---

### Issue 5: Agent Crashes on Startup

**Symptoms**:

```
Agent started but immediately stopped
Exit code: 1
```

**Common Causes**:

1. Missing environment variables
2. Invalid model names
3. Missing dependencies
4. Syntax errors in code

**Debugging Steps**:

```bash
# 1. Check runtime logs for exact error
lk agent logs | tail -100

# 2. Check environment variables
lk agent logs | grep -i "environment"
lk agent logs | grep -i "api key"

# 3. Verify model names
lk agent logs | grep -i "model"

# 4. Check dependencies
lk agent logs --log-type=build | grep -i "requirement"
```

**Solution Checklist**:

- [ ] All API keys set in LiveKit Cloud secrets
- [ ] Model names use correct format: `provider/model-name`
- [ ] All dependencies in `requirements.txt`
- [ ] No syntax errors (test locally first: `python agent.py dev`)

---

## Model Configuration

### Provider and Model Format

**Format**: `{provider}/{model-name}:{optional-voice-id}`

**Examples**:

```python
# STT Models
stt_model = "deepgram/nova-3"

# LLM Models
llm_model = "openai/gpt-4o"
llm_model = "openai/gpt-4.1-mini"
llm_model = "anthropic/claude-3-5-sonnet-20241022"

# TTS Models (without voice ID - uses default)
tts_model = "cartesia/sonic-3"
tts_model = "elevenlabs/eleven_turbo_v2_5"

# TTS Models (with voice ID - specific voice)
tts_model = "cartesia/sonic-3:6ccbfb76-1fc6-48f7-b71d-91ac6298247b"
tts_model = "elevenlabs/eleven_turbo_v2_5:21m00Tcm4TlvDq8ikWAM"
```

### Switching TTS Providers

**From Cartesia to ElevenLabs**:

```python
# Before (Cartesia)
tts_model = "cartesia/sonic-3:6ccbfb76-1fc6-48f7-b71d-91ac6298247b"

# After (ElevenLabs)
tts_model = "elevenlabs/eleven_turbo_v2_5:21m00Tcm4TlvDq8ikWAM"

# No API key changes needed - LiveKit Inference handles both
```

**From ElevenLabs to Cartesia**:

```python
# Before (ElevenLabs)
tts_model = "elevenlabs/eleven_turbo_v2_5:21m00Tcm4TlvDq8ikWAM"

# After (Cartesia)
tts_model = "cartesia/sonic-3:6ccbfb76-1fc6-48f7-b71d-91ac6298247b"
```

### API Keys via LiveKit Inference

**Important**: When using LiveKit Inference, you do NOT need separate API keys for Cartesia or ElevenLabs.

**Required Environment Variables**:

```bash
# Always required
LIVEKIT_API_KEY=your_livekit_key
LIVEKIT_API_SECRET=your_livekit_secret

# Required for LLMs
OPENAI_API_KEY=your_openai_key

# Required for STT
DEEPGRAM_API_KEY=your_deepgram_key

# NOT required when using LiveKit Inference
# CARTESIA_API_KEY=not_needed
# ELEVENLABS_API_KEY=not_needed
```

**How to verify**:

```bash
# Check what secrets are configured
lk agent status

# Production secret changes require a separately reviewed, target-bound adapter.
# Do not mutate agent secrets with the raw provider CLI.
```

---

## Deployment Best Practices

### 1. Test Locally First

Before deploying to LiveKit Cloud, always test locally:

```bash
# Activate virtual environment
cd agent
source venv/bin/activate

# Run in dev mode (auto-reload)
python agent.py dev

# Test in separate terminal
# - Go to /interview in browser
# - Verify agent joins and speaks
# - Check console for errors
```

### 2. Use Demo Agent for Testing

When testing configuration changes, use demo agent first:

```bash
# Edit demo_agent.py (faster iteration)
# Test on landing page demo modal

# Once verified, apply changes to main agent
# Deploy main agent
```

### 3. Check Logs After Deployment

Always verify deployment succeeded:

```bash
# Deploy the canonical Preview interview target
../agent/interview/deploy.sh preview

# Wait 30 seconds, then check logs
lk agent logs | tail -50

# Look for:
# - "deployment succeeded"
# - "agent started"
# - No errors
```

### 4. Maintain Separate Dockerfiles

Keep demo and main agents isolated:

```
agent/
├── Dockerfile.demo       # Demo agent (landing page)
├── Dockerfile           # Main agent (interviews)
├── .dockerignore.demo   # Demo exclusions
├── .dockerignore        # Main exclusions
```

**Deploy demo agent**:

```bash
./demo/deploy.sh preview
```

**Deploy main agent**:

```bash
# Deploy the canonical Preview interview target
./interview/deploy.sh preview
```

### 5. Document Agent IDs

Keep track of deployed agent IDs:

```
# Demo Agent
Agent ID: CA_t3sKQEihMQ7x
Purpose: 60-second landing page demos
Room Pattern: demo-*

# Main Interview Agent
Agent ID: CA_yawKG67rCMG4
Purpose: Full mock interviews
Room Pattern: interview-*
```

**Update in code**:

```typescript
// /app/api/livekit/demo-token/route.ts
const DEMO_AGENT_ID = "CA_t3sKQEihMQ7x";

// /app/api/session/start/route.ts
const MAIN_AGENT_ID = "CA_yawKG67rCMG4";
```

---

## Quick Reference Commands

### Viewing Logs

```bash
# Runtime logs (most useful for debugging)
lk agent logs

# Last 100 lines
lk agent logs | tail -100

# Search for specific room
lk agent logs | grep "room-name"

# Search for errors
lk agent logs | grep -i "error"

# Deployment logs
lk agent logs --log-type=deploy

# Build logs
lk agent logs --log-type=build
```

### Agent Management

```bash
# Check agent status
lk agent status

# Deploy the canonical Preview interview target
../agent/interview/deploy.sh preview

# Rollback, secret rotation, and deletion are Production mutations. No approved
# repository adapters exist for them yet; do not use raw provider commands.
```

### Switching Between Agents

Edit `agent/livekit.toml`:

```toml
# Demo agent
[agent]
name = "CA_t3sKQEihMQ7x"

# Main agent
[agent]
name = "CA_yawKG67rCMG4"
```

Then deploy the canonical Preview target:

```bash
../agent/interview/deploy.sh preview
```

---

## Troubleshooting Decision Tree

```
Agent not working?
├─ Agent not joining rooms?
│  ├─ Check agent_name in WorkerOptions
│  ├─ Verify agent ID in dispatch call
│  └─ Check lk agent status
│
├─ Agent joins but doesn't speak?
│  ├─ Check prompts have greeting instructions
│  ├─ Verify no race condition (session.say before session.start)
│  └─ Check lk agent logs for TTS errors
│
├─ Agent crashes on startup?
│  ├─ Check lk agent logs for exact error
│  ├─ Verify environment variables (lk agent status)
│  ├─ Check model names format (provider/model-name)
│  └─ Test locally first (python agent.py dev)
│
├─ TTS/Voice errors?
│  ├─ Verify voice ID format (provider/model:voiceId)
│  ├─ Check voice ID is valid (ElevenLabs library / Cartesia API)
│  ├─ Search logs: lk agent logs | grep -i "voice"
│  └─ Test with default voice (no voice ID suffix)
│
└─ ModuleNotFoundError?
   ├─ Check Dockerfile COPY commands
   ├─ Verify all directories are copied (COPY utils/ ./utils/)
   ├─ Check lk agent logs --log-type=build
   └─ Redeploy through the target-bound Preview wrapper
```

---

## Getting Help

### 1. Check Official Documentation

- LiveKit Agents: https://docs.livekit.io/agents/
- LiveKit Cloud: https://cloud.livekit.io/

### 2. Search GitHub Issues

- LiveKit Agents: https://github.com/livekit/agents/issues
- LiveKit Core: https://github.com/livekit/livekit/issues

### 3. Join LiveKit Community

- Discord: https://livekit.io/discord
- Forum: https://github.com/livekit/livekit/discussions

### 4. Internal Documentation

- Project docs: `.claude/CLAUDE.md`
- Deployment guide: `agent/DEPLOY_DEMO.md`
- Troubleshooting: This file

---

**End of Guide**
