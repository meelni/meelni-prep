# Inngest Setup for Development

## Problem

The feedback generation system was stuck in "pending" status because the Inngest worker had bugs:

1. Duplicate feedback record inserts (trying to INSERT when record already exists)
2. The `/api/interview/end` endpoint creates the initial feedback record
3. The Inngest worker should UPDATE, not INSERT

## Fixes Applied

- Changed all `db.insert(feedback).values()` to `db.update(feedback).set().where()` in `/lib/inngest/functions/generate-feedback.ts`
- Fixed 3 places: mark-skipped, create-pending-feedback (now update-feedback-processing), mark-failed-no-transcript

## How Inngest Works in Development

### Option 1: Inngest Cloud (Hosted environments)

1. Sign up at https://inngest.com
2. Get your signing key and event key
3. Add to `.env.local`:
   ```
   INNGEST_EVENT_KEY=your_event_key
   INNGEST_SIGNING_KEY=your_signing_key
   ```
4. Inngest Cloud syncs the `/api/inngest` endpoint. The endpoint currently
   registers 14 function IDs.

### Option 2: Inngest Dev Server (Local Development)

1. Start the full local stack:

   ```bash
   npm run dev:local
   ```

   This starts Next.js and the Inngest Dev Server together, with Inngest synced to the local `/api/inngest` route.

2. If you need to debug Inngest in isolation, run:

   ```bash
   npm run dev:inngest
   ```

3. The Inngest Dev Server will:
   - Discover functions at `http://localhost:3000/api/inngest`
   - Execute background jobs locally
   - Provide a UI at `http://localhost:8288`

## Testing Feedback Generation

### Manual Trigger for Stuck Feedback

If you have a stuck feedback record (status='pending'), use the fix script:

```bash
npx tsx scripts/fix-stuck-feedback.ts <sessionId>
```

**Note**: The script automatically loads environment variables from `.env.local`

This will:

1. Check if feedback exists
2. Re-send the Inngest event if status is 'pending'
3. Let the Inngest worker process it

### End-to-End Test

1. Complete an interview session (minimum 5 turns, 5 minutes)
2. Call POST /api/interview/end with sessionId
3. Check feedback status at GET /api/feedback/:sessionId
4. Status should progress: pending → processing → completed
5. View feedback at /feedback/:sessionId

## Troubleshooting

### "Rate limit exceeded" error

- The rate limiter in `/api/interview/end` allows 10 requests per minute per user
- Wait 60 seconds and try again

### Feedback stuck at "pending"

1. Check if Inngest Dev Server is running
2. Check Inngest logs at http://localhost:8288
3. Look for errors in Next.js console
4. Use the fix script: `npx tsx scripts/fix-stuck-feedback.ts <sessionId>`

### "Session already ended" error

- This is expected if you call /api/interview/end twice
- The endpoint is idempotent and will return the existing feedback status

## Environment Variables Required

```env
# Required for Inngest
INNGEST_EVENT_KEY=your_event_key
INNGEST_SIGNING_KEY=your_signing_key

# Required for GPT-4 evaluation
OPENAI_API_KEY=your_openai_key

# Required for database
DATABASE_URL=your_postgres_connection_string
```

## Production Deployment

1. Set up the Inngest Cloud account and environment-specific keys.
2. For Preview, set branch-scoped `INNGEST_ENV` to the exact
   `VERCEL_GIT_COMMIT_REF`. For Production, deploy `main` with no
   `INNGEST_ENV` branch override.
3. Add `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` to the matching Vercel
   scope, then redeploy.
4. Confirm all 14 function IDs sync from `/api/inngest` and run an approved
   synthetic event. Configuration health alone does not prove cloud reachability.
