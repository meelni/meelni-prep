# MockMate - Real-Time AI Mock Interviews

MockMate is an AI-powered interview practice platform that helps users prepare for PM interviews through realistic, real-time voice conversations. Built with Next.js, LiveKit Agents, and Supabase.

---

## 🏗️ Architecture Overview

MockMate consists of three interconnected systems:

### 1. **Frontend** (Next.js 14+ App Router)
- Modern UI with Tailwind CSS, shadcn/ui, and Framer Motion animations
- Interview setup and configuration flow
- Real-time audio/video UI powered by LiveKit React components
- Server-side rendering with TypeScript

### 2. **Backend Agent** (Python + LiveKit Agents)
- Python worker that joins LiveKit rooms as a programmable participant
- Real-time voice pipeline:
  - **STT**: Deepgram Nova-3 for speech recognition
  - **LLM**: GPT-4.1-mini for conversational intelligence
  - **TTS**: Cartesia Sonic 3.0 (Tessa voice) for natural speech
  - **VAD**: Silero for voice activity detection and interruption handling
- See [`agent/README.md`](./agent/README.md) for detailed agent documentation

### 3. **Data Layer** (Supabase + Drizzle ORM)
- PostgreSQL database hosted on Supabase
- Type-safe ORM with Drizzle
- Schema includes: users, interview sessions, transcripts, and feedback
- Supabase Auth for authentication (planned)

**How It Works:**
```
User → Next.js UI → LiveKit Room → Python Agent
                         ↓
                    Voice Pipeline
                  (STT → LLM → TTS)
                         ↓
                   Supabase Database
```

---

## ⚡ Quick Start (10 Minutes)

### Prerequisites
- Node.js 18+ and npm
- Python 3.10+
- Supabase account (database)
- LiveKit Cloud account
- API keys: OpenAI, Deepgram, Cartesia

### Option A: Automated Setup (Conductor)
If you're using Conductor, the automation scripts handle everything:

```bash
# Setup runs automatically on workspace creation
# Just click the Run button to start both servers!
```

### Option B: Manual Setup

#### 1. Frontend Setup
```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Edit .env.local with your credentials (see Environment Variables below)

# Push database schema
npm run db:push

# Start Next.js dev server
npm run dev
```

#### 2. Agent Setup
```bash
cd agent

# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start agent in dev mode
python agent.py dev
```

#### 3. Access the App
- Frontend: http://localhost:3000
- Agent: Running as LiveKit worker (check terminal logs)

---

## 🔐 Environment Variables

Create `.env.local` in the project root with these variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string from Supabase |
| `LIVEKIT_API_KEY` | ✅ | LiveKit Cloud API key |
| `LIVEKIT_API_SECRET` | ✅ | LiveKit Cloud API secret |
| `NEXT_PUBLIC_LIVEKIT_URL` | ✅ | LiveKit WebSocket URL (e.g., `wss://your-project.livekit.cloud`) |
| `OPENAI_API_KEY` | ✅ | OpenAI API key (for GPT-4.1-mini) |
| `DEEPGRAM_API_KEY` | ✅ | Deepgram API key (for Nova-3 ASR) |
| `CARTESIA_API_KEY` | ⚠️ | **Not required** when using LiveKit Inference (only for direct API access) |
| `NEXT_PUBLIC_SUPABASE_URL` | 🔜 | Supabase project URL (planned for auth) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 🔜 | Supabase anon key (planned for auth) |

**Note:** The agent reads from the same `.env.local` file via symlink (see Conductor automation docs below).

---

## 📦 Available Scripts

### Frontend (Next.js)
```bash
npm run dev          # Start Next.js dev server on http://localhost:3000
npm run build        # Production build
npm start            # Start production server
npm run lint         # Run ESLint
npm run lint:fix     # Auto-fix ESLint issues
npm run format       # Format code with Prettier
npm run format:check # Check code formatting without changes
npm run typecheck    # Run TypeScript type checking (no build)
npm run analyze      # Analyze bundle size with Next.js
```

### Database (Drizzle ORM)
```bash
npm run db:generate  # Generate migration files
npm run db:migrate   # Apply migrations to database
npm run db:push      # Push schema directly (dev mode, no migration files)
npm run db:studio    # Open Drizzle Studio GUI
npm run db:check     # Validate schema and migrations (safety check)
```

### Targeted Development
```bash
npm run dev:web      # Start Next.js only (for frontend-only work)
npm run dev:agent    # Start Python agent only (for agent-only work)
```

### Agent (Python)
```bash
cd agent
source venv/bin/activate

python agent.py dev    # Dev mode with auto-reload
python agent.py start  # Production mode
```

---

## 🤖 Conductor Automation

If you're using Conductor, two automation scripts streamline your workflow:

### `conductor-setup.sh`
**Runs automatically when creating a workspace.** It:
1. Verifies npm and python3 are installed
2. Symlinks `.env` from project root to workspace `.env.local`
3. Validates required environment variables (DATABASE_URL, LIVEKIT_*, OPENAI_API_KEY)
4. Installs npm dependencies
5. Creates Python virtual environment and installs agent dependencies

**Why?** One-command setup ensures all dependencies are ready before you start coding.

### `conductor-run.sh`
**Triggered by the Run button in Conductor.** It:
1. Starts Next.js dev server on http://localhost:3000
2. Starts Python LiveKit agent in dev mode (with auto-reload)
3. Handles graceful shutdown on Ctrl+C (kills both processes)
4. Shows process IDs and status for debugging

**Why?** Eliminates context switching—start the entire dual-runtime stack with one click.

---

## 🗂️ Project Structure

```
/
├── .claude/                  # Living documentation (PRD, CLAUDE.md)
├── agent/                    # Python LiveKit Agents worker
│   ├── venv/                 # Python virtual environment
│   ├── agent.py              # Main agent entrypoint
│   ├── requirements.txt      # Python dependencies
│   └── README.md             # Agent-specific documentation
├── app/                      # Next.js App Router pages
│   ├── page.tsx              # Home page
│   ├── setup/                # Interview configuration page
│   ├── interview/            # LiveKit room UI
│   └── api/                  # API routes (token generation)
├── components/               # React components
│   └── ui/                   # Reusable UI library (Button, Card, Badge)
├── lib/                      # Shared utilities
│   ├── db/                   # Drizzle ORM (schema, client)
│   ├── supabase/             # Supabase clients (browser, server)
│   ├── animations.ts         # Framer Motion presets
│   └── utils.ts              # Utility functions
├── public/                   # Static assets
├── conductor-setup.sh        # Conductor setup automation
├── conductor-run.sh          # Conductor run automation
├── drizzle.config.ts         # Drizzle ORM configuration
├── package.json              # Node.js dependencies and scripts
└── README.md                 # This file
```

---

## 🧪 Testing

**Status:** Not yet implemented. Planned frameworks:
- **Unit tests:** Vitest (for utils, API routes, database operations)
- **E2E tests:** Playwright (for interview flow, authentication)
- **Target coverage:** >80% for core logic

---

## 🚀 Deployment

### Frontend (Vercel)
```bash
# Automatic deployment via GitHub integration
# Set environment variables in Vercel dashboard
vercel deploy
```

### Agent (Railway / Render / Fly.io)
```bash
# Railway
railway up

# Render
# Connect git repo
# Build: pip install -r agent/requirements.txt
# Start: cd agent && python agent.py start

# Fly.io
fly deploy
```

### Database (Supabase)
Already hosted. Run migrations before deploying frontend:
```bash
npm run db:migrate
```

---

## 📚 Documentation

- **PRD:** [`.claude/PRD.md`](./.claude/PRD.md) - Product requirements and feature specs
- **CLAUDE.md:** [`.claude/CLAUDE.md`](./.claude/CLAUDE.md) - Living operational document (architecture, decisions, workflows)
- **Agent Docs:** [`agent/README.md`](./agent/README.md) - Python worker setup and deployment
- **LiveKit Docs:** https://docs.livekit.io/agents - Official LiveKit Agents documentation

---

## 🛠️ Development Workflow

### Typical Development Loop
1. **Start both servers:** Click Run button (Conductor) or run `npm run dev` + `python agent.py dev`
2. **Edit code:** Changes auto-reload in both Next.js and Python agent
3. **Check types:** `npm run typecheck` before committing
4. **Format code:** `npm run format` (Prettier)
5. **Lint:** `npm run lint:fix` (ESLint)
6. **Database changes:** Edit `lib/db/schema.ts` → `npm run db:push`

### Git Workflow
```bash
# Create feature branch
git checkout -b your-branch-name

# Make changes, then commit
git add .
git commit -m "Your message

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# Push and create PR
git push origin your-branch-name
```

---

## 🐛 Troubleshooting

### "Agent not responding"
- Restart the Python agent: `python agent.py dev` (in `agent/` directory)
- Check LiveKit credentials in `.env.local`
- Verify agent logs in terminal

### "Database connection failed"
- Verify `DATABASE_URL` in `.env.local`
- Test connection: `npm run db:studio`
- Check Supabase dashboard for database status

### "LiveKit token generation failed"
- Check `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` in `.env.local`
- Verify `NEXT_PUBLIC_LIVEKIT_URL` format: `wss://your-project.livekit.cloud`

### "Python virtual environment issues"
- Recreate venv: `cd agent && rm -rf venv && python3 -m venv venv`
- Reinstall deps: `source venv/bin/activate && pip install -r requirements.txt`

---

## 📖 Learn More

### Next.js Resources
- [Next.js Documentation](https://nextjs.org/docs) - Next.js features and API
- [Learn Next.js](https://nextjs.org/learn) - Interactive tutorial
- [Next.js GitHub](https://github.com/vercel/next.js) - Feedback and contributions

### LiveKit Resources
- [LiveKit Agents](https://github.com/livekit/agents) - Agent framework source and examples
- [LiveKit Docs](https://docs.livekit.io) - Core WebRTC infrastructure
- [LiveKit Dashboard](https://cloud.livekit.io) - Manage projects and API keys

---

## 📄 License

Private project. All rights reserved.

---

## 👥 Contributing

Currently a solo project. For questions or feedback, see documentation in `.claude/` directory.
