# Google Sheets Cron Sync Re-Enabled

**Date**: November 22, 2025
**Status**: ✅ Enabled and Ready for Deployment

## Summary

The Google Sheets question sync cron job has been re-enabled after being temporarily disabled. Both the automated weekly cron endpoint and manual sync endpoint are now fully functional.

## Changes Made

### 1. Updated Sync Script (`scripts/sync-questions-from-sheet.ts`)

**Problem**: The `syncQuestions()` function returned `void`, but the API endpoints needed a result object for proper HTTP responses.

**Solution**: Modified the function to return a `SyncResult` object:

```typescript
export interface SyncResult {
  success: boolean;
  questionsAdded: number;
  questionsUpdated: number;
  questionsDeactivated: number;
  questionsSkipped: number;
  totalProcessed: number;
  errors: number;
  errorMessages?: string[];
  timestamp: string;
}
```

**Key Changes**:
- Changed return type from `Promise<void>` to `Promise<SyncResult>`
- Collect error messages in `errorMessages` array
- Return detailed result object on both success and failure
- Updated `applyChanges()` to track error messages
- Properly handle errors without calling `process.exit(1)` (needed for API calls)

### 2. Re-enabled Cron Endpoint (`app/api/cron/sync-questions/route.ts`)

**Before**: Returned 501 error with "TEMPORARILY DISABLED" message

**After**: Fully functional endpoint that:
- Verifies cron secret for security (`CRON_SECRET` env var)
- Calls `syncQuestions()` with proper options
- Returns detailed JSON response with sync results
- Logs to console for Vercel monitoring
- Has 5-minute timeout (`maxDuration = 300`)

**Response Format**:
```json
{
  "success": true,
  "questionsAdded": 5,
  "questionsUpdated": 0,
  "questionsDeactivated": 2,
  "questionsSkipped": 0,
  "totalProcessed": 2879,
  "errors": 0,
  "timestamp": "2025-11-22T18:00:00.000Z",
  "triggeredBy": "cron",
  "triggeredAt": "2025-11-22T18:00:00.000Z"
}
```

### 3. Re-enabled Manual Sync Endpoint (`app/api/cron/sync-questions/manual/route.ts`)

**Before**: Returned 501 error with "Use CLI script" message

**After**: Fully functional endpoint that:
- Requires Supabase authentication (valid user session)
- Accepts optional `dryRun` and `verbose` flags in request body
- Calls `syncQuestions()` with user-specified options
- Returns detailed JSON response with user email
- Has 5-minute timeout (`maxDuration = 300`)

**Usage**:
```bash
curl -X POST https://your-app.vercel.app/api/cron/sync-questions/manual \
  -H "Content-Type: application/json" \
  -H "Cookie: sb-access-token=YOUR_SESSION_TOKEN" \
  -d '{"dryRun": false, "verbose": true}'
```

**Response Format**:
```json
{
  "success": true,
  "questionsAdded": 5,
  "questionsUpdated": 0,
  "questionsDeactivated": 2,
  "questionsSkipped": 0,
  "totalProcessed": 2879,
  "errors": 0,
  "timestamp": "2025-11-22T18:00:00.000Z",
  "triggeredBy": "manual",
  "triggeredByUser": "user@example.com",
  "triggeredAt": "2025-11-22T18:00:00.000Z"
}
```

## Deployment Checklist

Before deploying to production, ensure these environment variables are set in Vercel:

### Required Variables (Already Set)
- ✅ `GOOGLE_SHEET_CSV_URL` or (`GOOGLE_SHEETS_API_KEY` + `GOOGLE_SHEET_ID`)
- ✅ `DATABASE_URL` (Supabase connection string)
- ✅ `NEXT_PUBLIC_SUPABASE_URL`
- ✅ `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### New Variable Needed
- ⚠️ `CRON_SECRET` - Generate a secure random string for cron security

**Generate CRON_SECRET**:
```bash
openssl rand -base64 32
```

Then add it to Vercel:
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add `CRON_SECRET` with the generated value
3. Set for Production, Preview, and Development environments

## Testing

### 1. Test Build
✅ **Passed** - Build completed successfully with no TypeScript errors

### 2. Test Cron Endpoint (After Deployment)
```bash
# Test with Vercel cron secret
curl https://your-app.vercel.app/api/cron/sync-questions \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

### 3. Test Manual Endpoint (After Deployment)
```bash
# Requires authentication
curl -X POST https://your-app.vercel.app/api/cron/sync-questions/manual \
  -H "Cookie: sb-access-token=YOUR_SESSION_TOKEN"
```

### 4. Test CLI Script (Local - Already Works)
```bash
npm run sync:questions
```

## Schedule

The cron job is configured to run:
- **Frequency**: Weekly
- **Day**: Every Monday
- **Time**: 9:00 AM UTC
- **Cron Expression**: `0 9 * * 1`
- **Configured In**: `vercel.json`

## Monitoring

After deployment, monitor the cron job:

1. **Vercel Dashboard**:
   - Go to your project → Deployments → Click latest deployment
   - Go to Functions tab → Look for `/api/cron/sync-questions`
   - View execution logs

2. **Vercel Logs**:
   - Check for "🔄 Cron job triggered" messages
   - Look for "✅ Cron sync complete" success messages
   - Watch for any error messages

3. **Database**:
   - Check question count: `SELECT COUNT(*) FROM interview_question WHERE is_active = true;`
   - Check most recent question date: `SELECT MAX(asked_at) FROM interview_question;`

## Rollback Plan

If issues occur after deployment:

1. **Immediate**: Disable cron in `vercel.json` and redeploy:
   ```json
   {
     "crons": []
   }
   ```

2. **Fallback**: Use CLI script for manual syncs:
   ```bash
   npm run sync:questions
   ```

## Security Notes

- ✅ Cron endpoint protected by `CRON_SECRET` environment variable
- ✅ Manual endpoint requires Supabase authentication
- ⚠️ Manual endpoint currently allows ANY authenticated user to trigger sync
- 📝 TODO: Add admin role check when RBAC is implemented

## Next Steps

1. Deploy this code to Vercel
2. Add `CRON_SECRET` environment variable to Vercel
3. Wait for next Monday 9 AM UTC or trigger manual sync to test
4. Monitor Vercel logs for successful execution
5. Verify questions are updated in database

---

**Last Updated**: November 22, 2025
**Author**: Claude (AI Assistant)
