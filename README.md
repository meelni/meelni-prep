# Meelni - Real-Time AI Mock Interviews

Meelni is an AI-powered interview practice platform that helps users prepare for PM interviews through realistic, real-time voice conversations. Built with Next.js, LiveKit Agents, and Supabase.

---

## 🏗️ Architecture Overview

Meelni consists of three interconnected systems:

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
  - **TTS**: ElevenLabs Eleven Turbo v2.5 for natural speech
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

### Option A: Automated Setup (Coding Agents)

Agent platforms that honor `conductor.json` run the maintained setup and run commands automatically:

```bash
npm run setup:local
npm run dev:local
```

`dev:local` starts Next.js, the local Inngest Dev Server, and the Python LiveKit agent when `agent/venv` exists.

### Option B: Manual Setup

```bash
# Install dependencies, create .env.local when possible, and set up agent/venv
npm run setup:local

# Push database schema
npm run db:push

# Start local runtime processes
npm run dev:local
```

#### Access the App

- Frontend: http://localhost:3000
- Inngest UI: http://localhost:8288
- Agent: Running as LiveKit worker when configured

For adjacent worktrees, set `CONDUCTOR_PORT` or `PORT`; `dev:local` derives separate Inngest ports automatically.

---

## 🔐 Environment Variables

Create `.env.local` in the project root with these variables:

| Variable                        | Required | Description                                                                |
| ------------------------------- | -------- | -------------------------------------------------------------------------- |
| `DATABASE_URL`                  | ✅       | PostgreSQL connection string from Supabase                                 |
| `LIVEKIT_API_KEY`               | ✅       | LiveKit Cloud API key                                                      |
| `LIVEKIT_API_SECRET`            | ✅       | LiveKit Cloud API secret                                                   |
| `NEXT_PUBLIC_LIVEKIT_URL`       | ✅       | LiveKit WebSocket URL (e.g., `wss://your-project.livekit.cloud`)           |
| `OPENAI_API_KEY`                | ✅       | OpenAI API key (for GPT-4.1-mini)                                          |
| `DEEPGRAM_API_KEY`              | ✅       | Deepgram API key (for Nova-3 ASR)                                          |
| `CARTESIA_API_KEY`              | ⚠️       | **Not required** when using LiveKit Inference (only for direct API access) |
| `NEXT_PUBLIC_SUPABASE_URL`      | 🔜       | Supabase project URL (planned for auth)                                    |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 🔜       | Supabase anon key (planned for auth)                                       |

**Note:** The agent reads from the same `.env.local` file via symlink (see Conductor automation docs below).

---

## 📦 Available Scripts

### Local Development

```bash
npm run setup:local  # Install dependencies, prepare env files, and create agent/venv
npm run dev:local    # Start Next.js, Inngest, and the Python agent when available
npm run doctor       # Check local setup health
npm run dev          # Start Next.js only on http://localhost:3000
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
npm run dev:inngest  # Start Inngest only against http://127.0.0.1:3000/api/inngest
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

If you're using Conductor or another agent runner that still calls the shell wrappers, those scripts delegate to the maintained npm commands:

### `conductor-setup.sh`

Delegates to `npm run setup:local`, which:

1. Installs npm dependencies
2. Creates `.env.local` from `.env.example` when possible
3. Symlinks `agent/.env` to the root `.env.local`
4. Creates `agent/venv` and installs Python agent dependencies

**Why?** One-command setup ensures all dependencies are ready before you start coding.

### `conductor-run.sh`

Delegates to `npm run dev:local`, which:

1. Starts Next.js on the selected local web port
2. Starts the Inngest Dev Server against `/api/inngest`
3. Starts the Python LiveKit agent when `agent/venv` exists
4. Handles graceful shutdown for child processes

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
- **Engineering Docs:** [`docs/README.md`](./docs/README.md) - Architecture, contracts, operations, and historical references
- **Internal API Notes:** [`docs/api/README.md`](./docs/api/README.md) - Repository-only implementation notes; not a supported public API
- **Operations:** [`docs/operations/`](./docs/operations/) - Local development, deployment, and launch runbooks
- **LiveKit Docs:** https://docs.livekit.io/agents - Official LiveKit Agents documentation

---

## Internal API References

Meelni does not currently publish or support a developer API or a public `/docs` surface. Application routes under `app/api/` exist for the Meelni web and voice interview workflows; their durable behavior contracts live in [`docs/contracts/`](./docs/contracts/), and operator procedures live in [`docs/operations/`](./docs/operations/).

Files under `docs/api/` and `docs/openapi.yaml` are internal historical references until they are reconciled with the implemented routes. Do not publish or use them as a customer contract.

---

## 🛠️ Development Workflow

### Typical Development Loop

1. **Start local runtime:** Click Run button in the agent workspace or run `npm run dev:local`
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
