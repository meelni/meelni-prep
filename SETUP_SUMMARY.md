# 🎯 Quick Setup Summary - Google Sheets Auto-Sync

## TL;DR - What You Need To Do

Since you don't have CSV URL access but **have enabled Google Sheets API**, you need to:

1. **Create a service account** in Google Cloud Console (5 min)
2. **Download the JSON credentials file** (1 min)
3. **Share your Google Sheet** with the service account email (2 min)
4. **Add credentials to `.env.local`** (3 min)
5. **Test the connection**: `npm run test:sheets` (1 min)
6. **Run your first sync**: `npm run sync:questions -- --dry-run` (1 min)

**Total time: ~15 minutes**

---

## 📁 Files I Created For You

### Core Functionality:
- ✅ `/lib/google-sheets-api.ts` - Google Sheets API client with service account auth
- ✅ `/scripts/test-google-sheets-connection.ts` - Test your credentials
- ✅ `/scripts/sync-questions-from-sheet.ts` - Main sync script (already existed, now works with API)
- ✅ `/app/api/cron/sync-questions/route.ts` - Weekly auto-sync (Monday 9 AM UTC)

### Documentation:
- ✅ `GOOGLE_SHEETS_SETUP.md` - **START HERE** - Step-by-step setup guide
- ✅ `/scripts/setup-google-sheets-env.md` - Environment variables guide
- ✅ `/docs/google-sheets-cron-setup.md` - Comprehensive technical docs
- ✅ `/docs/cron-jobs-quick-reference.md` - Quick commands reference

### Testing:
- ✅ Added `npm run test:sheets` command - Test your Google Sheets connection

---

## 🚀 Quick Start

### 1. Create Service Account

Go to: https://console.cloud.google.com/iam-admin/serviceaccounts

- Click "Create Service Account"
- Name: `meelni-sheets-reader`
- Skip roles
- Download JSON key

### 2. Share Sheet

Open: https://docs.google.com/spreadsheets/d/1rz10oEeLx-eGnilahKczYPhGfCUzIEKL-xRnjoQ-SX4/edit

- Click "Share"
- Add the `client_email` from JSON as **Viewer**
- Uncheck "Notify people"

⚠️ **If you can't share** (not the owner), ask the owner to add your service account email.

### 3. Add Credentials

```bash
# Navigate to your Downloads folder
cd ~/Downloads

# Convert JSON to base64
cat your-service-account-*.json | base64

# Copy the output
```

Then edit `.env.local`:
```bash
# Add these lines:
GOOGLE_SHEET_ID=1rz10oEeLx-eGnilahKczYPhGfCUzIEKL-xRnjoQ-SX4
GOOGLE_SHEET_NAME=Sheet1  # Check bottom of sheet for actual tab name
GOOGLE_SHEETS_CREDENTIALS_BASE64=<paste your base64 string here>
```

### 4. Test Connection

```bash
npm run test:sheets
```

Expected output:
```
✅ Connection successful!
📊 Found 25 rows in sheet
```

### 5. Run Sync

```bash
# Test first (safe - doesn't change DB)
npm run sync:questions -- --dry-run

# Then run live
npm run sync:questions
```

---

## 🎯 What You Get

Once set up:

### Locally:
```bash
npm run test:sheets           # Test connection
npm run sync:questions -- --dry-run  # Preview changes
npm run sync:questions        # Sync questions
```

### Production (Vercel):
- ✅ **Automatic weekly sync** (every Monday at 9 AM UTC)
- ✅ **Manual trigger** via API endpoint
- ✅ **Detailed logs** in Vercel dashboard

### Features:
- ✅ Fetches questions from Google Sheet
- ✅ Adds new questions to database
- ✅ Updates existing questions
- ✅ Deactivates removed questions (soft delete)
- ✅ Smart deduplication
- ✅ Question type mapping

---

## 📋 Environment Variables You Need

```bash
# Google Sheets Configuration
GOOGLE_SHEET_ID=1rz10oEeLx-eGnilahKczYPhGfCUzIEKL-xRnjoQ-SX4
GOOGLE_SHEET_NAME=Sheet1  # Your actual tab name
GOOGLE_SHEETS_CREDENTIALS_BASE64=<your base64 string>

# For production (Vercel) - also add:
CRON_SECRET=<generate with: openssl rand -base64 32>
```

---

## 🔍 Your Google Sheet Details

- **URL**: https://docs.google.com/spreadsheets/d/1rz10oEeLx-eGnilahKczYPhGfCUzIEKL-xRnjoQ-SX4/edit
- **Sheet ID**: `1rz10oEeLx-eGnilahKczYPhGfCUzIEKL-xRnjoQ-SX4`
- **Tab Name**: Check bottom of sheet (usually "Sheet1")

---

## ❓ Common Issues

### "Permission denied"
→ Share the sheet with your service account email as Viewer

### "Unable to parse range"
→ Check `GOOGLE_SHEET_NAME` matches the exact tab name (case-sensitive)

### "No credentials found"
→ Check `.env.local` has `GOOGLE_SHEETS_CREDENTIALS_BASE64`

### "API not enabled"
→ Enable Google Sheets API: https://console.cloud.google.com/apis/library/sheets.googleapis.com

---

## 📚 Documentation

- **👉 Start Here**: `GOOGLE_SHEETS_SETUP.md` - Step-by-step guide with screenshots
- **Detailed Docs**: `/docs/google-sheets-cron-setup.md` - Full technical documentation
- **Quick Commands**: `/docs/cron-jobs-quick-reference.md` - Command reference
- **Env Setup**: `/scripts/setup-google-sheets-env.md` - Environment variables guide

---

## ✅ Success Checklist

- [ ] Google Sheets API enabled in Google Cloud Console
- [ ] Service account created
- [ ] JSON credentials downloaded
- [ ] Sheet shared with service account email
- [ ] Credentials added to `.env.local`
- [ ] `npm run test:sheets` works
- [ ] `npm run sync:questions -- --dry-run` works
- [ ] First sync completed successfully
- [ ] Questions visible in database
- [ ] Credentials added to Vercel (for production)

---

## 🎉 After Setup

Once everything works:

1. Questions sync **automatically every Monday at 9 AM UTC**
2. You can **manually trigger** anytime: `npm run sync:questions`
3. **Add new questions** to the Google Sheet, they'll sync automatically
4. **Monitor logs** in Vercel Dashboard → Functions

---

**Need help?** See `GOOGLE_SHEETS_SETUP.md` for detailed instructions!
