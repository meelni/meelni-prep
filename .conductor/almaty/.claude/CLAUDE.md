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
