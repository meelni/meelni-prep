# ✅ Quick Fix: Use API Key Instead (No Service Account Needed!)

## Your Situation

Your organization **blocks service account key creation**. No problem! Use a simple API key instead.

---

## 🚀 Solution: Google Sheets API Key (5 Minutes)

### Step 1: Create API Key (2 minutes)

1. Go to: **https://console.cloud.google.com/apis/credentials**

2. Click "**+ CREATE CREDENTIALS**"

3. Choose "**API key**"

4. **Copy the API key** (looks like: `AIzaSyC1234abcd...`)

5. Click "**Edit API key**" (or "Restrict Key")
   - **API restrictions**: Select "**Google Sheets API**" only
   - **Application restrictions**: Choose "**None**" (or "HTTP referrers" if you want)
   - Click "**Save**"

---

### Step 2: Check Sheet Permissions (30 seconds)

1. Open your Google Sheet: https://docs.google.com/spreadsheets/d/1rz10oEeLx-eGnilahKczYPhGfCUzIEKL-xRnjoQ-SX4/edit

2. Click "**Share**" button (top right)

3. Check the sharing settings:
   - ✅ **Good**: "Anyone with the link" can **view**
   - ❌ **Bad**: "Restricted" (only specific people)

**If "Restricted"**: Ask the sheet owner to change it to "Anyone with the link can view"

---

### Step 3: Add to `.env.local` (1 minute)

Open `.env.local` and add:

```bash
# Google Sheets API Key Method
GOOGLE_SHEETS_API_KEY=AIzaSyC1234abcd...  # Your API key from Step 1
GOOGLE_SHEET_ID=1rz10oEeLx-eGnilahKczYPhGfCUzIEKL-xRnjoQ-SX4
GOOGLE_SHEET_NAME=Sheet1  # Check bottom of sheet for actual tab name
```

**Important**: Check the **bottom of your Google Sheet** for the tab name - it might not be "Sheet1"!

---

### Step 4: Test (30 seconds)

```bash
npm run test:sheets
```

Expected output:
```
🔑 Using API Key authentication
✅ Connection successful!
📊 Found 25 rows in sheet
```

---

### Step 5: Run Sync (30 seconds)

```bash
# Preview first (safe)
npm run sync:questions -- --dry-run

# Run live sync
npm run sync:questions
```

---

## ✅ Done!

That's it! No service account, no complicated setup.

### For Production (Vercel):

Add the same 3 variables to Vercel:
1. Go to: Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add:
   - `GOOGLE_SHEETS_API_KEY`
   - `GOOGLE_SHEET_ID`
   - `GOOGLE_SHEET_NAME`
3. Redeploy

---

## 📋 Requirements Check

| Requirement | Status |
|-------------|--------|
| Google Sheets API enabled | ✅ You did this |
| Sheet is "Anyone with link can view" | ❓ Check in Step 2 |
| API key created | → Do Step 1 |
| Tab name correct | → Check bottom of sheet |

---

## 🔄 Alternative: Ask for CSV

If you can't make the sheet "Anyone with link", ask the owner to **publish as CSV**:

**Message to send**:
> "Hi! Could you publish the questions sheet as CSV?
>
> File → Share → Publish to web → Choose 'CSV' format → Publish
>
> Then share the CSV URL with me. Thanks!"

If they do this, just add to `.env.local`:
```bash
GOOGLE_SHEET_CSV_URL=<the CSV URL they share>
```

Even simpler - no API key needed!

---

## ❓ Troubleshooting

### "The caller does not have permission"
→ Sheet is NOT "Anyone with link can view". Ask owner to change sharing settings.

### "Unable to parse range"
→ Check `GOOGLE_SHEET_NAME` matches the exact tab name (case-sensitive, look at bottom of sheet)

### "API key not valid"
→ Make sure you restricted it to "Google Sheets API" in Google Cloud Console

### "No data found"
→ Wrong tab name, or sheet is empty

---

## 📝 Summary

**What you need**:
1. ✅ Google Sheets API enabled (you did this!)
2. ✅ API key from Google Cloud Console (5 seconds to create)
3. ✅ Sheet must be "Anyone with link can view"

**What you DON'T need**:
- ❌ Service account
- ❌ Service account keys (blocked by your org)
- ❌ Complex OAuth setup
- ❌ Publish to web (nice to have, but not required with API key)

**Commands**:
```bash
npm run test:sheets              # Test connection
npm run sync:questions --dry-run # Preview changes
npm run sync:questions           # Sync questions
```

---

🎉 **Ready to go!** Follow Steps 1-4 above and you'll be syncing in 5 minutes.
