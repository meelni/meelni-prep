# Vercel Deployment Setup - Summary

## ✅ What's Been Configured

### 1. Project Configuration Files

- **`vercel.json`**: Updated with build settings and cron job configuration
- **`.vercelignore`**: Excludes agent directory and unnecessary files from deployment
- **`.env.production.example`**: Template for production environment variables

### 2. Deployment Scripts

- **`scripts/deploy.sh`**: Automated deployment script with pre-flight checks
  - Runs build validation
  - Checks TypeScript compilation
  - Runs linter
  - Deploys to Vercel production

### 3. Documentation

- **`DEPLOYMENT.md`**: Comprehensive deployment guide with troubleshooting
- **`QUICKSTART-DEPLOY.md`**: 5-minute quick start guide

## 🚀 Quick Deployment Commands

### First Time Setup

```bash
# 1. Install Vercel CLI
npm install -g vercel

# 2. Login
vercel login

# 3. Run automated deployment
./scripts/deploy.sh
```

### Subsequent Deployments

```bash
# Quick deploy
vercel --prod

# Or use the automated script
./scripts/deploy.sh
```

## ⚙️ Environment Variables Checklist

After first deployment, add these in Vercel Dashboard:

### Database & Auth (Required)
- [ ] `DATABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`

### LiveKit (Required)
- [ ] `LIVEKIT_API_KEY`
- [ ] `LIVEKIT_API_SECRET`
- [ ] `NEXT_PUBLIC_LIVEKIT_URL`
- [ ] `LIVEKIT_URL`

### AI Services (Required)
- [ ] `OPENAI_API_KEY`

### Background Jobs (Required)
- [ ] `INNGEST_EVENT_KEY`
- [ ] `INNGEST_SIGNING_KEY`

### Google Sheets (Required)
- [ ] `GOOGLE_SHEETS_API_KEY`
- [ ] `GOOGLE_SHEET_ID`
- [ ] `GOOGLE_SHEET_NAME`

### Optional Services
- [ ] `DEEPGRAM_API_KEY` (if not using LiveKit Inference)
- [ ] `CARTESIA_API_KEY` (if not using LiveKit Inference)
- [ ] `SENTRY_DSN` (error tracking)
- [ ] `RESEND_API_KEY` (email)

## 🔧 Post-Deployment Configuration

### 1. Update OAuth Redirect URLs

**Google Cloud Console**:
```
https://your-project.vercel.app/auth/callback
```

**Supabase Dashboard**:
- Site URL: `https://your-project.vercel.app`
- Redirect URLs: `https://your-project.vercel.app/**`

### 2. Verify Cron Job

The following cron job is configured in `vercel.json`:
- **Path**: `/api/cron/sync-questions`
- **Schedule**: Mondays at 9:00 AM UTC (`0 9 * * 1`)

### 3. Enable Vercel Features

- [ ] Analytics (free on all plans)
- [ ] Web Analytics (usage tracking)
- [ ] Speed Insights (performance monitoring)

## 📊 Monitoring & Logs

### View Deployment Logs
```bash
vercel logs --follow
```

### View Build Logs
```bash
# Via Vercel CLI
vercel inspect <deployment-url>

# Or visit Vercel Dashboard → Deployments → Select deployment
```

### Monitor LiveKit Agents
```bash
# Check agent status
lk agent status

# View agent logs
lk agent logs
```

## 🐛 Common Issues & Solutions

### Issue: Build Fails

**Solution**: Test locally first
```bash
npm run build
npm run typecheck
npm run lint
```

### Issue: Environment Variables Missing

**Solution**: Add via Vercel Dashboard
1. Go to Project Settings → Environment Variables
2. Add all required variables
3. Mark `NEXT_PUBLIC_*` for all environments
4. Redeploy

### Issue: OAuth Redirect Fails

**Solution**: Update redirect URLs
1. Google Cloud Console → Credentials → OAuth 2.0
2. Add: `https://your-domain.vercel.app/auth/callback`
3. Supabase Dashboard → Authentication → URL Configuration
4. Add site URL and redirect patterns

### Issue: LiveKit Connection Fails

**Solution**: Verify configuration
1. Check `NEXT_PUBLIC_LIVEKIT_URL` is set correctly
2. Verify agents are deployed: `lk agent status`
3. Check LiveKit API credentials

## 🎯 Deployment Checklist

### Pre-Deployment
- [ ] All tests pass locally
- [ ] Build completes successfully
- [ ] TypeScript compiles without errors
- [ ] Linting passes

### Initial Deployment
- [ ] Vercel CLI installed
- [ ] Logged into Vercel
- [ ] Project linked to Vercel
- [ ] Deployed to production

### Configuration
- [ ] All environment variables added
- [ ] OAuth redirect URLs updated
- [ ] Supabase Auth configured
- [ ] Cron job verified

### Testing
- [ ] Landing page loads
- [ ] Demo modal works
- [ ] Google OAuth sign-in works
- [ ] Dashboard shows user data
- [ ] Interview flow works end-to-end
- [ ] Mobile responsive

### Optional Enhancements
- [ ] Custom domain configured
- [ ] Analytics enabled
- [ ] Error monitoring (Sentry)
- [ ] Uptime monitoring
- [ ] Performance monitoring

## 📝 Project Architecture

**Frontend**: Next.js 16 (Vercel)
**Database**: PostgreSQL (Supabase)
**Auth**: Supabase Auth (Google OAuth)
**Real-time**: LiveKit Cloud
**AI Agents**: LiveKit Cloud (separate deployment)
**Background Jobs**: Inngest
**Cron Jobs**: Vercel Cron

## 🔗 Important Links

- **Vercel Dashboard**: https://vercel.com/dashboard
- **Supabase Dashboard**: https://supabase.com/dashboard
- **LiveKit Dashboard**: https://cloud.livekit.io
- **Google Cloud Console**: https://console.cloud.google.com

## 📖 Documentation

- [Full Deployment Guide](./DEPLOYMENT.md)
- [Quick Start Guide](./QUICKSTART-DEPLOY.md)
- [Project Documentation](./.claude/CLAUDE.md)

## 🆘 Getting Help

- **Vercel Support**: https://vercel.com/support
- **Project Issues**: Create an issue in repository
- **Architecture Questions**: Check `.claude/CLAUDE.md`

---

**Last Updated**: 2025-11-09
**Deployment Ready**: ✅ Yes

## Next Steps

1. Run `./scripts/deploy.sh` to deploy
2. Add environment variables in Vercel Dashboard
3. Update OAuth redirect URLs
4. Test the deployment
5. Enable monitoring and analytics

**Happy deploying! 🚀**
