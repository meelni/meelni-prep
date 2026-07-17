# DEPLOYMENT.md: Deployment Procedures

**Last Updated**: 2025-11-06
**Status**: Placeholder (to be populated before production)

## Purpose

Document deployment procedures for all services.

## Current Deployments

### Next.js (Vercel)

- **Status**: Development only
- **Branch**: Auto-deploy from `main` (planned)
- **Environment**: Preview deployments on PRs
- **Config**: vercel.json (if needed)

### LiveKit Demo Agent (LiveKit Cloud)

- **Status**: ✅ Deployed
- **Agent ID**: CA_Wp8bi3bRroE2
- **Deploy Command**: target-bound `agent/demo/deploy.sh preview|production` or `agent/interview/deploy.sh preview|production`; Production requires the owner artifact.
- **See**: CLAUDE.md "LiveKit Cloud Agent Deployment" section for full details

### Main Interview Agent

- **Status**: Local dev only
- **Planned**: Railway/Render/Fly.io deployment
- **Requirements**: Python 3.12+, 512MB RAM minimum

## Production Checklist (Not Yet Ready)

- [ ] Environment variables configured in Vercel
- [ ] Supabase production project created
- [ ] RLS policies enabled on database
- [ ] LiveKit production API keys configured
- [ ] Error tracking (Sentry) integrated
- [ ] Analytics (Vercel + PostHog) configured
- [ ] Domain configured and SSL cert active
- [ ] Rollback procedure documented

---

**For now, see**: CLAUDE.md "LiveKit Cloud Agent Deployment" section
