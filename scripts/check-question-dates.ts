// Load environment variables from .env.local
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { db } from '../lib/db';
import { interviewQuestion } from '../lib/db/schema';
import { eq, sql, desc } from 'drizzle-orm';

async function main() {
  console.log('\n📅 Question Date Statistics\n');

  // Get most recent questions by askedAt
  const recentQuestions = await db.select({
    company: interviewQuestion.company,
    questionText: interviewQuestion.questionText,
    askedAt: interviewQuestion.askedAt,
    createdAt: interviewQuestion.createdAt,
  })
  .from(interviewQuestion)
  .where(eq(interviewQuestion.isActive, true))
  .orderBy(desc(interviewQuestion.askedAt))
  .limit(10);

  console.log('10 Most Recent Questions (by askedAt):');
  recentQuestions.forEach(({ company, questionText, askedAt }) => {
    const preview = questionText.length > 50 ? questionText.substring(0, 50) + '...' : questionText;
    console.log(`  ${askedAt ? new Date(askedAt).toLocaleDateString() : 'NO DATE'} - ${company}: ${preview}`);
  });

  // Get oldest questions by askedAt
  const oldestQuestions = await db.select({
    company: interviewQuestion.company,
    questionText: interviewQuestion.questionText,
    askedAt: interviewQuestion.askedAt,
  })
  .from(interviewQuestion)
  .where(eq(interviewQuestion.isActive, true))
  .orderBy(interviewQuestion.askedAt)
  .limit(10);

  console.log('\n10 Oldest Questions (by askedAt):');
  oldestQuestions.forEach(({ company, questionText, askedAt }) => {
    const preview = questionText.length > 50 ? questionText.substring(0, 50) + '...' : questionText;
    console.log(`  ${askedAt ? new Date(askedAt).toLocaleDateString() : 'NO DATE'} - ${company}: ${preview}`);
  });

  // Count questions with NO askedAt date
  const noDateCount = await db.select({
    count: sql<number>`count(*)`,
  })
  .from(interviewQuestion)
  .where(sql`${interviewQuestion.askedAt} IS NULL AND ${interviewQuestion.isActive} = true`);

  console.log(`\nQuestions with NO askedAt date: ${noDateCount[0].count}`);

  // Get date range
  const dateRange = await db.select({
    minDate: sql<Date>`MIN(${interviewQuestion.askedAt})`,
    maxDate: sql<Date>`MAX(${interviewQuestion.askedAt})`,
  })
  .from(interviewQuestion)
  .where(eq(interviewQuestion.isActive, true));

  console.log(`\nDate Range:`);
  console.log(`  Earliest: ${dateRange[0].minDate ? new Date(dateRange[0].minDate).toLocaleDateString() : 'N/A'}`);
  console.log(`  Latest: ${dateRange[0].maxDate ? new Date(dateRange[0].maxDate).toLocaleDateString() : 'N/A'}`);

  process.exit(0);
}

main().catch(console.error);
