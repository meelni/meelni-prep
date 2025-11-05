# CLAUDE.md: Codebase Living Operational Document

**Project**: MockMate - Real-Time AI Mock Interviews
**Last Updated**: 2025-11-05
**Version**: 0.3.0

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

**Current Phase**: Phase 0 Complete - LiveKit Voice Integration Working ✅
**Next Milestone**: Add session persistence (save transcripts to DB), scoring/feedback engine

**Phase 0 Completion Summary**:
- ✅ Next.js 14+ project initialized with TypeScript, Tailwind, shadcn/ui
- ✅ Database schema deployed to Supabase (4 tables verified)
- ✅ Supabase Auth configured (browser + server clients)
- ✅ LiveKit Agents Python worker implemented and tested
- ✅ LiveKit token generation API working
- ✅ Interview page with real-time voice conversation
- ✅ End-to-end voice pipeline: User speaks → Deepgram → GPT-4o-mini → Cartesia → User hears

---

## Tech Stack

### Frontend
- **Framework**: Next.js 14+ (App Router)
- **UI Library**: React
- **Styling**: Tailwind CSS
- **Component Library**: shadcn/ui
- **Language**: TypeScript
- **State Management**: Zustand (planned)
- **Real-time UI**: @livekit/components-react

### Backend
- **Runtime**: Node.js (Next.js API routes)
- **Database**: PostgreSQL (via Supabase)
- **ORM**: Drizzle ORM
- **Auth**: Supabase Auth
- **Validation**: Zod
- **SDK**: livekit-server-sdk (token generation)

### Real-time & AI
- **WebRTC**: LiveKit Cloud (audio/video + Agents framework)
- **ASR**: Deepgram Nova 2 (via LiveKit Agents) - $0.0043/min
- **TTS**: Cartesia (via LiveKit Agents)
- **Dialogue LLM**: GPT-4o-mini (via LiveKit Agents) - cost-effective choice
- **Evaluation LLM**: GPT-4 Turbo (post-session scoring, planned)
- **Avatar**: Hedra Video (lip-sync, post-MVP)
- **VAD**: Silero (livekit-plugins-silero)

### Infrastructure & Services
- **Hosting**: Vercel (Next.js)
- **Agent Hosting**: Local dev, Railway/Render/Fly.io for production
- **Database Hosting**: Supabase
- **Real-time Infrastructure**: LiveKit Cloud
- **Background Jobs**: Inngest (planned for evaluation)
- **Error Tracking**: Sentry (planned)
- **Email**: Resend (planned)
- **Analytics**: Vercel Analytics + PostHog (planned)

---

## Project Structure

```
/
├── .claude/                      # Project documentation (moved from .conductor/almaty/.claude/)
│   ├── PRD.md                    # Product requirements document
│   └── CLAUDE.md                 # This file - living operational doc
├── agent/                        # Python LiveKit Agents worker
│   ├── venv/                     # Python virtual environment
│   ├── agent.py                  # Main agent entrypoint
│   ├── requirements.txt          # Python dependencies
│   └── .env                      # Agent environment variables
├── app/                          # Next.js App Router pages
│   ├── layout.tsx                # Root layout
│   ├── page.tsx                  # Home page
│   ├── globals.css               # Global styles
│   ├── interview/                # Interview session page
│   │   └── page.tsx              # LiveKit room UI
│   └── api/                      # API routes
│       └── livekit/
│           └── token/
│               └── route.ts      # LiveKit token generation
├── components/                   # React components
│   └── README.md                 # Component organization guide
├── lib/                          # Shared utilities and configurations
│   ├── db/                       # Database (Drizzle ORM)
│   │   ├── schema.ts             # Database schema (deployed to Supabase)
│   │   └── index.ts              # DB client
│   ├── supabase/                 # Supabase clients
│   │   ├── client.ts             # Browser client
│   │   └── server.ts             # Server client
│   └── utils.ts                  # Utility functions
├── public/                       # Static assets
├── .env.local                    # Environment variables (not in git)
├── .env.example                  # Environment variables template
├── drizzle.config.ts             # Drizzle ORM configuration
├── components.json               # shadcn/ui configuration
├── tsconfig.json                 # TypeScript configuration (strict mode)
├── .prettierrc                   # Prettier configuration
├── package.json                  # Dependencies and scripts
└── README.md                     # Project README
```

**Status**: Phase 0 structure complete. Agent directory added. LiveKit integration working.

---

## Code Style & Conventions

**Status**: Emerging patterns from Phase 0.

### Naming Conventions
- React components: PascalCase (e.g., `InterviewPage.tsx`)
- API routes: kebab-case folders (e.g., `app/api/livekit/token/route.ts`)
- Database tables: snake_case (e.g., `app_user`, `interview_session`)
- Python: snake_case for functions/variables, PascalCase for classes

### File Organization
- Server components by default in Next.js App Router
- "use client" directive for client components using LiveKit hooks
- Colocate related files (e.g., `/interview/page.tsx` for interview UI)

### TypeScript Guidelines
- Strict mode enabled in tsconfig.json
- Type all function parameters and return values
- Use Zod for runtime validation (planned)

---

## Architecture Decisions

### ADR-001: Workspace in `.conductor/almaty`
- **Date**: 2025-11-05
- **Decision**: Work within Conductor workspace at `.conductor/almaty/.claude/` for documentation
- **Rationale**: Conductor workspaces are isolated; using `.claude/` directory for project docs allows version control while keeping workspace organized
- **Consequences**: Documentation files need to be force-added to git due to `.conductor` being in `.git/info/exclude`
- **UPDATE**: Moved docs to `.claude/` in project root for easier access

### ADR-002: PRD Location
- **Date**: 2025-11-05
- **Decision**: Store PRD at `.claude/PRD.md` (updated from `.conductor/almaty/.claude/PRD.md`)
- **Rationale**: Keep all project documentation together in version control at project root
- **Consequences**: Centralized documentation, easy to reference and update

### ADR-003: Tech Stack Finalization
- **Date**: 2025-11-05
- **Updated**: 2025-11-05 (GPT-4o-mini decision)
- **Decision**: Use Next.js 14+, Supabase (Postgres + Auth), Drizzle ORM, LiveKit Agents (with Deepgram ASR + Cartesia TTS + **GPT-4o-mini**), Hedra for avatars (post-MVP)
- **Rationale**:
  - Next.js: Fast MVP development, unified frontend/backend, scales to 1K users easily
  - Supabase Auth: Free, integrated with database RLS, flexible vs Clerk's cost at scale
  - Drizzle: Lightweight, type-safe, serverless-friendly vs Prisma's bundle size
  - LiveKit Agents: Integrated ASR/TTS/LLM orchestration with provider flexibility vs OpenAI Realtime's lock-in
  - Deepgram: Low latency, cost-effective ASR ($0.0043/min)
  - Cartesia: Better cost/quality than OpenAI TTS
  - **GPT-4o-mini**: Cost-effective dialogue model, works with LiveKit gateway, sufficient quality for MVP
- **Consequences**:
  - Need to deploy LiveKit Agents separately (Railway/Render/Fly.io)
  - More control over AI stack, easier to optimize costs
  - Learning curve for LiveKit Agents framework (completed in Phase 0)
  - Model format: `"provider/model-name"` (e.g., `"openai/gpt-4o-mini"`)

### ADR-004: Background Jobs with Inngest
- **Date**: 2025-11-05
- **Decision**: Use Inngest for post-session evaluation processing
- **Rationale**: Serverless queue system with retries, no Redis to manage, generous free tier
- **Consequences**: Async evaluation workflow, don't need to manage queue infrastructure
- **Status**: Planned, not yet implemented

### ADR-005: Documentation Location Update
- **Date**: 2025-11-05
- **Decision**: Move PRD.md and CLAUDE.md from `.conductor/almaty/.claude/` to `.claude/` at project root
- **Rationale**: User preference for easier access, less nesting
- **Consequences**: Updated git tracking, clearer documentation structure

### ADR-006: Database Schema Deployed
- **Date**: 2025-11-05
- **Decision**: Successfully deployed database schema to Supabase with all tables (app_user, interview_session, transcript_turn, feedback)
- **Rationale**: Database tables match PRD specification and are ready for application development
- **Consequences**:
  - All tables created in Supabase Postgres
  - Drizzle ORM configured and tested with `drizzle-kit push`
  - Supabase Auth connection verified
  - Ready to implement authentication and data operations
  - May need to add RLS (Row Level Security) policies for production

### ADR-007: LiveKit Voice Interview Integration
- **Date**: 2025-11-05
- **Decision**: Implemented LiveKit Agents framework for real-time voice interviews
- **Rationale**: 
  - LiveKit Agents provides integrated voice pipeline (Deepgram ASR + GPT-4o-mini + Cartesia TTS)
  - Python agent runs separately, joins LiveKit rooms as programmable participant
  - Next.js frontend generates tokens and connects users to rooms
  - Enables natural conversation with interruption handling (barge-in)
- **Consequences**:
  - Monorepo structure with `/agent` directory for Python code
  - Separate deployment needed for agent worker (Railway/Render/Fly.io)
  - Frontend: `/interview` page with LiveKit React components
  - Backend: `/api/livekit/token` route for access token generation
  - Agent uses Deepgram (STT), GPT-4o-mini (LLM), Cartesia (TTS), Silero (VAD)

### ADR-008: GPT-4o-mini for Dialogue LLM
- **Date**: 2025-11-05
- **Decision**: Use GPT-4o-mini instead of GPT-4 or Claude 3.5 Sonnet for dialogue
- **Rationale**:
  - Cost-effective for MVP ($0.15/1M input tokens vs $10/1M for GPT-4 Turbo)
  - Works with LiveKit's OpenAI gateway provider
  - Sufficient quality for natural interview conversation
  - Can upgrade to GPT-4 Turbo or Claude later if needed
  - Model name format: `"openai/gpt-4o-mini"` (not `"openai/gpt-4"`)
- **Consequences**:
  - Lower cost per interview session (~20 min = ~$0.05 in LLM costs)
  - May need to tune prompts for interview quality
  - Easy to swap models later via string config in `AgentSession`

### ADR-009: LiveKit AgentSession API Pattern
- **Date**: 2025-11-05
- **Decision**: Use `AgentSession` with string-based model configuration instead of older `VoiceAssistant` API
- **Rationale**:
  - LiveKit Agents framework evolved; `AgentSession` is current recommended pattern
  - Simpler string-based config: `stt="deepgram"`, `llm="openai/gpt-4o-mini"`, `tts="cartesia"`
  - Documentation lagged behind SDK changes; referenced official GitHub examples
- **Consequences**:
  - Custom `Agent` class extends base `livekit.agents.Agent`
  - Prewarm function needed for VAD model optimization
  - Clear separation: agent definition vs session orchestration
  - Learning: Always check official examples when docs don't match SDK

---

## File Boundaries & Responsibilities

### `/agent/agent.py`
**Purpose**: LiveKit Agents worker - conducts voice interviews
**Key Responsibilities**:
- Define `InterviewAgent` class with PM interviewer instructions
- Prewarm Silero VAD model for voice activity detection
- Entrypoint function: connect to LiveKit room, start AgentSession
- Orchestrate ASR → LLM → TTS pipeline

**Critical Code Pattern**:
```python
session = AgentSession(
    stt="deepgram",           # Speech-to-Text
    llm="openai/gpt-4o-mini", # Language Model
    tts="cartesia",           # Text-to-Speech
    vad=ctx.proc.userdata["vad"],  # Voice Activity Detection
)
await session.start(agent=InterviewAgent(), room=ctx.room)
```

### `/app/api/livekit/token/route.ts`
**Purpose**: Generate LiveKit access tokens for room authentication
**Input**: `{ roomName, participantName }`
**Output**: `{ token, url }`
**Security**: Uses LIVEKIT_API_KEY and LIVEKIT_API_SECRET

### `/app/interview/page.tsx`
**Purpose**: Interview session UI where users connect to LiveKit rooms
**Key Features**:
- Creates unique room ID
- Fetches LiveKit token from API
- Uses `@livekit/components-react` for connection
- Displays agent join status and conversation UI

### `/lib/db/schema.ts`
**Purpose**: Drizzle ORM schema definition
**Tables**:
- `appUser`: User accounts
- `interviewSession`: Interview metadata
- `transcriptTurn`: Turn-by-turn conversation data
- `feedback`: Scored feedback and rubrics

---

## Important Constraints

### Performance Requirements
- **Latency P95**: ≤ 1.2s per turn (end-to-end)
- **Session completion rate**: ≥ 75%
- **Weekly return rate**: ≥ 40%
- **Current Performance**: Not yet measured (Phase 0 functional testing only)

### Data & Privacy
- Explicit consent for audio/video recording (not yet implemented)
- PII redaction from transcripts (not yet implemented)
- EU data residency toggle (post-MVP)

### Cost Constraints
- Cache evaluation results
- Compress transcripts
- On-device VAD where possible (using Silero VAD ✅)
- Batch evaluation post-session
- **Current Cost Estimate** (per 20-min session):
  - ASR (Deepgram): ~$0.09
  - LLM (GPT-4o-mini): ~$0.05
  - TTS (Cartesia): ~$0.10
  - **Total: ~$0.24/session**

---

## Development Commands

### Frontend (Next.js)
```bash
# Development server
npm run dev              # Start Next.js dev server on http://localhost:3000

# Build
npm run build            # Production build

# Lint
npm run lint             # ESLint

# Format
npx prettier --write .   # Format all files
```

### Agent (Python)
```bash
# Setup (one-time)
cd agent
python3 -m venv venv
source venv/bin/activate  # or `venv\Scripts\activate` on Windows
pip install -r requirements.txt

# Development
source venv/bin/activate
python agent.py dev      # Start agent in dev mode (auto-reload on file changes)

# Production (later)
python agent.py start    # Start agent worker
```

### Database
```bash
# Push schema to Supabase
npx drizzle-kit push     # Push current schema (no migration files)

# Generate migrations (future)
npx drizzle-kit generate # Generate migration files
npx drizzle-kit migrate  # Run migrations
```

### Git
```bash
# Commit with Claude co-author
git commit -m "Your message

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## API Endpoints

### Implemented
- ✅ `POST /api/livekit/token` - Generate LiveKit access token
  - Input: `{ roomName: string, participantName: string }`
  - Output: `{ token: string, url: string }`

### Planned (see PRD Section 12)

#### Auth
- `POST /api/auth/callback`

#### Session
- `POST /api/interview/start` → `{ sessionId, token, persona, roundType }`
- `POST /api/interview/end` → `{ sessionId }` (triggers evaluation job)

#### Evaluation
- `POST /api/eval/{{sessionId}}` → generates scores & feedback (idempotent)
- `GET /api/feedback/{{sessionId}}`

#### Dashboard
- `GET /api/metrics/summary` → per-user aggregates
- `GET /api/history` → session list + key scores

---

## Database Schema

**Status**: Deployed to Supabase ✅

### Core Tables

#### `app_user`
- `id` uuid (primary key)
- `email` text (unique, not null)
- `name` text
- `created_at` timestamptz

#### `interview_session`
- `id` uuid (primary key)
- `user_id` uuid (foreign key → app_user)
- `role` text (default 'pm')
- `round_type` text (check: behavioral, product_sense, execution, strategy)
- `mode` text (check: voice_video, text)
- `persona` text
- `started_at` timestamptz
- `ended_at` timestamptz

#### `transcript_turn`
- `id` uuid (primary key)
- `session_id` uuid (foreign key → interview_session)
- `speaker` text (check: user, interviewer)
- `started_at` timestamptz
- `ended_at` timestamptz
- `text` text
- `audio_ms` int
- `latency_ms` int
- `section` text

#### `feedback`
- `id` uuid (primary key)
- `session_id` uuid (foreign key → interview_session, unique)
- `structure_score` int
- `clarity_score` int
- `insight_score` int
- `communication_score` int
- `leadership_score` int
- `overall_score` numeric
- `strengths` jsonb
- `improvements` jsonb
- `drills` jsonb
- `summary` text
- `created_at` timestamptz

**Migration Strategy**: Using `drizzle-kit push` for schema sync (no migration files yet)

---

## Environment Variables

### Required for Current Setup

```bash
# Database (Supabase)
DATABASE_URL=postgresql://...  # Supabase connection string

# LiveKit
LIVEKIT_API_KEY=your_api_key
LIVEKIT_API_SECRET=your_api_secret
NEXT_PUBLIC_LIVEKIT_URL=wss://your-project.livekit.cloud  # or LIVEKIT_URL

# OpenAI (for GPT-4o-mini)
OPENAI_API_KEY=your_openai_key

# Deepgram (ASR)
DEEPGRAM_API_KEY=your_deepgram_key

# Cartesia (TTS)
CARTESIA_API_KEY=your_cartesia_key
```

### Planned

```bash
# Auth
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Hedra (Avatar, post-MVP)
HEDRA_API_KEY=

# Background Jobs
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# Error Tracking
SENTRY_DSN=

# Email
RESEND_API_KEY=
```

---

## Documentation Standards

### Code Comments
- Use docstrings for Python classes and functions
- JSDoc comments for complex TypeScript functions
- Inline comments for non-obvious logic
- Example from `agent.py`:
  ```python
  def prewarm(proc: JobProcess):
      """Prewarm function to load VAD model before agent starts"""
      proc.userdata["vad"] = silero.VAD.load()
  ```

### README Files
- Project README at root with setup instructions
- Component READMEs for complex subsystems
- Keep READMEs up to date with actual setup steps

### API Documentation
- Document API routes with input/output schemas
- Use comments in route handlers for clarity
- Consider OpenAPI/Swagger for later phases

---

## Testing Strategy

**Status**: Not yet implemented.

### Unit Tests
- Framework: Vitest (likely)
- Test utilities, API routes, database operations
- Target: >80% coverage for core logic

### Integration Tests
- Test LiveKit token generation
- Test database operations with test DB
- Test API endpoint flows

### E2E Tests
- Framework: Playwright (likely)
- Test interview flow end-to-end
- Test user authentication and session persistence

### Manual Testing (Phase 0)
- ✅ LiveKit connection and token generation
- ✅ Agent joins room automatically
- ✅ Voice conversation: User speaks → Agent responds
- ✅ Barge-in / interruption handling
- ✅ Agent auto-reload in dev mode

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
- TBD (single developer for MVP)

---

## Known Issues & Technical Debt

### Resolved Issues (Phase 0)
- ✅ SSL Certificate Error: Python 3.12 on macOS needed certificate installation
- ✅ LiveKit Components Styles: Removed unused import
- ✅ VoiceAssistant API: Switched to AgentSession pattern
- ✅ ChatContext API: Simplified to string-based model config
- ✅ Silero VAD Plugin: Installed missing package
- ✅ GPT-4 Model Name: Changed to `openai/gpt-4o-mini`
- ✅ Agent Auto-Reload: Restart needed for prewarm function changes

### Current Technical Debt
- No session persistence (transcripts not saved to DB yet)
- No authentication (Supabase Auth configured but not integrated)
- No feedback/scoring engine
- No error handling in LiveKit token API
- No RLS (Row Level Security) policies on database

---

## Future Considerations

### Phase 1 (Next)
- Session persistence: Save transcripts to database
- Feedback/scoring engine: Post-session evaluation
- User authentication: Supabase Auth integration
- Dashboard: View past sessions and progress

### Phase 2+
- Custom company-specific interview loops
- Enterprise coach dashboards
- Coding/whiteboard IDE integration
- Live human interview marketplace
- Hedra avatar integration

---

## Iteration Log

### 2025-11-05 - Phase 0: LiveKit Voice Integration Complete ✅

**Setup & Infrastructure**
- Created GitHub repository
- Added PRD documentation at `.claude/PRD.md`
- Created CLAUDE.md structure at `.claude/CLAUDE.md`
- Established documentation workflow

**Tech Stack Decisions**
- Finalized tech stack (Next.js, Supabase, Drizzle, LiveKit Agents)
- Decided on Supabase Auth over Clerk (cost at scale)
- Chose LiveKit Agents over OpenAI Realtime API (flexibility, cost control)
- Selected Drizzle ORM for serverless performance
- Chose GPT-4o-mini over GPT-4 for dialogue (cost-effective)

**Database**
- Installed Drizzle ORM and created schema matching PRD
- Configured Supabase clients (browser + server)
- Successfully pushed schema to Supabase
- Verified all 4 tables created: `app_user`, `interview_session`, `transcript_turn`, `feedback`

**LiveKit Integration**
- Created `/agent` directory with Python virtual environment
- Installed LiveKit Agents SDK and plugins (OpenAI, Deepgram, Cartesia, Silero)
- Implemented `agent.py` with AgentSession API pattern
- Created API route `/api/livekit/token` for access token generation
- Created interview page at `/app/interview/page.tsx` with LiveKit React components

**Testing & Debugging**
- Fixed SSL certificate issue (Python 3.12 on macOS)
- Resolved module import errors (LiveKit components, VoiceAssistant)
- Debugged ChatContext API changes (switched to AgentSession)
- Installed missing Silero VAD plugin
- Fixed model name from `openai/gpt-4` to `openai/gpt-4o-mini`
- Verified end-to-end voice pipeline working

**Key Learnings**
- LiveKit Agents API differs from documentation; use official GitHub examples
- `AgentSession` with string-based config is current pattern (not `VoiceAssistant`)
- Prewarm function needed for VAD optimization
- Model format: `"provider/model-name"` (e.g., `"openai/gpt-4o-mini"`)
- Agent auto-reload requires restart for prewarm function changes

**Deliverables**
- ✅ Working voice interview with AI agent
- ✅ Natural conversation with interruption handling
- ✅ Deepgram ASR + GPT-4o-mini + Cartesia TTS pipeline
- ✅ Database schema ready for session persistence
- ✅ Monorepo structure with Next.js + Python agent

---

## Questions & Open Items

### Resolved ✅
1. ~~**ORM Choice**: Prisma vs Drizzle vs raw SQL?~~ → **RESOLVED**: Drizzle (ADR-003)
2. ~~**Auth Provider**: Clerk vs NextAuth?~~ → **RESOLVED**: Supabase Auth (ADR-003)
3. ~~**TTS Provider**: Cartesia vs PlayHT?~~ → **RESOLVED**: Cartesia (ADR-007)
4. ~~**Dialogue LLM**: GPT-4 Turbo vs Claude 3.5 Sonnet?~~ → **RESOLVED**: GPT-4o-mini for MVP (ADR-008)
5. ~~**Monorepo Structure**: Single repo vs separate agent repo?~~ → **RESOLVED**: Monorepo with `/agent` dir (ADR-007)

### Open Questions
1. **Agent Hosting**: Railway vs Render vs Fly.io? (evaluate pricing/DX for production deployment)
2. **TypeScript Config**: Any additional strict mode settings needed?
3. **Testing Framework**: Vitest for unit tests + Playwright for E2E?
4. **RLS Policies**: Which Row Level Security policies needed for production?
5. **Evaluation LLM**: GPT-4 Turbo vs Claude 3.5 Sonnet for post-session scoring?
6. **Session Persistence**: When to save transcript turns? (streaming vs batch after session)
7. **Error Handling**: Retry policies for ASR/TTS failures?
8. **Cost Optimization**: Caching strategies for evaluation?

---

## Review Checklist

Use this checklist when updating this document:

- [x] Update "Last Updated" date
- [x] Update project status and current phase
- [x] Add any new architecture decisions (ADRs)
- [x] Document new commands or workflows
- [x] Update tech stack if dependencies changed
- [x] Record any new constraints or boundaries
- [x] Update project structure if files/folders added
- [x] Add to iteration log
- [x] Review and update open questions

---

**End of Document**
