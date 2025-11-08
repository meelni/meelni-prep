# CLAUDE.md: Codebase Living Operational Document

**Project**: Meelni - Real-Time AI Mock Interviews
**Last Updated**: 2025-11-08
**Version**: 1.0.0

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

## Documentation Map

**Finding Information Fast**:
- **Current System State** → CLAUDE.md (this file)
- **Product Requirements** → PRD.md
- **LiveKit Patterns** → LIVEKIT.md
- **Database Schema & Patterns** → DATABASE.md
- **API Specs** → docs/api/
- **Architecture Decisions** → Search CLAUDE.md for "ADR-"
- **Authentication** → docs/api/authentication.md
- **Testing** → docs/development/testing.md
- **Deployment** → DEPLOYMENT.md
- **Troubleshooting** → TROUBLESHOOTING.md
- **Contributing** → CONTRIBUTING.md
- **Historical Context** → `.conductor/florence/archive/` (rarely needed)

**For Agents**: Start with CLAUDE.md. If you need deep technical details on a specific domain, check the relevant file above. Historical implementation logs are in `.conductor/florence/archive/` but should only be referenced if explicitly asked.

---

## Project Status

**Current Phase**: Phase 1.0 - MVP Complete ✅
**Next Milestone**: Production deployment and user testing

**MVP Features Complete**:
- ✅ Next.js 14+ project with TypeScript, Tailwind, shadcn/ui
- ✅ Google OAuth authentication with Supabase Auth
- ✅ Protected routes with Next.js middleware
- ✅ LiveKit real-time voice pipeline (Deepgram Nova-3 → GPT-4.1-mini → Cartesia Sonic 3)
- ✅ Question bank with 2,879 PM interview questions (timestamp-filtered)
- ✅ Question recency preference UI (Current Trends / Broader Practice / All Questions)
- ✅ **Real-time transcript capture and persistence**
- ✅ **AI-powered feedback engine with GPT-4 Turbo evaluation**
- ✅ **Row Level Security (RLS) policies on all user data**
- ✅ Tactical dashboard with sidebar navigation
- ✅ Marketing landing page with demo modal
- ✅ LiveKit Cloud agent deployment (explicit dispatch)

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
  - **Demo Agent**: LiveKit Cloud (deployed, agent ID: CA_Wp8bi3bRroE2)
  - **Main Interview Agent**: LiveKit Cloud (deployed, agent ID: CA_yawKG67rCMG4) ✅
  - **Deployment**: Both agents deployed to LiveKit Cloud (us-east region)
  - **Local Development**: Run agents locally with `python agent.py dev`
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


### Typography Standards
- **Primary Font**: Public Sans (variable weight, UI text)
- **Display Font**: Everett (headings, branding)
- **Scale**: Application-scale (text-sm to text-5xl for UI, avoid 6xl+)
- **Rationale**: Public Sans optimized for screen readability, Everett for brand personality
- **Migration Note**: Changed from Geist Sans (Next.js default) to Public Sans/Everett for better aesthetics

**Font Loading**:
- Public Sans: `next/font/google` with variable weight (automatic optimization)
- Everett: Local files in `/public/fonts/everett/` (WOFF2 format)
- CSS Variables: `--font-sans` (Public Sans), `--font-display` (Everett)
- Usage: Apply `font-sans` for body text, `font-display` for headings

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
  - Cartesia is fully integrated with LiveKit Cloud
  - **ElevenLabs also does NOT require separate API key** when using LiveKit Inference
  - Both Cartesia and ElevenLabs work with only LIVEKIT_API_KEY/SECRET for TTS
  - **Important**: Must use valid voice IDs from provider documentation (see ADR-024 for debugging)
- **Consequences**:
  - Better voice quality and natural conversation
  - Simplified configuration (no Cartesia API key needed)
  - TTS format: `cartesia/sonic-3:6ccbfb76-1fc6-48f7-b71d-91ac6298247b`
  - Cost remains similar due to LiveKit Inference pricing
  - Must verify voice IDs are valid for chosen TTS provider

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
  2. AgentDispatchClient.createDispatch(roomName, "CA_Wp8bi3bRroE2")
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
  - **Agent ID**: `CA_Wp8bi3bRroE2` (deployed to LiveKit Cloud)
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
          agent_name="CA_Wp8bi3bRroE2",  # Required for explicit dispatch!
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

### ADR-020: Google OAuth Authentication Implementation
- **Date**: 2025-11-06
- **Decision**: Implemented full Google OAuth authentication with Supabase Auth
- **Rationale**:
  - **User Requirement**: Authentication needed for "Start A Mock" flow
  - **Provider Choice**: Google OAuth only (initially) for simplicity
  - **No Onboarding**: Direct to dashboard after sign-in per user request
  - **Demo Separation**: Keep demo modal auth-free for instant testing
- **Implementation**:
  - **AuthProvider** (`app/providers/auth-provider.tsx`): React Context for session management
  - **Sign-in Page** (`app/auth/signin/page.tsx`): Google OAuth button with polished UI
  - **Callback Route** (`app/auth/callback/route.ts`): Exchanges OAuth code for session
  - **Middleware** (`middleware.ts`): Protects `/dashboard`, `/setup`, `/interview` routes
  - **Dashboard** (`app/dashboard/page.tsx`): Personalized welcome + "Start Mock Interview" CTA
- **User Flow**:
  ```
  Landing Page → "Start A Mock" button
      ↓
  /dashboard (middleware checks auth)
      ↓
  If not logged in → /auth/signin
      ↓
  Google OAuth consent screen
      ↓
  /auth/callback (code exchange)
      ↓
  /dashboard (authenticated)
      ↓
  "Start Mock Interview" → /setup → /interview
  ```
- **Key Features**:
  - Personalized greeting with user's first name from Google profile
  - Auto-redirect if already authenticated
  - Sign out functionality from dashboard
  - Preserves redirect URL for post-login navigation
  - Demo modal remains auth-free (no friction for trying the product)
- **Consequences**:
  - Authentication gate for full interview experience
  - User data (name, email) stored in Supabase Auth
  - Need to add RLS policies later for data security
  - Easy to add email/password auth later if needed
  - Google Cloud Console OAuth credentials required (already configured)

### ADR-021: Tactical Dashboard UI Migration
- **Date**: 2025-11-06
- **Decision**: Migrated dashboard to tactical command-interface style layout with sidebar navigation
- **Rationale**:
  - **User Requirement**: Adopt tactical-command-interface example UI for improved dashboard UX
  - **Layout Structure**: Sidebar + toolbar + main content grid provides better navigation and organization
  - **Preserve Branding**: Keep Meelni's color scheme and typography while adopting tactical layout
  - **Minimal Text Changes**: Replace military/tactical terminology with interview-related terms
  - **Modular Architecture**: Create placeholder sections for future development
- **Color Migration**:
  - Tactical Orange (`#f97316`, `text-orange-500`) → Meelni Purple-Blue (`oklch(0.70 0.22 285)`, `text-primary`)
  - Tactical Dark Neutrals (`bg-neutral-900/950`) → Meelni Card (`bg-card`)
  - Tactical Borders (`border-neutral-800`) → Meelni Borders (`border-border`)
  - Tactical Accents (`bg-orange-500/10`) → Meelni Accents (`bg-primary/10`)
- **Text Changes**:
  - "TACTICAL COMMAND INTERFACE" → "MEELNI DASHBOARD"
  - "Mission Control" → "Overview"
  - "Operations History" → "Interview History"
  - "Intel & Analysis" → "Analytics"
  - "Strategic Planning" → "Settings"
  - "Alert Status" → "Session Stats"
- **Implementation**:
  - **Layout Components**:
    - `/components/dashboard/layout/sidebar.tsx`: Collapsible sidebar with 5 navigation sections
    - `/components/dashboard/layout/toolbar.tsx`: Top toolbar with breadcrumb and user actions
    - `/components/dashboard/layout/dashboard-layout.tsx`: Main layout wrapper
  - **Section Components**:
    - `/components/dashboard/sections/overview.tsx`: Main overview with stats, charts, activity log
    - `/components/dashboard/sections/history.tsx`: Full interview history with tactical styling
    - `/components/dashboard/sections/analytics.tsx`: Placeholder for analytics
    - `/components/dashboard/sections/feedback.tsx`: Placeholder for feedback & insights
    - `/components/dashboard/sections/settings.tsx`: Placeholder for settings
  - **Modified**:
    - `/app/dashboard/page.tsx`: Updated to use DashboardLayout with section switching
- **Key Features**:
  - Collapsible sidebar (fixed on desktop, overlay on mobile)
  - Active section highlighting with purple-blue accent
  - Breadcrumb navigation in toolbar (DASHBOARD / SECTION NAME)
  - Status box in sidebar showing total sessions, minutes, avg score
  - Activity log with tactical-style timeline (border-l-2 border-primary)
  - Responsive design with mobile-first approach
  - User name displayed in toolbar (no avatar per user preference)
  - Sign-out button in toolbar
- **Preserved Elements**:
  - Meelni color tokens and design system
  - Framer Motion animations
  - Existing components (StatsCards, ScoreChart, CompetencyRadar, SessionList)
  - Typography scale (Public Sans for UI, Everett for display)
- **Consequences**:
  - Better navigation and organization for dashboard content
  - Placeholder sections enable iterative development
  - Modular architecture allows easy updates to individual sections
  - Sidebar state can be persisted to localStorage (future enhancement)
  - Keyboard shortcuts can be added for power users (future enhancement)
  - Activity log provides real-time feedback on user actions


### ADR-022: Main Interview Agent Deployed to LiveKit Cloud
- **Date**: 2025-11-06
- **Decision**: Deployed main interview agent to LiveKit Cloud (same infrastructure as demo agent)
- **Agent ID**: `CA_yawKG67rCMG4`
- **Deployment**: LiveKit Cloud (us-east region)
- **Version**: v20251106062030
- **Rationale**:
  - Simplified deployment: both demo and main agents on LiveKit Cloud
  - Auto-scaling handles variable load without managing infrastructure
  - Cost-effective for MVP stage (scales to zero when idle)
  - Easy rollback and version management via LiveKit CLI
  - No separate hosting provider needed (Railway/Render/Fly.io)
- **Configuration**:
  - Agent ID stored in `agent/livekit.toml`
  - Frontend dispatches via `AgentDispatchClient` in `/api/session/start`
  - Room name pattern: `interview-{sessionId}` (vs `demo-*` for demo agent)
- **Consequences**:
  - Both agents share LiveKit Cloud infrastructure
  - Agent dispatch is explicit via API (not automatic room joining)
  - Local development still available with `python agent.py dev`
  - Future migration to self-hosted possible if needed
  - Agent now has `agent_name="CA_yawKG67rCMG4"` for explicit dispatch consistency

<<<<<<< HEAD
### ADR-023: Enhanced Prompt System with Difficulty-Aware Coaching
- **Date**: 2025-11-07
- **Decision**: Implement difficulty-aware prompt system with three levels (junior, intermediate, senior) to personalize interview coaching
- **Rationale**:
  - **Improve agent naturalness**: Convert frameworks from evaluation checklists to actionable instructions
  - **Personalize difficulty**: Adapt coaching style based on candidate experience level (APM → Senior PM)
  - **API-ready architecture**: Foundation for multi-tenant API service with company-specific configurations
  - **Better framework teaching**: Show WHAT good looks like with concrete examples, not just describe it
- **Implementation**:
  - Created `prompts.py` with three-layer architecture:
    - Layer 1: Base system prompt (universal coach identity)
    - Layer 2: Framework-specific instructions (Product Sense, Analytical, Leadership, Strategy)
    - Layer 3: Difficulty modulation + Mode instructions
  - Created `prompt_builder.py` for dynamic prompt assembly from room metadata
  - Added `CompanyConfig` and `SessionConfig` dataclasses for future API multi-tenancy
  - Integrated with `agent.py` via `build_interview_prompt()`
- **Difficulty Levels**:
  - **Junior (APM, 0-2 years)**: Patient coaching, teaching mode, accepts surface-level analysis
  - **Intermediate (IC PM, 2-4 years)**: Balanced approach, solid framework adherence expected
  - **Senior (Senior PM, 5+ years)**: High bar, challenging follow-ups, strategic thinking required
- **Consequences**:
  - Backward compatible with existing room metadata (defaults to "intermediate")
  - +4-8% cost increase per session (more tokens, acceptable for quality gain)
  - Foundation for API service offering (companies can customize prompts)
  - Easier to maintain and test prompts (modular architecture)
  - Conversation naturalness improved (target 4.0+/5.0 vs current ~3.2/5.0)

### `/agent/prompts.py`
**Purpose**: Enhanced modular prompt system with difficulty-aware coaching
**Key Exports**:
- `get_prompt(config: SessionConfig) -> str` - Main prompt composition function
- `CompanyConfig` - Dataclass for company-specific configurations (API multi-tenancy)
- `SessionConfig` - Dataclass for runtime session parameters
- `InterviewType`, `InterviewMode`, `Difficulty` - Enums for type safety

**Three-Layer Architecture**:
1. **Layer 1 (Base)**: Universal coach identity, operating principles, natural conversation patterns
2. **Layer 2 (Domain)**: Framework-specific instructions (Product Sense, Analytical, Leadership, Strategy)
3. **Layer 3 (Runtime)**: Difficulty modulation + Mode-specific instructions

**Critical Design Patterns**:
```python
# Usage example
from prompts import SessionConfig, InterviewType, Difficulty, get_prompt

config = SessionConfig(
    interview_type=InterviewType.PRODUCT_SENSE,
    difficulty=Difficulty.SENIOR  # Personalizes coaching style
)
prompt = get_prompt(config)
```

**Key Features**:
- **Difficulty-aware**: Adapts coaching style (junior/intermediate/senior)
- **Framework-as-instructions**: Actionable directives, not evaluation checklists
- **Concrete examples**: Every abstract directive has 2-3 real examples
- **No markdown**: TTS-compatible (no asterisks, no formatting)
- **Professional tone**: Human-like conversation, not LLM-speak
- **Token-efficient**: <3000 tokens per prompt (typical: ~475 tokens)

**Backward Compatibility**: Defaults to "intermediate" if difficulty not specified

### `/agent/prompt_builder.py`
**Purpose**: Translation layer between LiveKit room metadata and prompt system
**Key Exports**:
- `build_interview_prompt(metadata: Dict) -> str` - Main entrypoint from agent.py
- `parse_room_metadata(metadata: Dict) -> SessionConfig` - Metadata parser

**Responsibilities**:
- Extract difficulty from room metadata (default: "intermediate")
- Map `round_type` → `InterviewType` enum
- Handle backward compatibility with existing metadata format
- Validate and sanitize inputs

**Integration Pattern**:
```python
# In agent.py
from prompt_builder import build_interview_prompt

instructions = build_interview_prompt(ctx.room.metadata)
session = AgentSession(..., instructions=instructions)
```

**Error Handling**: Gracefully defaults to safe values if metadata invalid

- **Status**: Implemented in Phase 1A (2025-11-07)
- **Testing**: 10 verification tests, 100% pass rate

### ADR-024: LiveKit Cloud Debugging Best Practices
- **Date**: 2025-11-08
- **Decision**: Established standard debugging workflow for LiveKit Cloud agents
- **Key Tools**:
  - `lk agent logs`: View runtime logs (agent execution, errors)
  - `lk agent logs --log-type=build`: Docker build output
  - `lk agent logs --log-type=deploy`: Deployment events
  - `lk agent status`: Agent health and version info
- **Common Failure Modes**:
  1. **ModuleNotFoundError**: Missing files in Dockerfile COPY commands
     - Symptom: Agent crashes on startup with "No module named 'utils'"
     - Fix: Add missing `COPY utils/ ./utils/` to Dockerfile
  2. **Agent not speaking**: Missing greeting instructions in prompts
     - Symptom: Agent joins room but never says anything
     - Fix: Add greeting instructions to BASE_INTERVIEWER_SYSTEM prompt
  3. **Invalid voice ID**: Use verified voice IDs from provider documentation
     - Symptom: TTS fails silently or agent doesn't speak
     - Fix: Use valid voice IDs (e.g., ElevenLabs `cgSgspJ2msm6clMCkdW9`)
  4. **Race conditions**: Always await session.start() before calling session.say()
     - Symptom: Agent greets but subsequent responses fail
     - Fix: Ensure `await session.start()` completes before any `session.say()` calls
- **Debugging Workflow**:
  1. Check agent status: `lk agent status` (is it running?)
  2. Check runtime logs: `lk agent logs` (Python errors, TTS failures)
  3. Check build logs: `lk agent logs --log-type=build` (if agent not starting)
  4. Search logs for room names: Filter by specific session to isolate issues
  5. Verify Dockerfile: Ensure all required files are copied (especially `utils/`)
  6. Verify prompts: Check that greeting instructions are present
  7. Verify voice IDs: Use valid IDs from provider docs (not example placeholders)
- **Consequences**:
  - Faster debugging (systematic approach)
  - Fewer deployment issues (checklist prevents common mistakes)
  - Better documentation (centralized troubleshooting guide)

### ADR-025: Agent State Debouncing for Smooth Transitions
- **Date**: 2025-11-08
- **Decision**: Implement debounced state transitions with grace periods to prevent UI flickering during natural speech pauses
- **Problem**: Agent state indicator was flickering between "speaking" and "listening" during brief pauses in agent speech (breath pauses, sentence breaks), creating confusing turn-taking signals
- **Solution**:
  - Add 600-700ms grace period before transitioning away from "speaking" state
  - Immediate updates when agent starts speaking (no delay)
  - Separate `debouncedAgentState` for UI display while internal state updates immediately
  - Smart timer management that clears pending transitions when new speech detected
- **Implementation**:
  - Demo modal: 600ms grace period (`components/demo-modal.tsx`)
  - Interview page: 700ms grace period (`app/interview/components/audio-visualizer.tsx`)
  - Uses React useRef for timer and timestamp tracking (no re-renders)
  - TypeScript-safe with proper type annotations
- **Code Pattern**:
  ```typescript
  // Track when agent was last speaking
  if (currentState === "speaking") {
    lastSpeakingTimeRef.current = Date.now();
    setDebouncedAgentState("speaking"); // Immediate
    clearTimeout(stateChangeTimerRef.current);
  }
  // Apply grace period when stopping
  else if (currentState !== "speaking" && debouncedAgentState === "speaking") {
    const timeSinceLastSpeaking = Date.now() - lastSpeakingTimeRef.current;
    if (timeSinceLastSpeaking < GRACE_PERIOD_MS) {
      stateChangeTimerRef.current = setTimeout(() => {
        setDebouncedAgentState(currentState);
      }, GRACE_PERIOD_MS - timeSinceLastSpeaking);
    }
  }
  ```
- **Consequences**:
  - Smoother UX with no flickering indicators
  - Zero delay on user interruptions (can still interrupt immediately)
  - Natural conversation flow maintained
  - Applies to both demo and main interview agents
- **Related Issues**: Fixes #105

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

### `/app/interview/components/audio-visualizer.tsx`
**Purpose**: Audio visualizer for main interview page with Orb component
**Key Features**:
- Real-time audio volume detection for user and agent
- Agent state management with 700ms debounce grace period
- Smooth state transitions without flickering during natural pauses
- User speaking detection with 500ms debounce
- Integrates with Orb component for visual feedback

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
- Set `agent_name="CA_Wp8bi3bRroE2"` for explicit dispatch
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
            agent_name="CA_Wp8bi3bRroE2",  # Required for explicit dispatch!
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
const DEMO_AGENT_ID = "CA_Wp8bi3bRroE2";

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
- State debouncing with 600ms grace period to prevent flickering during speech pauses
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

### `/app/providers/auth-provider.tsx` (NEWLY ADDED)
**Purpose**: React Context provider for authentication state management
**Key Responsibilities**:
- Manage user session state with Supabase Auth
- Provide `useAuth()` hook for accessing user, session, isLoading
- Implement `signInWithGoogle()` and `signOut()` methods
- Listen to auth state changes via Supabase subscription
- Handle initial session fetch on mount

**Critical Code Pattern**:
```typescript
export function AuthProvider({ children }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const signInWithGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  return <AuthContext.Provider value={{ user, session, isLoading, signInWithGoogle, signOut }}>
    {children}
  </AuthContext.Provider>;
}
```

### `/app/auth/signin/page.tsx` (NEWLY ADDED)
**Purpose**: Google OAuth sign-in page with polished UI
**Key Features**:
- Beautiful glass morphism design matching app aesthetic
- "Continue with Google" button with OAuth flow
- Auto-redirect if already authenticated
- Loading states and error handling
- Trust signals ("Free forever • No credit card")
- Back to home link

### `/app/auth/callback/route.ts` (NEWLY ADDED)
**Purpose**: OAuth callback handler for code exchange
**Input**: `code` query parameter from Google OAuth redirect
**Output**: Redirect to `/dashboard` or `/auth/signin?error=auth_failed`
**Key Responsibilities**:
- Exchange authorization code for Supabase session
- Handle errors gracefully
- Redirect to dashboard on success

### `/app/dashboard/page.tsx` (NEWLY ADDED)
**Purpose**: Dashboard landing page for authenticated users
**Key Features**:
- Personalized welcome message with user's first name
- "Start Mock Interview" CTA button → routes to `/setup`
- Sign out functionality
- Coming soon cards (Interview History, Performance Analytics)
- Auto-redirect to signin if not authenticated
- Loading state with spinner

### `/middleware.ts` (NEWLY ADDED)
**Purpose**: Next.js middleware for route protection
**Protected Routes**: `/dashboard`, `/setup`, `/interview`
**Key Responsibilities**:
- Check Supabase session for authentication
- Redirect unauthenticated users to `/auth/signin`
- Preserve redirect URL in query parameter
- Allow public routes to pass through

**Critical Code Pattern**:
```typescript
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const protectedRoutes = ["/dashboard", "/setup", "/interview"];

  if (protectedRoutes.some(route => pathname.startsWith(route))) {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      const redirectUrl = new URL("/auth/signin", request.url);
      redirectUrl.searchParams.set("redirectTo", pathname);
      return NextResponse.redirect(redirectUrl);
    }
  }

  return NextResponse.next();
}
```

### `/components/dashboard/layout/sidebar.tsx` (NEWLY ADDED)
**Purpose**: Collapsible sidebar navigation for dashboard
**Key Features**:
- 5 navigation sections (Overview, History, Analytics, Feedback, Settings)
- Active section highlighting with purple-blue accent
- Status box showing session stats (total sessions, minutes, avg score)
- Meelni branding with logo
- Collapse toggle button
- Responsive: fixed on desktop, overlay on mobile
- Lucide React icons for each section

**Critical Code Pattern**:
```typescript
const navigationItems = [
  { id: "overview", icon: Monitor, label: "Overview" },
  { id: "history", icon: History, label: "Interview History" },
  { id: "analytics", icon: BarChart3, label: "Analytics" },
  { id: "feedback", icon: Lightbulb, label: "Feedback & Insights" },
  { id: "settings", icon: Settings, label: "Settings" },
];

// Active styling: bg-primary/10 text-primary border-l-2 border-primary
```

### `/components/dashboard/layout/toolbar.tsx` (NEWLY ADDED)
**Purpose**: Top toolbar with breadcrumb navigation and user actions
**Key Features**:
- Breadcrumb format: "DASHBOARD / SECTION NAME"
- User name from Google profile (no avatar per user preference)
- Last update timestamp
- Notification bell icon (placeholder)
- Refresh button (placeholder)
- Sign-out button with logout functionality
- Uses `useAuth()` hook for user context

**Critical Code Pattern**:
```typescript
const { user, signOut } = useAuth();
const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "User";

// Breadcrumb: DASHBOARD / {activeSection.toUpperCase()}
```

### `/components/dashboard/layout/dashboard-layout.tsx` (NEWLY ADDED)
**Purpose**: Main layout wrapper combining sidebar and toolbar
**Key Responsibilities**:
- Manage sidebar collapse state
- Render mobile overlay with backdrop blur when sidebar open
- Coordinate between Sidebar and Toolbar components
- Pass through session stats to Sidebar status box
- Responsive layout with proper spacing

**Critical Code Pattern**:
```typescript
export function DashboardLayout({
  children,
  activeSection,
  setActiveSection,
  totalSessions,
  totalMinutes,
  avgScore,
}: DashboardLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="min-h-screen bg-background flex">
      <Sidebar {...props} />
      {!sidebarCollapsed && <MobileOverlay />}
      <main className="flex-1 flex flex-col">
        <Toolbar activeSection={activeSection} />
        {children}
      </main>
    </div>
  );
}
```

### `/components/dashboard/sections/overview.tsx` (NEWLY ADDED)
**Purpose**: Main overview section with stats, charts, and activity log
**Key Features**:
- Migrated from old dashboard page
- StatsCards component for quick metrics
- ScoreChart component for performance over time
- CompetencyRadar for skill breakdown
- Activity log with tactical-style timeline (border-l-2 border-primary)
- Interview type breakdown pie chart
- Responsive grid layout

**Critical Code Pattern**:
```typescript
export function OverviewSection({
  sessions,
  loadingSessions,
  totalSessions,
  avgScore,
  totalMinutes,
  completionRate,
}: OverviewSectionProps) {
  // Reuses existing components: StatsCards, ScoreChart, CompetencyRadar
  // Adds tactical-style activity log with timeline markers
}
```

### `/components/dashboard/sections/history.tsx` (NEWLY ADDED)
**Purpose**: Full interview history section with tactical styling
**Key Features**:
- Reuses existing SessionList component
- Tactical-inspired header with description
- "Coming Soon" placeholder for filters (planned)

### `/components/dashboard/sections/analytics.tsx` (NEWLY ADDED)
**Purpose**: Analytics placeholder section
**Key Features**:
- "Coming Soon" card with chart icon
- Description: "Advanced analytics and performance insights are currently in development"

### `/components/dashboard/sections/feedback.tsx` (NEWLY ADDED)
**Purpose**: Feedback & insights placeholder section
**Key Features**:
- "Coming Soon" card with lightbulb icon
- Description: "AI-powered feedback and coaching insights are currently in development"

### `/components/dashboard/sections/settings.tsx` (NEWLY ADDED)
**Purpose**: Settings placeholder section
**Key Features**:
- "Coming Soon" card with gear icon
- Description: "User settings and preferences are currently in development"

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

# Output will include agent ID (e.g., CA_Wp8bi3bRroE2)
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
            agent_name="CA_Wp8bi3bRroE2",  # Use your agent ID from Step 3
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
const DEMO_AGENT_ID = "CA_Wp8bi3bRroE2"; // Your agent ID from Step 3
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
# - ModuleNotFoundError: Missing files in Dockerfile COPY commands
# - Invalid voice IDs for TTS provider
```

**Issue: Agent joins but doesn't speak**
```bash
# Check runtime logs for TTS errors
lk agent logs

# Common causes:
# 1. Invalid voice ID - verify voice ID is valid for chosen TTS provider
#    - ElevenLabs: Use valid ID like cgSgspJ2msm6clMCkdW9 (not s3TPKV1kjDlVtZbl4Ksh)
#    - Check provider documentation for valid voice IDs
# 2. Missing greeting instructions in prompt
# 3. Race condition: session.say() called before session.start() completes
# 4. TTS model misconfiguration

# Verify voice ID in agent code:
grep -A5 "tts=" agent.py
```

**Issue: ModuleNotFoundError in Cloud deployment**
```bash
# Check build logs
lk agent logs --log-type=build

# Verify Dockerfile includes all required directories
cat Dockerfile.main | grep COPY

# Common fix: Add missing COPY commands
# Example: COPY utils/ ./utils/
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
  - Dispatches Cloud agent (CA_Wp8bi3bRroE2) using AgentDispatchClient
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


---

## Authentication Flow

### Google OAuth Flow
```
User clicks "Start A Mock" → /dashboard (middleware check)
  ↓ (not authenticated)
/auth/signin → Google OAuth consent screen
  ↓
/auth/callback (code exchange)
  ↓
/dashboard (authenticated session)
```

**Key Files**:
- `middleware.ts`: Route protection (checks Supabase session on `/dashboard`, `/setup`, `/interview`)
- `app/providers/auth-provider.tsx`: Session management (React Context, `useAuth()` hook)
- `app/auth/signin/page.tsx`: OAuth UI with Google sign-in button
- `app/auth/callback/route.ts`: OAuth callback handler (exchanges code for session)

**Session Management**:
- Supabase Auth handles OAuth tokens and refresh
- Session stored in HTTP-only cookies (secure)
- Middleware runs on edge runtime (fast auth checks)
- `useAuth()` hook provides: `user`, `session`, `isLoading`, `signInWithGoogle()`, `signOut()`

**Security Notes**:
- Middleware protects `/dashboard`, `/setup`, `/interview` routes
- Unauthenticated users redirected to `/auth/signin` with redirect URL preserved
- RLS policies not yet implemented (TODO Phase 1)
- Demo modal remains auth-free (no friction for trying the product)

**User Flow**:
1. Landing page: "Start A Mock" button → `/dashboard`
2. Middleware detects no session → `/auth/signin?redirectTo=/dashboard`
3. User clicks "Continue with Google" → Google OAuth consent
4. Google redirects to `/auth/callback?code=...`
5. Callback exchanges code for Supabase session (cookies set)
6. Redirect to original destination (`/dashboard`)
7. Dashboard shows personalized welcome with user's first name

**Related ADRs**: See ADR-020 (Google OAuth Authentication Implementation)

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

# TTS Providers (Cartesia/ElevenLabs) - NOT REQUIRED when using LiveKit Inference
# CARTESIA_API_KEY=your_cartesia_key  # Only needed for direct API access or custom voices
# ELEVENLABS_API_KEY=your_elevenlabs_key  # Only needed for direct API access or voice cloning
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

### Resolved Issues (Phase 0, 0.5, 0.7, 1.0)
- ✅ SSL Certificate Error: Python 3.12 on macOS needed certificate installation
- ✅ LiveKit Components Styles: Removed unused import
- ✅ VoiceAssistant API: Switched to AgentSession pattern
- ✅ ChatContext API: Simplified to string-based model config
- ✅ Silero VAD Plugin: Installed missing package
- ✅ GPT-4 Model Name: Changed to `openai/gpt-4o-mini` (later upgraded to `gpt-4.1-mini`)
- ✅ Agent Auto-Reload: Restart needed for prewarm function changes
- ✅ Typography Scale: Fixed overly large fonts (display-scale → application-scale)
- ✅ ElevenLabs Voice ID: Invalid voice ID caused TTS failures; fixed with valid default voice
- ✅ Interview Page Loading: Resolved by agent restart after configuration changes
- ✅ Cartesia API Key Confusion: Clarified that Cartesia doesn't need separate key with LiveKit Inference
- ✅ Multiple Agents Competing: Self-hosted agents competing for dispatches; resolved with explicit dispatch
- ✅ Cloud Agent Not Joining: Missing `agent_name` in WorkerOptions; required for explicit dispatch
- ✅ Demo Modal Muted Button: Text logic was inverted; fixed to show correct state
- ✅ ElevenLabs Voice ID Error: Invalid voice ID `s3TPKV1kjDlVtZbl4Ksh` caused TTS failures; fixed with valid default voice `cgSgspJ2msm6clMCkdW9`
- ✅ Missing utils Directory: Dockerfile.main missing `COPY utils/` caused ModuleNotFoundError crashes on Cloud deployment
- ✅ Agent Silent Issue: Missing greeting instructions in BASE_INTERVIEWER_SYSTEM prompt; agent joined but never spoke
- ✅ Session.say() Race Condition: Calling session.say() before session.start() completes breaks TTS pipeline; must await session.start() first
- ✅ Agent State Flickering: Fixed with debounced state transitions (600-700ms grace period)

### Current Technical Debt
- ✅ ~~No session persistence~~ → **DONE** - Transcripts save in real-time during interviews
- ✅ ~~No authentication~~ → **DONE** - Google OAuth fully integrated
- ✅ ~~No feedback/scoring engine~~ → **DONE** - GPT-4 Turbo evaluation implemented
- ✅ ~~No error handling in APIs~~ → **DONE** - All APIs have proper validation and error responses
- ✅ ~~No RLS policies~~ → **DONE** - 12 policies enforcing user data isolation

**Remaining Minor Items**:
- Consider adding email/password auth alongside Google OAuth (optional)
- Add feedback UI in dashboard to display evaluation results
- Consider implementing real-time nudges during interviews (optional)

---

## Future Considerations

### Phase 1 (Complete) ✅
- ✅ Session persistence: Real-time transcript saving
- ✅ Feedback/scoring engine: GPT-4 Turbo evaluation with rubrics
- ✅ User authentication: Google OAuth with Supabase Auth
- ✅ Dashboard: Tactical UI with session history
- ✅ Question bank: 2,879 questions with recency filtering
- ✅ RLS policies: Database-level security

### Phase 2 (Production Polish)
- Feedback display UI in dashboard
- Interview history with detailed scores
- Performance analytics visualization
- Email notifications for completed evaluations
- Error tracking and monitoring (Sentry)
- Production deployment to Vercel + Supabase

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
- Cartesia is fully integrated with LiveKit Cloud
- **ElevenLabs Integration**: ElevenLabs also does NOT require separate API key with LiveKit Inference
- Both Cartesia and ElevenLabs work with only LIVEKIT_API_KEY/SECRET for TTS through LiveKit Inference
- Found comprehensive Cartesia voice library (150+ voices) via SignalWire documentation
- Tessa identified as emotive voice optimized for Sonic 3 with wide emotional range

**Configuration Updates**
- Updated `OPTIMAL_DEFAULTS` in `/app/setup/page.tsx` with Tessa voice ID and new models
- Updated default config in `/agent/agent.py` with Tessa voice ID and new models
- Updated TTS format to: `cartesia/sonic-3:6ccbfb76-1fc6-48f7-b71d-91ac6298247b`
- Updated STT format to: `deepgram/nova-3`
- Updated LLM format to: `openai/gpt-4.1-mini`

**Testing & Debugging**
- Initially tested with invalid ElevenLabs voice ID
- Fixed voice ID to use valid ElevenLabs default voices (Rachel: 21m00Tcm4TlvDq8ikWAM)
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
- Agent ID: `CA_Wp8bi3bRroE2` (saved in `livekit.toml`)
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

### 2025-11-06 - Phase 0.8: Google OAuth Authentication Complete ✅

**Authentication Setup**
- Configured Google OAuth in Google Cloud Console
- Added OAuth credentials to Supabase Dashboard
- Enabled Google provider in Supabase Auth

**Code Implementation**
- Created `app/providers/auth-provider.tsx` with React Context for session management
- Implemented `useAuth()` hook for accessing user, session, isLoading, signInWithGoogle, signOut
- Built `app/auth/signin/page.tsx` with beautiful glass morphism UI and Google OAuth button
- Created `app/auth/callback/route.ts` to exchange OAuth code for session
- Implemented `middleware.ts` to protect `/dashboard`, `/setup`, `/interview` routes
- Built `app/dashboard/page.tsx` with personalized welcome and "Start Mock Interview" CTA

**User Experience**
- "Start A Mock" button now primary CTA on landing page (routes to /dashboard with auth)
- "Talk to Meelni" button secondary CTA (opens demo modal, no auth)
- Removed "Customize Your Mock" button per user request
- Seamless OAuth flow: landing → signin → Google consent → dashboard
- Personalized greeting with user's first name from Google profile
- Sign out functionality from dashboard
- Auto-redirect if already authenticated
- Preserves redirect URL for post-login navigation

**Bug Fixes**
- Temporarily disabled Blog section due to fs module import issue in client component
- Fixed hero button layout and routing

**Key Learnings**
- Supabase Auth SSR with @supabase/ssr works seamlessly in Next.js 14

### 2025-11-07 - Phase 1A: Enhanced Prompt System with Difficulty-Aware Coaching Complete ✅

**Implementation**
- Implemented three-layer modular prompt architecture (Base + Domain + Runtime)
- Added difficulty-aware coaching (junior/intermediate/senior levels)
- Created `prompts.py` with comprehensive framework instructions
- Created `prompt_builder.py` for dynamic prompt assembly
- Integrated with `agent.py` via `build_interview_prompt()`

**Key Features**
- **Difficulty Levels**: APM (junior), IC PM (intermediate), Senior PM (senior)
- **Framework-as-Instructions**: Converted evaluation checklists to actionable directives
- **Concrete Examples**: Every abstract directive has 2-3 real examples showing WHAT good looks like
- **Professional Conversational Tone**: Removed LLM-speak, added natural PM language patterns
- **API-Ready**: `CompanyConfig` and `SessionConfig` dataclasses for future multi-tenancy

**Testing & Validation**
- Created comprehensive test suite (10 tests, 100% pass rate)
- Verified all 4 interview types (Product Sense, Analytical, Leadership, Strategy)
- Tested all difficulty levels and mode variations
- Backward compatibility validated with existing metadata format

**Architecture Decisions**
- ADR-023 documented: Enhanced Prompt System with Difficulty-Aware Coaching
- Three-layer composition (universal → domain → runtime)
- Token-efficient design (~475 tokens typical, <3000 limit)
- No markdown in prompts (TTS compatibility)

**Consequences**
- Backward compatible (zero breaking changes)
- +4-8% cost increase acceptable for quality improvement
- Foundation for API service offering
- Improved conversation naturalness (target 4.0+/5.0)

**Deliverables**
- ✅ Enhanced `prompts.py` with difficulty support
- ✅ New `prompt_builder.py` module
- ✅ Updated `agent.py` integration
- ✅ Comprehensive test suite (`test_prompts.py`)
- ✅ Documentation updated (ADR-023, file boundaries)
- ✅ Implementation guides and verification scripts

**Next Steps**
- Phase 1B: Add mode selection UI in setup page
- Phase 1C: Implement role reversal (user as interviewer)
- Phase 2: Multi-tenant API service with company-specific configs

- Middleware provides clean route protection pattern
- OAuth redirect flow requires careful URL management
- React Context perfect for auth state management
- Google Cloud Console setup straightforward for OAuth 2.0

**Deliverables**
- ✅ Full Google OAuth authentication working
- ✅ Protected routes with middleware
- ✅ Dashboard with personalized welcome
- ✅ Sign in/sign out flows complete
- ✅ Updated landing page CTAs
- ✅ Committed and pushed to branch `saviii/petra`

### 2025-11-06 - Phase 0.9: Tactical Dashboard UI Migration Complete ✅

**UI Migration**
- Adopted tactical-command-interface example UI layout for dashboard
- Created modular component structure with sidebar + toolbar + sections
- Migrated dashboard from single-page to section-based navigation
- Preserved Meelni branding, colors, and typography

**Color Migration**
- Tactical Orange (`#f97316`) → Meelni Purple-Blue (`oklch(0.70 0.22 285)`)
- Tactical Dark Neutrals (`bg-neutral-900/950`) → Meelni Card (`bg-card`)
- Tactical Borders (`border-neutral-800`) → Meelni Borders (`border-border`)
- Tactical Accents (`bg-orange-500/10`) → Meelni Accents (`bg-primary/10`)

**Text Changes**
- "TACTICAL COMMAND INTERFACE" → "MEELNI DASHBOARD"
- "Mission Control" → "Overview"
- "Operations History" → "Interview History"
- "Intel & Analysis" → "Analytics"
- "Strategic Planning" → "Settings"
- "Alert Status" → "Session Stats"

**New Components Created**
- `/components/dashboard/layout/sidebar.tsx`: Collapsible sidebar with 5 navigation sections
- `/components/dashboard/layout/toolbar.tsx`: Top toolbar with breadcrumb and user actions
- `/components/dashboard/layout/dashboard-layout.tsx`: Main layout wrapper
- `/components/dashboard/sections/overview.tsx`: Main overview with stats, charts, activity log
- `/components/dashboard/sections/history.tsx`: Full interview history
- `/components/dashboard/sections/analytics.tsx`: Placeholder for analytics
- `/components/dashboard/sections/feedback.tsx`: Placeholder for feedback & insights
- `/components/dashboard/sections/settings.tsx`: Placeholder for settings

**Modified Files**
- `/app/dashboard/page.tsx`: Updated to use DashboardLayout with section switching

**Build Fixes**
- Fixed `createServerClient` → `createClient` in transcript route
- Fixed `useRef<number>()` → `useRef<number | undefined>(undefined)`
- Fixed `useTrackVolume` type errors with `as any` casts
- Fixed `BarVisualizer` state type with `as any`
- Fixed `setMuted` property error with type guard
- Fixed easing array types with `as const`
- Fixed `ThemeProviderProps` import with `type` import
- Fixed Zod `error.errors` → `error.issues`

**Key Features**
- Collapsible sidebar (fixed on desktop, overlay on mobile)
- Active section highlighting with purple-blue accent
- Breadcrumb navigation (DASHBOARD / SECTION NAME)
- Status box in sidebar showing session stats
- Activity log with tactical-style timeline
- Responsive design with mobile-first approach
- User name displayed in toolbar (no avatar per user preference)
- Sign-out functionality in toolbar

**Preserved Elements**
- Meelni color tokens and design system
- Framer Motion animations
- Existing components (StatsCards, ScoreChart, CompetencyRadar, SessionList)
- Typography scale (Public Sans for UI, Everett for display)

**Key Learnings**
- Tactical UI structure (sidebar + toolbar + grid) provides excellent organization
- Minimal text changes preserve user context while adapting branding
- Modular section architecture enables iterative development
- Placeholder sections with "Coming Soon" cards maintain consistent UX
- Activity log with timeline markers enhances user engagement

**Deliverables**
- ✅ Tactical dashboard layout with sidebar navigation
- ✅ 5 modular sections (Overview complete, 4 placeholders)
- ✅ Responsive design with mobile overlay
- ✅ Breadcrumb navigation and user actions
- ✅ Activity log with tactical styling
- ✅ All TypeScript build errors fixed
- ✅ Dev server running successfully on port 3000
- ✅ Working on branch `saviii/tactical-ui-migration`

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

