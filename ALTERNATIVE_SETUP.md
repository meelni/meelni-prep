# Alternative Setup - No Service Account Key Needed

## Your Situation

Your organization blocks service account key creation. No problem! Here are alternative approaches.

---

## ✅ Option 1: Simple API Key (EASIEST)

### Requirements:
- Google Sheet must be "Anyone with the link can view"
- Just need a Google Cloud API key (no service account)

### Setup (5 minutes):

#### 1. Create API Key

Go to: https://console.cloud.google.com/apis/credentials

1. Click "**+ CREATE CREDENTIALS**"
2. Choose "**API key**"
3. Copy the API key (looks like: `AIzaSyC1234...`)
4. Click "**Restrict Key**" (recommended for security)
   - API restrictions → Select "**Google Sheets API**"
   - Application restrictions → Choose "**HTTP referrers**" or "**None**"
5. Save

#### 2. Verify Sheet Permissions

1. Open your Google Sheet: https://docs.google.com/spreadsheets/d/1rz10oEeLx-eGnilahKczYPhGfCUzIEKL-xRnjoQ-SX4/edit
2. Click "Share" button
3. Check: "Anyone with the link" should have **"Viewer"** access
4. If not, ask the owner to enable this

#### 3. Add to `.env.local`

```bash
# Simple API Key Method
GOOGLE_SHEETS_API_KEY=AIzaSyC1234...  # Your API key
GOOGLE_SHEET_ID=1rz10oEeLx-eGnilahKczYPhGfCUzIEKL-xRnjoQ-SX4
GOOGLE_SHEET_NAME=Sheet1  # Check bottom of sheet for actual tab name
```

#### 4. Test

```bash
npm run test:sheets
```

### Pros:
- ✅ No service account needed
- ✅ Simple setup
- ✅ Works for public/link-shareable sheets

### Cons:
- ❌ Requires sheet to be "Anyone with the link can view"
- ❌ Less secure than service account (but fine for read-only public data)

---

## ✅ Option 2: Ask Owner to Publish as CSV (BEST!)

### Why This Is Best:
- ✅ No authentication at all
- ✅ No Google Cloud setup needed
- ✅ Works with ANY permission level
- ✅ Fastest and simplest
- ✅ No API quotas

### What You Need:

Ask the sheet owner to:

1. Open the Google Sheet
2. **File** → **Share** → **Publish to web**
3. Choose:
   - **Published content and settings**: Select the tab with questions
   - **Link**: Choose "**Comma-separated values (.csv)**"
4. Click "**Publish**"
5. Share the CSV URL with you (looks like: `https://docs.google.com/spreadsheets/d/e/2PACX-.../pub?output=csv`)

### Setup (30 seconds):

Just add to `.env.local`:
```bash
GOOGLE_SHEET_CSV_URL=https://docs.google.com/spreadsheets/d/e/2PACX-.../pub?output=csv
```

That's it! No API keys, no auth, no setup.

### Test:
```bash
npm run test:sheets  # Will auto-detect CSV URL method
npm run sync:questions -- --dry-run
```

---

## ✅ Option 3: OAuth 2.0 (Most Secure)

### Requirements:
- Use your own Google account
- More complex setup
- Better for private sheets

### Setup (15 minutes):

#### 1. Create OAuth Client

Go to: https://console.cloud.google.com/apis/credentials

1. Click "**+ CREATE CREDENTIALS**"
2. Choose "**OAuth client ID**"
3. Application type: "**Web application**"
4. Name: `meelni-sheets-oauth`
5. Authorized redirect URIs: `http://localhost:3000/api/auth/google/callback`
6. Save and copy:
   - Client ID
   - Client secret

#### 2. Get Refresh Token

Run this one-time script:
```bash
npm run sheets:oauth-setup
```

This will:
- Open browser
- Ask you to authorize
- Save refresh token to `.env.local`

#### 3. Add to `.env.local`

```bash
GOOGLE_OAUTH_CLIENT_ID=123456...apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-...
GOOGLE_OAUTH_REFRESH_TOKEN=1//...  # From step 2
GOOGLE_SHEET_ID=1rz10oEeLx-eGnilahKczYPhGfCUzIEKL-xRnjoQ-SX4
GOOGLE_SHEET_NAME=Sheet1
```

### Pros:
- ✅ Most secure
- ✅ Works with private sheets (you just need view access)
- ✅ No organization policy conflicts

### Cons:
- ❌ More setup
- ❌ Need to refresh token periodically (automatic in code)

---

## 🎯 Which Option Should You Use?

| Scenario | Best Option | Why |
|----------|-------------|-----|
| **Sheet owner will cooperate** | **Option 2 (CSV)** | Simplest, no auth needed |
| **Sheet is "Anyone with link"** | **Option 1 (API Key)** | Simple, just need API key |
| **Sheet is private/restricted** | **Option 3 (OAuth)** | Use your own Google account |

---

## 🚀 Quick Start: Option 1 (API Key)

Since you've already enabled Google Sheets API, this is the fastest:

### 1. Create API Key (2 minutes)
```
https://console.cloud.google.com/apis/credentials
→ Create Credentials → API Key
→ Copy the key
```

### 2. Check Sheet is Shareable (30 seconds)
```
Open sheet → Share button
→ Must be "Anyone with the link can view"
```

### 3. Add to `.env.local` (30 seconds)
```bash
GOOGLE_SHEETS_API_KEY=AIzaSyC1234...
GOOGLE_SHEET_ID=1rz10oEeLx-eGnilahKczYPhGfCUzIEKL-xRnjoQ-SX4
GOOGLE_SHEET_NAME=Sheet1
```

### 4. Test (30 seconds)
```bash
npm run test:sheets
```

Done! ✅

---

## 🔍 Check Your Current Sheet Permissions

To see if API key method will work:

1. Open: https://docs.google.com/spreadsheets/d/1rz10oEeLx-eGnilahKczYPhGfCUzIEKL-xRnjoQ-SX4/edit
2. Click "Share" button (top right)
3. Look for: "Anyone with the link"
   - ✅ **If "Viewer"**: API key method will work!
   - ❌ **If "Restricted"**: Need to ask owner for CSV publish or use OAuth

---

## 💡 My Recommendation

**Ask the sheet owner to publish as CSV** (Option 2). Here's what to say:

> "Hi! Could you publish the interview questions sheet as CSV? It's the easiest way for me to sync questions automatically.
>
> Steps:
> 1. Open the sheet
> 2. File → Share → Publish to web
> 3. Choose 'Comma-separated values (.csv)'
> 4. Click Publish
> 5. Share the CSV URL with me
>
> This makes the sheet publicly readable (but not editable) and requires zero authentication setup on my end. Thanks!"

If they agree, you'll have the CSV URL and **zero setup needed** - just add one line to `.env.local` and you're done!

---

## 🔧 Commands After Setup

Regardless of which option you choose:

```bash
# Test connection
npm run test:sheets

# Preview sync
npm run sync:questions -- --dry-run

# Run sync
npm run sync:questions
```

All three options use the same commands - the code auto-detects which method to use based on environment variables!

---

## ❓ Still Need Help?

Check which environment variables you have:

```bash
# CSV method?
echo $GOOGLE_SHEET_CSV_URL

# API key method?
echo $GOOGLE_SHEETS_API_KEY

# OAuth method?
echo $GOOGLE_OAUTH_REFRESH_TOKEN
```

Whichever shows a value, that's your active method!
