# Inngest Debugging Checklist

The events are reaching Inngest Cloud, but functions aren't executing. Here's what to check:

## 1. Check Function Registration in Inngest Dashboard

Go to your Inngest dashboard → Functions tab

**Expected functions:**
- `feedback-generate` (Generate Interview Feedback)
- `insights-update` (Update User Insights)

**If functions are missing:**
- Inngest Cloud needs to sync from your `/api/inngest` endpoint
- Check if your deployment URL is registered in Inngest Cloud
- Verify the sync/app connection in Settings → Apps

## 2. Check Function Execution Logs

In Inngest dashboard → Functions → Select "feedback-generate"

Look for:
- ✅ Function runs (should show runs for recent events)
- ❌ Errors or failed runs
- ⚠️ No runs at all (means function not triggered)

## 3. Check Event-to-Function Matching

In Inngest dashboard → Events tab

For event `feedback/generate.requested`:
- Click on the event
- Check "Triggered Functions" section
- Should show `feedback-generate` function

**If no functions triggered:**
- Event name might not match function trigger
- Function might not be registered

## 4. Check App Sync Status

In Inngest dashboard → Settings → Apps

Find your app (should be listed with your deployment URL)

Check:
- Last sync time (should be recent)
- Sync status (should be "Connected")
- Function count (should show 2 functions)

**If not synced or shows 0 functions:**
- Click "Sync Now" or "Re-sync"
- Check webhook URL is correct: `https://yourdomain.com/api/inngest`
- Verify INNGEST_SIGNING_KEY is set correctly in your deployment

## 5. Common Issues

### Issue: Functions not discovered
**Solution:** 
1. Ensure `/api/inngest` route is deployed and accessible
2. Check deployment logs for errors
3. Manually trigger sync in Inngest dashboard

### Issue: Functions discovered but not executing
**Solution:**
1. Check function execution logs for errors
2. Verify database connection in production
3. Check if environment variables are set in deployment
4. Look for timeout or memory issues

### Issue: Event sent but no function triggered
**Solution:**
1. Verify event name exactly matches: `"feedback/generate.requested"`
2. Check function trigger configuration
3. Ensure function is enabled (not paused)

## 6. Quick Test

Test if functions are accessible:

```bash
# Check if endpoint is accessible (replace with your domain)
curl -X GET https://yourdomain.com/api/inngest

# Should return function discovery JSON
```

## 7. Local Testing Alternative

If Inngest Cloud isn't working, test locally:

```bash
# Terminal 1: Start Next.js
npm run dev

# Terminal 2: Start Inngest Dev Server  
npx inngest-cli@latest dev

# This will show you errors in real-time
```

## What to Check Next

Please check in your Inngest dashboard:
1. Do you see the functions listed? (Functions tab)
2. When you click on an event, does it show "Triggered Functions"?
3. Are there any error logs in the function execution history?

Share what you find and we can debug from there!
