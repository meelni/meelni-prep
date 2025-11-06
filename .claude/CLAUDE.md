# CLAUDE.md: Codebase Living Operational Document

**Project**: MockMate - Real-Time AI Mock Interviews
**Last Updated**: 2025-11-05
**Version**: 0.7.0

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

**Current Phase**: Phase 0.7 - Demo Modal with LiveKit Cloud Agent Complete ✅
**Next Milestone**: Add session persistence (save transcripts to DB), scoring/feedback engine

**Phase 0 Completion Summary**:
- ✅ Next.js 14+ project initialized with TypeScript, Tailwind, shadcn/ui
- ✅ Database schema deployed to Supabase (4 tables verified)
- ✅ Supabase Auth configured (browser + server clients)
- ✅ LiveKit Agents Python worker implemented and tested
- ✅ LiveKit token generation API working
- ✅ Interview page with real-time voice conversation
- ✅ End-to-end voice pipeline: User speaks → Deepgram Nova-3 → GPT-4.1-mini → Cartesia Sonic 3 (Tessa) → User hears
- ✅ UI redesigned with Linear/Notion aesthetic
- ✅ Component library created (Button, Card, Badge)
- ✅ Framer Motion animations integrated
- ✅ Marketing landing page with modular architecture (Header, Hero, Features, CTA, Footer)
- ✅ Demo modal with LiveKit Cloud agent deployment
- ✅ Explicit agent dispatch system configured

---

## Tech Stack

### Frontend
- **Framework**: Next.js 14+ (App Router)
- **UI Library**: React
- **Styling**: Tailwind CSS v4
- **Component Library**: shadcn/ui + custom components (Button, Card, Badge)
- **Animation**: Framer Motion (spring physics, micro-interactions)
- **Icons**: Lucide React
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
- **ASR**: Deepgram Nova-3 (via LiveKit Inference) - upgraded from Nova-2
- **TTS**: Cartesia Sonic 3.0 with Tessa voice (via LiveKit Inference) - emotive voice optimized
- **Dialogue LLM**: GPT-4.1-mini (via LiveKit Inference) - upgraded from GPT-4o-mini
- **Evaluation LLM**: GPT-4 Turbo (post-session scoring, planned)
- **Avatar**: Hedra Video (lip-sync, post-MVP)
- **VAD**: Silero (livekit-plugins-silero)

### Infrastructure & Services
- **Hosting**: Vercel (Next.js)
- **Agent Hosting**:
  - **Demo Agent**: LiveKit Cloud (deployed, agent ID: CA_bL5fHYqjCTrA)
  - **Main Agent**: Local dev, Railway/Render/Fly.io for production (planned)
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
│   ├── agent.py                  # Main agent entrypoint (self-hosted)
│   ├── demo_agent.py             # Demo agent for landing page (LiveKit Cloud)
│   ├── Dockerfile.demo           # Docker config for Cloud deployment
│   ├── livekit.toml              # LiveKit CLI configuration
│   ├── DEPLOY_DEMO.md            # Cloud deployment guide
│   ├── requirements.txt          # Python dependencies
│   ├── .env                      # Agent environment variables
│   └── .dockerignore             # Docker ignore rules
├── app/                          # Next.js App Router pages
│   ├── layout.tsx                # Root layout
│   ├── page.tsx                  # Home page
│   ├── globals.css               # Global styles
│   ├── interview/                # Interview session page
│   │   └── page.tsx              # LiveKit room UI
│   └── api/                      # API routes
│       └── livekit/
│           ├── token/
│           │   └── route.ts      # LiveKit token generation (main)
│           └── demo-token/
│               └── route.ts      # Demo token generation + agent dispatch
├── components/                   # React components
│   ├── sections/                 # Landing page sections
│   │   ├── header.tsx            # Sticky header with navigation
│   │   ├── hero.tsx              # Hero section with animated title and demo modal
│   │   ├── features.tsx          # Features grid (6 cards)
│   │   ├── cta.tsx               # Call-to-action section
│   │   └── footer.tsx            # Footer with links
│   ├── demo-modal.tsx            # Demo modal with LiveKit audio visualizer
│   ├── aurora-text.tsx           # Animated gradient text component
│   ├── section.tsx               # Reusable section wrapper
│   ├── ui/                       # UI component library
│   │   ├── button.tsx            # Button component with CVA variants
│   │   ├── card.tsx              # Card component
│   │   └── badge.tsx             # Badge component
│   └── README.md                 # Component organization guide
├── lib/                          # Shared utilities and configurations
│   ├── animations.ts             # Framer Motion animation presets
│   ├── config.tsx                # Site configuration (hero, features, footer)
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

**Status**: Established patterns from Phase 0 & 0.5.

### Naming Conventions
- React components: PascalCase (e.g., `InterviewPage.tsx`)
- API routes: kebab-case folders (e.g., `app/api/livekit/token/route.ts`)
- Database tables: snake_case (e.g., `app_user`, `interview_session`)
- Python: snake_case for functions/variables, PascalCase for classes
- CSS classes: kebab-case with BEM-style modifiers when needed

### File Organization
- Server components by default in Next.js App Router
- "use client" directive for client components using LiveKit hooks or Framer Motion
- Colocate related files (e.g., `/interview/page.tsx` for interview UI)
- Component library in `/components/ui/` for reusable components
- Shared utilities in `/lib/` (animations, utils, db)

### TypeScript Guidelines
- Strict mode enabled in tsconfig.json
- Type all function parameters and return values
- Use Zod for runtime validation (planned)
- Prefer interfaces for props, types for unions/utility types

### Design System Conventions
- **Colors**: Use RGB format in CSS variables for opacity control (e.g., `rgb(var(--primary) / 0.5)`)
- **Spacing**: Use Tailwind spacing scale (0.25rem increments)
- **Typography**: Application-scale sizing (text-sm to text-5xl for UI, avoid 6xl+)
- **Animations**: Use Framer Motion spring presets from `/lib/animations.ts`
- **Component Variants**: Use CVA (class-variance-authority) for variant management
- **Hover Effects**: Subtle scale transforms (1.005x, not 1.02x+) for professional feel
- **Gradients**: Use gradient utilities (`.gradient-text`, `.gradient-bg`) for consistency

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

### ADR-014: UI Redesign with Linear/Notion Aesthetic
- **Date**: 2025-11-05
- **Decision**: Complete UI redesign with modern design system inspired by Linear and Notion
- **Rationale**:
  - Previous UI was not intuitive or clean
  - User requested professional, modern aesthetic
  - Needed consistent design language across the application
  - Typography was too large (display-scale vs application-scale)
- **Implementation**:
  - Created RGB-based color token system for better opacity control
  - Built reusable component library using class-variance-authority (CVA)
  - Integrated Framer Motion with spring physics for 60fps animations
  - Refined typography from display-scale (6xl-7xl) to application-scale (2xl-5xl)
  - Implemented gradient backgrounds and micro-interactions
  - Progressive disclosure UX for setup page
- **Consequences**:
  - More polished, professional appearance
  - Improved user experience and visual feedback
  - Consistent design tokens enable easier theming
  - Animation system provides smooth, natural interactions
  - Component library enables rapid development

### ADR-015: Model Upgrade to Deepgram Nova-3, GPT-4.1-mini, and Cartesia Sonic 3 with Tessa Voice
- **Date**: 2025-11-05
- **Decision**: Upgrade all voice pipeline models to latest versions
- **Models Selected**:
  - **STT**: Deepgram Nova-3 (upgraded from Nova-2)
  - **LLM**: OpenAI GPT-4.1-mini (upgraded from GPT-4o-mini)
  - **TTS**: Cartesia Sonic 3.0 with Tessa voice (voice ID: `6ccbfb76-1fc6-48f7-b71d-91ac6298247b`)
  - **VAD**: Silero (unchanged)
- **Rationale**:
  - Nova-3 offers improved speech recognition accuracy
  - GPT-4.1-mini provides better reasoning while maintaining cost-effectiveness
  - Tessa is an emotive voice optimized for Sonic 3, providing more natural conversation
  - User preference for these specific models
- **Key Discovery**:
  - **Cartesia does NOT require separate API key** when using LiveKit Inference
  - Unlike ElevenLabs, Cartesia is fully integrated with LiveKit Cloud
  - Only need LIVEKIT_API_KEY/SECRET for Cartesia TTS
  - ElevenLabs requires separate ELEVENLABS_API_KEY even through LiveKit Inference
- **Consequences**:
  - Better voice quality and natural conversation
  - Simplified configuration (no Cartesia API key needed)
  - TTS format: `cartesia/sonic-3:6ccbfb76-1fc6-48f7-b71d-91ac6298247b`
  - Cost remains similar due to LiveKit Inference pricing

### ADR-016: Cartesia Voice Library and Tessa Voice Selection
- **Date**: 2025-11-05
- **Decision**: Use Tessa voice from Cartesia's 150+ voice library
- **Voice Details**:
  - **Name**: Tessa
  - **Voice ID**: `6ccbfb76-1fc6-48f7-b71d-91ac6298247b`
  - **Characteristics**: Emotive voice with wide emotional range
  - **Model**: Sonic 3.0 (best-in-class emotional response)
  - **Emotions Supported**: Happy, Excited, Sad, Angry, Scared, Confident, and 50+ more
- **Rationale**:
  - User specifically requested Tessa voice
  - Tessa is listed among voices with best emotional response in Sonic 3
  - Natural, engaging voice suitable for interview coaching
- **Discovery Process**:
  - Found comprehensive voice list via SignalWire documentation
  - Cartesia API endpoint: `GET https://api.cartesia.ai/voices`
  - 150+ voices available (British Male, Professional Female, Sarah, etc.)
- **Consequences**:
  - More natural, emotive interview conversations
  - Can easily swap voices by changing voice ID in configuration
  - Default voice ID updated in both frontend (`/app/setup/page.tsx`) and backend (`/agent/agent.py`)

### ADR-017: Marketing Landing Page Architecture
- **Date**: 2025-11-05
- **Decision**: Implemented modular, component-based landing page architecture adapted from reference UI design
- **Implementation**:
  - **Components Structure**: Created `/components/sections/` directory for page sections (header, hero, features, cta, footer)
  - **Configuration-Driven**: Centralized all copy in `/lib/config.tsx` for easy updates
  - **Reusable Primitives**: Built `aurora-text.tsx` and `section.tsx` for consistent patterns
  - **Design System**: Extended `globals.css` with aurora animations and additional color tokens
- **Rationale**:
  - Separation of concerns: content (config), structure (sections), styling (CSS)
  - Easier to maintain and update marketing copy without touching component logic
  - Reusable components enable rapid iteration on landing page variants
  - Professional aesthetic (Linear/Notion-inspired) builds trust with PM candidates
- **Reference Source**:
  - Adapted from external UI design template in `/ui-design` directory
  - Extracted and customized relevant components (hero, features, CTA)
  - Removed unnecessary sections (testimonials, pricing, blog, etc.)
  - **Recommendation**: External `/ui-design` folder can be deleted from parent directory
- **Architecture Pattern**:
  ```
  /app/page.tsx (orchestrator)
    → imports sections from /components/sections/
      → each section imports from /lib/config.tsx
      → uses primitives (aurora-text, section) for consistency
  ```
- **Consequences**:
  - Clean separation allows marketing team to update copy in config file
  - Consistent design language across all landing page sections
  - Easy to A/B test different hero messages or feature sets
  - Component library can be reused for future marketing pages
  - External UI template no longer needed (all necessary code extracted)

### ADR-018: Demo Modal with LiveKit Cloud Agent
- **Date**: 2025-11-05
- **Decision**: Implemented demo modal on landing page with separate LiveKit Cloud-deployed agent
- **Rationale**:
  - **User Experience**: Allow visitors to instantly try voice AI without signup
  - **Isolation**: Demo agent separate from main interview agent (different prompt, duration)
  - **Scalability**: Cloud-hosted agent auto-scales, no local infrastructure needed
  - **Cost Optimization**: Cloud agent only active during demo sessions (~60 seconds)
- **Architecture**:
  ```
  Landing Page → "Talk to Meelni" Button
      ↓
  DemoModal Component Opens
      ↓
  POST /api/livekit/demo-token
      ↓
  1. Create unique room: demo-{timestamp}-{random}
  2. AgentDispatchClient.createDispatch(roomName, "CA_bL5fHYqjCTrA")
  3. Return token + url
      ↓
  LiveKit Cloud Agent Receives Dispatch
      ↓
  Agent joins room (cold start ~2-3 seconds)
      ↓
  60-second demo conversation
      ↓
  Room auto-deletes after 2 minutes (emptyTimeout)
  ```
- **Key Components**:
  - **Demo Agent** (`/agent/demo_agent.py`): 60-second optimized prompt, separate from main agent
  - **Demo Token API** (`/app/api/livekit/demo-token/route.ts`): Creates room + dispatches Cloud agent
  - **DemoModal** (`/components/demo-modal.tsx`): LiveKit audio visualizer UI with mic toggle
  - **Hero Integration** (`/components/sections/hero.tsx`): Modal trigger button
- **Critical Configuration**:
  - **MUST set `agent_name` in WorkerOptions**: Required for explicit dispatch via AgentDispatchClient
  - **Room Name Pattern**: `demo-*` prefix for filtering/analytics
  - **Agent ID**: `CA_bL5fHYqjCTrA` (deployed to LiveKit Cloud)
  - **Auto-cleanup**: `emptyTimeout: 120` (room deleted 2 min after last participant)
- **Consequences**:
  - Separate deployment pipeline for demo agent (uses `Dockerfile.demo`)
  - Cloud agent scales to zero when not in use (cost-effective)
  - No competition with self-hosted agents (isolated dispatch)
  - Faster iteration: update demo agent without affecting production interviews
  - **Important**: Agent requires `agent_name` parameter to receive dispatches

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
          agent_name="CA_bL5fHYqjCTrA",  # Required for explicit dispatch!
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
# Current configuration (as of 2025-11-05)
stt_model = "deepgram/nova-3"
llm_model = "openai/gpt-4.1-mini"
tts_model = "cartesia/sonic-3:6ccbfb76-1fc6-48f7-b71d-91ac6298247b"  # Tessa voice

session = AgentSession(
    stt=stt_model,
    llm=llm_model,
    tts=tts_model,
    vad=ctx.proc.userdata["vad"],  # Silero VAD
)
await session.start(agent=InterviewAgent(instructions=instructions), room=ctx.room)
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

### `/components/ui/button.tsx`
**Purpose**: Reusable button component with variants
**Key Features**:
- CVA (class-variance-authority) for variant management
- Variants: primary, secondary, glow, ghost, outline
- Sizes: sm, md, lg
- TypeScript-first with proper prop typing
- Framer Motion integration support

### `/components/ui/card.tsx`
**Purpose**: Card component for content containers
**Key Features**:
- Consistent padding and border radius
- Surface color with subtle borders
- Hover states and transitions

### `/components/ui/badge.tsx`
**Purpose**: Badge component for labels and status indicators
**Key Features**:
- Multiple variants (default, success, warning, info)
- Compact sizing for inline use

### `/lib/animations.ts`
**Purpose**: Centralized Framer Motion animation presets
**Exports**:
- `fadeInUp`: Fade and slide up animation
- `staggerContainer`: Container for staggered children
- `selectionSpring`: Spring animation for selections (scale + opacity)
- `pageTransition`: Page-level transition settings
**Usage**: Import and apply to motion components for consistent animations

### `/app/setup/page.tsx`
**Purpose**: Interview configuration and setup flow
**Key Features**:
- Interview type selection (Product Sense, Analytical, Leadership, Strategy)
- Mode selection (Mock Interview, Practice, Learning)
- Optimal defaults configuration (hidden from user)
- Progressive disclosure UX with visual feedback
- Navigates to `/interview` with query parameters
**Configuration Passed**:
```typescript
{
  role, mode, interview_type, voice, skill_level,
  speed, emotion, volume, tts_model, stt_model, llm_model
}
```

### `/app/globals.css`
**Purpose**: Global styles and design system tokens
**Key Features**:
- RGB-based color variables for better opacity control
- Light and dark mode support
- Design tokens: colors, spacing, typography, radius, timing
- Gradient utilities (`.gradient-text`, `.gradient-bg`)
- Aurora animation keyframes for gradient text effects
- Animation utilities

### `/lib/config.tsx`
**Purpose**: Centralized site configuration
**Exports**:
- `siteConfig`: Object containing all copy for landing page
  - Hero section (title, description, CTA)
  - Features list (6 features with icons)
  - Footer links and branding
**Usage**: Import in landing page sections for consistency

### `/components/aurora-text.tsx`
**Purpose**: Animated gradient text component
**Key Features**:
- Multi-color gradient animation
- Configurable colors and speed
- Uses aurora keyframes from globals.css

### `/components/section.tsx`
**Purpose**: Reusable section wrapper for landing page
**Key Features**:
- Consistent spacing and layout
- Optional title, subtitle, description
- Alignment control (left, center, right)
- Gradient background overlay

### `/components/sections/hero.tsx`
**Purpose**: Hero section for landing page
**Key Features**:
- Animated pill badge ("New" label)
- Aurora gradient animated title
- Staggered fade-in animations
- CTA button linking to /setup

### `/components/sections/features.tsx`
**Purpose**: Features grid section
**Key Features**:
- 6-card grid layout (responsive)
- Icons from Lucide React
- Staggered scroll animations
- Hover effects

### `/components/sections/header.tsx`
**Purpose**: Sticky header with navigation
**Key Features**:
- Sticky positioning with backdrop blur
- Brand logo with gradient icon
- CTA button

### `/components/sections/footer.tsx`
**Purpose**: Footer with links and contact info
**Key Features**:
- 3-column grid layout (responsive)
- Brand, Links, Contact sections
- Copyright notice

### `/agent/demo_agent.py`
**Purpose**: Separate demo agent for landing page 60-second demos
**Key Responsibilities**:
- Define `DemoAgent` class with 60-second demo prompt
- Configure for LiveKit Cloud deployment (no custom parameters)
- Set `agent_name="CA_bL5fHYqjCTrA"` for explicit dispatch
- Uses same voice pipeline as main agent (Deepgram Nova-3, GPT-4.1-mini, Cartesia Sonic 3)

**Critical Configuration**:
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
            agent_name="CA_bL5fHYqjCTrA",  # Required for explicit dispatch!
        ),
    )
```

**Deployment**:
- Uses `Dockerfile.demo` for Cloud deployment
- Deployed with `lk agent create --secrets-file .env.demo .`
- Update with `lk agent deploy .`
- Agent ID stored in `livekit.toml`

### `/app/api/livekit/demo-token/route.ts`
**Purpose**: Generate tokens and dispatch Cloud agent for demo sessions
**Input**: `{ participantName: string }`
**Output**: `{ token: string, url: string, roomName: string }`

**Key Responsibilities**:
1. Generate unique room name: `demo-{timestamp}-{random}`
2. Create room with metadata and auto-cleanup settings
3. Dispatch Cloud agent using AgentDispatchClient
4. Generate participant access token
5. Return credentials for LiveKit connection

**Critical Code Pattern**:
```typescript
import { AgentDispatchClient } from "livekit-server-sdk";

const roomName = `demo-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
const DEMO_AGENT_ID = "CA_bL5fHYqjCTrA";

// Create room with auto-cleanup
await roomClient.createRoom({
  name: roomName,
  emptyTimeout: 120, // Auto-delete 2 min after last participant
  maxParticipants: 2, // User + agent only
});

// Dispatch Cloud agent
const dispatchClient = new AgentDispatchClient(livekit_url, apiKey, apiSecret);
await dispatchClient.createDispatch(roomName, DEMO_AGENT_ID);
```

### `/components/demo-modal.tsx`
**Purpose**: Modal UI for demo voice conversation with audio visualizer
**Key Features**:
- Full-screen modal with backdrop blur
- LiveKit room connection with `useVoiceAssistant` hook
- BarVisualizer for real-time audio visualization
- Mic toggle with mute/unmute functionality
- Connection status indicator
- Agent state indicator (listening, thinking, speaking)
- "Start Full Interview" button to redirect to /setup

**Key Components**:
```typescript
<LiveKitRoom
  token={token}
  serverUrl={url}
  connect={true}
  audio={true}
  video={false}
>
  <DemoControls onClose={onClose} />
</LiveKitRoom>

function DemoControls() {
  const { state, audioTrack } = useVoiceAssistant();

  return (
    <BarVisualizer
      state={agentState}
      barCount={30}
      trackRef={audioTrack}
    />
  );
}
```

**State Management**:
- Fetches token on mount via `/api/livekit/demo-token`
- Manages connection status (idle, connecting, connected)
- Handles mic muting/unmuting via LocalAudioTrack
- Displays agent state from useVoiceAssistant hook

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

### LiveKit Cloud Agent Deployment

#### Prerequisites
```bash
# Install LiveKit CLI
brew install livekit-cli  # macOS
# or download from: https://docs.livekit.io/home/cli/

# Authenticate with LiveKit Cloud
lk cloud auth
```

#### First-Time Deployment

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

**Step 3: Deploy Agent**
```bash
# Create and deploy new agent (first time)
lk agent create --secrets-file .env.demo .

# Output will include agent ID (e.g., CA_bL5fHYqjCTrA)
# This is automatically saved to livekit.toml
```

**Step 4: Configure Agent Name for Explicit Dispatch**
```python
# CRITICAL: Update demo_agent.py to include agent_name
if __name__ == "__main__":
    cli.run_app(
        WorkerOptions(
            entrypoint_fnc=entrypoint,
            prewarm_fnc=prewarm,
            agent_name="CA_bL5fHYqjCTrA",  # Use your agent ID from Step 3
        ),
    )
```

**Step 5: Redeploy with Agent Name**
```bash
# Deploy updated agent with agent_name configured
lk agent deploy .

# Wait for deployment to complete (~30-60 seconds)
```

**Step 6: Update Frontend with Agent ID**
```typescript
// Update /app/api/livekit/demo-token/route.ts
const DEMO_AGENT_ID = "CA_bL5fHYqjCTrA"; // Your agent ID from Step 3
```

#### Updating Existing Agent

```bash
cd agent

# Ensure Dockerfile exists
cp Dockerfile.demo Dockerfile

# Deploy new version (rolling deployment)
lk agent deploy .

# Old instances stay active up to 1 hour to complete sessions
```

#### Monitoring

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

#### Troubleshooting

**Issue: Agent not receiving dispatches**
```bash
# Check: Is agent_name set in WorkerOptions?
grep -A5 "WorkerOptions" demo_agent.py

# Should see: agent_name="CA_xxxxxxxxxxxx"

# View agent status
lk agent status

# Check dispatch in LiveKit dashboard
# Go to: https://cloud.livekit.io/projects/{project}/agents
```

**Issue: Build failed**
```bash
# View build logs
lk agent logs --log-type=build

# Common causes:
# - Missing dependencies in requirements.txt
# - Dockerfile syntax error
# - Secrets not set correctly
```

**Issue: Runtime errors**
```bash
# View runtime logs
lk agent logs

# Common causes:
# - Missing environment variables
# - Invalid model names
# - API key issues
```

**Issue: Update secrets**
```bash
# Update environment variables
lk agent update-secrets \
  --secrets OPENAI_API_KEY=sk-new-key \
  --secrets DEEPGRAM_API_KEY=new-key
```

#### Rollback

```bash
# Rollback to previous version
lk agent rollback
```

#### Delete Agent

```bash
# Remove agent from LiveKit Cloud
lk agent delete
```

#### Critical Configuration Requirements

**MUST HAVE**:
1. **`agent_name` in WorkerOptions**: Required for explicit dispatch via AgentDispatchClient
2. **Matching agent ID in frontend**: DEMO_AGENT_ID must match agent_name
3. **Dockerfile named exactly `Dockerfile`**: CLI requires this name
4. **Secrets file with required keys**: OPENAI_API_KEY, DEEPGRAM_API_KEY

**DO NOT USE** (Cloud limitations):
- `load_threshold` - Not supported on Cloud
- `num_idle_processes` - Not supported on Cloud
- `request_fnc` - Not supported on Cloud

**ONLY USE**:
- `entrypoint_fnc` - Your agent entrypoint
- `prewarm_fnc` - Prewarm function for VAD
- `agent_name` - Agent ID for explicit dispatch

#### Cost Considerations

**LiveKit Cloud Agent Hosting**:
- Auto-scales based on demand
- Charges per active agent instance hour
- Scales to zero when no sessions active
- Cold start: ~2-3 seconds

**Demo Use Case** (60-second sessions):
- Agent only active during demo
- Most cost-effective for sporadic usage
- No 24/7 server costs vs self-hosted

---

## API Endpoints

### Implemented
- ✅ `POST /api/livekit/token` - Generate LiveKit access token (main interview)
  - Input: `{ roomName: string, participantName: string }`
  - Output: `{ token: string, url: string }`

- ✅ `POST /api/livekit/demo-token` - Generate demo token and dispatch Cloud agent
  - Input: `{ participantName: string }`
  - Output: `{ token: string, url: string, roomName: string }`
  - Creates unique demo room: `demo-{timestamp}-{random}`
  - Dispatches Cloud agent (CA_bL5fHYqjCTrA) using AgentDispatchClient
  - Room auto-deletes 2 minutes after last participant leaves

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

# OpenAI (for GPT-4.1-mini)
OPENAI_API_KEY=your_openai_key

# Deepgram (ASR - Nova-3)
DEEPGRAM_API_KEY=your_deepgram_key

# Cartesia (TTS) - NOT REQUIRED when using LiveKit Inference
# CARTESIA_API_KEY=your_cartesia_key  # Only needed for direct API access
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

### Resolved Issues (Phase 0, 0.5, 0.7)
- ✅ SSL Certificate Error: Python 3.12 on macOS needed certificate installation
- ✅ LiveKit Components Styles: Removed unused import
- ✅ VoiceAssistant API: Switched to AgentSession pattern
- ✅ ChatContext API: Simplified to string-based model config
- ✅ Silero VAD Plugin: Installed missing package
- ✅ GPT-4 Model Name: Changed to `openai/gpt-4o-mini` (later upgraded to `gpt-4.1-mini`)
- ✅ Agent Auto-Reload: Restart needed for prewarm function changes
- ✅ Typography Scale: Fixed overly large fonts (display-scale → application-scale)
- ✅ ElevenLabs Authentication: Discovered requires separate API key; switched to Cartesia
- ✅ Interview Page Loading: Resolved by agent restart after configuration changes
- ✅ Cartesia API Key Confusion: Clarified that Cartesia doesn't need separate key with LiveKit Inference
- ✅ Multiple Agents Competing: Self-hosted agents competing for dispatches; resolved with explicit dispatch
- ✅ Cloud Agent Not Joining: Missing `agent_name` in WorkerOptions; required for explicit dispatch
- ✅ Demo Modal Muted Button: Text logic was inverted; fixed to show correct state

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

### 2025-11-05 - Phase 0.5: UI Redesign & Model Upgrade Complete ✅

**UI/UX Redesign**
- Implemented complete design system overhaul with Linear/Notion aesthetic
- Created RGB-based color token system in `globals.css` for better opacity control
- Built reusable component library: Button, Card, Badge (using CVA)
- Integrated Framer Motion for smooth animations with spring physics
- Created animation utilities in `lib/animations.ts` (fadeInUp, staggerContainer, selectionSpring)
- Redesigned home page with gradient backgrounds and animated feature cards
- Redesigned setup page with progressive disclosure UX and visual feedback
- Refined typography from display-scale (6xl-7xl) to application-scale (2xl-5xl)
- Added Lucide React for consistent iconography
- Removed social proof section per user request

**Voice Pipeline Upgrade**
- Upgraded STT: Deepgram Nova-2 → Nova-3
- Upgraded LLM: GPT-4o-mini → GPT-4.1-mini
- Upgraded TTS: Default Cartesia voice → Sonic 3.0 with Tessa voice
- Tessa voice ID: `6ccbfb76-1fc6-48f7-b71d-91ac6298247b`
- Maintained Silero VAD (unchanged)

**Key Technical Discoveries**
- **Cartesia Integration**: Cartesia does NOT require separate API key with LiveKit Inference
- Cartesia is fully integrated with LiveKit Cloud (unlike ElevenLabs)
- Only LIVEKIT_API_KEY/SECRET needed for Cartesia TTS
- ElevenLabs requires separate ELEVENLABS_API_KEY even through LiveKit Inference
- Found comprehensive Cartesia voice library (150+ voices) via SignalWire documentation
- Tessa identified as emotive voice optimized for Sonic 3 with wide emotional range

**Configuration Updates**
- Updated `OPTIMAL_DEFAULTS` in `/app/setup/page.tsx` with Tessa voice ID and new models
- Updated default config in `/agent/agent.py` with Tessa voice ID and new models
- Updated TTS format to: `cartesia/sonic-3:6ccbfb76-1fc6-48f7-b71d-91ac6298247b`
- Updated STT format to: `deepgram/nova-3`
- Updated LLM format to: `openai/gpt-4.1-mini`

**Testing & Debugging**
- Tested ElevenLabs integration (discovered API key requirement issue)
- Switched to Cartesia per user preference
- Verified Tessa voice working correctly
- Agent restart required after configuration changes

**Deliverables**
- ✅ Modern, professional UI with consistent design language
- ✅ Component library for rapid development
- ✅ Smooth 60fps animations with spring physics
- ✅ Upgraded voice pipeline with better quality models
- ✅ Tessa voice providing natural, emotive conversation
- ✅ Simplified configuration (no Cartesia API key needed)
- ✅ Committed and pushed to GitHub (feat: redesign UI and upgrade models)

### 2025-11-05 - Phase 0.7: Demo Modal with LiveKit Cloud Agent Complete ✅

**Demo Modal Implementation**
- Created `/components/demo-modal.tsx` with LiveKit audio visualizer
- Integrated DemoModal into Hero section with button trigger
- Implemented full-screen modal UI with backdrop blur
- Added BarVisualizer for real-time audio visualization (30 bars)
- Built mic toggle with mute/unmute functionality
- Added connection status and agent state indicators
- Included "Start Full Interview" CTA button

**LiveKit Cloud Agent Deployment**
- Created `/agent/demo_agent.py` with 60-second optimized prompt
- Separate agent from main interview agent (isolated deployment)
- Deployed to LiveKit Cloud using `lk agent create`
- Agent ID: `CA_bL5fHYqjCTrA` (saved in `livekit.toml`)
- Created `Dockerfile.demo` for Cloud deployment
- Configured `.dockerignore` to exclude main agent files

**Explicit Agent Dispatch System**
- Created `/app/api/livekit/demo-token/route.ts` API endpoint
- Implemented AgentDispatchClient for programmatic agent dispatch
- Unique room names: `demo-{timestamp}-{random}` pattern
- Room auto-cleanup: `emptyTimeout: 120` (2 minutes)
- Dispatch metadata for agent context

**Critical Technical Discoveries**
- **agent_name Required**: Must set `agent_name` in WorkerOptions for explicit dispatch
- Without `agent_name`, agents compete for automatic dispatch (6 self-hosted workers issue)
- AgentDispatchClient.createDispatch() requires matching agent_name
- Setting agent_name **disables automatic dispatch** entirely
- Cloud agents support cold start (~2-3 seconds)

**Testing & Debugging**
- Fixed muted button text logic (`isMuted ? "Unmute" : "Microphone On"`)
- Debugged dispatch issues (multiple self-hosted agents competing)
- Resolved Cloud agent not receiving jobs (missing agent_name)
- Tested rolling deployment with `lk agent deploy`
- Verified demo flow end-to-end: modal → token → dispatch → agent join → conversation

**Configuration**
- Updated `.env.demo` with OPENAI_API_KEY, DEEPGRAM_API_KEY only
- Removed unsupported Cloud parameters (load_threshold, num_idle_processes)
- Configured explicit dispatch via agent_name parameter
- Updated DEMO_AGENT_ID in frontend to match Cloud agent ID

**Documentation**
- Created `/agent/DEPLOY_DEMO.md` with step-by-step Cloud deployment guide
- Updated CLAUDE.md with comprehensive LiveKit Cloud deployment section
- Added ADR-018 (Demo Modal Architecture)
- Added ADR-019 (Explicit Agent Dispatch Pattern)
- Documented file responsibilities for demo-related files
- Added troubleshooting guide for common deployment issues

**Key Learnings**
- LiveKit Cloud auto-scales agents based on demand
- Explicit dispatch provides full control over agent assignment
- Room name patterns enable filtering and analytics
- AgentDispatchClient requires proper authentication (API key + secret)
- Cloud agents have different parameter restrictions vs self-hosted
- Rolling deployments keep old instances active for up to 1 hour

**Architecture Benefits**
- Isolated demo agent: no interference with main interview agent
- Cost-effective: Cloud agent scales to zero when not in use
- Fast iteration: update demo agent without touching production
- Better UX: instant voice demo for landing page visitors
- Scalable: auto-scales based on concurrent demo sessions

**Deliverables**
- ✅ Working demo modal with voice conversation
- ✅ LiveKit Cloud agent deployment pipeline
- ✅ Explicit agent dispatch system configured
- ✅ Demo token API with AgentDispatchClient
- ✅ Audio visualizer with mic controls
- ✅ Comprehensive deployment documentation
- ✅ Troubleshooting guide for common issues
- ✅ Committed and pushed to branch `saviii/landing-demo-modal`

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

---

## Phase 1 Planning - Enhanced Interview System

### ADR-010: Interview Mode System with Role Reversal
- **Date**: 2025-11-05
- **Decision**: Implement dual-role interview system where users can be either interviewee or interviewer
- **Rationale**:
  - **User as Interviewee** (primary): Practice being interviewed by AI coach using PM frameworks
  - **User as Interviewer** (secondary): Practice conducting interviews with AI playing candidate
  - Provides comprehensive interview preparation from both perspectives
- **Consequences**:
  - Agent needs two distinct personas (interviewer vs candidate)
  - More complex prompt template system
  - Richer learning experience for users

### ADR-011: Multiple Interview Modes and Frameworks
- **Date**: 2025-11-05
- **Decision**: Support 7 distinct interview modes with PM-specific frameworks
- **Interview Types**:
  - Product Sense (5-step framework)
  - Analytical Thinking (goal-setting framework with simplified metrics)
  - Leadership & Drive (STAR method behavioral)
  - Strategy (complex strategic questions)
- **Modes**:
  - Mock Interview (realistic 45-min)
  - Practice (quick practice with feedback)
  - Learning (teach frameworks)
  - Feedback (evaluate responses)
  - Demonstration (show expert answers)
  - Interactive Coaching (step-by-step with pauses)
  - Strategy (complex business discussions)
- **Rationale**: Different learning styles require different coaching approaches
- **Consequences**:
  - Dynamic prompt system needed
  - Agent must adapt interaction style based on mode
  - Modular prompt templates required

### ADR-012: Voice Model Selection UI
- **Date**: 2025-11-05
- **Decision**: Allow users to select from multiple Cartesia voice models
- **Available Voices**:
  - Male: British Male, Conversational Male
  - Female: Friendly Female, Professional Female
- **Rationale**: Personalization improves user comfort and engagement
- **Consequences**:
  - UI for voice selection with preview
  - Agent must accept voice model as parameter
  - TTS configuration becomes dynamic

### ADR-013: Interview Configuration Flow
- **Date**: 2025-11-05
- **Decision**: Add interview setup page before session starts
- **Configuration Options**:
  - Role (interviewer/interviewee)
  - Interview type (PS/AT/LD/Strategy)
  - Mode (7 modes)
  - Voice model (4+ options)
  - Advanced: difficulty, time limit, feedback mode
- **Rationale**: One-size-fits-all doesn't work for diverse practice needs
- **Consequences**:
  - New `/setup` page required
  - Configuration passed via room metadata
  - Session URL includes config params

### Planned Features (Phase 1)
- ✅ Interruption/barge-in (already working via Silero VAD)
- 🔲 Interview setup/configuration page
- 🔲 Dynamic prompt template system
- 🔲 Voice model selection UI
- 🔲 Role reversal (user as interviewer)
- 🔲 7 interview modes
- 🔲 4 interview types (PS/AT/LD/Strategy)
- 🔲 Difficulty levels
- 🔲 Time limits
- 🔲 Feedback modes (real-time/end/silent)


---

## LiveKit Documentation References

**Added**: 2025-11-05

For questions about LiveKit Agents, TTS/STT configuration, voice models, and API details, refer to these official resources:

### Primary Resources
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

### Cartesia TTS Configuration
From `/agent/venv/lib/python3.12/site-packages/livekit/plugins/cartesia/`:

**Available Parameters** (`tts.py`):
- `model`: "sonic", "sonic-2", "sonic-lite", "sonic-turbo", "sonic-3"
- `voice`: Voice ID string or embedding array
- `speed`: float (0.6 to 1.5) or preset ("fastest", "fast", "normal", "slow", "slowest")
- `emotion`: List of emotion strings (59 options available)
- `volume`: float (0.5 to 2.0)
- `language`: 35+ supported languages
- `sample_rate`: int (default 24000)
- `word_timestamps`: bool (default True)

**Voice Models** (`models.py`):
- Default: `f786b574-daa5-4673-aa0c-cbe3e8534c02` (Katie - Friendly Fixer)
- 100+ voices available via API: `GET https://api.cartesia.ai/voices`

**Emotions Available**:
Happy, Excited, Enthusiastic, Calm, Confident, Neutral, Anxious, Sad, Angry, Curious, Grateful, Peaceful, and 47 more variations

### Current Implementation
- **Speed Control**: 0.6x to 1.5x (slider in UI)
- **Emotion Selection**: 11 common emotions in dropdown
- **Volume Control**: 0.5x to 2.0x (slider in UI)
- **Voice Selection**: Dynamic fetch from Cartesia API
- **Model Selection**: sonic-2, sonic-3, sonic-turbo

### Useful Commands
```bash
# View Cartesia TTS source
cat /path/to/venv/lib/python3.12/site-packages/livekit/plugins/cartesia/tts.py

# Check available voices
curl -H "X-API-Key: $CARTESIA_API_KEY" \
     -H "Cartesia-Version: 2025-04-16" \
     https://api.cartesia.ai/voices
```

