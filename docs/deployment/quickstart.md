# Quick Start: Deploy Meelni to Production

**Time Required**: ~15 minutes (after prerequisites are configured)

This guide provides the fastest path to deploy Meelni to production on Vercel with LiveKit Cloud agents.

## Prerequisites

Before deploying, ensure you have:

- [ ] **Vercel account** (free tier works)
- [ ] **Supabase project** created and database schema deployed
- [ ] **LiveKit Cloud account** with agents deployed
- [ ] **Google Cloud Console** OAuth credentials configured
- [ ] **OpenAI API key** for GPT models
- [ ] **Deepgram API key** for speech-to-text
- [ ] All environment variables ready (see [Environment Variables](./environment-variables.md))

## Step-by-Step Deployment

### Step 1: Authenticate with the pinned Vercel CLI

```bash
npx vercel@55.0.0 login
```

### Step 2: Link and verify the Meelni project

```bash
npx vercel@55.0.0 link --yes --project meelni
npx vercel@55.0.0 env ls
```

Confirm the CLI reports the `meelni/meelni` project before continuing. Do not
pass a Production secret in a CLI argument.

### Step 3: Validate and deploy through the reviewed workflow

Run the same local gates used by CI:

```bash
npm run check:ci
npm run build
```

Merge the reviewed change through Git and promote the resulting Vercel
deployment from the `meelni/meelni` project. The retired local deployment
script and bare `vercel --prod` path are not approved because they did not prove
the linked project/account before mutating Production.

Production promotion remains unsupported until SAV-254 adds the controlled
wrapper for `vercel-production-promote`. A checklist pass or readiness
recommendation is insufficient. Promotion will require a signed exact-candidate
Production action artifact; relaunch default-on is a separate action that also
requires the product owner's explicit GO for that candidate.

### Step 4: Configure Environment Variables

After the first deployment, you need to add environment variables in the Vercel Dashboard.

Add each variable to the intended environment in the Vercel Dashboard. Do not
copy `.env.local` wholesale into Production: local files normally contain
Preview or test credentials. Use the provider dashboard as the source of truth
for server-only secrets and select Preview, Development, or Production
explicitly for every value.

After configuration, use `npm run env:pull:preview` or
`npm run env:pull:production` to verify the intended environment locally. The
pull command refuses cross-environment filenames and Supabase project
mismatches.

**Required Variables** (minimum):
| Variable | Source | Notes |
|----------|--------|-------|
| `DATABASE_URL` | Supabase | PostgreSQL connection string |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase | Public URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase | Public anon key |
| `MEELNI_PRODUCTION_SUPABASE_PROJECT_REF` | Supabase | Non-secret Production project ref; use the same value in Preview and Production |
| `LIVEKIT_API_KEY` | LiveKit | API key |
| `LIVEKIT_API_SECRET` | LiveKit | API secret |
| `NEXT_PUBLIC_LIVEKIT_URL` | LiveKit | WebSocket URL (wss://...) |
| `OPENAI_API_KEY` | OpenAI | For GPT-4.1-mini |
| `DEEPGRAM_API_KEY` | Deepgram | For Nova-3 STT |

See [Environment Variables Reference](./environment-variables.md) for the complete list.

### Step 5: Update OAuth Redirect URLs

**Google Cloud Console**:

1. Go to **APIs & Services** → **Credentials**
2. Edit your **OAuth 2.0 Client**
3. Add to **Authorized redirect URIs**:
   - `https://your-project.vercel.app/auth/callback`
   - `https://[your-supabase-project].supabase.co/auth/v1/callback`

**Supabase Dashboard**:

1. Go to **Authentication** → **URL Configuration**
2. Set **Site URL**: `https://your-project.vercel.app`
3. Add **Redirect URLs**: `https://your-project.vercel.app/**`

### Step 6: Redeploy with Environment Variables

Redeploy or promote the reviewed commit from the Vercel `meelni/meelni`
dashboard after confirming the Production environment variable names and
targets. Keep the relaunch feature flag off until post-deployment verification
passes.

## Post-Deployment Verification

Visit your Vercel URL (`https://your-project.vercel.app`) and test:

### ✅ Basic Functionality

1. **Landing page loads** - Main page renders correctly
2. **Demo modal works** - "Talk to Meelni" button opens demo
3. **Demo agent responds** - Voice conversation works

### ✅ Authentication

4. **Sign in with Google** - OAuth flow completes
5. **Dashboard loads** - Shows your name from Google profile
6. **Sign out works** - Can log out successfully

### ✅ Interview Flow

7. **Start mock interview** - Button navigates to setup page
8. **Setup page renders** - Configuration options display
9. **LiveKit connection** - Agent joins and speaks
10. **Interview completes** - Session saves to database

## Troubleshooting

### Build Fails

Test locally first:

```bash
npm run build
npm run typecheck
npm run lint
```

Common issues:

- Missing dependencies: `npm install`
- TypeScript errors: Fix type issues
- Lint errors: Run `npm run lint --fix`

### Environment Variables Not Working

1. Check variables are set in **Vercel Dashboard** → **Settings** → **Environment Variables**
2. Ensure `NEXT_PUBLIC_*` variables are enabled for all environments (Production, Preview, Development)
3. Redeploy the reviewed commit from the `meelni/meelni` Vercel project

**Verification**:

```bash
# Check which variables are set
npx vercel@55.0.0 env ls
```

### OAuth Authentication Fails

**Symptoms**: "redirect_uri_mismatch" error or OAuth doesn't complete

**Solutions**:

1. Verify redirect URLs in **Google Cloud Console** match your deployment URL exactly
2. Check **Supabase Auth** settings have correct site URL
3. Ensure email confirmation is disabled (or emails are being sent)
4. Clear browser cookies and try again

### LiveKit Connection Fails

**Symptoms**: Agent doesn't join room, voice doesn't work

**Solutions**:

1. Verify `NEXT_PUBLIC_LIVEKIT_URL` is set correctly (starts with `wss://`)
2. Check agents are running: `lk agent status`
3. View agent logs: `lk agent logs`
4. Ensure both demo and main agents are deployed (see `agent/DEPLOYMENT.md`)

### Database Connection Issues

**Symptoms**: 500 errors, database queries fail

**Solutions**:

1. Verify `DATABASE_URL` is correct (check Supabase dashboard)
2. Verify the deployed schema with `npm run db:preflight:production`
3. Check Supabase project isn't paused (free tier pauses after inactivity)
4. Verify RLS policies are correct (if getting permission errors)

## Updating Your Deployment

### Frontend Changes

Merge through the reviewed Git workflow, then verify or promote the resulting
deployment in the `meelni/meelni` Vercel project.

### Agent Changes

```bash
cd agent
lk agent deploy
```

See `agent/DEPLOYMENT.md` for details.

### Database Schema Changes

Use the guarded migration rehearsal and rollout in
[`docs/operations/database-migrations.md`](../operations/database-migrations.md).
Never run `drizzle-kit push` against Preview or Production.

## Monitoring Your Deployment

- **Frontend Logs**: Vercel Dashboard → Logs
- **Agent Logs**: `lk agent logs`
- **Database Logs**: Supabase Dashboard → Logs
- **Error Tracking**: (Sentry planned, not yet configured)

## Rollback Procedures

### Rollback Frontend

1. Go to **Vercel Dashboard** → **Deployments**
2. Find previous successful deployment
3. Click **"..."** → **Redeploy**

### Rollback Agents

```bash
cd agent
lk agent rollback
```

### Rollback Database

Database schema rollbacks are manual - restore from Supabase backup if needed.

## Next Steps

After successful deployment:

- [ ] Set up custom domain (Vercel Dashboard → Settings → Domains)
- [ ] Enable Vercel Analytics
- [ ] Configure error tracking (Sentry)
- [ ] Set up monitoring alerts
- [ ] Test on mobile devices
- [ ] Run performance tests
- [ ] Configure CDN caching rules

## Additional Resources

- **Full Deployment Guide**: [DEPLOYMENT.md](../../.claude/DEPLOYMENT.md)
- **Environment Variables**: [environment-variables.md](./environment-variables.md)
- **LiveKit Agents**: `agent/DEPLOYMENT.md`
- **Troubleshooting**: [../../.claude/TROUBLESHOOTING.md](../../.claude/TROUBLESHOOTING.md)

## Need Help?

- Check **[TROUBLESHOOTING.md](../../.claude/TROUBLESHOOTING.md)** for common issues
- Review **[LiveKit Debugging Guide](../LIVEKIT_DEBUGGING.md)** for agent issues
- Create an issue on GitHub if you encounter new problems

---

**Last Updated**: 2025-11-12
**Tested On**: Vercel (Node.js 18.x), LiveKit Cloud, Supabase
