# Quick Start: Deploy to Vercel

This is the **fastest path** to get Meelni running in production on Vercel.

## 5-Minute Deployment

### Step 1: Install Vercel CLI (if not installed)

```bash
npm install -g vercel
```

### Step 2: Login to Vercel

```bash
vercel login
```

### Step 3: Deploy!

```bash
# From project root
./scripts/deploy.sh
```

That's it! The script will:
- ✅ Run build checks
- ✅ Validate TypeScript
- ✅ Run linter
- ✅ Deploy to Vercel production

## After First Deployment

### Configure Environment Variables

Visit your Vercel project dashboard and add these environment variables:

#### Required Variables

| Variable | Value | Notes |
|----------|-------|-------|
| `DATABASE_URL` | `postgresql://...` | Supabase connection string |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://...supabase.co` | Public Supabase URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJ...` | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ...` | Secret service key |
| `LIVEKIT_API_KEY` | `API...` | LiveKit API key |
| `LIVEKIT_API_SECRET` | `...` | LiveKit secret |
| `NEXT_PUBLIC_LIVEKIT_URL` | `wss://...livekit.cloud` | LiveKit WebSocket URL |
| `LIVEKIT_URL` | `wss://...livekit.cloud` | Same as above |
| `OPENAI_API_KEY` | `sk-proj-...` | OpenAI API key |
| `INNGEST_EVENT_KEY` | `...` | Inngest event key |
| `INNGEST_SIGNING_KEY` | `signkey-prod-...` | Inngest signing key |
| `GOOGLE_SHEETS_API_KEY` | `AIza...` | Google API key |
| `GOOGLE_SHEET_ID` | `1rz10o...` | Sheet ID |
| `GOOGLE_SHEET_NAME` | `Form Responses 1` | Sheet name |

**Important**: Check "Production", "Preview", and "Development" for all `NEXT_PUBLIC_*` variables.

### Update OAuth Redirect URLs

1. **Google Cloud Console**:
   - Go to APIs & Services → Credentials
   - Edit OAuth 2.0 Client
   - Add: `https://your-vercel-url.vercel.app/auth/callback`

2. **Supabase Dashboard**:
   - Go to Authentication → URL Configuration
   - Site URL: `https://your-vercel-url.vercel.app`
   - Redirect URLs: `https://your-vercel-url.vercel.app/**`

### Redeploy with Environment Variables

```bash
vercel --prod
```

## Verify Deployment

Test these features:

1. ✅ Landing page loads
2. ✅ Demo modal works (talk to AI)
3. ✅ Sign in with Google
4. ✅ Dashboard shows your name
5. ✅ Start mock interview

## Manual Deployment (Alternative)

If you prefer manual steps:

```bash
# 1. Login
vercel login

# 2. Link project
vercel link

# 3. Add environment variables via dashboard
# Visit: https://vercel.com/dashboard → Your Project → Settings → Environment Variables

# 4. Deploy
vercel --prod
```

## Troubleshooting

### Build fails
```bash
# Test locally first
npm run build
npm run typecheck
```

### OAuth doesn't work
- Check redirect URLs in Google Console
- Verify Supabase Auth settings
- Ensure environment variables are set

### LiveKit connection fails
- Verify `NEXT_PUBLIC_LIVEKIT_URL` is set
- Check LiveKit agent status: `lk agent status`

## Next Steps

- [ ] Set up custom domain
- [ ] Enable Vercel Analytics
- [ ] Configure monitoring
- [ ] Test mobile experience

## Full Documentation

For detailed instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md)

---

**Need help?** Check the full deployment guide or create an issue in the repository.
