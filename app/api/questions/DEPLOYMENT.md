# Question Bank API - Deployment Checklist

## Status: ⚠️ PENDING SCHEMA DEPLOYMENT

The Question Bank API endpoints are **ready to deploy** but require the database schema to be created first.

## Current Status

✅ **Completed**:
- [x] Database query helpers created (`/lib/db/questions.ts`)
- [x] Random question endpoint created (`/app/api/questions/random/route.ts`)
- [x] List questions endpoint created (`/app/api/questions/route.ts`)
- [x] API documentation created (`/app/api/questions/README.md`)
- [x] Error handling implemented
- [x] Type validation implemented
- [x] Following existing codebase patterns (Drizzle ORM, Next.js App Router)

⚠️ **Pending**:
- [ ] Database schema deployment (blocked - waiting for database-optimizer agent)
- [ ] Schema push to Supabase
- [ ] Seed data insertion (initial question set)
- [ ] Integration testing
- [ ] Production deployment

## Required Schema

The following schema must be added to `/lib/db/schema.ts`:

```typescript
export const questionBank = pgTable("question_bank", {
  id: uuid("id").primaryKey().defaultRandom(),
  company: text("company"),
  questionText: text("question_text").notNull(),
  questionType: text("question_type").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  questionTypeCheck: check(
    "question_type_check",
    sql`${table.questionType} IN ('behavioral', 'product_sense', 'execution', 'strategy')`
  ),
}));
```

## Deployment Steps (Once Schema is Ready)

### Step 1: Verify Schema Export
```bash
# Check that questionBank is exported from schema.ts
grep "export.*questionBank" /Users/REDACTED/conductor/meelni-prep/.conductor/toronto/lib/db/schema.ts
```

### Step 2: Build Check
```bash
# Verify TypeScript compilation
cd /Users/REDACTED/conductor/meelni-prep/.conductor/toronto
npm run build
```

### Step 3: Push Schema to Database
```bash
# Push schema changes to Supabase
npx drizzle-kit push
```

### Step 4: Verify Table Creation
```sql
-- Check in Supabase SQL Editor
SELECT * FROM pg_tables WHERE tablename = 'question_bank';

-- Verify schema
\d question_bank;
```

### Step 5: Seed Initial Questions
```sql
-- Insert sample questions for testing
INSERT INTO question_bank (company, question_text, question_type, is_active) VALUES
  ('Google', 'How would you improve Google Maps for blind users?', 'product_sense', true),
  ('Meta', 'Design a new feature for Instagram Stories.', 'product_sense', true),
  (NULL, 'Tell me about a time you dealt with ambiguity.', 'behavioral', true),
  (NULL, 'Describe a situation where you had to influence without authority.', 'behavioral', true),
  ('Amazon', 'How would you prioritize features for Amazon Prime?', 'execution', true),
  ('Netflix', 'What metrics would you use to measure success for Netflix recommendations?', 'execution', true),
  (NULL, 'How would you enter a new market with a mature product?', 'strategy', true),
  (NULL, 'What would you do if your product had 50% churn after 3 months?', 'strategy', true);
```

### Step 6: Test Endpoints
```bash
# Test random endpoint
curl http://localhost:3000/api/questions/random

# Should return 200 with question data

# Test with type filter
curl http://localhost:3000/api/questions/random?type=product_sense

# Test list endpoint
curl http://localhost:3000/api/questions?limit=10

# Should return 200 with questions array
```

### Step 7: Verify Count by Type
```bash
# Check that each type has questions
curl http://localhost:3000/api/questions?type=behavioral&activeOnly=true
curl http://localhost:3000/api/questions?type=product_sense&activeOnly=true
curl http://localhost:3000/api/questions?type=execution&activeOnly=true
curl http://localhost:3000/api/questions?type=strategy&activeOnly=true
```

### Step 8: Integration with Interview Agent
Once endpoints are working, update the interview agent to fetch questions:

```python
# In /agent/agent.py or demo_agent.py
import httpx
import os

async def get_random_question(question_type: str) -> dict:
    """Fetch random question from API"""
    api_base = os.getenv("NEXT_PUBLIC_API_URL", "http://localhost:3000")
    url = f"{api_base}/api/questions/random?type={question_type}"

    async with httpx.AsyncClient() as client:
        response = await client.get(url)
        if response.status_code == 200:
            return response.json()
        else:
            raise Exception(f"Failed to fetch question: {response.status_code}")

# Use in agent entrypoint
async def entrypoint(ctx: JobContext):
    # Fetch question based on session config
    question_type = ctx.room.metadata.get("interview_type", "product_sense")
    question_data = await get_random_question(question_type)

    instructions = f"""
    You are an experienced product manager interviewer.

    Ask this question: {question_data['questionText']}
    Company context: {question_data['company'] or 'Generic'}

    Follow the standard PM interview framework...
    """

    # Continue with agent session setup...
```

## Monitoring & Metrics

After deployment, monitor:
1. API response times (should be <100ms)
2. 404 error rate (indicates insufficient questions for a type)
3. Random distribution (ensure questions are evenly distributed)
4. Question usage frequency (to identify overused questions)

## Rollback Plan

If issues arise after deployment:

```bash
# Option 1: Disable endpoints (rename route files)
mv app/api/questions/random/route.ts app/api/questions/random/route.ts.disabled
mv app/api/questions/route.ts app/api/questions/route.ts.disabled

# Option 2: Mark all questions as inactive
# SQL in Supabase
UPDATE question_bank SET is_active = false;

# Option 3: Drop table (nuclear option)
DROP TABLE question_bank;
```

## Next Steps After Deployment

1. **Admin UI**: Create admin panel for managing questions
   - Create question form
   - Edit question interface
   - Bulk import CSV/JSON
   - Deactivate/activate toggle

2. **Seeding Pipeline**: Create script to bulk-import questions
   ```typescript
   // /scripts/seed-questions.ts
   import { db } from '@/lib/db';
   import { questionBank } from '@/lib/db/schema';
   import questionsData from './questions.json';

   async function seedQuestions() {
     await db.insert(questionBank).values(questionsData);
   }
   ```

3. **Analytics**: Track question performance
   - How often each question is used
   - Average user ratings
   - Success rate (completion vs. abandon)

4. **Smart Selection**: Enhance random selection
   - Avoid recent questions for same user
   - Weight by difficulty/user level
   - Adaptive selection based on performance

## Files Created

| File | Purpose | Status |
|------|---------|--------|
| `/lib/db/questions.ts` | Database query helpers | ✅ Ready |
| `/app/api/questions/random/route.ts` | Random question endpoint | ✅ Ready |
| `/app/api/questions/route.ts` | List questions endpoint | ✅ Ready |
| `/app/api/questions/README.md` | API documentation | ✅ Ready |
| `/app/api/questions/DEPLOYMENT.md` | This file | ✅ Ready |

## Build Status

**Current**: ❌ Build fails (expected)
```
Error: Export questionBank doesn't exist in target module
```

**Expected After Schema Deployment**: ✅ Build succeeds

## Contact

For questions about this deployment, refer to:
- Technical design: `CLAUDE.md` (Architecture Decisions)
- Product requirements: `PRD.md` (Question Bank Feature)
- API patterns: `/lib/db/sessions.ts` (Reference implementation)

---

**Last Updated**: 2025-11-07
**Status**: Awaiting database schema deployment
**Blocked By**: database-optimizer agent
