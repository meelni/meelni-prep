# ✅ Vercel Cron Job Setup Complete

Your weekly Google Sheets sync is now configured! Here's what was created:

---

## 📦 Files Created

### Core Functionality
- ✅ `/scripts/sync-questions-from-sheet.ts` - Main sync logic (refactored to use CSV method)
- ✅ `/app/api/cron/sync-questions/route.ts` - Automated cron endpoint (Vercel)
- ✅ `/app/api/cron/sync-questions/manual/route.ts` - Manual trigger endpoint (testing)
- ✅ `/vercel.json` - Cron schedule configuration

### Configuration
- ✅ `.env.example` - Updated with new environment variables
- ✅ `package.json` - Added `sync:questions` script (already present)

### Documentation
- ✅ `/docs/google-sheets-cron-setup.md` - **Full setup guide** (start here!)
- ✅ `/docs/cron-jobs-quick-reference.md` - Quick commands & troubleshooting

---

## 🚀 Next Steps

### 1. Set Up Google Sheet (10 minutes)

**Option A: CSV Method (Recommended - Simpler)**
1. Create a Google Sheet with your questions
2. Go to **File** > **Share** > **Publish to web**
3. Choose "Comma-separated values (.csv)" format
4. Click **Publish** and copy the URL
5. Set `GOOGLE_SHEET_CSV_URL` in Vercel environment variables

**Option B: API Method (Alternative - More Control)**
1. Create a Google Cloud service account
2. Enable Google Sheets API
3. Share your sheet with the service account email
4. Set `GOOGLE_SHEETS_CREDENTIALS` and `GOOGLE_SHEET_ID` in Vercel

**See full instructions**: `/docs/google-sheets-cron-setup.md`

### 2. Configure Vercel Environment Variables

Add these in **Vercel Dashboard** > Your Project > **Settings** > **Environment Variables**:

#### Required for Both Methods:
```bash
CRON_SECRET=<generate-with-openssl-rand-base64-32>
```

#### Method A (CSV - Recommended):
```bash
GOOGLE_SHEET_CSV_URL=https://docs.google.com/spreadsheets/d/e/.../pub?output=csv
```

#### Method B (API - Alternative):
```bash
GOOGLE_SHEETS_CREDENTIALS={"type":"service_account",...}
GOOGLE_SHEET_ID=1abc123def456ghi789
```

### 3. Test Locally (Optional but Recommended)

```bash
# Set up .env.local with test credentials
cp .env.example .env.local

# Edit .env.local with your values

# Run sync locally (dry run)
npm run sync:questions -- --dry-run --verbose

# Run sync for real
npm run sync:questions
```

### 4. Deploy to Vercel

```bash
# Commit and push (vercel.json included)
git add .
git commit -m "feat: add Google Sheets cron sync"
git push

# Or deploy manually
vercel --prod
```

### 5. Verify Cron Job in Vercel

1. Go to **Vercel Dashboard** > Your Project
2. Click **Cron Jobs** tab
3. Verify `/api/cron/sync-questions` is listed
4. Schedule: `0 9 * * 1` (Every Monday at 9 AM UTC)
5. Status: **Active**

### 6. Test Manual Trigger

```bash
# Trigger sync without waiting for Monday
curl -X POST https://your-app.vercel.app/api/cron/sync-questions/manual \
  -H "Cookie: sb-access-token=YOUR_SESSION_TOKEN"
```

**Expected Response:**
```json
{
  "success": true,
  "questionsAdded": 5,
  "questionsUpdated": 0,
  "questionsDeactivated": 2,
  "totalProcessed": 20,
  "errors": [],
  "syncDuration": "2.34s"
}
```

---

## 📋 Google Sheet Format

Your sheet should have these columns:

| Column | Header | Type | Required | Example |
|--------|--------|------|----------|---------|
| A | Company | text | No | Meta |
| B | Question Text | text | **Yes** | How would you improve Facebook Marketplace? |
| C | Question Type | enum | **Yes** | Product Sense |
| D | Difficulty | enum | No | Medium |
| E | Is Active | boolean | No | TRUE |

**Valid Question Types:**
- A/B Testing
- Product design/strategy
- Behavioral
- Execution
- Product Sense
- Pricing
- Estimation
- Product Strategy

**Valid Difficulties:**
- Easy
- Medium
- Hard

---

## ⏰ Cron Schedule

**Current**: Every Monday at 9:00 AM UTC

**Configured in**: `vercel.json`

**Change Schedule**: Edit the cron expression in `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/sync-questions",
      "schedule": "0 9 * * 1"  // Change this
    }
  ]
}
```

**Examples**:
- `0 0 * * *` - Daily at midnight UTC
- `0 */6 * * *` - Every 6 hours
- `0 9 * * 1-5` - Weekdays at 9 AM UTC

---

## 🔐 Security Features

✅ **CRON_SECRET** - Only Vercel can trigger the cron endpoint
✅ **Service Account** - Read-only access to Google Sheets (Method B)
✅ **Published CSV** - No authentication needed but sheet is public (Method A)
✅ **Authentication** - Manual endpoint requires Supabase session
✅ **Logging** - All sync operations logged to Vercel
✅ **Error Handling** - Comprehensive error messages and validation

---

## 📊 What the Sync Does

1. **Fetches** questions from your Google Sheet
2. **Validates** each question (required fields, valid types)
3. **Adds** new questions to database
4. **Updates** existing questions (if changed)
5. **Deactivates** questions removed from sheet (soft delete)
6. **Logs** detailed results to Vercel

**Database Changes**:
- New questions: `isActive = true`
- Removed questions: `isActive = false` (not deleted)
- Preserves manual edits to existing questions

---

## 🛠️ Testing Commands

```bash
# Local dry run (preview changes)
npm run sync:questions -- --dry-run

# Local sync with verbose logging
npm run sync:questions -- --verbose

# Manual trigger in production
curl -X POST https://your-app.vercel.app/api/cron/sync-questions/manual \
  -H "Cookie: sb-access-token=..."

# Test cron endpoint directly (requires CRON_SECRET)
curl https://your-app.vercel.app/api/cron/sync-questions \
  -H "Authorization: Bearer YOUR_CRON_SECRET"
```

---

## 📞 Troubleshooting

**Quick Reference**: See `/docs/cron-jobs-quick-reference.md`

**Common Issues**:
1. "Unauthorized: Invalid cron secret" → Check `CRON_SECRET` in Vercel
2. "The caller does not have permission" → Share sheet with service account
3. "Failed to parse credentials" → Paste raw JSON in Vercel (no extra quotes)
4. "Sheet not found" → Verify `GOOGLE_SHEET_ID` or CSV URL
5. Cron not running → Check Vercel tier limits (Free: 1 cron, Hobby: 2, Pro: unlimited)

**View Logs**:
1. Vercel Dashboard > Deployments > Latest
2. Functions tab > `/api/cron/sync-questions`
3. Click to view execution logs

---

## 📚 Documentation

- **Full Setup Guide**: `/docs/google-sheets-cron-setup.md`
- **Quick Reference**: `/docs/cron-jobs-quick-reference.md`
- **Environment Variables**: `.env.example`

---

## 🎯 Success Criteria

Your cron job is working correctly when:

- ✅ Vercel shows the cron job as "Active"
- ✅ Manual trigger returns `{"success": true}`
- ✅ Logs show "Sync complete!" with correct counts
- ✅ Database has questions from your sheet
- ✅ Next scheduled run is visible in Vercel

---

## 💡 Tips

1. **Test locally first** with `--dry-run` to preview changes
2. **Use verbose mode** (`--verbose`) when debugging
3. **Set up Slack notifications** for sync failures (see docs)
4. **Monitor logs weekly** in Vercel Dashboard
5. **Keep sheet format consistent** to avoid validation errors
6. **Use CSV method** for simpler setup (Method A)

---

## 🚨 Important Notes

- Cron jobs on **Hobby tier have 10-second timeout** (upgrade to Pro for 300s)
- **Free tier**: 1 cron job limit
- **Hobby tier**: 2 cron jobs limit
- **Pro tier**: Unlimited cron jobs
- Google Sheets API: 60 read requests/minute (free tier)
- Removed questions are **deactivated**, not deleted (preserves data)

---

**Need Help?**

1. Check the troubleshooting section in `/docs/google-sheets-cron-setup.md`
2. Test locally with verbose logging: `npm run sync:questions -- --verbose`
3. Review Vercel logs for error details
4. Verify all environment variables are set correctly

---

**Last Updated**: January 7, 2025
**Status**: ✅ Complete and ready to deploy
