# Google Sheets Sync Cron Job - Setup Guide

This guide explains how to set up the automated weekly sync of interview questions from Google Sheets to the database using Vercel Cron.

---

## Table of Contents
1. [Overview](#overview)
2. [Google Sheets Setup](#google-sheets-setup)
3. [Service Account Setup](#service-account-setup)
4. [Vercel Configuration](#vercel-configuration)
5. [Testing](#testing)
6. [Monitoring](#monitoring)
7. [Troubleshooting](#troubleshooting)

---

## Overview

### What It Does
- **Automatically syncs** interview questions from a Google Sheet to the database
- **Runs weekly** every Monday at 9:00 AM UTC
- **Adds new questions**, **updates existing ones**, and **deactivates removed questions**
- **Fully automated** via Vercel Cron (no manual intervention needed)

### Architecture
```
Google Sheet → Vercel Cron (Monday 9am UTC) → API Route → Sync Script → Database
```

### Files Created
- `/scripts/sync-questions-from-sheet.ts` - Main sync logic
- `/app/api/cron/sync-questions/route.ts` - Cron endpoint (automated)
- `/app/api/cron/sync-questions/manual/route.ts` - Manual trigger (testing)
- `/vercel.json` - Cron schedule configuration
- `/docs/google-sheets-cron-setup.md` - This file

---

## Google Sheets Setup

### Step 1: Create Your Questions Sheet

Create a Google Sheet with the following structure:

| Column | Header | Type | Required | Example |
|--------|--------|------|----------|---------|
| A | Company | text | No | Meta |
| B | Question Text | text | **Yes** | How would you improve Facebook Marketplace? |
| C | Question Type | enum | **Yes** | Product Sense |
| D | Difficulty | enum | No | Medium |
| E | Is Active | boolean | No | TRUE |

**Valid Question Types:**
- `A/B Testing`
- `Product design/strategy`
- `Behavioral`
- `Execution`
- `Product Sense`
- `Pricing`
- `Estimation`
- `Product Strategy`

**Valid Difficulties:**
- `Easy`
- `Medium`
- `Hard`

**Example Sheet:**
```
| Company | Question Text                                  | Question Type          | Difficulty | Is Active |
|---------|-----------------------------------------------|------------------------|------------|-----------|
| Meta    | How would you improve Facebook Marketplace?   | Product Sense          | Medium     | TRUE      |
| Google  | Design a product for language learners        | Product design/strategy| Medium     | TRUE      |
| Amazon  | How would you measure success of Prime?       | Product Sense          | Hard       | TRUE      |
```

### Step 2: Get Your Sheet ID

Your Google Sheet URL looks like:
```
https://docs.google.com/spreadsheets/d/1abc123def456ghi789/edit
                                      ^^^^^^^^^^^^^^^^
                                      This is your Sheet ID
```

Copy the Sheet ID (the part between `/d/` and `/edit`).

---

## Service Account Setup

You need a Google Cloud service account to access the sheet programmatically.

### Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Name it something like `meelni-sheets-sync`

### Step 2: Enable Google Sheets API

1. In your project, go to **APIs & Services** > **Library**
2. Search for "Google Sheets API"
3. Click **Enable**

### Step 3: Create Service Account

1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **Service Account**
3. Name: `meelni-sheets-reader`
4. Description: `Read-only access to interview questions sheet`
5. Click **Create and Continue**
6. Role: Select **Viewer** (read-only)
7. Click **Done**

### Step 4: Generate Service Account Key

1. Click on the service account you just created
2. Go to **Keys** tab
3. Click **Add Key** > **Create new key**
4. Choose **JSON** format
5. Click **Create** - a JSON file will download

The downloaded file looks like:
```json
{
  "type": "service_account",
  "project_id": "meelni-sheets-sync",
  "private_key_id": "abc123...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...",
  "client_email": "meelni-sheets-reader@meelni-sheets-sync.iam.gserviceaccount.com",
  "client_id": "123456789...",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  ...
}
```

### Step 5: Share Sheet with Service Account

1. Open your Google Sheet
2. Click **Share** button
3. Copy the `client_email` from the JSON file (e.g., `meelni-sheets-reader@...iam.gserviceaccount.com`)
4. Paste it in the share dialog
5. Set permission to **Viewer**
6. **Uncheck** "Notify people"
7. Click **Share**

---

## Vercel Configuration

### Step 1: Set Environment Variables

Add these environment variables in your Vercel project:

1. Go to **Vercel Dashboard** > Your Project > **Settings** > **Environment Variables**

2. Add the following variables:

#### CRON_SECRET
- **Name**: `CRON_SECRET`
- **Value**: Generate a random secret
  ```bash
  openssl rand -base64 32
  ```
- **Environment**: Production, Preview, Development
- **Purpose**: Verifies cron requests are from Vercel (security)

#### GOOGLE_SHEETS_CREDENTIALS
- **Name**: `GOOGLE_SHEETS_CREDENTIALS`
- **Value**: Paste the entire JSON content from the service account key file
  ```json
  {"type":"service_account","project_id":"...","private_key":"..."}
  ```
- **Environment**: Production, Preview, Development
- **Purpose**: Authenticates with Google Sheets API

#### GOOGLE_SHEET_ID
- **Name**: `GOOGLE_SHEET_ID`
- **Value**: Your Sheet ID from Step 2 of Google Sheets Setup
  ```
  1abc123def456ghi789
  ```
- **Environment**: Production, Preview, Development
- **Purpose**: Identifies which sheet to sync from

#### GOOGLE_SHEET_NAME (Optional)
- **Name**: `GOOGLE_SHEET_NAME`
- **Value**: Name of the tab in your sheet (default: `Questions`)
  ```
  Questions
  ```
- **Environment**: Production, Preview, Development
- **Purpose**: Specifies which tab/sheet to read from

### Step 2: Deploy to Vercel

The cron job is configured in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/sync-questions",
      "schedule": "0 9 * * 1"
    }
  ]
}
```

**Schedule Format**: Cron expression `0 9 * * 1`
- `0` - Minute (0)
- `9` - Hour (9 AM UTC)
- `*` - Day of month (any)
- `*` - Month (any)
- `1` - Day of week (1 = Monday)

**Result**: Runs every Monday at 9:00 AM UTC.

### Step 3: Verify Deployment

After deployment, check:

1. **Vercel Dashboard** > Your Project > **Cron Jobs**
   - You should see `/api/cron/sync-questions` listed
   - Schedule: `0 9 * * 1`
   - Status: Active

2. **Vercel Logs**
   - The first run will happen on the next Monday at 9 AM UTC
   - Or you can trigger manually (see Testing section)

---

## Testing

### Method 1: Manual Trigger (Recommended for Testing)

Use the manual endpoint to test without waiting for Monday:

```bash
# From your terminal (requires authentication)
curl -X POST https://your-app.vercel.app/api/cron/sync-questions/manual \
  -H "Cookie: sb-access-token=YOUR_SESSION_TOKEN"
```

**To get your session token:**
1. Open your app in browser
2. Sign in
3. Open DevTools > Application > Cookies
4. Copy the `sb-access-token` value

**Expected Response:**
```json
{
  "success": true,
  "questionsAdded": 5,
  "questionsUpdated": 0,
  "questionsDeactivated": 2,
  "totalProcessed": 20,
  "errors": [],
  "syncDuration": "2.34s",
  "triggeredBy": "manual",
  "triggeredByUser": "user@example.com",
  "triggeredAt": "2025-01-07T12:34:56.789Z",
  "timestamp": "2025-01-07T12:34:56.789Z"
}
```

### Method 2: Trigger Cron Directly (Local Testing)

To test the cron endpoint locally:

```bash
# Set CRON_SECRET in your .env.local
echo "CRON_SECRET=test-secret-123" >> .env.local

# Start your dev server
npm run dev

# Trigger the cron endpoint
curl http://localhost:3000/api/cron/sync-questions \
  -H "Authorization: Bearer test-secret-123"
```

### Method 3: Wait for Scheduled Run

The cron will automatically run every Monday at 9 AM UTC. Check Vercel logs to see the results.

---

## Monitoring

### Vercel Dashboard

1. Go to **Vercel Dashboard** > Your Project > **Deployments**
2. Click on the latest deployment
3. Go to **Functions** tab
4. Look for `/api/cron/sync-questions`
5. Click to see execution logs

### Logs to Look For

**Success:**
```
🔄 Starting Google Sheets sync...
📋 Sheet ID: 1abc123def456
📄 Sheet Name: Questions
✅ Fetched 25 valid questions from sheet
💾 Syncing to database...
✨ Sync complete!
   Added: 5
   Updated: 0
   Deactivated: 2
   Duration: 2.14s
```

**Errors:**
```
❌ Sync failed: GoogleJsonResponseException: The caller does not have permission
```

### Email Notifications (Optional)

You can set up email notifications for cron failures:

1. Create a new file `/app/api/cron/notify-failure/route.ts`
2. Use [Resend](https://resend.com/) or similar to send emails
3. Call this endpoint from the sync route on failure

---

## Troubleshooting

### Error: "Unauthorized: Invalid cron secret"

**Cause**: `CRON_SECRET` environment variable doesn't match.

**Fix:**
1. Check Vercel environment variables
2. Ensure `CRON_SECRET` is set in Production environment
3. Redeploy to pick up new environment variables

### Error: "The caller does not have permission"

**Cause**: Service account doesn't have access to the sheet.

**Fix:**
1. Open your Google Sheet
2. Click Share
3. Add the service account email: `meelni-sheets-reader@...iam.gserviceaccount.com`
4. Set permission to **Viewer**
5. Save and try again

### Error: "Failed to parse GOOGLE_SHEETS_CREDENTIALS JSON"

**Cause**: JSON is malformed or escaped incorrectly.

**Fix:**
1. In Vercel, edit `GOOGLE_SHEETS_CREDENTIALS`
2. Paste the **raw JSON** (no extra quotes or escaping)
3. Should look like: `{"type":"service_account",...}`
4. Save and redeploy

### Error: "GOOGLE_SHEET_ID environment variable not set"

**Cause**: Missing sheet ID in environment variables.

**Fix:**
1. Go to Vercel Dashboard > Settings > Environment Variables
2. Add `GOOGLE_SHEET_ID` with your sheet ID
3. Redeploy

### Error: "Sheet not found"

**Cause**: Sheet ID is wrong or sheet name doesn't match.

**Fix:**
1. Verify your Sheet ID from the URL
2. Check `GOOGLE_SHEET_NAME` matches the tab name (default: `Questions`)
3. Ensure the sheet isn't deleted or moved

### Cron Job Not Running

**Cause**: Vercel Free/Hobby tier limits.

**Fix:**
- **Free tier**: 1 cron job only
- **Hobby tier**: Up to 2 cron jobs
- **Pro tier**: Unlimited
- Check your plan and existing crons in Vercel Dashboard

### Timeout Errors (10-second limit)

**Cause**: Sync takes too long on Hobby tier (10s timeout).

**Fix:**
- Reduce number of questions in sheet
- Upgrade to Pro tier (300s timeout)
- Optimize sync script (batch operations)

---

## Advanced Configuration

### Change Schedule

Edit `vercel.json` to change the schedule:

```json
{
  "crons": [
    {
      "path": "/api/cron/sync-questions",
      "schedule": "0 */6 * * *"  // Every 6 hours
    }
  ]
}
```

**Common Schedules:**
- `0 9 * * 1` - Every Monday at 9 AM UTC (default)
- `0 0 * * *` - Daily at midnight UTC
- `0 */6 * * *` - Every 6 hours
- `0 9 * * 1-5` - Weekdays at 9 AM UTC
- `0 0 1 * *` - First day of every month at midnight UTC

### Add Slack Notifications

To get notified when sync completes:

1. Create a Slack webhook URL
2. Add `SLACK_WEBHOOK_URL` to Vercel env vars
3. Update `/app/api/cron/sync-questions/route.ts`:

```typescript
// After sync completes
if (result.success) {
  await fetch(process.env.SLACK_WEBHOOK_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `✅ Questions synced: ${result.questionsAdded} added, ${result.questionsUpdated} updated, ${result.questionsDeactivated} deactivated`
    })
  });
}
```

---

## Security Best Practices

1. **Never commit credentials to Git**
   - Service account JSON should only be in Vercel env vars
   - `.env.local` is in `.gitignore`

2. **Use read-only permissions**
   - Service account should have **Viewer** role only
   - Never give write access to the sheet

3. **Rotate CRON_SECRET regularly**
   - Change the secret every few months
   - Update in Vercel and redeploy

4. **Monitor logs for suspicious activity**
   - Check Vercel logs weekly
   - Set up alerts for failures

5. **Add admin role check** (Future enhancement)
   - Currently any authenticated user can trigger manual sync
   - Add role-based access control when RBAC is implemented

---

## FAQ

**Q: Can I sync more than once a week?**
A: Yes! Edit the schedule in `vercel.json`. See [Change Schedule](#change-schedule).

**Q: What happens if the sheet has errors?**
A: The sync logs validation errors but continues processing valid rows. Check logs for details.

**Q: Can I sync from multiple sheets?**
A: Not currently. You'd need to create separate cron jobs for each sheet.

**Q: How do I know if sync succeeded?**
A: Check Vercel logs or set up [Slack notifications](#add-slack-notifications).

**Q: What if I delete a question from the sheet?**
A: It will be **deactivated** in the database (not deleted). Set `is_active = false`.

**Q: Can I manually sync before Monday?**
A: Yes! Use the [Manual Trigger endpoint](#method-1-manual-trigger-recommended-for-testing).

**Q: What's the cost?**
- Google Sheets API: Free (60 read requests/minute)
- Vercel Cron: Free on Hobby tier (1 cron job)
- Database operations: Included in Supabase free tier

---

## Support

If you encounter issues not covered here:

1. Check Vercel logs for error messages
2. Review the [Troubleshooting](#troubleshooting) section
3. Test locally using Method 2 in [Testing](#testing)
4. Contact your team's technical lead

---

**Last Updated**: January 7, 2025
**Version**: 1.0
