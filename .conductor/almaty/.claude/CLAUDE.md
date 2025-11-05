# CLAUDE.md: Codebase Living Operational Document

**Project**: MockMate - Real-Time AI Mock Interviews
**Last Updated**: 2025-11-05
**Version**: 0.2.0

---

## Document Purpose

This document serves as the single source of truth for:
- Project structure and architecture decisions
- Code style and conventions
- Important constraints and boundaries
- Development commands and workflows
- API and database schemas
- Documentation standards
- Cross-cutting concerns

**Update Protocol**: Review and update this document at the end of each significant iteration or sprint.

---

## Project Status

**Current Phase**: Planning & Initial Setup
**Next Milestone**: Architecture setup and DB schema implementation

---

## Tech Stack

### Frontend
- **Framework**: Next.js 14+ (App Router)
- **UI Library**: React
- **Styling**: Tailwind CSS
- **Component Library**: shadcn/ui
- **Language**: TypeScript
- **State Management**: Zustand

### Backend
- **Runtime**: Node.js (Next.js API routes)
- **Database**: PostgreSQL (via Supabase)
- **ORM**: Drizzle ORM
- **Auth**: Supabase Auth
- **Validation**: Zod

### Real-time & AI
- **WebRTC**: LiveKit Cloud (audio/video + Agents framework)
- **ASR**: Deepgram Nova 2 (via LiveKit Agents)
- **TTS**: Cartesia or PlayHT (via LiveKit Agents)
- **Dialogue LLM**: GPT-4 Turbo or Claude 3.5 Sonnet (via LiveKit Agents)
- **Evaluation LLM**: GPT-4 Turbo (post-session scoring)
- **Avatar**: Hedra Video (lip-sync)

### Infrastructure & Services
- **Hosting**: Vercel (Next.js)
- **Agent Hosting**: Railway/Render/Fly.io (LiveKit Agents)
- **Database Hosting**: Supabase
- **Real-time Infrastructure**: LiveKit Cloud
- **Background Jobs**: Inngest
- **Error Tracking**: Sentry
- **Email**: Resend
- **Analytics**: Vercel Analytics + PostHog

---

## Project Structure

```
/
├── .conductor/almaty/.claude/   # Project documentation (PRD, CLAUDE.md)
├── app/                          # Next.js App Router pages
│   ├── layout.tsx                # Root layout
│   ├── page.tsx                  # Home page
│   └── globals.css               # Global styles
├── components/                   # React components
│   └── README.md                 # Component organization guide
├── lib/                          # Shared utilities and configurations
│   ├── db/                       # Database (Drizzle ORM)
│   │   ├── schema.ts             # Database schema
│   │   ├── index.ts              # DB client
│   │   └── migrations/           # Migration files
│   ├── supabase/                 # Supabase clients
│   │   ├── client.ts             # Browser client
│   │   └── server.ts             # Server client
│   ├── api/                      # API client helpers (LiveKit, Hedra, etc.)
│   └── utils/                    # Utility functions
├── public/                       # Static assets
├── .env.example                  # Environment variables template
├── drizzle.config.ts             # Drizzle ORM configuration
├── components.json               # shadcn/ui configuration
├── tsconfig.json                 # TypeScript configuration (strict mode)
├── .prettierrc                   # Prettier configuration
└── package.json                  # Dependencies and scripts
```

**Status**: Initial structure created. Ready for feature development.

**Status**: Initial structure to be created in next iteration.

---

## Code Style & Conventions

**Status**: To be defined as we start coding.

### Naming Conventions
- TBD

### File Organization
- TBD

### TypeScript Guidelines
- TBD

---

## Architecture Decisions

### ADR-001: Workspace in `.conductor/almaty`
- **Date**: 2025-11-05
- **Decision**: Work within Conductor workspace at `.conductor/almaty/.claude/` for documentation
- **Rationale**: Conductor workspaces are isolated; using `.claude/` directory for project docs allows version control while keeping workspace organized
- **Consequences**: Documentation files need to be force-added to git due to `.conductor` being in `.git/info/exclude`

### ADR-002: PRD Location
- **Date**: 2025-11-05
- **Decision**: Store PRD at `.conductor/almaty/.claude/PRD.md`
- **Rationale**: Keep all project documentation together in version control
- **Consequences**: Centralized documentation, easy to reference and update

### ADR-003: Tech Stack Finalization
- **Date**: 2025-11-05
- **Decision**: Use Next.js 14+, Supabase (Postgres + Auth), Drizzle ORM, LiveKit Agents (with Deepgram ASR + Cartesia/PlayHT TTS + GPT-4/Claude), Hedra for avatars
- **Rationale**:
  - Next.js: Fast MVP development, unified frontend/backend, scales to 1K users easily
  - Supabase Auth: Free, integrated with database RLS, flexible vs Clerk's cost at scale
  - Drizzle: Lightweight, type-safe, serverless-friendly vs Prisma's bundle size
  - LiveKit Agents: Integrated ASR/TTS/LLM orchestration with provider flexibility vs OpenAI Realtime's lock-in
  - Deepgram: Low latency, cost-effective ASR ($0.0043/min)
  - Cartesia/PlayHT: Better cost/quality than OpenAI TTS
- **Consequences**:
  - Need to deploy LiveKit Agents separately (Railway/Render/Fly.io)
  - More control over AI stack, easier to optimize costs
  - Learning curve for LiveKit Agents framework
  - **IMPORTANT**: When making architecture decisions, document them in this file

### ADR-004: Background Jobs with Inngest
- **Date**: 2025-11-05
- **Decision**: Use Inngest for post-session evaluation processing
- **Rationale**: Serverless queue system with retries, no Redis to manage, generous free tier
- **Consequences**: Async evaluation workflow, don't need to manage queue infrastructure

---

## File Boundaries & Responsibilities

**Status**: To be defined during implementation.

---

## Important Constraints

### Performance Requirements
- **Latency P95**: ≤ 1.2s per turn (end-to-end)
- **Session completion rate**: ≥ 75%
- **Weekly return rate**: ≥ 40%

### Data & Privacy
- Explicit consent for audio/video recording
- PII redaction from transcripts
- EU data residency toggle (post-MVP)

### Cost Constraints
- Cache evaluation results
- Compress transcripts
- On-device VAD where possible
- Batch evaluation post-session

---

## Development Commands

**Status**: To be populated once project is initialized.

```bash
# Development
npm run dev          # TBD

# Build
npm run build        # TBD

# Test
npm run test         # TBD

# Database
# TBD - migration commands
```

---

## API Endpoints

**Status**: Planned (see PRD Section 12), not yet implemented.

### Auth
- `POST /api/auth/callback`

### Session
- `POST /api/interview/start`
- `POST /api/interview/end`

### Evaluation
- `POST /api/eval/{{sessionId}}`
- `GET /api/feedback/{{sessionId}}`

### Dashboard
- `GET /api/metrics/summary`
- `GET /api/history`

---

## Database Schema

**Status**: Planned (see PRD Section 11), not yet implemented.

### Core Tables
- `app_user` - User accounts
- `interview_session` - Interview sessions
- `transcript_turn` - Turn-by-turn conversation data
- `feedback` - Scored feedback and rubrics

**Migration Strategy**: TBD

---

## Environment Variables

**Status**: To be defined.

```bash
# Database
DATABASE_URL=

# Auth
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# LiveKit
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=

# OpenAI
OPENAI_API_KEY=

# Hedra
HEDRA_API_KEY=
```

---

## Documentation Standards

### Code Comments
- TBD

### README Files
- TBD

### API Documentation
- TBD

---

## Testing Strategy

**Status**: To be defined.

### Unit Tests
- TBD

### Integration Tests
- TBD

### E2E Tests
- TBD

---

## Git Workflow

### Branch Naming
- Use descriptive, concrete names (<30 characters)
- No prefixes (e.g., `feature/`, `fix/`)
- Examples: `add-user-auth`, `fix-session-latency`

### Commit Messages
- Clear, concise descriptions
- Include context and rationale when needed
- Co-authored with Claude when applicable

### PR Process
- TBD

---

## Known Issues & Technical Debt

**Status**: None yet.

---

## Future Considerations

- Custom company-specific interview loops (Phase 2)
- Enterprise coach dashboards (post-MVP)
- Coding/whiteboard IDE integration
- Live human interview marketplace

---

## Iteration Log

### 2025-11-05 - Initial Setup & Tech Stack Decisions
- Created GitHub repository
- Added PRD documentation
- Created CLAUDE.md structure
- Established documentation workflow
- Finalized tech stack (Next.js, Supabase, Drizzle, LiveKit Agents)
- Decided on Supabase Auth over Clerk
- Chose LiveKit Agents over OpenAI Realtime API for flexibility
- Selected Drizzle ORM for serverless performance

---

## Questions & Open Items

1. ~~**ORM Choice**: Prisma vs Drizzle vs raw SQL?~~ → **RESOLVED**: Drizzle (ADR-003)
2. ~~**Auth Provider**: Clerk vs NextAuth?~~ → **RESOLVED**: Supabase Auth (ADR-003)
3. **TTS Provider**: Cartesia vs PlayHT? (need to test latency/quality)
4. **Dialogue LLM**: GPT-4 Turbo vs Claude 3.5 Sonnet? (need to test conversation quality)
5. **Agent Hosting**: Railway vs Render vs Fly.io? (evaluate pricing/DX)
6. **TypeScript Config**: Strict mode settings?
7. **Testing Framework**: Vitest for unit tests (likely), Playwright for E2E
8. **Monorepo Structure**: Single repo vs separate agent repo?

---

## Review Checklist

Use this checklist when updating this document:

- [ ] Update "Last Updated" date
- [ ] Update project status and current phase
- [ ] Add any new architecture decisions (ADRs)
- [ ] Document new commands or workflows
- [ ] Update tech stack if dependencies changed
- [ ] Record any new constraints or boundaries
- [ ] Update project structure if files/folders added
- [ ] Add to iteration log
- [ ] Review and update open questions

### ADR-006: Database Schema Deployed
- **Date**: 2025-11-05
- **Decision**: Successfully deployed database schema to Supabase with all tables (app_user, interview_session, transcript_turn, feedback)
- **Rationale**: Database tables match PRD specification and are ready for application development
- **Consequences**:
  - All tables created in Supabase Postgres
  - Drizzle ORM configured and tested
  - Supabase Auth connection verified
  - Ready to implement authentication and data operations
  - May need to add RLS (Row Level Security) policies for production

### ADR-007: LiveKit Voice Interview Integration
- **Date**: 2025-11-05
- **Decision**: Implemented LiveKit Agents framework for real-time voice interviews
- **Rationale**:
  - LiveKit Agents provides integrated voice pipeline (Deepgram ASR + GPT-4 + Cartesia TTS)
  - Python agent runs separately, joins LiveKit rooms as programmable participant
  - Next.js frontend generates tokens and connects users to rooms
  - Enables natural conversation with interruption handling (barge-in)
- **Consequences**:
  - Monorepo structure with `/agent` directory for Python code
  - Separate deployment needed for agent worker (Railway/Render/Fly.io)
  - Frontend: `/interview` page with LiveKit React components
  - Backend: `/api/livekit/token` route for access token generation
  - Agent uses Deepgram (STT), GPT-4 (LLM), Cartesia (TTS)
  - **IMPORTANT**: Document architecture decisions in this file

### ADR-014: Comprehensive Model Selection System
- **Date**: 2025-11-05
- **Decision**: Implement full configurability for STT, LLM, and TTS models
- **Rationale**:
  - Users need control over speech speed (AI was talking too fast)
  - Different use cases require different model quality/cost tradeoffs
  - Voice personalization improves user engagement
  - Flexibility to experiment with different AI providers
- **Available Models**:
  - **STT**: Deepgram Nova-2/3, Cartesia Ink Whisper, AssemblyAI
  - **LLM**: GPT-4o-mini, GPT-4o, GPT-4.1, Gemini 2.5 Pro/Flash, Gemini 2.0 Flash
  - **TTS**: Cartesia sonic-2/3/turbo with 100+ voices
  - **Voice Controls**: Speed (0.6x-1.5x), Emotion (59 options), Volume (0.5x-2.0x)
- **Consequences**:
  - All configuration passed via room metadata as JSON
  - Agent reads config and dynamically configures models
  - UI provides advanced settings section for model selection
  - Cost per session varies based on model choices

---

## LiveKit Model Configuration Reference

**Added**: 2025-11-05

### STT (Speech-to-Text) Models

LiveKit Agents supports multiple STT providers. Format: `"provider/model"` or just `"provider"`

**Available Models**:
1. **Deepgram** (default):
   - `deepgram/nova-2` - Latest generation, best accuracy
   - `deepgram/nova-3` - Next generation (if available)
   - Cost: ~$0.0043/min
   - Best for: English, low latency

2. **Cartesia Ink Whisper**:
   - `cartesia/ink-whisper` - Multilingual support
   - Best for: Non-English languages, multilingual sessions

3. **AssemblyAI**:
   - `assemblyai` - Alternative STT provider
   - Best for: Transcription accuracy, speaker diarization

**Current Default**: `deepgram/nova-2`

### LLM (Language Model) Models

LiveKit Agents supports multiple LLM providers via gateway format: `"provider/model"`

**Available Models**:

1. **OpenAI** (via OpenAI gateway):
   - `openai/gpt-4o-mini` - **Default** - Cost-effective, fast ($0.15/1M input tokens)
   - `openai/gpt-4o` - Higher quality, more expensive (~$2.50/1M)
   - `openai/gpt-4.1` - Latest GPT-4 variant (~$10/1M)

2. **Google Gemini** (via Google gateway):
   - `google/gemini-2.5-pro-experimental` - Highest quality Gemini (~$1.25/1M)
   - `google/gemini-2.5-flash-preview` - Fast Gemini variant (~$0.075/1M)
   - `google/gemini-2.0-flash-experimental` - Experimental flash model

**Cost Comparison** (per 1M input tokens):
- GPT-4o-mini: $0.15
- Gemini 2.5 Flash: $0.075
- Gemini 2.5 Pro: $1.25
- GPT-4o: $2.50
- GPT-4.1: $10.00

**Current Default**: `openai/gpt-4o-mini`

### TTS (Text-to-Speech) Configuration

**Cartesia TTS Parameters** (from `/agent/venv/lib/python3.12/site-packages/livekit/plugins/cartesia/`):

**Model Options**:
- `sonic` - Original model
- `sonic-2` - **Default** - Generation 2
- `sonic-3` - Latest generation
- `sonic-lite` - Lightweight variant
- `sonic-turbo` - Fastest variant

**Voice Controls**:
- `voice`: Voice ID string (100+ voices available)
- `speed`: float (0.6 to 1.5) or preset ("fastest", "fast", "normal", "slow", "slowest")
- `emotion`: List of emotion strings (59 options - see below)
- `volume`: float (0.5 to 2.0)
- `language`: 35+ supported languages
- `sample_rate`: int (default 24000)
- `word_timestamps`: bool (default True)

**Available Emotions** (59 total):
Happy, Excited, Enthusiastic, Calm, Confident, Neutral, Anxious, Sad, Angry, Curious, Grateful, Peaceful, Energetic, Serious, Frustrated, Surprised, Amused, Bored, Tired, Sympathetic, Worried, Hopeful, Determined, Relaxed, Joyful, Proud, Inspired, Thoughtful, Playful, Sarcastic, Professional, Warm, Cool, Mysterious, Dramatic, Romantic, Whispering, Shouting, Singing, Laughing, Crying, Sighing, Yawning, Coughing, Sneezing, Hiccupping, Burping, Chewing, Breathing, Humming, Whistling, Clapping, Snapping, Stomping, Knocking, Rustling, Splashing, Crackling

**Voice Selection**:
- Default: `f786b574-daa5-4673-aa0c-cbe3e8534c02` (Katie - Friendly Fixer)
- 100+ voices available via API: `GET https://api.cartesia.ai/voices`
- API endpoint: `/app/api/cartesia/voices/route.ts`

### Model Selection Best Practices

1. **For MVP/Development**: Use `openai/gpt-4o-mini` + `deepgram/nova-2` (cost-effective)
2. **For Production Quality**: Use `openai/gpt-4o` or `google/gemini-2.5-pro-experimental`
3. **For Multilingual**: Use `cartesia/ink-whisper` for STT
4. **For Cost Optimization**: Cache prompts, use mini/flash models for dialogue
5. **For Speed**: Use `sonic-turbo` TTS + `gemini-2.5-flash-preview` LLM

### Configuration Format

In `agent.py`:
```python
# TTS Configuration
tts_config = {
    "model": "sonic-2",
    "voice": "voice-id-string",
    "speed": 1.0,           # 0.6 to 1.5
    "emotion": ["Calm"],    # List of emotions
    "volume": 1.0,          # 0.5 to 2.0
}
tts_instance = cartesia.TTS(**tts_config)

# AgentSession with all models
session = AgentSession(
    stt="deepgram/nova-2",           # STT model
    llm="openai/gpt-4o-mini",        # LLM model
    tts=tts_instance,                # TTS instance
    vad=ctx.proc.userdata["vad"],    # VAD model
)
```

In UI (`setup/page.tsx`):
```typescript
const config = {
  role: "interviewee",
  mode: "mock_interview",
  interview_type: "product_sense",
  skill_level: "mid",
  voice: "voice-id-string",
  speed: 1.0,
  emotion: "Neutral",
  volume: 1.0,
  tts_model: "sonic-2",
  stt_model: "deepgram/nova-2",
  llm_model: "openai/gpt-4o-mini",
};
```

### LiveKit Documentation References

For questions about LiveKit Agents, TTS/STT configuration, and API details:

**Primary Resources**:
- **LiveKit Agents GitHub**: https://github.com/livekit/agents
  - Plugin source code and examples
  - Issue tracker for bugs and feature requests
  - Latest API changes and updates

- **LiveKit Core GitHub**: https://github.com/livekit/livekit
  - Core WebRTC infrastructure
  - Server configuration
  - Protocol specifications

- **LiveKit Documentation**: https://docs.livekit.io/llms-full.txt
  - Comprehensive LLM integration guide
  - Voice agent patterns
  - Best practices

**Useful Commands**:
```bash
# View Cartesia TTS source
cat /path/to/venv/lib/python3.12/site-packages/livekit/plugins/cartesia/tts.py

# Check available voices
curl -H "X-API-Key: $CARTESIA_API_KEY" \
     -H "Cartesia-Version: 2025-04-16" \
     https://api.cartesia.ai/voices

# View LiveKit Agents STT/LLM configuration
python -c "from livekit.agents import AgentSession; help(AgentSession)"
```
