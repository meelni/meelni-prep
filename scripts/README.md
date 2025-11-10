# Meelni Scripts

This directory contains utility scripts for Google Sheets sync and Vercel deployment.

## 🚀 Deployment Scripts

### deploy.sh

Automated deployment script with pre-flight checks for Vercel production.

**Usage**:
```bash
./scripts/deploy.sh
```

**What it does**:
1. Checks Vercel CLI installation
2. Verifies authentication
3. Runs build check
4. Validates TypeScript
5. Runs linter
6. Deploys to production

### setup-vercel-env.sh

Automates adding environment variables to Vercel from `.env.local`.

**Usage**:
```bash
./scripts/setup-vercel-env.sh
```

**Important**: After running, enable Preview/Development for `NEXT_PUBLIC_*` vars in Vercel Dashboard.

---

## 📋 Google Sheets Question Sync

Scripts for syncing PM interview questions from Google Sheets to the database.

## Overview

The sync service fetches interview questions from a Google Sheet and synchronizes them with the database. It supports two methods:

- **Method A (Recommended)**: Fetch from published CSV URL - Simple, no authentication required
- **Method B**: Use Google Sheets API - Requires API key or service account

## Quick Start

### Method A: CSV URL (Recommended)

1. **Publish your Google Sheet as CSV**:
   - Open your Google Sheet: https://docs.google.com/spreadsheets/d/1rz10oEeLx-eGnilahKczYPhGfCUzIEKL-xRnjoQ-SX4/edit
   - Click **File** → **Share** → **Publish to web**
   - Select the sheet or "Entire Document"
   - Choose **Comma-separated values (.csv)** from dropdown
   - Click **Publish**
   - Copy the generated URL

2. **Add CSV URL to environment variables**:
   ```bash
   # .env.local
   GOOGLE_SHEET_CSV_URL=https://docs.google.com/spreadsheets/d/e/.../pub?output=csv
   ```

3. **Run sync**:
   ```bash
   npm run sync:questions
   ```

### Method B: Google Sheets API

1. **Get API Key** (or use service account):
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Enable Google Sheets API
   - Create API key (or service account credentials)

2. **Add credentials to environment variables**:
   ```bash
   # .env.local
   GOOGLE_SHEETS_API_KEY=your_api_key_here
   GOOGLE_SHEET_ID=1rz10oEeLx-eGnilahKczYPhGfCUzIEKL-xRnjoQ-SX4
   ```

3. **Run sync**:
   ```bash
   npm run sync:questions
   ```

## Google Sheet Format

Your Google Sheet should have these columns (in this order):

| Column | Name | Required | Notes |
|--------|------|----------|-------|
| A | Timestamp | No | Automatically added by Google Forms |
| B | Company | No | Company name (e.g., "Meta", "Google") |
| C | Question Text | **Yes** | The interview question |
| D | Question Type | **Yes** | Must be one of the valid types (see below) |
| E | Interview Type | No | Ignored by sync script |
| F | Comments | No | Ignored by sync script |
| G | Notes | No | Ignored by sync script |

### Valid Question Types

The sync script maps these question types from your sheet to the database:

- `A/B Testing` → `A/B Testing`
- `Product design / strategy` → `Product design/strategy`
- `Behavioral` → `Behavioral`
- `Execution` → `Execution`
- `Product Sense` → `Product Sense`
- `Pricing` → `Pricing`
- `Estimation` → `Estimation`
- `Product Strategy` → `Product Strategy`

## Usage

### Basic Sync

Sync questions from Google Sheet to database:

```bash
npm run sync:questions
```

### Dry Run (Preview Changes)

See what would be synced without making changes:

```bash
npm run sync:questions -- --dry-run
```

### Verbose Mode

Show detailed logs including all questions added/deactivated:

```bash
npm run sync:questions -- --verbose
```

### Combine Flags

```bash
npm run sync:questions -- --dry-run --verbose
```

## How It Works

1. **Fetch**: Downloads questions from Google Sheet (CSV or API)
2. **Validate**: Checks required fields and question types
3. **Compare**: Compares sheet questions with existing database questions
4. **Sync**:
   - **Add**: New questions found in sheet but not in database
   - **Deactivate**: Questions in database but removed from sheet (sets `is_active = false`)
   - **Skip**: Questions with invalid data or missing required fields

### Deduplication

Questions are matched by **question text** (case-insensitive, normalized). This means:

- Questions with identical text are considered duplicates
- Existing questions are **not updated** to preserve manual edits
- Questions removed from sheet are **deactivated** (not deleted)

## Examples

### Example: First Sync

```
🔄 Starting question sync from Google Sheet...
Mode: LIVE

📡 Using Method A: Fetching from CSV URL
📥 Fetching CSV from: https://docs.google.com/.../pub?output=csv

📋 Found 150 questions in sheet

✅ Validated 145 questions
⏭️  Skipped 5 questions

💾 Found 20 existing questions in database

➕ Adding 125 new questions...

──────────────────────────────────────────────────
📊 Sync Complete

   New questions:         125
   Updated questions:     0
   Deactivated questions: 0
   Skipped questions:     5
   Errors:                0
──────────────────────────────────────────────────

✅ All changes applied successfully!
```

### Example: Dry Run

```
🔄 Starting question sync from Google Sheet...
Mode: DRY RUN (no changes will be made)

📡 Using Method A: Fetching from CSV URL
📋 Found 150 questions in sheet

✅ Validated 145 questions
⏭️  Skipped 5 questions

💾 Found 145 existing questions in database

🔍 DRY RUN - Preview of changes:

➕ Would add 3 new questions:
   • [Product Sense] How would you improve Instagram Stories?
   • [Execution] Design a roadmap for launching a new feature in 6 months.
   • [Behavioral] Tell me about a time you had to influence stakeholders.

🔒 Would deactivate 1 questions:
   • Should TikTok add a music discovery feature?

──────────────────────────────────────────────────
📊 Sync Preview

   New questions:         3
   Updated questions:     0
   Deactivated questions: 1
   Skipped questions:     5
   Errors:                0
──────────────────────────────────────────────────

💡 Run without --dry-run to apply these changes
```

## Troubleshooting

### CSV Not Found / 404 Error

**Problem**: Can't fetch CSV from URL

**Solution**:
1. Verify sheet is published: File → Share → Publish to web
2. Check the published URL ends with `?output=csv`
3. Make sure sheet isn't private/restricted

### Invalid Question Type Error

**Problem**: Questions skipped due to invalid type

**Solution**:
- Check your sheet uses **exact** question type names (case-sensitive)
- Valid types: `A/B Testing`, `Product design / strategy`, `Behavioral`, `Execution`, `Product Sense`, `Pricing`, `Estimation`, `Product Strategy`
- Note: `Product design / strategy` (with space before slash) is automatically mapped to `Product design/strategy`

### Missing Environment Variable

**Problem**: `Missing environment variables` error

**Solution**:
- For Method A: Set `GOOGLE_SHEET_CSV_URL` in `.env.local`
- For Method B: Set `GOOGLE_SHEETS_API_KEY` and `GOOGLE_SHEET_ID` in `.env.local`

### Database Connection Error

**Problem**: Can't connect to database

**Solution**:
- Verify `DATABASE_URL` is set in `.env.local`
- Check database is accessible
- Run `npm run db:push` to ensure schema is up to date

## Setting Up Weekly Sync (Optional)

You can set up automated weekly syncs using cron jobs or GitHub Actions.

### Option 1: Cron Job (Local/Server)

```bash
# Edit crontab
crontab -e

# Add weekly sync (every Monday at 9 AM)
0 9 * * 1 cd /path/to/project && npm run sync:questions >> /var/log/meelni-sync.log 2>&1
```

### Option 2: GitHub Actions

Create `.github/workflows/sync-questions.yml`:

```yaml
name: Sync Questions

on:
  schedule:
    # Run every Monday at 9 AM UTC
    - cron: '0 9 * * 1'
  workflow_dispatch: # Allow manual trigger

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm ci

      - name: Sync questions
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          GOOGLE_SHEET_CSV_URL: ${{ secrets.GOOGLE_SHEET_CSV_URL }}
        run: npm run sync:questions
```

Don't forget to add secrets in GitHub: Settings → Secrets → Actions → New repository secret

## Files

- `sync-questions-from-sheet.ts` - Main sync script
- `../lib/google-sheets-client.ts` - Google Sheets client library (CSV + API methods)
- `seed-questions.ts` - Initial seed script (sample questions)

## Support

For issues or questions:
1. Check this README
2. Review error messages (they're descriptive!)
3. Run with `--dry-run --verbose` to debug
4. Check [CLAUDE.md](../.claude/CLAUDE.md) for database schema details
