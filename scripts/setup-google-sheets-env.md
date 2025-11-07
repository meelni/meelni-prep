# Google Sheets API Setup - Quick Guide

## What You Need

1. **Service Account JSON file** (you just downloaded this)
2. **Google Sheet ID** from the URL

## Extract Sheet ID from URL

Your URL:
```
https://docs.google.com/spreadsheets/d/1rz10oEeLx-eGnilahKczYPhGfCUzIEKL-xRnjoQ-SX4/edit?gid=1024620532#gid=1024620532
```

**Sheet ID** is the part after `/d/` and before `/edit`:
```
1rz10oEeLx-eGnilahKczYPhGfCUzIEKL-xRnjoQ-SX4
```

**Sheet Name/Tab** is after `gid=`:
```
gid=1024620532
```

You'll need to find the actual **tab name** (like "Sheet1", "Questions", etc.) by opening the sheet.

---

## Add to .env.local

Open `.env.local` and add these variables:

```bash
# Google Sheets API Credentials
GOOGLE_SHEET_ID=1rz10oEeLx-eGnilahKczYPhGfCUzIEKL-xRnjoQ-SX4
GOOGLE_SHEET_NAME=Sheet1  # Replace with actual tab name (look at bottom of sheet)

# Copy the ENTIRE contents of your downloaded JSON file
# Make sure to escape it properly or use the helper below
GOOGLE_SHEETS_CREDENTIALS='{
  "type": "service_account",
  "project_id": "your-project-123",
  "private_key_id": "abc123...",
  "private_key": "-----BEGIN PRIVATE KEY-----\\nYOUR_PRIVATE_KEY_HERE\\n-----END PRIVATE KEY-----\\n",
  "client_email": "meelni-sheets-sync@your-project.iam.gserviceaccount.com",
  "client_id": "123456789",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/..."
}'
```

⚠️ **Important**:
- The `private_key` field must have `\\n` (double backslash + n) instead of actual newlines
- Keep it all on one line or properly escaped

---

## Easier Method: Base64 Encode

Instead of dealing with escaping, you can base64 encode the entire JSON:

```bash
# In terminal, run this with your downloaded JSON file:
cat ~/Downloads/your-service-account-file.json | base64

# Copy the output (long string of characters)
```

Then in `.env.local`:
```bash
GOOGLE_SHEET_ID=1rz10oEeLx-eGnilahKczYPhGfCUzIEKL-xRnjoQ-SX4
GOOGLE_SHEET_NAME=Sheet1
GOOGLE_SHEETS_CREDENTIALS_BASE64=<paste base64 string here>
```

The sync script will decode it automatically.

---

## Find Your Sheet Tab Name

1. Open the Google Sheet
2. Look at the **bottom tabs** (usually says "Sheet1", "Questions", etc.)
3. Use that exact name for `GOOGLE_SHEET_NAME`

Example:
- If tab says "PM Questions" → `GOOGLE_SHEET_NAME="PM Questions"`
- If tab says "Sheet1" → `GOOGLE_SHEET_NAME="Sheet1"`

---

## Next Steps

After adding these to `.env.local`:

1. **Test the connection**:
   ```bash
   npm run sync:questions -- --dry-run
   ```

2. **If it works**, run live sync:
   ```bash
   npm run sync:questions
   ```

3. **Add to Vercel** (for production):
   - Go to Vercel Dashboard → Settings → Environment Variables
   - Add the same variables (use base64 method for easier copy/paste)

---

## Troubleshooting

### Error: "Unable to parse range"
- Check that `GOOGLE_SHEET_NAME` matches the exact tab name

### Error: "The caller does not have permission"
- Make sure you shared the sheet with the service account email
- Check that the service account email has "Viewer" access

### Error: "Invalid JWT"
- Check that `GOOGLE_SHEETS_CREDENTIALS` is properly formatted
- Try the base64 method instead

### Error: "API key not valid"
- Make sure you enabled Google Sheets API in Google Cloud Console
- Wait 1-2 minutes after enabling (propagation delay)
