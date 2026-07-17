# TROUBLESHOOTING.md: Common Issues & Solutions

**Last Updated**: 2025-11-06
**Status**: Placeholder (to be populated as issues arise)

## Purpose

Quick reference for debugging common issues.

## LiveKit Issues

### Agent Not Joining Room

**Symptoms**: User enters interview page, but agent never connects
**Common Causes**:

- Agent worker not running (`python agent.py dev`)
- Incorrect LIVEKIT_URL or API credentials
- Agent dispatch issues (check agent_name configuration)

**Solutions**:

1. Check agent logs: `lk agent logs` (for Cloud) or local terminal output
2. Verify environment variables in `.env`
3. Restart agent worker
4. For Cloud agents: Verify dispatch with `lk agent status`

### Audio Not Working

**Symptoms**: User can't hear agent or agent can't hear user
**Common Causes**:

- Browser permissions (microphone blocked)
- LiveKit token missing audio permissions
- VAD (Voice Activity Detection) issues

**Solutions**:

1. Check browser console for permission errors
2. Verify token generation includes audio: `RoomServiceClient.createToken()`
3. Test with different browser (Chrome recommended)

## Authentication Issues

### OAuth Redirect Loop

**Symptoms**: User stuck redirecting between `/auth/signin` and `/auth/callback`
**Common Causes**:

- Supabase redirect URL misconfigured
- Cookie issues (third-party cookies blocked)

**Solutions**:

1. Verify Supabase OAuth redirect URL: `{your-domain}/auth/callback`
2. Check browser console for cookie errors
3. Test in incognito mode to rule out extension conflicts

### Middleware Not Protecting Routes

**Symptoms**: Unauthenticated users can access `/dashboard`
**Common Causes**:

- Middleware config incorrect
- Supabase session not being read correctly

**Solutions**:

1. Check `middleware.ts` matcher config
2. Verify `createClient()` in middleware (not `createServerClient()`)
3. Check if session cookies are being set

## Database Issues

### Connection Refused

**Symptoms**: `ECONNREFUSED` or `connection timeout` errors
**Common Causes**:

- DATABASE_URL incorrect
- Supabase project paused (free tier inactivity)

**Solutions**:

1. Verify DATABASE_URL in `.env.local`
2. Check Supabase project status in dashboard
3. Run the read-only environment/database preflight; never use a schema push as a connection test.

---

**For comprehensive issues, see**: CLAUDE.md "Known Issues & Technical Debt" section
