# Quick Fix Guide for Stuck Feedback

## Your Stuck Session
Session ID: `2308e467-efc9-474a-992e-a923249c50d7`

## Step-by-Step Fix

### 1. Start Inngest Dev Server (Terminal 1)
```bash
npx inngest-cli dev
```

You should see:
```
Inngest dev server running at: http://localhost:8288
```

Keep this terminal running!

### 2. Start Next.js Dev Server (Terminal 2)
```bash
npm run dev
```

Keep this terminal running too!

### 3. Run the Fix Script (Terminal 3)
```bash
npx tsx scripts/fix-stuck-feedback.ts 2308e467-efc9-474a-992e-a923249c50d7
```

Expected output:
```
Fixing stuck feedback for session: 2308e467-efc9-474a-992e-a923249c50d7
Current status: pending
Retrying Inngest event...
✓ Inngest event sent successfully
Done
```

### 4. Monitor Progress

Watch the Inngest Dev Server UI at http://localhost:8288
- You should see a new job appear
- It will go through stages: pending → processing → completed
- Takes about 30-60 seconds

### 5. Refresh Your Feedback Page

Go to: http://localhost:3000/feedback/2308e467-efc9-474a-992e-a923249c50d7

The page should now load with your AI-generated feedback!

## If Something Goes Wrong

### Error: "DATABASE_URL environment variable is not set"
- Check that `.env.local` exists and has `DATABASE_URL`
- The script should auto-load it, but verify the file is there

### Error: "No feedback record found"
- The session might not exist in the database
- Check the session ID is correct

### Feedback still stuck at "pending"
1. Check Inngest Dev Server logs at http://localhost:8288
2. Look for errors in the Next.js console
3. Check if the Inngest Dev Server is actually running
4. Try the script again

### Script says "Feedback status is X, no action needed"
- The feedback is not in pending state
- Check what status it actually is
- If "completed", just refresh the feedback page
- If "failed", check the error logs

## After Fixing

For future sessions, just make sure both servers are running:
1. Inngest Dev Server: `npx inngest-cli dev`
2. Next.js Dev Server: `npm run dev`

Then feedback will generate automatically when interviews end!
