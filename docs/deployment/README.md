# Deployment Documentation

This directory contains all deployment guides, configuration references, and infrastructure documentation for the Meelni project.

## Quick Deploy

For a rapid production deployment, see:
- **[Quickstart Deploy](./quickstart.md)** - Step-by-step quick deployment guide

## Deployment Guides

### Frontend (Next.js)
- **[Vercel Deployment](./vercel.md)** - Deploy Next.js app to Vercel
- **[Environment Variables](./environment-variables.md)** - Required environment variables

### Backend (LiveKit Agents)
- **[LiveKit Agent Deployment](./livekit-agents.md)** - Deploy Python agents to LiveKit Cloud
- See also: `agent/DEPLOYMENT.md` for agent-specific instructions

### Database (Supabase)
- Configuration managed via Supabase Dashboard
- Schema deployment: `npx drizzle-kit push`
- See: `.claude/DATABASE.md` for schema reference

## Architecture Overview

```
┌─────────────────────────────────────────┐
│           Vercel (Frontend)             │
│     Next.js App Router + API Routes     │
└─────────────────┬───────────────────────┘
                  │
        ┌─────────┴─────────┐
        │                   │
┌───────▼────────┐  ┌──────▼──────────┐
│    Supabase    │  │  LiveKit Cloud  │
│  (Database +   │  │  (Agents +      │
│     Auth)      │  │   WebRTC)       │
└────────────────┘  └─────────────────┘
```

## Prerequisites

Before deploying, ensure you have:

- [ ] Vercel account (free tier works)
- [ ] Supabase project created
- [ ] LiveKit Cloud account
- [ ] Environment variables configured (see environment-variables.md)
- [ ] Database schema deployed (`npx drizzle-kit push`)

## Deployment Checklist

### Initial Deployment

1. **Database Setup**
   - [ ] Create Supabase project
   - [ ] Deploy schema: `npx drizzle-kit push`
   - [ ] Enable Row Level Security (RLS) policies
   - [ ] Configure authentication providers (Google OAuth, Email/Password)

2. **Environment Variables**
   - [ ] Configure Vercel environment variables
   - [ ] Configure agent environment variables (LiveKit secrets)
   - [ ] Verify all API keys are set
   - [ ] Test database connection strings

3. **Frontend Deployment (Vercel)**
   - [ ] Connect GitHub repository to Vercel
   - [ ] Configure build settings (auto-detected for Next.js)
   - [ ] Deploy to production
   - [ ] Verify deployment URL

4. **Agent Deployment (LiveKit Cloud)**
   - [ ] Deploy demo agent: `cd agent && lk agent deploy -f Dockerfile.demo`
   - [ ] Deploy main interview agent: `cd agent && lk agent deploy -f Dockerfile.main`
   - [ ] Verify agents are running: `lk agent status`
   - [ ] Test agent dispatch

5. **Post-Deployment Verification**
   - [ ] Test authentication flow (OAuth + Email/Password)
   - [ ] Test interview session creation
   - [ ] Test LiveKit agent connection
   - [ ] Test API endpoints
   - [ ] Verify RLS policies are working
   - [ ] Check error tracking (if configured)

### Updating Deployment

- **Frontend**: Push to main branch (auto-deploys on Vercel)
- **Agents**: `cd agent && lk agent deploy`
- **Database Schema**: `npx drizzle-kit push`

## Environment Variables Reference

See **[Environment Variables](./environment-variables.md)** for complete reference.

Key variables:
- `DATABASE_URL` - Supabase PostgreSQL connection string
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key
- `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` - LiveKit credentials
- `NEXT_PUBLIC_LIVEKIT_URL` - LiveKit WebSocket URL
- `OPENAI_API_KEY` - OpenAI API key for GPT-4.1-mini
- `DEEPGRAM_API_KEY` - Deepgram API key for Nova-3 STT

## Monitoring & Debugging

- **Frontend Logs**: Vercel dashboard → Logs
- **Agent Logs**: `lk agent logs` (runtime), `lk agent logs --log-type=build` (build logs)
- **Database Logs**: Supabase dashboard → Logs
- **Error Tracking**: (Sentry planned, not yet configured)

See **[LiveKit Debugging](../LIVEKIT_DEBUGGING.md)** for agent debugging workflows.

## Rollback Procedures

### Frontend Rollback
1. Go to Vercel dashboard → Deployments
2. Find previous successful deployment
3. Click "..." → Redeploy

### Agent Rollback
```bash
cd agent
lk agent rollback
```

### Database Rollback
Database schema rollbacks are manual - restore from backup if needed.

## Production Considerations

### Security
- ✅ RLS policies enabled on all user data
- ✅ Environment variables stored securely in Vercel/LiveKit secrets
- ✅ HTTPS enforced (automatic on Vercel)
- ⚠️ API rate limiting (planned, not yet implemented)

### Performance
- ✅ Next.js automatic code splitting
- ✅ Vercel Edge Network CDN
- ✅ LiveKit Cloud auto-scaling
- ⚠️ Database connection pooling (consider PgBouncer for high load)

### Cost Optimization
- LiveKit Agents scale to zero when idle
- Vercel free tier covers MVP usage
- Supabase free tier sufficient for initial launch
- Consider upgrading as usage grows

## Troubleshooting

Common deployment issues:

### "Agent not joining rooms"
- Check agent is deployed: `lk agent status`
- Verify agent logs: `lk agent logs`
- Ensure dispatch is configured correctly
- See: ADR-019 (Explicit Agent Dispatch)

### "Database connection failed"
- Verify `DATABASE_URL` is correct
- Check Supabase project is not paused (free tier pauses after inactivity)
- Ensure IP allowlist is configured (if applicable)

### "Authentication not working"
- Verify OAuth credentials in Supabase dashboard
- Check redirect URLs match deployment URLs
- Ensure email confirmation is disabled (or emails are being sent)

For more issues, see **[TROUBLESHOOTING.md](../../.claude/TROUBLESHOOTING.md)**

## Additional Resources

- **[Vercel Documentation](https://vercel.com/docs)**
- **[LiveKit Cloud Documentation](https://docs.livekit.io/cloud/)**
- **[Supabase Documentation](https://supabase.com/docs)**

---

**Last Updated**: 2025-11-12
