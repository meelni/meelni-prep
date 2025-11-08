# Vercel Cron Jobs - Quick Reference

Quick commands and troubleshooting for the Google Sheets sync cron job.

---

## 🚀 Quick Start

### Local Testing
```bash
# Set up environment
cp .env.example .env.local
# Edit .env.local with your credentials

# Test sync locally
npm run sync:questions

# Test with dry run (preview changes)
npm run sync:questions -- --dry-run

# Test with verbose logging
npm run sync:questions -- --verbose
```

### Production Testing
```bash
# Manual trigger (requires authentication)
curl -X POST https://your-app.vercel.app/api/cron/sync-questions/manual \
  -H "Cookie: sb-access-token=YOUR_SESSION_TOKEN"
```

---

## 📋 Required Environment Variables

### Vercel Production (Required)
```bash
CRON_SECRET=<generate-with-openssl-rand-base64-32>
GOOGLE_SHEETS_CREDENTIALS={"type":"service_account",...}
GOOGLE_SHEET_ID=1abc123def456ghi789
GOOGLE_SHEET_NAME=Questions  # Optional, defaults to "Questions"
```

### Local Development (.env.local)
```bash
# Copy from Vercel environment variables
CRON_SECRET=test-secret-123
GOOGLE_SHEETS_CREDENTIALS={"type":"service_account",...}
GOOGLE_SHEET_ID=1abc123def456ghi789
GOOGLE_SHEET_NAME=Questions
```

---

## ⏰ Cron Schedule

**Current Schedule**: Every Monday at 9:00 AM UTC

**Cron Expression**: `0 9 * * 1`

**Configuration File**: `vercel.json`

### Change Schedule
Edit `vercel.json`:
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

**Common Schedules**:
- `0 9 * * 1` - Every Monday at 9 AM UTC (current)
- `0 0 * * *` - Daily at midnight UTC
- `0 */6 * * *` - Every 6 hours
- `0 9 * * 1-5` - Weekdays at 9 AM UTC
- `0 0 1 * *` - First day of month at midnight UTC

---

## 🔍 Monitoring

### View Logs in Vercel
1. Go to **Vercel Dashboard** > Your Project
2. Click **Deployments** > Latest deployment
3. Click **Functions** tab
4. Find `/api/cron/sync-questions`
5. Click to view logs

### Success Log Pattern
```
🔔 Cron job triggered
✅ Authorization verified. Starting sync...
🔄 Starting Google Sheets sync...
📋 Sheet ID: 1abc123def456
✅ Fetched 25 valid questions from sheet
💾 Syncing to database...
✨ Sync complete!
   Added: 5
   Updated: 0
   Deactivated: 2
   Duration: 2.14s
```

### Check Last Sync Status
```bash
# Manual endpoint shows status
curl https://your-app.vercel.app/api/cron/sync-questions/manual
```

---

## 🛠️ Troubleshooting

### Common Errors & Fixes

#### "Unauthorized: Invalid cron secret"
```bash
# Fix: Verify CRON_SECRET in Vercel
# 1. Check Vercel env vars
# 2. Ensure it's set for Production
# 3. Redeploy
```

#### "The caller does not have permission"
```bash
# Fix: Share sheet with service account
# 1. Open Google Sheet
# 2. Click Share
# 3. Add: meelni-sheets-reader@...iam.gserviceaccount.com
# 4. Set permission: Viewer
# 5. Save
```

#### "Failed to parse GOOGLE_SHEETS_CREDENTIALS JSON"
```bash
# Fix: Paste raw JSON in Vercel
# Should look like: {"type":"service_account",...}
# No extra quotes or escaping
```

#### "GOOGLE_SHEET_ID environment variable not set"
```bash
# Fix: Add to Vercel env vars
# Get Sheet ID from URL:
# https://docs.google.com/spreadsheets/d/SHEET_ID_HERE/edit
```

#### Cron job not running
```bash
# Vercel tier limits:
# - Free: 1 cron job
# - Hobby: 2 cron jobs
# - Pro: Unlimited

# Check your crons:
# Vercel Dashboard > Project > Cron Jobs
```

#### Timeout (10-second limit on Hobby)
```bash
# Fix options:
# 1. Reduce number of questions
# 2. Upgrade to Pro (300s timeout)
# 3. Optimize sync (batch operations)
```

---

## 📁 File Structure

```
/
├── vercel.json                                   # Cron configuration
├── scripts/
│   └── sync-questions-from-sheet.ts             # Main sync logic
├── app/api/cron/sync-questions/
│   ├── route.ts                                  # Automated cron endpoint
│   └── manual/
│       └── route.ts                              # Manual trigger endpoint
├── docs/
│   ├── google-sheets-cron-setup.md              # Full setup guide
│   └── cron-jobs-quick-reference.md             # This file
└── .env.example                                  # Environment template
```

---

## 🔐 Security Checklist

- [ ] `CRON_SECRET` set in Vercel Production env
- [ ] Service account has **Viewer** role only (not Editor)
- [ ] `GOOGLE_SHEETS_CREDENTIALS` not committed to Git
- [ ] Sheet shared with service account email
- [ ] `.env.local` in `.gitignore`
- [ ] Manual endpoint requires authentication

---

## 📞 Support

**Documentation**: See `/docs/google-sheets-cron-setup.md` for full setup guide

**Test Locally**:
```bash
npm run sync:questions -- --dry-run --verbose
```

**Test Production**:
```bash
curl -X POST https://your-app.vercel.app/api/cron/sync-questions/manual \
  -H "Cookie: sb-access-token=..."
```

**Check Logs**: Vercel Dashboard > Deployments > Functions > `/api/cron/sync-questions`

---

**Last Updated**: January 7, 2025
