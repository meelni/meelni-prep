# 🚀 Deploy Meelni to Production - Quick Guide

You're ready to deploy! Here's what you need to do.

## ✅ What's Already Done

All deployment configuration is complete:
- ✅ Vercel configuration files
- ✅ Automated deployment scripts
- ✅ Environment variable templates
- ✅ Comprehensive documentation

## 📋 Pre-Deployment Checklist

Before deploying, verify:

- [ ] All environment variables are ready (check `.env.local`)
- [ ] LiveKit agents are deployed to Cloud
- [ ] Supabase database is configured
- [ ] Google OAuth credentials are configured

## 🎯 Deploy in 3 Steps

### Step 1: Install Vercel CLI

```bash
npm install -g vercel
```

### Step 2: Login to Vercel

```bash
vercel login
```

### Step 3: Deploy!

```bash
./scripts/deploy.sh
```

That's it! The script will handle:
- Build validation
- TypeScript checks
- Linting
- Production deployment

## ⚙️ After First Deployment

### 1. Add Environment Variables

Go to your Vercel project dashboard and add all environment variables.

**Quick method**: Use the automated script:
```bash
./scripts/setup-vercel-env.sh
```

Then go to Vercel Dashboard → Settings → Environment Variables and enable Preview + Development for all `NEXT_PUBLIC_*` variables.

**Manual method**: Add each variable from `.env.local` in the Vercel Dashboard.

### 2. Update OAuth Redirect URLs

**Google Cloud Console**:
- Go to APIs & Services → Credentials
- Edit OAuth 2.0 Client
- Add: `https://your-project.vercel.app/auth/callback`

**Supabase Dashboard**:
- Go to Authentication → URL Configuration
- Site URL: `https://your-project.vercel.app`
- Redirect URLs: `https://your-project.vercel.app/**`

### 3. Redeploy

After adding environment variables:
```bash
vercel --prod
```

## 🧪 Testing Your Deployment

Visit your Vercel URL and test:

1. ✅ Landing page loads
2. ✅ Demo modal works (Talk to Meelni)
3. ✅ Sign in with Google
4. ✅ Dashboard shows your name
5. ✅ Start mock interview
6. ✅ LiveKit connection works

## 📚 Documentation

- **Quick Start**: [QUICKSTART-DEPLOY.md](./QUICKSTART-DEPLOY.md)
- **Full Guide**: [DEPLOYMENT.md](./DEPLOYMENT.md)
- **Setup Summary**: [VERCEL-SETUP-SUMMARY.md](./VERCEL-SETUP-SUMMARY.md)
- **Scripts**: [scripts/README.md](./scripts/README.md)

## 🔧 Troubleshooting

### Build Fails

```bash
# Test locally
npm run build
npm run typecheck
npm run lint
```

### Environment Variables Not Working

1. Check Vercel Dashboard → Settings → Environment Variables
2. Ensure `NEXT_PUBLIC_*` variables enabled for all environments
3. Redeploy: `vercel --prod`

### OAuth Issues

- Verify redirect URLs in Google Cloud Console
- Check Supabase Auth settings match deployment URL

### LiveKit Connection Fails

- Check `NEXT_PUBLIC_LIVEKIT_URL` is set
- Verify agents deployed: `lk agent status`

## 🎉 You're Ready!

Run this command to deploy:

```bash
./scripts/deploy.sh
```

**Need help?** Check the full deployment documentation or create an issue.

---

**Last Updated**: 2025-11-09
**Status**: Ready for production ✅
