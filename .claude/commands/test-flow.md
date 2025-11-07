---
description: Test the complete user flow end-to-end
---

# Test Complete Flow

Test the entire Meelni interview flow from signup to feedback.

## Instructions

Test the complete user journey:

### 1. Authentication Flow
- Visit http://localhost:3000
- Click "Start A Mock"
- Redirects to /auth/signin if not logged in
- Google OAuth sign-in
- Redirects to /dashboard

### 2. Dashboard
- Verify personalized welcome with user's name
- Check session history (if any)
- Click "Start Mock Interview" → goes to /setup

### 3. Setup Flow
**Step 1: Interview Type**
- 4 options: Product Sense, Execution, Behavioral, Strategy
- Select one

**Step 2: Difficulty**
- 3 options: Beginner, Intermediate, Advanced
- Select one

**Step 3: Question Pool** (NEW)
- 3 options: Current Trends, Broader Practice, All Questions
- Verify question counts show
- Verify info tooltip works
- Select one

**Step 4: Voice Settings**
- Verify voice options load
- Keep defaults or customize
- Click "Start Mock Interview"

### 4. Interview Session
- Verify room connects to LiveKit
- Verify agent joins (cold start ~2-3 seconds)
- Verify agent asks question from question bank
- Test voice conversation:
  - Speak a response
  - Verify transcript appears in UI
  - Verify agent responds
- Test interruption (barge-in)
- End interview

### 5. Post-Interview
- Verify transcript saved to database
- Check if evaluation triggered
- Verify session appears in dashboard

### Commands to Check

**Check transcripts saved:**
```bash
npx tsx -e "
import { db } from './lib/db';
import { transcriptTurn } from './lib/db/schema';
import { desc } from 'drizzle-orm';

const turns = await db.select()
  .from(transcriptTurn)
  .orderBy(desc(transcriptTurn.createdAt))
  .limit(10);

console.log(\`Found \${turns.length} recent transcript turns\`);
turns.forEach(t => console.log(\`[\${t.speaker}] \${t.text?.substring(0, 50)}...\`));
"
```

**Check evaluation:**
```bash
curl -X POST http://localhost:3000/api/eval/SESSION_ID \
  -H "Authorization: Bearer TOKEN"
```

### Report

After testing, report:
- ✅ What works
- ❌ What's broken
- 🐛 Any errors in console
- 💡 Suggestions

## Example:

**User:** "test flow"

**Assistant:**
1. Guides through each step
2. Checks database for transcripts
3. Reports findings
4. Suggests fixes if issues found
