# Third-Party Integrations

This directory contains documentation for all third-party services and integrations used in the Meelni project.

## Active Integrations

### ✅ LiveKit

**Purpose**: Real-time voice communication and AI agent orchestration

- **[LiveKit Integration Guide](./livekit.md)** - Complete LiveKit setup and usage
- **Services Used**:
  - LiveKit Cloud (WebRTC infrastructure)
  - LiveKit Agents (Python SDK for voice agents)
  - LiveKit Inference (Deepgram, OpenAI, Cartesia integration)
- **Related ADRs**:
  - [ADR-007](../architecture/adrs/ADR-007-livekit-voice-interview.md) - Voice interview integration
  - [ADR-009](../architecture/adrs/ADR-009-livekit-agent-session-api.md) - AgentSession API
  - [ADR-019](../architecture/adrs/ADR-019-explicit-agent-dispatch.md) - Agent dispatch pattern
- **Key Documentation**:
  - `docs/LIVEKIT_DEBUGGING.md` - Debugging workflows
  - `agent/docs/DEPLOYMENT.md` - Agent deployment guide

### ✅ Supabase

**Purpose**: PostgreSQL database and authentication

- **[Supabase Integration Guide](./supabase.md)** - Database and auth setup
- **Services Used**:
  - Supabase Auth (OAuth + Email/Password)
  - PostgreSQL with Row Level Security (RLS)
  - Realtime subscriptions (planned)
- **Related ADRs**:
  - [ADR-003](../architecture/adrs/ADR-003-tech-stack-finalization.md) - Tech stack selection
  - [ADR-006](../architecture/adrs/ADR-006-database-schema-deployed.md) - Schema deployment
  - [ADR-020](../architecture/adrs/ADR-020-google-oauth-authentication.md) - OAuth implementation
- **Key Documentation**:
  - `.claude/DATABASE.md` - Database schema reference
  - `docs/api/authentication.md` - Auth flows

### ✅ Google Sheets

**Purpose**: Question bank synchronization

- **[Google Sheets Integration](./google-sheets.md)** - Cron job setup and sync
- **Services Used**:
  - Google Sheets API
  - Vercel Cron (for scheduled sync)
- **Related Documentation**:
  - `docs/cron-jobs-quick-reference.md`
  - `docs/google-sheets-cron-setup.md`

### ⚠️ Inngest (Planned)

**Purpose**: Background job processing for async evaluation

- **[Inngest Integration](./inngest.md)** - Background job setup (planned)
- **Status**: Architecture defined (ADR-004), not yet implemented
- **Related ADR**: [ADR-004](../architecture/adrs/ADR-004-background-jobs-inngest.md)

### ✅ OpenAI

**Purpose**: Large language models for dialogue and evaluation

- **Models Used**:
  - GPT-4.1-mini (dialogue during interviews)
  - GPT-4 Turbo (post-session evaluation)
- **Access Method**: Via LiveKit Inference (no direct API calls)
- **Related ADRs**:
  - [ADR-008](../architecture/adrs/ADR-008-gpt4o-mini-dialogue.md) - Dialogue model selection
  - [ADR-015](../architecture/adrs/ADR-015-model-upgrade.md) - Model upgrades

### ✅ Deepgram

**Purpose**: Speech-to-text (ASR) for interview transcription

- **Model**: Nova-3
- **Access Method**: Via LiveKit Inference
- **Cost**: ~$0.0043/min
- **Related ADR**: [ADR-015](../architecture/adrs/ADR-015-model-upgrade.md)

### ✅ Cartesia

**Purpose**: Text-to-speech (TTS) for AI voice

- **Model**: Sonic 3.0
- **Voice**: Tessa (emotive voice)
- **Access Method**: Via LiveKit Inference (no separate API key needed)
- **Related ADRs**:
  - [ADR-015](../architecture/adrs/ADR-015-model-upgrade.md) - Model upgrade
  - [ADR-016](../architecture/adrs/ADR-016-cartesia-voice-tessa.md) - Voice selection

## Integration Architecture

```
┌─────────────────────────────────────────┐
│         Next.js Frontend                │
│    (Vercel + Vercel Cron)              │
└──┬─────────────┬───────────────┬────────┘
   │             │               │
   ▼             ▼               ▼
┌──────────┐  ┌─────────────┐  ┌──────────────┐
│ Supabase │  │ LiveKit     │  │ Google       │
│ (Auth +  │  │ (Agents +   │  │ Sheets API   │
│  DB)     │  │  Inference) │  └──────────────┘
└──────────┘  └─────┬───────┘
                    │
              ┌─────┴──────────────┐
              │                    │
         ┌────▼─────┐        ┌────▼────┐
         │ Deepgram │        │ OpenAI  │
         │ (STT)    │        │ (LLM)   │
         └──────────┘        └─────────┘
              │
         ┌────▼─────┐
         │Cartesia  │
         │ (TTS)    │
         └──────────┘
```

## Environment Variables

All integrations require environment variables. See `docs/deployment/environment-variables.md` for complete reference.

Key variables by integration:

**LiveKit**

```
LIVEKIT_API_KEY
LIVEKIT_API_SECRET
NEXT_PUBLIC_LIVEKIT_URL
```

**Supabase**

```
DATABASE_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

**OpenAI**

```
OPENAI_API_KEY
```

**Deepgram**

```
DEEPGRAM_API_KEY
```

**Google Sheets**

```
GOOGLE_SHEETS_PRIVATE_KEY
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_SHEET_ID
```

## Cost Breakdown

Estimated costs per 20-minute interview session:

| Service   | Usage         | Cost       |
| --------- | ------------- | ---------- |
| Deepgram  | 20 min STT    | ~$0.09     |
| OpenAI    | ~10K tokens   | ~$0.05     |
| Cartesia  | ~5 min TTS    | ~$0.10     |
| LiveKit   | Agent runtime | ~$0.15     |
| **Total** |               | **~$0.39** |

Note: Supabase and Vercel are free tier for MVP.

## Adding New Integrations

When adding a new integration:

1. Create integration guide in this directory
2. Add environment variables to `.env.example`
3. Document in `deployment/environment-variables.md`
4. Add to architecture diagram above
5. Create ADR if it's a significant architectural decision

## Troubleshooting

See integration-specific troubleshooting in each guide:

- LiveKit: `docs/LIVEKIT_DEBUGGING.md`
- Supabase: `docs/integrations/supabase.md#troubleshooting`
- Google Sheets: `docs/google-sheets-cron-setup.md#troubleshooting`

---

**Last Updated**: 2025-11-12
