# Google Sheets Sync Architecture

## System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        Google Sheets                             │
│  https://docs.google.com/spreadsheets/d/1rz10o.../edit          │
│                                                                   │
│  Columns: Timestamp | Company | Question | Type | ...            │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             │ (Method A: CSV URL)
                             │ (Method B: API Key)
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│              lib/google-sheets-client.ts                         │
│                                                                   │
│  ┌─────────────────────┐        ┌──────────────────────┐       │
│  │ fetchSheetAsCSV()   │        │ fetchSheetViaAPI()   │       │
│  │                     │        │                      │       │
│  │ - GET CSV URL       │        │ - Google Sheets API  │       │
│  │ - Parse CSV rows    │        │ - OAuth/API Key      │       │
│  │ - Handle quotes     │        │ - JSON response      │       │
│  └─────────────────────┘        └──────────────────────┘       │
│                             │                                    │
│                             ▼                                    │
│                  ┌──────────────────────┐                       │
│                  │ validateSheetRow()   │                       │
│                  │                      │                       │
│                  │ - Check required     │                       │
│                  │ - Validate types     │                       │
│                  └──────────────────────┘                       │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│          scripts/sync-questions-from-sheet.ts                    │
│                                                                   │
│  1. fetchSheetData()                                             │
│     ↓                                                             │
│  2. processSheetRow() ──→ Map question types                    │
│     ↓                     (e.g., "Product design / strategy"     │
│  3. getExistingQuestions()  →  "Product design/strategy")       │
│     ↓                                                             │
│  4. Compare & Determine Changes:                                 │
│     ┌─────────────────────────────────────────────┐            │
│     │ New: In sheet but not in DB                 │            │
│     │ Deactivate: In DB but not in sheet         │            │
│     │ Skip: Invalid data                          │            │
│     └─────────────────────────────────────────────┘            │
│     ↓                                                             │
│  5. applyChanges() (or previewChanges() if --dry-run)          │
│                                                                   │
└────────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│                    PostgreSQL Database                           │
│                      (via Drizzle ORM)                           │
│                                                                   │
│  Table: interview_question                                       │
│  ┌────────────────────────────────────────────────────┐        │
│  │ id (uuid)                                          │        │
│  │ company (text, nullable)                           │        │
│  │ question_text (text, not null) ← Dedup key       │        │
│  │ question_type (text, not null, check constraint) │        │
│  │ difficulty (text, nullable)                        │        │
│  │ is_active (boolean, default true)                 │        │
│  │ created_at (timestamp)                             │        │
│  └────────────────────────────────────────────────────┘        │
│                                                                   │
│  Indexes:                                                        │
│  - question_type_idx (question_type)                            │
│  - is_active_idx (is_active)                                    │
│  - active_type_idx (is_active, question_type)                  │
└──────────────────────────────────────────────────────────────────┘
```

## Data Flow

### Sync Process

```
┌─────────────┐
│   START     │
└──────┬──────┘
       │
       ▼
┌─────────────────────────┐
│ Parse CLI flags         │
│ (--dry-run, --verbose)  │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│ Check ENV variables     │
│ - CSV URL? → Method A   │
│ - API Key? → Method B   │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│ Fetch from Google Sheet │
│ Returns: SheetRow[]     │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│ FOR EACH row:           │
│ 1. Validate fields      │
│ 2. Map question type    │
│ 3. Clean company name   │
│ 4. Normalize text       │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│ Query existing Qs       │
│ from database           │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────────────────────────┐
│ Compare (by normalized question_text):      │
│                                              │
│ ┌─────────────┐  ┌──────────────┐          │
│ │ Sheet Qs    │  │ Database Qs  │          │
│ └─────┬───────┘  └──────┬───────┘          │
│       │                 │                   │
│       └────────┬────────┘                   │
│                │                             │
│         ┌──────▼──────┐                     │
│         │  Diff Logic │                     │
│         └──────┬──────┘                     │
│                │                             │
│      ┌─────────┼─────────┐                 │
│      ▼         ▼         ▼                  │
│   New Qs  Existing  Removed Qs             │
│   (add)   (skip)    (deactivate)           │
└─────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────┐
│ Dry run?                │
│  ├─ Yes → Preview only  │
│  └─ No  → Apply changes │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│ FOR EACH new Q:         │
│   INSERT INTO DB        │
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│ FOR EACH removed Q:     │
│   UPDATE is_active=false│
└──────┬──────────────────┘
       │
       ▼
┌─────────────────────────┐
│ Print summary stats     │
└──────┬──────────────────┘
       │
       ▼
┌─────────────┐
│     END     │
└─────────────┘
```

## Question Type Mapping

```
Google Sheet Type          Database Type
─────────────────          ──────────────
"A/B Testing"          →   "A/B Testing"
"Product design / strategy" → "Product design/strategy"
"Product design/strategy"   → "Product design/strategy"
"Behavioral"           →   "Behavioral"
"Execution"            →   "Execution"
"Product Sense"        →   "Product Sense"
"Pricing"              →   "Pricing"
"Estimation"           →   "Estimation"
"Product Strategy"     →   "Product Strategy"

(All other values are rejected with error)
```

## Text Normalization for Deduplication

```
Original Text:
  "How would you improve   Instagram Stories?"

Normalized (for comparison):
  "how would you improve instagram stories?"

Steps:
  1. Convert to lowercase
  2. Trim whitespace
  3. Replace multiple spaces with single space

Purpose:
  - Prevents duplicate questions with minor formatting differences
  - Makes comparison case-insensitive
  - Handles extra whitespace gracefully
```

## Error Handling Strategy

```
┌─────────────────┐
│ Fetch Error     │  → Retry? Network issue? Exit with error.
└─────────────────┘

┌─────────────────┐
│ Parse Error     │  → Skip row, log warning, continue.
└─────────────────┘    (e.g., malformed CSV, missing column)

┌─────────────────┐
│ Validation Error│  → Skip row, increment "skipped" count.
└─────────────────┘    (e.g., invalid question type, empty text)

┌─────────────────┐
│ Database Error  │  → Log error, increment "errors" count, continue.
└─────────────────┘    (e.g., constraint violation, connection issue)
```

## Performance Characteristics

| Operation | Time Complexity | Notes |
|-----------|----------------|-------|
| Fetch CSV | O(n) | n = rows in sheet |
| Parse CSV | O(n*m) | m = avg row length |
| Validate rows | O(n) | Linear scan |
| Get existing Qs | O(k) | k = DB rows, indexed |
| Text normalization | O(n*m) | m = avg text length |
| Set operations | O(n) | HashSet lookup |
| Database inserts | O(n) | n = new questions |
| Database updates | O(d) | d = deactivated questions |

**Overall**: O(n + k) where n = sheet rows, k = DB rows

Typical sync times:
- 100 questions: ~3-5 seconds
- 500 questions: ~10-15 seconds
- 1000 questions: ~20-30 seconds

## Security Considerations

### Method A (CSV URL)

✅ **Pros**:
- No credentials needed
- No API rate limits
- Simple implementation

⚠️ **Cons**:
- Sheet must be publicly readable
- Anyone with URL can access
- No fine-grained permissions

**Recommendation**: Use for non-sensitive interview questions. If questions are proprietary, use Method B.

### Method B (Google Sheets API)

✅ **Pros**:
- Fine-grained access control
- Audit logs
- Can use service account

⚠️ **Cons**:
- Requires API key management
- Subject to rate limits (100 req/100 sec)
- More complex setup

**Recommendation**: Use for sensitive data or when need access control.

## Monitoring & Observability

### Log Levels

1. **Info** (default):
   - Sync start/complete
   - Summary stats
   - Method used (CSV/API)

2. **Verbose** (`--verbose`):
   - Each question added
   - Each question deactivated
   - Skipped rows with reasons

3. **Errors**:
   - Network failures
   - Database errors
   - Invalid data (with row number)

### Metrics to Track

- **New questions per sync**: Growing sheet?
- **Deactivated questions**: Removals?
- **Skipped questions**: Data quality issues?
- **Sync duration**: Performance degradation?
- **Error count**: System health?

### Alerting Triggers

🚨 **Critical**:
- Sync fails to complete
- Database connection errors
- >50% rows skipped (data quality)

⚠️ **Warning**:
- Sync duration >2x normal
- >10 errors in single sync
- >20% rows skipped

## Extensibility

### Adding New Question Types

1. Update database schema constraint in `/lib/db/schema.ts`:
   ```typescript
   sql`${table.questionType} IN ('A/B Testing', ..., 'NEW_TYPE')`
   ```

2. Add to QUESTION_TYPE_MAPPING in sync script:
   ```typescript
   "New Type From Sheet": "NEW_TYPE",
   ```

3. Add to VALID_QUESTION_TYPES set

4. Run `npm run db:push` to update schema

### Adding New Fields

To sync additional columns from sheet:

1. Update `SheetRow` interface in `/lib/google-sheets-client.ts`
2. Update database schema in `/lib/db/schema.ts`
3. Update parsing in `parseCSV()` and `parseSheetValues()`
4. Update `processSheetRow()` to handle new field
5. Update `applyChanges()` to insert/update new field

Example: Adding "difficulty" field (already supported):
```typescript
// Already in schema
difficulty: text("difficulty"),

// Map from sheet
difficulty: row.difficulty?.trim() || null,
```

### Custom Sync Logic

To customize sync behavior, modify:

- **Deduplication logic**: Change `normalizeText()` function
- **Update strategy**: Modify comparison in Step 4
- **Soft delete**: Change `is_active = false` to hard delete
- **Batch inserts**: Replace for-loop with bulk insert

## Dependencies

```
google-sheets-client.ts
├── (no external deps, uses built-in fetch)

sync-questions-from-sheet.ts
├── @/lib/db (Drizzle ORM)
├── @/lib/db/schema
├── drizzle-orm (eq, sql)
└── @/lib/google-sheets-client

Runtime:
├── Node.js (fetch API)
├── PostgreSQL (via DATABASE_URL)
└── TypeScript (via tsx)
```

## Testing Strategy

See `/scripts/TEST_SETUP.md` for complete testing guide.

**Key Tests**:
1. ✅ Dry run (preview mode)
2. ✅ First sync (add questions)
3. ✅ Idempotent sync (no duplicates)
4. ✅ Deactivation (remove from sheet)
5. ✅ Invalid data handling
6. ✅ Both methods (CSV + API)
