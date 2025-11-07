---
description: Check database status and recent data
---

# Database Check

Quick database health check and view recent data.

## Instructions

Check database tables, counts, and recent entries.

### Commands

**1. Check table counts:**
```bash
npx tsx -e "
import { db } from './lib/db';
import { appUser, interviewSession, transcriptTurn, feedback, interviewQuestion } from './lib/db/schema';
import { sql } from 'drizzle-orm';

const users = await db.select({ count: sql<number>\`count(*)\` }).from(appUser);
const sessions = await db.select({ count: sql<number>\`count(*)\` }).from(interviewSession);
const turns = await db.select({ count: sql<number>\`count(*)\` }).from(transcriptTurn);
const feedbacks = await db.select({ count: sql<number>\`count(*)\` }).from(feedback);
const questions = await db.select({ count: sql<number>\`count(*)\` }).from(interviewQuestion);

console.log('📊 Database Counts:');
console.log(\`  Users:      \${users[0].count}\`);
console.log(\`  Sessions:   \${sessions[0].count}\`);
console.log(\`  Turns:      \${turns[0].count}\`);
console.log(\`  Feedbacks:  \${feedbacks[0].count}\`);
console.log(\`  Questions:  \${questions[0].count}\`);
"
```

**2. Check recent sessions:**
```bash
npx tsx -e "
import { db } from './lib/db';
import { interviewSession } from './lib/db/schema';
import { desc } from 'drizzle-orm';

const sessions = await db.select()
  .from(interviewSession)
  .orderBy(desc(interviewSession.startedAt))
  .limit(5);

console.log('🕒 Recent Sessions:');
sessions.forEach(s => {
  console.log(\`  [\${s.id.substring(0,8)}...] \${s.roundType} - \${s.mode}\`);
});
"
```

**3. Check RLS policies:**
```bash
npx tsx -e "
import { db } from './lib/db';
import { sql } from 'drizzle-orm';

const policies = await db.execute(sql\`
  SELECT schemaname, tablename, policyname, permissive, roles, cmd
  FROM pg_policies
  WHERE schemaname = 'public'
  ORDER BY tablename, policyname;
\`);

console.log('🔒 RLS Policies:');
policies.rows.forEach(p => {
  console.log(\`  \${p.tablename}.\${p.policyname} - \${p.cmd}\`);
});
"
```

**4. Check question bank stats:**
```bash
npm run test:questions-stats
```

### Report Format

After running checks, provide:
- Table counts
- Recent activity
- RLS status
- Any anomalies

## Example:

**User:** "check db"

**Assistant:**
```
📊 Database Status:
  Users: 5
  Sessions: 18
  Transcripts: 749 turns
  Feedbacks: 12
  Questions: 2,879

🔒 RLS: 12 policies active
✅ All systems operational
```
