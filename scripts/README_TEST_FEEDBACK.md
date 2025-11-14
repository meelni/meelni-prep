# Test Feedback Generation Script

Quick way to test the feedback generation flow without doing a real 8-minute interview!

## Prerequisites

1. **Inngest Dev Server must be running**
   ```bash
   npx inngest-cli@latest dev
   ```

2. **Next.js dev server must be running**
   ```bash
   npm run dev
   ```

3. **You must have at least one user in the database** (sign up first if needed)

## Usage

```bash
npm run test:feedback
```

## What It Does

1. ✅ Finds a test user from your database
2. ✅ Creates a fake interview session (product sense interview)
3. ✅ Inserts realistic transcript data (13 turns, ~15 minutes)
4. ✅ Marks session as completed
5. ✅ Creates pending feedback record
6. ✅ Triggers Inngest event: `feedback/generate.requested`

## What to Watch For

### In Inngest Dev Server Terminal:
```
✓ [feedback-generate] Received event feedback/generate.requested
  → Step: validate-session
  → Step: fetch-session-data
  → Step: fetch-transcript
  → Step: evaluate-session (this takes ~20-30s with GPT-4)
  → Step: save-feedback
  → Step: trigger-insights-update
✓ [feedback-generate] Completed

✓ [insights-update] Received event insights/update.requested
  → Step: calculate-insights
  → Step: upsert-insights
✓ [insights-update] Completed
```

### In Your Browser:
- Visit: http://localhost:8288 (Inngest UI)
- See the function execution in real-time
- View step-by-step progress

### Check Results:
The script will output a session ID. Use it to check feedback:

```bash
# Via API
curl http://localhost:3000/api/feedback/{SESSION_ID}

# Via browser
http://localhost:3000/feedback/{SESSION_ID}
```

## Sample Output

```
🧪 Testing Feedback Generation Flow

1️⃣  Finding test user...
✅ Using user: e248be8c-a24e-49b1-9ddf-be99022676a1

2️⃣  Creating fake interview session...
✅ Session created: bb75d304-7e56-450b-9b4e-93c2222c073e

3️⃣  Inserting transcript turns...
✅ Inserted 13 transcript turns

4️⃣  Ending session...
✅ Session ended

5️⃣  Creating pending feedback record...
✅ Feedback record created: f1234567-89ab-cdef-0123-456789abcdef

6️⃣  Triggering feedback generation event...
✅ Event sent to Inngest!

🎉 Test Complete!

Next steps:
1. Check Inngest Dev Server (http://localhost:8288) for function execution
2. Watch the terminal for logs
3. Check feedback status: GET /api/feedback/bb75d304-7e56-450b-9b4e-93c2222c073e
4. View feedback page: http://localhost:3000/feedback/bb75d304-7e56-450b-9b4e-93c2222c073e

Session ID: bb75d304-7e56-450b-9b4e-93c2222c073e
```

## Troubleshooting

### "No users found in database"
- Sign up at http://localhost:3000/auth/signup first

### "Connection timeout"
- Check DATABASE_URL in .env.local
- Ensure Supabase database is accessible

### Event sent but nothing happens
- Is Inngest Dev Server running? Check http://localhost:8288
- Check Next.js terminal for errors
- Verify functions are registered at http://localhost:3000/api/inngest

### GPT-4 evaluation fails
- Check OPENAI_API_KEY in .env.local
- Verify API key has credits

## The Fake Transcript

The script uses a realistic product sense interview about improving Google Maps for tourists. It includes:
- Clarifying questions
- Pain point identification
- Prioritization with reasoning
- Solution design
- Success metrics
- Risk considerations

Perfect for testing the rubric evaluation!
