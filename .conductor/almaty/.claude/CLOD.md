# CLOD: Codebase Living Operational Document

**Project**: MockMate - Real-Time AI Mock Interviews
**Last Updated**: 2025-11-05
**Version**: 0.1.0

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
- **Framework**: Next.js (App Router)
- **UI Library**: React
- **Styling**: Tailwind CSS
- **Component Library**: shadcn/ui
- **Language**: TypeScript (to be configured)

### Backend
- **Runtime**: Node.js (Next.js API routes)
- **Database**: PostgreSQL (via Supabase)
- **Auth**: Clerk or NextAuth (decision pending)
- **ORM**: TBD (Prisma, Drizzle, or raw SQL)

### Real-time & AI
- **WebRTC**: LiveKit Cloud
- **ASR/TTS**: OpenAI Realtime API or Whisper + low-latency TTS
- **Avatar**: Hedra Video
- **LLM**: GPT-4 (for dialogue agent and evaluation)

### Infrastructure
- **Hosting**: Vercel (frontend + API)
- **Database Hosting**: Supabase
- **Real-time**: LiveKit Cloud

---

## Project Structure

```
/
├── .conductor/almaty/.claude/   # Project documentation (PRD, CLOD)
├── src/                          # TBD - Source code (not created yet)
├── public/                       # TBD - Static assets
├── package.json                  # TBD - Dependencies
└── README.md                     # TBD - Project overview
```

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

### 2025-11-05 - Initial Setup
- Created GitHub repository
- Added PRD documentation
- Created CLOD.md structure
- Established documentation workflow

---

## Questions & Open Items

1. **ORM Choice**: Prisma vs Drizzle vs raw SQL?
2. **Auth Provider**: Clerk vs NextAuth?
3. **Monorepo vs Single Repo**: Keep everything in one repo or split frontend/backend?
4. **TypeScript Config**: Strict mode settings?
5. **Testing Framework**: Jest, Vitest, or other?

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
