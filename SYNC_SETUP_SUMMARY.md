# Google Sheets Sync - Setup Summary

This document provides a quick overview of the Google Sheets synchronization system for PM interview questions.

## What Was Created

### 1. Core Files

- **`/lib/google-sheets-client.ts`** - Google Sheets client library
  - Supports CSV URL fetching (Method A - simple, no auth)
  - Supports Google Sheets API fetching (Method B - requires API key)
  - CSV parsing with proper quote/comma handling
  - Row validation

- **`/scripts/sync-questions-from-sheet.ts`** - Main sync script
  - Fetches questions from Google Sheet
  - Maps question types to database schema
  - Upserts questions (no duplicates based on question text)
  - Deactivates questions removed from sheet
  - Dry-run mode for previewing changes
  - Verbose logging

### 2. Documentation

- **`/scripts/README.md`** - Complete usage guide
  - Setup instructions for both methods
  - Usage examples
  - Troubleshooting guide
  - Automation setup (cron/GitHub Actions)

- **`/scripts/TEST_SETUP.md`** - Testing guide
  - Step-by-step test procedures
  - Expected outputs
  - Common issues and solutions

### 3. Configuration

- **`package.json`** - Added `sync:questions` script
- **`.env.example`** - Updated with Google Sheets variables

## Quick Start

### Step 1: Publish Your Google Sheet as CSV

1. Open: https://docs.google.com/spreadsheets/d/1rz10oEeLx-eGnilahKczYPhGfCUzIEKL-xRnjoQ-SX4/edit
2. **File** → **Share** → **Publish to web**
3. Choose **Comma-separated values (.csv)**
4. Click **Publish**
5. Copy the URL

### Step 2: Add URL to Environment Variables

Add to `.env.local`:
```bash
GOOGLE_SHEET_CSV_URL=https://docs.google.com/spreadsheets/d/e/.../pub?output=csv
```

### Step 3: Test with Dry Run

```bash
npm run sync:questions -- --dry-run --verbose
```

This will show you what would be synced without making changes.

### Step 4: Run Live Sync

If dry run looks good:
```bash
npm run sync:questions
```

## Sheet Format

Your Google Sheet must have these columns (in order):

| Column | Name | Required | Notes |
|--------|------|----------|-------|
| A | Timestamp | No | Auto-added by Google Forms |
| B | Company | No | e.g., "Meta", "Google" |
| C | Question Text | **Yes** | The interview question |
| D | Question Type | **Yes** | See valid types below |
| E | Interview Type | No | Ignored |
| F | Comments | No | Ignored |
| G | Notes | No | Ignored |

**Valid Question Types**:
- `A/B Testing`
- `Product design / strategy` (or `Product design/strategy`)
- `Behavioral`
- `Execution`
- `Product Sense`
- `Pricing`
- `Estimation`
- `Product Strategy`

## How It Works

```
┌─────────────────────┐
│  Google Sheet       │
│  (CSV URL)          │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Fetch & Parse CSV  │
│  (google-sheets-    │
│   client.ts)        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Validate & Map     │
│  Question Types     │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Compare with       │
│  Database           │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Sync Changes:      │
│  - Add new Qs       │
│  - Deactivate       │
│    removed Qs       │
└─────────────────────┘
```

## Features

✅ **Two Methods**: CSV URL (simple) or API (advanced)
✅ **Dry Run**: Preview changes before applying
✅ **Idempotent**: Safe to run multiple times
✅ **Deduplication**: Matches on question text (normalized)
✅ **Soft Delete**: Deactivates instead of deleting
✅ **Error Handling**: Skips invalid rows, logs clearly
✅ **Type Mapping**: Auto-maps sheet types to DB types
✅ **Verbose Logging**: See exactly what's happening

## Command Reference

```bash
# Preview changes (recommended first run)
npm run sync:questions -- --dry-run

# Preview with detailed logs
npm run sync:questions -- --dry-run --verbose

# Run actual sync
npm run sync:questions

# Run sync with verbose output
npm run sync:questions -- --verbose
```

## Automation (Optional)

### Weekly Cron Job

```bash
# Run every Monday at 9 AM
0 9 * * 1 cd /path/to/project && npm run sync:questions
```

### GitHub Actions

See `/scripts/README.md` for complete GitHub Actions workflow.

## Troubleshooting Quick Reference

| Error | Solution |
|-------|----------|
| "Missing environment variables" | Add `GOOGLE_SHEET_CSV_URL` to `.env.local` |
| "HTTP error! status: 404" | Publish your sheet: File → Share → Publish to web |
| "Invalid question type" | Use exact type names (case-sensitive) |
| "Empty CSV response" | Check CSV URL is correct and sheet isn't empty |
| Database connection error | Verify `DATABASE_URL` in `.env.local` |

## File Locations

```
meelni/
├── lib/
│   └── google-sheets-client.ts      # Sheets client library
├── scripts/
│   ├── sync-questions-from-sheet.ts # Main sync script
│   ├── README.md                    # Complete guide
│   └── TEST_SETUP.md                # Testing guide
├── .env.local                       # Add GOOGLE_SHEET_CSV_URL here
└── .env.example                     # Template with all variables
```

## Next Steps

1. **Test the sync** (see `scripts/TEST_SETUP.md`)
2. **Verify questions in database** (run `npm run db:studio`)
3. **Set up weekly automation** (optional)
4. **Monitor sync logs** for errors

## Support

For detailed information:
- **Usage Guide**: `/scripts/README.md`
- **Testing Guide**: `/scripts/TEST_SETUP.md`
- **Database Schema**: `/.claude/CLAUDE.md`

For issues:
1. Check error message (they're descriptive!)
2. Run with `--dry-run --verbose` to debug
3. Verify sheet format and question types
4. Check environment variables are set

---

**Ready to sync?** Run `npm run sync:questions -- --dry-run` to get started! 🚀
