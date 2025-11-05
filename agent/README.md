# MockMate Interview Agent

Python-based LiveKit Agent for conducting real-time AI mock interviews.

## Architecture

This agent:
- Joins LiveKit rooms as a programmable participant
- Uses Deepgram for Speech-to-Text (ASR)
- Uses GPT-4 for conversational responses
- Uses Cartesia for Text-to-Speech (TTS)
- Handles interruptions and natural conversation flow

## Setup

1. **Create virtual environment:**
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your credentials
   ```

## Running the Agent

**Development mode (with auto-reload):**
```bash
source venv/bin/activate
python agent.py dev
```

**Production mode:**
```bash
source venv/bin/activate
python agent.py start
```

## How It Works

1. User joins interview room from Next.js frontend
2. Agent worker detects new participant and launches agent instance
3. Agent joins the same room
4. Voice pipeline: User audio → Deepgram STT → GPT-4 → Cartesia TTS → User
5. Agent manages interview state and saves transcript to database

## Environment Variables

- `LIVEKIT_URL` - LiveKit server URL (e.g., wss://your-project.livekit.cloud)
- `LIVEKIT_API_KEY` - LiveKit API key
- `LIVEKIT_API_SECRET` - LiveKit API secret
- `OPENAI_API_KEY` - OpenAI API key for GPT-4
- `DEEPGRAM_API_KEY` - Deepgram API key for ASR
- `CARTESIA_API_KEY` - Cartesia API key for TTS

## Deployment

Deploy to Railway, Render, or Fly.io:

```bash
# Railway
railway up

# Render
# Connect your git repo and set build command: pip install -r agent/requirements.txt
# Start command: cd agent && python agent.py start

# Fly.io
fly deploy
```
