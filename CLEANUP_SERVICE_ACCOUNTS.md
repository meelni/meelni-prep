# Cleanup: Delete Unused Service Accounts

## Since You're Using API Key Method

You can safely delete any service accounts you created, since you're using the **API key method** instead.

---

## How to Delete Service Accounts

### Step 1: Go to Service Accounts Page

Visit: https://console.cloud.google.com/iam-admin/serviceaccounts

### Step 2: Delete the Service Account

1. Find the service account(s) you created (e.g., `meelni-sheets-reader`, `meelni-sheets-sync`, etc.)
2. Click the **checkbox** next to the service account
3. Click the **"Delete" button** (trash icon) at the top
4. Confirm deletion

### Step 3: Clean Up Any Downloaded Keys

If you downloaded any JSON credential files to your computer:

```bash
# Find them (usually in Downloads)
cd ~/Downloads
ls -la | grep -i "service\|json\|key"

# Delete them
rm -f your-service-account-*.json
```

Also check:
- Desktop
- Documents
- Any project folders where you might have copied them

---

## What This Doesn't Affect

Deleting service accounts **does NOT** affect:

✅ Your Google Sheets API key (completely separate)
✅ Google Sheets API being enabled (stays enabled)
✅ Your ability to sync questions (API key method works independently)
✅ Any other Google Cloud resources
✅ The Google Sheet itself

---

## Clean Up Environment Variables

If you added any service account credentials to `.env.local`, you can remove them:

### Remove these lines (if present):
```bash
# You can delete these (not needed with API key method):
# GOOGLE_SHEETS_CREDENTIALS_BASE64=...
# GOOGLE_SHEETS_CREDENTIALS=...
# GOOGLE_SERVICE_ACCOUNT_EMAIL=...
# GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=...
```

### Keep these lines (needed for API key method):
```bash
# Keep these:
GOOGLE_SHEETS_API_KEY=AIzaSyC...
GOOGLE_SHEET_ID=1rz10oEeLx-eGnilahKczYPhGfCUzIEKL-xRnjoQ-SX4
GOOGLE_SHEET_NAME=Sheet1
```

---

## Remove Service Account from Sheet (If You Added It)

If you shared the Google Sheet with a service account email:

1. Open the Google Sheet
2. Click "Share" button
3. Find the service account email (e.g., `meelni-sheets-reader@...iam.gserviceaccount.com`)
4. Click the "X" to remove it
5. Done!

---

## Why Delete Them?

Good reasons to delete unused service accounts:

✅ **Security**: Fewer unused credentials = better security
✅ **Organization policy compliance**: Your org blocks them anyway
✅ **Cleaner project**: Less clutter in Google Cloud Console
✅ **No impact**: You're not using them, so safe to delete

---

## Double-Check Before Deleting

Make sure you're **NOT** using service accounts for anything else:

```bash
# Check your .env.local - should NOT see service account credentials
grep -i "service\|credentials" .env.local

# Should ONLY see API key:
grep "GOOGLE_SHEETS_API_KEY" .env.local
```

If you only see `GOOGLE_SHEETS_API_KEY`, you're good to delete the service accounts!

---

## Summary

**Safe to delete**:
- ✅ Service accounts in Google Cloud Console
- ✅ Downloaded JSON credential files
- ✅ Service account environment variables
- ✅ Service account access to the Google Sheet

**Keep**:
- ✅ Google Sheets API enabled
- ✅ Your API key
- ✅ API key environment variables

---

## Quick Cleanup Checklist

- [ ] Delete service accounts in Google Cloud Console
- [ ] Delete downloaded JSON files
- [ ] Remove service account from sheet sharing (if added)
- [ ] Remove service account env vars from `.env.local` (if present)
- [ ] Verify API key method still works: `npm run test:sheets`

---

**You're all set!** The service accounts were created before we found out they were blocked. Now you can safely remove them since you're using the API key method instead. 🧹
