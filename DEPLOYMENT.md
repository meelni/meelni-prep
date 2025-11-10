# Meelni Production Deployment Guide

This guide walks you through deploying Meelni to Vercel for production.

## Prerequisites

Before deploying, ensure you have:

1. ✅ Vercel account (sign up at https://vercel.com)
2. ✅ Vercel CLI installed: `npm i -g vercel`
3. ✅ All required API keys and credentials
4. ✅ Supabase project configured
5. ✅ LiveKit Cloud project configured
6. ✅ Python agents deployed to LiveKit Cloud

## Architecture Overview

**Frontend + API**: Vercel (Next.js 16)
**Database**: Supabase (PostgreSQL)
**Auth**: Supabase Auth (Google OAuth)
**Real-time Voice**: LiveKit Cloud
**AI Agents**: LiveKit Cloud (deployed separately)
**Background Jobs**: Inngest
**Analytics**: Vercel Analytics

## Deployment Steps

### 1. Install Vercel CLI

```bash
npm install -g vercel
```

### 2. Login to Vercel

```bash
vercel login
```

### 3. Link Project to Vercel

From the project root:

```bash
vercel link
```

Follow the prompts:
- Set up and deploy? **No** (we'll configure first)
- Which scope? Select your account/team
- Link to existing project? **No**
- What's your project's name? **meelni** (or your preferred name)
- In which directory is your code located? **./** (current directory)

### 4. Configure Environment Variables

#### Option A: Via Vercel CLI

```bash
# Database
vercel env add DATABASE_URL production
# Paste: postgresql://postgres:g4G5NmmJwJZJZ6of@db.viafxscamydwybdlcynb.supabase.co:5432/postgres

# Supabase
vercel env add NEXT_PUBLIC_SUPABASE_URL production
# Paste: https://viafxscamydwybdlcynb.supabase.co

vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
# Paste: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpYWZ4c2NhbXlkd3liZGxjeW5iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIyOTk5MzUsImV4cCI6MjA3Nzg3NTkzNX0.jx5RELYDHQyObv_Pe-9gMmiS_wzXPd0QORq9frmrV5o

vercel env add SUPABASE_SERVICE_ROLE_KEY production
# Paste: (your service role key)

# LiveKit
vercel env add LIVEKIT_API_KEY production
# Paste: API7QoD39Zq8zsi

vercel env add LIVEKIT_API_SECRET production
# Paste: (your LiveKit secret)

vercel env add NEXT_PUBLIC_LIVEKIT_URL production
# Paste: wss://meelni-ek4vaisp.livekit.cloud

vercel env add LIVEKIT_URL production
# Paste: wss://meelni-ek4vaisp.livekit.cloud

# OpenAI
vercel env add OPENAI_API_KEY production
# Paste: (your OpenAI key)

# Inngest
vercel env add INNGEST_EVENT_KEY production
# Paste: (your Inngest event key)

vercel env add INNGEST_SIGNING_KEY production
# Paste: (your Inngest signing key)

# Google Sheets
vercel env add GOOGLE_SHEETS_API_KEY production
# Paste: (your Google Sheets API key)

vercel env add GOOGLE_SHEET_ID production
# Paste: 1rz10oEeLx-eGnilahKczYPhGfCUzIEKL-xRnjoQ-SX4

vercel env add GOOGLE_SHEET_NAME production
# Paste: Form Responses 1
```

#### Option B: Via Vercel Dashboard

1. Go to https://vercel.com/dashboard
2. Select your project
3. Navigate to **Settings** → **Environment Variables**
4. Add each variable from the list above

**CRITICAL**: Mark `NEXT_PUBLIC_*` variables as **checked for all environments** (Production, Preview, Development)

### 5. Configure OAuth Redirect URLs

Update your Google OAuth configuration to include Vercel domain:

1. Go to Google Cloud Console
2. Navigate to **APIs & Services** → **Credentials**
3. Edit your OAuth 2.0 Client ID
4. Add authorized redirect URIs:
   ```
   https://your-project.vercel.app/auth/callback
   https://viafxscamydwybdlcynb.supabase.co/auth/v1/callback
   ```
5. Update Supabase Auth settings:
   - Go to Supabase Dashboard → Authentication → URL Configuration
   - Add site URL: `https://your-project.vercel.app`
   - Add redirect URLs: `https://your-project.vercel.app/**`

### 6. Deploy to Production

```bash
vercel --prod
```

This will:
- Build your Next.js application
- Deploy to Vercel's global CDN
- Assign a production domain

### 7. Verify Deployment

After deployment completes, test:

1. **Landing Page**: Visit your production URL
2. **Demo Modal**: Click "Talk to Meelni" (should connect to LiveKit Cloud agent)
3. **Authentication**: Click "Start A Mock" → Sign in with Google
4. **Dashboard**: Verify personalized welcome shows your name
5. **Interview Flow**: Start mock interview → Check LiveKit connection
6. **Cron Job**: Verify `/api/cron/sync-questions` is scheduled (Mondays at 9 AM)

### 8. Configure Custom Domain (Optional)

```bash
vercel domains add yourdomain.com
```

Then follow DNS configuration instructions.

## Post-Deployment Checklist

- [ ] Test Google OAuth sign-in flow
- [ ] Verify LiveKit demo agent connects
- [ ] Test main interview agent dispatch
- [ ] Check Supabase database connections
- [ ] Verify RLS policies are enforced
- [ ] Test cron job execution
- [ ] Enable Vercel Analytics
- [ ] Configure error monitoring (Sentry - optional)
- [ ] Set up uptime monitoring
- [ ] Test mobile responsiveness

## Monitoring & Analytics

### Vercel Analytics

Enable in Vercel Dashboard → Analytics tab

### Vercel Logs

View real-time logs:
```bash
vercel logs --follow
```

### Database Monitoring

- Supabase Dashboard → Database → Logs
- Monitor connection pool usage
- Review slow queries

### LiveKit Monitoring

```bash
# Check agent status
lk agent status

# View agent logs
lk agent logs

# View deployment history
lk agent list
```

## Rollback Procedure

If deployment has issues:

```bash
# List deployments
vercel ls

# Rollback to previous deployment
vercel rollback <deployment-url>
```

## Environment-Specific Deployments

### Preview Deployments

Every push to a branch creates a preview deployment:
```bash
vercel
```

### Production Deployments

Only deploy to production from `main` branch:
```bash
git checkout main
git pull origin main
vercel --prod
```

## Troubleshooting

### Build Failures

**Issue**: TypeScript errors during build
```bash
# Fix locally first
npm run typecheck
npm run build
```

**Issue**: Missing environment variables
- Check Vercel Dashboard → Settings → Environment Variables
- Ensure all required vars are set for Production

### Runtime Errors

**Issue**: 500 errors on API routes
- Check Vercel Logs: `vercel logs`
- Verify environment variables are set correctly
- Check Supabase connection string

**Issue**: LiveKit connection fails
- Verify `NEXT_PUBLIC_LIVEKIT_URL` is set
- Check LiveKit API credentials
- Confirm agents are deployed: `lk agent status`

**Issue**: OAuth redirect fails
- Verify redirect URLs in Google Cloud Console
- Check Supabase Auth settings
- Ensure site URL matches deployment URL

### Database Issues

**Issue**: Connection pool exhaustion
- Review Supabase connection limits
- Consider implementing connection pooling (PgBouncer)

**Issue**: RLS policy errors
- Check policies in Supabase Dashboard
- Verify user authentication is working

## CI/CD Integration (Optional)

### GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Vercel

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run build
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID }}
          vercel-project-id: ${{ secrets.PROJECT_ID }}
          vercel-args: '--prod'
```

## Performance Optimization

### Edge Functions

API routes run on Vercel Edge by default (fast global access)

### Image Optimization

Next.js Image component automatically optimized by Vercel

### Caching Strategy

- Static assets: Cached at edge
- API routes: Configure cache headers as needed
- Database queries: Consider Redis for frequently accessed data (future)

## Cost Monitoring

### Vercel Pricing

- Free tier: Sufficient for MVP
- Pro tier: $20/month (recommended for production)
- Monitor usage: Dashboard → Usage tab

### Supabase Pricing

- Free tier: 500 MB database, 2 GB bandwidth
- Pro tier: $25/month (recommended for production)

### LiveKit Pricing

- Pay-as-you-go based on usage
- Monitor: LiveKit Dashboard → Billing

### OpenAI Pricing

- GPT-4.1-mini: ~$0.05 per 20-min session
- Monitor: OpenAI Dashboard → Usage

## Security Checklist

- [ ] Environment variables stored in Vercel (not in code)
- [ ] RLS policies enabled on all Supabase tables
- [ ] OAuth redirect URLs whitelisted
- [ ] API routes protected with authentication
- [ ] Rate limiting configured (future enhancement)
- [ ] CORS configured properly
- [ ] HTTPS enforced (automatic with Vercel)

## Support & Resources

- **Vercel Docs**: https://vercel.com/docs
- **Next.js Docs**: https://nextjs.org/docs
- **Supabase Docs**: https://supabase.com/docs
- **LiveKit Docs**: https://docs.livekit.io
- **Inngest Docs**: https://www.inngest.com/docs

## Getting Help

- Vercel Support: https://vercel.com/support
- Create issue in project repository
- Check CLAUDE.md for architecture details
- Review TROUBLESHOOTING.md (if created)

---

**Last Updated**: 2025-11-09
**Version**: 1.0.0
