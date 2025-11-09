# Testing the Google Sheets Sync

This document provides step-by-step instructions to test the sync service.

## Pre-Test Checklist

Before running the sync, verify:

1. **Database Connection**:
   ```bash
   # Test database is accessible
   npm run db:studio
   # Should open Drizzle Studio at http://localhost:4983
   ```

2. **Environment Variables**:
   ```bash
   # Check .env.local has one of these set:
   # - GOOGLE_SHEET_CSV_URL (Method A)
   # - GOOGLE_SHEETS_API_KEY + GOOGLE_SHEET_ID (Method B)

   # Also verify:
   # - DATABASE_URL
   ```

3. **Schema is Up to Date**:
   ```bash
   npm run db:push
   ```

## Test 1: Dry Run (Preview Mode)

This test will show you what would be synced without making any changes.

```bash
npm run sync:questions -- --dry-run --verbose
```

**Expected Output**:
```
🔄 Starting question sync from Google Sheet...
Mode: DRY RUN (no changes will be made)

📡 Using Method A: Fetching from CSV URL
📥 Fetching CSV from: https://docs.google.com/.../pub?output=csv

📋 Found X questions in sheet

✅ Validated X questions
⏭️  Skipped X questions

💾 Found X existing questions in database

🔍 DRY RUN - Preview of changes:

➕ Would add X new questions:
   • [Question Type] Question text...

──────────────────────────────────────────────────
📊 Sync Preview

   New questions:         X
   Updated questions:     0
   Deactivated questions: 0
   Skipped questions:     X
   Errors:                0
──────────────────────────────────────────────────

💡 Run without --dry-run to apply these changes
```

**What to Check**:
- ✅ CSV fetches successfully (no network errors)
- ✅ Question types are mapped correctly
- ✅ Preview shows expected questions
- ✅ No unexpected errors

## Test 2: Actual Sync (First Run)

After verifying the dry run looks good, run the actual sync:

```bash
npm run sync:questions
```

**Expected Output**:
```
🔄 Starting question sync from Google Sheet...
Mode: LIVE

📡 Using Method A: Fetching from CSV URL
📋 Found X questions in sheet

✅ Validated X questions
⏭️  Skipped X questions

💾 Found X existing questions in database

➕ Adding X new questions...

──────────────────────────────────────────────────
📊 Sync Complete

   New questions:         X
   Updated questions:     0
   Deactivated questions: 0
   Skipped questions:     X
   Errors:                0
──────────────────────────────────────────────────

✅ All changes applied successfully!
```

**Verify in Database**:
```bash
npm run db:studio
```

Navigate to `interview_question` table and verify:
- Questions were added
- `question_type` values are correct
- `company` values are preserved
- `is_active` is `true` for all new questions

## Test 3: Idempotent Sync (No Changes)

Run sync again immediately to verify it's idempotent (doesn't duplicate):

```bash
npm run sync:questions
```

**Expected Output**:
```
...
✨ No changes needed - database is already in sync with sheet

──────────────────────────────────────────────────
📊 Sync Complete

   New questions:         0
   Updated questions:     0
   Deactivated questions: 0
   Skipped questions:     0
   Errors:                0
──────────────────────────────────────────────────
```

**What to Check**:
- ✅ No duplicate questions created
- ✅ Sync completes quickly (no unnecessary DB operations)

## Test 4: Deactivation (Remove Question from Sheet)

This test verifies questions removed from the sheet are deactivated.

1. **Manually remove a question from Google Sheet**
2. **Run sync**:
   ```bash
   npm run sync:questions -- --verbose
   ```

**Expected Output**:
```
...
🔒 Deactivating 1 questions...
   ✓ Deactivated: Question text here...

──────────────────────────────────────────────────
📊 Sync Complete

   New questions:         0
   Updated questions:     0
   Deactivated questions: 1
   Skipped questions:     0
   Errors:                0
──────────────────────────────────────────────────
```

3. **Verify in Database**:
   - Question still exists in DB
   - `is_active` is now `false`
   - Question won't be returned by `getRandomQuestion()`

4. **Re-add question to sheet and sync again**:
   - Question should be re-added as new (with new UUID)
   - Original inactive question remains

## Test 5: Invalid Data Handling

Add a row to your sheet with invalid data to test error handling:

**Test Cases**:
1. Empty question text → Should skip
2. Invalid question type (e.g., "Product Design") → Should skip
3. Missing company (optional) → Should import with `company = null`

```bash
npm run sync:questions -- --dry-run --verbose
```

**Expected Output**:
```
⏭️  Skipped: Empty question text
⏭️  Skipped: Unknown question type: "Product Design"
```

**What to Check**:
- ✅ Invalid rows are skipped (not crash)
- ✅ Valid rows are still processed
- ✅ Error messages are clear

## Test 6: Method B (Google Sheets API)

If you have API key configured:

1. **Comment out CSV URL in .env.local**:
   ```bash
   # GOOGLE_SHEET_CSV_URL=...
   GOOGLE_SHEETS_API_KEY=your_key
   GOOGLE_SHEET_ID=1rz10oEeLx-eGnilahKczYPhGfCUzIEKL-xRnjoQ-SX4
   ```

2. **Run sync**:
   ```bash
   npm run sync:questions -- --dry-run
   ```

**Expected Output**:
```
📡 Using Method B: Fetching via Google Sheets API
📥 Fetching from Google Sheets API: 1rz10oEeLx-eGnilahKczYPhGfCUzIEKL-xRnjoQ-SX4
...
```

**What to Check**:
- ✅ API authentication works
- ✅ Same questions fetched as Method A
- ✅ No rate limit errors

## Common Issues

### Issue: "Missing environment variables"

**Solution**:
```bash
# Check .env.local has either:
cat .env.local | grep GOOGLE_SHEET

# Should see one of:
# GOOGLE_SHEET_CSV_URL=https://...
# or
# GOOGLE_SHEETS_API_KEY=... and GOOGLE_SHEET_ID=...
```

### Issue: "HTTP error! status: 404"

**Solution**:
- Sheet is not published
- Go to: File → Share → Publish to web
- Select CSV format and publish

### Issue: "Invalid question type"

**Solution**:
Check your sheet uses exact question type names:
- ✅ `Product design / strategy` (with space)
- ✅ `Product design/strategy` (no space)
- ❌ `Product Design` (wrong case)
- ❌ `product_sense` (underscore not allowed)

### Issue: Database connection error

**Solution**:
```bash
# Verify DATABASE_URL is set
echo $DATABASE_URL

# Test connection
npm run db:studio
```

## Performance Benchmarks

Expected sync times (approximate):

- **100 questions**: ~3-5 seconds
- **500 questions**: ~10-15 seconds
- **1000 questions**: ~20-30 seconds

If sync is much slower:
- Check network latency (CSV fetch)
- Verify database connection speed
- Check for database locks

## Success Criteria

✅ **Pass**: All tests complete without errors
✅ **Pass**: Questions sync correctly from sheet to DB
✅ **Pass**: Deactivation works (removed questions marked inactive)
✅ **Pass**: Idempotent (running twice doesn't duplicate)
✅ **Pass**: Invalid data is skipped gracefully

## Next Steps

After successful testing:

1. **Set up automated sync**:
   - Add to cron job (weekly)
   - Or use GitHub Actions workflow
   - See `scripts/README.md` for instructions

2. **Monitor sync logs**:
   - Check for errors weekly
   - Verify new questions are added
   - Review skipped questions

3. **Maintain Google Sheet**:
   - Keep question types consistent
   - Use exact type names from schema
   - Don't remove columns (script expects 7 columns)
