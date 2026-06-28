# CLAUDE.md: Codebase Living Operational Document

> Canonical agent instructions now live in `../AGENTS.md`. Read that first for current repository workflow, architecture direction, skills, and migration rules. This file remains useful for historical product, architecture, and operational context.

**Project**: Meelni - Real-Time AI Mock Interviews
**Last Updated**: 2025-11-18
**Version**: 2.1.0 - Sprint Documentation Pattern Established

---

## Document Purpose

This is a **quick reference guide** for developers and AI agents. It provides:
- Code style and conventions
- File boundaries and responsibilities
- Development commands and workflows
- Links to detailed documentation

**Not Included Here**: Detailed technical docs, ADRs, API specs, and deployment guides are in `docs/` and other `.claude/` files. See the Documentation Map below.

---

## Documentation Map

**Finding Information Fast**:

### Core Documentation (`.claude/`)
- **Current System State** → `.claude/CLAUDE.md` (this file)
- **Product Requirements** → `.claude/PRD.md`
- **LiveKit Patterns** → `.claude/LIVEKIT.md`
- **Database Schema** → `.claude/DATABASE.md`
- **Troubleshooting** → `.claude/TROUBLESHOOTING.md`
- **Contributing** → `.claude/CONTRIBUTING.md`
- **Deployment** → `.claude/DEPLOYMENT.md` (high-level overview)
- **Sprint Documentation** → `.claude/sprints/README.md` (active feature work tracking)
- **Ralph (Autonomous Agent)** → `.claude/RALPH.md` (automated development loop)

### Sprint Documentation (`.claude/sprints/`)
- **Active Sprints** → `.claude/sprints/` (current feature development)
- **Archived Sprints** → `.claude/archive/sprints/` (completed features)
- **Sprint Template** → `docs/templates/SPRINT_TEMPLATE/` (template for new sprints)
- **Quick Start Guide** → `docs/templates/SPRINT_TEMPLATE/QUICK_START_FOR_AGENTS.md`

### Technical Documentation (`docs/`)
- **Documentation Hub** → `docs/README.md` (start here for all documentation)
- **Architecture Decisions** → `docs/architecture/adrs/` (26+ ADRs extracted from CLAUDE.md)
- **API Specifications** → `docs/api/`
- **Development Guides** → `docs/development/`
- **Deployment Guides** → `docs/deployment/` (detailed deployment instructions)
- **Security Documentation** → `docs/security/` (RLS policies, password protection, security audits)
- **Feature Deep Dives** → `docs/features/`
- **Integration Guides** → `docs/integrations/`
- **Documentation Templates** → `docs/templates/`

### Quick Links by Task
- **Setting up dev environment** → `docs/development/setup.md`
- **Deploying to production** → `docs/deployment/quickstart.md`
- **Security setup (RLS + passwords)** → `docs/security/QUICK_START_SECURITY_FIX.md` (5 minutes)
- **Understanding architecture decisions** → `docs/architecture/adrs/README.md`
- **Integrating LiveKit** → `docs/integrations/livekit.md`
- **Debugging LiveKit agents** → `docs/LIVEKIT_DEBUGGING.md`
- **PostHog analytics troubleshooting** → `.claude/archive/sprints/posthog-analytics-2025-11/POSTHOG_TESTING_GUIDE.md`
- **Starting a new feature/sprint** → `.claude/sprints/README.md` (USE THIS!)
- **Autonomous development (Ralph)** → `.claude/RALPH.md` + `scripts/ralph/`
- **Adding new features** → `docs/templates/FEATURE_TEMPLATE.md`
- **Creating ADRs** → `docs/templates/ADR_TEMPLATE.md`
- **API reference** → `docs/api/README.md`
- **Testing guidelines** → `docs/development/testing.md`

### Historical Context
- **Implementation logs** → `archive/2025-11/` (completed feature summaries)
- **Obsolete documentation** → `.conductor/archive/documentation/` (archived)

**For Agents**: Start with CLAUDE.md. For detailed technical information, see `docs/README.md` for the documentation index. ADRs are now in `docs/architecture/adrs/` (no longer embedded in this file). Historical implementation logs are in `archive/` but should only be referenced if explicitly asked.

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
- **TTS**: ElevenLabs Eleven Turbo v2.5 (via LiveKit Inference) - natural, professional voice
- **Dialogue LLM**: GPT-4.1-mini (via LiveKit Inference) - upgraded from GPT-4.1-mini
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

All architecture decision records (ADRs) have been extracted to individual files for easier reference and linking.

**ADR Index**: See [`docs/architecture/adrs/README.md`](../docs/architecture/adrs/README.md) for the complete, categorized list of all ADRs.

### Quick Reference: Key ADRs

#### Core Infrastructure
- [ADR-003: Tech Stack Finalization](../docs/architecture/adrs/ADR-003-tech-stack-finalization.md) - Next.js, Supabase, Drizzle, LiveKit
- [ADR-006: Database Schema Deployed](../docs/architecture/adrs/ADR-006-database-schema-deployed.md) - Supabase schema
- [ADR-007: LiveKit Voice Interview Integration](../docs/architecture/adrs/ADR-007-livekit-voice-interview.md) - Real-time voice pipeline

#### Authentication
- [ADR-020: Google OAuth Authentication](../docs/architecture/adrs/ADR-020-google-oauth-authentication.md) - OAuth implementation
- [ADR-021: Tactical Dashboard UI Migration](../docs/architecture/adrs/ADR-021-tactical-dashboard-ui.md) - Dashboard redesign
- [ADR-026: Email/Password Authentication](../docs/architecture/adrs/ADR-026-email-password-authentication.md) - Traditional auth

#### Agent System
- [ADR-018: Demo Modal with LiveKit Cloud Agent](../docs/architecture/adrs/ADR-018-demo-modal-livekit-cloud.md) - Demo agent strategy
- [ADR-019: Explicit Agent Dispatch Pattern](../docs/architecture/adrs/ADR-019-explicit-agent-dispatch.md) - Agent control mechanism
- [ADR-022: Main Interview Agent Deployed to Cloud](../docs/architecture/adrs/ADR-022-main-interview-agent-cloud.md) - Production agent
- [ADR-023: Enhanced Prompt System](../docs/architecture/adrs/ADR-023-enhanced-prompt-system.md) - Difficulty-aware coaching

#### Voice & UI
- [ADR-015: Model Upgrade](../docs/architecture/adrs/ADR-015-model-upgrade.md) - Deepgram Nova-3, GPT-4.1-mini, Cartesia Sonic 3
- [ADR-016: Cartesia Voice Library](../docs/architecture/adrs/ADR-016-cartesia-voice-tessa.md) - Tessa voice selection
- [ADR-025: Agent State Debouncing](../docs/architecture/adrs/ADR-025-agent-state-debouncing.md) - UI flickering fix

**Total ADRs**: 26 (ADR-001 through ADR-026, plus ADR-036)

**Creating New ADRs**: See [`docs/templates/ADR_TEMPLATE.md`](../docs/templates/ADR_TEMPLATE.md) for the standard template.

---
---

## File Boundaries & Responsibilities

### `/agent/interview/agent.py`
**Purpose**: Main interview agent - conducts full voice interviews
**Key Responsibilities**:
- Define `InterviewAgent` class with PM interviewer instructions
- Prewarm Silero VAD model for voice activity detection
- Entrypoint function: connect to LiveKit room, start AgentSession
- Orchestrate ASR → LLM → TTS pipeline
- Support 4 interview types with dynamic prompts
- Real-time transcript saving to Supabase

**Critical Code Pattern**:
```python
# Current configuration (as of 2025-11-18)
stt_model = config.get("stt_model", "deepgram/nova-3")
llm_model = config.get("llm_model", "openai/gpt-4.1-mini")
tts_model = config.get("tts_model", "elevenlabs/eleven_turbo_v2_5:cgSgspJ2msm6clMCkdW9")

# Build dynamic prompt based on round type and config
instructions = build_agent_prompt(round_type, config, question)

session = AgentSession(
    turn_detection=EnglishModel(),
    stt=stt_model,
    llm=llm_model,
    tts=tts_model,
    vad=ctx.proc.userdata["vad"],  # Silero VAD
)
await session.start(agent=InterviewAgent(instructions=instructions), room=ctx.room)
```

**Note**: See `agent/interview/README.md` for detailed documentation.

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

### `/agent/demo/agent.py`
**Purpose**: Demo agent for landing page 5-minute demos
**Key Responsibilities**:
- Define `DemoAgent` class with 5-minute demo prompt and time tracking
- Configure for LiveKit Cloud deployment
- Set `agent_name="CA_Wp8bi3bRroE2"` for explicit dispatch
- Monitor session duration and auto-terminate at 5 minutes
- Uses GPT-4o (faster for demos) and ElevenLabs voice

**Critical Configuration**:
```python
def build_demo_instructions(question: dict = None) -> str:
    """Build demo instructions with optional question from question bank"""
    # Spontaneous, energetic demo prompt
    # Asks 1 question (from bank or fallback)
    # Provides quick feedback (2-3 points)
    # Natural CTA to full interview

class DemoAgent(Agent):
    """Demo agent with time tracking"""
    def __init__(self, instructions: str) -> None:
        super().__init__(instructions=instructions)
        self.start_time = None
        self.warning_sent = False  # 4:45 warning
        self.ending_sent = False   # 5:00 end

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
- Deploy from `agent/demo/` directory
- Run `./deploy.sh` which builds from parent context
- Agent ID: `CA_Wp8bi3bRroE2`

**Note**: See `agent/demo/README.md` for detailed documentation.

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

# Development - Demo Agent
cd demo
python agent.py dev      # Start demo agent in dev mode

# Development - Interview Agent
cd interview
python agent.py dev      # Start interview agent in dev mode

# Production Deployment
cd demo && ./deploy.sh       # Deploy demo agent to LiveKit Cloud
cd interview && ./deploy.sh  # Deploy interview agent to LiveKit Cloud
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

### Authentication Methods

Meelni supports two authentication methods:
1. **Email/Password** - Traditional authentication with email verification
2. **Google OAuth** - Quick sign-in with Google account

### Email/Password Flow
```
User clicks "Sign Up" → /auth/signup
  ↓
Enter email + password → Supabase sends verification email
  ↓
User clicks verification link → Account activated
  ↓
/auth/signin → Enter credentials
  ↓
/dashboard (authenticated session)
```

**Password Reset Flow**:
```
/auth/signin → Click "Forgot password?"
  ↓
/auth/forgot-password → Enter email
  ↓
Supabase sends reset link
  ↓
User clicks reset link → /auth/reset-password
  ↓
Enter new password → Account password updated
  ↓
/auth/signin (auto-redirect after 2s)
```

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
- `app/auth/signin/page.tsx`: Sign-in UI with email/password and Google OAuth
- `app/auth/signup/page.tsx`: Sign-up page for new users with email/password
- `app/auth/forgot-password/page.tsx`: Password reset request page
- `app/auth/reset-password/page.tsx`: New password entry page (after clicking reset link)
- `app/auth/callback/route.ts`: OAuth callback handler (exchanges code for session)

**Session Management**:
- Supabase Auth handles OAuth tokens, email verification, and session refresh
- Session stored in HTTP-only cookies (secure)
- Middleware runs on edge runtime (fast auth checks)
- `useAuth()` hook provides:
  - `user`, `session`, `isLoading`
  - `signInWithGoogle()`, `signInWithEmail(email, password)`
  - `signUpWithEmail(email, password)`, `resetPassword(email)`
  - `signOut()`

**Security Notes**:
- Middleware protects `/dashboard`, `/setup`, `/interview` routes
- Unauthenticated users redirected to `/auth/signin` with redirect URL preserved
- Email verification required for email/password sign-ups
- Password strength enforced (minimum 8 characters)
- RLS policies implemented (12 policies enforcing user data isolation) ✅
- Demo modal remains auth-free (no friction for trying the product)

**User Flow (Email/Password)**:
1. New user: "Sign up" → `/auth/signup`
2. Enter email + password → Supabase sends verification email
3. Click verification link → Account activated
4. `/auth/signin` → Enter credentials → `/dashboard`
5. Forgot password? → `/auth/forgot-password` → Reset link sent → `/auth/reset-password`

**User Flow (Google OAuth)**:
1. Landing page: "Start A Mock" button → `/dashboard`
2. Middleware detects no session → `/auth/signin?redirectTo=/dashboard`
3. User clicks "Continue with Google" → Google OAuth consent
4. Google redirects to `/auth/callback?code=...`
5. Callback exchanges code for Supabase session (cookies set)
6. Redirect to original destination (`/dashboard`)
7. Dashboard shows personalized welcome with user's first name

**Related ADRs**:
- See ADR-020 (Google OAuth Authentication Implementation)
- See ADR-026 (Email/Password Authentication Implementation)

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

### Sprint Documentation (NEW - REQUIRED FOR ALL FEATURES)

**When implementing new features, ALWAYS follow the sprint documentation pattern.**

#### Starting a New Sprint

**CRITICAL: Always check if sprint already exists first!**

**Use the slash command** (recommended - handles duplicates automatically):
```
/new-sprint [feature-name]
```

The command will:
- Check if sprint already exists (active or archived)
- If exists: Alert you and ask what to do (resume or create new)
- If doesn't exist: Create sprint folder at `.claude/sprints/[feature-name-YYYY-MM]/`
- Copy all template files (README, PLAN, PROGRESS, DECISIONS, TESTING, COMPLETION)
- Pre-fill dates and sprint name
- Add entry to sprint index

**Or manually** (must check for duplicates yourself):
```bash
# 1. Check for existing sprints FIRST
ls -la .claude/sprints/
find .claude/archive/sprints/ -type d -name "*[feature-name]*"

# 2. Only if sprint does NOT exist, create it
mkdir -p .claude/sprints/[feature-name-YYYY-MM]
cp -r docs/templates/SPRINT_TEMPLATE/* .claude/sprints/[feature-name-YYYY-MM]/
```

**Never create duplicate sprints.** If a sprint exists, resume work or ask user before creating a new one.

#### Daily Documentation Requirements

**EVERY DAY** you work on a feature:
1. Update `PROGRESS.md` with daily entry (what done, what next, blockers)
2. Check off completed tasks in README checklist
3. Log decisions in `DECISIONS.md` when making important choices

#### Sprint Folder Contents

- `README.md` - Sprint overview, goals, timeline, progress checklist
- `PLAN.md` - Technical approach, architecture, API endpoints, DB changes
- `PROGRESS.md` - Daily log (REQUIRED - update every day)
- `DECISIONS.md` - Key decisions and trade-offs (as needed)
- `TESTING.md` - Test scenarios, results, bug log
- `COMPLETION.md` - Final summary (created on sprint completion)

#### On Sprint Completion

1. **Fill in COMPLETION.md** with summary, lessons learned, metrics
2. **Create permanent docs**:
   - ADRs for key decisions → `docs/architecture/adrs/`
   - API docs → `docs/api/`
   - Feature guides → `docs/features/`
3. **Archive sprint**:
   ```bash
   mv .claude/sprints/[name] .claude/archive/sprints/[name]
   ```

#### Where Documentation Goes

**Sprint folder** (temporary, during development):
- Daily progress logs
- Work-in-progress decisions
- Test results during development
- Planning notes

**docs/ folder** (permanent, forever):
- Architecture Decision Records (ADRs)
- API documentation
- Feature guides
- Integration setup guides
- Deployment procedures

**RULE**: Never create permanent documentation in sprint folders. Sprint folders are for active work tracking only. Permanent docs go in `docs/`.

**See**: `.claude/sprints/README.md` for full guidelines and `docs/templates/SPRINT_TEMPLATE/QUICK_START_FOR_AGENTS.md` for detailed workflow.

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
- ✅ ~~No authentication~~ → **DONE** - Google OAuth + Email/Password fully integrated
- ✅ ~~No feedback/scoring engine~~ → **DONE** - GPT-4 Turbo evaluation implemented
- ✅ ~~No error handling in APIs~~ → **DONE** - All APIs have proper validation and error responses
- ✅ ~~No RLS policies~~ → **DONE** - 38 policies enforcing user data isolation across 13 tables (deployed 2025-11-18)

**Remaining Minor Items**:
- ⏳ Enable leaked password protection in Supabase Auth (5-min manual step)
- Add feedback UI in dashboard to display evaluation results
- Consider implementing real-time nudges during interviews (optional)
- Optimize RLS policies for performance when scale demands (auth.uid() → select auth.uid())

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
