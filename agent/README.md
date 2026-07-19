# Meelni Agents

Python-based LiveKit Agents for conducting real-time AI mock interviews.

**Parent Documentation:** [Root README](../README.md) | [Project Architecture](../.claude/CLAUDE.md)

---

## 📁 Project Structure

```
agent/
├── demo/                    # 5-minute demo agent for landing page
│   ├── agent.py            # Demo agent entrypoint
│   ├── Dockerfile          # Docker config
│   ├── deploy.sh           # Deployment script
│   └── README.md           # Demo agent documentation
├── interview/              # Full interview agent for authenticated users
│   ├── agent.py            # Interview agent entrypoint
│   ├── Dockerfile          # Docker config
│   ├── deploy.sh           # Deployment script
│   └── README.md           # Interview agent documentation
├── shared/                 # Shared code between agents
│   ├── config.py           # Configuration parsing
│   ├── prompts.py          # Interview prompts and frameworks
│   └── utils/              # Shared utilities
│       └── prompt_builder.py  # Dynamic prompt generation
├── docs/                   # Documentation
│   ├── DEPLOYMENT.md       # Deployment guide
│   └── QUESTION_BANK_INTEGRATION.md  # Question bank docs
├── scripts/                # Development and test scripts
│   ├── test_greeting.py
│   ├── test_prompts.py
│   └── show_sample_prompt.py
├── requirements.txt        # Python dependencies (shared)
└── venv/                   # Virtual environment
```

---

## 🎯 Two Agent Types

### Demo Agent (`demo/`)

- **Purpose**: Quick 5-minute demos for landing page visitors
- **Duration**: 5 minutes (auto-terminates)
- **Questions**: 1 question from bank or fallback
- **Tone**: Energetic, conversational, fast-paced
- **Dispatch name**: configured with `LIVEKIT_DEMO_AGENT_NAME`
- **Documentation**: [demo/README.md](demo/README.md)

### Interview Agent (`interview/`)

- **Purpose**: Full mock interviews for authenticated users
- **Duration**: 15, 30, or 45 minutes (configurable)
- **Features**: 4 interview types, 3 difficulty levels, real-time transcripts
- **Tone**: Professional, realistic PM interviewer; evaluation follows the interview
- **Dispatch name**: configured with `LIVEKIT_INTERVIEW_AGENT_NAME`
- **Documentation**: [interview/README.md](interview/README.md)

---

## 🏗️ Architecture

Both agents use the same voice pipeline:

```
User speaks → Deepgram Nova-3 (STT) → GPT-4/GPT-4.1-mini (LLM) → ElevenLabs (TTS) → User hears
                                              ↓
                                    Silero VAD (interruption detection)
```

| Component | Provider                                 | Purpose                               |
| --------- | ---------------------------------------- | ------------------------------------- |
| **STT**   | Deepgram Nova-3                          | Speech-to-text with low latency       |
| **LLM**   | GPT-4o (demo) / GPT-4.1-mini (interview) | Conversational intelligence           |
| **TTS**   | ElevenLabs Eleven Turbo v2.5             | Natural speech synthesis              |
| **VAD**   | Silero                                   | Voice activity detection for barge-in |

---

## ⚡ Quick Start

### Prerequisites

- Python 3.10 or higher
- Active LiveKit Cloud project
- API keys: OpenAI, Deepgram

### 1. Create Virtual Environment

```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

### 2. Install Dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

### 3. Configure Environment

Create a `.env` file in the agent directory:

```bash
LIVEKIT_URL=wss://your-project.livekit.cloud
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret
LIVEKIT_INTERVIEW_AGENT_NAME=your_interview_agent_name
LIVEKIT_DEMO_AGENT_NAME=your_demo_agent_name
OPENAI_API_KEY=your_openai_key
DEEPGRAM_API_KEY=your_deepgram_key
```

### 4. Run Agents Locally

**Demo Agent:**

```bash
cd demo
python agent.py dev
```

**Interview Agent:**

```bash
cd interview
python agent.py dev
```

---

## 🚀 Deployment

Both agents are deployed to LiveKit Cloud.

**Deploy Demo Agent:**

```bash
cd demo
./deploy.sh preview # or production
```

**Deploy Interview Agent:**

```bash
cd interview
./deploy.sh preview # or production
```

Each target uses an explicit external config, URL anchor, and agent ID. A
Production deploy additionally consumes a signed exact-action artifact before
`lk` can run. Preview does not require owner Production authorization. No
owner public key is enrolled yet, so Production deploys intentionally fail
closed; see
[Production action authorization](../docs/operations/production-action-authorization.md).

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for detailed deployment instructions.

---

## 🔐 Environment Variables

| Variable             | Required | Description                                   |
| -------------------- | -------- | --------------------------------------------- |
| `LIVEKIT_URL`        | ✅       | LiveKit WebSocket URL                         |
| `LIVEKIT_API_KEY`    | ✅       | LiveKit API key                               |
| `LIVEKIT_API_SECRET` | ✅       | LiveKit API secret                            |
| `OPENAI_API_KEY`     | ✅       | OpenAI API key                                |
| `DEEPGRAM_API_KEY`   | ✅       | Deepgram API key (for Nova-3 ASR)             |
| `CARTESIA_API_KEY`   | ❌       | **Not required** when using LiveKit Inference |

**Note:** If running outside of Conductor, create a `.env` file in the `agent/` directory.

---

## 📖 How It Works

### 1. Room Connection

When a user starts an interview:

1. Authenticated `/api/session/start` reserves a credit, creates the session and
   room, dispatches the interview agent, and returns a participant token.
2. The user joins the server-generated room (for example,
   `interview-abc123`).
3. The agent worker receives the explicit dispatch and joins the same room.
4. If the browser needs a fresh initial-connect token, authenticated
   `/api/livekit/token` authorizes the owned active session and derives the room
   and participant identity server-side.

### 2. Voice Pipeline Orchestration

The agent uses LiveKit's `AgentSession` API to orchestrate the voice pipeline:

```python
session = AgentSession(
    stt="deepgram/nova-3",           # Speech-to-Text
    llm="openai/gpt-4.1-mini",              # Language Model
    tts="cartesia/sonic-3:6ccbfb76-1fc6-48f7-b71d-91ac6298247b",  # Text-to-Speech (Tessa voice)
    vad=silero_vad,                  # Voice Activity Detection
)
await session.start(agent=InterviewAgent(instructions=prompt), room=room)
```

### 3. Conversation Flow

- User speaks → Deepgram transcribes audio in real-time
- Transcript sent to GPT-4.1-mini → LLM generates response
- Response synthesized by Cartesia TTS → Audio played to user
- Silero VAD monitors audio → Detects when user interrupts (barge-in)

### 4. Session, Transcript, And Feedback Ownership

- The web session workflow owns the provider-neutral interview lifecycle; a
  LiveKit job or participant disconnect does not decide the terminal outcome.
- The interview agent durably persists normalized transcript events through the
  signed runtime endpoint, then publishes acknowledged events to the room for display.
- The browser keeps no raw transcript retry storage; reload and reconnect hydrate
  owned durable turns from the server.
- Explicit end currently calls `/api/interview/end`, which calculates durable
  signal and triggers the Inngest feedback workflow.
- The canonical lifecycle and remaining rollout gaps are documented in
  `docs/contracts/interview-session-lifecycle.md`.

---

## 🎛️ Configuration Options

The agent accepts only validated interview preferences from room metadata.
Provider, model, and voice settings are resolved from server-only
`MEELNI_INTERVIEW_*` environment variables; the frontend cannot select them.

### Interview Configuration

- **Interview Type**: `product_sense`, `execution`, `behavioral`, or `strategy`
- **Selected Question**: optional canonical question-bank record
- **Candidate preferences**: difficulty, question recency, and time limit
- **Feedback and hints**: `end_only` and `off` by default
- **Operator settings**: STT/LLM/TTS model, voice, speed, emotion, and volume

### Dynamic Prompt System

The authenticated agent builds a round-specific mock-interview prompt. It stays
in realistic interviewer role, asks adaptive follow-ups, and does not teach,
hint, or evaluate the answer during the session. The public demo uses its own
standalone prompt and intentionally remains a shorter feedback preview.

See [`shared/prompts.py`](./shared/prompts.py) for prompt templates.

---

## 🧪 Development

### Dev Mode (Auto-Reload)

```bash
python agent.py dev
```

- Watches `agent.py` for changes
- Automatically restarts worker on file save
- Ideal for rapid iteration

**Note:** Changes to the `prewarm` function require manual restart.

### Testing Voice Pipeline

1. Start agent: `python agent.py dev`
2. Open frontend: `http://localhost:3000`
3. Start interview and speak
4. Check agent logs for STT/LLM/TTS flow

### Debugging

- **Verbose logging**: Set `LOG_LEVEL=debug` in `.env`
- **LiveKit logs**: Check [LiveKit Dashboard](https://cloud.livekit.io) for room events
- **Audio issues**: Verify microphone permissions in browser
- **Agent not joining**: Check `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`

---

## 🚀 Deployment

### Railway

```bash
railway up
```

Set environment variables in Railway dashboard.

### Render

1. Connect git repository
2. Build command: `pip install -r agent/requirements.txt`
3. Start command: `cd agent && python agent.py start`
4. Add environment variables in Render dashboard

### Fly.io

```bash
fly deploy
```

Configure `fly.toml` with agent start command.

### Docker (Custom)

```dockerfile
FROM python:3.10-slim
WORKDIR /app
COPY agent/requirements.txt .
RUN pip install -r requirements.txt
COPY agent/ .
CMD ["python", "agent.py", "start"]
```

---

## 🔧 Customization

### Changing Voice Model

Set `MEELNI_INTERVIEW_TTS_MODEL` and `MEELNI_INTERVIEW_VOICE` on both the web
and voice-agent deployments. See
`docs/operations/interview-runtime-configuration.md`.

### Adjusting Speech Speed/Emotion

Set the server-only `MEELNI_INTERVIEW_TTS_SPEED`,
`MEELNI_INTERVIEW_TTS_EMOTION`, and `MEELNI_INTERVIEW_TTS_VOLUME` variables.
The shared runtime normalizer enforces their accepted ranges.

### Custom Interviewer Instructions

Edit the `InterviewAgent` class in `agent.py`:

```python
class InterviewAgent(Agent):
    def __init__(self, instructions: str):
        super().__init__(instructions=instructions)
```

See [LiveKit Agents Docs](https://docs.livekit.io/agents) for advanced customization.

---

## 🎯 Dynamic Prompt System (New!)

The agent now supports **round-specific interview prompts** that adapt to different PM interview types and difficulty levels.

### Architecture

```
agent/
├── prompts/                    # Prompt templates by round type
│   ├── behavioral.py           # STAR method prompts
│   ├── product_sense.py        # 5-step framework prompts
│   ├── execution.py            # Metrics & trade-offs prompts
│   └── strategy.py             # Business strategy prompts
├── utils/
│   └── prompt_builder.py       # Dynamic prompt generator
└── config.py                   # Room metadata parser
```

### Supported Round Types

#### 1. **Behavioral** (STAR Method)

Assesses leadership, collaboration, conflict resolution, decision making, and learning.

**Framework**:

- Situation: Context and background
- Task: What needed to be done
- Action: What YOU specifically did
- Result: Outcome with metrics

**Difficulty Adjustments**:

- **Beginner**: Direct follow-ups, more thinking time, concrete evidence bar
- **Intermediate**: Independent structure, specific decisions, measurable impact
- **Advanced**: Bar-raiser depth across judgment, stakeholders, and learning

#### 2. **Product Sense** (5-Step Framework)

Assesses user empathy, creative thinking, prioritization, and business understanding.

**Framework**:

1. Clarify & Scope
2. Identify Users
3. Understand Pain Points
4. Generate Solutions
5. Prioritize & Recommend

**Difficulty Adjustments**:

- **Beginner**: Accessible follow-ups without supplying a framework
- **Intermediate**: Candidate-led structure with realistic depth probes
- **Advanced**: Direct challenges to prioritization, trade-offs, and product judgment

#### 3. **Execution** (Metrics & Trade-offs)

Assesses analytical thinking, prioritization, technical depth, stakeholder management.

**Key Areas**:

- Metrics definition (North Star, leading/lagging)
- Trade-off analysis (speed vs quality)
- Technical understanding (APIs, scalability)
- Execution planning (roadmap, rollout)

**Difficulty Adjustments**:

- **Beginner**: Clear metric and trade-off questions without suggested answers
- **Intermediate**: Independent metric selection and causal reasoning
- **Advanced**: Senior-level challenges on economics, systems, and execution risk

#### 4. **Strategy** (Business Thinking)

Assesses business acumen, market understanding, competitive analysis, long-term vision.

**Key Areas**:

- Market sizing (TAM, SAM, SOM)
- Competitive landscape and moats
- Business model evaluation
- 3-5 year vision

**Difficulty Adjustments**:

- **Beginner**: Direct questions about objective, alternatives, and rationale
- **Intermediate**: Independent strategic structure and defensible trade-offs
- **Advanced**: Executive-level challenges to assumptions, economics, and sequencing

### Feedback And Hint Defaults

`feedback_mode` is normalized to `end_only`, and full mock interviews normalize
`hintMode` to `off`, including legacy `gentle` or `coach` metadata values.
The interviewer gives no strengths, improvements, scores, suggested answers, or
framework instruction during the mock interview. Detailed evaluation is created
by the post-interview feedback workflow. Teaching and feedback-preview behavior
belong to separate experiences, not the authenticated full-interview runtime.

### Room Metadata Configuration

The web server writes a resolved runtime snapshot to room metadata. This is an
internal transport contract, not a client request shape:

```json
{
  "round_type": "product_sense",
  "config": {
    "difficulty": "intermediate",
    "duration": 45,
    "feedback_mode": "end_only",
    "voice": "6ccbfb76-1fc6-48f7-b71d-91ac6298247b",
    "speed": 1.0,
    "emotion": "professional",
    "volume": 1.0,
    "stt_model": "deepgram/nova-3",
    "llm_model": "openai/gpt-4.1-mini",
    "tts_model": "cartesia/sonic-3:6ccbfb76-1fc6-48f7-b71d-91ac6298247b"
  }
}
```

### Testing Different Configurations

```python
# Test behavioral interview, beginner difficulty with canonical defaults
metadata = json.dumps({
    "round_type": "behavioral",
    "config": {
        "difficulty": "beginner",
        "duration": 30,
        "feedback_mode": "end_only",
        "hintMode": "off"
    }
})

# Test product sense, advanced difficulty
metadata = json.dumps({
    "round_type": "product_sense",
    "config": {
        "difficulty": "advanced",
        "duration": 45,
        "feedback_mode": "end_only",
        "hintMode": "off"
    }
})
```

### Logs

The agent now logs configuration details on startup:

```
INFO:__main__:Starting agent for room: session-1234
INFO:__main__:Room: session-1234
INFO:__main__:Round Type: product_sense
INFO:__main__:Difficulty: intermediate
INFO:__main__:Feedback Mode: end_only
INFO:__main__:Duration: 45 minutes
INFO:__main__:Generated prompt for product_sense interview (difficulty: intermediate)
INFO:__main__:STT Model: deepgram/nova-3
INFO:__main__:LLM Model: openai/gpt-4.1-mini
INFO:__main__:TTS Model: cartesia/sonic-3:6ccbfb76-1fc6-48f7-b71d-91ac6298247b
INFO:__main__:Voice agent started successfully - product_sense interview with intermediate difficulty
```

### Error Handling

- **Invalid round_type**: Falls back to product_sense with logged warning
- **Malformed metadata**: Uses default configuration
- **Missing config keys**: Populated with defaults from `config.py`

---

## 📊 Performance Considerations

### Latency Optimization

- **Target**: <1.2s end-to-end per turn
- **Deepgram Nova-3**: ~200ms STT latency
- **GPT-4.1-mini**: ~400-600ms LLM response time
- **Cartesia Sonic 3**: ~300ms TTS synthesis

### Cost Per Session (20 minutes)

- **Deepgram ASR**: ~$0.09
- **GPT-4.1-mini**: ~$0.05
- **Cartesia TTS**: ~$0.10
- **Total**: ~$0.24/session

### Scaling

- Each agent instance handles 1 concurrent interview
- Deploy multiple workers for horizontal scaling
- LiveKit Cloud handles WebRTC infrastructure

---

## 🐛 Troubleshooting

### "Agent not connecting to LiveKit"

- Verify `LIVEKIT_URL` format: `wss://your-project.livekit.cloud` (not `https://`)
- Check API key/secret in `.env`
- Ensure LiveKit project is active (check dashboard)

### "SSL Certificate Error" (macOS)

```bash
# Install Python SSL certificates
cd /Applications/Python\ 3.12/
./Install\ Certificates.command
```

### "Module not found" errors

```bash
# Reinstall dependencies
pip install --upgrade pip
pip install -r requirements.txt
```

### "Agent joins but doesn't speak"

- Check `OPENAI_API_KEY` and `CARTESIA_API_KEY` (if using direct API)
- Verify model names: `deepgram/nova-3`, `openai/gpt-4.1-mini`, `cartesia/sonic-3:VOICE_ID`
- Check agent logs for API errors

### "Silero VAD not loading"

```bash
# Install missing plugin
pip install livekit-plugins-silero
```

### "Prewarm function changes not taking effect"

Restart agent manually (auto-reload doesn't catch prewarm changes):

```bash
# Kill and restart
python agent.py dev
```

---

## 📚 Resources

### LiveKit Documentation

- [LiveKit Agents GitHub](https://github.com/livekit/agents) - Source code and examples
- [LiveKit Agents Docs](https://docs.livekit.io/agents) - Official documentation
- [LiveKit Dashboard](https://cloud.livekit.io) - Manage projects and monitor rooms

### Voice Provider Docs

- [Deepgram Nova-3](https://developers.deepgram.com/docs/nova-3) - ASR documentation
- [Cartesia Sonic 3](https://docs.cartesia.ai) - TTS and voice models
- [OpenAI GPT-4.1-mini](https://platform.openai.com/docs/models/gpt-4-1-mini) - LLM documentation

### Related Files

- [Root README](../README.md) - Full project setup and architecture
- [CLAUDE.md](../.claude/CLAUDE.md) - Living operational document
- [PRD.md](../.claude/PRD.md) - Product requirements

---

## 🤝 Contributing

This is a solo project. For architectural decisions and conventions, see:

- [`.claude/CLAUDE.md`](../.claude/CLAUDE.md) - Architecture decisions (ADRs)
- [Code style guide](../.claude/CLAUDE.md#code-style--conventions)

---

## 📄 License

Private project. All rights reserved.
