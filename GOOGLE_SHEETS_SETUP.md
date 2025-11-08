# Google Sheets API Setup - Your Next Steps

## What You Need To Do

You've already:
- ✅ Enabled Google Sheets API in Google Cloud Console

Now you need to:
1. Create a service account
2. Download credentials
3. Share the Google Sheet with the service account
4. Add credentials to your project
5. Test the connection

---

## Step 1: Create Service Account (5 minutes)

### In Google Cloud Console:

1. Go to: https://console.cloud.google.com/iam-admin/serviceaccounts

2. **Create Service Account**:
   - Click "**+ CREATE SERVICE ACCOUNT**" at the top
   - Name: `meelni-sheets-reader` (or anything you like)
   - Description: "Reads PM interview questions from Google Sheets"
   - Click "**Create and Continue**"

3. **Grant Access** (optional step):
   - Skip this (no roles needed for Sheets)
   - Click "**Continue**"

4. **Grant Users Access** (optional step):
   - Skip this
   - Click "**Done**"

### Download Credentials:

5. **Click on the service account** you just created (in the list)

6. Go to **"Keys" tab** at the top

7. Click "**Add Key**" → "**Create new key**"

8. Choose "**JSON**" format

9. Click "**Create**"
   - A JSON file will download to your computer
   - **Keep this file safe!** (Don't commit to git)

The JSON file looks like this:
```json
{
  "type": "service_account",
  "project_id": "your-project-123456",
  "private_key_id": "abc123def456...",
  "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
  "client_email": "meelni-sheets-reader@your-project-123456.iam.gserviceaccount.com",
  "client_id": "123456789012345678901",
  ...
}
```

---

## Step 2: Share Google Sheet with Service Account (2 minutes)

### Important Step - Don't Skip!

1. **Open the JSON file** you just downloaded

2. **Copy the `client_email`** field
   - It looks like: `meelni-sheets-reader@your-project-123456.iam.gserviceaccount.com`

3. **Open your Google Sheet**:
   - URL: https://docs.google.com/spreadsheets/d/1rz10oEeLx-eGnilahKczYPhGfCUzIEKL-xRnjoQ-SX4/edit

4. **Click "Share" button** (top right corner)

5. **Paste the service account email** into the "Add people and groups" field

6. **Set permission to "Viewer"** (NOT Editor!)

7. **UNCHECK "Notify people"** (it's a bot, no need to email it)

8. **Click "Share"**

⚠️ **If you can't share** (because you're not the owner):
- Ask the sheet owner to add your service account email as a Viewer
- Send them the email: `meelni-sheets-reader@your-project-123456.iam.gserviceaccount.com`

---

## Step 3: Find Your Sheet Tab Name (30 seconds)

1. Open the Google Sheet

2. Look at the **bottom of the page** - you'll see tabs like:
   - "Sheet1"
   - "Questions"
   - "PM Interview Questions"
   - etc.

3. **Write down the exact tab name** (case-sensitive!)
   - We'll need this in the next step

---

## Step 4: Add Credentials to Your Project (5 minutes)

### Method A: Base64 (Recommended - Easier)

1. **In your terminal**, navigate to where you downloaded the JSON file:
   ```bash
   cd ~/Downloads
   ```

2. **Convert JSON to base64**:
   ```bash
   cat your-service-account-file-123456.json | base64
   ```
   - Replace `your-service-account-file-123456.json` with your actual filename
   - This will output a long string of characters

3. **Copy the entire output** (the base64 string)

4. **Open `.env.local`** in your project

5. **Add these lines**:
   ```bash
   # Google Sheets Configuration
   GOOGLE_SHEET_ID=1rz10oEeLx-eGnilahKczYPhGfCUzIEKL-xRnjoQ-SX4
   GOOGLE_SHEET_NAME=Sheet1  # Replace with your actual tab name from Step 3
   GOOGLE_SHEETS_CREDENTIALS_BASE64=<paste the long base64 string here>
   ```

### Method B: Direct JSON (Alternative)

If base64 doesn't work, you can paste the JSON directly:

1. **Open the JSON file** in a text editor

2. **Copy the ENTIRE contents**

3. **In `.env.local`**, add:
   ```bash
   GOOGLE_SHEET_ID=1rz10oEeLx-eGnilahKczYPhGfCUzIEKL-xRnjoQ-SX4
   GOOGLE_SHEET_NAME=Sheet1
   GOOGLE_SHEETS_CREDENTIALS='{"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n",...}'
   ```

⚠️ **Important for Method B**:
- Keep it all on ONE line
- Replace `\n` in the private_key with `\\n` (double backslash + n)
- Wrap the entire JSON in single quotes

---

## Step 5: Test the Connection (1 minute)

Run this command:

```bash
npm run test:sheets
```

### If Successful:
You'll see:
```
✅ Connection successful!
📊 Found 25 rows in sheet

First 3 questions:
1. How do you measure success of the Hot Home feature in Redfin?
   Company: Redfin
   Type: A/B Testing
...
```

🎉 **Success!** You're ready to sync questions.

### If Failed:

Common errors and fixes:

#### Error: "Permission denied"
- ✅ **Fix**: Go back to Step 2 - make sure you shared the sheet with the service account email

#### Error: "Unable to parse range"
- ✅ **Fix**: Check your `GOOGLE_SHEET_NAME` matches the exact tab name (case-sensitive)
- Look at the bottom of the Google Sheet for the tab name

#### Error: "Invalid credentials"
- ✅ **Fix**: Check that your base64 string is complete (no line breaks)
- Try Method B (direct JSON) instead

#### Error: "API has not been enabled"
- ✅ **Fix**: Make sure you enabled Google Sheets API in Google Cloud Console
- Go to: https://console.cloud.google.com/apis/library/sheets.googleapis.com
- Click "Enable"

---

## Step 6: Run Your First Sync (2 minutes)

### Test with Dry Run (safe - doesn't change DB):
```bash
npm run sync:questions -- --dry-run
```

You'll see what would be synced without actually changing the database.

### Run Live Sync:
```bash
npm run sync:questions
```

This will:
- ✅ Fetch all questions from the Google Sheet
- ✅ Add new questions to your database
- ✅ Update existing questions if changed
- ✅ Deactivate questions that were removed from the sheet

---

## Step 7: Add to Vercel (For Production)

Once it works locally, add to Vercel:

1. **Go to Vercel Dashboard** → Your Project → Settings → Environment Variables

2. **Add these variables**:
   - `GOOGLE_SHEET_ID`: `1rz10oEeLx-eGnilahKczYPhGfCUzIEKL-xRnjoQ-SX4`
   - `GOOGLE_SHEET_NAME`: Your tab name (e.g., `Sheet1`)
   - `GOOGLE_SHEETS_CREDENTIALS_BASE64`: Your base64 string

3. **Redeploy** your app

4. **The cron job will run automatically** every Monday at 9 AM UTC

---

## Quick Reference

### Your Sheet Details:
- **URL**: https://docs.google.com/spreadsheets/d/1rz10oEeLx-eGnilahKczYPhGfCUzIEKL-xRnjoQ-SX4/edit
- **Sheet ID**: `1rz10oEeLx-eGnilahKczYPhGfCUzIEKL-xRnjoQ-SX4`
- **Tab Name**: _(You need to check this - look at bottom of sheet)_

### Commands:
```bash
# Test connection
npm run test:sheets

# Test sync (safe)
npm run sync:questions -- --dry-run

# Run live sync
npm run sync:questions

# Manual trigger in production (after deployment)
curl -X POST https://your-app.vercel.app/api/cron/sync-questions/manual
```

### Environment Variables Needed:
```bash
GOOGLE_SHEET_ID=1rz10oEeLx-eGnilahKczYPhGfCUzIEKL-xRnjoQ-SX4
GOOGLE_SHEET_NAME=Sheet1  # Your actual tab name
GOOGLE_SHEETS_CREDENTIALS_BASE64=<your base64 string>
```

---

## Troubleshooting

### Check Your Setup:
```bash
# In your terminal:
echo $GOOGLE_SHEET_ID
echo $GOOGLE_SHEET_NAME
echo $GOOGLE_SHEETS_CREDENTIALS_BASE64 | cut -c1-50  # First 50 chars
```

All should show values (not empty).

### View Detailed Logs:
```bash
npm run sync:questions -- --verbose
```

### Common Issues:

1. **"No credentials found"**
   - Check `.env.local` has the variables
   - Make sure no typos in variable names

2. **"Permission denied"**
   - Service account not added to sheet as Viewer
   - Wrong sheet ID

3. **"Unable to parse range"**
   - Wrong tab name
   - Tab name is case-sensitive

4. **"No rows found"**
   - Sheet is empty
   - Wrong tab name
   - Headers not in first row

---

## Next Steps After Setup

Once everything works:

1. ✅ Test locally with dry-run
2. ✅ Run live sync once
3. ✅ Verify questions in database: `npm run db:studio`
4. ✅ Add credentials to Vercel
5. ✅ Deploy to production
6. ✅ Check cron job in Vercel Dashboard

Questions sync automatically every Monday! 🎉

---

## Need Help?

- **Test connection**: `npm run test:sheets`
- **Verbose logs**: `npm run sync:questions -- --verbose`
- **Docs**: `/docs/google-sheets-cron-setup.md`
- **Quick ref**: `/docs/cron-jobs-quick-reference.md`
